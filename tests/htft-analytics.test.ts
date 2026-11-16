import test from 'node:test';
import assert from 'node:assert/strict';
import { openAnalyticsDatabase, migrateAnalytics } from '../server/footballAnalytics/database.ts';
import { normalizeHistoricalJson, inspectDataset, historicalJson, type loadHistoricalDataset } from '../server/footballAnalytics/historicalProvider.ts';
import { ingestMatch } from '../server/footballAnalytics/store.ts';
import { historicalTransition } from '../server/footballAnalytics/historicalStats.ts';
import { countTeamTransitions, teamTransition, rankHtftTeams, listHtftTransitions, htftTeamDetail, previewHtftMatch, htftSchedule, validateHtftFilters } from '../server/footballAnalytics/htftAnalytics.ts';
import { planHtftSync, runDailyHtftSync } from '../server/footballAnalytics/htftSync.ts';
import { createAnalyticsHandler } from '../api/football-analytics.ts';
import type { AnalyticsMatch, MatchObservation } from '../src/types/footballAnalytics.ts';
import { HTFT_CODES, type HtftCode } from '../src/types/htftAnalytics.ts';

const now = new Date('2026-11-15T12:00:00Z');
const observation = (date = '2026-02-01', fields: Record<string, unknown> = {}) => normalizeHistoricalJson({ id: date, date, homeTeam: 'Unit Home', awayTeam: 'Unit Away', htHome: 0, htAway: 1, ftHome: 2, ftAway: 1, status: 'finished', ...fields }, 'league-one', date < '2026-07-01' ? '2025/26' : '2026/27', 'manual', 'https://unit.test', 'explicit-memory-test')!;
const match = (date = '2026-02-01', fields: Record<string, unknown> = {}): AnalyticsMatch => ({ ...observation(date, fields), id: date, homeId: 'home', awayId: 'away', leagueId: 'league', provenance: {}, sources: [] });
const memory = async () => { const db = await openAnalyticsDatabase(':memory:'); await migrateAnalytics(db); return db; };
const allCodes = () => HTFT_CODES.map((code, index) => {
  const score = (value: string) => value === '1' ? [1, 0] : value === '2' ? [0, 1] : [0, 0];
  const [ht, ft] = code.split('/'), half = score(ht), full = score(ft);
  return match(`2026-02-${String(index + 1).padStart(2, '0')}`, { htHome: half[0], htAway: half[1], ftHome: full[0] + 2, ftAway: full[1] + 2 });
});

test('HT/FT roles credit the comeback winner only and separately identify lost leads', () => {
  const rows = allCodes();
  assert.deepEqual(rows.map(historicalTransition), [...HTFT_CODES]);
  const twoOne = rows[0], oneTwo = rows[1];
  assert.equal(teamTransition(twoOne, 'home').madeComeback, true);
  assert.equal(teamTransition(twoOne, 'away').concededComeback, true);
  assert.equal(teamTransition(oneTwo, 'away').madeComeback, true);
  assert.equal(teamTransition(oneTwo, 'home').concededComeback, true);
  assert.equal(teamTransition(rows.find(row => historicalTransition(row) === '1/X')!, 'home').droppedLead, true);
  assert.equal(teamTransition(rows.find(row => historicalTransition(row) === '2/X')!, 'away').droppedLead, true);
  const home = countTeamTransitions(rows, 'home', now), away = countTeamTransitions(rows, 'away', now);
  assert.equal(home.made21, 1); assert.equal(home.made12, 0);
  assert.equal(away.made21, 0); assert.equal(away.made12, 1);
  assert.equal(home.droppedLead, 2); assert.equal(away.droppedLead, 2);
  assert.equal(home.sample, 9); assert.equal(home.transitions.reduce((sum, row) => sum + row.count, 0), 9);
  assert.throws(() => teamTransition(twoOne, 'unknown'));
});

test('ranking filters, sortable columns and match drilldowns use the same verified sample', () => {
  const rows = [...allCodes(), { ...match('2026-02-10'), ht: { home: null, away: null } }, { ...match('2026-02-11'), environment: 'test' as const }];
  const ranked = rankHtftTeams(rows, {}, now);
  assert.equal(ranked.aggregate.withHtFt, 9); assert.equal(ranked.aggregate.finished, 10);
  assert.equal(ranked.rows.reduce((sum, row) => sum + row.made, 0), 2);
  assert.equal(ranked.rows[0].sample, 9); assert.equal(ranked.rows[0].played, 10);
  assert.equal(rankHtftTeams(rows, { transition: '2/1' }, now).rows[0].id, 'home');
  assert.equal(rankHtftTeams(rows, { transition: '2/1', role: 'conceded' }, now).rows[0].id, 'away');
  assert.equal(rankHtftTeams(rows, { search: 'Unit Away' }, now).rows.length, 1);
  assert.equal(rankHtftTeams(rows, { season: '2024/25' }, now).totalTeams, 0);
  for (const code of HTFT_CODES) {
    const page = listHtftTransitions(rows, code, {}, now);
    assert.equal(page.count, 1); assert.equal(page.sample, 9);
    assert.equal(historicalTransition(page.matches[0]), code);
  }
  assert.equal(rankHtftTeams(rows, { sort: 'name', direction: 'asc' }, now).rows[0].name, 'Unit Away');
  for (const value of [{ transition: '3/1' }, { offset: -1 }, { sort: 'DROP TABLE' }, { direction: 'wrong' }, { role: 'admin' }]) assert.throws(() => validateHtftFilters(value as any));
});

test('team history retains venue, actual HT/FT and four-season splits without filling missing HT', () => {
  const rows = allCodes();
  const detail = htftTeamDetail(rows, 'home', {}, now)!;
  assert.equal(detail.seasons.length, 4); assert.equal(detail.currentSeason, '2026/27');
  assert.equal(detail.seasons.find(row => row.season === '2025/26')!.sample, 9);
  assert.equal(detail.seasons.find(row => row.season === '2026/27')!.sample, 0);
  assert.ok(detail.matches.every(row => row.venue === 'home' && row.opponent === 'Unit Away'));
  assert.equal(htftTeamDetail(rows, 'home', { transition: '2/1' }, now)!.matches[0].madeComeback, true);
  assert.equal(htftTeamDetail(rows, 'away', { transition: '2/1' }, now)!.matches[0].concededComeback, true);
});

test('upcoming comparison never treats future or unknown same-day ordering as prior form', () => {
  const played = Array.from({ length: 11 }, (_, index) => match(`2026-11-${String(index + 1).padStart(2, '0')}`));
  played[9].ht = { home: null, away: null };
  const future = { ...match('2026-11-16', { status: 'scheduled', htHome: null, htAway: null, ftHome: null, ftAway: null }), id: 'future' };
  const value = previewHtftMatch(played.concat(future), 'future', now)!;
  assert.equal(value.home.last5.played, 5); assert.equal(value.home.last5.sample, 4);
  assert.equal(value.home.last10.played, 10); assert.equal(value.home.last10.sample, 9);
  assert.equal(value.home.season.played, 11); assert.equal(value.h2hSample, 11);
  const sameDay = { ...future, matchDate: '2026-11-11' };
  assert.equal(previewHtftMatch([...played, sameDay], 'future', now)!.home.all.played, 10);
  assert.equal(previewHtftMatch([...played, future, { ...future, id: 'future-result', status: 'finished', ht: { home: 0, away: 1 }, ft: { home: 2, away: 1 } }], 'future', now)!.home.all.played, 11);
});

test('English schedule uses archive matchDate without inventing UTC, excludes other leagues and paginates', async () => {
  const db = await memory();
  try {
    for (let index = 0; index < 55; index++) await ingestMatch(db, observation('2026-11-15', { id: `scheduled-${index}`, homeTeam: `Home ${index}`, awayTeam: `Away ${index}`, status: 'scheduled', htHome: null, htAway: null, ftHome: null, ftAway: null }));
    await ingestMatch(db, observation('2026-11-22', { id: 'outside', homeTeam: 'Outside', status: 'scheduled', htHome: null, htAway: null, ftHome: null, ftAway: null }));
    const value = await htftSchedule(db, '2026-11-15', 7, {}, now);
    assert.equal(value.total, 55); assert.equal(value.matches.length, 50); assert.equal(value.to, '2026-11-21'); assert.equal(value.hasMore, true);
    assert.ok(value.matches.every(row => row.kickoffAt === null));
    assert.equal((await htftSchedule(db, '2026-11-15', 7, { offset: 50 }, now)).matches.length, 5);
    assert.ok(value.coverage.filter(row => row.tier >= 6).every(row => row.seasonMatches === 0 && !!row.reason));
    assert.equal((await htftSchedule(db, '2026-10-25', 7, {}, now)).to, '2026-10-31');
    await assert.rejects(htftSchedule(db, '2026-02-30', 7));
    await assert.rejects(htftSchedule(db, '2026-11-15', 8));
  } finally { await db.close(); }
});

test('HT/FT API is private/read-only and rejects guests before opening the database', async () => {
  const db = await memory();
  try {
    const results: string[] = [];
    for (const action of ['htft-ranking', 'htft-transitions', 'htft-team', 'htft-schedule', 'htft-match']) {
      let opened = false;
      const handler = createAnalyticsHandler(async () => false, async () => { opened = true; return db; }, () => false);
      const response: any = { statusCode: 0, setHeader() {}, end() {} };
      await handler({ method: 'GET', url: `/api/football-analytics?action=${action}`, headers: {} } as any, response);
      assert.equal(response.statusCode, 403); assert.equal(opened, false);
    }
    await ingestMatch(db, observation());
    const readonly = { ...db, query: async (sql: string, values?: unknown[]) => { assert.match(sql, /^SELECT/); return db.query(sql, values); } };
    const handler = createAnalyticsHandler(async () => true, async () => readonly, () => false);
    for (const url of ['htft-ranking', 'htft-transitions&transition=2%2F1', 'htft-schedule&date=2026-11-15&days=7']) {
      const response: any = { statusCode: 0, setHeader() {}, end(value: string) { results.push(value); } };
      await handler({ method: 'GET', url: `/api/football-analytics?action=${url}`, headers: {} } as any, response);
      assert.equal(response.statusCode, 200);
    }
    assert.equal(JSON.parse(results[0]).aggregate.withHtFt, 1);
  } finally { await db.close(); }
});

const source = (records: MatchObservation[]): typeof loadHistoricalDataset => async (league, season) => inspectDataset(league === 'league-one' ? records : [], row => row, { league, season, provider: 'manual', sourceUrl: 'https://unit.test', license: 'Explicit memory test', warnings: [] });

test('daily plan is dry-run; explicit daily sync is bounded, deduplicated and never publishes tickets', async () => {
  const db = await memory();
  const previous = [process.env.HISTORICAL_ANALYTICS_SYNC_ENABLED, process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED];
  try {
    const rows = [observation('2026-11-15', { status: 'scheduled', htHome: null, htAway: null, ftHome: null, ftAway: null })];
    const plan = await planHtftSync(db, { now, loader: source(rows) });
    assert.equal(plan.summary.create, 1); assert.equal(plan.summary.firestoreWrites, 0);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM fa_matches'))[0].n, 0);
    delete process.env.HISTORICAL_ANALYTICS_SYNC_ENABLED;
    assert.equal((await runDailyHtftSync(db, { now, loader: source(rows) })).skipped, true);
    process.env.HISTORICAL_ANALYTICS_SYNC_ENABLED = 'true'; process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED = 'true';
    const first = await runDailyHtftSync(db, { now, loader: source(rows) });
    assert.equal(first.skipped, false); assert.equal((first as any).created, 1);
    assert.equal((await runDailyHtftSync(db, { now, loader: source(rows) })).skipped, true);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM fa_matches'))[0].n, 1);
    assert.ok((await db.query("SELECT payload FROM fa_import_runs WHERE id=$1", [(first as any).id])).length);
  } finally {
    for (const [index, key] of ['HISTORICAL_ANALYTICS_SYNC_ENABLED', 'HISTORICAL_ANALYTICS_WRITE_ENABLED'].entries()) { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }
    await db.close();
  }
});

test('sports request cancellation does not fall through to fabricated data', async () => {
  const original = globalThis.fetch, controller = new AbortController();
  let calls = 0;
  try {
    globalThis.fetch = async (_url, options) => { calls++; return new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); };
    const request = historicalJson(new URL(`https://openfootball.github.io/england/abort-${Date.now()}.json`), {}, controller.signal);
    setTimeout(() => controller.abort(), 350);
    await assert.rejects(request); assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('daily sync records provider failures without inventing or publishing match rows', async () => {
  const db = await memory(), previous = [process.env.HISTORICAL_ANALYTICS_SYNC_ENABLED, process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED];
  try {
    process.env.HISTORICAL_ANALYTICS_SYNC_ENABLED = 'true'; process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED = 'true';
    const failed: typeof loadHistoricalDataset = async (...args) => ({ ...(await source([])(...args)), state: 'error', warnings: ['Explicit test outage'] });
    const run = await runDailyHtftSync(db, { now, loader: failed });
    assert.equal((run as any).status, 'error'); assert.match((run as any).error, /Nijedan sportski izvor/);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM fa_matches'))[0].n, 0);
    const stored = JSON.parse((await db.query('SELECT payload FROM fa_import_runs WHERE id=$1', [(run as any).id]))[0].payload);
    assert.equal(stored.datasets.length, 11); assert.equal(stored.status, 'error');
  } finally {
    for (const [index, key] of ['HISTORICAL_ANALYTICS_SYNC_ENABLED', 'HISTORICAL_ANALYTICS_WRITE_ENABLED'].entries()) { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }
    await db.close();
  }
});

test('automatic sync refuses a changed-match budget overflow before writing any matches', async () => {
  const db = await memory(), previous = [process.env.HISTORICAL_ANALYTICS_SYNC_ENABLED, process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED];
  try {
    process.env.HISTORICAL_ANALYTICS_SYNC_ENABLED = 'true'; process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED = 'true';
    const records = Array.from({ length: 201 }, (_, index) => observation('2026-11-15', { id: `budget-${index}`, homeTeam: `Budget Home ${index}`, awayTeam: `Budget Away ${index}`, status: 'scheduled', htHome: null, htAway: null, ftHome: null, ftAway: null }));
    const run = await runDailyHtftSync(db, { now, loader: source(records) });
    assert.equal((run as any).status, 'error'); assert.match((run as any).error, /budžet/);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM fa_matches'))[0].n, 0);
  } finally {
    for (const [index, key] of ['HISTORICAL_ANALYTICS_SYNC_ENABLED', 'HISTORICAL_ANALYTICS_WRITE_ENABLED'].entries()) { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }
    await db.close();
  }
});

test('daily sync prefers real football-data results over a stale available archive and catches older missing FT', async () => {
  const db = await memory(), previous = process.env.FOOTBALL_DATA_API_KEY;
  try {
    process.env.FOOTBALL_DATA_API_KEY = 'explicit-unit-test-key';
    const unfinished = { ...observation('2026-09-25', { status: 'scheduled', htHome: null, htAway: null, ftHome: null, ftAway: null }), league: { sourceId: 'PL', name: 'Premier League', country: 'England', tier: 1 } };
    await ingestMatch(db, unfinished);
    const complete = { ...unfinished, status: 'finished' as const, ht: { home: 0, away: 1 }, ft: { home: 2, away: 1 } };
    const calls: string[] = [];
    const loader: typeof loadHistoricalDataset = async (league, season, provider) => {
      calls.push(String(provider));
      const value = inspectDataset([provider === 'football-data.org' ? complete : unfinished], row => row, { league, season, provider: provider === 'football-data.org' ? 'football-data.org' : 'openfootball', sourceUrl: 'https://unit.test', license: 'Explicit memory test', warnings: [] });
      return { ...value, rejected: provider === 'football-data.org' ? 1 : 0 };
    };
    const plan = await planHtftSync(db, { now, league: 'premier-league', loader });
    assert.deepEqual(calls, ['auto', 'football-data.org']);
    assert.equal(plan.summary.update, 1); assert.equal(plan.summary.create, 0); assert.equal(plan.summary.rejected, 1);
    assert.equal(plan.datasets[0].records[0].ft.home, 2);
    assert.equal((await db.query('SELECT payload FROM fa_matches'))[0].payload.includes('"status":"scheduled"'), true);
  } finally {
    if (previous === undefined) delete process.env.FOOTBALL_DATA_API_KEY; else process.env.FOOTBALL_DATA_API_KEY = previous;
    await db.close();
  }
});
