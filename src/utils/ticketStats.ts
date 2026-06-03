import { type GlobalStats, type MonthlyStats, type Tip, TicketStatus } from '../types';
import {
  calculateTicketUnitsProfit,
  getTicketUnitsStake,
  hasRealTicketOdds,
  isFinishedForStats,
  isSettledTicket,
  normalizeOdds,
  sortTicketsByDate,
  unitsToRsd,
} from './tickets';

const getMonthLabel = (key: string) => {
  const [year, month] = key.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' });
};

export const calculateMonthlyStats = (tips: Tip[]): MonthlyStats[] => {
  const finished = tips.filter((tip) => isFinishedForStats(tip.status) && hasRealTicketOdds(tip));
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
        tickets: sortTicketsByDate(monthTips),
      };
    });
};

export const calculateStats = (tips: Tip[]): GlobalStats => {
  const finished = tips.filter((tip) => isFinishedForStats(tip.status) && hasRealTicketOdds(tip));
  const completed = tips.filter((tip) => isSettledTicket(tip.status) && hasRealTicketOdds(tip));
  const wins = completed.filter((tip) => tip.status === TicketStatus.WON);
  const refunds = finished.filter((tip) => tip.status === TicketStatus.REFUND);

  const totalUnitsStaked = completed.reduce((acc, tip) => acc + getTicketUnitsStake(tip), 0);
  const unitsProfit = completed.reduce((acc, tip) => acc + calculateTicketUnitsProfit(tip), 0);
  const profit = unitsToRsd(unitsProfit);
  const averageOdds = finished.length > 0
    ? finished.reduce((acc, tip) => acc + normalizeOdds(tip.totalOdds), 0) / finished.length
    : 0;
  const yieldValue = totalUnitsStaked > 0 ? (unitsProfit / totalUnitsStaked) * 100 : 0;
  const monthlyBreakdown = calculateMonthlyStats(tips);
  let winStreak = 0;
  let loseStreak = 0;
  let currentWin = 0;
  let currentLose = 0;

  [...completed].reverse().forEach((tip) => {
    if (tip.status === TicketStatus.WON) {
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
    roi: parseFloat(yieldValue.toFixed(1)),
    winStreak,
    loseStreak,
    monthlyBreakdown,
  };
};
