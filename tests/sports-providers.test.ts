import test from 'node:test';
import assert from 'node:assert/strict';
import { mapOpenLigaMatch, mapSportsDbEvent, mapFootballDataMatch, cachedSportsJson, teamKey } from '../server/freeFootballFeeds.ts';
import { loadIndependentOdds, mapVerifiedOdds, oddsSportForFixture } from '../server/oddsProvider.ts';
import { getSportsKey } from '../server/sportsApi.ts';
import { resultQueueCursor } from '../server/resultsQueue.ts';

const fixture = mapOpenLigaMatch({ matchID: 12, matchDateTimeUTC: '2099-11-10T19:00:00Z', leagueName: '1. Bundesliga', leagueShortcut: 'bl1',
  team1: { teamName: 'Bayern Munich' }, team2: { teamName: 'Borussia Dortmund' }, matchIsFinished: false, matchResults: [] })!;
const now = new Date('2099-11-10T10:00:00Z');
const event = { sport_key: 'soccer_germany_bundesliga', commence_time: fixture.fixture.date, home_team: 'Bayern Munich', away_team: 'Borussia Dortmund',
  bookmakers: [{ title: 'Real price source', last_update: now.toISOString(), markets: [{ key: 'totals', outcomes: [{ name: 'Over', point: 2.5, price: 1.85 }] }] }] };

test('free result sources keep regular-time scores, do not infer full time from a score', () => {
  assert.equal(mapSportsDbEvent({ idEvent: '1', strHomeTeam: 'Home', strAwayTeam: 'Away', strLeague: 'League', strTimestamp: '2099-11-10T10:00:00Z', intHomeScore: '2', intAwayScore: '1' })!.fixture.status.short, 'TBD');
  assert.equal(mapOpenLigaMatch({ matchID: 1, matchDateTimeUTC: '2099-11-10T19:00:00Z', leagueName: 'League', team1: { teamName: 'Home' }, team2: { teamName: 'Away' },
    matchIsFinished: true, matchResults: [{ resultTypeID: 1, pointsTeam1: 1, pointsTeam2: 0 }] })!.fixture.status.short, 'TBD');
  const item = mapFootballDataMatch({ id: 2, utcDate: '2099-11-10T19:00:00Z', status: 'FINISHED', competition: { name: 'Cup' }, homeTeam: { name: 'Home' }, awayTeam: { name: 'Away' },
    score: { duration: 'EXTRA_TIME', fullTime: { home: 3, away: 1 }, regularTime: { home: 1, away: 1 } } })!;
  assert.deepEqual(item.score.fulltime, { home: 1, away: 1 });
  assert.notEqual(fixture.fixture.id, 12, 'namespaced identity avoids collisions with API-Football fixture IDs');
});

test('odds are joined only to the same teams, sport and kickoff, never inferred', () => {
  assert.equal(mapVerifiedOdds(fixture, [event], event.sport_key, now)[0].bookmakers[0].bets[0].values[0].odd, '1.85');
  for (const changed of [{ away_team: 'Borussia Dortmund U21' }, { home_team: 'Bayern Munich Women' }, { commence_time: '2099-11-11T19:00:00Z' }, { sport_key: 'other' }]) {
    assert.deepEqual(mapVerifiedOdds(fixture, [{ ...event, ...changed }], event.sport_key, now), []);
  }
  assert.deepEqual(mapVerifiedOdds(fixture, [event, event], event.sport_key, now), []);
  assert.deepEqual(mapVerifiedOdds(fixture, [event], event.sport_key, new Date('2099-11-11T10:00:00Z')), []);
  assert.equal(oddsSportForFixture(fixture), event.sport_key);
  assert.equal(oddsSportForFixture({ ...fixture, league: { id: 2, name: '2. Bundesliga' } }), 'soccer_germany_bundesliga2');
  assert.equal(oddsSportForFixture({ ...fixture, league: { id: 3, name: 'Premier League', country: 'Bhutan' } }), null);
  assert.notEqual(teamKey('Australia U19'), teamKey('Australia'));
});

test('missing odds key makes no upstream request and suspended sports accounts can be disabled', async () => {
  const previous = process.env.ODDS_API_KEY, enabled = process.env.API_FOOTBALL_ENABLED;
  delete process.env.ODDS_API_KEY;
  process.env.API_FOOTBALL_ENABLED = 'false';
  try {
    const result = await loadIndependentOdds([fixture], now);
    assert.equal(result.odds.length, 0);
    assert.match(result.warning!, /ODDS_API_KEY/);
    assert.equal(getSportsKey(), '');
  } finally {
    if (previous !== undefined) process.env.ODDS_API_KEY = previous;
    if (enabled === undefined) delete process.env.API_FOOTBALL_ENABLED; else process.env.API_FOOTBALL_ENABLED = enabled;
  }
});

test('free feed cache coalesces repeated requests without Firestore writes', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ events: [] })); };
  try {
    const url = new URL('https://www.thesportsdb.com/api/v1/json/123/test-cache');
    await Promise.all([cachedSportsJson(url), cachedSportsJson(url)]);
    await cachedSportsJson(url);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('result pagination does not skip the second half of a due window or a timed-out batch', () => {
  const ids = Array.from({ length: 60 }, (_, index) => String(index).padStart(3, '0'));
  assert.equal(resultQueueCursor(ids, ids, ids[29]), ids[29]);
  assert.equal(resultQueueCursor(ids, ids, ids[4]), ids[4]);
  assert.equal(resultQueueCursor(ids, ids.slice(0, 20), ids[19]), ids[59]);
  assert.equal(resultQueueCursor(ids.slice(0, 3), ids.slice(0, 3), ids[2]), '');
});
