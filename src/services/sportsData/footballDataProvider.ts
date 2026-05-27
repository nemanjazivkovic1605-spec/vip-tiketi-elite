import type { EnrichedMatchStats, SportsDataProvider, SportsMatchLookup } from './sportsDataProvider.js';
import { requestJson, teamsMatch } from './providerUtils.js';

type FootballDataMatch = {
  id?: number;
  utcDate?: string;
  status?: string;
  competition?: { id?: number; code?: string; name?: string };
  homeTeam?: { id?: number; name?: string };
  awayTeam?: { id?: number; name?: string };
  score?: unknown;
};

const BASE_URL = 'https://api.football-data.org/v4';
const getKey = () => process.env.FOOTBALL_DATA_API_KEY?.trim();

const requestFootballData = async <T>(path: string, params: Record<string, string> = {}) => {
  const apiKey = getKey();
  if (!apiKey) return null;
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => value && url.searchParams.set(key, value));
  return requestJson<T>(url, { 'X-Auth-Token': apiKey });
};

export const footballDataProvider: SportsDataProvider = {
  id: 'football-data.org',
  endpointLabel: 'football-data matches/standings',
  getEnrichedStats: async (lookup: SportsMatchLookup): Promise<EnrichedMatchStats | null> => {
    if (!getKey() || lookup.sport === 'basketball' || !lookup.date) return null;
    const response = await requestFootballData<{ matches?: FootballDataMatch[] }>('/matches', {
      dateFrom: lookup.date,
      dateTo: lookup.date,
    });
    const match = response?.matches?.find((candidate) => teamsMatch(
      lookup.homeTeam,
      lookup.awayTeam,
      candidate.homeTeam?.name,
      candidate.awayTeam?.name,
    ));
    if (!match?.id) return null;

    const competition = match.competition?.code || String(match.competition?.id || '');
    const standings = competition
      ? await requestFootballData<unknown>(`/competitions/${competition}/standings`)
      : null;

    return {
      provider: 'football-data.org',
      fixtureId: String(match.id),
      league: match.competition?.name || lookup.league,
      date: match.utcDate || lookup.date,
      homeTeam: match.homeTeam?.name || lookup.homeTeam,
      awayTeam: match.awayTeam?.name || lookup.awayTeam,
      standings,
      statistics: match.score ? { score: match.score } : null,
    };
  },
};
