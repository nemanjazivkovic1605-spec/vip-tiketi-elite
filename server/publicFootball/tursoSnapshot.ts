import { tursoConnectionConfig, tursoSnapshotWriteConfig } from '../runtimeEnvironment.js';
import { parsePublicSnapshotPayload, PUBLIC_SNAPSHOT_ID, publicSnapshotVersion } from './store.js';
import type { PublicSnapshot } from '../../src/types/publicFootball.js';
import { gzipSync, gunzipSync } from 'node:zlib';

type TursoConfig = ReturnType<typeof tursoConnectionConfig> & {
  configured: true;
  url: string;
  authToken: string;
};
const MAX_SNAPSHOT_BYTES = 16_000_000;
const COMPRESSED_SNAPSHOT_FORMAT = 'gzip-base64-v1';

export function encodeTursoSnapshot(snapshot: PublicSnapshot) {
  const raw = Buffer.from(JSON.stringify(snapshot));
  if (snapshot.matches.length > 20000 || raw.byteLength > MAX_SNAPSHOT_BYTES)
    throw new Error('Javni pregled prelazi bezbedni limit za Turso snapshot.');
  const compressed = gzipSync(raw, { level: 9 });
  const payload = JSON.stringify({ encoding:COMPRESSED_SNAPSHOT_FORMAT, matchCount:snapshot.matches.length, uncompressedBytes:raw.byteLength, data:compressed.toString('base64') });
  return { payload, payloadBytes:Buffer.byteLength(payload), uncompressedPayloadBytes:raw.byteLength };
}

export function decodeTursoSnapshotPayload(value: unknown): PublicSnapshot {
  const payload = typeof value === 'string' ? value : '';
  if (!payload || Buffer.byteLength(payload) > MAX_SNAPSHOT_BYTES) throw new Error('Turso snapshot ima neispravnu veličinu.');
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { throw new Error('Turso snapshot nije validan JSON.'); }
  if (parsed && typeof parsed === 'object' && (parsed as any).encoding === COMPRESSED_SNAPSHOT_FORMAT) {
    const envelope = parsed as { matchCount?:unknown; uncompressedBytes?:unknown; data?:unknown };
    if (!Number.isInteger(envelope.matchCount) || Number(envelope.matchCount) < 0 || Number(envelope.matchCount) > 20000
      || !Number.isInteger(envelope.uncompressedBytes) || Number(envelope.uncompressedBytes) < 2 || Number(envelope.uncompressedBytes) > MAX_SNAPSHOT_BYTES
      || typeof envelope.data !== 'string' || envelope.data.length > MAX_SNAPSHOT_BYTES * 2)
      throw new Error('Turso kompresovani snapshot ima neispravne metapodatke.');
    let raw: Buffer;
    try { raw = gunzipSync(Buffer.from(envelope.data, 'base64'), { maxOutputLength:MAX_SNAPSHOT_BYTES }); }
    catch { throw new Error('Turso snapshot ne može bezbedno da se raspakuje.'); }
    if (raw.byteLength !== envelope.uncompressedBytes) throw new Error('Veličina raspakovanog Turso snapshot-a se ne poklapa.');
    const snapshot = parsePublicSnapshotPayload(raw.toString('utf8'));
    if (snapshot.matches.length !== envelope.matchCount) throw new Error('Broj utakmica u Turso snapshot-u se ne poklapa.');
    return snapshot;
  }
  return parsePublicSnapshotPayload(parsed);
}

let clientPromise: Promise<import('@libsql/client').Client> | undefined;
let clientKey: string | undefined;

function requireTursoConfig(config = tursoConnectionConfig()): TursoConfig {
  if (!config.configured || !config.url || !config.authToken)
    throw new Error(config.message || 'Turso nije konfigurisan za ovo okruženje.');
  return config as TursoConfig;
}

async function getClient(config: TursoConfig) {
  const key = `${config.url}\n${config.authToken}`;
  if (!clientPromise || clientKey !== key) {
    clientKey = key;
    clientPromise = import('@libsql/client').then(({ createClient }) =>
      createClient({ url: config.url, authToken: config.authToken,
        fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
          ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
        }),
      }),
    );
  }
  return clientPromise;
}

export async function tursoPublicSnapshotExists(config = tursoConnectionConfig()) {
  const client = await getClient(requireTursoConfig(config));
  const result = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: ['fa_public_snapshots'],
  });
  return result.rows.length > 0;
}

export async function probeTursoConnection(config = tursoConnectionConfig()) {
  const client = await getClient(requireTursoConfig(config));
  const probe = await client.execute('SELECT 1 AS ok');
  if (Number(probe.rows[0]?.ok) !== 1) throw new Error('Turso health query returned an unexpected result.');
  const schema = await client.execute("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const table = schema.rows.find((row) => row.name === 'fa_public_snapshots');
  if (!table) return { configured: true, reachable: true, schemaReady: false, snapshotReady: false, tables: schema.rows.map((row) => String(row.name)), tableCount: schema.rows.length };
  const columns = await client.execute('PRAGMA table_info(fa_public_snapshots)');
  const indexes = await client.execute('PRAGMA index_list(fa_public_snapshots)');
  const requiredColumns = ['id', 'version', 'updated_at', 'payload'];
  const columnNames = columns.rows.map((row) => String(row.name));
  const schemaReady = requiredColumns.every((column) => columnNames.includes(column));
  if (!schemaReady) return { configured: true, reachable: true, schemaReady: false, snapshotReady: false, tables: schema.rows.map((row) => String(row.name)), tableCount: schema.rows.length, columns: columnNames, indexCount: indexes.rows.length };
  const snapshot = await client.execute({
    sql: "SELECT version, updated_at, length(payload) AS payload_bytes, COALESCE(json_array_length(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END, '$.matches'), CAST(json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END, '$.matchCount') AS INTEGER)) AS match_count FROM fa_public_snapshots WHERE id = ?",
    args: [PUBLIC_SNAPSHOT_ID],
  });
  const row = snapshot.rows[0];
  return {
    configured: true,
    reachable: true,
    schemaReady: true,
    snapshotReady: Boolean(row),
    tables: schema.rows.map((entry) => String(entry.name)),
    tableCount: schema.rows.length,
    columns: columnNames,
    indexCount: indexes.rows.length,
    snapshotRows: snapshot.rows.length,
    ...(row ? { version: String(row.version), updatedAt: String(row.updated_at), payloadBytes: Number(row.payload_bytes), matchCount: Number(row.match_count) } : {}),
  };
}

export async function runTursoIsolatedSelfTest(config = tursoConnectionConfig(), clientOverride?: Pick<import('@libsql/client').Client, 'batch'>) {
  const resolvedConfig = requireTursoConfig(config);
  const client = clientOverride ?? await getClient(resolvedConfig);
  const table = `__elite_turso_check_${Math.random().toString(36).slice(2, 12)}`;
  // Remote libSQL requests may use different connections, so keep the temporary
  // table lifecycle in one batch transaction instead of separate HTTP calls.
  const results = await client.batch([
    `CREATE TEMP TABLE ${table} (id TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    { sql: `INSERT INTO ${table}(id, value) VALUES(?, ?)`, args: ['probe', 'read-write-ok'] },
    { sql: `SELECT value FROM ${table} WHERE id = ?`, args: ['probe'] },
    `DROP TABLE IF EXISTS ${table}`,
  ], 'write');
  return { writeReadVerified: results[2]?.rows[0]?.value === 'read-write-ok', persistentDataChanged: false };
}

export async function readTursoPublicSnapshotIfPresent(config = tursoConnectionConfig()): Promise<PublicSnapshot | null> {
  return (await readTursoPublicSnapshotRecord(config))?.snapshot || null;
}

export type TursoPublicSnapshotRecord = { snapshot: PublicSnapshot; version: string; updatedAt: string };
export type TursoSnapshotRevision = { version: string | null; updatedAt: string | null };

export async function readTursoPublicSnapshotRecord(config = tursoConnectionConfig()): Promise<TursoPublicSnapshotRecord | null> {
  const client = await getClient(requireTursoConfig(config));
  const result = await client.execute({
    sql: 'SELECT version, updated_at, payload FROM fa_public_snapshots WHERE id = ?',
    args: [PUBLIC_SNAPSHOT_ID],
  });
  const row = result.rows[0];
  if (!row || typeof row.payload !== 'string') return null;
  return { snapshot: decodeTursoSnapshotPayload(row.payload), version: String(row.version), updatedAt: String(row.updated_at) };
}

export async function readTursoPublicSnapshot(config = tursoConnectionConfig()): Promise<PublicSnapshot> {
  const snapshot = await readTursoPublicSnapshotIfPresent(config);
  if (!snapshot) throw new Error('Turso nema pripremljen javni pregled.');
  return snapshot;
}

export async function createTursoPublicSnapshotSchema(config = tursoConnectionConfig()) {
  const client = await getClient(requireTursoConfig(config));
  await client.execute(`CREATE TABLE IF NOT EXISTS fa_public_snapshots (
    id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`);
}

export async function writeTursoPublicSnapshot(snapshot: PublicSnapshot, config = tursoConnectionConfig()) {
  const client = await getClient(requireTursoConfig(config));
  const encoded = encodeTursoSnapshot(snapshot);
  const version = publicSnapshotVersion(snapshot);
  await client.execute({
    sql: `INSERT INTO fa_public_snapshots(id, version, updated_at, payload)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at, payload = excluded.payload`,
    args: [PUBLIC_SNAPSHOT_ID, version, new Date().toISOString(), encoded.payload],
  });
  const checked = await readTursoPublicSnapshot(config);
  if (publicSnapshotVersion(checked) !== version || checked.matches.length !== snapshot.matches.length)
    throw new Error('Provera Turso snapshot-a nije uspela; objavljeni prikaz nije potvrđen.');
  return { version, matchCount: checked.matches.length, payloadBytes: encoded.payloadBytes,
    uncompressedPayloadBytes:encoded.uncompressedPayloadBytes,compressionRatio:Number((encoded.uncompressedPayloadBytes/Math.max(1,encoded.payloadBytes)).toFixed(2)) };
}

export async function writeTursoPublicSnapshotIfUnchanged(
  snapshot: PublicSnapshot,
  expected: TursoSnapshotRevision,
  writeConfig = tursoSnapshotWriteConfig(),
  readConfig = tursoConnectionConfig(),
) {
  if (!readConfig.configured || !readConfig.url)
    throw new Error(readConfig.message || 'Turso javno čitanje nije konfigurisano.');
  const writer = requireTursoConfig(writeConfig);
  if (writer.url !== readConfig.url)
    throw new Error('Turso write profil ne cilja javni read snapshot bazu.');

  const encoded = encodeTursoSnapshot(snapshot);
  const version = publicSnapshotVersion(snapshot);
  const client = await getClient(writer);
  const transaction = await client.transaction('write');
  try {
    const current = await transaction.execute({
      sql: 'SELECT version, updated_at FROM fa_public_snapshots WHERE id = ?',
      args: [PUBLIC_SNAPSHOT_ID],
    });
    const row = current.rows[0];
    const currentVersion = row ? String(row.version) : null;
    const currentUpdatedAt = row ? String(row.updated_at) : null;
    if (currentVersion !== expected.version || currentUpdatedAt !== expected.updatedAt)
      throw new Error('Turso snapshot je promenjen nakon čitanja; ponovite collector sinhronizaciju.');
    await transaction.execute({
      sql: `INSERT INTO fa_public_snapshots(id, version, updated_at, payload)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at, payload = excluded.payload`,
      args: [PUBLIC_SNAPSHOT_ID, version, new Date().toISOString(), encoded.payload],
    });
    await transaction.commit();
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Preserve the original transaction error. */ }
    throw error;
  }

  const checked = await readTursoPublicSnapshotRecord(readConfig);
  if (!checked || publicSnapshotVersion(checked.snapshot) !== version || checked.snapshot.matches.length !== snapshot.matches.length
    || checked.snapshot.collectorSync?.date !== snapshot.collectorSync?.date)
    throw new Error('Turso collector snapshot nije potvrđen nakon upisa.');
  return { version, matchCount: checked.snapshot.matches.length, payloadBytes: encoded.payloadBytes,
    uncompressedPayloadBytes: encoded.uncompressedPayloadBytes,
    compressionRatio: Number((encoded.uncompressedPayloadBytes / Math.max(1, encoded.payloadBytes)).toFixed(2)) };
}
