import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { completeScore } from '../normalization.js';
import { sha256 } from './normalization.js';
import type { ArchiveImportRun } from './writer.js';

export function archiveDatabaseFingerprint(database: string) {
  const db = new DatabaseSync(database, { readOnly: true }), digest = createHash('sha256');
  try {
    for (const row of db.prepare('SELECT id,payload,checked_at FROM fa_matches ORDER BY id').iterate())
      digest.update(JSON.stringify([row.id, row.payload, row.checked_at]));
    return digest.digest('hex');
  } finally { db.close(); }
}
function assertPreserved(previous: any, current: any, field = '') {
  if (previous == null || previous === '') return;
  if (field === 'status' && ['unknown', 'live', 'scheduled'].includes(previous) && current === 'finished') return;
  if (Array.isArray(previous)) {
    const actual = field === 'sources' && Array.isArray(current) ? current.slice(0, previous.length) : current;
    if (JSON.stringify(previous) !== JSON.stringify(actual)) throw new Error(`Existing array changed: ${field}`);
  } else if (typeof previous === 'object') {
    if (!current || typeof current !== 'object') throw new Error(`Existing object removed: ${field}`);
    for (const [key, value] of Object.entries(previous)) {
      if (['observedAt', 'lastCheckedAt'].includes(key)) continue;
      if (!field && key === 'provenance') {
        for (const [fact, origin] of Object.entries(value as Record<string, unknown>)) {
          const read = (object: any) => fact.split('.').reduce((item, part) => item?.[part], object);
          if (JSON.stringify(read(previous)) === JSON.stringify(read(current))) assertPreserved(origin, current.provenance?.[fact], `provenance.${fact}`);
        }
        continue;
      }
      assertPreserved(value, current[key], field ? `${field}.${key}` : key);
    }
  } else if (previous !== current) throw new Error(`Existing fact changed: ${field}`);
}

// Verification opens the canonical database, staging and backup read-only. It never repairs data.
export function verifyArchiveImport(database: string, stage: DatabaseSync, run: ArchiveImportRun) {
  if (run.status !== 'complete') throw new Error('Import is not complete.');
  if (archiveDatabaseFingerprint(run.backup) !== run.targetBefore) throw new Error('The original backup no longer matches.');
  const db = new DatabaseSync(database, { readOnly: true }), backup = new DatabaseSync(run.backup, { readOnly: true });
  try {
    // Connection-local memory settings only; the verification databases remain read-only.
    db.exec('PRAGMA cache_size=-65536');
    stage.exec('PRAGMA cache_size=-65536');
    const integrity = String(db.prepare('PRAGMA quick_check').get()?.quick_check);
    if (integrity !== 'ok') throw new Error(`SQLite integrity check failed: ${integrity}`);
    const read = db.prepare('SELECT payload,checked_at FROM fa_matches WHERE id=?');
    let existing = 0, changed = 0;
    for (const original of backup.prepare('SELECT id,payload,checked_at FROM fa_matches ORDER BY id').iterate()) {
      existing++;
      const current = read.get(original.id);
      if (!current) throw new Error(`Existing match was removed: ${original.id}`);
      if (current.payload === original.payload && current.checked_at === original.checked_at) continue;
      changed++;
      const match = JSON.parse(current.payload as string);
      assertPreserved(JSON.parse(original.payload as string), match);
      if (match.status === 'finished' && !completeScore(match.ft)) throw new Error(`Finished match lacks FT: ${original.id}`);
    }
    const total = Number(db.prepare('SELECT COUNT(*) AS count FROM fa_matches').get()!.count);
    if (changed !== run.enriched || total !== existing + run.created) throw new Error('Existing/new match counts do not reconcile.');
    const plans = new Map(stage.prepare('SELECT identity,action,existing_id FROM archive_plan').all().map(row => [row.identity, row]));
    const rowKey = new Map<string, { hash: string; fileSha: string; line: number; action: string; existingId: string | null }>();
    // Sequential scans plus compact hashes avoid 150,000 random reads of the large source payload table.
    for (const row of stage.prepare('SELECT id,identity,file_sha,line,payload FROM archive_rows').iterate()) {
      const planned = plans.get(row.identity);
      if (!planned) throw new Error('A staged observation is missing from the approved plan.');
      rowKey.set(sha256(`football-data.co.uk:${row.id}`), { hash: sha256(String(row.payload)), fileSha: String(row.file_sha),
        line: Number(row.line), action: String(planned.action), existingId: planned.existing_id ? String(planned.existing_id) : null });
    }
    let quotes = 0, prices = 0, missingQuotedMatches = 0;
    for (const row of db.prepare("SELECT q.*,m.id AS canonical_id FROM fa_historical_quotes q LEFT JOIN fa_matches m ON m.id=q.match_id WHERE q.provider='football-data.co.uk'").iterate()) {
      const source = rowKey.get(String(row.id));
      if (!source) continue; // Other separately approved archives may coexist.
      quotes++;
      if (!row.canonical_id) missingQuotedMatches++;
      if (!['create', 'enrich', 'unchanged'].includes(source.action) ||
        (source.existingId && source.existingId !== row.match_id) || sha256(String(row.payload)) !== source.hash ||
        row.file_sha !== source.fileSha || row.source_line !== source.line)
        throw new Error(`Historical quote/provenance differs from staged source: ${row.id}`);
      const payload = JSON.parse(row.payload as string);
      for (const price of Object.values(payload.odds.prices)) {
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 1) throw new Error('Invalid normalized historical price.');
        prices++;
      }
    }
    const expectedQuotes = Number(stage.prepare("SELECT COUNT(*) AS count FROM archive_rows r JOIN archive_plan p ON p.identity=r.identity WHERE p.action IN ('create','enrich','unchanged')").get()!.count);
    if (quotes !== expectedQuotes || missingQuotedMatches) throw new Error('Historical quote count or canonical links are invalid.');
    const totals = db.prepare(`SELECT COUNT(*) AS matches,SUM(environment='real') AS realMatches,
      SUM(environment='real' AND finished_complete=1) AS finished,
      SUM(environment='real' AND finished_complete=1 AND has_ht=1) AS withHtFt,
      COUNT(DISTINCT CASE WHEN environment='real' THEN league_id END) AS leagues FROM fa_matches`).get();
    const transitions = db.prepare(`SELECT code,COUNT(*) AS count FROM (SELECT
      (CASE WHEN json_extract(payload,'$.ht.home')>json_extract(payload,'$.ht.away') THEN '1'
        WHEN json_extract(payload,'$.ht.home')<json_extract(payload,'$.ht.away') THEN '2' ELSE 'X' END)||'/'||
      (CASE WHEN json_extract(payload,'$.ft.home')>json_extract(payload,'$.ft.away') THEN '1'
        WHEN json_extract(payload,'$.ft.home')<json_extract(payload,'$.ft.away') THEN '2' ELSE 'X' END) AS code
      FROM fa_matches WHERE environment='real' AND finished_complete=1 AND has_ht=1) GROUP BY code ORDER BY code`).all();
    return { verifiedAt: new Date().toISOString(), integrity, existingMatches: existing, removedMatches: 0,
      existingFactsPreserved: true, enrichedMatches: changed, newMatches: run.created, canonical: totals,
      quoteSnapshots: quotes, newlyAddedQuoteSnapshots: run.quotes, historicalPriceValues: prices, invalidNormalizedPrices: 0,
      quoteValuesAndProvenanceEqualToStage: true, conflictsSkipped: run.conflictsSkipped, identitiesSkipped: run.identitiesSkipped,
      transitions, firestoreReads: 0, firestoreWrites: 0, productionWrites: 0 };
  } finally { db.close(); backup.close(); }
}
