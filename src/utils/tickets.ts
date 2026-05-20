import { Tip, TicketStatus, Match } from '../types';

export const getTicketKind = (matchCount: number) => {
  if (matchCount === 1) return 'SINGL';
  if (matchCount === 2) return 'DUBL';
  return 'COMBO';
};

export const getStatusLabel = (status: TicketStatus) => {
  if (status === TicketStatus.WON) return 'PROSLO';
  if (status === TicketStatus.LOST) return 'PALO';
  if (status === TicketStatus.POSTPONED) return 'ODLOZENO';
  if (status === TicketStatus.REFUND) return 'KVOTA 1 / POVRAT';
  return 'AKTIVAN';
};

export const normalizeOdds = (odds: unknown) => {
  const value = Number(odds);
  return Number.isFinite(value) && value > 0 ? value : 1;
};

export const calculateTotalOdds = (matches: Match[]) => {
  const total = matches.reduce((acc, match) => acc * normalizeOdds(match.odds), 1);
  return Number(total.toFixed(2));
};

export const getDefaultStake = (isVip: boolean, matchCount: number) => {
  if (!isVip) return 5000;
  if (matchCount === 1) return 10000;
  return 5000;
};

export const getTicketStake = (tip: Tip) => {
  const stake = Number(tip.stake);
  return Number.isFinite(stake) && stake > 0 ? stake : getDefaultStake(tip.isVip, tip.matches?.length || 0);
};

export const getTicketUnitsStake = (tip: Tip) => {
  const units = Number(tip.unitsStake);
  if (!Number.isFinite(units)) return 1;
  return Math.min(10, Math.max(1, units));
};

export const isSettledTicket = (status: TicketStatus) =>
  status === TicketStatus.WON || status === TicketStatus.LOST;

export const isFinishedForStats = (status: TicketStatus) =>
  status === TicketStatus.WON || status === TicketStatus.LOST || status === TicketStatus.REFUND;

export const calculateTicketProfit = (tip: Tip) => {
  if (!isSettledTicket(tip.status)) return 0;

  const stake = getTicketStake(tip);
  if (tip.status === TicketStatus.WON) {
    return Number((stake * (normalizeOdds(tip.totalOdds) - 1)).toFixed(2));
  }

  return Number((-stake).toFixed(2));
};

export const calculateTicketUnitsProfit = (tip: Tip) => {
  if (tip.status === TicketStatus.REFUND) return 0;
  if (!isSettledTicket(tip.status)) return 0;

  const units = getTicketUnitsStake(tip);
  if (tip.status === TicketStatus.WON) {
    return Number((units * (normalizeOdds(tip.totalOdds) - 1)).toFixed(2));
  }

  return Number((-units).toFixed(2));
};

export const isTicketLockedForUser = (tip: Tip, canAccessVip: boolean) =>
  tip.isVip && tip.status === TicketStatus.PENDING && !canAccessVip;
