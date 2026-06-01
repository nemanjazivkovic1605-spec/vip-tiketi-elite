import { FootballCompetition, FootballStanding, MatchResult, MatchStatus } from '../types';
import { formatLeagueName } from '../utils/leagueMapper';

const API_BASE_URL = 'https://api.football-data.org/v4';
const API_KEY = import.meta.env.VITE_FOOTBALL_API_KEY as string | undefined;
const USE_REAL_API = import.meta.env.VITE_USE_REAL_API === 'true';

const CACHE_PREFIX = 'elite_football_api_v3_';
const FETCH_ISSUES_KEY = `${CACHE_PREFIX}issues`;
const CACHE_TTL_MS = 1000 * 60 * 30;

export const SUPPORTED_COMPETITIONS: FootballCompetition[] = [
  { id: 2021, code: 'PL', name: 'Premier League', areaName: 'England' },
  { id: 2014, code: 'PD', name: 'La Liga', areaName: 'Spain' },
  { id: 2019, code: 'SA', name: 'Serie A', areaName: 'Italy' },
  { id: 2002, code: 'BL1', name: 'Bundesliga', areaName: 'Germany' },
  { id: 2015, code: 'FL1', name: 'Ligue 1', areaName: 'France' },
  { id: 2001, code: 'CL', name: 'Champions League', areaName: 'Europe' },
];

type FetchMatchesOptions = {
  competitionCode?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: 'SCHEDULED' | 'TIMED' | 'LIVE' | 'IN_PLAY' | 'FINISHED';
};

export type FootballApiIssue = {
  competitionCode: string;
  competitionName: string;
  message: string;
};

type CacheEnvelope<T> = {
  timestamp: number;
  data: T;
};

const getCompetitionName = (code?: string) =>
  formatLeagueName(SUPPORTED_COMPETITIONS.find((competition) => competition.code === code)?.name || code);

const getCacheKey = (name: string) => `${CACHE_PREFIX}${name}`;

const readCache = <T>(name: string): T | null => {
  try {
    const stored = localStorage.getItem(getCacheKey(name));
    if (!stored) return null;
    const parsed = JSON.parse(stored) as CacheEnvelope<T>;
    return Date.now() - parsed.timestamp <= CACHE_TTL_MS ? parsed.data : null;
  } catch {
    return null;
  }
};

const writeCache = <T>(name: string, data: T) => {
  localStorage.setItem(getCacheKey(name), JSON.stringify({ timestamp: Date.now(), data }));
};

const readStoredIssues = (): FootballApiIssue[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(FETCH_ISSUES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStoredIssues = (issues: FootballApiIssue[]) => {
  localStorage.setItem(FETCH_ISSUES_KEY, JSON.stringify(issues));
};

const readAnyCachedMatches = (): MatchResult[] => {
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(getCacheKey('matches_')));
  return keys.flatMap((key) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}') as CacheEnvelope<MatchResult[]>;
      return Array.isArray(parsed.data) ? parsed.data : [];
    } catch {
      return [];
    }
  });
};

const requestJson = async <T>(path: string, params?: Record<string, string | undefined>): Promise<T> => {
  if (!API_KEY) {
    throw new Error('Football API key is not configured.');
  }

  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      'X-Auth-Token': API_KEY,
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Takmicenje nije dostupno na ovom API planu ili token nema pristup.');
    }
    if (response.status === 429) {
      throw new Error('API limit je istekao za football-data.org.');
    }
    throw new Error(`Football API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const mapStatus = (status: string): MatchStatus => {
  if (['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT', 'LIVE'].includes(status)) return MatchStatus.LIVE;
  if (status === 'FINISHED') return MatchStatus.FINISHED;
  if (['POSTPONED', 'SUSPENDED', 'CANCELLED'].includes(status)) return MatchStatus.POSTPONED;
  return MatchStatus.SCHEDULED;
};

const mapMatch = (match: any): MatchResult => {
  const date = new Date(match.utcDate);
  const competitionCode = match.competition?.code;

  return {
    id: String(match.id),
    competitionCode,
    source: 'football-data.org',
    homeTeam: match.homeTeam?.name || 'TBD',
    awayTeam: match.awayTeam?.name || 'TBD',
    league: formatLeagueName(match.competition?.name || getCompetitionName(competitionCode)),
    date: Number.isNaN(date.getTime()) ? new Date().toISOString().split('T')[0] : date.toISOString().split('T')[0],
    time: Number.isNaN(date.getTime()) ? '--:--' : date.toISOString().slice(11, 16),
    status: mapStatus(match.status),
    score: match.score?.fullTime?.home !== null && match.score?.fullTime?.home !== undefined
      ? {
          home: match.score.fullTime.home,
          away: match.score.fullTime.away,
        }
      : undefined,
  };
};

const fallbackMatches = (cacheName: string) =>
  readCache<MatchResult[]>(cacheName) || [];

const fallbackCompetitions = (cacheName: string) =>
  USE_REAL_API ? SUPPORTED_COMPETITIONS : readCache<FootballCompetition[]>(cacheName) || SUPPORTED_COMPETITIONS;

const fallbackStandings = (cacheName: string, competitionCode: string) =>
  USE_REAL_API ? [] : readCache<FootballStanding[]>(cacheName) || [];

export const footballApiService = {
  isRealApiMode: () => USE_REAL_API,

  fetchCompetitions: async (): Promise<FootballCompetition[]> => {
    const cacheName = 'competitions';
    try {
      const data = await requestJson<{ competitions: any[] }>('/competitions');
      const supportedCodes = new Set(SUPPORTED_COMPETITIONS.map((competition) => competition.code));
      const competitions = data.competitions
        .filter((competition) => supportedCodes.has(competition.code))
        .map((competition) => ({
          id: competition.id,
          code: competition.code,
          name: competition.name,
          areaName: competition.area?.name || '',
        }));
      writeCache(cacheName, competitions);
      return competitions.length > 0 ? competitions : SUPPORTED_COMPETITIONS;
    } catch {
      return fallbackCompetitions(cacheName);
    }
  },

  fetchMatches: async (options: FetchMatchesOptions = {}): Promise<MatchResult[]> => {
    const cacheName = `matches_${JSON.stringify(options)}`;
    try {
      const params = {
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        status: options.status,
        competitions: options.competitionCode ? undefined : SUPPORTED_COMPETITIONS.map((competition) => competition.code).join(','),
      };

      const path = options.competitionCode ? `/competitions/${options.competitionCode}/matches` : '/matches';
      const data = await requestJson<{ matches: any[] }>(path, params);
      const matches = data.matches.map(mapMatch);
      writeCache(cacheName, matches);
      return matches;
    } catch {
      return USE_REAL_API ? [] : fallbackMatches(cacheName);
    }
  },

  fetchFinishedMatches: async (options: Omit<FetchMatchesOptions, 'status'> = {}): Promise<MatchResult[]> => {
    const cacheName = `finished_${JSON.stringify(options)}`;
    try {
      const matches = await footballApiService.fetchMatches({ ...options, status: 'FINISHED' });
      writeCache(cacheName, matches);
      return matches;
    } catch {
      return USE_REAL_API ? [] : fallbackMatches(cacheName);
    }
  },

  fetchFinishedMatchesByDateRange: async (startDate: string, endDate: string): Promise<MatchResult[]> => {
    const cacheName = `finished_range_${startDate}_${endDate}`;
    const cached = readCache<MatchResult[]>(cacheName);
    const issues: FootballApiIssue[] = [];

    const fetchCompetition = async (competition: FootballCompetition): Promise<MatchResult[]> => {
      try {
        const data = await requestJson<{ matches: any[] }>(`/competitions/${competition.code}/matches`, {
          dateFrom: startDate,
          dateTo: endDate,
          status: 'FINISHED',
        });
        return data.matches.map(mapMatch);
      } catch (error) {
        issues.push({
          competitionCode: competition.code,
          competitionName: competition.name,
          message: error instanceof Error ? error.message : 'Takmičenje nije dostupno na ovom API planu.',
        });
        return [];
      }
    };

    if (!API_KEY) {
      writeStoredIssues(SUPPORTED_COMPETITIONS.map((competition) => ({
        competitionCode: competition.code,
        competitionName: competition.name,
        message: 'Football API ključ nije podešen.',
      })));
      return USE_REAL_API ? cached || [] : fallbackMatches(cacheName);
    }

    const results = await Promise.all(SUPPORTED_COMPETITIONS.map(fetchCompetition));
    const matches = results.flat().sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    writeStoredIssues(issues);

    if (matches.length > 0) {
      writeCache(cacheName, matches);
      return matches;
    }

    return USE_REAL_API ? cached || [] : fallbackMatches(cacheName);
  },

  fetchStandings: async (competitionCode = 'PL'): Promise<FootballStanding[]> => {
    const cacheName = `standings_${competitionCode}`;
    try {
      const data = await requestJson<{ standings: any[] }>(`/competitions/${competitionCode}/standings`);
      const table = data.standings?.[0]?.table || [];
      const standings = table.map((row: any) => ({
        position: row.position,
        teamId: row.team?.id,
        teamName: row.team?.name,
        playedGames: row.playedGames,
        won: row.won,
        draw: row.draw,
        lost: row.lost,
        points: row.points,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
      }));
      writeCache(cacheName, standings);
      return standings;
    } catch {
      return fallbackStandings(cacheName, competitionCode);
    }
  },

  getCachedOrMockMatches: (): MatchResult[] => {
    if (USE_REAL_API) return [];
    const cached = readAnyCachedMatches();
    return cached;
  },

  getFetchIssues: (): FootballApiIssue[] => readStoredIssues(),
};
