import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { openAnalyticsDatabase, migrateAnalytics } from '../server/footballAnalytics/database.ts';
import { aggregateHistorical, historicalTeamStats } from '../server/footballAnalytics/historicalStats.ts';
import { historicalOverview } from '../server/footballAnalytics/historicalOverview.ts';
import { planHistoricalImport, writeHistoricalImport, syncHistoricalCurrentSeason } from '../server/footballAnalytics/historicalImport.ts';
import { historicalJson, inspectDataset, manualHistoricalDataset, normalizeHistoricalJson, validHistoricalObservation, repositoryHistoricalDatasets, loadHistoricalDataset } from '../server/footballAnalytics/historicalProvider.ts';
import { ENGLISH_PYRAMID, historicalSeason, validHistoricalDate } from '../server/footballAnalytics/englishPyramid.ts';
import { ingestMatch, readMatch } from '../server/footballAnalytics/store.ts';
import { createAnalyticsHandler } from '../api/football-analytics.ts';
import type { AnalyticsMatch } from '../src/types/footballAnalytics.ts';
import type { HistoricalImportOptions } from '../src/types/historicalAnalytics.ts';

const options = (rows: any[]): HistoricalImportOptions => ({ provider: 'manual', league: 'league-two', season: '2025/26', format: 'json', content: JSON.stringify(rows), sourceName: 'Explicit unit-test dataset', rightsConfirmed: true });
const raw = (id = 1) => ({ id: String(id), date: `2026-01-${String(id).padStart(2, '0')}`, time: '15:00', homeTeam: 'Unit Test Home FC', awayTeam: 'Unit Test Away', htHome: 0, htAway: 1, ftHome: 2, ftAway: 1, status: 'finished' });
const dataset = (rows = [raw()]) => manualHistoricalDataset(options(rows));
const memory = async () => { const db = await openAnalyticsDatabase(':memory:'); await migrateAnalytics(db); return db; };

test('English pyramid has 11 distinct competitions and 44 season targets; no invented coverage', async () => {
  const db = await memory();
  try {
    assert.equal(ENGLISH_PYRAMID.length, 11);
    const report = await historicalOverview(db);
    assert.equal(report.coverage.length, 44); assert.equal(report.totals.matches, 0);
    assert.equal(report.coverage.filter(row => row.tier === 6).length, 8);
    assert.equal(report.coverage.filter(row => row.tier === 7).length, 16);
    assert.ok(report.coverage.every(row => row.fullSeasonCompleteness === null));
    assert.ok(report.coverage.filter(row => row.tier >= 6).every(row => row.state === 'uncovered'));
  } finally { await db.close(); }
});
test('archive values stay null; date errors, invented zero scores and incoherent HT are rejected', () => {
  assert.equal(historicalSeason('2025/2026'), '2025/26'); assert.equal(historicalSeason('2025/27'), null);
  assert.equal(validHistoricalDate('2025-04-25', '2025/26'), false);
  assert.equal(validHistoricalDate('2026-02-30', '2025/26'), false);
  const row = normalizeHistoricalJson({ date: '2026-01-01', team1: 'Home', team2: 'Away', score: { ft: [0, 0] } }, 'league-one', '2025/26', 'openfootball', 'https://example.test');
  assert.ok(row); assert.deepEqual(row.ht, { home: null, away: null }); assert.equal(row.ft.home, 0);
  assert.equal(row.kickoffAt, null); assert.equal(row.matchTime, null); assert.equal(row.timeZone, null);
  assert.equal(normalizeHistoricalJson({ ...raw(), htHome: 3 }, 'league-two', '2025/26', 'manual', ''), null);
  assert.equal(normalizeHistoricalJson({ ...raw(), ftHome: '' }, 'league-two', '2025/26', 'manual', ''), null);
  assert.equal(validHistoricalObservation({ ...row, environment: 'test' }), false);
});
test('CSV/JSON manual import validates rights, quoted fields, league, season, duplicates and conflicts', () => {
  assert.throws(() => manualHistoricalDataset({ ...options([raw()]), rightsConfirmed: false }), /pravo/);
  const csv = 'id,date,time,homeTeam,awayTeam,htHome,htAway,ftHome,ftAway,status\r\n1,2026-01-01,,"Town, United",Away,,,2,1,FT';
  const result = manualHistoricalDataset({ ...options([]), content: csv, format: 'csv' });
  assert.equal(result.validRows, 1); assert.equal(result.records[0].home.name, 'Town, United'); assert.equal(result.withHtFt, 0);
  assert.equal(dataset([raw(), raw()]).duplicateRows, 1);
  assert.equal(dataset([raw(), { ...raw(), id: 'other-id' }]).validRows, 1);
  assert.equal(dataset([raw(), { ...raw(), ftHome: 1 }]).validRows, 0);
  assert.equal(dataset([{ ...raw(), league: 'Premier League' }]).validRows, 0);
  assert.throws(() => manualHistoricalDataset({ ...options([]), content: '{' }));
});
test('dry-run never mutates SQL and requires confirmed fingerprint before bounded write', async () => {
  const db = await memory();
  try {
    const queries: string[] = [];
    const readonly = { ...db, query: async (sql: string, values?: unknown[]) => { queries.push(sql); assert.match(sql, /^SELECT/); return db.query(sql, values); } };
    const plan = await planHistoricalImport(readonly, options([raw()]));
    assert.equal(plan.summary.create, 1); assert.equal(plan.summary.firestoreWrites, 0);
    assert.equal((await db.query('SELECT COUNT(*) AS count FROM fa_matches'))[0].count, 0);
    await assert.rejects(writeHistoricalImport(db, plan, 'bad-fingerprint'), /Plan se promenio/);
    assert.ok(queries.length <= 3);
    const result = await writeHistoricalImport(db, plan, plan.summary.fingerprint);
    assert.equal(result.created, 1);
    const repeated = await planHistoricalImport(db, options([raw()]));
    assert.equal(repeated.summary.create, 0); assert.equal(repeated.summary.update, 0); assert.equal(repeated.summary.unchanged, 1);
    await writeHistoricalImport(db, repeated, repeated.summary.fingerprint);
    assert.equal((await db.query('SELECT COUNT(*) AS count FROM fa_matches'))[0].count, 1);
    assert.equal((await db.query('SELECT COUNT(*) AS count FROM fa_teams'))[0].count, 2);
    assert.equal((await historicalOverview(db)).coverage.find(row => row.league === 'league-two' && row.season === '2025/26')!.withHtFt, 1);
  } finally { await db.close(); }
});
test('null-safe updates preserve known scores, normalize teams and retain corrected versions', async () => {
  const db = await memory();
  try {
    const first = dataset([{ ...raw(), homeTeam: 'Man Utd' }]).records[0];
    assert.equal(first.home.name, 'Manchester United');
    await ingestMatch(db, first);
    const updated = { ...first, ft: { home: 3, away: 1 }, observedAt: new Date(Date.now() + 1000).toISOString() };
    await ingestMatch(db, updated);
    await ingestMatch(db, { ...updated, ht: { home: null, away: null }, observedAt: new Date(Date.now() + 2000).toISOString() });
    const id = (await db.query('SELECT id FROM fa_matches'))[0].id;
    const item = (await readMatch(db, id))!;
    assert.equal(item.ft.home, 3); assert.equal(item.ht.away, 1);
    assert.equal((await db.query('SELECT COUNT(*) AS count FROM fa_versions'))[0].count, 2);
  } finally { await db.close(); }
});
test('all nine HT/FT transitions, comeback sample and goal markets use correct denominators', () => {
  const scores: Record<string, [number, number]> = { '1': [1, 0], X: [0, 0], '2': [0, 1] };
  const rows: AnalyticsMatch[] = [];
  for (const ht of ['1', 'X', '2']) for (const ft of ['1', 'X', '2']) {
    const base = dataset().records[0];
    const half = scores[ht], full = scores[ft];
    rows.push({ ...base, id: `${ht}/${ft}`, leagueId: 'league', homeId: 'home', awayId: 'away', provenance: {}, sources: [],
      ht: { home: half[0], away: half[1] }, ft: { home: full[0] + 2, away: full[1] + 2 } });
  }
  rows.push({ ...rows[0], id: 'missing-ht', ht: { home: null, away: null } });
  const value = aggregateHistorical(rows);
  assert.equal(value.finished, 10); assert.equal(value.withHtFt, 9);
  assert.ok(value.htft.every(row => row.sample === 9 && row.count === 1));
  assert.equal(value.comebacks.count, 2); assert.equal(value.comebacks.sample, 9);
  assert.equal(value.over15Ft.sample, 10); assert.equal(value.over05Ht.sample, 9);
  assert.equal(value.secondHalfGoals.sample, 9);
  const empty = aggregateHistorical([]); assert.equal(empty.btts.percent, null);
});
test('form uses last five and ten matches with venue samples and H2H filtering', async () => {
  const db = await memory();
  try {
    for (let id = 1; id <= 12; id++) await ingestMatch(db, dataset([{ ...raw(id), awayTeam: `Unit Test Away ${id}` }]).records[0]);
    const rows = (await db.query('SELECT payload FROM fa_matches')).map(row => JSON.parse(row.payload) as AnalyticsMatch);
    const team = historicalTeamStats(rows, rows[0].homeId, rows[0].home.name);
    assert.equal(team.sample, 12); assert.equal(team.last5.sample, 5); assert.equal(team.last10.sample, 10);
    assert.equal(team.home.sample, 12); assert.equal(team.away.averageFor, null);
    const report = await historicalOverview(db, { team: rows[0].homeId, against: rows[0].awayId });
    assert.equal(report.h2h!.sample, 1); assert.equal(report.opponents.length, 12);
    assert.equal(report.aggregate.finished, 12);
  } finally { await db.close(); }
});
test('production and scheduled imports are opt-in; authorization precedes database access', async () => {
  const db = await memory(), previous = process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED;
  try {
    const plan = await planHistoricalImport(db, options([raw()]));
    delete process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED;
    await assert.rejects(writeHistoricalImport({ ...db, kind: 'postgres' }, plan, plan.summary.fingerprint), /nije odobren/);
    assert.equal((await syncHistoricalCurrentSeason(db)).skipped, true);
    let opened = false;
    const handler = createAnalyticsHandler(async () => false, async () => { opened = true; return db; }, () => false);
    const response: any = { statusCode: 0, setHeader() {}, end() {} };
    await handler({ method: 'GET', url: '/api/football-analytics?action=historical-overview', headers: {} } as any, response);
    assert.equal(response.statusCode, 403); assert.equal(opened, false);
    const admin = createAnalyticsHandler(async () => true, async () => db, () => false);
    const request = Object.assign(Readable.from([JSON.stringify({ options: options([raw()]) })]), { method: 'POST', url: '/api/football-analytics?action=historical-plan', headers: {} });
    let body = ''; const result: any = { statusCode: 0, setHeader() {}, end(text: string) { body = text; } };
    await admin(request as any, result);
    assert.equal(result.statusCode, 200); assert.equal(JSON.parse(body).create, 1);
    assert.equal((await db.query('SELECT COUNT(*) AS count FROM fa_matches'))[0].count, 0);
  } finally { if (previous === undefined) delete process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED; else process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED = previous; await db.close(); }
});
test('source cache coalesces requests, rejects arbitrary hosts and retries transient failure', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ matches: [] }), { status: calls === 1 ? 503 : 200 }); };
    const url = new URL(`https://openfootball.github.io/england/unit-${Date.now()}.json`);
    const [one, two] = await Promise.all([historicalJson(url), historicalJson(url)]);
    assert.deepEqual(one, two); assert.equal(calls, 2);
    await historicalJson(url); assert.equal(calls, 2);
    await assert.rejects(historicalJson(new URL('https://untrusted.invalid/a')), /dozvoljen/);
  } finally { globalThis.fetch = original; }
});
test('dry-run simulates overlapping identities within the same plan without hidden database writes', async () => {
  const db = await memory();
  try {
    const rows = [raw(), { ...raw(2), homeTeam: raw().homeTeam, awayTeam: raw().awayTeam }];
    const plan = await planHistoricalImport(db, options(rows));
    assert.equal(plan.summary.create, 1); assert.equal(plan.summary.unresolved, 1);
    assert.equal((await db.query('SELECT COUNT(*) AS count FROM fa_unresolved'))[0].count, 0);
    const result = await writeHistoricalImport(db, plan, plan.summary.fingerprint);
    assert.equal(result.created, plan.summary.create); assert.equal(result.unresolved, plan.summary.unresolved);
    assert.equal((await db.query('SELECT COUNT(*) AS count FROM fa_matches'))[0].count, 1);
  } finally { await db.close(); }
});
test('existing repository archive is reused as real partial data, not a second ticket or Firestore store', async () => {
  const rows = await repositoryHistoricalDatasets();
  assert.equal(rows.length, 7); assert.equal(rows.reduce((sum, row) => sum + row.validRows, 0), 2792);
  assert.equal(rows.reduce((sum, row) => sum + row.withHtFt, 0), 2653);
  assert.ok(rows.every(row => row.provider === 'openfootball' && row.sourceComplete === false));
});
test('OpenFootball fallback verifies the requested competition and does not mistake an upstream error for complete coverage', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return calls === 1 ? new Response('{}', { status: 404 }) : new Response(JSON.stringify({ name: 'English League Two 2025/26', matches: [{ date: '2026-01-01', team1: 'Unit Home', team2: 'Unit Away', score: { ht: [0, 0], ft: [1, 0] } }] }), { status: 200 });
    };
    const value = await loadHistoricalDataset('league-two', '2025/26', 'openfootball');
    assert.equal(calls, 2); assert.equal(value.validRows, 1); assert.equal(value.withHtFt, 1); assert.equal(value.sourceComplete, false);
    globalThis.fetch = async () => new Response(JSON.stringify({ name: 'English Premier League 2023/24', matches: [] }), { status: 200 });
    const wrong = await loadHistoricalDataset('league-one', '2023/24', 'openfootball');
    assert.equal(wrong.records.length, 0); assert.equal(wrong.state, 'error');
  } finally { globalThis.fetch = original; }
});
