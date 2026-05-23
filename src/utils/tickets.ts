import { Tip, TicketStatus, Match, User } from '../types';

export const UNIT_VALUE_RSD = 1000;

export const getTicketKind = (matchCount: number) => {
  if (matchCount === 1) return 'SINGL';
  if (matchCount === 2) return 'DUBL';
  return 'COMBO';
};

const pad2 = (value: number) => String(value).padStart(2, '0');

export const normalizePublishedDate = (value?: string) => {
  const raw = (value || '').trim();

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('.');
    return `${year}-${month}-${day}`;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  return new Date().toISOString().split('T')[0];
};

export const normalizePublishedTime = (value?: string) => {
  const raw = (value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  const minute = match ? Number(match[2]) : Math.floor(Math.random() * 60);

  return `12:${pad2(Math.min(59, Math.max(0, Number.isFinite(minute) ? minute : 0)))}`;
};

export const generatePublishedTime = () => `12:${pad2(Math.floor(Math.random() * 60))}`;

export const buildPublishedAt = (publishedDate: string, publishedTime: string) =>
  `${normalizePublishedDate(publishedDate)}T${normalizePublishedTime(publishedTime)}:00`;

export const generateTicketCode = (isVip: boolean, publishedDate: string, publishedTime: string) => {
  const [year, month, day] = normalizePublishedDate(publishedDate).split('-');
  const minute = normalizePublishedTime(publishedTime).slice(3, 5);
  return `${isVip ? 'V' : 'F'}${day}${month}${year}12${minute}`;
};

export const getTicketPublicationMeta = (tip: Pick<Tip, 'date' | 'isVip' | 'publishedDate' | 'publishedTime'>) => {
  const publishedDate = normalizePublishedDate(tip.publishedDate || tip.date);
  const publishedTime = normalizePublishedTime(tip.publishedTime || generatePublishedTime());

  return {
    publishedDate,
    publishedTime,
    publishedAt: buildPublishedAt(publishedDate, publishedTime),
    ticketCode: generateTicketCode(Boolean(tip.isVip), publishedDate, publishedTime),
  };
};

export const formatTicketPublishedAt = (tip: Pick<Tip, 'publishedAt' | 'publishedDate' | 'publishedTime' | 'date'>) => {
  const value = tip.publishedAt || buildPublishedAt(tip.publishedDate || tip.date, tip.publishedTime || '12:00');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return tip.date;
  return date.toLocaleString('sr-Latn-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

export const getDefaultUnitsStake = (isVip: boolean, matchCount: number) => {
  if (!isVip) return 5;
  if (matchCount === 1) return 10;
  return 5;
};

export const unitsToRsd = (units: number) => Number((units * UNIT_VALUE_RSD).toFixed(2));

export const getDefaultStake = (isVip: boolean, matchCount: number) =>
  unitsToRsd(getDefaultUnitsStake(isVip, matchCount));

export const getTicketStake = (tip: Tip) => {
  return unitsToRsd(getTicketUnitsStake(tip));
};

export const getTicketUnitsStake = (tip: Tip) => {
  const units = Number(tip.unitsStake);
  if (!Number.isFinite(units) || units <= 0) {
    const legacyStake = Number(tip.stake);
    if (Number.isFinite(legacyStake) && legacyStake > 0) {
      return Math.min(10, Math.max(1, Number((legacyStake / UNIT_VALUE_RSD).toFixed(2))));
    }
    return getDefaultUnitsStake(tip.isVip, tip.matches?.length || 0);
  }
  return Math.min(10, Math.max(1, units));
};

export const isSettledTicket = (status: TicketStatus) =>
  status === TicketStatus.WON || status === TicketStatus.LOST;

export const isFinishedForStats = (status: TicketStatus) =>
  status === TicketStatus.WON || status === TicketStatus.LOST || status === TicketStatus.REFUND;

export const isPublicFinishedTicket = (status: TicketStatus) =>
  status === TicketStatus.WON || status === TicketStatus.LOST || status === TicketStatus.REFUND || status === TicketStatus.POSTPONED;

export const calculateTicketProfit = (tip: Tip) => {
  if (!isSettledTicket(tip.status)) return 0;

  const stake = getTicketStake(tip);
  if (tip.status === TicketStatus.WON) {
    return Number((stake * (normalizeOdds(tip.totalOdds) - 1)).toFixed(2));
  }

  return Number((-stake).toFixed(2));
};

export const calculateTicketRsdProfit = (tip: Tip) => unitsToRsd(calculateTicketUnitsProfit(tip));

export const calculateTicketUnitsProfit = (tip: Tip) => {
  if (tip.status === TicketStatus.REFUND) return 0;
  if (!isSettledTicket(tip.status)) return 0;

  const units = getTicketUnitsStake(tip);
  if (tip.status === TicketStatus.WON) {
    return Number((units * (normalizeOdds(tip.totalOdds) - 1)).toFixed(2));
  }

  return Number((-units).toFixed(2));
};

export const isTicketLockedForUser = (tip: Tip, user: User | null, canAccessVip: boolean) => {
  if (!user) return !isPublicFinishedTicket(tip.status);
  if (!user.isAdmin && !user.emailVerified) return true;
  return tip.isVip && !canAccessVip;
};

export const isPredictionLockedForUser = (
  tip: Tip,
  user: User | null,
  canAccessFree: boolean,
  canAccessVip: boolean,
) => {
  if (tip.locked) return true;
  if (tip.isVip && !canAccessVip) return true;
  if (!user || (!user.isAdmin && !user.emailVerified)) {
    return !isPublicFinishedTicket(tip.status);
  }
  if (!canAccessFree && !isPublicFinishedTicket(tip.status)) return true;
  return false;
};

export const canReadVipAnalysis = (tip: Tip, canAccessVip: boolean) => tip.isVip && canAccessVip;
