import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Tip, TicketStatus, GlobalStats, TipPublicationStatus, MonthlyStats } from '../types';
import {
  calculateTicketUnitsProfit,
  calculateTotalOdds,
  getTicketStake,
  getTicketUnitsStake,
  isFinishedForStats,
  isSettledTicket,
  normalizeOdds,
  unitsToRsd,
} from '../utils/tickets';

const TICKETS_COLLECTION = 'tickets';
const LEGACY_TIPS_KEY = 'elite_tips_data';
const LEGACY_TIPS_MIGRATED_KEY = 'elite_tips_data_migrated_to_firestore';

const cleanAnalysis = (analysis?: string) => {
  const value = (analysis || '').trim();
  if (value.startsWith('Istorijski predlog') && value.endsWith('baze.')) return '';
  if (value.startsWith('Automatski pripremljen') && value.includes('istorijski') && /\d{4}-\d{2}-\d{2}\.$/.test(value)) return '';
  return value;
};

const normalizeTip = (tip: Tip): Tip => {
  const matches = Array.isArray(tip.matches)
    ? tip.matches.map((match) => ({
      ...match,
      odds: normalizeOdds(match.odds),
      analysis: cleanAnalysis(match.analysis),
    }))
    : [];
  const totalOdds = calculateTotalOdds(matches);

  return {
    ...tip,
    id: tip.id || Math.random().toString(36).slice(2, 11),
    source: 'admin',
    publicationStatus: tip.publicationStatus || TipPublicationStatus.DRAFT,
    status: tip.status || TicketStatus.PENDING,
    isVip: Boolean(tip.isVip),
    date: tip.date || new Date().toISOString().split('T')[0],
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

const getTicketDoc = (id: string) => doc(db, TICKETS_COLLECTION, id);

const readLegacyLocalTips = (): Tip[] => {
  try {
    const stored = localStorage.getItem(LEGACY_TIPS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const migrateLegacyLocalTips = async (existingTips: Tip[]) => {
  if (localStorage.getItem(LEGACY_TIPS_MIGRATED_KEY) === 'true') return existingTips;

  const legacyTips = readLegacyLocalTips()
    .filter((tip) => tip && tip.source === 'admin')
    .map((tip) => normalizeTip(tip));

  if (legacyTips.length === 0) {
    localStorage.setItem(LEGACY_TIPS_MIGRATED_KEY, 'true');
    return existingTips;
  }

  const existingIds = new Set(existingTips.map((tip) => tip.id));
  const tipsToUpload = legacyTips.filter((tip) => !existingIds.has(tip.id));

  if (tipsToUpload.length > 0) {
    await Promise.all(tipsToUpload.map((tip) => setDoc(getTicketDoc(tip.id), removeUndefined(tip))));
  }

  localStorage.setItem(LEGACY_TIPS_MIGRATED_KEY, 'true');
  return sortTips([...tipsToUpload, ...existingTips]);
};

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

const readAllTips = async (): Promise<Tip[]> => {
  const snapshot = await getDocs(query(getTicketsCollection()));
  const sharedTips = sortTips(snapshot.docs.map((ticketDoc) => normalizeTip({
    ...ticketDoc.data(),
    id: ticketDoc.id,
  } as Tip)));
  return migrateLegacyLocalTips(sharedTips);
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
    return publicOnly(await readAllTips());
  },

  getPublishedTips: async (): Promise<Tip[]> => {
    return publicOnly(await readAllTips());
  },

  getVipTips: async (): Promise<Tip[]> => {
    const tips = await mockTipsService.getPublishedTips();
    return tips.filter(t => t.isVip);
  },

  getFreeTips: async (): Promise<Tip[]> => {
    const tips = await mockTipsService.getPublishedTips();
    return tips.filter(t => !t.isVip);
  },

  getStats: async (): Promise<GlobalStats> => {
    return calculateStats(await mockTipsService.getPublishedTips());
  },

  resetTips: async (): Promise<void> => {
    const tips = await readAllTips();
    await Promise.all(tips.map((tip) => deleteDoc(getTicketDoc(tip.id))));
  },

  addTip: async (tip: Tip): Promise<void> => {
    const normalized = normalizeTip({ ...tip, source: 'admin', publicationStatus: tip.publicationStatus || TipPublicationStatus.DRAFT });
    await setDoc(getTicketDoc(normalized.id), removeUndefined(normalized));
  },

  addTips: async (newTips: Tip[]): Promise<void> => {
    const existingTips = await readAllTips();
    const existingIds = new Set(existingTips.map((tip) => tip.id));
    const uniqueTips = newTips.filter((tip) => !existingIds.has(tip.id));

    await Promise.all(uniqueTips.map((tip) => {
      const normalized = normalizeTip({ ...tip, source: 'admin', publicationStatus: tip.publicationStatus || TipPublicationStatus.DRAFT });
      return setDoc(getTicketDoc(normalized.id), removeUndefined(normalized));
    }));
  },

  updateTip: async (updatedTip: Tip): Promise<void> => {
    const normalized = normalizeTip(updatedTip);
    await setDoc(getTicketDoc(normalized.id), removeUndefined(normalized), { merge: true });
  },

  deleteTip: async (id: string): Promise<void> => {
    await deleteDoc(getTicketDoc(id));
  },

  publishTip: async (id: string): Promise<void> => {
    await updateDoc(getTicketDoc(id), {
      publicationStatus: TipPublicationStatus.PUBLISHED,
      publishedAt: new Date().toISOString(),
    });
  },

  unpublishTip: async (id: string): Promise<void> => {
    await updateDoc(getTicketDoc(id), {
      publicationStatus: TipPublicationStatus.DRAFT,
      publishedAt: '',
    });
  },

  subscribe: (callback: () => void): (() => void) => {
    return onSnapshot(
      query(getTicketsCollection()),
      () => callback(),
      (error) => {
        console.error('Tickets shared store subscription failed:', error);
        callback();
      }
    );
  },
};
