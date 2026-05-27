import type { EnrichedMatchStats, SportsDataProvider, SportsMatchLookup } from './sportsDataProvider.js';
import { compactArray, requestJson, teamsMatch } from './providerUtils.js';

type SportsDbEvent = {
  idEvent?: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  strLeague?: string;
  strEvent?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  dateEvent?: string;
  intHomeScore?: string;
  intAwayScore?: string;
  strStatus?: string;
  strVenue?: string;
};

const getKey = () => process.env.THESPORTSDB_API_KEY?.trim();

const requestSportsDb = async <T>(key: string, path: string, params: Record<string, string>) => {
  const url = new URL(`https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/${path}`);
  Object.entries(params).forEach(([name, value]) => value && url.searchParams.set(name, value));
  return requestJson<T>(url);
};

export const theSportsDbProvider: SportsDataProvider = {
  id: 'TheSportsDB',
  endpointLabel: 'TheSportsDB eventsday/eventslast',
  getEnrichedStats: async (lookup: SportsMatchLookup): Promise<EnrichedMatchStats | null> => {
    const key = getKey();
    if (!key || !lookup.date) return null;
    const sport = lookup.sport === 'basketball' ? 'Basketball' : 'Soccer';
    const response = await requestSportsDb<{ events?: SportsDbEvent[] }>(key, 'eventsday.php', {
      d: lookup.date,
      s: sport,
    });
    const event = response?.events?.find((candidate) => teamsMatch(
      lookup.homeTeam,
      lookup.awayTeam,
      candidate.strHomeTeam,
      candidate.strAwayTeam,
    ));
    if (!event?.idEvent) return null;

    const [homeLast, awayLast] = await Promise.all([
      event.idHomeTeam ? requestSportsDb<{ results?: SportsDbEvent[] }>(key, 'eventslast.php', { id: event.idHomeTeam }) : Promise.resolve(null),
      event.idAwayTeam ? requestSportsDb<{ results?: SportsDbEvent[] }>(key, 'eventslast.php', { id: event.idAwayTeam }) : Promise.resolve(null),
    ]);

    return {
      provider: 'TheSportsDB',
      fixtureId: event.idEvent,
      league: event.strLeague || lookup.league,
      date: event.dateEvent || lookup.date,
      homeTeam: event.strHomeTeam || lookup.homeTeam,
      awayTeam: event.strAwayTeam || lookup.awayTeam,
      lastMatches: {
        home: compactArray(homeLast?.results),
        away: compactArray(awayLast?.results),
      },
      statistics: {
        status: event.strStatus,
        homeScore: event.intHomeScore,
        awayScore: event.intAwayScore,
        venue: event.strVenue,
      },
    };
  },
};
