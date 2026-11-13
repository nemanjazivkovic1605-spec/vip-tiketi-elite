import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCandidate, buildCandidates, isUpcomingFixture, selectDailyPicks, type Fixture, type Odds, type Prediction } from '../server/dailyPickSelection.ts';
import { applyDailyResult, publicationSlots, publishDailyCandidates } from '../server/dailyPublication.ts';
import { evaluateFullTimePrediction } from '../src/utils/predictionResults.ts';
import { isCronRequest } from '../server/adminAuth.ts';
import { validateFootballRequest } from '../server/footballData.ts';
import dailyHandler from '../api/daily-picks.ts';
import { fullTimeFixtureScore, footballDataRegularScore } from '../server/resultScores.ts';

const now = new Date('2099-11-10T08:00:00Z');
const fixture = (id = 1, league = 912): Fixture => ({
  fixture: { id, date: '2099-11-10T18:00:00Z', status: { short: 'NS' } },
  league: { id: league, name: 'Regional Division', country: 'Serbia' },
  teams: { home: { id: id * 2, name: `Home ${id}` }, away: { id: id * 2 + 1, name: `Away ${id}` } },
});
const odds = (id = 1, value = '1.65'): Odds[] => [{ fixture: { id }, update: now.toISOString(), bookmakers: [{ id: 6, name: 'Example bookmaker', bets: [
  { name: 'Double Chance', values: [{ value: 'Home/Draw', odd: value }] },
] }] }];
const model = (id = 1): Prediction => ({
  teams: { home: { id: id * 2 }, away: { id: id * 2 + 1 } },
  predictions: { winner: { id: id * 2 }, win_or_draw: true, percent: { home: '50%', draw: '25%', away: '25%' } },
});
const candidate = (id = 1, league = 912) => buildCandidate(fixture(id, league), odds(id), model(id), now)!;

// A transactional test store records complete projections and serializes overlapping invocations.
class MemoryFirestore {
  documents = new Map<string, any>();
  private queue = Promise.resolve();
  collection(name: string) {
    return { doc: (id: string) => ({ path: `${name}/${id}`, id }), where: (field: string, op: string, value: any) => ({ collection: name, field, op, value }) };
  }
  snapshot(ref: any) {
    if (ref.collection) return { docs: [...this.documents].filter(([path, data]) => path.startsWith(`${ref.collection}/`) && data[ref.field] === ref.value)
      .map(([path, data]) => ({ id: path.split('/')[1], exists: true, data: () => data })) };
    const data = this.documents.get(ref.path);
    return { id: ref.id, exists: data !== undefined, data: () => data };
  }
  runTransaction<T>(run: (transaction: any) => Promise<T>): Promise<T> {
    const task = this.queue.then(async () => {
      const writes: Array<() => void> = [];
      const transaction = {
        get: async (ref: any) => this.snapshot(ref),
        getAll: async (...refs: any[]) => refs.map((ref) => this.snapshot(ref)),
        create: (ref: any, data: any) => { assert.equal(this.documents.has(ref.path), false); writes.push(() => this.documents.set(ref.path, data)); },
        set: (ref: any, data: any, options?: any) => writes.push(() => this.documents.set(ref.path, options?.merge ? { ...this.documents.get(ref.path), ...data } : data)),
        update: (ref: any, data: any) => writes.push(() => this.documents.set(ref.path, { ...this.documents.get(ref.path), ...data })),
        delete: (ref: any) => writes.push(() => { this.documents.delete(ref.path); }),
      };
      const result = await run(transaction);
      writes.forEach((write) => write());
      return result;
    });
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }
}

test('accepts lower leagues and uses the provider prediction and actual bookmaker price', () => {
  const value = candidate();
  assert.equal(value.leagueId, 912);
  assert.equal(value.prediction, '1X');
  assert.equal(value.odds, 1.65);
  assert.equal(value.confidence, 75);
  assert.equal(value.date, '2099-11-10');
  assert.equal(value.time, '19:00');
  assert.match(value.reasoning, /Home 1 - Away 1/);
  assert.match(value.reasoning, /75%/);
});

test('excludes started, completed, postponed and imminent fixtures', () => {
  for (const status of ['FT', 'LIVE', '1H', 'PST', 'TBD']) {
    const item = fixture(); item.fixture.status.short = status;
    assert.equal(isUpcomingFixture(item, now), false);
  }
  const item = fixture(); item.fixture.date = '2099-11-10T08:10:00Z';
  assert.equal(buildCandidate(item, odds(), model(), now), null);
});

test('does not invent a pick when probabilities or bookmaker odds are missing', () => {
  assert.equal(buildCandidate(fixture(), [], model(), now), null);
  assert.equal(buildCandidate(fixture(), odds(), {}, now), null);
  const wrong = model(); wrong.teams!.home!.id = 999;
  assert.equal(buildCandidate(fixture(), odds(), wrong, now), null);
  const invalid = model(); invalid.predictions!.percent!.home = 'not available';
  assert.equal(buildCandidate(fixture(), odds(), invalid, now), null);
});

test('does not confuse first half odds or another fixture with the full time market', () => {
  const offers = odds(); offers[0].bookmakers[0].bets[0].name = 'Double Chance First Half';
  assert.equal(buildCandidate(fixture(), offers, model(), now), null);
  assert.equal(buildCandidate(fixture(), odds(999), model(), now), null);
});

test('uses the best actual price for the same pick and omits bookmaker names from public analysis', () => {
  const lower = odds(1, '1.80');
  lower[0].bookmakers[0].name = 'Alpha bookmaker';
  const higher = odds(1, '2.10');
  higher[0].bookmakers[0].name = 'Zulu bookmaker';
  const stale = odds(1, '2.50');
  stale[0].update = '2099-11-09T08:00:00Z';
  const pick = buildCandidate(fixture(), [...lower, ...higher, ...stale], model(), now)!;
  assert.equal(pick.prediction, '1X');
  assert.equal(pick.odds, 2.10);
  assert.equal(pick.bookmaker, 'Zulu bookmaker');
  assert.ok(!pick.reasoning.includes('Zulu bookmaker'));
  assert.equal(buildCandidate(fixture(), lower, model(), now)!.odds, 1.80);
});

test('chooses one FREE and two VIP picks with unique fixtures and league diversity', () => {
  const values = [candidate(1, 912), candidate(2, 912), candidate(3, 41), candidate(4, 42)];
  const picks = selectDailyPicks(values, ['FREE', 'VIP', 'VIP']);
  assert.deepEqual(picks.map((item) => item.access), ['FREE', 'VIP', 'VIP']);
  assert.equal(new Set(picks.map((item) => item.fixtureId)).size, 3);
  assert.equal(new Set(picks.map((item) => item.leagueId)).size, 3);
  assert.equal(selectDailyPicks([candidate()], ['FREE', 'VIP', 'VIP']).length, 1);
});

test('goal and BTTS markets require real averages, real odds and positive model value', () => {
  const prediction = model();
  for (const team of [prediction.teams!.home!, prediction.teams!.away!]) team.league = {
    fixtures: { played: { total: 10 } }, goals: { for: { average: { total: '1.7' } }, against: { average: { total: '1.4' } } },
  };
  const prices = odds();
  prices[0].bookmakers[0].bets.push(
    { name: 'Goals Over/Under', values: [{ value: 'Over 1.5', odd: '1.40' }, { value: 'Over 2.5', odd: '1.85' }, { value: 'Under 3.5', odd: '1.90' }] },
    { name: 'Both Teams Score', values: [{ value: 'Yes', odd: '1.90' }] },
  );
  const candidates = buildCandidates(fixture(), prices, prediction, now);
  assert.ok(candidates.some((item) => item.prediction === 'GG'));
  assert.ok(candidates.some((item) => item.prediction === 'Over 2.5'));
  assert.ok(candidates.every((item) => item.selectionScore > 0));
  assert.deepEqual(buildCandidates(fixture(), prices, model(), now).map((item) => item.prediction), ['1X']);
  assert.equal(buildCandidates(fixture(), [], prediction, now).length, 0);
});

test('VIP slots reject prices below 1.20 and prefer different available market categories', () => {
  const candidates = [
    { ...candidate(1), marketCategory: 'goals' }, { ...candidate(2), marketCategory: 'goals' },
    { ...candidate(3), marketCategory: 'btts' }, { ...candidate(4), marketCategory: 'double_chance' },
    { ...candidate(5), marketCategory: 'result', odds: 1.18, confidence: 95, selectionScore: 0 },
  ];
  const picks = selectDailyPicks(candidates, ['FREE', 'VIP', 'VIP']);
  assert.equal(new Set(picks.map((item) => item.marketCategory)).size, 3);
  assert.ok(picks.filter((item) => item.access === 'VIP').every((item) => item.odds >= 1.2));
});

test('publishes consistent private, FREE and locked public projections atomically', async () => {
  const db = new MemoryFirestore();
  const result = await publishDailyCandidates(db as any, '2099-11-10', [candidate(1), candidate(2), candidate(3)], now);
  assert.equal(result.saved, 3);
  const free = db.documents.get('freeDailyAnalyses/api-football-1');
  assert.equal(free.access, 'FREE');
  assert.equal(free.vipAnalysis, undefined);
  assert.equal(free.publishedAt, now.toISOString());
  const vip = db.documents.get('publicDailyAnalyses/api-football-2');
  assert.deepEqual(Object.keys(vip).sort(), ['date', 'id', 'league', 'locked', 'sport', 'status', 'time', 'type']);
  const publicTicket = db.documents.get('publicTickets/daily-api-football-2');
  assert.equal(publicTicket.locked, true);
  assert.equal(publicTicket.matches[0].prediction, '');
  assert.equal(publicTicket.analysis, '');
  assert.equal(db.documents.get('tickets/daily-api-football-2').matches[0].prediction, '1X');
});

test('overlapping executions do not duplicate or replace existing published picks', async () => {
  const db = new MemoryFirestore();
  const values = [candidate(1), candidate(2), candidate(3), candidate(4)];
  const runs = await Promise.all([publishDailyCandidates(db as any, '2099-11-10', values, now), publishDailyCandidates(db as any, '2099-11-10', values, now)]);
  assert.equal(runs.reduce((sum, run) => sum + run.saved, 0), 3);
  assert.equal([...db.documents.keys()].filter((key) => key.startsWith('dailyAnalyses/')).length, 3);
});

test('manual edits, hiding and admin deletion survive the next automatic run', async () => {
  const db = new MemoryFirestore();
  const values = [candidate(1), candidate(2), candidate(3), candidate(4), candidate(5)];
  await publishDailyCandidates(db as any, '2099-11-10', values, now);
  const edited = db.documents.get('dailyAnalyses/api-football-1');
  db.documents.set('dailyAnalyses/api-football-1', { ...edited, prediction: 'NG', odds: 2.2, manualOverride: true, hidden: true });
  db.documents.delete('dailyAnalyses/api-football-2');
  db.documents.delete('tickets/daily-api-football-2');
  const repeated = await publishDailyCandidates(db as any, '2099-11-10', values, now);
  assert.equal(repeated.saved, 0);
  assert.equal(db.documents.get('dailyAnalyses/api-football-1').prediction, 'NG');
  assert.equal(db.documents.has('dailyAnalyses/api-football-2'), false);
});

test('does not overwrite a manually moved match outside the requested date', async () => {
  const db = new MemoryFirestore();
  const edited = { ...candidate(), date: '2099-11-11', prediction: 'NG', manualOverride: true };
  db.documents.set('dailyAnalyses/api-football-1', edited);
  const result = await publishDailyCandidates(db as any, '2099-11-10', [candidate()], now);
  assert.equal(result.saved, 0);
  assert.equal(db.documents.get('dailyAnalyses/api-football-1'), edited);
});

test('skips a delayed publication after kickoff instead of backdating it', async () => {
  const db = new MemoryFirestore();
  const result = await publishDailyCandidates(db as any, '2099-11-10', [candidate()], new Date('2099-11-10T18:01:00Z'));
  assert.equal(result.saved, 0);
  assert.equal(db.documents.size, 0);
});

test('manual picks consume the daily slots too', () => {
  assert.deepEqual(publicationSlots([{ id: 'manual', access: 'FREE' }]), ['VIP', 'VIP']);
});

test('settles from the latest edited prediction and strips VIP text from public history', async () => {
  const db = new MemoryFirestore();
  await publishDailyCandidates(db as any, '2099-11-10', [candidate(1), candidate(2)], now);
  const original = db.documents.get('dailyAnalyses/api-football-2');
  db.documents.set('dailyAnalyses/api-football-2', { ...original, prediction: 'NG', manualOverride: true });
  assert.equal(await applyDailyResult(db as any, original, { fixtureStatus: 'FT', homeScore: 1, awayScore: 0, finished: true, postponed: false }, evaluateFullTimePrediction as any), true);
  assert.equal(db.documents.get('dailyAnalyses/api-football-2').status, 'WON');
  assert.equal(db.documents.get('tickets/daily-api-football-2').matches[0].prediction, 'NG');
  const publicTicket = db.documents.get('publicStatsTickets/daily-api-football-2');
  assert.equal(publicTicket.analysis, '');
  assert.equal(publicTicket.matches[0].analysis, '');
});

test('does not replace a manual result saved while a provider request was in flight', async () => {
  const db = new MemoryFirestore();
  await publishDailyCandidates(db as any, '2099-11-10', [candidate()], now);
  const original = db.documents.get('dailyAnalyses/api-football-1');
  db.documents.set('dailyAnalyses/api-football-1', { ...original, resultManualOverride: true, result: '2:2' });
  assert.equal(await applyDailyResult(db as any, original, { fixtureStatus: 'FT', homeScore: 1, awayScore: 0, finished: true, postponed: false }, evaluateFullTimePrediction as any), false);
  assert.equal(db.documents.get('dailyAnalyses/api-football-1').result, '2:2');
});

test('NG and push settlement use the same full time rules', () => {
  assert.equal(evaluateFullTimePrediction('NG', 1, 0), 'WON');
  assert.equal(evaluateFullTimePrediction('NG', 0, 2), 'WON');
  assert.equal(evaluateFullTimePrediction('NG', 1, 1), 'LOST');
  assert.equal(evaluateFullTimePrediction('Over 2', 2, 0), 'REFUND');
  assert.equal(evaluateFullTimePrediction('Under 2.5', 1, 1), 'WON');
  assert.equal(evaluateFullTimePrediction('handicap unknown', 1, 1), undefined);
  assert.equal(evaluateFullTimePrediction('1', undefined, 0), undefined);
});

test('does not settle a 90-minute pick using extra-time goals or incomplete scores', () => {
  assert.deepEqual(fullTimeFixtureScore({ fixture: { status: { short: 'AET' } }, goals: { home: 2, away: 1 } }), { homeScore: null, awayScore: null });
  assert.deepEqual(fullTimeFixtureScore({ fixture: { status: { short: 'PEN' } }, score: { fulltime: { home: 1, away: 1 } }, goals: { home: 5, away: 4 } }), { homeScore: 1, awayScore: 1 });
  assert.deepEqual(footballDataRegularScore({ duration: 'EXTRA_TIME', fullTime: { home: 2, away: 1 } }), { home: null, away: null });
  assert.deepEqual(footballDataRegularScore({ duration: 'EXTRA_TIME', regularTime: { home: 1, away: 1 }, fullTime: { home: 2, away: 1 } }), { home: 1, away: 1 });
  assert.deepEqual(fullTimeFixtureScore({ goals: { home: 1, away: null } }), { homeScore: null, awayScore: null });
});

test('cron authentication fails closed, including Vercel user-agent spoofing', async () => {
  delete process.env.CRON_SECRET;
  assert.equal(isCronRequest({ headers: { 'user-agent': 'vercel-cron/1.0' } } as any), false);
  let body = '', status = 0;
  await dailyHandler({ method: 'GET', url: '/api/daily-picks', headers: {} } as any,
    { setHeader() {}, set statusCode(value: number) { status = value; }, end(value: string) { body = value; } } as any);
  assert.equal(status, 403);
  assert.match(body, /autorizacija/);
  process.env.CRON_SECRET = 'unit-test-only';
  assert.equal(isCronRequest({ headers: { authorization: 'Bearer unit-test-only' } } as any), true);
  delete process.env.CRON_SECRET;
});

test('public sports proxy rejects unsupported paths, malformed dates and arbitrary hosts', () => {
  for (const path of ['https://example.com', '/users', '/competitions/../../admin']) {
    assert.throws(() => validateFootballRequest(new URL(`https://test/api/football-data?path=${encodeURIComponent(path)}`)));
  }
  assert.throws(() => validateFootballRequest(new URL('https://test/api/football-data?dateFrom=2099-02-30')));
  assert.equal(validateFootballRequest(new URL('https://test/api/football-data?dateFrom=2099-11-10&dateTo=2099-11-10')).path, '/matches');
});
