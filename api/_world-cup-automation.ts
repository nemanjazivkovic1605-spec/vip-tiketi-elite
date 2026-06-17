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
  score?: { fulltime?: { home?: number | null; away?: number | null } };
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
  odds: number;
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  sortOrder: number;
};

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
const SUPPORTED_PREDICTIONS = ['1', '2', '1X', 'X2', 'GG', 'Over 1.5', 'Over 2.5'];

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

const requestApiFootball = async <T>(path: string, params: Record<string, string>) => {
  const key = apiKey();
  if (!key) throw new Error('API_FOOTBALL_KEY is not configured.');
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([paramKey, value]) => value && url.searchParams.set(paramKey, value));
  const apiResponse = await fetch(url, { headers: { 'x-apisports-key': key } });
  if (!apiResponse.ok) throw new Error(`API-Football ${path} failed: ${apiResponse.status}`);
  const payload = await apiResponse.json() as { response?: T[]; errors?: unknown };
  return payload.response || [];
};

export const fetchWorldCupFixtures = async (date: string) =>
  requestApiFootball<ApiFixture>('/fixtures', {
    league: WORLD_CUP_LEAGUE_ID,
    season: WORLD_CUP_SEASON,
    date,
    timezone: TIMEZONE,
  });

const parseOdd = (value?: string) => {
  const odd = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(odd) && odd > 1.01 ? Number(odd.toFixed(2)) : null;
};

const normalizeOutcomeName = (value?: string) =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const marketAliases: Record<string, string[]> = {
  '1': ['home', '1'],
  '2': ['away', '2'],
  '1X': ['home/draw', '1x'],
  'X2': ['draw/away', 'x2'],
  GG: ['yes'],
  'Over 1.5': ['over 1.5'],
  'Over 2.5': ['over 2.5'],
};

const isBetNameForPrediction = (betName: string, prediction: string) => {
  const normalized = normalizeOutcomeName(betName);
  if (['1', '2'].includes(prediction)) return /match winner|1x2|winner/i.test(normalized);
  if (['1X', 'X2'].includes(prediction)) return /double chance/i.test(normalized);
  if (prediction === 'GG') return /both teams score|btts/i.test(normalized);
  if (prediction.startsWith('Over')) return /goals over\/under|over\/under|total goals/i.test(normalized);
  return false;
};

const findOddForPrediction = (oddsItems: ApiOddsItem[], fixtureId: number, prediction: string) => {
  const item = oddsItems.find((entry) => entry.fixture?.id === fixtureId);
  const expectedOutcomes = marketAliases[prediction] || [];
  for (const bookmaker of item?.bookmakers || []) {
    for (const bet of bookmaker.bets || []) {
      if (!isBetNameForPrediction(bet.name || '', prediction)) continue;
      const outcome = bet.values?.find((value) =>
        expectedOutcomes.includes(normalizeOutcomeName(value.value)),
      );
      const odd = parseOdd(outcome?.odd);
      if (odd) return odd;
    }
  }
  return null;
};

export const fetchWorldCupOdds = async (date: string) => {
  try {
    return await requestApiFootball<ApiOddsItem>('/odds', {
      league: WORLD_CUP_LEAGUE_ID,
      season: WORLD_CUP_SEASON,
      date,
      timezone: TIMEZONE,
    });
  } catch {
    return [];
  }
};

const choosePredictionCandidates = (fixture: ApiFixture) => {
  const home = fixture.teams?.home?.name || '';
  const away = fixture.teams?.away?.name || '';
  const combined = `${home} ${away}`.toLowerCase();
  if (/argentina|brazil|france|spain|england|germany|portugal|netherlands/.test(combined)) {
    return ['Over 1.5', '1X', 'X2', '1', '2', 'Over 2.5', 'GG'];
  }
  return ['Over 1.5', '1X', 'X2', 'GG', 'Over 2.5', '1', '2'];
};

export const buildWorldCupPicks = (fixtures: ApiFixture[], odds: ApiOddsItem[]) => {
  const picks: Array<Omit<WorldCupPick, 'access' | 'sortOrder'>> = fixtures
    .filter((fixture) => fixture.fixture?.id && fixture.teams?.home?.name && fixture.teams?.away?.name && fixture.fixture?.date)
    .flatMap((fixture) => {
      const fixtureId = fixture.fixture!.id!;
      const prediction = choosePredictionCandidates(fixture)
        .map((candidate) => ({ prediction: candidate, odds: findOddForPrediction(odds, fixtureId, candidate) }))
        .find((candidate) => candidate.odds && candidate.odds > 1.01);
      if (!prediction?.odds) return [];
      return [{
        fixture,
        prediction: prediction.prediction,
        odds: prediction.odds,
        confidence: prediction.prediction === 'Over 1.5' ? 72 : prediction.prediction.includes('X') ? 68 : 64,
        riskLevel: prediction.odds <= 1.65 ? 'LOW' as const : prediction.odds <= 1.9 ? 'MEDIUM' as const : 'HIGH' as const,
      }];
    })
    .sort((a, b) => a.odds - b.odds);

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
  const odds = await fetchWorldCupOdds(date);
  const picks = buildWorldCupPicks(fixtures, odds);
  let created = 0;
  let skippedExisting = 0;

  for (const pick of picks) {
    const id = analysisIdForPick(pick);
    const ref = db.collection(DAILY_ANALYSES_COLLECTION).doc(id);
    const existing = await ref.get();
    if (existing.exists) {
      skippedExisting += 1;
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
    details: { date, fixtures: fixtures.length, odds: odds.length, selected: picks.length, created, skippedExisting },
  });

  return { date, fixtures: fixtures.length, odds: odds.length, selected: picks.length, created, skippedExisting };
};

const evaluatePrediction = (prediction: string, homeScore: number, awayScore: number) => {
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

    const status = evaluatePrediction(String(analysis.prediction || ''), homeScore, awayScore);
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
