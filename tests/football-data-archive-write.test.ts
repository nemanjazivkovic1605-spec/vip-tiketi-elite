import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openAnalyticsDatabase, migrateAnalytics } from '../server/footballAnalytics/database.ts';
import { ingestMatch } from '../server/footballAnalytics/store.ts';
import { readEnglishMatches } from '../server/footballAnalytics/historicalMatches.ts';
import { openArchiveStage, stageArchive } from '../server/footballAnalytics/footballDataArchive/staging.ts';
import { auditArchiveTarget, planArchive } from '../server/footballAnalytics/footballDataArchive/planner.ts';
import { sha256 } from '../server/footballAnalytics/footballDataArchive/normalization.ts';
import { writeArchive, type ArchiveWriteOptions } from '../server/footballAnalytics/footballDataArchive/writer.ts';
import { verifyArchiveImport } from '../server/footballAnalytics/footballDataArchive/verification.ts';
import type { MatchObservation } from '../src/types/footballAnalytics.ts';

async function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'elite-archive-write-'));
  const database = path.join(root, 'canonical.sqlite'), target = await openAnalyticsDatabase(database);
  await migrateAnalytics(target);
  const base: MatchObservation = { provider: 'manual', sourceId: 'original', environment: 'real',
    league: { sourceId: 'PL', name: 'Premier League', country: 'England' }, season: '2024/2025', kickoffAt: '2024-08-02T19:00:00Z',
    home: { sourceId: 'mu', name: 'Manchester United' }, away: { sourceId: 'wolves', name: 'Wolverhampton Wanderers' },
    status: 'finished', ft: { home: 2, away: 1 }, ht: { home: null, away: null },
    extraTime: { home: null, away: null }, penalties: { home: null, away: null },
    xg: { home: 1.7, away: 1.1 }, shots: { home: 15, away: 6 }, shotsOnTarget: { home: null, away: null },
    events: null, individualShots: null, observedAt: '2026-11-15T09:00:00Z', statsChecked: true };
  await ingestMatch(target, base);
  await ingestMatch(target, { ...base, sourceId: 'conflict', home: { sourceId: 'newcastle', name: 'Newcastle United' },
    away: { sourceId: 'arsenal', name: 'Arsenal' }, kickoffAt: '2024-08-04T18:00:00Z', ft: { home: 3, away: 1 } });
  await ingestMatch(target, { ...base, sourceId: 'possible-date-shift', home: { sourceId: 'everton', name: 'Everton' },
    away: { sourceId: 'liverpool', name: 'Liverpool' }, kickoffAt: '2024-08-06T18:00:00Z', ft: { home: null, away: null }, status: 'scheduled' });
  await target.close();
  const first = 'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,HTHG,HTAG,B365H,HS,HST\n' +
    'E0,02/08/2024,20:00,Man Utd,Wolves,2,1,0,1,2.1,9,6\n' +
    'E0,03/08/2024,,Leeds,Man Utd,1,1,1,0,2.4,8,3\n' +
    'E0,04/08/2024,,Newcastle United,Arsenal,0,1,0,0,3.2,5,1\n' +
    'E0,05/08/2024,,Everton,Liverpool,2,0,0,0,4.1,6,2\n';
  const second = 'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,HTHG,HTAG,MaxCH,AHh,B365AHH\nE0,02/08/2024,Man Utd,Wolves,2,1,0,1,2.5,0,1.88\n';
  writeFileSync(path.join(root, 'E0.csv'), first); writeFileSync(path.join(root, 'E0 (1).csv'), second);
  const files = ['E0.csv', 'E0 (1).csv'].map(name => { const buffer = readFileSync(path.join(root, name)); return { name, bytes: buffer.length, sha256: sha256(buffer) }; });
  const stage = openArchiveStage(path.join(root, 'stage.sqlite'));
  stageArchive(stage, root, files, 'unit-archive', '2026-11-15', undefined, 'unit-parser');
  const before = auditArchiveTarget(database), plan = planArchive(stage, before);
  const options: ArchiveWriteOptions = { database, stage, approvedPlan: plan, confirmation: plan.fingerprint,
    privateLocal: true, allowLarge: true, backupDirectory: path.join(root, 'backups'), batchMatches: 100 };
  const close = () => {
    stage.close();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('elite-archive-write-'));
    rmSync(root, { recursive: true, force: true });
  };
  return { root, before, plan, stage, options, database, close };
}

test('approved canonical import reuses IDs, fills only missing facts, separates source quotes and skips conflicts', async () => {
  const f = await fixture();
  try {
    assert.equal(f.plan.target.create, 1); assert.equal(f.plan.target.enrich, 1);
    assert.equal(f.plan.target.conflict, 1); assert.equal(f.plan.target.identityReview, 1);
    const run = await writeArchive(f.options);
    assert.equal(run.status, 'complete'); assert.equal(run.created, 1); assert.equal(run.enriched, 1);
    assert.equal(run.quotes, 3); assert.equal(run.firestoreWrites, 0); assert.equal(run.backupVerified, true);
    assert.equal(auditArchiveTarget(run.backup).fingerprint, f.before.fingerprint);
    const verification = verifyArchiveImport(f.database, f.stage, run);
    assert.equal(verification.existingFactsPreserved, true); assert.equal(verification.removedMatches, 0);
    assert.equal(verification.quoteValuesAndProvenanceEqualToStage, true); assert.equal(verification.historicalPriceValues, 4);
    const db = new DatabaseSync(f.database, { readOnly: true });
    try {
      const stored = (db.prepare('SELECT payload FROM fa_matches').all()).map(row => JSON.parse(row.payload as string));
      assert.equal(stored.length, 4);
      const original = f.before.matches.find(row => row.sourceId === 'original')!;
      const updated = stored.find(row => row.id === original.id)!;
      for (const field of ['id', 'homeId', 'awayId', 'home', 'away', 'ft', 'kickoffAt', 'season', 'xg', 'shots', 'provider', 'sourceId'] as const)
        assert.deepEqual(updated[field], original[field], `known ${field} remains unchanged`);
      assert.deepEqual(updated.ht, { home: 0, away: 1 }); assert.equal(updated.shotsOnTarget.home, 6);
      assert.equal(updated.matchTime, undefined, 'unknown-zone CSV time must not replace a known UTC kickoff');
      const created = stored.find(row => row.home.name === 'Leeds United');
      assert.equal(created.kickoffAt, null); assert.equal(created.matchTime, null); assert.equal(created.timeZone, null);
      assert.equal(created.awayId, original.homeId, 'new seasons reuse the unambiguous existing club ID');
      const quotes = db.prepare('SELECT payload FROM fa_historical_quotes WHERE match_id=?').all(original.id).map(row => JSON.parse(row.payload as string));
      assert.equal(quotes[0].odds.prices.B365H ?? quotes[1].odds.prices.B365H, 2.1);
      assert.equal(quotes.find(row => row.odds.lines.AHh === 0)?.odds.prices.B365AHH, 1.88);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM fa_versions WHERE available_at<'2026-11-15'").get()?.count, 0, 'no historical knowledge is backdated');
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM fa_archive_files').get()?.count, 2);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM fa_matches WHERE id=?").get(original.id)?.count, 1);
    } finally { db.close(); }
    const fingerprint = auditArchiveTarget(f.database).fingerprint;
    const repeated = await writeArchive(f.options);
    assert.equal(repeated.alreadyComplete, true); assert.equal(auditArchiveTarget(f.database).fingerprint, fingerprint);
    assert.equal(readdirSync(path.join(f.root, 'backups')).filter(name => name.endsWith('.sqlite')).length, 1);
    const plan = planArchive(f.stage, auditArchiveTarget(f.database));
    assert.equal(plan.target.create, 0); assert.equal(plan.target.enrich, 0); assert.equal(plan.target.quoteSnapshots, 0);
    assert.equal(plan.target.unchanged, 2); assert.equal(plan.target.conflict, 1); assert.equal(plan.target.identityReview, 1);
  } finally { f.close(); }
});

test('interrupted imports resume after the last committed batch without new IDs, quotes or backup', async () => {
  const f = await fixture();
  try {
    await assert.rejects(writeArchive({ ...f.options, batchMatches: 1, onProgress: () => { throw new Error('simulated interruption'); } }), /simulated interruption/);
    await assert.rejects(writeArchive(f.options), /--resume/);
    const run = await writeArchive({ ...f.options, resume: true, batchMatches: 1 });
    assert.equal(run.processed, 2); assert.equal(run.created, 1); assert.equal(run.enriched, 1); assert.equal(run.quotes, 3);
    assert.equal(auditArchiveTarget(f.database).matches.length, 4);
    assert.equal(readdirSync(path.join(f.root, 'backups')).filter(name => name.endsWith('.sqlite')).length, 1);
  } finally { f.close(); }
});

test('invalid odds abort and roll back the whole match batch, including canonical scores and source indexes', async () => {
  const f = await fixture();
  try {
    const row = f.stage.prepare("SELECT r.id,r.payload FROM archive_rows r JOIN archive_plan p ON p.identity=r.identity WHERE p.action IN ('create','enrich') ORDER BY r.id LIMIT 1").get()!;
    const corrupt = JSON.parse(row.payload as string); corrupt.odds.prices.B365H = 1;
    f.stage.prepare('UPDATE archive_rows SET payload=? WHERE id=?').run(JSON.stringify(corrupt), row.id);
    await assert.rejects(writeArchive(f.options), /Invalid historical price/);
    assert.equal(auditArchiveTarget(f.database).fingerprint, f.before.fingerprint);
    const check = new DatabaseSync(f.database, { readOnly: true });
    try {
      assert.equal(check.prepare('SELECT COUNT(*) AS count FROM fa_historical_quotes').get()?.count, 0);
      assert.equal(check.prepare("SELECT COUNT(*) AS count FROM fa_sources WHERE provider='football-data.co.uk'").get()?.count, 0);
      const run = JSON.parse(check.prepare('SELECT payload FROM fa_archive_imports').get()!.payload as string);
      assert.equal(run.status, 'failed'); assert.equal(run.processed, 0);
    } finally { check.close(); }
  } finally { f.close(); }
});

test('unapproved, production, stale and oversized archive write attempts fail before modifying target', async () => {
  const f = await fixture();
  try {
    await assert.rejects(writeArchive({ ...f.options, privateLocal: false }), /local private/);
    await assert.rejects(writeArchive({ ...f.options, confirmation: 'wrong' }), /fingerprint/);
    await assert.rejects(writeArchive({ ...f.options, allowLarge: false,
      approvedPlan: { ...f.plan, target: { ...f.plan.target, create: 501 } } }), /500/);
    const env = process.env.VERCEL;
    try { process.env.VERCEL = '1'; await assert.rejects(writeArchive(f.options), /Production is disabled/); }
    finally { if (env === undefined) delete process.env.VERCEL; else process.env.VERCEL = env; }
    const db = new DatabaseSync(f.database);
    try { db.prepare("UPDATE fa_matches SET checked_at='2026-11-15T12:00:00Z'").run(); } finally { db.close(); }
    await assert.rejects(writeArchive(f.options), /target changed/i);
    assert.equal(readdirSync(f.root).includes('backups'), false);
  } finally { f.close(); }
});

test('English analytics restrict seasons in SQL before applying the safety limit', async () => {
  let sql = '', values: unknown[] = [];
  await readEnglishMatches({ kind: 'sqlite', close: async () => {}, transaction: async () => { throw new Error('read only'); },
    query: async (query, args = []) => { sql = query; values = args; return []; } });
  assert.match(sql, /AND season IN \(.*\).*LIMIT 50001/);
  assert.deepEqual(values.slice(-4), ['2023/24', '2024/25', '2025/26', '2026/27']);
});
