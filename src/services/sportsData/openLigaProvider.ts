import { freeFixturesForDate, openLigaSeason, teamKey } from '../../../server/freeFootballFeeds.js';
import type { SportsDataProvider } from './sportsDataProvider.js';

export const openLigaProvider: SportsDataProvider = {
  id: 'OpenLigaDB', endpointLabel: 'OpenLigaDB season match results',
  getEnrichedStats: async (lookup) => {
    if (lookup.sport === 'basketball' || !lookup.date) return null;
    const fixtures = await freeFixturesForDate(lookup.date);
    const fixture = fixtures.find((item) => item.sourceProvider === 'OpenLigaDB'
      && teamKey(item.teams.home.name) === teamKey(lookup.homeTeam) && teamKey(item.teams.away.name) === teamKey(lookup.awayTeam));
    if (!fixture) return null;
    const history = (await openLigaSeason(lookup.date)).filter((item) => item.fixture.status.short === 'FT'
      && Date.parse(item.fixture.date) < Date.parse(fixture.fixture.date));
    const games = (team: string) => history.filter((item) => [item.teams.home.name, item.teams.away.name].some((name) => teamKey(name) === teamKey(team)))
      .sort((a, b) => b.fixture.date.localeCompare(a.fixture.date)).slice(0, 5)
      .map((item) => ({ date: item.fixture.date, homeTeam: item.teams.home.name, awayTeam: item.teams.away.name,
        homeScore: item.goals.home, awayScore: item.goals.away }));
    const home = games(lookup.homeTeam), away = games(lookup.awayTeam);
    if (!home.length && !away.length) return null;
    return { provider: 'OpenLigaDB', fixtureId: fixture.providerId, league: fixture.league.name, date: lookup.date,
      homeTeam: fixture.teams.home.name, awayTeam: fixture.teams.away.name, lastMatches: { home, away } };
  },
};
