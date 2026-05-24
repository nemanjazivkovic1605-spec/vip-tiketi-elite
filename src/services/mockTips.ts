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
import { Tip, TicketStatus, GlobalStats, TipPublicationStatus, MonthlyStats } from '../types';
import {
  calculateTicketUnitsProfit,
  calculateTotalOdds,
  getTicketPublicationMeta,
  getTicketStake,
  getTicketUnitsStake,
  isFinishedForStats,
  isSettledTicket,
  normalizeOdds,
  normalizePublishedDate,
  unitsToRsd,
} from '../utils/tickets';

const TICKETS_COLLECTION = 'tickets';
const PUBLIC_TICKETS_COLLECTION = 'publicTickets';

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
  const date = tip.date || new Date().toISOString().split('T')[0];
  const publicationStatus = tip.publicationStatus || TipPublicationStatus.DRAFT;
  const status = tip.status || TicketStatus.PENDING;
  const publishedDate = normalizePublishedDate(date);
  const publicationMeta = getTicketPublicationMeta({
    id: tip.id,
    date: publishedDate,
    isVip: Boolean(tip.isVip),
    publishedDate,
    publishedTime: tip.publishedTime,
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
    date: publishedDate,
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

const sortTips = (tips: Tip[]) =>
  [...tips].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return (b.publishedAt || '').localeCompare(a.publishedAt || '');
  });

const publicOnly = (tips: Tip[]) =>
  tips.filter((tip) => tip.publicationStatus === TipPublicationStatus.PUBLISHED);

const getTicketsCollection = () => collection(db, TICKETS_COLLECTION);
const getPublicTicketsCollection = () => collection(db, PUBLIC_TICKETS_COLLECTION);

const getTicketDoc = (id: string) => doc(db, TICKETS_COLLECTION, id);
const getPublicTicketDoc = (id: string) => doc(db, PUBLIC_TICKETS_COLLECTION, id);

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

const sanitizePublicTip = (tip: Tip): Tip => {
  const normalized = normalizeTip(tip);
  const isVip = Boolean(normalized.isVip);
  const isActive = normalized.status === TicketStatus.PENDING;

  if (isActive) {
    const lockedMatches = [{
      id: `${normalized.id}-locked`,
      teams: 'Meč zaključan',
      homeTeam: '',
      awayTeam: '',
      league: '',
      prediction: '',
      odds: 1,
      time: '',
    }];

    return {
      ...normalized,
      locked: true,
      analysis: '',
      result: '',
      totalOdds: 1,
      totalOddsOverride: false,
      matches: lockedMatches.map((match, index) => ({
        id: match.id || `${normalized.id}-locked-${index}`,
        externalMatchId: '',
        teams: 'Meč zaključan',
        homeTeam: '',
        awayTeam: '',
        league: '',
        prediction: '',
        odds: 1,
        time: '',
        result: '',
        status: normalized.status,
        analysis: '',
      })),
    };
  }

  return {
    ...normalized,
    locked: false,
    analysis: '',
    matches: normalized.matches.map((match) => ({
      ...match,
      prediction: isVip ? 'VIP TIP' : match.prediction,
      analysis: '',
    })),
  };
};

const syncPublicTicket = async (tip: Tip) => {
  const normalized = normalizeTip(tip);

  if (normalized.publicationStatus !== TipPublicationStatus.PUBLISHED) {
    await deleteDoc(getPublicTicketDoc(normalized.id)).catch(() => undefined);
    return;
  }

  await setDoc(getPublicTicketDoc(normalized.id), removeUndefined(sanitizePublicTip(normalized)));
};

const needsTicketMetadataRepair = (original: Tip, normalized: Tip) =>
  original.publishedDate !== normalized.publishedDate
  || original.publishedTime !== normalized.publishedTime
  || original.publishedAt !== normalized.publishedAt
  || original.ticketCode !== normalized.ticketCode;

const readAllTips = async (): Promise<Tip[]> => {
  const snapshot = await getDocs(query(getTicketsCollection()));
  return sortTips(snapshot.docs.map((ticketDoc) => normalizeTip({
    ...ticketDoc.data(),
    id: ticketDoc.id,
  } as Tip)));
};

const readPublishedFreeTips = async (): Promise<Tip[]> => {
  const snapshot = await getDocs(query(getPublicTicketsCollection(), where('isVip', '==', false)));
  return sortTips(snapshot.docs.map((ticketDoc) => normalizeTip({
    ...ticketDoc.data(),
    id: ticketDoc.id,
  } as Tip)));
};

const readPublishedFullFreeTips = async (): Promise<Tip[]> => {
  const snapshot = await getDocs(query(
    getTicketsCollection(),
    where('publicationStatus', '==', TipPublicationStatus.PUBLISHED),
    where('isVip', '==', false),
  ));
  return sortTips(snapshot.docs.map((ticketDoc) => normalizeTip({
    ...ticketDoc.data(),
    id: ticketDoc.id,
  } as Tip)));
};

const readPublishedSafeVipTips = async (): Promise<Tip[]> => {
  const snapshot = await getDocs(query(getPublicTicketsCollection(), where('isVip', '==', true)));
  return sortTips(snapshot.docs.map((ticketDoc) => normalizeTip({
    ...ticketDoc.data(),
    id: ticketDoc.id,
  } as Tip)));
};

const readPublishedSafeTips = async (): Promise<Tip[]> => {
  const snapshot = await getDocs(query(getPublicTicketsCollection()));
  return sortTips(snapshot.docs.map((ticketDoc) => normalizeTip({
    ...ticketDoc.data(),
    id: ticketDoc.id,
  } as Tip)));
};

const mergeTips = (...groups: Tip[][]) => {
  const byId = new Map<string, Tip>();
  groups.flat().forEach((tip) => byId.set(tip.id, tip));
  return sortTips(Array.from(byId.values()));
};

const readPublishedTips = async (): Promise<Tip[]> => {
  const snapshot = await getDocs(query(
    getTicketsCollection(),
    where('publicationStatus', '==', TipPublicationStatus.PUBLISHED),
  ));
  return sortTips(snapshot.docs.map((ticketDoc) => normalizeTip({
    ...ticketDoc.data(),
    id: ticketDoc.id,
  } as Tip)));
};

const getMonthLabel = (key: string) => {
  const [year, month] = key.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' });
};

const calculateMonthlyStats = (tips: Tip[]): MonthlyStats[] => {
  const finished = tips.filter((tip) => isFinishedForStats(tip.status));
  const grouped = new Map<string, Tip[]>();

  finished.forEach((tip) => {
    const key = (tip.date || '').slice(0, 7) || 'unknown';
    const current = grouped.get(key) || [];
    current.push(tip);
    grouped.set(key, current);
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, monthTips]) => {
      const graded = monthTips.filter((tip) => isSettledTicket(tip.status));
      const wins = graded.filter((tip) => tip.status === TicketStatus.WON).length;
      const losses = graded.filter((tip) => tip.status === TicketStatus.LOST).length;
      const refunds = monthTips.filter((tip) => tip.status === TicketStatus.REFUND).length;
      const unitsStaked = graded.reduce((acc, tip) => acc + getTicketUnitsStake(tip), 0);
      const profitUnits = graded.reduce((acc, tip) => acc + calculateTicketUnitsProfit(tip), 0);
      const averageOdds = monthTips.length > 0
        ? monthTips.reduce((acc, tip) => acc + normalizeOdds(tip.totalOdds), 0) / monthTips.length
        : 0;
      const yieldValue = unitsStaked > 0 ? (profitUnits / unitsStaked) * 100 : 0;

      return {
        key,
        month: getMonthLabel(key),
        totalTickets: monthTips.length,
        wins,
        losses,
        refunds,
        averageOdds: Number(averageOdds.toFixed(2)),
        profitUnits: Number(profitUnits.toFixed(2)),
        profitRsd: unitsToRsd(profitUnits),
        unitsStaked: Number(unitsStaked.toFixed(2)),
        yield: Number(yieldValue.toFixed(1)),
        roi: Number(yieldValue.toFixed(1)),
        tickets: sortTips(monthTips),
      };
    });
};

const calculateStats = (tips: Tip[]): GlobalStats => {
  const finished = tips.filter(t => isFinishedForStats(t.status));
  const completed = tips.filter(t => isSettledTicket(t.status));
  const wins = completed.filter(t => t.status === TicketStatus.WON);
  const refunds = finished.filter(t => t.status === TicketStatus.REFUND);

  const totalUnitsStaked = completed.reduce((acc, t) => acc + getTicketUnitsStake(t), 0);
  const unitsProfit = completed.reduce((acc, t) => acc + calculateTicketUnitsProfit(t), 0);
  const profit = unitsToRsd(unitsProfit);
  const averageOdds = finished.length > 0
    ? finished.reduce((acc, t) => acc + normalizeOdds(t.totalOdds), 0) / finished.length
    : 0;
  const yieldValue = totalUnitsStaked > 0 ? (unitsProfit / totalUnitsStaked) * 100 : 0;
  const roi = yieldValue;
  const monthlyBreakdown = calculateMonthlyStats(tips);
  let winStreak = 0;
  let loseStreak = 0;
  let currentWin = 0;
  let currentLose = 0;

  [...completed].reverse().forEach(t => {
    if (t.status === TicketStatus.WON) {
      currentWin++;
      currentLose = 0;
      if (currentWin > winStreak) winStreak = currentWin;
    } else {
      currentLose++;
      currentWin = 0;
      if (currentLose > loseStreak) loseStreak = currentLose;
    }
  });

  return {
    totalTips: tips.length,
    winCount: wins.length,
    lossCount: completed.length - wins.length,
    refundCount: refunds.length,
    completedCount: finished.length,
    successRate: parseFloat(((wins.length / (completed.length || 1)) * 100).toFixed(1)),
    hitRate: parseFloat(((wins.length / (completed.length || 1)) * 100).toFixed(1)),
    monthlyProfit: parseFloat(profit.toFixed(2)),
    unitsProfit: parseFloat(unitsProfit.toFixed(2)),
    totalUnitsStaked: parseFloat(totalUnitsStaked.toFixed(2)),
    averageOdds: parseFloat(averageOdds.toFixed(2)),
    yield: parseFloat(yieldValue.toFixed(1)),
    roi: parseFloat(roi.toFixed(1)),
    winStreak,
    loseStreak,
    monthlyBreakdown,
  };
};

export const mockTipsService = {
  getAllTips: async (): Promise<Tip[]> => {
    return readAllTips();
  },

  getTips: async (): Promise<Tip[]> => {
    return readPublishedSafeTips();
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
    return tips.filter(t => t.isVip);
  },

  getFreeTips: async (): Promise<Tip[]> => {
    return readPublishedFullFreeTips();
  },

  getStats: async (): Promise<GlobalStats> => {
    return calculateStats(await mockTipsService.getPublishedTips());
  },

  getVisibleStats: async (access: { canAccessFree: boolean; canAccessVip: boolean }): Promise<GlobalStats> => {
    return calculateStats(await mockTipsService.getVisibleTips(access));
  },

  syncPublicTickets: async (tips?: Tip[]): Promise<void> => {
    const sourceTips = tips || await readAllTips();
    const publishedIds = new Set(publicOnly(sourceTips).map((tip) => tip.id));
    const publicSnapshot = await getDocs(query(getPublicTicketsCollection()));

    await Promise.all([
      ...sourceTips.map((tip) => syncPublicTicket(tip)),
      ...publicSnapshot.docs
        .filter((ticketDoc) => !publishedIds.has(ticketDoc.id))
        .map((ticketDoc) => deleteDoc(getPublicTicketDoc(ticketDoc.id))),
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
    await Promise.all([
      ...tips.map((tip) => deleteDoc(getTicketDoc(tip.id))),
      ...publicTips.docs.map((ticketDoc) => deleteDoc(getPublicTicketDoc(ticketDoc.id))),
    ]);
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
    ]);
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
    await deleteDoc(getPublicTicketDoc(id)).catch(() => undefined);
  },

  subscribe: (callback: () => void, access?: { canAccessFree: boolean; canAccessVip: boolean }): (() => void) => {
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
          () => callback(),
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

    return onSnapshot(
      ticketsQuery,
      () => callback(),
      (error) => {
        console.error('Tickets shared store subscription failed:', error);
        callback();
      }
    );
  },
};
