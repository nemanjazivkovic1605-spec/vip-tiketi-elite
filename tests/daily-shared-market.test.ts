import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDailyCandidates } from '../server/dailyPickProvider.ts';
import { buildCandidates, type Odds } from '../server/dailyPickSelection.ts';
import { buildDailyProposals, mapOddsFixture, proposalOffers, bestProposalOffer } from '../server/dailyProposalProvider.ts';
import { dailyReservation, publishDailyCandidates, selectDailyPublicationCandidates } from '../server/dailyPublication.ts';
import { mapVerifiedOdds } from '../server/oddsProvider.ts';
import { cachedSportsJson } from '../server/freeFootballFeeds.ts';
import { isFreshOddsTimestamp } from '../server/oddsPolicy.ts';
import { MemoryFirestore } from './helpers/memoryFirestore.ts';

const date = '2097-11-13', now = new Date(`${date}T08:00:00Z`);
const sport = { key: 'soccer_uefa_euro_qualification', title: 'Euro Qualification', active: true, has_outrights: false };
const event = (id: number) => ({ id: String(id), sport_key: sport.key, home_team: `Host ${id}`, away_team: `Visitor ${id}`,
  commence_time: `${date}T19:00:00Z`, bookmakers: [
    { title: 'Lower actual price', last_update: now.toISOString(), markets: [
      { key: 'h2h', outcomes: [{ name: `Host ${id}`, price: 1.6 }] },
      { key: 'totals', outcomes: [{ name: 'Over', point: 2.5, price: 1.7 }, { name: 'Under', point: 3.5, price: 1.4 }] },
    ] },
    { title: 'Higher actual price', last_update: now.toISOString(), markets: [
      { key: 'h2h', outcomes: [{ name: `Host ${id}`, price: 1.8 }] },
      { key: 'totals', outcomes: [{ name: 'Over', point: 2.5, price: 2.1 }, { name: 'Under', point: 3.5, price: 1.6 }] },
    ] },
  ] });
const undefinedFree = (value: unknown): void => {
  assert.notEqual(value, undefined);
  if (Array.isArray(value)) value.forEach(undefinedFree);
  else if (value && Object.getPrototypeOf(value) === Object.prototype) Object.values(value).forEach(undefinedFree);
};

test('wide odds discovery supplies one FREE and two VIP singles without inventing statistics or analysis', async () => {
  const previous = globalThis.fetch;
  const env = { ODDS_API_KEY: process.env.ODDS_API_KEY, API_FOOTBALL_ENABLED: process.env.API_FOOTBALL_ENABLED, FOOTBALL_DATA_API_KEY: process.env.FOOTBALL_DATA_API_KEY };
  process.env.ODDS_API_KEY = 'unit-shared-market-only';
  process.env.API_FOOTBALL_ENABLED = 'false'; delete process.env.FOOTBALL_DATA_API_KEY;
  let oddsCalls = 0;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/odds/')) { oddsCalls++; return new Response(JSON.stringify([1, 2, 3, 4].map(event))); }
    if (url.pathname === '/v4/sports/') return new Response(JSON.stringify([sport]));
    if (url.pathname.endsWith('/events/')) return new Response(JSON.stringify([1, 2, 3, 4].map(event)));
    return new Response(JSON.stringify(url.hostname.includes('thesportsdb') ? { events: [] } : []));
  };
  try {
    const data = await loadDailyCandidates(date, now);
    assert.equal(data.fixtures, 4, 'does not use the unrelated three-event free feed as its primary source');
    assert.ok(data.candidates.length >= 3);
    assert.ok(data.candidates.every(pick => pick.analysisSource === 'market-odds' && pick.confidence === undefined && !pick.analysis && !pick.reasoning));
    const picks = selectDailyPublicationCandidates(date, data.candidates, [], now);
    assert.deepEqual(picks.map(pick => pick.access), ['FREE', 'VIP', 'VIP']);
    assert.equal(new Set(picks.map(pick => pick.fixtureId)).size, 3);
    assert.equal(new Set(picks.map(pick => pick.marketCategory)).size, 3);
    assert.equal(picks[0].odds, 1.8, 'market-only ranking targets a moderate real price, not the shortest possible quote');
    for (const pick of picks) assert.equal(pick.odds, ({ '1': 1.8, 'Over 2.5': 2.1, 'Under 3.5': 1.6 } as Record<string, number>)[pick.prediction]);
    const db = new MemoryFirestore();
    assert.equal((await publishDailyCandidates(db as any, date, data.candidates, now)).saved, 3);
    for (const [path, value] of db.documents) {
      undefinedFree(value);
      if (path.startsWith('publicDailyAnalyses/')) {
        assert.equal(value.locked, true); assert.equal(value.prediction, undefined); assert.equal(value.odds, undefined); assert.equal(value.analysis, undefined);
      }
    }
    assert.equal([...db.documents.keys()].filter(path => path.startsWith('freeDailyAnalyses/')).length, 1);
    assert.equal([...db.documents.keys()].filter(path => path.startsWith('publicDailyAnalyses/')).length, 2);
    assert.equal((await publishDailyCandidates(db as any, date, data.candidates, now)).saved, 0);
    await loadDailyCandidates(date, now);
    assert.equal(oddsCalls, 1, 'daily/product-compatible discovery shares the same cached quote request');
  } finally {
    globalThis.fetch = previous;
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('the highest quote uses the exact market and line, not stale, future, another game or half-time prices', () => {
  const raw = event(1), fixture = mapOddsFixture(raw, sport)!;
  raw.bookmakers.push({ title: 'Stale high', last_update: `${date}T07:30:00Z`, markets: [{ key: 'h2h', outcomes: [{ name: 'Host 1', price: 2.8 }] }] });
  raw.bookmakers.push({ title: 'Old market behind fresh bookmaker', last_update: now.toISOString(), markets: [
    { key: 'h2h', last_update: `${date}T07:30:00Z`, outcomes: [{ name: 'Host 1', price: 2.9 }] } as any,
  ] });
  raw.bookmakers.push({ title: 'Future', last_update: `${date}T09:00:00Z`, markets: [{ key: 'h2h', outcomes: [{ name: 'Host 1', price: 2.95 }] }] });
  const mapped = mapVerifiedOdds(fixture, [raw], sport.key, now);
  const offer = bestProposalOffer(proposalOffers(fixture, mapped, now), '1');
  assert.equal(offer!.odds, 1.8);
  assert.equal(bestProposalOffer(proposalOffers(fixture, mapped, now), 'Over 4.5'), undefined);
  assert.deepEqual(mapVerifiedOdds(fixture, [{ ...raw, home_team: 'Host 1 U21' }], sport.key, now), []);
  assert.equal(isFreshOddsTimestamp(undefined, now), false);
});

test('models compare every matching quote, including duplicates, and do not hide the highest price behind a risk cap', () => {
  const fixture = mapOddsFixture(event(1), sport)!;
  const model = { teams: { home: { id: fixture.teams.home.id }, away: { id: fixture.teams.away.id } },
    predictions: { winner: { id: fixture.teams.home.id }, percent: { home: '70%', draw: '20%', away: '10%' } } };
  const odds: Odds[] = [{ fixture: { id: fixture.fixture.id }, update: now.toISOString(), bookmakers: [{ id: 1, name: 'Actual', bets: [
    { name: 'Match Winner', values: [{ value: 'Home', odd: '1.8' }, { value: 'Home', odd: '2.1' }] },
  ] }] }];
  assert.equal(buildCandidates(fixture, odds, model, now)[0].odds, 2.1);
  odds[0].bookmakers[0].bets[0].values.push({ value: 'Home', odd: '3.8' });
  assert.equal(buildCandidates(fixture, odds, model, now).length, 0, 'skip the out-of-range market instead of falsely publishing a lower quote as best');
  const proposal = buildDailyProposals([fixture], odds, now)[0];
  assert.equal(proposal.analysis.odds, 0);
});

test('publication rejects aged quotes and recognizes an already reserved match from another provider', () => {
  const fixture = mapOddsFixture(event(1), sport)!, proposal = buildDailyProposals([fixture], mapVerifiedOdds(fixture, [event(1)], sport.key, now), now)[0];
  const candidate = { ...proposal.analysis, selectionScore: 0, bookmaker: proposal.bookmaker!, oddsUpdatedAt: proposal.oddsUpdatedAt };
  assert.equal(selectDailyPublicationCandidates(date, [candidate], [], new Date(`${date}T08:16:00Z`)).length, 0);
  const reserved = dailyReservation('existing-manual', { ...candidate, fixtureId: 900, access: 'VIP' });
  assert.equal(selectDailyPublicationCandidates(date, [candidate], [reserved], now).length, 0);
});

test('a short freshness request cannot reuse a longer-lived cached response', async () => {
  const original = globalThis.fetch, originalNow = Date.now;
  let time = originalNow(), calls = 0;
  Date.now = () => time;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ calls })); };
  try {
    const url = new URL('https://cache-test.example/quotes');
    await cachedSportsJson(url, {}, 30 * 60000);
    time += 6 * 60000;
    await cachedSportsJson(url, {}, 5 * 60000);
    assert.equal(calls, 2);
  } finally { Date.now = originalNow; globalThis.fetch = original; }
});
