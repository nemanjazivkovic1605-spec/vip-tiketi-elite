import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { Tip } from '../../src/types.js';
import { mapTicketForPublic } from '../../src/services/tickets/ticketMappers.js';
import { buildStatsMonth, buildStatsSummary, statsEntry, STATS_SCHEMA, STATS_SUMMARY_PATH, STATS_MONTHS_COLLECTION,
  type PublicStatsSummary, type StatsMonth } from '../../src/utils/publicStats.js';
import { digest, type ParsedTipFile } from './csv.js';
import type { HistoricalImportPlan } from './planner.js';

export const IMPORT_BATCH_SIZE = 100;
export const ticketPaths = (id: string) => ['tickets/', 'publicTickets/', 'publicStatsTickets/'].map(prefix => prefix + id);
export const nextMonth = (month: string) => { const [year, number] = month.split('-').map(Number); return number === 12 ? `${year + 1}-01-01` : `${year}-${String(number + 1).padStart(2, '0')}-01`; };
export const importBatches = (plan: HistoricalImportPlan) => Array.from({ length: Math.ceil(plan.tickets.length / IMPORT_BATCH_SIZE) }, (_, index) => plan.tickets.slice(index * IMPORT_BATCH_SIZE, (index + 1) * IMPORT_BATCH_SIZE));
export const plannedImportWrites = (plan: HistoricalImportPlan) => importBatches(plan).reduce((sum, batch) =>
  sum + batch.length * 3 + new Set(batch.map(tip => tip.date.slice(0, 7))).size + 2, 0);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export async function readImportWindow(db: Firestore, months: string[], transaction?: Transaction): Promise<Tip[]> {
  const result: Tip[] = [];
  for (const month of months) {
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let query = db.collection('tickets').where('date', '>=', month + '-01').where('date', '<', nextMonth(month)).orderBy('date').limit(200);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = transaction ? await transaction.get(query) : await query.get();
      result.push(...snapshot.docs.map(document => ({ ...document.data(), id: document.id } as Tip)));
      if (snapshot.size < 200) break;
      cursor = snapshot.docs.at(-1);
    }
  }
  return result;
}

export async function inspectHistoricalImport(db: Firestore, file: ParsedTipFile) {
  const ids = file.rows.map(row => 'csv-tip-' + row.identity);
  const months = [...new Set(file.rows.map(row => row.date.slice(0, 7)))];
  const existing = await readImportWindow(db, months);
  const known = new Map(existing.map(tip => [tip.id, tip]));
  const occupiedPublicIds = new Set<string>(), previouslyImportedIds = new Set<string>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const selected = ids.slice(offset, offset + 100);
    const documents = await db.getAll(...selected.flatMap(id => ticketPaths(id).map(value => db.doc(value))));
    for (const document of documents) {
      if (!document.exists) continue;
      if (document.ref.parent.id === 'tickets') known.set(document.id, { ...document.data(), id: document.id } as Tip);
      else occupiedPublicIds.add(document.id);
    }
  }
  // The private audit also acts as a tombstone after an administrator deletes an import.
  for (let offset = 0; offset < ids.length; offset += 30) {
    const runs = await db.collection('historyImportRuns').where('ticketIds', 'array-contains-any', ids.slice(offset, offset + 30)).get();
    for (const run of runs.docs) for (const id of run.data().ticketIds || []) {
      previouslyImportedIds.add(String(id));
      const metadata = run.data().ticketMetadata?.[id];
      if (known.has(id) && metadata) known.set(id, { ...known.get(id)!, historicalImport: metadata });
    }
  }
  const summary = (await db.doc(STATS_SUMMARY_PATH).get()).data() as PublicStatsSummary | undefined;
  if (summary?.schemaVersion !== STATS_SCHEMA) throw new Error('Javni agregat nije inicijalizovan. Uvoz ne pokrece masovni sync.');
  return { existing: [...known.values()], occupiedPublicIds, previouslyImportedIds, summary };
}

export async function previewHistoricalStats(db: Firestore, plan: HistoricalImportPlan) {
  const summary = (await db.doc(STATS_SUMMARY_PATH).get()).data() as PublicStatsSummary;
  if (summary?.schemaVersion !== STATS_SCHEMA) throw new Error('Nedostaje postojeci javni agregat.');
  const rollups = { ...summary.months };
  for (const month of new Set(plan.tickets.map(tip => tip.date.slice(0, 7)))) {
    const previous = (await db.doc(`${STATS_MONTHS_COLLECTION}/${month}`).get()).data() as StatsMonth | undefined;
    if (summary.months[month] && previous?.schemaVersion !== STATS_SCHEMA) throw new Error('Postojeci mesecni agregat nije uskladjen.');
    const entries = { ...previous?.entries };
    for (const ticket of plan.tickets.filter(tip => tip.date.startsWith(month))) {
      const entry = statsEntry(ticket);
      if (!entry || entries[entry.id]) throw new Error('Plan bi duplirao ili pogresno obracunao tiket.');
      entries[entry.id] = entry;
    }
    const value = buildStatsMonth(entries, (previous?.version || 0) + 1);
    rollups[month] = { version: value.version, groups: value.groups };
  }
  return buildStatsSummary(rollups, summary.version + Number(plan.tickets.length > 0));
}

export async function applyHistoricalImport(db: Firestore, plan: HistoricalImportPlan, options: {
  confirmation: string; acknowledgeUnconfirmed: boolean; confirmLargeImport?: boolean; backupDirectory: string; pauseMs?: number;
}) {
  if (options.confirmation !== plan.fingerprint) throw new Error('Potrebna je potvrda aktuelnog dry-run fingerprinta.');
  if (plan.conflicts.length) throw new Error('Konfliktni redovi moraju prvo da budu pregledani. Nije bilo upisa.');
  if (plan.unconfirmed && !options.acknowledgeUnconfirmed) throw new Error('Rezultati nisu svi nezavisno potvrdjeni. Potrebna je izricita admin saglasnost.');
  const plannedWrites = plannedImportWrites(plan);
  if (plannedWrites > 500 && !options.confirmLargeImport) throw new Error(`Planirano je ${plannedWrites} upisa. Potrebno je --confirm-large-import.`);
  await mkdir(options.backupDirectory, { recursive: true });
  const report = { written: 0, skipped: 0, writeOperations: 0, backups: [] as string[], batches: 0 };
  for (const [index, batch] of importBatches(plan).entries()) {
    const ids = batch.map(ticket => ticket.id), batchHash = digest(ids.join('|'));
    const runReference = db.doc(`historyImportRuns/${plan.fileHash}-${batchHash.slice(0, 24)}`);
    try {
      const applied = await db.runTransaction(async transaction => {
        const priorRun = await transaction.get(runReference);
        if (priorRun.exists) return { written: 0, skipped: batch.length, writes: 0, backup: '' };
        const monthKeys = [...new Set(batch.map(ticket => ticket.date.slice(0, 7)))];
        const existing = await readImportWindow(db, monthKeys, transaction);
        const identities = new Set(existing.flatMap(ticket => ticket.historicalImport ? [ticket.historicalImport.identity] : []));
        const { existingTipIdentity } = await import('./csv.js');
        for (const ticket of existing) { const key = existingTipIdentity(ticket); if (key) identities.add(key); }
        if (batch.some(ticket => identities.has(ticket.historicalImport!.identity))) throw new Error('Baza je promenjena posle dry-run-a. Ponovite pregled; nista nije prepisano.');
        const targets = batch.flatMap(ticket => ticketPaths(ticket.id).map(value => db.doc(value)));
        const snapshots = await transaction.getAll(...targets);
        if (snapshots.some(document => document.exists)) throw new Error('Jedan od ciljanih zapisa vec postoji. Ponovite dry-run.');
        const summaryReference = db.doc(STATS_SUMMARY_PATH);
        const summarySnapshot = await transaction.get(summaryReference), summary = summarySnapshot.data() as PublicStatsSummary;
        if (summary?.schemaVersion !== STATS_SCHEMA) throw new Error('Nedostaje uskladjen javni agregat.');
        const monthReferences = monthKeys.map(month => db.doc(`${STATS_MONTHS_COLLECTION}/${month}`));
        const monthSnapshots = await transaction.getAll(...monthReferences);
        const rollups = { ...summary.months };
        const updates = monthKeys.map((month, offset) => {
          const previous = monthSnapshots[offset].data() as StatsMonth | undefined;
          if (summary.months[month] && previous?.schemaVersion !== STATS_SCHEMA) throw new Error('Mesecni agregat nije uskladjen.');
          const entries = { ...previous?.entries };
          for (const ticket of batch.filter(ticket => ticket.date.startsWith(month))) {
            const entry = statsEntry(ticket);
            if (!entry || entries[entry.id]) throw new Error('Tiket ne moze biti bezbedno dodat u postojecu statistiku.');
            entries[entry.id] = entry;
          }
          const value = buildStatsMonth(entries, (previous?.version || 0) + 1);
          rollups[month] = { version: value.version, groups: value.groups };
          return value;
        });
        const nextSummary = buildStatsSummary(rollups, summary.version + 1);
        const before = [summarySnapshot, ...monthSnapshots, ...snapshots, priorRun].map(document => ({ path: document.ref.path, exists: document.exists, data: document.exists ? plain(document.data()) : null }));
        const backup = path.join(options.backupDirectory, `${plan.fileHash}-batch-${index + 1}-${digest(JSON.stringify(before)).slice(0, 16)}.json`);
        const saved = await open(backup, 'wx').catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; return null; });
        if (saved) try { await saved.writeFile(JSON.stringify({ schema: 1, fileHash: plan.fileHash, fingerprint: plan.fingerprint, ticketIds: ids, before }, null, 2)); await saved.sync(); } finally { await saved.close(); }
        // Every batch commits private tickets, safe indexes, aggregates and its audit together.
        for (const ticket of batch) {
          const safe = mapTicketForPublic(ticket);
          const { historicalImport: _metadata, ...stored } = ticket;
          transaction.create(db.doc(`tickets/${ticket.id}`), { ...stored, adminImportRef: runReference.id });
          transaction.create(db.doc(`publicTickets/${ticket.id}`), safe);
          transaction.create(db.doc(`publicStatsTickets/${ticket.id}`), safe);
        }
        updates.forEach((value, offset) => transaction.set(monthReferences[offset], value));
        transaction.set(summaryReference, nextSummary);
        transaction.create(runReference, { fileHash: plan.fileHash, fileName: plan.fileName, fingerprint: plan.fingerprint,
          ticketIds: ids, importedAt: new Date().toISOString(), count: ids.length, confirmed: batch.filter(ticket => ticket.historicalImport?.verification === 'confirmed').length,
          unconfirmed: batch.filter(ticket => ticket.historicalImport?.verification === 'unconfirmed').length,
          ticketMetadata: Object.fromEntries(batch.map(ticket => [ticket.id, ticket.historicalImport])) });
        return { written: batch.length, skipped: 0, writes: batch.length * 3 + updates.length + 2, backup };
      }, { maxAttempts: 3 });
      report.written += applied.written; report.skipped += applied.skipped; report.writeOperations += applied.writes;
      if (applied.backup) report.backups.push(applied.backup);
      report.batches++;
      if (index + 1 < importBatches(plan).length) await pause(options.pauseMs ?? 1000);
    } catch (error) {
      const failure = error as Error & { code?: number | string };
      const quota = failure.code === 8 || failure.code === 'resource-exhausted' || /quota|resource.?exhausted/i.test(failure.message);
      throw Object.assign(new Error(quota ? 'Firestore kvota je iscrpljena. Uvoz je zaustavljen bez forsiranja upisa.' : failure.message), { partialReport: report });
    }
  }
  return report;
}
