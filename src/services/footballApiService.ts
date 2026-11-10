import { FootballCompetition, FootballStanding, MatchResult, MatchStatus } from '../types';
import { formatLeagueName } from '../utils/leagueMapper';

const API_BASE_URL = '/api/football-data';
const USE_REAL_API = import.meta.env.VITE_USE_REAL_API === 'true';

const CACHE_PREFIX = 'elite_football_api_v4_';
const FETCH_ISSUES_KEY = `${CACHE_PREFIX}issues`;
const CACHE_TTL_MS = 1000 * 60 * 2;

export const SUPPORTED_COMPETITIONS: FootballCompetition[] = [
  { id: 2021, code: 'PL', name: 'Premier League', areaName: 'England' },
  { id: 2014, code: 'PD', name: 'La Liga', areaName: 'Spain' },
  { id: 2019, code: 'SA', name: 'Serie A', areaName: 'Italy' },
  { id: 2002, code: 'BL1', name: 'Bundesliga', areaName: 'Germany' },
  { id: 2015, code: 'FL1', name: 'Ligue 1', areaName: 'France' },
  { id: 2001, code: 'CL', name: 'Champions League', areaName: 'Europe' },
  { id: 2016, code: 'EL1', name: 'Championship', areaName: 'England' },
  { id: 2017, code: 'PPL', name: 'Primeira Liga', areaName: 'Portugal' },
  { id: 2003, code: 'DED', name: 'Eredivisie', areaName: 'Netherlands' },
  { id: 2013, code: 'BSA', name: 'Serie A', areaName: 'Brazil' },
  { id: 2000, code: 'WC', name: 'World Cup', areaName: 'World' },
  { id: 2018, code: 'EC', name: 'European Championship', areaName: 'Europe' },
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
  try { localStorage.setItem(getCacheKey(name), JSON.stringify({ timestamp: Date.now(), data })); } catch { /* Optional browser cache. */ }
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
  const url = new URL(API_BASE_URL, window.location.origin);
  url.searchParams.set('path', path);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString());

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Takmicenje nije dostupno na ovom API planu ili token nema pristup.');
    }
    if (response.status === 429) {
      throw new Error('API limit je istekao za football-data.org.');
    }
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `Football API request failed: ${response.status}`);
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
    source: match.source === 'api-football' ? 'api-football' : 'football-data.org',
    homeTeam: match.homeTeam?.name || 'TBD',
    awayTeam: match.awayTeam?.name || 'TBD',
    league: formatLeagueName(match.competition?.name || getCompetitionName(competitionCode)),
    date: Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(date),
    time: Number.isNaN(date.getTime()) ? '--:--' : new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: '2-digit', minute: '2-digit' }).format(date),
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
    const cached = readCache<FootballCompetition[]>(cacheName);
    if (cached) return cached;
    try {
      const data = await requestJson<{ competitions: any[] }>('/competitions');
      const competitions = data.competitions
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
    const cached = readCache<MatchResult[]>(cacheName);
    if (cached) return cached;
    try {
      const params = {
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        status: options.status,
      };

      const path = options.competitionCode ? `/competitions/${options.competitionCode}/matches` : '/matches';
      const data = await requestJson<{ matches: any[] }>(path, params);
      const matches = data.matches.map(mapMatch);
      writeCache(cacheName, matches);
      return matches;
    } catch (error) {
      const fallback = fallbackMatches(cacheName);
      if (fallback.length) return fallback;
      throw error;
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

    if (cached) return cached;

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
    const cached = readCache<FootballStanding[]>(cacheName);
    if (cached) return cached;
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
