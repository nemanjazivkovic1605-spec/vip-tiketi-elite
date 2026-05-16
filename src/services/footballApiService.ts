import { FootballCompetition, FootballStanding, MatchResult, MatchStatus } from '../types';

const API_BASE_URL = 'https://api.football-data.org/v4';
const API_KEY = import.meta.env.VITE_FOOTBALL_API_KEY as string | undefined;
const USE_REAL_API = import.meta.env.VITE_USE_REAL_API === 'true';

const CACHE_PREFIX = 'elite_football_api_v2_';
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

const MOCK_MATCHES: MatchResult[] = [
  {
    id: 'mock-pl-1',
    competitionCode: 'PL',
    source: 'mock',
    homeTeam: 'Liverpool',
    awayTeam: 'Arsenal',
    league: 'Premier League',
    date: '2026-05-15',
    time: '18:30',
    status: MatchStatus.LIVE,
    score: { home: 1, away: 1 },
  },
  {
    id: 'mock-pd-1',
    competitionCode: 'PD',
    source: 'mock',
    homeTeam: 'Barcelona',
    awayTeam: 'Valencia',
    league: 'La Liga',
    date: '2026-05-13',
    time: '19:00',
    status: MatchStatus.FINISHED,
    score: { home: 1, away: 1 },
  },
  {
    id: 'mock-sa-1',
    competitionCode: 'SA',
    source: 'mock',
    homeTeam: 'Inter',
    awayTeam: 'Milan',
    league: 'Serie A',
    date: '2026-05-14',
    time: '20:45',
    status: MatchStatus.FINISHED,
    score: { home: 2, away: 0 },
  },
  {
    id: 'mock-bl1-1',
    competitionCode: 'BL1',
    source: 'mock',
    homeTeam: 'Dortmund',
    awayTeam: 'Leipzig',
    league: 'Bundesliga',
    date: '2026-05-14',
    time: '15:30',
    status: MatchStatus.FINISHED,
    score: { home: 0, away: 1 },
  },
  {
    id: 'mock-fl1-1',
    competitionCode: 'FL1',
    source: 'mock',
    homeTeam: 'PSG',
    awayTeam: 'Lyon',
    league: 'Ligue 1',
    date: '2026-05-12',
    time: '21:00',
    status: MatchStatus.FINISHED,
    score: { home: 3, away: 1 },
  },
  {
    id: 'mock-cl-1',
    competitionCode: 'CL',
    source: 'mock',
    homeTeam: 'Real Madrid',
    awayTeam: 'Man City',
    league: 'Champions League',
    date: '2026-05-15',
    time: '21:00',
    status: MatchStatus.SCHEDULED,
  },
];

const MOCK_STANDINGS_BY_COMPETITION: Record<string, FootballStanding[]> = {
  PL: [
    { position: 1, teamId: 64, teamName: 'Liverpool', playedGames: 38, won: 26, draw: 7, lost: 5, points: 85, goalsFor: 86, goalsAgainst: 41, goalDifference: 45 },
    { position: 2, teamId: 57, teamName: 'Arsenal', playedGames: 38, won: 25, draw: 8, lost: 5, points: 83, goalsFor: 79, goalsAgainst: 34, goalDifference: 45 },
    { position: 3, teamId: 65, teamName: 'Man City', playedGames: 38, won: 24, draw: 8, lost: 6, points: 80, goalsFor: 82, goalsAgainst: 38, goalDifference: 44 },
  ],
  PD: [
    { position: 1, teamId: 81, teamName: 'Barcelona', playedGames: 38, won: 27, draw: 5, lost: 6, points: 86, goalsFor: 88, goalsAgainst: 39, goalDifference: 49 },
    { position: 2, teamId: 86, teamName: 'Real Madrid', playedGames: 38, won: 26, draw: 6, lost: 6, points: 84, goalsFor: 78, goalsAgainst: 36, goalDifference: 42 },
    { position: 3, teamId: 78, teamName: 'Atletico Madrid', playedGames: 38, won: 22, draw: 9, lost: 7, points: 75, goalsFor: 68, goalsAgainst: 34, goalDifference: 34 },
  ],
  SA: [
    { position: 1, teamId: 108, teamName: 'Inter', playedGames: 38, won: 28, draw: 7, lost: 3, points: 91, goalsFor: 89, goalsAgainst: 22, goalDifference: 67 },
    { position: 2, teamId: 98, teamName: 'Milan', playedGames: 38, won: 23, draw: 8, lost: 7, points: 77, goalsFor: 76, goalsAgainst: 49, goalDifference: 27 },
    { position: 3, teamId: 109, teamName: 'Juventus', playedGames: 38, won: 20, draw: 13, lost: 5, points: 73, goalsFor: 59, goalsAgainst: 31, goalDifference: 28 },
  ],
  BL1: [
    { position: 1, teamId: 5, teamName: 'Bayern Munich', playedGames: 34, won: 25, draw: 6, lost: 3, points: 81, goalsFor: 92, goalsAgainst: 32, goalDifference: 60 },
    { position: 2, teamId: 4, teamName: 'Dortmund', playedGames: 34, won: 21, draw: 7, lost: 6, points: 70, goalsFor: 78, goalsAgainst: 42, goalDifference: 36 },
    { position: 3, teamId: 721, teamName: 'Leipzig', playedGames: 34, won: 20, draw: 6, lost: 8, points: 66, goalsFor: 77, goalsAgainst: 39, goalDifference: 38 },
  ],
  FL1: [
    { position: 1, teamId: 524, teamName: 'PSG', playedGames: 34, won: 22, draw: 10, lost: 2, points: 76, goalsFor: 81, goalsAgainst: 33, goalDifference: 48 },
    { position: 2, teamId: 516, teamName: 'Monaco', playedGames: 34, won: 20, draw: 7, lost: 7, points: 67, goalsFor: 68, goalsAgainst: 42, goalDifference: 26 },
    { position: 3, teamId: 523, teamName: 'Lyon', playedGames: 34, won: 18, draw: 7, lost: 9, points: 61, goalsFor: 67, goalsAgainst: 46, goalDifference: 21 },
  ],
  CL: [
    { position: 1, teamId: 86, teamName: 'Real Madrid', playedGames: 8, won: 6, draw: 1, lost: 1, points: 19, goalsFor: 19, goalsAgainst: 8, goalDifference: 11 },
    { position: 2, teamId: 65, teamName: 'Man City', playedGames: 8, won: 5, draw: 2, lost: 1, points: 17, goalsFor: 20, goalsAgainst: 10, goalDifference: 10 },
    { position: 3, teamId: 5, teamName: 'Bayern Munich', playedGames: 8, won: 5, draw: 1, lost: 2, points: 16, goalsFor: 18, goalsAgainst: 11, goalDifference: 7 },
  ],
};

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
  SUPPORTED_COMPETITIONS.find((competition) => competition.code === code)?.name || code || 'Football';

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
    league: match.competition?.name || getCompetitionName(competitionCode),
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

const filterMockMatches = (options: FetchMatchesOptions = {}) => MOCK_MATCHES.filter((match) => {
  const matchesCompetition = !options.competitionCode || match.competitionCode === options.competitionCode;
  const matchesDateFrom = !options.dateFrom || match.date >= options.dateFrom;
  const matchesDateTo = !options.dateTo || match.date <= options.dateTo;
  const matchesStatus = !options.status || match.status === mapStatus(options.status);
  return matchesCompetition && matchesDateFrom && matchesDateTo && matchesStatus;
});

const fallbackMatches = (cacheName: string, options: FetchMatchesOptions = {}) =>
  readCache<MatchResult[]>(cacheName) || filterMockMatches(options);

const fallbackCompetitions = (cacheName: string) =>
  USE_REAL_API ? SUPPORTED_COMPETITIONS : readCache<FootballCompetition[]>(cacheName) || SUPPORTED_COMPETITIONS;

const fallbackStandings = (cacheName: string, competitionCode: string) =>
  USE_REAL_API ? [] : readCache<FootballStanding[]>(cacheName) || MOCK_STANDINGS_BY_COMPETITION[competitionCode] || [];

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
      return USE_REAL_API ? [] : fallbackMatches(cacheName, options);
    }
  },

  fetchFinishedMatches: async (options: Omit<FetchMatchesOptions, 'status'> = {}): Promise<MatchResult[]> => {
    const cacheName = `finished_${JSON.stringify(options)}`;
    try {
      const matches = await footballApiService.fetchMatches({ ...options, status: 'FINISHED' });
      writeCache(cacheName, matches);
      return matches;
    } catch {
      return USE_REAL_API ? [] : fallbackMatches(cacheName, { ...options, status: 'FINISHED' });
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
      return USE_REAL_API ? cached || [] : fallbackMatches(cacheName, { dateFrom: startDate, dateTo: endDate, status: 'FINISHED' });
    }

    const results = await Promise.all(SUPPORTED_COMPETITIONS.map(fetchCompetition));
    const matches = results.flat().sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    writeStoredIssues(issues);

    if (matches.length > 0) {
      writeCache(cacheName, matches);
      return matches;
    }

    return USE_REAL_API ? cached || [] : fallbackMatches(cacheName, { dateFrom: startDate, dateTo: endDate, status: 'FINISHED' });
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
    return cached.length > 0 ? cached : MOCK_MATCHES;
  },

  getFetchIssues: (): FootballApiIssue[] => readStoredIssues(),
};
