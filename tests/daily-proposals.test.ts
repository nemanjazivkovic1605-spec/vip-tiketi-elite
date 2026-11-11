import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyProposals, loadAdminDailyProposals, mapOddsFixture } from '../server/dailyProposalProvider.ts';
import { saveDailyProposals } from '../server/dailyProposalsStore.ts';
import { buildCandidates } from '../server/dailyPickSelection.ts';
import { mapVerifiedOdds, oddsSportForFixture } from '../server/oddsProvider.ts';
import handler from '../api/daily-picks.ts';

const now = new Date('2099-11-10T10:00:00Z');
const sport = { key: 'soccer_uefa_nations_league', title: 'UEFA Nations League' };
const event = (id = 1) => ({ id: String(id), sport_key: sport.key, home_team: `Home ${id}`, away_team: `Away ${id}`, commence_time: '2099-11-10T23:30:00Z',
  bookmakers: [{ title: 'Actual bookmaker', last_update: now.toISOString(), markets: [
    { key: 'h2h', outcomes: [{ name: `Home ${id}`, price: 1.8 }, { name: `Away ${id}`, price: 3.5 }] },
    { key: 'totals', outcomes: [{ name: 'Over', point: 2.5, price: 1.82 }, { name: 'Under', point: 3.5, price: 1.75 }] },
  ] }] });

test('discovers leagues outside the old league-name allowlist and preserves Belgrade dates', () => {
  const fixture = mapOddsFixture(event(), sport)!;
  assert.equal(oddsSportForFixture(fixture), sport.key);
  const odds = mapVerifiedOdds(fixture, [event()], sport.key, now);
  const proposal = buildDailyProposals([fixture], odds, now)[0];
  assert.equal(proposal.date, '2099-11-11');
  assert.equal(proposal.analysis.time, '00:30');
  assert.equal(proposal.analysis.odds, 1.8);
  assert.equal(proposal.bookmaker, 'Actual bookmaker');
  assert.equal(proposal.analysis.confidence, undefined);
  assert.equal(proposal.analysis.reasoning, '');
  assert.equal(proposal.analysis.enabled, false);
  assert.equal(proposal.analysis.hidden, true);
  assert.equal(buildCandidates(fixture, odds, {}, now).length, 0, 'discovery does not weaken automatic publication requirements');
});

test('offers diverse markets, caps at ten unique fixtures and never invents missing prices', () => {
  const fixtures = Array.from({ length: 15 }, (_, index) => mapOddsFixture(event(index + 1), sport)!);
  const odds = fixtures.flatMap((fixture, index) => mapVerifiedOdds(fixture, [event(index + 1)], sport.key, now));
  const proposals = buildDailyProposals([...fixtures, fixtures[0]], odds, now);
  assert.equal(proposals.length, 10);
  assert.equal(new Set(proposals.map((item) => item.id)).size, 10);
  assert.ok(new Set(proposals.map((item) => item.analysis.prediction)).size > 1);
  const missing = buildDailyProposals([fixtures[0]], [], now)[0];
  assert.equal(missing.analysis.prediction, '');
  assert.equal(missing.analysis.odds, 0);
  const stale = buildDailyProposals([fixtures[0]], odds, new Date('2099-11-10T14:00:00Z'))[0];
  assert.equal(stale.analysis.odds, 0);
  assert.equal(mapOddsFixture({ ...event(), sport_key: 'basketball_nba' }, sport), null);
});

test('proposal writes are create-only, bounded, deduplicated, and never touch public/history/stats', async () => {
  const docs = new Map<string, any>();
  let published: any[] = [];
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }),
      where: () => ({ limit: () => ({ collection: name }) }) }),
    runTransaction: async (run: any) => run({
      get: async (ref: any) => ref.collection === 'dailyAnalyses'
        ? { docs: published.map((data) => ({ data: () => data })) }
        : { size: docs.size },
      getAll: async (...refs: any[]) => refs.map((ref) => ({ exists: docs.has(ref.path) })),
      create: (ref: any, data: any) => { assert.equal(docs.has(ref.path), false); docs.set(ref.path, data); },
    }),
  };
  const fixtures = [1, 2, 3].map((id) => mapOddsFixture(event(id), sport)!);
  const proposals = buildDailyProposals(fixtures, [], now);
  published = [proposals[0].analysis];
  assert.deepEqual(await saveDailyProposals(db as any, proposals[0].date, [...proposals, proposals[0]]), { saved: 2, existing: 1 });
  const path = `dailyProposals/${proposals[1].id}`;
  docs.set(path, { ...docs.get(path), dismissed: true, analysis: { prediction: 'Admin edit' } });
  assert.equal((await saveDailyProposals(db as any, proposals[0].date, proposals)).saved, 0);
  assert.equal(docs.get(path).analysis.prediction, 'Admin edit');
  assert.ok([...docs.keys()].every((key) => key.startsWith('dailyProposals/')));
});

test('manual proposal mode rejects guests and cron-only authorization', async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-only-secret';
  try {
    for (const authorization of [undefined, 'Bearer test-only-secret']) {
      let status = 0;
      await handler({ method: 'GET', url: '/api/daily-picks?mode=proposals', headers: { authorization } } as any,
        { setHeader() {}, set statusCode(value: number) { status = value; }, end() {} } as any);
      assert.equal(status, 403);
    }
  } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
});

test('discovery requests are cached and repeated pulls consume no additional odds requests', async () => {
  const previous = process.env.ODDS_API_KEY, original = globalThis.fetch;
  process.env.ODDS_API_KEY = 'unit-test-key';
  let calls = 0;
  const events = Array.from({ length: 10 }, (_, index) => event(index + 1));
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    return new Response(JSON.stringify(url.pathname === '/v4/sports/' ? [{ ...sport, active: true, has_outrights: false }]
      : url.pathname.endsWith('/events/') || url.pathname.endsWith('/odds/') ? events : []));
  };
  try {
    const first = await loadAdminDailyProposals('2099-11-11', now);
    assert.equal(first.proposals.length, 10);
    assert.equal(first.priced, 10);
    const before = calls;
    await loadAdminDailyProposals('2099-11-11', now);
    assert.equal(calls, before);
    assert.equal(calls, 3);
  } finally { globalThis.fetch = original; if (previous === undefined) delete process.env.ODDS_API_KEY; else process.env.ODDS_API_KEY = previous; }
});
