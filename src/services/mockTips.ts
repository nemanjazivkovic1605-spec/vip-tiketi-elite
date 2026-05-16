import { Tip, TicketStatus, GlobalStats } from '../types';
import { DEMO_TIPS } from '../lib/demoData';

const TIPS_KEY = 'elite_tips_data';
const TIPS_SEED_VERSION_KEY = 'elite_tips_seed_version';
const TIPS_SEED_VERSION = '2026-05-15-full-demo';
const TIPS_UPDATED_EVENT = 'elite_tips_updated';
const USE_REAL_API = import.meta.env.VITE_USE_REAL_API === 'true';

const safeReadTips = (): Tip[] | null => {
  try {
    const stored = localStorage.getItem(TIPS_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeTip = (tip: Tip): Tip => {
  const matches = Array.isArray(tip.matches) ? tip.matches : [];
  const totalOdds = matches.reduce((acc, match) => {
    const odds = Number(match.odds);
    return acc * (Number.isFinite(odds) && odds > 0 ? odds : 1);
  }, 1);

  return {
    ...tip,
    id: tip.id || Math.random().toString(36).slice(2, 11),
    source: tip.source || 'demo',
    status: tip.status || TicketStatus.PENDING,
    isVip: Boolean(tip.isVip),
    date: tip.date || new Date().toISOString().split('T')[0],
    matches,
    totalOdds: Number.isFinite(tip.totalOdds) && tip.totalOdds > 0
      ? Number(tip.totalOdds.toFixed(2))
      : Number(totalOdds.toFixed(2)),
  };
};

const writeTips = (tips: Tip[]) => {
  localStorage.setItem(TIPS_KEY, JSON.stringify(tips.map(normalizeTip)));
  localStorage.setItem(TIPS_SEED_VERSION_KEY, TIPS_SEED_VERSION);
  window.dispatchEvent(new Event(TIPS_UPDATED_EVENT));
};

const ensureDemoTips = (): Tip[] => {
  const storedTips = safeReadTips();
  const seedVersion = localStorage.getItem(TIPS_SEED_VERSION_KEY);

  if (USE_REAL_API) {
    const adminTips = (storedTips || [])
      .filter((tip) => tip.source === 'admin')
      .map(normalizeTip);
    localStorage.setItem(TIPS_KEY, JSON.stringify(adminTips));
    localStorage.setItem(TIPS_SEED_VERSION_KEY, 'real-api-admin-only');
    return adminTips;
  }

  if (storedTips && storedTips.length > 0 && seedVersion === TIPS_SEED_VERSION) {
    const normalized = storedTips.map(normalizeTip);
    localStorage.setItem(TIPS_KEY, JSON.stringify(normalized));
    return normalized;
  }

  const demoTips = DEMO_TIPS.map(normalizeTip);
  localStorage.setItem(TIPS_KEY, JSON.stringify(demoTips));
  localStorage.setItem(TIPS_SEED_VERSION_KEY, TIPS_SEED_VERSION);
  return demoTips;
};

export const mockTipsService = {
  getTips: async (): Promise<Tip[]> => {
    return ensureDemoTips();
  },

  getVipTips: async (): Promise<Tip[]> => {
    const tips = await mockTipsService.getTips();
    return tips.filter(t => t.isVip);
  },

  getFreeTips: async (): Promise<Tip[]> => {
    const tips = await mockTipsService.getTips();
    return tips.filter(t => !t.isVip);
  },

  getStats: async (): Promise<GlobalStats> => {
    const tips = await mockTipsService.getTips();
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

    // Calculate streaks
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
      loseStreak
    };
  },

  resetTips: async (): Promise<void> => {
    writeTips(USE_REAL_API ? [] : DEMO_TIPS);
  },

  addTip: async (tip: Tip): Promise<void> => {
    const tips = await mockTipsService.getTips();
    writeTips([normalizeTip({ ...tip, source: 'admin' }), ...tips]);
  },

  updateTip: async (updatedTip: Tip): Promise<void> => {
    const tips = await mockTipsService.getTips();
    const index = tips.findIndex(t => t.id === updatedTip.id);
    if (index !== -1) {
      tips[index] = normalizeTip(updatedTip);
      writeTips(tips);
    }
  },

  deleteTip: async (id: string): Promise<void> => {
    const tips = await mockTipsService.getTips();
    writeTips(tips.filter(t => t.id !== id));
  },

  subscribe: (callback: () => void): (() => void) => {
    const handler = () => callback();
    window.addEventListener(TIPS_UPDATED_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(TIPS_UPDATED_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  },
};
