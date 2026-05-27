import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Tip, TicketStatus, GlobalStats, TipPublicationStatus, DailyAnalysisItem } from '../types';
import {
  calculateTotalOdds,
  getTicketPublicationMeta,
  getTicketStake,
  getTicketUnitsStake,
  isFinishedForStats,
  normalizeOdds,
  normalizePublishedDate,
  sortTicketsByDate,
} from '../utils/tickets';
import { calculateStats } from '../utils/ticketStats';
import { getDailyPublicationMeta, getKickoffTime } from '../utils/dailyPublication';
import { getCachedQuery, invalidateCachedQueries } from './firestore/queryCache';
import { mapTicketForAdmin, mapTicketForFree, mapTicketForPublic, mapTicketForVip } from './tickets/ticketMappers';

const TICKETS_COLLECTION = 'tickets';
const PUBLIC_TICKETS_COLLECTION = 'publicTickets';
const PUBLIC_STATS_TICKETS_COLLECTION = 'publicStatsTickets';
const PUBLIC_TICKETS_CACHE_KEY = 'tickets:public:all';
const PUBLIC_VIP_TICKETS_CACHE_KEY = 'tickets:public:vip';
const PUBLIC_STATS_CACHE_KEY = 'tickets:public:stats';
const invalidatePublicTicketCache = () => invalidateCachedQueries(
  PUBLIC_TICKETS_CACHE_KEY,
  PUBLIC_VIP_TICKETS_CACHE_KEY,
  PUBLIC_STATS_CACHE_KEY,
);

const cleanAnalysis = (analysis?: string) => {
  const value = (analysis || '').trim();
  if (value.startsWith('Istorijski predlog') && value.endsWith('baze.')) return '';
  if (value.startsWith('Automatski pripremljen') && value.includes('istorijski') && /\d{4}-\d{2}-\d{2}\.$/.test(value)) return '';
  return value;
};

const isValidTicketCode = (value?: string) => /^[FV]\d{12}$/.test((value || '').trim());

const normalizeTip = (tip: Tip): Tip => {
  const matches = Array.isArray(tip.matches)
    ? tip.matches.map((match) => ({
      ...match,
      odds: normalizeOdds(match.odds),
      analysis: cleanAnalysis(match.analysis),
    }))
    : [];
  const totalOdds = calculateTotalOdds(matches);
  const date = normalizePublishedDate(tip.date || new Date().toISOString().split('T')[0]);
  const publicationStatus = tip.publicationStatus || TipPublicationStatus.DRAFT;
  const status = tip.status || TicketStatus.PENDING;
  const publicationMeta = getTicketPublicationMeta({
    id: tip.id,
    date,
    isVip: Boolean(tip.isVip),
    publishedDate: tip.publishedDate,
    publishedTime: tip.publishedTime,
    publishedAt: tip.publishedAt,
    createdAt: tip.createdAt,
  });
  const existingTicketCode = (tip.ticketCode || '').trim();
  const ticketCode = existingTicketCode && isValidTicketCode(existingTicketCode)
    ? existingTicketCode
    : publicationMeta.ticketCode;

  return {
    ...tip,
    id: tip.id || Math.random().toString(36).slice(2, 11),
    publishedDate: publicationMeta.publishedDate,
    publishedTime: publicationMeta.publishedTime,
    publishedAt: publicationMeta.publishedAt,
    ticketCode,
    locked: Boolean(tip.locked),
    source: 'admin',
    publicationStatus,
    status,
    isVip: Boolean(tip.isVip),
    date,
    analysis: cleanAnalysis(tip.analysis),
    matches,
    totalOdds: tip.totalOddsOverride && Number.isFinite(tip.totalOdds) && tip.totalOdds > 0
      ? Number(tip.totalOdds.toFixed(2))
      : totalOdds,
    totalOddsOverride: Boolean(tip.totalOddsOverride),
    stake: getTicketStake({ ...tip, matches, totalOdds } as Tip),
    unitsStake: getTicketUnitsStake(tip),
  };
};

const publicOnly = (tips: Tip[]) =>
  tips.filter((tip) => tip.publicationStatus === TipPublicationStatus.PUBLISHED);

const DAILY_ANALYSES_COLLECTION = 'dailyAnalyses';
const getDailyAnalysesCollection = () => collection(db, DAILY_ANALYSES_COLLECTION);

const toStoredDateString = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
};

const normalizeDailyAnalysisDoc = (analysisDoc: any): DailyAnalysisItem => {
  const data = analysisDoc.data() as Record<string, unknown>;
  const date = typeof data.date === 'string' ? data.date : new Date().toISOString().split('T')[0];
  const time = typeof data.kickoffTime === 'string'
    ? data.kickoffTime
    : typeof data.matchTime === 'string'
      ? data.matchTime
      : typeof data.time === 'string' ? data.time : '12:00';
  const publicationMeta = getDailyPublicationMeta({
    date,
    publishedAt: toStoredDateString(data.publishedAt),
    publishedDate: typeof data.publishedDate === 'string' ? data.publishedDate : undefined,
    publishedTime: typeof data.publishedTime === 'string' ? data.publishedTime : undefined,
    publishTime: typeof data.publishTime === 'string' ? data.publishTime : undefined,
    createdAt: toStoredDateString(data.createdAt),
  });

  return {
    id: analysisDoc.id,
    source: 'manual',
    sport: typeof data.sport === 'string' && data.sport === 'basketball' ? 'basketball' : 'football',
    status: typeof data.status === 'string' ? data.status as DailyAnalysisItem['status'] : 'ACTIVE',
    manualOverride: data.manualOverride === true,
    resultManualOverride: data.resultManualOverride === true,
    topPick: data.topPick === true,
    units: Number.isFinite(Number(data.units)) ? Number(data.units) : undefined,
    date,
    time,
    matchTime: time,
    kickoffTime: time,
    ...publicationMeta,
    league: typeof data.league === 'string' ? data.league : '',
    leagueId: Number.isFinite(Number(data.leagueId)) ? Number(data.leagueId) : undefined,
    homeTeam: typeof data.homeTeam === 'string' ? data.homeTeam : '',
    awayTeam: typeof data.awayTeam === 'string' ? data.awayTeam : '',
    homeScore: Number.isFinite(Number(data.homeScore)) ? Number(data.homeScore) : undefined,
    awayScore: Number.isFinite(Number(data.awayScore)) ? Number(data.awayScore) : undefined,
    result: typeof data.result === 'string' ? data.result : undefined,
    homeLogo: typeof data.homeLogo === 'string' ? data.homeLogo : '',
    awayLogo: typeof data.awayLogo === 'string' ? data.awayLogo : '',
    homeFormPercent: Number.isFinite(Number(data.homeFormPercent)) ? Number(data.homeFormPercent) : null,
    awayFormPercent: Number.isFinite(Number(data.awayFormPercent)) ? Number(data.awayFormPercent) : null,
    formNote: typeof data.formNote === 'string' ? data.formNote : undefined,
    prediction: typeof data.prediction === 'string' ? data.prediction : 'Over 1.5',
    odds: Number.isFinite(Number(data.odds)) ? Number(data.odds) : 1.5,
    reasoning: typeof data.reasoning === 'string' ? data.reasoning : '',
    confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : undefined,
    riskLevel: ['LOW', 'MEDIUM', 'HIGH'].includes(String(data.riskLevel)) ? String(data.riskLevel) as DailyAnalysisItem['riskLevel'] : undefined,
    averageTotal: typeof data.averageTotal === 'string' ? data.averageTotal : undefined,
    h2hNote: typeof data.h2hNote === 'string' ? data.h2hNote : undefined,
    badges: Array.isArray(data.badges) ? data.badges.filter(Boolean) : undefined,
    access: data.access === 'VIP' ? 'VIP' : 'FREE',
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
    enabled: data.enabled !== false,
    hidden: data.hidden === true,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
};

const sortDailyAnalyses = (analyses: DailyAnalysisItem[]) =>
  [...analyses].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return (b.time || '').localeCompare(a.time || '');
  });

const isFinishedDailyAnalysis = (analysis: DailyAnalysisItem) =>
  analysis.status !== 'ACTIVE' && analysis.status !== 'HIDDEN';

const mapDailyAnalysisStatus = (status?: DailyAnalysisItem['status']): TicketStatus => {
  if (status === 'WON') return TicketStatus.WON;
  if (status === 'LOST') return TicketStatus.LOST;
  if (status === 'POSTPONED') return TicketStatus.POSTPONED;
  if (status === 'REFUND') return TicketStatus.REFUND;
  return TicketStatus.PENDING;
};

const mapDailyAnalysisToTip = (analysis: DailyAnalysisItem): Tip => {
  const status = mapDailyAnalysisStatus(analysis.status);
  const result = analysis.result || (
    analysis.homeScore !== undefined && analysis.awayScore !== undefined
      ? `${analysis.homeScore}:${analysis.awayScore}`
      : undefined
  );
  const publicationMeta = getDailyPublicationMeta(analysis);

  return normalizeTip({
    id: `daily-${analysis.id}`,
    source: 'admin',
    publicationStatus: TipPublicationStatus.PUBLISHED,
    date: analysis.date,
    publishedDate: publicationMeta.publishedDate,
    publishedTime: publicationMeta.publishedTime,
    publishedAt: publicationMeta.publishedAt,
    ticketType: 'SINGL',
    matches: [{
      id: `${analysis.id}-match`,
      teams: `${analysis.homeTeam} - ${analysis.awayTeam}`,
      homeTeam: analysis.homeTeam,
      awayTeam: analysis.awayTeam,
      league: analysis.league,
      prediction: analysis.prediction,
      odds: analysis.odds,
      time: getKickoffTime(analysis),
      result,
      status,
      analysis: analysis.reasoning,
    }],
    totalOdds: analysis.odds,
    unitsStake: Number.isFinite(Number(analysis.units)) && Number(analysis.units) > 0 ? Number(analysis.units) : 3,
    status,
    analysis: analysis.reasoning || '',
    isVip: analysis.access === 'VIP',
    result,
  });
};

const readFinishedDailyAnalysisTips = async (): Promise<Tip[]> => {
  const snapshot = await getDocs(query(getDailyAnalysesCollection()));
  const analysisTips = snapshot.docs
    .map(normalizeDailyAnalysisDoc)
    .filter(isFinishedDailyAnalysis)
    .map(mapDailyAnalysisToTip);

  return sortTicketsByDate(analysisTips);
};

const getTicketsCollection = () => collection(db, TICKETS_COLLECTION);
const getPublicTicketsCollection = () => collection(db, PUBLIC_TICKETS_COLLECTION);
const getPublicStatsTicketsCollection = () => collection(db, PUBLIC_STATS_TICKETS_COLLECTION);

const getTicketDoc = (id: string) => doc(db, TICKETS_COLLECTION, id);
const getPublicTicketDoc = (id: string) => doc(db, PUBLIC_TICKETS_COLLECTION, id);
const getPublicStatsTicketDoc = (id: string) => doc(db, PUBLIC_STATS_TICKETS_COLLECTION, id);

const removeUndefined = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefined(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, entry]) => {
      if (entry !== undefined) {
        acc[key] = removeUndefined(entry);
      }
      return acc;
    }, {}) as T;
  }

  return value;
};

const syncPublicTicket = async (tip: Tip) => {
  const normalized = normalizeTip(tip);

  if (normalized.publicationStatus !== TipPublicationStatus.PUBLISHED) {
    await Promise.all([
      deleteDoc(getPublicTicketDoc(normalized.id)).catch(() => undefined),
      deleteDoc(getPublicStatsTicketDoc(normalized.id)).catch(() => undefined),
    ]);
    invalidatePublicTicketCache();
    return;
  }

  await setDoc(getPublicTicketDoc(normalized.id), removeUndefined(mapTicketForPublic(normalized)));

  if (isFinishedForStats(normalized.status)) {
    await setDoc(getPublicStatsTicketDoc(normalized.id), removeUndefined(mapTicketForPublic(normalized)));
  } else {
    await deleteDoc(getPublicStatsTicketDoc(normalized.id)).catch(() => undefined);
  }
  invalidatePublicTicketCache();
};

const needsTicketMetadataRepair = (original: Tip, normalized: Tip) =>
  original.publishedDate !== normalized.publishedDate
  || original.publishedTime !== normalized.publishedTime
  || original.publishedAt !== normalized.publishedAt
  || original.ticketCode !== normalized.ticketCode;

const readAllTips = async (): Promise<Tip[]> => {
  const snapshot = await getDocs(query(getTicketsCollection()));
  return sortTicketsByDate(snapshot.docs.map((ticketDoc) => mapTicketForAdmin(normalizeTip({
    ...ticketDoc.data(),
    id: ticketDoc.id,
  } as Tip))));
};

const readPublishedFullFreeTips = async (): Promise<Tip[]> => {
  const snapshot = await getDocs(query(
    getTicketsCollection(),
    where('publicationStatus', '==', TipPublicationStatus.PUBLISHED),
    where('isVip', '==', false),
  ));
  return sortTicketsByDate(snapshot.docs.map((ticketDoc) => mapTicketForFree(normalizeTip({
    ...ticketDoc.data(),
    id: ticketDoc.id,
  } as Tip))));
};

const readPublishedSafeVipTips = async (): Promise<Tip[]> => {
  return getCachedQuery(PUBLIC_VIP_TICKETS_CACHE_KEY, async () => {
    const snapshot = await getDocs(query(getPublicTicketsCollection(), where('isVip', '==', true)));
    return sortTicketsByDate(snapshot.docs.map((ticketDoc) => mapTicketForFree(normalizeTip({
      ...ticketDoc.data(),
      id: ticketDoc.id,
    } as Tip))));
  });
};

const readPublishedSafeTips = async (): Promise<Tip[]> => {
  return getCachedQuery(PUBLIC_TICKETS_CACHE_KEY, async () => {
    const snapshot = await getDocs(query(getPublicTicketsCollection()));
    return sortTicketsByDate(snapshot.docs.map((ticketDoc) => mapTicketForPublic(normalizeTip({
      ...ticketDoc.data(),
      id: ticketDoc.id,
    } as Tip))));
  });
};

const readPublicStatsTips = async (): Promise<Tip[]> => {
  return getCachedQuery(PUBLIC_STATS_CACHE_KEY, async () => {
    try {
      const snapshot = await getDocs(query(getPublicStatsTicketsCollection()));
      if (!snapshot.empty) {
        return sortTicketsByDate(snapshot.docs
          .map((ticketDoc) => mapTicketForPublic(normalizeTip({
            ...ticketDoc.data(),
            id: ticketDoc.id,
          } as Tip)))
          .filter((tip) => isFinishedForStats(tip.status)));
      }
    } catch {
      // Compatibility while newly added public stats rules/index are being deployed.
    }

    return (await readPublishedSafeTips()).filter((tip) => isFinishedForStats(tip.status));
  });
};

const mergeTips = (...groups: Tip[][]) => {
  const byId = new Map<string, Tip>();
  groups.flat().forEach((tip) => byId.set(tip.id, tip));
  return sortTicketsByDate(Array.from(byId.values()));
};

const readPublishedTips = async (): Promise<Tip[]> => {
  const snapshot = await getDocs(query(
    getTicketsCollection(),
    where('publicationStatus', '==', TipPublicationStatus.PUBLISHED),
  ));
  const tickets = snapshot.docs.map((ticketDoc) => mapTicketForVip(normalizeTip({
    ...ticketDoc.data(),
    id: ticketDoc.id,
  } as Tip)));
  const dailyTips = await readFinishedDailyAnalysisTips();
  return sortTicketsByDate(mergeTips(dailyTips, tickets));
};

export const mockTipsService = {
  getAllTips: async (): Promise<Tip[]> => {
    const [tickets, dailyTips] = await Promise.all([
      readAllTips(),
      readFinishedDailyAnalysisTips(),
    ]);
    return sortTicketsByDate(mergeTips(dailyTips, tickets));
  },

  getTips: async (): Promise<Tip[]> => {
    const [tickets, dailyTips] = await Promise.all([
      readPublishedSafeTips(),
      readFinishedDailyAnalysisTips(),
    ]);
    return sortTicketsByDate(mergeTips(dailyTips, tickets));
  },

  getVisibleTips: async (access: { canAccessFree: boolean; canAccessVip: boolean }): Promise<Tip[]> => {
    if (access.canAccessVip) return readPublishedTips();
    if (access.canAccessFree) {
      const [freeTips, vipSafeTips] = await Promise.all([
        readPublishedFullFreeTips(),
        readPublishedSafeVipTips(),
      ]);
      return mergeTips(freeTips, vipSafeTips);
    }
    return readPublishedSafeTips();
  },

  getPublishedTips: async (): Promise<Tip[]> => {
    return readPublishedTips();
  },

  getVipTips: async (): Promise<Tip[]> => {
    const tips = await readPublishedTips();
    return sortTicketsByDate(tips.filter((t) => t.isVip));
  },

  getFreeTips: async (): Promise<Tip[]> => {
    const [tips, dailyTips] = await Promise.all([
      readPublishedFullFreeTips(),
      readFinishedDailyAnalysisTips(),
    ]);
    return sortTicketsByDate(mergeTips(dailyTips, tips).filter((t) => !t.isVip));
  },

  getStats: async (): Promise<GlobalStats> => {
    return calculateStats(await mockTipsService.getPublishedTips());
  },

  getVisibleStats: async (access: { canAccessFree: boolean; canAccessVip: boolean }): Promise<GlobalStats> => {
    return calculateStats(await mockTipsService.getVisibleTips(access));
  },

  getPublicStats: async (): Promise<GlobalStats> => {
    return calculateStats(await readPublicStatsTips());
  },

  syncPublicTickets: async (tips?: Tip[]): Promise<void> => {
    const sourceTips = tips || await readAllTips();
    const publishedIds = new Set(publicOnly(sourceTips).map((tip) => tip.id));
    const publicSnapshot = await getDocs(query(getPublicTicketsCollection()));
    const publicStatsSnapshot = await getDocs(query(getPublicStatsTicketsCollection()));

    await Promise.all([
      ...sourceTips.map((tip) => syncPublicTicket(tip)),
      ...publicSnapshot.docs
        .filter((ticketDoc) => !publishedIds.has(ticketDoc.id))
        .map((ticketDoc) => deleteDoc(getPublicTicketDoc(ticketDoc.id))),
      ...publicStatsSnapshot.docs
        .filter((ticketDoc) => !publishedIds.has(ticketDoc.id))
        .map((ticketDoc) => deleteDoc(getPublicStatsTicketDoc(ticketDoc.id))),
    ]);
  },

  syncTicketMetadata: async (tips?: Tip[]): Promise<void> => {
    const sourceTips = tips || await readAllTips();
    await Promise.all(sourceTips.map(async (tip) => {
      const normalized = normalizeTip(tip);
      if (!needsTicketMetadataRepair(tip, normalized)) return;
      await setDoc(getTicketDoc(normalized.id), removeUndefined({
        publishedDate: normalized.publishedDate,
        publishedTime: normalized.publishedTime,
        publishedAt: normalized.publishedAt,
        ticketCode: normalized.ticketCode,
      }), { merge: true });
    }));
  },

  resetTips: async (): Promise<void> => {
    const tips = await readAllTips();
    const publicTips = await getDocs(query(getPublicTicketsCollection()));
    const publicStatsTips = await getDocs(query(getPublicStatsTicketsCollection()));
    await Promise.all([
      ...tips.map((tip) => deleteDoc(getTicketDoc(tip.id))),
      ...publicTips.docs.map((ticketDoc) => deleteDoc(getPublicTicketDoc(ticketDoc.id))),
      ...publicStatsTips.docs.map((ticketDoc) => deleteDoc(getPublicStatsTicketDoc(ticketDoc.id))),
    ]);
    invalidatePublicTicketCache();
  },

  addTip: async (tip: Tip): Promise<void> => {
    const normalized = normalizeTip({
      ...tip,
      source: 'admin',
      publicationStatus: tip.publicationStatus || TipPublicationStatus.DRAFT,
    });
    await setDoc(getTicketDoc(normalized.id), removeUndefined(normalized));
    await syncPublicTicket(normalized);
  },

  addTips: async (newTips: Tip[]): Promise<void> => {
    const existingTips = await readAllTips();
    const existingIds = new Set(existingTips.map((tip) => tip.id));
    const uniqueTips = newTips.filter((tip) => !existingIds.has(tip.id));

    await Promise.all(uniqueTips.map(async (tip) => {
      const normalized = normalizeTip({ ...tip, source: 'admin', publicationStatus: tip.publicationStatus || TipPublicationStatus.DRAFT });
      await setDoc(getTicketDoc(normalized.id), removeUndefined(normalized));
      await syncPublicTicket(normalized);
    }));
  },

  updateTip: async (updatedTip: Tip): Promise<void> => {
    const normalized = normalizeTip(updatedTip);
    await setDoc(getTicketDoc(normalized.id), removeUndefined(normalized), { merge: true });
    await syncPublicTicket(normalized);
  },

  deleteTip: async (id: string): Promise<void> => {
    await Promise.all([
      deleteDoc(getTicketDoc(id)),
      deleteDoc(getPublicTicketDoc(id)).catch(() => undefined),
      deleteDoc(getPublicStatsTicketDoc(id)).catch(() => undefined),
    ]);
    invalidatePublicTicketCache();
  },

  publishTip: async (id: string): Promise<void> => {
    const snapshot = await getDoc(getTicketDoc(id));
    if (snapshot.exists()) {
      const existingTip = {
        ...snapshot.data(),
        id: snapshot.id,
        publicationStatus: TipPublicationStatus.PUBLISHED,
      } as Tip;
      const normalized = normalizeTip(existingTip);
      await setDoc(getTicketDoc(id), removeUndefined(normalized), { merge: true });
      await syncPublicTicket(normalized);
    }
  },

  unpublishTip: async (id: string): Promise<void> => {
    await updateDoc(getTicketDoc(id), {
      publicationStatus: TipPublicationStatus.DRAFT,
      publishedAt: '',
    });
    await Promise.all([
      deleteDoc(getPublicTicketDoc(id)).catch(() => undefined),
      deleteDoc(getPublicStatsTicketDoc(id)).catch(() => undefined),
    ]);
    invalidatePublicTicketCache();
  },

  subscribePublicStats: (callback: () => void): (() => void) => {
    return onSnapshot(
      query(getPublicStatsTicketsCollection()),
      () => {
        invalidateCachedQueries(PUBLIC_STATS_CACHE_KEY);
        callback();
      },
      () => undefined,
    );
  },

  subscribe: (callback: () => void, access?: { canAccessFree: boolean; canAccessVip: boolean }): (() => void) => {
    const dailyAnalysesQuery = query(getDailyAnalysesCollection());

    if (access?.canAccessFree && !access.canAccessVip) {
      const unsubscribers = [
        onSnapshot(
          query(getTicketsCollection(), where('publicationStatus', '==', TipPublicationStatus.PUBLISHED), where('isVip', '==', false)),
          () => callback(),
          (error) => {
            console.error('Free tickets subscription failed:', error);
            callback();
          }
        ),
        onSnapshot(
          query(getPublicTicketsCollection(), where('isVip', '==', true)),
          () => {
            invalidateCachedQueries(PUBLIC_VIP_TICKETS_CACHE_KEY);
            callback();
          },
          (error) => {
            console.error('Safe VIP tickets subscription failed:', error);
            callback();
          }
        ),
      ];

      return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    }

    const ticketsQuery = access
      ? access.canAccessVip
        ? query(getTicketsCollection(), where('publicationStatus', '==', TipPublicationStatus.PUBLISHED))
        : query(getPublicTicketsCollection())
      : query(getTicketsCollection());

    const unsubscribers = [
      onSnapshot(
        ticketsQuery,
        () => {
          if (access && !access.canAccessVip) invalidatePublicTicketCache();
          callback();
        },
        (error) => {
          console.error('Tickets shared store subscription failed:', error);
          callback();
        }
      ),
    ];

    if (!access || access.canAccessVip) {
      unsubscribers.push(onSnapshot(
        dailyAnalysesQuery,
        () => callback(),
        (error) => {
          console.error('Daily analyses subscription failed:', error);
          callback();
        }
      ));
    }

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  },
};
