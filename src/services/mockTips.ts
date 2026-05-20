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
import { Tip, TicketStatus, GlobalStats, TipPublicationStatus } from '../types';

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
      analysis: cleanAnalysis(match.analysis),
    }))
    : [];
  const totalOdds = matches.reduce((acc, match) => {
    const odds = Number(match.odds);
    return acc * (Number.isFinite(odds) && odds > 0 ? odds : 1);
  }, 1);

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
    totalOdds: Number.isFinite(tip.totalOdds) && tip.totalOdds > 0
      ? Number(tip.totalOdds.toFixed(2))
      : Number(totalOdds.toFixed(2)),
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

const calculateStats = (tips: Tip[]): GlobalStats => {
  const completed = tips.filter(t => t.status !== TicketStatus.PENDING);
  const wins = completed.filter(t => t.status === TicketStatus.WON);

  const totalStaked = completed.reduce((acc, t) => acc + (t.stake || 100), 0);
  const totalReturned = completed.reduce((acc, t) => {
    if (t.status === TicketStatus.WON) {
      return acc + ((t.stake || 100) * t.totalOdds);
    }
    return acc;
  }, 0);

  const profit = totalReturned - totalStaked;
  const roi = totalStaked > 0 ? (profit / totalStaked) * 100 : 0;
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
    successRate: parseFloat(((wins.length / (completed.length || 1)) * 100).toFixed(1)),
    monthlyProfit: parseFloat(profit.toFixed(2)),
    roi: parseFloat(roi.toFixed(1)),
    winStreak,
    loseStreak,
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
