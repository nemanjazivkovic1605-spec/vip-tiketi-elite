import {
  collection,
  deleteDoc,
  doc,
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
import { apiFootballService } from './apiFootballService';

const COLLECTION = 'dailyAnalyses';

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
  source: 'manual',
  sport: data.sport === 'basketball' ? 'basketball' : 'football',
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
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
  });

const readManual = async () => {
  const snapshot = await getDocs(query(collection(db, COLLECTION)));
  return snapshot.docs.map((analysisDoc) => normalizeManual(analysisDoc.data(), analysisDoc.id));
};

const publicManualForDate = (items: DailyAnalysisItem[], date: string) =>
  items.filter((item) => item.date === date && item.enabled && !item.hidden);

const mergeAnalyses = (manual: DailyAnalysisItem[], api: DailyAnalysisItem[]) => {
  const blockedFixtureIds = new Set(
    manual
      .filter((item) => item.hidden && item.fixtureId)
      .map((item) => item.fixtureId),
  );
  const manualPublic = manual.filter((item) => item.enabled && !item.hidden);
  const manualFixtureIds = new Set(manualPublic.map((item) => item.fixtureId).filter(Boolean));

  return sortAnalyses([
    ...manualPublic,
    ...api.filter((item) => !blockedFixtureIds.has(item.fixtureId) && !manualFixtureIds.has(item.fixtureId)),
  ]).slice(0, 5);
};

export const dailyAnalysesService = {
  getForDate: async (date: string): Promise<DailyAnalysisItem[]> => {
    const [manual, api] = await Promise.all([
      readManual().then((items) => publicManualForDate(items, date)).catch(() => []),
      apiFootballService.fetchDailyAnalysesForDate(date),
    ]);

    return mergeAnalyses(manual, api);
  },

  getAdminAnalyses: async (): Promise<DailyAnalysisItem[]> => {
    return sortAnalyses(await readManual());
  },

  saveManualAnalysis: async (analysis: DailyAnalysisItem): Promise<void> => {
    const id = analysis.id || `manual-daily-${Date.now()}`;
    await setDoc(doc(db, COLLECTION, id), {
      ...analysis,
      id,
      source: 'manual',
      odds: Number(analysis.odds) || 1,
      sortOrder: Number(analysis.sortOrder) || 0,
      enabled: analysis.enabled !== false,
      hidden: analysis.hidden === true,
      updatedAt: serverTimestamp(),
      createdAt: analysis.createdAt || serverTimestamp(),
    }, { merge: true });
  },

  updateManualAnalysis: async (id: string, patch: Partial<DailyAnalysisItem>): Promise<void> => {
    await updateDoc(doc(db, COLLECTION, id), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  },

  deleteManualAnalysis: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, COLLECTION, id));
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
