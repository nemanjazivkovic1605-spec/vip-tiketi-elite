import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { DailyAnalysisItem, DailyAnalysisStatus, TicketStatus, TipPublicationStatus } from '../types';
import { createDailyPublicationMeta, getDailyPublicationMeta, getKickoffTime } from '../utils/dailyPublication';
import { isFinishedDailyAnalysisStatus, isVisibleInDailyFeed, normalizeDailyAnalysisStatus } from '../utils/dailyLifecycle';
import { dailyAnalysisAiService, type AiAnalysisResult, type AnalysisGenerationType } from './dailyAnalysisAiService';
import { getCachedQuery, invalidateCachedQueries } from './firestore/queryCache';
import { deleteDocIfExists, setDocIfChanged } from './firestore/incrementalWrite';
import { formatLeagueName } from '../utils/leagueMapper';
import { evaluateFullTimePrediction as evaluateDailyAnalysisStatus } from '../utils/predictionResults';
export { evaluateFullTimePrediction as evaluateDailyAnalysisStatus } from '../utils/predictionResults';

const COLLECTION = 'dailyAnalyses';
const PUBLIC_COLLECTION = 'publicDailyAnalyses';
const FREE_COLLECTION = 'freeDailyAnalyses';
const inFlightPulls = new Map<string, AbortController>();
const DAILY_PUBLIC_CACHE_KEY = 'daily-analyses:public';
const DAILY_FREE_CACHE_KEY = 'daily-analyses:free';
const dailyIndexCacheKeys = new Set<string>();
const getDailyIndexCacheKey = (collectionName: string, date: string) =>
  `${collectionName === PUBLIC_COLLECTION ? DAILY_PUBLIC_CACHE_KEY : DAILY_FREE_CACHE_KEY}:${date}`;
const invalidateDailyIndexCache = () => {
  invalidateCachedQueries(DAILY_PUBLIC_CACHE_KEY, DAILY_FREE_CACHE_KEY, ...dailyIndexCacheKeys);
  dailyIndexCacheKeys.clear();
};

const dailyAdminDebug = (event: string, details: Record<string, unknown>) => {
  if (import.meta.env.DEV) {
    console.log(`[daily-admin-debug] ${event}`, details);
  }
};

type DailyAnalysesAccess = {
  canAccessFree: boolean;
  canAccessVip: boolean;
  isAdmin: boolean;
};

type ApiFixtureResult = {
  fixtureId?: number;
  lookupMethod?: 'fixture_id' | 'teams_date_league';
  homeScore: number | null;
  awayScore: number | null;
  status?: string;
  statusLong?: string;
  elapsed?: number | null;
  finished: boolean;
  postponed: boolean;
};

export type ResultRefreshOutcome = {
  updated: boolean;
  skippedManualOverride?: boolean;
  result?: ApiFixtureResult | null;
  status?: DailyAnalysisStatus;
  message: string;
};

const toIsoString = (value: unknown) => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'toDate' in value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().toISOString();
  }
  return undefined;
};

const normalizeNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeOptionalPercent = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const formatScoreResult = (homeScore?: number, awayScore?: number): string | undefined =>
  homeScore !== undefined && awayScore !== undefined ? `${homeScore}:${awayScore}` : undefined;

const getAnalysisTextForType = (
  value: Pick<DailyAnalysisItem, 'access' | 'reasoning' | 'analysis' | 'freeAnalysis' | 'vipAnalysis'>,
  analysisType: AnalysisGenerationType = value.access,
) => {
  const hasExplicit = analysisType === 'VIP' ? value.vipAnalysis !== undefined : value.freeAnalysis !== undefined;
  const explicit = analysisType === 'VIP' ? value.vipAnalysis?.trim() : value.freeAnalysis?.trim();
  if (hasExplicit) return explicit || '';
  const otherExplicit = analysisType === 'VIP' ? value.freeAnalysis?.trim() : value.vipAnalysis?.trim();
  if (otherExplicit) return '';
  return value.analysis?.trim() || value.reasoning?.trim() || '';
};

const hasLegacyApiPlaceholder = (data: DocumentData) =>
  (data.source === 'api-football' || data.source === 'api-basketball')
  && (
    (
      data.manualOverride !== true
      && data.aiSource !== 'gemini'
      && data.aiSource !== 'fallback'
      && data.analysisSource !== 'api-predictions'
      && Boolean(String(data.freeAnalysis || data.vipAnalysis || data.analysis || data.reasoning || '').trim())
    )
    || /Ovaj par vi(?:s|š)e li(?:c|č)i|Me(?:c|č) deluje otvoreno|Fokus je na efikasnosti|predstavlja razuman izbor u odnosu na profil ovog meca|odgovorno upravljanje ulogom/i.test(
      String(data.freeAnalysis || data.vipAnalysis || data.analysis || data.reasoning || ''),
    )
  );

const getNormalizedStoredAnalysis = (data: DocumentData) => {
  if (hasLegacyApiPlaceholder(data)) return '';
  const access = data.access === 'VIP' ? 'VIP' : 'FREE';
  const explicit = access === 'VIP' ? data.vipAnalysis : data.freeAnalysis;
  const otherExplicit = access === 'VIP' ? data.freeAnalysis : data.vipAnalysis;
  if (String(explicit || '').trim()) return String(explicit).trim();
  if (String(otherExplicit || '').trim()) return '';
  return String(data.analysis || data.reasoning || '').trim();
};

export const isQuickResultPredictionSupported = (prediction: string) =>
  evaluateDailyAnalysisStatus(prediction, 1, 1) !== undefined;

const normalizeManual = (data: DocumentData, id: string): DailyAnalysisItem => {
  const access = data.access === 'VIP' ? 'VIP' : 'FREE';
  const isLegacyPlaceholder = hasLegacyApiPlaceholder(data);
  const analysisText = getNormalizedStoredAnalysis(data);
  const freeAnalysis = isLegacyPlaceholder ? '' : String(data.freeAnalysis || (access === 'FREE' ? analysisText : '')).trim();
  const vipAnalysis = isLegacyPlaceholder ? '' : String(data.vipAnalysis || (access === 'VIP' ? analysisText : '')).trim();
  const date = data.date || new Date().toISOString().split('T')[0];
  const time = data.kickoffTime || data.matchTime || data.time || '20:00';
  const publicationMeta = getDailyPublicationMeta({
    date,
    publishedAt: toIsoString(data.publishedAt),
    publishedDate: data.publishedDate,
    publishedTime: data.publishedTime,
    publishTime: data.publishTime,
    createdAt: toIsoString(data.createdAt),
  });
  const hasManualResult = data.resultManualOverride === true
    || (data.manualOverride === true && Boolean(
      data.result
      || data.homeScore !== undefined
      || data.awayScore !== undefined
      || isFinishedDailyAnalysisStatus(data.status as DailyAnalysisStatus | undefined),
    ));

  return ({
  id,
  source: ['api-basketball', 'api-football', 'football-data.org', 'TheSportsDB', 'OpenLigaDB'].includes(data.source) ? data.source : 'manual',
  sport: data.sport === 'basketball' ? 'basketball' : 'football',
  status: normalizeDailyAnalysisStatus(String(data.status || 'ACTIVE')),
  manualOverride: data.manualOverride === true,
  resultManualOverride: hasManualResult,
  topPick: data.topPick === true,
  units: Number.isFinite(Number(data.units)) ? Number(data.units) : undefined,
  fixtureId: Number.isFinite(Number(data.fixtureId)) ? Number(data.fixtureId) : undefined,
  providerFixtureId: typeof data.providerFixtureId === 'string' ? data.providerFixtureId : undefined,
  oddsProvider: typeof data.oddsProvider === 'string' ? data.oddsProvider : undefined,
  kickoffAt: typeof data.kickoffAt === 'string' ? data.kickoffAt : undefined,
  analysisSource: ['api-predictions', 'model-statistics'].includes(data.analysisSource) ? data.analysisSource : undefined,
  date,
  time,
  matchTime: data.matchTime || data.kickoffTime || data.time || time,
  kickoffTime: data.kickoffTime || data.matchTime || data.time || time,
  ...publicationMeta,
  league: formatLeagueName(data.league),
  leagueId: Number.isFinite(Number(data.leagueId)) ? Number(data.leagueId) : undefined,
  homeTeam: data.homeTeam || '',
  awayTeam: data.awayTeam || '',
  homeScore: normalizeNumber(data.homeScore),
  awayScore: normalizeNumber(data.awayScore),
  result: data.result || formatScoreResult(normalizeNumber(data.homeScore), normalizeNumber(data.awayScore)),
  fixtureStatus: data.fixtureStatus || undefined,
  elapsed: normalizeNumber(data.elapsed) ?? null,
  isFinished: data.isFinished === true,
  homeLogo: data.homeLogo || '',
  awayLogo: data.awayLogo || '',
  homeFormPercent: normalizeOptionalPercent(data.homeFormPercent),
  awayFormPercent: normalizeOptionalPercent(data.awayFormPercent),
  formNote: data.formNote || undefined,
  prediction: data.prediction || 'Over 1.5',
  odds: Number.isFinite(Number(data.odds)) ? Number(data.odds) : 1.5,
  reasoning: analysisText,
  analysis: analysisText,
  freeAnalysis: freeAnalysis || undefined,
  vipAnalysis: vipAnalysis || undefined,
  aiSource: data.aiSource === 'gemini' ? 'gemini' : data.aiSource === 'fallback' ? 'fallback' : undefined,
  confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : undefined,
  riskLevel: ['LOW', 'MEDIUM', 'HIGH'].includes(data.riskLevel) ? data.riskLevel : undefined,
  averageTotal: data.averageTotal || undefined,
  h2hNote: data.h2hNote || undefined,
  badges: Array.isArray(data.badges) ? data.badges.filter(Boolean) : undefined,
  access,
  sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
  enabled: data.enabled !== false,
  hidden: data.hidden === true,
  createdAt: toIsoString(data.createdAt),
  updatedAt: toIsoString(data.updatedAt),
  });
};

const sortAnalyses = (items: DailyAnalysisItem[]) =>
  [...items].sort((a, b) => {
    const sortOrderA = Number(a.sortOrder) || 0;
    const sortOrderB = Number(b.sortOrder) || 0;
    if (sortOrderA !== sortOrderB) return sortOrderA - sortOrderB;
    return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
  });

const readManual = async () => {
  const snapshot = await getDocs(query(collection(db, COLLECTION)));
  return snapshot.docs.map((analysisDoc) => normalizeManual(analysisDoc.data(), analysisDoc.id));
};

const readManualForDate = async (date: string) => {
  const snapshot = await getDocs(query(collection(db, COLLECTION), where('date', '==', date)));
  return snapshot.docs.map((analysisDoc) => normalizeManual(analysisDoc.data(), analysisDoc.id));
};

const publicManualForDate = (items: DailyAnalysisItem[], date: string) =>
  sortAnalyses(items.filter((item) => item.date === date && item.enabled && !item.hidden && isVisibleInDailyFeed(item))).slice(0, 5);

const readIndexForDate = async (collectionName: string, date: string) => {
  const cacheKey = getDailyIndexCacheKey(collectionName, date);
  dailyIndexCacheKeys.add(cacheKey);
  return getCachedQuery(cacheKey, async () => {
    const snapshot = await getDocs(query(collection(db, collectionName), where('date', '==', date)));
    return snapshot.docs.map((analysisDoc) => {
      const data = analysisDoc.data();
      if (data.locked === true) return data as DailyAnalysisItem;
      const analysisText = getNormalizedStoredAnalysis(data);
      const access = data.access === 'VIP' ? 'VIP' : 'FREE';
      return {
        ...data,
        reasoning: analysisText,
        analysis: analysisText,
        freeAnalysis: access === 'FREE' && analysisText ? analysisText : undefined,
        vipAnalysis: access === 'VIP' && analysisText ? analysisText : undefined,
      } as DailyAnalysisItem;
    });
  });
};

const publicIndexForDate = (items: DailyAnalysisItem[], date: string) =>
  sortAnalyses(items.filter((item) => item.date === date && isVisibleInDailyFeed(item))).slice(0, 5);

const removeUndefined = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map((item) => removeUndefined(item)) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.entries(value).reduce<Record<string, unknown>>((result, [key, entry]) => {
      if (entry !== undefined) result[key] = removeUndefined(entry);
      return result;
    }, {}) as T;
  }
  return value;
};

const sanitizeLockedVipAnalysis = (analysis: DailyAnalysisItem): DailyAnalysisItem => ({
  id: analysis.id,
  sport: analysis.sport,
  league: analysis.league,
  date: analysis.date,
  time: analysis.time,
  type: 'VIP',
  status: analysis.status,
  locked: true,
} as DailyAnalysisItem);

const sanitizeFreeAnalysis = (analysis: DailyAnalysisItem): DailyAnalysisItem => {
  const freeAnalysis = getAnalysisTextForType(analysis, 'FREE');
  return {
    ...analysis,
    reasoning: freeAnalysis,
    analysis: freeAnalysis,
    freeAnalysis,
    vipAnalysis: undefined,
  };
};

const syncReadIndexes = async (analysis: DailyAnalysisItem) => {
  const publicRef = doc(db, PUBLIC_COLLECTION, analysis.id);
  const freeRef = doc(db, FREE_COLLECTION, analysis.id);
  const visible = analysis.enabled && !analysis.hidden && isVisibleInDailyFeed(analysis);

  if (!visible) {
    await Promise.all([
      deleteDocIfExists(publicRef),
      deleteDocIfExists(freeRef),
    ]);
    invalidateDailyIndexCache();
    return;
  }

  if (analysis.access === 'VIP') {
    await Promise.all([
      setDocIfChanged(publicRef, removeUndefined(sanitizeLockedVipAnalysis(analysis))),
      deleteDocIfExists(freeRef),
    ]);
    invalidateDailyIndexCache();
    return;
  }

  await Promise.all([
    setDocIfChanged(freeRef, removeUndefined(sanitizeFreeAnalysis(analysis))),
    deleteDocIfExists(publicRef),
  ]);
  invalidateDailyIndexCache();
};

const withCompleteAnalysis = (analysis: DailyAnalysisItem, aiSource?: 'gemini' | 'fallback') => {
  const freeAnalysis = getAnalysisTextForType(analysis, 'FREE');
  const vipAnalysis = getAnalysisTextForType(analysis, 'VIP');
  const text = analysis.access === 'VIP' ? vipAnalysis : freeAnalysis;
  return {
    ...analysis,
    reasoning: text,
    analysis: text,
    freeAnalysis,
    vipAnalysis,
    ...(aiSource ? { aiSource } : {}),
  };
};

const withGeneratedAnalysis = (
  analysis: DailyAnalysisItem,
  analysisType: AnalysisGenerationType,
  analysisText: string,
  aiSource: 'gemini' | 'fallback',
) => withCompleteAnalysis({
  ...analysis,
  ...(analysisType === 'VIP' ? { vipAnalysis: analysisText } : { freeAnalysis: analysisText }),
}, aiSource);

const publishFinishedAnalysisToHistory = async (
  analysis: DailyAnalysisItem,
  status: DailyAnalysisStatus,
) => {
  const { mockTipsService } = await import('./mockTips');
  const ticketStatus = status === 'WON'
    ? TicketStatus.WON
    : status === 'LOST'
      ? TicketStatus.LOST
      : status === 'REFUND'
        ? TicketStatus.REFUND
        : status === 'POSTPONED' ? TicketStatus.POSTPONED : TicketStatus.PENDING;
  const publicationMeta = getDailyPublicationMeta(analysis);
  const result = formatScoreResult(analysis.homeScore, analysis.awayScore) || analysis.result;

  await mockTipsService.addTip({
    id: `daily-${analysis.id}`,
    source: 'admin',
    type: 'vip_monthly',
    publicationStatus: TipPublicationStatus.PUBLISHED,
    date: analysis.date,
    ...publicationMeta,
    matches: [{
      id: `${analysis.id}-match`,
      externalMatchId: analysis.fixtureId ? String(analysis.fixtureId) : undefined,
      teams: `${analysis.homeTeam} - ${analysis.awayTeam}`,
      homeTeam: analysis.homeTeam,
      awayTeam: analysis.awayTeam,
      league: analysis.league,
      prediction: analysis.prediction,
      odds: Number(analysis.odds) || 1,
      time: getKickoffTime(analysis),
      result,
      status: ticketStatus,
      analysis: analysis.reasoning,
    }],
    totalOdds: Number(analysis.odds) || 1,
    ticketType: 'SINGL',
    unitsStake: Number(analysis.units) || 3,
    status: ticketStatus,
    analysis: analysis.reasoning || '',
    isVip: analysis.access === 'VIP',
    result,
  });
};

const syncLifecycleFromDoc = async (analysisId: string) => {
  const snapshot = await getDoc(doc(db, COLLECTION, analysisId));
  if (!snapshot.exists()) return;
  const analysis = normalizeManual(snapshot.data(), snapshot.id);
  await syncReadIndexes(analysis);
  if (analysis.enabled && !analysis.hidden && analysis.status !== 'HIDDEN') {
    await publishFinishedAnalysisToHistory(
      analysis,
      analysis.status || 'ACTIVE',
    );
  } else {
    const { mockTipsService } = await import('./mockTips');
    if (await mockTipsService.getAdminTipById(`daily-${analysis.id}`)) await mockTipsService.unpublishTip(`daily-${analysis.id}`, { syncDaily: false });
  }
};

export const dailyAnalysesService = {
  getForDate: async (date: string, access: DailyAnalysesAccess): Promise<DailyAnalysisItem[]> => {
    try {
      if (access.isAdmin || access.canAccessVip) {
        return publicManualForDate(await readManualForDate(date), date);
      }

      const lockedVip = publicIndexForDate(await readIndexForDate(PUBLIC_COLLECTION, date), date);
      if (!access.canAccessFree) return lockedVip;

      const freeItems = publicIndexForDate(await readIndexForDate(FREE_COLLECTION, date), date);
      return sortAnalyses([...freeItems, ...lockedVip]).slice(0, 5);
    } catch (error) {
      console.error('Daily analyses public read failed:', error);
      return [];
    }
  },

  getAdminAnalyses: async (): Promise<DailyAnalysisItem[]> => {
    const analyses = sortAnalyses(await readManual());
    const statusMap = analyses.reduce<Record<string, number>>((acc, analysis) => {
      const status = normalizeDailyAnalysisStatus(String(analysis.status || 'ACTIVE'));
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    dailyAdminDebug('fetched analyses', {
      count: analyses.length,
      statuses: statusMap,
      dates: analyses.reduce<Record<string, number>>((acc, analysis) => {
        acc[analysis.date] = (acc[analysis.date] || 0) + 1;
        return acc;
      }, {}),
    });

    return analyses;
  },

  saveManualAnalysis: async (analysis: DailyAnalysisItem): Promise<void> => {
    const id = analysis.id || `manual-daily-${Date.now()}`;
    const homeScore = normalizeNumber(analysis.homeScore);
    const awayScore = normalizeNumber(analysis.awayScore);
    const status = analysis.status && analysis.status !== 'ACTIVE'
      ? analysis.status
      : evaluateDailyAnalysisStatus(analysis.prediction, homeScore, awayScore) || 'ACTIVE';

    const completedAnalysis = withCompleteAnalysis(analysis);
    const publicationMeta = analysis.publishedAt || analysis.publishedDate || analysis.publishedTime || analysis.publishTime
      ? getDailyPublicationMeta(analysis)
      : createDailyPublicationMeta();

    await setDoc(doc(db, COLLECTION, id), removeUndefined({
      ...completedAnalysis,
      league: formatLeagueName(completedAnalysis.league),
      matchTime: analysis.matchTime || analysis.kickoffTime || analysis.time,
      kickoffTime: analysis.kickoffTime || analysis.matchTime || analysis.time,
      ...publicationMeta,
      id,
      source: completedAnalysis.source || 'manual',
      status,
      result: formatScoreResult(homeScore, awayScore) || analysis.result,
      homeScore,
      awayScore,
      manualOverride: true,
      resultManualOverride: analysis.resultManualOverride === true
        || homeScore !== undefined
        || awayScore !== undefined
        || isFinishedDailyAnalysisStatus(analysis.status),
      odds: Number(analysis.odds) || 1,
      units: Number(analysis.units) || 3,
      sortOrder: Number(analysis.sortOrder) || 0,
      enabled: analysis.enabled !== false,
      hidden: analysis.hidden === true,
      updatedAt: serverTimestamp(),
      createdAt: analysis.createdAt || serverTimestamp(),
    }), { merge: true });
    await syncLifecycleFromDoc(id);
  },

  updateManualAnalysis: async (id: string, patch: Partial<DailyAnalysisItem>): Promise<void> => {
    const homeScore = normalizeNumber(patch.homeScore);
    const awayScore = normalizeNumber(patch.awayScore);
    const status = patch.status && patch.status !== 'ACTIVE'
      ? patch.status
      : patch.prediction
        ? evaluateDailyAnalysisStatus(patch.prediction, homeScore, awayScore)
        : undefined;
    const hasManualResultPatch = patch.result !== undefined
      || patch.homeScore !== undefined
      || patch.awayScore !== undefined
      || (patch.status !== undefined && patch.status !== 'ACTIVE' && patch.status !== 'HIDDEN');

    await updateDoc(doc(db, COLLECTION, id), removeUndefined({
      ...patch,
      ...(patch.league !== undefined ? { league: formatLeagueName(patch.league) } : {}),
      ...(patch.publishedAt || patch.publishedDate || patch.publishedTime || patch.publishTime
        ? getDailyPublicationMeta({ ...patch, date: patch.date || new Date().toISOString().split('T')[0] })
        : {}),
      ...(homeScore !== undefined ? { homeScore } : {}),
      ...(awayScore !== undefined ? { awayScore } : {}),
      ...(status ? { status } : {}),
      ...(homeScore !== undefined && awayScore !== undefined ? { result: formatScoreResult(homeScore, awayScore) } : {}),
      manualOverride: true,
      ...(hasManualResultPatch
        ? { resultManualOverride: true }
        : {}),
      updatedAt: serverTimestamp(),
    }));
    await syncLifecycleFromDoc(id);
  },

  generateAiAnalysis: async (analysis: DailyAnalysisItem, analysisType: AnalysisGenerationType): Promise<AiAnalysisResult> => {
    const existingAnalysis = analysisType === 'VIP' ? analysis.vipAnalysis?.trim() : analysis.freeAnalysis?.trim();
    const generated = await dailyAnalysisAiService.generateSportsAnalysis(analysisType, analysis, {
      manualRequest: true,
      forceRegenerate: Boolean(existingAnalysis),
    });
    await dailyAnalysesService.saveManualAnalysis(withGeneratedAnalysis(analysis, analysisType, generated.analysis, generated.source));
    return generated;
  },

  refreshResultFromApi: async (analysis: DailyAnalysisItem): Promise<ResultRefreshOutcome> => {
    if (analysis.resultManualOverride) {
      return {
        updated: false,
        skippedManualOverride: true,
        message: 'Rezultat je rucno izmenjen i API osvezavanje ga nije pregazilo.',
      };
    }
    if (analysis.sport === 'basketball') {
      return { updated: false, message: 'Automatsko povlacenje rezultata je trenutno dostupno za fudbal.' };
    }
    const user = auth.currentUser;
    if (!user) throw new Error('Admin prijava je potrebna za povlacenje rezultata.');
    const token = await user.getIdToken();
    const response = await fetch('/api/fetch-fixture-result', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fixtureId: analysis.fixtureId,
        date: analysis.date,
        league: analysis.league,
        homeTeam: analysis.homeTeam,
        awayTeam: analysis.awayTeam,
      }),
    });
    const payload = await response.json() as { result?: ApiFixtureResult | null; error?: string };
    if (!response.ok) throw new Error(payload.error || 'Povlacenje rezultata nije uspelo.');
    if (!payload.result) {
      return { updated: false, result: null, message: 'Rezultat za ovaj mec jos nije pronadjen.' };
    }

    const result = payload.result;
    const hasScore = result.homeScore !== null && result.awayScore !== null;
    const evaluatedStatus = hasScore && result.finished
      ? evaluateDailyAnalysisStatus(analysis.prediction, result.homeScore!, result.awayScore!)
      : undefined;
    const status: DailyAnalysisStatus = result.postponed
      ? 'POSTPONED'
      : result.finished
        ? evaluatedStatus || 'ACTIVE'
        : 'ACTIVE';

    await updateDoc(doc(db, COLLECTION, analysis.id), removeUndefined({
      fixtureId: result.fixtureId || analysis.fixtureId,
      fixtureStatus: result.status || result.statusLong,
      elapsed: result.elapsed ?? null,
      isFinished: result.finished,
      ...(hasScore ? {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        result: formatScoreResult(result.homeScore!, result.awayScore!),
      } : {}),
      status,
      updatedAt: serverTimestamp(),
    }));
    await syncLifecycleFromDoc(analysis.id);

    const message = result.finished && !evaluatedStatus && !result.postponed
      ? 'Rezultat je povucen, ali tip zahteva rucnu procenu statusa.'
      : `Rezultat je osvezen (${result.lookupMethod === 'fixture_id' ? 'fixture ID' : 'timovi/datum/liga'}).`;
    return { updated: true, result, status, message };
  },

  pullFromApiForDate: async (date: string): Promise<{ saved: number; skippedManualOverride: number; fetched: number; failed: number; message?: string }> => {
    inFlightPulls.get(date)?.abort();
    const controller = new AbortController();
    inFlightPulls.set(date, controller);
    const timeoutId = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Administratorska prijava je potrebna.');
      const response = await fetch(`/api/daily-picks?date=${encodeURIComponent(date)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
      });
      const payload = await response.json() as {
        saved: number; skippedManualOverride: number; fetched: number; failed: number; error?: string;
        results?: Array<{ error?: string; message?: string; warnings?: string[] }>;
      };
      if (!response.ok) throw new Error(payload.error || payload.results?.find((item) => item.error)?.error || 'Automatska objava nije uspela.');
      invalidateDailyIndexCache();
      return { ...payload, message: payload.results?.flatMap((item) => [item.message, ...(item.warnings || [])]).filter(Boolean).join(' ') };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Objava traje predugo. Proverite stanje pre ponovnog pokretanja.');
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
      if (inFlightPulls.get(date) === controller) inFlightPulls.delete(date);
    }
  },

  deleteManualAnalysis: async (id: string): Promise<void> => {
    const { mockTipsService } = await import('./mockTips');
    await Promise.all([
      deleteDoc(doc(db, COLLECTION, id)),
      deleteDocIfExists(doc(db, PUBLIC_COLLECTION, id)),
      deleteDocIfExists(doc(db, FREE_COLLECTION, id)),
      mockTipsService.deleteTip(`daily-${id}`),
    ]);
    invalidateDailyIndexCache();
  },

  subscribeAdmin: (callback: () => void) =>
    onSnapshot(
      query(collection(db, COLLECTION)),
      () => callback(),
      (error) => {
        console.error('Daily analyses subscription failed:', error);
        callback();
      },
    ),
};
