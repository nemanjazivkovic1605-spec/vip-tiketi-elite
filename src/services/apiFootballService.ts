import { DailyAnalysisItem } from '../types';

const API_BASE_URL = 'https://v3.football.api-sports.io';
const TIMEZONE = 'Europe/Belgrade';

const TARGET_LEAGUES = [
  { id: 39, name: 'Premier League', priority: 1 },
  { id: 140, name: 'La Liga', priority: 2 },
  { id: 135, name: 'Serie A', priority: 3 },
  { id: 78, name: 'Bundesliga', priority: 4 },
  { id: 61, name: 'Ligue 1', priority: 5 },
  { id: 2, name: 'Champions League', priority: 6 },
  { id: 3, name: 'Europa League', priority: 7 },
  { id: 848, name: 'Conference League', priority: 8 },
  { id: 286, name: 'Super Liga Srbije', priority: 9 },
] as const;

const TARGET_LEAGUE_IDS = new Set<number>(TARGET_LEAGUES.map((league) => league.id));

type ApiFixture = {
  fixture: {
    id: number;
    date: string;
  };
  league: {
    id: number;
    name: string;
  };
  teams: {
    home: { name: string; logo?: string };
    away: { name: string; logo?: string };
  };
};

type ApiPrediction = {
  comparison?: {
    form?: {
      home?: string;
      away?: string;
    };
  };
  predictions?: {
    advice?: string;
  };
};

const getApiKey = () => import.meta.env.VITE_FOOTBALL_API_KEY?.trim();

const formatIsoDate = (date: Date) => date.toISOString().split('T')[0];

export const getDailyAnalysisDates = () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(today.getDate() + 2);

  return [
    { key: 'today', label: 'Danas', date: formatIsoDate(today) },
    { key: 'tomorrow', label: 'Sutra', date: formatIsoDate(tomorrow) },
    { key: 'dayAfterTomorrow', label: 'Prekosutra', date: formatIsoDate(dayAfterTomorrow) },
  ] as const;
};

const requestApi = async <T>(path: string, params: Record<string, string | number>) => {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));

  const response = await fetch(url.toString(), {
    headers: {
      'x-apisports-key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football request failed: ${response.status}`);
  }

  const payload = await response.json() as { response?: T; errors?: unknown };
  return payload.response || null;
};

const parsePercent = (value?: string) => {
  if (!value) return null;
  const parsed = Number(value.replace('%', '').trim());
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
};

const stableNumber = (seed: string, min: number, max: number) => {
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const ratio = (hash % 100) / 100;
  return Number((min + (max - min) * ratio).toFixed(2));
};

const generatePick = (homeForm: number | null, awayForm: number | null, seed: string) => {
  if (homeForm !== null && awayForm !== null) {
    const diff = homeForm - awayForm;

    if (diff >= 24) {
      return {
        prediction: '1',
        odds: stableNumber(seed, 1.45, 1.82),
        reasoning: 'Domaći tim trenutno ima jasnu prednost u formi i ulazi u meč sa boljim ritmom. Takav odnos snaga daje prednost jedinici kao najlogičnijem izboru.',
      };
    }

    if (diff <= -28) {
      return {
        prediction: '2',
        odds: stableNumber(seed, 1.65, 2.12),
        reasoning: 'Gostujući tim pokazuje bolju formu i stabilniji takmičarski ritam. Ako zadrži nivo iz prethodnih nastupa, dvojka ima realnu value osnovu.',
      };
    }

    if (diff <= -14) {
      return {
        prediction: 'X2',
        odds: stableNumber(seed, 1.35, 1.62),
        reasoning: 'Gost ima nešto bolju formu, ali razlika nije dovoljno velika za agresivan tip. X2 deluje kao disciplinovanija opcija sa boljom kontrolom rizika.',
      };
    }

    return {
      prediction: 'Over 1.5',
      odds: stableNumber(seed, 1.30, 1.52),
      reasoning: 'Forma timova ne pokazuje ekstremnu razliku, pa je sigurniji pristup fokus na golove. Over 1.5 je oprezniji izbor za duel u kojem ne želimo preuzeti nepotreban rizik.',
    };
  }

  return {
    prediction: 'Over 1.5',
    odds: stableNumber(seed, 1.30, 1.55),
    reasoning: 'Za ovaj meč nema dovoljno potvrđenih statističkih podataka o formi timova. Zbog toga sistem bira konzervativniji predlog i izbegava agresivnu prognozu pobednika.',
  };
};

const fetchPrediction = async (fixtureId: number) => {
  try {
    const response = await requestApi<ApiPrediction[]>('/predictions', { fixture: fixtureId });
    return response?.[0] || null;
  } catch (error) {
    console.warn('API-Football predictions unavailable:', error);
    return null;
  }
};

const mapFixture = async (fixture: ApiFixture, sortOrder: number): Promise<DailyAnalysisItem> => {
  const predictionData = await fetchPrediction(fixture.fixture.id);
  const homeFormPercent = parsePercent(predictionData?.comparison?.form?.home);
  const awayFormPercent = parsePercent(predictionData?.comparison?.form?.away);
  const pick = generatePick(homeFormPercent, awayFormPercent, `${fixture.fixture.id}-${fixture.teams.home.name}-${fixture.teams.away.name}`);
  const date = new Date(fixture.fixture.date);

  return {
    id: `api-football-${fixture.fixture.id}`,
    source: 'api-football',
    fixtureId: fixture.fixture.id,
    date: fixture.fixture.date.slice(0, 10),
    time: Number.isFinite(date.getTime())
      ? date.toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE })
      : '',
    league: TARGET_LEAGUES.find((league) => league.id === fixture.league.id)?.name || fixture.league.name,
    leagueId: fixture.league.id,
    homeTeam: fixture.teams.home.name,
    awayTeam: fixture.teams.away.name,
    homeLogo: fixture.teams.home.logo,
    awayLogo: fixture.teams.away.logo,
    homeFormPercent,
    awayFormPercent,
    formNote: homeFormPercent === null || awayFormPercent === null ? 'Nedovoljno podataka' : undefined,
    prediction: pick.prediction,
    odds: pick.odds,
    reasoning: pick.reasoning,
    access: sortOrder < 2 ? 'FREE' : 'VIP',
    sortOrder,
    enabled: true,
    hidden: false,
  };
};

export const apiFootballService = {
  targetLeagues: TARGET_LEAGUES,

  fetchDailyAnalysesForDate: async (date: string): Promise<DailyAnalysisItem[]> => {
    try {
      const fixtures = await requestApi<ApiFixture[]>('/fixtures', { date, timezone: TIMEZONE });
      if (!fixtures?.length) return [];

      const filtered = fixtures
        .filter((fixture) => TARGET_LEAGUE_IDS.has(fixture.league.id))
        .sort((a, b) => {
          const priorityA = TARGET_LEAGUES.find((league) => league.id === a.league.id)?.priority || 99;
          const priorityB = TARGET_LEAGUES.find((league) => league.id === b.league.id)?.priority || 99;
          if (priorityA !== priorityB) return priorityA - priorityB;
          return a.fixture.date.localeCompare(b.fixture.date);
        })
        .slice(0, 5);

      return Promise.all(filtered.map((fixture, index) => mapFixture(fixture, index)));
    } catch (error) {
      console.error('API-Football fixtures unavailable:', error);
      return [];
    }
  },
};
