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
import { DailyAnalysisItem } from '../types';

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

const normalizeManual = (data: DocumentData, id: string): DailyAnalysisItem => ({
  id,
  source: data.source === 'api-basketball' ? 'api-basketball' : data.source === 'api-football' ? 'api-football' : 'manual',
  sport: data.sport === 'basketball' ? 'basketball' : 'football',
  status: ['ACTIVE', 'WON', 'LOST', 'HIDDEN'].includes(data.status) ? data.status : 'ACTIVE',
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
  homeLogo: data.homeLogo || '',
  awayLogo: data.awayLogo || '',
  homeFormPercent: Number.isFinite(Number(data.homeFormPercent)) ? Number(data.homeFormPercent) : null,
  awayFormPercent: Number.isFinite(Number(data.awayFormPercent)) ? Number(data.awayFormPercent) : null,
  formNote: data.formNote || undefined,
  prediction: data.prediction || 'Over 1.5',
  odds: Number.isFinite(Number(data.odds)) ? Number(data.odds) : 1.5,
  reasoning: data.reasoning || '',
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
  if (value && typeof value === 'object') {
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

const saveApiAnalysisIfAllowed = async (analysis: DailyAnalysisItem) => {
  const id = getStableAnalysisId(analysis);
  const ref = doc(db, COLLECTION, id);
  const existingSnapshot = await getDoc(ref);

  if (existingSnapshot.exists()) {
    const existing = normalizeManual(existingSnapshot.data(), existingSnapshot.id);
    if (existing.manualOverride) {
      return { saved: false, skippedManualOverride: true };
    }
  }

  await setDoc(ref, {
    ...analysis,
    id,
    source: analysis.source,
    manualOverride: false,
    status: analysis.status || 'ACTIVE',
    enabled: analysis.enabled !== false,
    hidden: analysis.hidden === true,
    updatedAt: serverTimestamp(),
    createdAt: existingSnapshot.exists() ? existingSnapshot.data().createdAt : serverTimestamp(),
  }, { merge: true });
  await syncReadIndexFromDoc(id);

  return { saved: true, skippedManualOverride: false };
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
    await setDoc(doc(db, COLLECTION, id), {
      ...analysis,
      id,
      source: analysis.source || 'manual',
      status: analysis.status || 'ACTIVE',
      manualOverride: true,
      odds: Number(analysis.odds) || 1,
      units: Number(analysis.units) || 3,
      sortOrder: Number(analysis.sortOrder) || 0,
      enabled: analysis.enabled !== false,
      hidden: analysis.hidden === true,
      updatedAt: serverTimestamp(),
      createdAt: analysis.createdAt || serverTimestamp(),
    }, { merge: true });
    await syncReadIndexFromDoc(id);
  },

  updateManualAnalysis: async (id: string, patch: Partial<DailyAnalysisItem>): Promise<void> => {
    await updateDoc(doc(db, COLLECTION, id), {
      ...patch,
      manualOverride: true,
      updatedAt: serverTimestamp(),
    });
    await syncReadIndexFromDoc(id);
  },

  pullFromApiForDate: async (date: string): Promise<{ saved: number; skippedManualOverride: number; fetched: number }> => {
    const previous = inFlightPulls.get(date);
    if (previous) previous.abort();

    const controller = new AbortController();
    inFlightPulls.set(date, controller);

    try {
      const { apiFootballService } = await import('./apiFootballService');
      const analyses = await apiFootballService.fetchDailyAnalysesForDate(date, controller.signal);
      let saved = 0;
      let skippedManualOverride = 0;

      for (const analysis of analyses) {
        const result = await saveApiAnalysisIfAllowed(analysis);
        if (result.saved) saved += 1;
        if (result.skippedManualOverride) skippedManualOverride += 1;
      }

      return { saved, skippedManualOverride, fetched: analyses.length };
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
