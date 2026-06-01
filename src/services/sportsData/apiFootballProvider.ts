import type { EnrichedMatchStats, SportsDataProvider, SportsMatchLookup } from './sportsDataProvider.js';
import { compactArray, requestJson, teamsMatch } from './providerUtils.js';
import { formatLeagueName } from '../../utils/leagueMapper.js';

type FootballFixture = {
  fixture?: { id?: number; date?: string };
  league?: { id?: number; name?: string; season?: number };
  teams?: { home?: { id?: number; name?: string }; away?: { id?: number; name?: string } };
  goals?: { home?: number | null; away?: number | null };
};

type BasketballGame = {
  id?: number;
  date?: string;
  league?: { name?: string };
  teams?: { home?: { name?: string }; away?: { name?: string } };
  scores?: unknown;
};

const FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';
const BASKETBALL_BASE_URL = 'https://v1.basketball.api-sports.io';

const getKey = () => process.env.API_FOOTBALL_KEY?.trim();

const requestApiSports = async <T>(
  baseUrl: string,
  path: string,
  params: Record<string, string>,
): Promise<T[] | null> => {
  const apiKey = getKey();
  if (!apiKey) return null;
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => value && url.searchParams.set(key, value));
  const response = await requestJson<{ response?: T[] }>(url, { 'x-apisports-key': apiKey });
  return response?.response || null;
};

const selectFootballFixture = (fixtures: FootballFixture[] | null, lookup: SportsMatchLookup) =>
  fixtures?.find((fixture) => teamsMatch(
    lookup.homeTeam,
    lookup.awayTeam,
    fixture.teams?.home?.name,
    fixture.teams?.away?.name,
  )) || fixtures?.[0];

const enrichFootball = async (lookup: SportsMatchLookup): Promise<EnrichedMatchStats | null> => {
  const fixtureParams = lookup.fixtureId ? { id: lookup.fixtureId } : { date: lookup.date || '' };
  const fixture = selectFootballFixture(
    await requestApiSports<FootballFixture>(FOOTBALL_BASE_URL, '/fixtures', fixtureParams),
    lookup,
  );
  const fixtureId = fixture?.fixture?.id;
  if (!fixtureId) return null;

  const homeId = fixture.teams?.home?.id;
  const awayId = fixture.teams?.away?.id;
  const leagueId = fixture.league?.id;
  const season = fixture.league?.season;
  const [
    statistics,
    h2h,
    homeLast,
    awayLast,
    injuries,
    odds,
    standings,
  ] = await Promise.all([
    requestApiSports<unknown>(FOOTBALL_BASE_URL, '/fixtures/statistics', { fixture: String(fixtureId) }),
    homeId && awayId
      ? requestApiSports<unknown>(FOOTBALL_BASE_URL, '/fixtures/headtohead', { h2h: `${homeId}-${awayId}`, last: '5' })
      : Promise.resolve(null),
    homeId ? requestApiSports<FootballFixture>(FOOTBALL_BASE_URL, '/fixtures', { team: String(homeId), last: '5' }) : Promise.resolve(null),
    awayId ? requestApiSports<FootballFixture>(FOOTBALL_BASE_URL, '/fixtures', { team: String(awayId), last: '5' }) : Promise.resolve(null),
    requestApiSports<unknown>(FOOTBALL_BASE_URL, '/injuries', { fixture: String(fixtureId) }),
    requestApiSports<unknown>(FOOTBALL_BASE_URL, '/odds', { fixture: String(fixtureId) }),
    leagueId && season
      ? requestApiSports<unknown>(FOOTBALL_BASE_URL, '/standings', { league: String(leagueId), season: String(season) })
      : Promise.resolve(null),
  ]);

  return {
    provider: 'API-Football',
    fixtureId: String(fixtureId),
    league: formatLeagueName(fixture.league?.name || lookup.league),
    date: fixture.fixture?.date || lookup.date,
    homeTeam: fixture.teams?.home?.name || lookup.homeTeam,
    awayTeam: fixture.teams?.away?.name || lookup.awayTeam,
    standings: compactArray(standings || undefined),
    lastMatches: {
      home: compactArray(homeLast || undefined),
      away: compactArray(awayLast || undefined),
    },
    h2h: compactArray(h2h || undefined),
    goalsForAgainst: fixture.goals,
    homeAwayForm: null,
    injuries: compactArray(injuries || undefined),
    odds: compactArray(odds || undefined),
    statistics: compactArray(statistics || undefined),
    xg: null,
  };
};

const enrichBasketball = async (lookup: SportsMatchLookup): Promise<EnrichedMatchStats | null> => {
  const gameParams = lookup.fixtureId ? { id: lookup.fixtureId } : { date: lookup.date || '' };
  const games = await requestApiSports<BasketballGame>(BASKETBALL_BASE_URL, '/games', gameParams);
  const game = games?.find((candidate) => teamsMatch(
    lookup.homeTeam,
    lookup.awayTeam,
    candidate.teams?.home?.name,
    candidate.teams?.away?.name,
  )) || games?.[0];
  if (!game?.id || !game.scores) return null;

  return {
    provider: 'API-Football',
    fixtureId: String(game.id),
    league: formatLeagueName(game.league?.name || lookup.league),
    date: game.date || lookup.date,
    homeTeam: game.teams?.home?.name || lookup.homeTeam,
    awayTeam: game.teams?.away?.name || lookup.awayTeam,
    statistics: { scores: game.scores },
  };
};

export const apiFootballProvider: SportsDataProvider = {
  id: 'API-Football',
  endpointLabel: 'api-sports fixtures/statistics',
  getEnrichedStats: async (lookup) => {
    if (!getKey()) return null;
    return lookup.sport === 'basketball' ? enrichBasketball(lookup) : enrichFootball(lookup);
  },
};
