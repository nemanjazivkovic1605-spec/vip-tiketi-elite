import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { migrateAnalytics, type AnalyticsDatabase } from '../server/footballAnalytics/database.js';
import { deploymentDigest, deploymentRowHash, postgresDeploymentHash, productionSourceScope, sqlIdentifier } from '../server/footballAnalytics/deploymentIntegrity.js';

type TablePlan = { name: string; columns: string[]; primary: string[]; count: number; excludedTestRows: number; digest: ReturnType<ReturnType<typeof deploymentDigest>['value']> };
type TransferPlan = { fingerprint: string; generatedAt: string; source: string; tables: TablePlan[]; rows: number; excludedTestRows: number; targetInitiallyEmpty: boolean; maxRemoteBytes: number; firestoreReads: 0; firestoreWrites: 0 };
const args = process.argv.slice(2), option = (name: string) => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const command = args.find(value => !value.startsWith('--')) || 'dry-run';
const directory = path.resolve('.local-backups'), planFile = path.join(directory, 'production-analytics-transfer-plan.json');
const sourceFile = path.resolve(option('database') || '.local-data/football-analytics.sqlite');
const batchSize = 400, maxRemoteBytes = 930_000_000;
const canonical = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safeError = (error: any) => String(error?.message || 'Analytics deployment transfer failed.').replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted database URL]');
let client: pg.Client | undefined, source: DatabaseSync | undefined;

async function connect() {
  const value = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.ANALYTICS_DATABASE_URL || process.env.DATABASE_URL;
  if (!value) throw new Error('Vercel did not provide the analytics database URL.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech')) throw new Error('Unexpected production database provider.');
  url.searchParams.set('sslmode', 'verify-full');
  const connection = new pg.Client({ connectionString: url.toString(), application_name: 'elite-analytics-transfer', connectionTimeoutMillis: 20000, statement_timeout: 120000 });
  await connection.connect();
  if (!(connection as any).connection.stream.encrypted || !(connection as any).connection.stream.authorized) throw new Error('Verified TLS is required.');
  return connection;
}
function sourcePlan(db: DatabaseSync) {
  const tables: TablePlan[] = [];
  for (const row of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'fa_%' ORDER BY name").all()) {
    const name = String(row.name); sqlIdentifier(name);
    const info = db.prepare(`PRAGMA table_info(${name})`).all();
    const columns = info.map(column => String(column.name)); columns.forEach(sqlIdentifier);
    const primary = info.filter(column => column.pk).sort((a, b) => Number(a.pk) - Number(b.pk)).map(column => String(column.name));
    if (!primary.length) throw new Error(`A primary key is required: ${name}`);
    const digest = deploymentDigest();
    for (const value of db.prepare(`SELECT ${columns.map(sqlIdentifier).join(',')} FROM ${name} ${productionSourceScope(columns)}`).iterate())
      digest.add(deploymentRowHash(columns.map(column => value[column])));
    const total = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get()!.count);
    tables.push({ name, columns, primary, count: digest.value().count, excludedTestRows: total - digest.value().count, digest: digest.value() });
    console.log(JSON.stringify({ phase: 'source-plan', table: name, rows: digest.value().count, excludedTestRows: total - digest.value().count }));
  }
  return tables;
}
async function verifyTable(connection: pg.Client, table: TablePlan) {
  const digest = deploymentDigest();
  const result = await connection.query(`SELECT ${postgresDeploymentHash(table.columns)} AS digest FROM ${sqlIdentifier(table.name)}`);
  for (const row of result.rows) digest.add(row.digest);
  if (JSON.stringify(digest.value()) !== JSON.stringify(table.digest)) throw new Error(`Transferred table does not match its source: ${table.name}`);
  return digest.value();
}
async function size(connection: pg.Client) {
  return Number((await connection.query('SELECT pg_database_size(current_database()) AS bytes')).rows[0].bytes);
}
async function transfer(connection: pg.Client, db: DatabaseSync, plan: TransferPlan) {
  if (!args.includes('--allow-large') || option('confirm') !== plan.fingerprint) throw new Error('An explicit --allow-large and approved --confirm fingerprint are required.');
  if (!(await connection.query("SELECT pg_try_advisory_lock(hashtext('elite-analytics-deployment-transfer')) AS locked")).rows[0].locked)
    throw new Error('Another transfer is already running.');
  const hasRun = (await connection.query("SELECT to_regclass('public.fa_transfer_runs') AS table_name")).rows[0].table_name;
  let run = hasRun ? (await connection.query('SELECT payload FROM fa_transfer_runs WHERE id=$1', [plan.fingerprint])).rows[0]?.payload : undefined;
  if (run) run = JSON.parse(run);
  if (run && run.status !== 'complete' && !args.includes('--resume')) throw new Error('Interrupted transfer: use --resume with the original plan.');
  if (!run) {
    const existing = (await connection.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
    if (existing.length) throw new Error('The target is not an empty newly approved database. No existing data will be overwritten.');
    await connection.query('CREATE TABLE fa_transfer_runs (id TEXT PRIMARY KEY,payload TEXT NOT NULL)');
    run = { id: plan.fingerprint, status: 'running', startedAt: new Date().toISOString(), initialized: false, tables: {}, inserted: 0 };
    await connection.query('INSERT INTO fa_transfer_runs(id,payload) VALUES($1,$2)', [plan.fingerprint, JSON.stringify(run)]);
  }
  const persist = () => connection.query('UPDATE fa_transfer_runs SET payload=$1 WHERE id=$2', [JSON.stringify(run), plan.fingerprint]);
  if (!run.initialized) {
    const wrap: AnalyticsDatabase = { kind: 'postgres', query: async (sql, values = []) => (await connection.query(sql, values)).rows,
      transaction: async callback => { await connection.query('BEGIN'); try { const value = await callback(wrap); await connection.query('COMMIT'); return value; } catch (error) { await connection.query('ROLLBACK'); throw error; } }, close: async () => {} };
    await migrateAnalytics(wrap);
    await connection.query("SET default_toast_compression='lz4'");
    for (const table of plan.tables) if (table.columns.includes('payload'))
      await connection.query(`ALTER TABLE ${sqlIdentifier(table.name)} ALTER COLUMN payload SET COMPRESSION ${table.name === 'fa_versions' ? 'pglz' : 'lz4'}`);
    run.initialized = true; await persist();
  }
  if (run.status === 'complete') {
    for (const table of plan.tables) await verifyTable(connection, table);
    return { ...run, alreadyComplete: true, verified: true, remoteBytes: await size(connection), firestoreWrites: 0 };
  }
  try {
    for (const table of plan.tables) {
      let processed = 0, batch: unknown[][] = [], phase = run.tables[table.name] || { processed: 0, inserted: 0, complete: false };
      if (phase.complete) { await verifyTable(connection, table); continue; }
      const flush = async () => {
        if (!batch.length) return;
        const bytes = await size(connection), inputBytes = Buffer.byteLength(JSON.stringify(batch));
        if (bytes + inputBytes * 8 > maxRemoteBytes) throw new Error('The conservative free-plan storage budget would be exceeded. Transfer paused; no paid plan activated.');
        const values = batch.flat(), parameters = batch.map((row, index) => `(${row.map((_, column) => `$${index * table.columns.length + column + 1}`).join(',')})`).join(',');
        await connection.query('BEGIN');
        try {
          const result = await connection.query(`INSERT INTO ${sqlIdentifier(table.name)} (${table.columns.map(sqlIdentifier).join(',')}) VALUES ${parameters} ON CONFLICT (${table.primary.map(sqlIdentifier).join(',')}) DO NOTHING`, values);
          const nextPhase = { ...phase, processed, inserted: phase.inserted + (result.rowCount || 0) };
          const nextRun = { ...run, tables: { ...run.tables, [table.name]: nextPhase }, inserted: run.inserted + (result.rowCount || 0), status: 'running' };
          await connection.query('UPDATE fa_transfer_runs SET payload=$1 WHERE id=$2', [JSON.stringify(nextRun), plan.fingerprint]);
          await connection.query('COMMIT');
          phase = nextPhase; run = nextRun;
        } catch (error) { await connection.query('ROLLBACK').catch(() => {}); throw error; }
        batch = [];
        if (processed % 10000 === 0) console.log(JSON.stringify({ phase: 'transfer', table: table.name, processed, total: table.count, remoteBytes: bytes }));
      };
      const digest = deploymentDigest();
      for (const row of db.prepare(`SELECT ${table.columns.map(sqlIdentifier).join(',')} FROM ${sqlIdentifier(table.name)} ${productionSourceScope(table.columns)} ORDER BY rowid`).iterate()) {
        processed++;
        const values = table.columns.map(column => row[column]); digest.add(deploymentRowHash(values));
        if (processed <= phase.processed) continue;
        batch.push(values); if (batch.length >= batchSize) await flush();
      }
      await flush();
      if (JSON.stringify(digest.value()) !== JSON.stringify(table.digest)) throw new Error(`Local source changed after approval: ${table.name}`);
      await verifyTable(connection, table);
      phase.complete = true; run.tables[table.name] = phase; await persist();
      console.log(JSON.stringify({ phase: 'table-verified', table: table.name, rows: table.count, remoteBytes: await size(connection) }));
    }
    delete run.error;
    run.status = 'complete'; run.completedAt = new Date().toISOString(); run.remoteBytes = await size(connection); await persist();
    return { ...run, verified: true, firestoreWrites: 0, paidPlanActivated: false };
  } catch (error) {
    // A disconnected COMMIT may have succeeded. Reload its atomic checkpoint instead of guessing.
    try { const current = (await connection.query('SELECT payload FROM fa_transfer_runs WHERE id=$1', [plan.fingerprint])).rows[0]; if (current) run = JSON.parse(current.payload); } catch {}
    run.status = 'failed'; run.error = safeError(error); await persist().catch(() => {}); throw error;
  }
  finally { await connection.query("SELECT pg_advisory_unlock(hashtext('elite-analytics-deployment-transfer'))").catch(() => {}); }
}

try {
  if (!['dry-run', 'write', 'verify'].includes(command)) throw new Error('Use dry-run, write or verify.');
  mkdirSync(directory, { recursive: true });
  source = new DatabaseSync(sourceFile, { readOnly: true }); source.exec('PRAGMA cache_size=-32768; BEGIN');
  client = await connect();
  if (command === 'dry-run') {
    const tables = sourcePlan(source), target = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    const plan: TransferPlan = { generatedAt: new Date().toISOString(), source: sourceFile, tables,
      rows: tables.reduce((total, table) => total + table.count, 0), excludedTestRows: tables.reduce((total, table) => total + table.excludedTestRows, 0),
      fingerprint: canonical(tables), targetInitiallyEmpty: target.rows.length === 0, maxRemoteBytes, firestoreReads: 0, firestoreWrites: 0 };
    writeFileSync(planFile, JSON.stringify(plan, null, 2));
    console.log(JSON.stringify({ ...plan, tables: tables.map(({ digest, ...table }) => table), remoteBytes: await size(client), sqlWrites: 0 }, null, 2));
  } else {
    const plan = JSON.parse(readFileSync(planFile, 'utf8')) as TransferPlan;
    if (sourceFile !== plan.source || canonical(plan.tables) !== plan.fingerprint) throw new Error('Unexpected source or modified transfer plan.');
    let result: unknown;
    if (command === 'write') result = await transfer(client, source, plan);
    else {
      const tables = [];
      for (const table of plan.tables) tables.push({ name: table.name, ...(await verifyTable(client, table)) });
      result = { verified: true, tables, remoteBytes: await size(client), firestoreWrites: 0 };
    }
    writeFileSync(path.join(directory, 'production-analytics-transfer-receipt.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error: any) { console.error(JSON.stringify({ error: safeError(error), code: error?.code || 'transfer_failed', secretsPrinted: false })); process.exitCode = 1; }
finally { source?.close(); await client?.end(); }
