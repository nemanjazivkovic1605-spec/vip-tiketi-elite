import type { IncomingMessage, ServerResponse } from 'node:http';
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

type ApiFixture = {
  fixture?: {
    id?: number;
    date?: string;
    status?: { short?: string; long?: string; elapsed?: number | null };
  };
  league?: { id?: number; name?: string; season?: number };
  teams?: {
    home?: { id?: number; name?: string; logo?: string };
    away?: { id?: number; name?: string; logo?: string };
  };
  goals?: { home?: number | null; away?: number | null };
  score?: {
    halftime?: { home?: number | null; away?: number | null };
    fulltime?: { home?: number | null; away?: number | null };
  };
};

type ApiOddsOutcome = { name?: string; value?: string; odd?: string };
type ApiOddsBet = { name?: string; values?: ApiOddsOutcome[] };
type ApiOddsBookmaker = { name?: string; bets?: ApiOddsBet[] };
type ApiOddsItem = {
  fixture?: { id?: number };
  bookmakers?: ApiOddsBookmaker[];
};

type WorldCupPick = {
  fixture: ApiFixture;
  access: 'FREE' | 'VIP';
  prediction: string;
  marketCategory: MarketCategory;
  odds: number;
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  sortOrder: number;
};

type MarketCategory =
  | 'goals_safe'
  | 'goals_value'
  | 'btts'
  | 'double_chance'
  | 'favorite_win'
  | 'team_goal'
  | 'first_half_goal'
  | 'under_control';

type MarketDefinition = {
  category: MarketCategory;
  prediction: (fixture: ApiFixture) => string;
  betPatterns: RegExp[];
  outcomeAliases: (fixture: ApiFixture) => string[];
  confidence: number;
};

type PickCandidate = Omit<WorldCupPick, 'access' | 'sortOrder'>;

type CronLogPayload = {
  action: 'seed' | 'results';
  status: 'success' | 'skipped' | 'error';
  message: string;
  details?: Record<string, unknown>;
};

type StoredDailyAnalysis = Record<string, any> & { id: string };

const API_BASE = 'https://v3.football.api-sports.io';
const WORLD_CUP_LEAGUE_ID = process.env.WORLD_CUP_LEAGUE_ID?.trim() || '1';
const WORLD_CUP_SEASON = process.env.WORLD_CUP_SEASON?.trim() || '2026';
const TIMEZONE = process.env.WORLD_CUP_TIMEZONE?.trim() || 'Europe/Belgrade';
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID?.trim()
  || process.env.VITE_FIRESTORE_DATABASE_ID?.trim()
  || firebaseConfig.firestoreDatabaseId;
const DAILY_ANALYSES_COLLECTION = 'dailyAnalyses';
const PUBLIC_DAILY_COLLECTION = 'publicDailyAnalyses';
const FREE_DAILY_COLLECTION = 'freeDailyAnalyses';
const CRON_LOG_COLLECTION = 'automationLogs';
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
const POSTPONED_STATUSES = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO']);
const MARKET_ROTATION: MarketCategory[] = [
  'goals_safe',
  'double_chance',
  'btts',
  'favorite_win',
  'team_goal',
  'goals_value',
  'first_half_goal',
  'under_control',
];

const getEnv = (key: string) => process.env[key]?.trim() || '';

let adminApp: App | null = null;
let adminDb: Firestore | null = null;

const parseJson = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const initAdminDb = () => {
  if (adminDb) return adminDb;
  const existing = getApps()[0];
  if (existing) {
    adminApp = existing;
    adminDb = getFirestore(existing, FIRESTORE_DATABASE_ID);
    return adminDb;
  }

  const rawServiceAccount = getEnv('FIREBASE_SERVICE_ACCOUNT_KEY');
  if (!rawServiceAccount) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable.');
  const serviceAccount = parseJson(rawServiceAccount);
  if (!serviceAccount || typeof serviceAccount !== 'object') throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON.');

  adminApp = initializeApp({
    credential: cert(serviceAccount as any),
    projectId: (serviceAccount as { project_id?: string }).project_id || firebaseConfig.projectId,
  });
  adminDb = getFirestore(adminApp, FIRESTORE_DATABASE_ID);
  return adminDb;
};

export const sendJson = (response: ServerResponse, status: number, payload: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

export const getRequestUrl = (request: IncomingMessage) =>
  new URL(request.url || '/', 'https://eliteviptips.com');

export const verifyCronRequest = (request: IncomingMessage) => {
  const secret = getEnv('CRON_SECRET');
  if (!secret) return true;
  const headerSecret = request.headers['x-cron-secret'];
  const authHeader = request.headers.authorization;
  return headerSecret === secret || authHeader === `Bearer ${secret}`;
};

export const dateInBelgrade = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date);

const timeInBelgrade = (value?: string) => {
  if (!value) return '20:00';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value.slice(11, 16) || '20:00';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

const apiKey = () => getEnv('API_FOOTBALL_KEY') || getEnv('VITE_FOOTBALL_API_KEY');
const hasApiErrors = (errors: unknown) => {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === 'object') return Object.keys(errors as Record<string, unknown>).length > 0;
  return true;
};

const requestApiFootballPayload = async <T>(path: string, params: Record<string, string>) => {
  const key = apiKey();
  if (!key) throw new Error('API_FOOTBALL_KEY is not configured.');
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([paramKey, value]) => value && url.searchParams.set(paramKey, value));
  const apiResponse = await fetch(url, { headers: { 'x-apisports-key': key } });
  if (!apiResponse.ok) throw new Error(`API-Football ${path} failed: ${apiResponse.status}`);
  return apiResponse.json() as Promise<{ response?: T[]; errors?: unknown }>;
};

const requestApiFootball = async <T>(path: string, params: Record<string, string>) => {
  const payload = await requestApiFootballPayload<T>(path, params);
  if (hasApiErrors(payload.errors)) {
    throw new Error(`API-Football ${path} returned errors: ${JSON.stringify(payload.errors)}`);
  }
  return payload.response || [];
};

const isWorldCupFixture = (fixture: ApiFixture) =>
  String(fixture.league?.id || '') === WORLD_CUP_LEAGUE_ID
  || /world cup/i.test(fixture.league?.name || '');

export const fetchWorldCupFixtures = async (date: string) => {
  try {
    const directFixtures = await requestApiFootball<ApiFixture>('/fixtures', {
      league: WORLD_CUP_LEAGUE_ID,
      season: WORLD_CUP_SEASON,
      date,
      timezone: TIMEZONE,
    });
    if (directFixtures.length > 0) return directFixtures;
  } catch {
    // Some API-Football plans expose current-date fixtures but block league+season queries.
  }

  const dateFixtures = await requestApiFootball<ApiFixture>('/fixtures', {
    date,
    timezone: TIMEZONE,
  });
  return dateFixtures.filter(isWorldCupFixture);
};

const parseOdd = (value?: string) => {
  const odd = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(odd) && odd > 1.01 ? Number(odd.toFixed(2)) : null;
};

const normalizeOutcomeName = (value?: string) =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const includesAnyAlias = (value: string | undefined, aliases: string[]) => {
  const normalized = normalizeOutcomeName(value);
  return aliases.some((alias) => normalized === normalizeOutcomeName(alias));
};

const favoredSide = (fixture: ApiFixture) => {
  const home = fixture.teams?.home?.name || '';
  const away = fixture.teams?.away?.name || '';
  const combined = `${home} ${away}`.toLowerCase();
  const strongHome = /argentina|brazil|france|spain|england|germany|portugal|netherlands|belgium|italy|croatia|uruguay|usa|mexico/.test(home.toLowerCase());
  const strongAway = /argentina|brazil|france|spain|england|germany|portugal|netherlands|belgium|italy|croatia|uruguay|usa|mexico/.test(away.toLowerCase());
  if (strongHome && !strongAway) return 'home';
  if (strongAway && !strongHome) return 'away';
  if (/argentina|brazil|france|spain|england|germany|portugal|netherlands/.test(combined)) {
    return strongHome ? 'home' : strongAway ? 'away' : 'home';
  }
  return 'home';
};

const marketDefinitions: MarketDefinition[] = [
  {
    category: 'goals_safe',
    prediction: () => 'Over 1.5',
    betPatterns: [/goals over\/under/i, /over\/under/i, /total goals/i],
    outcomeAliases: () => ['over 1.5'],
    confidence: 72,
  },
  {
    category: 'goals_value',
    prediction: () => 'Over 2.5',
    betPatterns: [/goals over\/under/i, /over\/under/i, /total goals/i],
    outcomeAliases: () => ['over 2.5'],
    confidence: 64,
  },
  {
    category: 'btts',
    prediction: () => 'GG',
    betPatterns: [/both teams score/i, /btts/i],
    outcomeAliases: () => ['yes'],
    confidence: 63,
  },
  {
    category: 'double_chance',
    prediction: (fixture) => favoredSide(fixture) === 'away' ? 'X2' : '1X',
    betPatterns: [/double chance/i],
    outcomeAliases: (fixture) => favoredSide(fixture) === 'away' ? ['draw/away', 'x2'] : ['home/draw', '1x'],
    confidence: 68,
  },
  {
    category: 'favorite_win',
    prediction: (fixture) => favoredSide(fixture) === 'away' ? '2' : '1',
    betPatterns: [/match winner/i, /1x2/i, /winner/i],
    outcomeAliases: (fixture) => favoredSide(fixture) === 'away' ? ['away', '2'] : ['home', '1'],
    confidence: 61,
  },
  {
    category: 'team_goal',
    prediction: (fixture) => `${favoredSide(fixture) === 'away' ? fixture.teams?.away?.name : fixture.teams?.home?.name} daje gol`,
    betPatterns: ([
      /home team total goals/i,
      /away team total goals/i,
      /total - home/i,
      /total - away/i,
      /home team score a goal/i,
      /away team score a goal/i,
    ]),
    outcomeAliases: (fixture) => favoredSide(fixture) === 'away' ? ['over 0.5', 'yes'] : ['over 0.5', 'yes'],
    confidence: 69,
  },
  {
    category: 'first_half_goal',
    prediction: () => '1. poluvreme Over 0.5',
    betPatterns: [/goals over\/under first half/i, /over\/under first half/i, /1st half/i],
    outcomeAliases: () => ['over 0.5'],
    confidence: 62,
  },
  {
    category: 'under_control',
    prediction: () => 'Under 3.5',
    betPatterns: [/goals over\/under/i, /over\/under/i, /total goals/i],
    outcomeAliases: () => ['under 3.5'],
    confidence: 66,
  },
];

const isMatchingBet = (betName: string, definition: MarketDefinition, fixture: ApiFixture) => {
  const prediction = definition.prediction(fixture);
  if (definition.category === 'team_goal') {
    const side = favoredSide(fixture);
    const normalized = normalizeOutcomeName(betName);
    const sidePattern = side === 'away'
      ? /away team total goals|total - away|away team score a goal/i
      : /home team total goals|total - home|home team score a goal/i;
    return sidePattern.test(normalized);
  }
  return definition.betPatterns.some((pattern) => pattern.test(betName))
    || (prediction === '1' && /match winner|1x2|winner/i.test(betName))
    || (prediction === '2' && /match winner|1x2|winner/i.test(betName));
};

const findOddForMarket = (oddsItems: ApiOddsItem[], fixture: ApiFixture, definition: MarketDefinition) => {
  const fixtureId = fixture.fixture?.id;
  if (!fixtureId) return null;
  const item = oddsItems.find((entry) => entry.fixture?.id === fixtureId);
  const expectedOutcomes = definition.outcomeAliases(fixture);
  for (const bookmaker of item?.bookmakers || []) {
    for (const bet of bookmaker.bets || []) {
      if (!isMatchingBet(bet.name || '', definition, fixture)) continue;
      const outcome = bet.values?.find((value) =>
        includesAnyAlias(value.value, expectedOutcomes),
      );
      const odd = parseOdd(outcome?.odd);
      if (odd) return odd;
    }
  }
  return null;
};

export const fetchWorldCupOdds = async (date: string, fixtures: ApiFixture[] = []) => {
  const oddsByFixture = new Map<number, ApiOddsItem>();
  try {
    const dateOdds = await requestApiFootball<ApiOddsItem>('/odds', {
      league: WORLD_CUP_LEAGUE_ID,
      season: WORLD_CUP_SEASON,
      date,
      timezone: TIMEZONE,
    });
    dateOdds.forEach((item) => item.fixture?.id && oddsByFixture.set(item.fixture.id, item));
  } catch {
    // Fixture-level odds are used below when the league odds endpoint is unavailable.
  }

  for (const fixture of fixtures) {
    const fixtureId = fixture.fixture?.id;
    if (!fixtureId || oddsByFixture.has(fixtureId)) continue;
    try {
      const fixtureOdds = await requestApiFootball<ApiOddsItem>('/odds', { fixture: String(fixtureId) });
      fixtureOdds.forEach((item) => item.fixture?.id && oddsByFixture.set(item.fixture.id, item));
    } catch {
      // Missing odds for one fixture should not block the full daily run.
    }
  }

  return Array.from(oddsByFixture.values());
};

const rotatedMarketCategories = (dateSeed = '') => {
  const seed = dateSeed
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const offset = seed % MARKET_ROTATION.length;
  return [...MARKET_ROTATION.slice(offset), ...MARKET_ROTATION.slice(0, offset)];
};

const riskLevelForOdd = (odd: number): WorldCupPick['riskLevel'] =>
  odd <= 1.65 ? 'LOW' : odd <= 1.9 ? 'MEDIUM' : 'HIGH';

const buildCandidatesForFixture = (
  fixture: ApiFixture,
  odds: ApiOddsItem[],
  marketOrder: MarketCategory[],
): PickCandidate[] => {
  const definitions = marketOrder
    .map((category) => marketDefinitions.find((definition) => definition.category === category))
    .filter((definition): definition is MarketDefinition => Boolean(definition));

  return definitions.flatMap((definition) => {
    const odd = findOddForMarket(odds, fixture, definition);
    if (!odd) return [];
    return [{
      fixture,
      marketCategory: definition.category,
      prediction: definition.prediction(fixture),
      odds: odd,
      confidence: definition.confidence,
      riskLevel: riskLevelForOdd(odd),
    }];
  });
};

const pickDiverseCandidates = (candidates: PickCandidate[]) => {
  const selected: PickCandidate[] = [];
  const usedFixtures = new Set<number>();
  const usedCategories = new Set<MarketCategory>();

  const selectCandidate = (pool: PickCandidate[]) => {
    const diverse = pool.find((candidate) =>
      !usedFixtures.has(candidate.fixture.fixture!.id!)
      && !usedCategories.has(candidate.marketCategory),
    );
    const fallback = pool.find((candidate) => !usedFixtures.has(candidate.fixture.fixture!.id!));
    const candidate = diverse || fallback;
    if (!candidate) return null;
    selected.push(candidate);
    usedFixtures.add(candidate.fixture.fixture!.id!);
    usedCategories.add(candidate.marketCategory);
    return candidate;
  };

  const freePool = candidates
    .filter((candidate) => candidate.odds >= 1.15 && candidate.odds <= 1.75)
    .sort((left, right) => right.confidence - left.confidence || left.odds - right.odds);
  selectCandidate(freePool.length ? freePool : candidates);

  const vipPool = candidates
    .filter((candidate) => candidate.odds >= 1.2)
    .sort((left, right) => {
      const leftValue = Math.abs(left.odds - 1.65);
      const rightValue = Math.abs(right.odds - 1.65);
      return leftValue - rightValue || right.confidence - left.confidence;
    });
  while (selected.length < 3 && selectCandidate(vipPool.length ? vipPool : candidates)) {
    // Keep selecting until we have one FREE and up to two VIP picks.
  }

  return selected;
};

export const buildWorldCupPicks = (fixtures: ApiFixture[], odds: ApiOddsItem[]) => {
  const marketOrder = rotatedMarketCategories(fixtures[0]?.fixture?.date?.slice(0, 10) || '');
  const candidates = fixtures
    .filter((fixture) => fixture.fixture?.id && fixture.teams?.home?.name && fixture.teams?.away?.name && fixture.fixture?.date)
    .flatMap((fixture) => buildCandidatesForFixture(fixture, odds, marketOrder));

  const picks = pickDiverseCandidates(candidates);
  const free = picks.slice(0, 1).map((pick, index) => ({ ...pick, access: 'FREE' as const, sortOrder: index }));
  const vip = picks.slice(1, 3).map((pick, index) => ({ ...pick, access: 'VIP' as const, sortOrder: index + 1 }));
  return [...free, ...vip];
};

const analysisIdForPick = (pick: Pick<WorldCupPick, 'fixture' | 'access'>) =>
  `world-cup-2026-${pick.fixture.fixture?.id}-${pick.access.toLowerCase()}`;

const publicDailyPayload = (analysis: Record<string, unknown>) => ({
  id: analysis.id,
  sport: 'football',
  league: analysis.league,
  date: analysis.date,
  time: analysis.time,
  type: 'VIP',
  status: analysis.status,
  locked: true,
});

const freeDailyPayload = (analysis: Record<string, unknown>) => ({
  ...analysis,
  reasoning: analysis.freeAnalysis || analysis.reasoning || '',
  analysis: analysis.freeAnalysis || analysis.reasoning || '',
  vipAnalysis: FieldValue.delete(),
});

const syncDailyPublicIndexesForStatus = async (analysis: StoredDailyAnalysis, status: string) => {
  const db = initAdminDb();
  const publicRef = db.collection(PUBLIC_DAILY_COLLECTION).doc(analysis.id);
  const freeRef = db.collection(FREE_DAILY_COLLECTION).doc(analysis.id);

  if (status === 'ACTIVE' || status === 'WON') {
    if (analysis.access === 'VIP') {
      await publicRef.set(publicDailyPayload({ ...analysis, status }), { merge: true });
      await freeRef.delete().catch(() => undefined);
      return;
    }

    await freeRef.set(freeDailyPayload({ ...analysis, status }), { merge: true });
    await publicRef.delete().catch(() => undefined);
    return;
  }

  await Promise.all([
    publicRef.delete().catch(() => undefined),
    freeRef.delete().catch(() => undefined),
  ]);
};

export const upsertWorldCupPicks = async (date: string) => {
  const db = initAdminDb();
  const fixtures = await fetchWorldCupFixtures(date);
  const odds = await fetchWorldCupOdds(date, fixtures);
  const picks = buildWorldCupPicks(fixtures, odds);
  let created = 0;
  let updatedExisting = 0;
  let skippedExisting = 0;

  for (const pick of picks) {
    const id = analysisIdForPick(pick);
    const ref = db.collection(DAILY_ANALYSES_COLLECTION).doc(id);
    const existing = await ref.get();
    if (existing.exists) {
      const existingData = existing.data() || {};
      const canRefreshAutoPick = existingData.source === 'api-football'
        && existingData.competition === 'World Cup 2026'
        && existingData.manualOverride !== true
        && existingData.resultManualOverride !== true
        && ['ACTIVE', 'PENDING_REVIEW'].includes(String(existingData.status || 'ACTIVE'));

      if (!canRefreshAutoPick) {
        skippedExisting += 1;
        continue;
      }

      const refreshPayload = {
        prediction: pick.prediction,
        marketCategory: pick.marketCategory,
        odds: pick.odds,
        confidence: pick.confidence,
        riskLevel: pick.riskLevel,
        access: pick.access,
        status: 'ACTIVE',
        enabled: true,
        hidden: false,
        badges: pick.access === 'VIP' ? ['WORLD CUP', 'VIP PICK'] : ['WORLD CUP', 'FREE PICK'],
        updatedAt: FieldValue.serverTimestamp(),
      };
      await ref.set(refreshPayload, { merge: true });
      await syncDailyPublicIndexesForStatus({ id, ...existingData, ...refreshPayload } as StoredDailyAnalysis, 'ACTIVE');
      await logCron({
        action: 'seed',
        status: 'success',
        message: `World Cup auto pick refreshed: ${existingData.homeTeam || pick.fixture.teams?.home?.name} - ${existingData.awayTeam || pick.fixture.teams?.away?.name}.`,
        details: {
          id,
          date,
          fixtureId: pick.fixture.fixture?.id,
          access: pick.access,
          marketCategory: pick.marketCategory,
          prediction: pick.prediction,
          odds: pick.odds,
        },
      });
      updatedExisting += 1;
      continue;
    }

    const fixtureDate = pick.fixture.fixture?.date || `${date}T20:00:00+01:00`;
    const time = timeInBelgrade(fixtureDate);
    const analysis = {
      id,
      source: 'api-football',
      sport: 'football',
      competition: 'World Cup 2026',
      league: pick.fixture.league?.name || 'World Cup',
      leagueId: pick.fixture.league?.id || Number(WORLD_CUP_LEAGUE_ID),
      season: pick.fixture.league?.season || Number(WORLD_CUP_SEASON),
      fixtureId: pick.fixture.fixture?.id,
      date,
      time,
      matchTime: time,
      kickoffTime: time,
      publishedDate: date,
      publishedTime: timeInBelgrade(new Date().toISOString()),
      publishedAt: new Date().toISOString(),
      homeTeam: pick.fixture.teams?.home?.name || '',
      awayTeam: pick.fixture.teams?.away?.name || '',
      homeLogo: pick.fixture.teams?.home?.logo || '',
      awayLogo: pick.fixture.teams?.away?.logo || '',
      prediction: pick.prediction,
      marketCategory: pick.marketCategory,
      odds: pick.odds,
      confidence: pick.confidence,
      riskLevel: pick.riskLevel,
      units: pick.access === 'VIP' ? 5 : 3,
      access: pick.access,
      status: 'ACTIVE',
      enabled: true,
      hidden: false,
      topPick: pick.access === 'VIP' && pick.sortOrder === 1,
      badges: pick.access === 'VIP' ? ['WORLD CUP', 'VIP PICK'] : ['WORLD CUP', 'FREE PICK'],
      reasoning: '',
      analysis: '',
      freeAnalysis: '',
      vipAnalysis: '',
      manualOverride: false,
      resultManualOverride: false,
      sortOrder: pick.sortOrder,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await ref.set(analysis, { merge: true });
    if (pick.access === 'VIP') {
      await db.collection(PUBLIC_DAILY_COLLECTION).doc(id).set(publicDailyPayload(analysis), { merge: true });
    } else {
      await db.collection(FREE_DAILY_COLLECTION).doc(id).set(freeDailyPayload(analysis), { merge: true });
      await db.collection(PUBLIC_DAILY_COLLECTION).doc(id).delete().catch(() => undefined);
    }
    await logCron({
      action: 'seed',
      status: 'success',
      message: `World Cup pick inserted: ${analysis.homeTeam} - ${analysis.awayTeam}.`,
      details: {
        id,
        date,
        fixtureId: analysis.fixtureId,
        access: pick.access,
        marketCategory: pick.marketCategory,
        prediction: pick.prediction,
        odds: pick.odds,
      },
    });
    created += 1;
  }

  await logCron({
    action: 'seed',
    status: 'success',
    message: `World Cup seed completed for ${date}.`,
    details: { date, fixtures: fixtures.length, odds: odds.length, selected: picks.length, created, updatedExisting, skippedExisting },
  });

  return { date, fixtures: fixtures.length, odds: odds.length, selected: picks.length, created, updatedExisting, skippedExisting };
};

const evaluatePrediction = (
  prediction: string,
  homeScore: number,
  awayScore: number,
  fixture?: ApiFixture,
) => {
  const normalized = prediction.trim().toUpperCase();
  const total = homeScore + awayScore;
  if (normalized === 'GG') return homeScore > 0 && awayScore > 0 ? 'WON' : 'LOST';
  if (normalized === '1') return homeScore > awayScore ? 'WON' : 'LOST';
  if (normalized === 'X') return homeScore === awayScore ? 'WON' : 'LOST';
  if (normalized === '2') return awayScore > homeScore ? 'WON' : 'LOST';
  if (normalized === '1X') return homeScore >= awayScore ? 'WON' : 'LOST';
  if (normalized === 'X2') return awayScore >= homeScore ? 'WON' : 'LOST';
  if (normalized === '3+' || normalized === 'OVER 2.5') return total >= 3 ? 'WON' : 'LOST';
  if (normalized === '2+' || normalized === 'OVER 1.5') return total >= 2 ? 'WON' : 'LOST';
  if (normalized === 'UNDER 3.5') return total < 4 ? 'WON' : 'LOST';
  if (normalized.includes('POLUVREME') && normalized.includes('OVER 0.5')) {
    const halfHome = fixture?.score?.halftime?.home;
    const halfAway = fixture?.score?.halftime?.away;
    if (halfHome === null || halfHome === undefined || halfAway === null || halfAway === undefined) {
      return 'PENDING_REVIEW';
    }
    return halfHome + halfAway >= 1 ? 'WON' : 'LOST';
  }
  if (normalized.includes('DAJE GOL')) {
    const homeTeam = normalizeOutcomeName(fixture?.teams?.home?.name).toUpperCase();
    const awayTeam = normalizeOutcomeName(fixture?.teams?.away?.name).toUpperCase();
    if (homeTeam && normalized.includes(homeTeam)) return homeScore > 0 ? 'WON' : 'LOST';
    if (awayTeam && normalized.includes(awayTeam)) return awayScore > 0 ? 'WON' : 'LOST';
    return 'PENDING_REVIEW';
  }
  const overMatch = normalized.match(/^OVER\s*(\d+(?:\.\d+)?)$/);
  if (overMatch) {
    const threshold = Number(overMatch[1]);
    if (Number.isInteger(threshold) && total === threshold) return 'REFUND';
    return total > threshold ? 'WON' : 'LOST';
  }
  const underMatch = normalized.match(/^UNDER\s*(\d+(?:\.\d+)?)$/);
  if (underMatch) {
    const threshold = Number(underMatch[1]);
    if (Number.isInteger(threshold) && total === threshold) return 'REFUND';
    return total < threshold ? 'WON' : 'LOST';
  }
  return 'PENDING_REVIEW';
};

const publishHistoryTicket = async (analysis: StoredDailyAnalysis, status: string, result: string) => {
  const db = initAdminDb();
  const ticketId = `daily-${analysis.id}`;
  const ticketStatus = status === 'REFUND' ? 'REFUND' : status === 'WON' ? 'WON' : status === 'LOST' ? 'LOST' : 'PENDING';
  if (ticketStatus === 'PENDING') return;
  const ticket = {
    id: ticketId,
    source: 'admin',
    type: 'vip_monthly',
    sourceProvider: 'api-football',
    fixtureId: String(analysis.fixtureId || ''),
    publicationStatus: 'PUBLISHED',
    date: analysis.date,
    publishedDate: analysis.publishedDate || analysis.date,
    publishedTime: analysis.publishedTime || '12:00',
    publishedAt: analysis.publishedAt || new Date().toISOString(),
    matches: [{
      id: `${analysis.id}-match`,
      externalMatchId: String(analysis.fixtureId || ''),
      teams: `${analysis.homeTeam} - ${analysis.awayTeam}`,
      homeTeam: analysis.homeTeam,
      awayTeam: analysis.awayTeam,
      league: analysis.league,
      prediction: analysis.prediction,
      odds: Number(analysis.odds),
      time: analysis.kickoffTime || analysis.matchTime || analysis.time,
      eventDate: analysis.date,
      eventTime: analysis.kickoffTime || analysis.matchTime || analysis.time,
      result,
      status: ticketStatus,
      analysis: analysis.access === 'VIP' ? analysis.vipAnalysis || analysis.analysis || '' : '',
    }],
    totalOdds: Number(analysis.odds),
    ticketType: 'SINGL',
    unitsStake: Number(analysis.units) || 3,
    status: ticketStatus,
    analysis: analysis.access === 'VIP' ? analysis.vipAnalysis || analysis.analysis || '' : '',
    isVip: analysis.access === 'VIP',
    result,
    updatedAt: new Date().toISOString(),
  };
  await db.collection('tickets').doc(ticketId).set(ticket, { merge: true });
  await db.collection('publicTickets').doc(ticketId).set(ticket, { merge: true });
  await db.collection('publicStatsTickets').doc(ticketId).set(ticket, { merge: true });
};

export const updateWorldCupResults = async () => {
  const db = initAdminDb();
  const snapshot = await db.collection(DAILY_ANALYSES_COLLECTION)
    .where('source', '==', 'api-football')
    .where('competition', '==', 'World Cup 2026')
    .where('status', 'in', ['ACTIVE', 'PENDING_REVIEW'])
    .limit(30)
    .get();
  let updated = 0;
  let pendingReview = 0;
  let skipped = 0;

  for (const docSnapshot of snapshot.docs) {
    const analysis = { id: docSnapshot.id, ...docSnapshot.data() } as StoredDailyAnalysis;
    if (analysis.resultManualOverride === true || analysis.manualOverride === true) {
      skipped += 1;
      continue;
    }
    const fixtureId = String(analysis.fixtureId || '');
    if (!fixtureId) {
      pendingReview += 1;
      await docSnapshot.ref.update({ status: 'PENDING_REVIEW', updatedAt: FieldValue.serverTimestamp() });
      await syncDailyPublicIndexesForStatus({ ...analysis, status: 'PENDING_REVIEW' }, 'PENDING_REVIEW');
      await logCron({
        action: 'results',
        status: 'success',
        message: `World Cup pick moved to pending review: ${analysis.homeTeam} - ${analysis.awayTeam}.`,
        details: { id: analysis.id, fixtureId: analysis.fixtureId, reason: 'missing_fixture_id' },
      });
      continue;
    }
    const fixtures = await requestApiFootball<ApiFixture>('/fixtures', { id: fixtureId });
    const fixture = fixtures[0];
    const shortStatus = fixture?.fixture?.status?.short || '';
    const homeScore = fixture?.score?.fulltime?.home ?? fixture?.goals?.home ?? null;
    const awayScore = fixture?.score?.fulltime?.away ?? fixture?.goals?.away ?? null;

    if (POSTPONED_STATUSES.has(shortStatus)) {
      await docSnapshot.ref.update({
        fixtureStatus: shortStatus,
        status: 'REFUND',
        updatedAt: FieldValue.serverTimestamp(),
      });
      await syncDailyPublicIndexesForStatus(analysis, 'REFUND');
      await publishHistoryTicket(analysis, 'REFUND', '');
      await logCron({
        action: 'results',
        status: 'success',
        message: `World Cup pick marked REFUND: ${analysis.homeTeam} - ${analysis.awayTeam}.`,
        details: { id: analysis.id, fixtureId, fixtureStatus: shortStatus },
      });
      updated += 1;
      continue;
    }

    if (!FINISHED_STATUSES.has(shortStatus) || homeScore === null || awayScore === null) {
      skipped += 1;
      continue;
    }

    const status = evaluatePrediction(String(analysis.prediction || ''), homeScore, awayScore, fixture);
    const result = `${homeScore}:${awayScore}`;
    await docSnapshot.ref.update({
      fixtureStatus: shortStatus,
      isFinished: true,
      homeScore,
      awayScore,
      result,
      status,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (status === 'PENDING_REVIEW') {
      await syncDailyPublicIndexesForStatus({ ...analysis, homeScore, awayScore, result, status }, status);
      await logCron({
        action: 'results',
        status: 'success',
        message: `World Cup pick needs manual review: ${analysis.homeTeam} - ${analysis.awayTeam}.`,
        details: { id: analysis.id, fixtureId, result, prediction: analysis.prediction },
      });
      pendingReview += 1;
    } else {
      await syncDailyPublicIndexesForStatus({ ...analysis, homeScore, awayScore, result, status }, status);
      await publishHistoryTicket({ ...analysis, homeScore, awayScore, result }, status, result);
      await logCron({
        action: 'results',
        status: 'success',
        message: `World Cup pick marked ${status}: ${analysis.homeTeam} - ${analysis.awayTeam}.`,
        details: { id: analysis.id, fixtureId, result, prediction: analysis.prediction },
      });
      updated += 1;
    }
  }

  await logCron({
    action: 'results',
    status: 'success',
    message: 'World Cup result update completed.',
    details: { checked: snapshot.size, updated, pendingReview, skipped },
  });

  return { checked: snapshot.size, updated, pendingReview, skipped };
};

export const logCron = async (payload: CronLogPayload) => {
  const db = initAdminDb();
  await db.collection(CRON_LOG_COLLECTION).add({
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
  });
};
