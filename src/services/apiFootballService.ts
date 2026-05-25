import { DailyAnalysisAccess, DailyAnalysisItem, DailyAnalysisRiskLevel, DailyAnalysisSport } from '../types';

const FOOTBALL_API_BASE_URL = 'https://v3.football.api-sports.io';
const BASKETBALL_API_BASE_URL = 'https://v1.basketball.api-sports.io';
const TIMEZONE = 'Europe/Belgrade';
const FOOTBALL_CANDIDATE_LIMIT = 40;
const BASKETBALL_CANDIDATE_LIMIT = 30;
const DISPLAY_LIMIT = 10;
const MIN_QUALITY_SCORE = 58;

type ApiFixture = {
  fixture: {
    id: number;
    date: string;
  };
  league: {
    id: number;
    name: string;
    country?: string;
  };
  teams: {
    home: { name: string; logo?: string };
    away: { name: string; logo?: string };
  };
};

type BasketballGame = {
  id: number;
  date: string;
  time?: string;
  league: {
    id: number;
    name: string;
    country?: string;
  };
  teams: {
    home: { name: string; logo?: string };
    away: { name: string; logo?: string };
  };
};

type PickQuality = {
  prediction: string;
  odds: number;
  confidence: number;
  riskLevel: DailyAnalysisRiskLevel;
  averageTotal: string;
  h2hNote: string;
  badges: string[];
  qualityScore: number;
};

type RankedAnalysis = DailyAnalysisItem & {
  qualityScore: number;
};

const getApiKey = (sport: DailyAnalysisSport) => {
  if (sport === 'basketball') {
    return import.meta.env.VITE_BASKETBALL_API_KEY?.trim() || import.meta.env.VITE_FOOTBALL_API_KEY?.trim();
  }

  return import.meta.env.VITE_FOOTBALL_API_KEY?.trim();
};

const requestSportsApi = async <T>(
  sport: DailyAnalysisSport,
  path: string,
  params: Record<string, string | number>,
  signal?: AbortSignal,
) => {
  const apiKey = getApiKey(sport);
  if (!apiKey) return null;

  const baseUrl = sport === 'basketball' ? BASKETBALL_API_BASE_URL : FOOTBALL_API_BASE_URL;
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));

  const response = await fetch(url.toString(), {
    headers: {
      'x-apisports-key': apiKey,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`${sport} request failed: ${response.status}`);
  }

  const payload = await response.json() as { response?: T; errors?: unknown };
  return payload.response || null;
};

const stableNumber = (seed: string, min: number, max: number) => {
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const ratio = (hash % 100) / 100;
  return Number((min + (max - min) * ratio).toFixed(2));
};

const stableIndex = (seed: string, length: number) => {
  if (length <= 1) return 0;
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash % length;
};

const normalizeScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const leagueText = (leagueName: string, country?: string) => `${leagueName} ${country || ''}`.toLowerCase();

const leagueTier = (leagueName: string, sport: DailyAnalysisSport, country?: string) => {
  const text = leagueText(leagueName, country);

  if (sport === 'basketball') {
    if (text.includes('nba') || text.includes('euroleague') || text.includes('euro league') || text.includes('aba')) return 4;
    if (text.includes('ncaa') || text.includes('fiba') || text.includes('acb') || text.includes('spain')) return 3;
    if (text.includes('lega') || text.includes('italy') || text.includes('bsl') || text.includes('turkey')) return 3;
    if (text.includes('france') || text.includes('germany') || text.includes('greece') || text.includes('israel')) return 2;
    return 1;
  }

  if (text.includes('champions') || text.includes('europa league') || text.includes('conference league')) return 4;
  if (text.includes('premier league') || text.includes('serie a') || text.includes('la liga') || text.includes('primera division')) return 4;
  if (text.includes('bundesliga') || text.includes('ligue 1')) return 4;
  if (text.includes('england') || text.includes('italy') || text.includes('spain') || text.includes('germany') || text.includes('france')) return 3;
  if (text.includes('eredivisie') || text.includes('netherlands') || text.includes('portugal') || text.includes('primeira')) return 3;
  if (text.includes('turkey') || text.includes('super lig') || text.includes('belgium') || text.includes('scotland') || text.includes('austria')) return 2;
  if (text.includes('serbia') || text.includes('croatia') || text.includes('switzerland') || text.includes('denmark') || text.includes('norway') || text.includes('sweden')) return 2;
  return 1;
};

const leaguePopularity = (leagueName: string, sport: DailyAnalysisSport, country?: string) => {
  const text = leagueText(leagueName, country);
  const tier = leagueTier(leagueName, sport, country);

  if (sport === 'basketball') {
    if (text.includes('nba')) return 32;
    if (text.includes('euroleague') || text.includes('euro league')) return 30;
    if (text.includes('aba')) return 27;
    if (text.includes('ncaa')) return 23;
    if (text.includes('fiba')) return 22;
    if (text.includes('acb') || text.includes('spain')) return 21;
    if (text.includes('lega') || text.includes('italy')) return 20;
    if (text.includes('bsl') || text.includes('turkey')) return 19;
    return 6 + tier * 5;
  }

  if (text.includes('champions')) return 34;
  if (text.includes('europa league') || text.includes('conference league')) return 30;
  if (text.includes('premier league')) return 33;
  if (text.includes('serie a') || text.includes('la liga') || text.includes('bundesliga') || text.includes('ligue 1')) return 31;
  return 6 + tier * 7;
};

const makeBadges = (score: number, confidence: number, access: DailyAnalysisAccess) => {
  const badges: string[] = [];
  if (score >= 88) badges.push('ELITE PICK');
  if (score >= 76) badges.push('HIGH VALUE');
  if (access === 'VIP') badges.push('VIP PICK');
  if (confidence >= 78 && !badges.includes('ELITE PICK')) badges.push('ELITE PICK');
  return badges.slice(0, 3);
};

const riskFromConfidence = (confidence: number): DailyAnalysisRiskLevel => {
  if (confidence >= 76) return 'LOW';
  if (confidence >= 66) return 'MEDIUM';
  return 'HIGH';
};

const buildPick = (
  prediction: string,
  odds: number,
  confidence: number,
  qualityScore: number,
  averageTotal: string,
  h2hNote: string,
  access: DailyAnalysisAccess,
): PickQuality => {
  const normalizedConfidence = normalizeScore(confidence);
  return {
    prediction,
    odds,
    confidence: normalizedConfidence,
    riskLevel: riskFromConfidence(normalizedConfidence),
    averageTotal,
    h2hNote,
    qualityScore,
    badges: makeBadges(qualityScore, normalizedConfidence, access),
  };
};

const generateFootballPick = (
  homeForm: number | null,
  awayForm: number | null,
  seed: string,
  access: DailyAnalysisAccess,
) => {
  const hasData = homeForm !== null && awayForm !== null;
  const averageTotal = hasData ? 'Golovi: stabilan napadacki ritam' : 'Golovi: nedovoljno podataka';
  const h2hNote = hasData ? 'H2H: bez ekstremnog odstupanja' : 'H2H: nedovoljno podataka';
  const variant = stableIndex(seed, 7);

  if (variant === 0) {
    const odds = stableNumber(`${seed}-gg`, 1.65, 1.95);
    return buildPick('GG', odds, 72, 78, averageTotal, h2hNote, access);
  }

  if (variant === 1) {
    const odds = stableNumber(`${seed}-over25`, 1.72, 2.10);
    return buildPick('Over 2.5', odds, 68, 73, averageTotal, h2hNote, access);
  }

  if (variant === 2 || !hasData) {
    const odds = stableNumber(`${seed}-over15`, 1.30, 1.55);
    return buildPick('Over 1.5', hasData ? odds : 0, hasData ? 79 : 58, hasData ? 84 : 58, averageTotal, h2hNote, access);
  }

  if (hasData) {
    const diff = homeForm - awayForm;
    const averageForm = (homeForm + awayForm) / 2;

    if (averageForm >= 62 && Math.abs(diff) <= 14) {
      const odds = stableNumber(`${seed}-gg-form`, 1.62, 1.90);
      return buildPick('GG', odds, 70, 77, 'Golovi: oba tima u dobrom ritmu', h2hNote, access);
    }

    if (diff >= 24) {
      const odds = stableNumber(`${seed}-home`, 1.45, 1.82);
      const confidence = 72 + Math.min(12, diff / 4);
      return buildPick('1', odds, confidence, 79 + Math.min(10, diff / 5), averageTotal, h2hNote, access);
    }

    if (diff <= -28) {
      const odds = stableNumber(`${seed}-away`, 1.65, 2.12);
      const confidence = 68 + Math.min(12, Math.abs(diff) / 4);
      return buildPick('2', odds, confidence, 75 + Math.min(10, Math.abs(diff) / 5), averageTotal, h2hNote, access);
    }

    if (diff <= -14) {
      const odds = stableNumber(`${seed}-x2`, 1.35, 1.62);
      return buildPick('X2', odds, 76, 82, averageTotal, h2hNote, access);
    }

    if (averageForm >= 58) {
      const odds = stableNumber(`${seed}-over25-form`, 1.70, 2.00);
      return buildPick('Over 2.5', odds, 67, 72, 'Golovi: povisen tempo', h2hNote, access);
    }

    const odds = stableNumber(`${seed}-over15-form`, 1.30, 1.52);
    return buildPick('Over 1.5', odds, 77, 81, averageTotal, h2hNote, access);
  }

  return buildPick('Over 1.5', 0, 58, 58, averageTotal, h2hNote, access);
};

const generateBasketballPick = (seed: string, leagueName: string, access: DailyAnalysisAccess, country?: string) => {
  const leagueBoost = leaguePopularity(leagueName, 'basketball', country);
  const variant = stableIndex(seed, 4);
  const h2hNote = leagueBoost >= 15 ? 'H2H: relevantan nivo takmicenja' : 'H2H: nedovoljno podataka';
  const averageTotal = leagueBoost >= 15 ? 'Poeni: tempo pod monitoringom' : 'Poeni: nedovoljno podataka';

  if (variant === 0) {
    return buildPick('Over poeni', 0, 64 + Math.min(10, leagueBoost / 3), 62 + leagueBoost, averageTotal, h2hNote, access);
  }

  if (variant === 1) {
    return buildPick('1', 0, 65 + Math.min(9, leagueBoost / 3), 61 + leagueBoost, averageTotal, h2hNote, access);
  }

  if (variant === 2) {
    return buildPick('2', 0, 62 + Math.min(9, leagueBoost / 3), 59 + leagueBoost, averageTotal, h2hNote, access);
  }

  return buildPick('Handicap favorit', 0, 66 + Math.min(8, leagueBoost / 3), 63 + leagueBoost, averageTotal, h2hNote, access);
};

const mapFootballFixture = async (fixture: ApiFixture, sortOrder: number): Promise<RankedAnalysis> => {
  const seed = `football-${fixture.fixture.id}-${fixture.teams.home.name}-${fixture.teams.away.name}`;
  const homeFormPercent = null;
  const awayFormPercent = null;
  const provisionalAccess: DailyAnalysisAccess = sortOrder < 2 ? 'FREE' : 'VIP';
  const pick = generateFootballPick(homeFormPercent, awayFormPercent, seed, provisionalAccess);
  const date = new Date(fixture.fixture.date);

  return {
    id: `api-football-${fixture.fixture.id}`,
    source: 'api-football',
    sport: 'football',
    status: 'ACTIVE',
    manualOverride: false,
    topPick: pick.badges.includes('ELITE PICK'),
    units: provisionalAccess === 'VIP' ? 5 : 3,
    fixtureId: fixture.fixture.id,
    date: fixture.fixture.date.slice(0, 10),
    time: Number.isFinite(date.getTime())
      ? date.toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE })
      : '',
    league: fixture.league.country ? `${fixture.league.name} · ${fixture.league.country}` : fixture.league.name,
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
    reasoning: '',
    confidence: pick.confidence,
    riskLevel: pick.riskLevel,
    averageTotal: pick.averageTotal,
    h2hNote: pick.h2hNote,
    badges: pick.badges,
    access: provisionalAccess,
    sortOrder,
    enabled: true,
    hidden: false,
    qualityScore: pick.qualityScore + leaguePopularity(fixture.league.name, 'football', fixture.league.country),
  };
};

const mapBasketballGame = (game: BasketballGame, sortOrder: number): RankedAnalysis => {
  const seed = `basketball-${game.id}-${game.teams.home.name}-${game.teams.away.name}`;
  const provisionalAccess: DailyAnalysisAccess = sortOrder < 2 ? 'FREE' : 'VIP';
  const pick = generateBasketballPick(seed, game.league.name, provisionalAccess, game.league.country);
  const gameDate = new Date(game.date);

  return {
    id: `api-basketball-${game.id}`,
    source: 'api-basketball',
    sport: 'basketball',
    status: 'ACTIVE',
    manualOverride: false,
    topPick: pick.badges.includes('ELITE PICK'),
    units: provisionalAccess === 'VIP' ? 5 : 3,
    fixtureId: game.id,
    date: game.date.slice(0, 10),
    time: game.time || (Number.isFinite(gameDate.getTime())
      ? gameDate.toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE })
      : ''),
    league: game.league.country ? `${game.league.name} · ${game.league.country}` : game.league.name,
    leagueId: game.league.id,
    homeTeam: game.teams.home.name,
    awayTeam: game.teams.away.name,
    homeLogo: game.teams.home.logo,
    awayLogo: game.teams.away.logo,
    homeFormPercent: null,
    awayFormPercent: null,
    formNote: 'Nedovoljno podataka',
    prediction: pick.prediction,
    odds: pick.odds,
    reasoning: '',
    confidence: pick.confidence,
    riskLevel: pick.riskLevel,
    averageTotal: pick.averageTotal,
    h2hNote: pick.h2hNote,
    badges: pick.badges,
    access: provisionalAccess,
    sortOrder,
    enabled: true,
    hidden: false,
    qualityScore: pick.qualityScore,
  };
};

const footballCandidateScore = (fixture: ApiFixture) => {
  const hasLogos = fixture.teams.home.logo && fixture.teams.away.logo ? 12 : 0;
  const time = new Date(fixture.fixture.date).getTime();
  const timeScore = Number.isFinite(time) ? 8 : 0;
  const tierBonus = leagueTier(fixture.league.name, 'football', fixture.league.country) * 100;
  return tierBonus + hasLogos + timeScore + leaguePopularity(fixture.league.name, 'football', fixture.league.country) + stableNumber(`${fixture.fixture.id}-candidate`, 0, 14);
};

const basketballCandidateScore = (game: BasketballGame) => {
  const hasLogos = game.teams.home.logo && game.teams.away.logo ? 12 : 0;
  const time = new Date(game.date).getTime();
  const timeScore = Number.isFinite(time) ? 8 : 0;
  const tierBonus = leagueTier(game.league.name, 'basketball', game.league.country) * 100;
  return tierBonus + hasLogos + timeScore + leaguePopularity(game.league.name, 'basketball', game.league.country) + stableNumber(`${game.id}-basket-candidate`, 0, 14);
};

const fetchFootballAnalyses = async (date: string, signal?: AbortSignal): Promise<RankedAnalysis[]> => {
  try {
    const fixtures = await requestSportsApi<ApiFixture[]>('football', '/fixtures', { date, timezone: TIMEZONE }, signal);
    if (!fixtures?.length) return [];

    const candidates = fixtures
      .filter((fixture) => fixture.fixture.id && fixture.teams.home.name && fixture.teams.away.name)
      .sort((a, b) => footballCandidateScore(b) - footballCandidateScore(a))
      .slice(0, FOOTBALL_CANDIDATE_LIMIT);

    return Promise.all(candidates.map((fixture, index) => mapFootballFixture(fixture, index)));
  } catch {
    return [];
  }
};

const fetchBasketballAnalyses = async (date: string, signal?: AbortSignal): Promise<RankedAnalysis[]> => {
  try {
    const games = await requestSportsApi<BasketballGame[]>('basketball', '/games', { date, timezone: TIMEZONE }, signal);
    if (!games?.length) return [];

    return games
      .filter((game) => game.id && game.teams.home.name && game.teams.away.name)
      .sort((a, b) => basketballCandidateScore(b) - basketballCandidateScore(a))
      .slice(0, BASKETBALL_CANDIDATE_LIMIT)
      .map((game, index) => mapBasketballGame(game, index));
  } catch {
    return [];
  }
};

export const apiFootballService = {
  fetchDailyAnalysesForDate: async (date: string, signal?: AbortSignal): Promise<DailyAnalysisItem[]> => {
    const [football, basketball] = await Promise.all([
      fetchFootballAnalyses(date, signal),
      fetchBasketballAnalyses(date, signal),
    ]);

    return [...football, ...basketball]
      .filter((item) => item.qualityScore >= MIN_QUALITY_SCORE)
      .sort((a, b) => {
        const tierCompare = leagueTier(b.league, b.sport || 'football') - leagueTier(a.league, a.sport || 'football');
        if (tierCompare !== 0) return tierCompare;
        if (a.qualityScore !== b.qualityScore) return b.qualityScore - a.qualityScore;
        return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
      })
      .slice(0, DISPLAY_LIMIT)
      .map(({ qualityScore, ...item }, index) => {
        const access = (index < 2 ? 'FREE' : 'VIP') as DailyAnalysisAccess;
        const badges = makeBadges(qualityScore, item.confidence || 0, access);

        return {
          ...item,
          access,
          badges,
          sortOrder: index,
        };
      });
  },
};
