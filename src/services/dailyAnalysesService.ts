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
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DailyAnalysisItem, DailyAnalysisStatus } from '../types';
import { dailyAnalysisAiService } from './dailyAnalysisAiService';

const COLLECTION = 'dailyAnalyses';
const PUBLIC_COLLECTION = 'publicDailyAnalyses';
const FREE_COLLECTION = 'freeDailyAnalyses';
const inFlightPulls = new Map<string, AbortController>();

type DailyAnalysesAccess = {
  canAccessFree: boolean;
  canAccessVip: boolean;
  isAdmin: boolean;
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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatScoreResult = (homeScore?: number, awayScore?: number): string | undefined =>
  homeScore !== undefined && awayScore !== undefined ? `${homeScore}:${awayScore}` : undefined;

export const evaluateDailyAnalysisStatus = (prediction: string, homeScore?: number, awayScore?: number): DailyAnalysisStatus | undefined => {
  if (homeScore === undefined || awayScore === undefined) return undefined;
  const total = homeScore + awayScore;
  const normalized = prediction.trim().toUpperCase();

  if (normalized === 'GG') return homeScore > 0 && awayScore > 0 ? 'WON' : 'LOST';
  if (normalized === 'NG') return homeScore === 0 && awayScore === 0 ? 'WON' : 'LOST';
  if (normalized === '1') return homeScore > awayScore ? 'WON' : 'LOST';
  if (normalized === 'X') return homeScore === awayScore ? 'WON' : 'LOST';
  if (normalized === '2') return awayScore > homeScore ? 'WON' : 'LOST';
  if (normalized === '1X') return homeScore >= awayScore ? 'WON' : 'LOST';
  if (normalized === 'X2') return awayScore >= homeScore ? 'WON' : 'LOST';
  if (normalized === '12') return homeScore !== awayScore ? 'WON' : 'LOST';
  if (normalized === '3+' || normalized === 'OVER 2.5') return total >= 3 ? 'WON' : 'LOST';
  if (normalized === '2+' || normalized === 'OVER 1.5') return total >= 2 ? 'WON' : 'LOST';
  if (normalized === '0-2' || normalized === 'UNDER 2.5') return total <= 2 ? 'WON' : 'LOST';

  const overMatch = normalized.match(/^OVER\s*(\d+(?:\.\d+)?)$/);
  if (overMatch) {
    const threshold = Number(overMatch[1]);
    return total > threshold ? 'WON' : 'LOST';
  }

  const underMatch = normalized.match(/^UNDER\s*(\d+(?:\.\d+)?)$/);
  if (underMatch) {
    const threshold = Number(underMatch[1]);
    return total < threshold ? 'WON' : 'LOST';
  }

  return undefined;
};

export const isQuickResultPredictionSupported = (prediction: string) =>
  evaluateDailyAnalysisStatus(prediction, 1, 1) !== undefined;

const normalizeManual = (data: DocumentData, id: string): DailyAnalysisItem => ({
  id,
  source: data.source === 'api-basketball' ? 'api-basketball' : data.source === 'api-football' ? 'api-football' : 'manual',
  sport: data.sport === 'basketball' ? 'basketball' : 'football',
  status: ['ACTIVE', 'WON', 'LOST', 'POSTPONED', 'REFUND', 'HIDDEN'].includes(data.status) ? data.status : 'ACTIVE',
  manualOverride: data.manualOverride === true,
  topPick: data.topPick === true,
  units: Number.isFinite(Number(data.units)) ? Number(data.units) : undefined,
  fixtureId: Number.isFinite(Number(data.fixtureId)) ? Number(data.fixtureId) : undefined,
  date: data.date || new Date().toISOString().split('T')[0],
  time: data.time || '20:00',
  league: data.league || '',
  leagueId: Number.isFinite(Number(data.leagueId)) ? Number(data.leagueId) : undefined,
  homeTeam: data.homeTeam || '',
  awayTeam: data.awayTeam || '',
  homeScore: normalizeNumber(data.homeScore),
  awayScore: normalizeNumber(data.awayScore),
  result: data.result || formatScoreResult(normalizeNumber(data.homeScore), normalizeNumber(data.awayScore)),
  homeLogo: data.homeLogo || '',
  awayLogo: data.awayLogo || '',
  homeFormPercent: Number.isFinite(Number(data.homeFormPercent)) ? Number(data.homeFormPercent) : null,
  awayFormPercent: Number.isFinite(Number(data.awayFormPercent)) ? Number(data.awayFormPercent) : null,
  formNote: data.formNote || undefined,
  prediction: data.prediction || 'Over 1.5',
  odds: Number.isFinite(Number(data.odds)) ? Number(data.odds) : 1.5,
  reasoning: data.reasoning || data.vipAnalysis || data.analysis || '',
  analysis: data.analysis || data.reasoning || '',
  vipAnalysis: data.vipAnalysis || undefined,
  aiSource: data.aiSource === 'gemini' ? 'gemini' : data.aiSource === 'fallback' ? 'fallback' : undefined,
  confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : undefined,
  riskLevel: ['LOW', 'MEDIUM', 'HIGH'].includes(data.riskLevel) ? data.riskLevel : undefined,
  averageTotal: data.averageTotal || undefined,
  h2hNote: data.h2hNote || undefined,
  badges: Array.isArray(data.badges) ? data.badges.filter(Boolean) : undefined,
  access: data.access === 'VIP' ? 'VIP' : 'FREE',
  sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
  enabled: data.enabled !== false,
  hidden: data.hidden === true,
  createdAt: toIsoString(data.createdAt),
  updatedAt: toIsoString(data.updatedAt),
});

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

const publicManualForDate = (items: DailyAnalysisItem[], date: string) =>
  sortAnalyses(items.filter((item) => item.date === date && item.enabled && !item.hidden && item.status === 'ACTIVE')).slice(0, 5);

const readIndex = async (collectionName: string) => {
  const snapshot = await getDocs(query(collection(db, collectionName)));
  return snapshot.docs.map((analysisDoc) => analysisDoc.data() as DailyAnalysisItem);
};

const publicIndexForDate = (items: DailyAnalysisItem[], date: string) =>
  sortAnalyses(items.filter((item) => item.date === date && item.status === 'ACTIVE')).slice(0, 5);

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

const syncReadIndexes = async (analysis: DailyAnalysisItem) => {
  const publicRef = doc(db, PUBLIC_COLLECTION, analysis.id);
  const freeRef = doc(db, FREE_COLLECTION, analysis.id);
  const visible = analysis.enabled && !analysis.hidden && analysis.status === 'ACTIVE';

  if (!visible) {
    await Promise.all([
      deleteDoc(publicRef).catch(() => undefined),
      deleteDoc(freeRef).catch(() => undefined),
    ]);
    return;
  }

  if (analysis.access === 'VIP') {
    await Promise.all([
      setDoc(publicRef, removeUndefined(sanitizeLockedVipAnalysis(analysis))),
      deleteDoc(freeRef).catch(() => undefined),
    ]);
    return;
  }

  await Promise.all([
    setDoc(freeRef, removeUndefined(analysis)),
    deleteDoc(publicRef).catch(() => undefined),
  ]);
};

const syncReadIndexFromDoc = async (analysisId: string) => {
  const snapshot = await getDoc(doc(db, COLLECTION, analysisId));
  if (!snapshot.exists()) return;
  await syncReadIndexes(normalizeManual(snapshot.data(), snapshot.id));
};

const getStableAnalysisId = (analysis: DailyAnalysisItem) => {
  if (analysis.id && !analysis.id.startsWith('manual-daily-')) return analysis.id;
  if (analysis.fixtureId && analysis.source) return `${analysis.source}-${analysis.fixtureId}`;
  return `manual-daily-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
};

const withCompleteAnalysis = (analysis: DailyAnalysisItem, analysisText?: string, aiSource?: 'gemini' | 'fallback') => {
  const text = analysisText?.trim() || analysis.reasoning?.trim() || dailyAnalysisAiService.fallbackAnalysis(analysis);
  return {
    ...analysis,
    reasoning: text,
    analysis: text,
    vipAnalysis: analysis.access === 'VIP' ? text : '',
    ...(aiSource ? { aiSource } : {}),
  };
};

const saveApiAnalysisIfAllowed = async (analysis: DailyAnalysisItem, generateAi = false) => {
  const id = getStableAnalysisId(analysis);
  const ref = doc(db, COLLECTION, id);
  const existingSnapshot = await getDoc(ref);

  if (existingSnapshot.exists()) {
    const existing = normalizeManual(existingSnapshot.data(), existingSnapshot.id);
    if (existing.manualOverride) {
      return { saved: false, skippedManualOverride: true };
    }
  }

  let completedAnalysis = withCompleteAnalysis(analysis);
  let aiSource: 'gemini' | 'fallback' | undefined;
  if (generateAi) {
    const generated = await dailyAnalysisAiService.generateDailyAnalysisText(analysis);
    aiSource = generated.source;
    completedAnalysis = withCompleteAnalysis(analysis, generated.analysis, generated.source);
  }

  await setDoc(ref, removeUndefined({
    ...completedAnalysis,
    id,
    source: completedAnalysis.source,
    manualOverride: false,
    status: analysis.status || 'ACTIVE',
    enabled: analysis.enabled !== false,
    hidden: analysis.hidden === true,
    updatedAt: serverTimestamp(),
    createdAt: existingSnapshot.exists() ? existingSnapshot.data().createdAt : serverTimestamp(),
  }), { merge: true });
  await syncReadIndexFromDoc(id);

  return { saved: true, skippedManualOverride: false, aiSource };
};

export const dailyAnalysesService = {
  getForDate: async (date: string, access: DailyAnalysesAccess): Promise<DailyAnalysisItem[]> => {
    try {
      if (access.isAdmin || access.canAccessVip) {
        return publicManualForDate(await readManual(), date);
      }

      const lockedVip = publicIndexForDate(await readIndex(PUBLIC_COLLECTION), date);
      if (!access.canAccessFree) return lockedVip;

      const freeItems = publicIndexForDate(await readIndex(FREE_COLLECTION), date);
      return sortAnalyses([...freeItems, ...lockedVip]).slice(0, 5);
    } catch (error) {
      console.error('Daily analyses public read failed:', error);
      return [];
    }
  },

  getAdminAnalyses: async (): Promise<DailyAnalysisItem[]> => {
    const analyses = sortAnalyses(await readManual());
    await Promise.all(analyses.map((analysis) => syncReadIndexes(analysis)));
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

    await setDoc(doc(db, COLLECTION, id), removeUndefined({
      ...completedAnalysis,
      id,
      source: completedAnalysis.source || 'manual',
      status,
      result: formatScoreResult(homeScore, awayScore) || analysis.result,
      homeScore,
      awayScore,
      manualOverride: true,
      odds: Number(analysis.odds) || 1,
      units: Number(analysis.units) || 3,
      sortOrder: Number(analysis.sortOrder) || 0,
      enabled: analysis.enabled !== false,
      hidden: analysis.hidden === true,
      updatedAt: serverTimestamp(),
      createdAt: analysis.createdAt || serverTimestamp(),
    }), { merge: true });
    await syncReadIndexFromDoc(id);
  },

  updateManualAnalysis: async (id: string, patch: Partial<DailyAnalysisItem>): Promise<void> => {
    const homeScore = normalizeNumber(patch.homeScore);
    const awayScore = normalizeNumber(patch.awayScore);
    const status = patch.status && patch.status !== 'ACTIVE'
      ? patch.status
      : patch.prediction
        ? evaluateDailyAnalysisStatus(patch.prediction, homeScore, awayScore)
        : undefined;

    await updateDoc(doc(db, COLLECTION, id), removeUndefined({
      ...patch,
      ...(homeScore !== undefined ? { homeScore } : {}),
      ...(awayScore !== undefined ? { awayScore } : {}),
      ...(status ? { status } : {}),
      ...(homeScore !== undefined && awayScore !== undefined ? { result: formatScoreResult(homeScore, awayScore) } : {}),
      manualOverride: true,
      updatedAt: serverTimestamp(),
    }));
    await syncReadIndexFromDoc(id);
  },

  generateAiAnalysis: async (analysis: DailyAnalysisItem): Promise<'gemini' | 'fallback'> => {
    const generated = await dailyAnalysisAiService.generateDailyAnalysisText(analysis);
    await dailyAnalysesService.saveManualAnalysis(withCompleteAnalysis(analysis, generated.analysis, generated.source));
    return generated.source;
  },

  pullFromApiForDate: async (date: string, options?: { generateAi?: boolean }): Promise<{ saved: number; skippedManualOverride: number; fetched: number; aiGenerated: number; fallbackGenerated: number }> => {
    const previous = inFlightPulls.get(date);
    if (previous) previous.abort();

    const controller = new AbortController();
    inFlightPulls.set(date, controller);

    try {
      const { apiFootballService } = await import('./apiFootballService');
      const analyses = await apiFootballService.fetchDailyAnalysesForDate(date, controller.signal);
      let saved = 0;
      let skippedManualOverride = 0;
      let aiGenerated = 0;
      let fallbackGenerated = 0;

      for (const analysis of analyses) {
        const result = await saveApiAnalysisIfAllowed(analysis, options?.generateAi === true);
        if (result.saved) saved += 1;
        if (result.skippedManualOverride) skippedManualOverride += 1;
        if (result.aiSource === 'gemini') aiGenerated += 1;
        if (result.aiSource === 'fallback') fallbackGenerated += 1;
      }

      return { saved, skippedManualOverride, fetched: analyses.length, aiGenerated, fallbackGenerated };
    } finally {
      if (inFlightPulls.get(date) === controller) {
        inFlightPulls.delete(date);
      }
    }
  },

  deleteManualAnalysis: async (id: string): Promise<void> => {
    await Promise.all([
      deleteDoc(doc(db, COLLECTION, id)),
      deleteDoc(doc(db, PUBLIC_COLLECTION, id)).catch(() => undefined),
      deleteDoc(doc(db, FREE_COLLECTION, id)).catch(() => undefined),
    ]);
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
