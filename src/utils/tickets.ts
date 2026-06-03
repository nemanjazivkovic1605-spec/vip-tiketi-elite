import { Tip, TicketStatus, Match, User } from '../types';

export const UNIT_VALUE_RSD = 1000;

export const getTicketKind = (matchCount: number) => {
  if (matchCount === 1) return 'SINGL';
  if (matchCount === 2) return 'DUBL';
  return 'COMBO';
};

const pad2 = (value: number) => String(value).padStart(2, '0');

export const formatLocalIsoDate = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const formatLocalTime = (date: Date) =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

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
  if (!match) return '12:00';

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  return `${pad2(Math.min(23, Math.max(0, Number.isFinite(hour) ? hour : 12)))}:${pad2(Math.min(59, Math.max(0, Number.isFinite(minute) ? minute : 0)))}`;
};

const hasClockTime = (value?: string) => /^([01]?\d|2[0-3]):[0-5]\d/.test((value || '').trim());

export const generatePublishedTime = () => `12:${pad2(Math.floor(Math.random() * 60))}`;

export const buildPublishedAt = (publishedDate: string, publishedTime: string) =>
  `${normalizePublishedDate(publishedDate)}T${normalizePublishedTime(publishedTime)}:00`;

export const buildEventAt = (eventDate: string, eventTime: string) =>
  `${normalizePublishedDate(eventDate)}T${normalizePublishedTime(eventTime)}:00`;

export const generateTicketCode = (isVip: boolean, publishedDate: string, publishedTime: string) => {
  const [year, month, day] = normalizePublishedDate(publishedDate).split('-');
  const [hour, minute] = normalizePublishedTime(publishedTime).split(':');
  return `${isVip ? 'V' : 'F'}${day}${month}${year}${hour}${minute}`;
};

export const getTicketPublicationMeta = (
  tip: Pick<Tip, 'date' | 'isVip' | 'publishedDate' | 'publishedTime'> & Partial<Pick<Tip, 'id' | 'publishedAt' | 'createdAt'>>,
) => {
  const fallbackCreatedAt = !tip.publishedDate && !tip.publishedTime && !tip.publishedAt
    ? tip.createdAt
    : undefined;
  const storedTimestamp = tip.publishedAt || fallbackCreatedAt;
  const parsedTimestamp = storedTimestamp ? new Date(storedTimestamp) : undefined;
  const hasTimestamp = parsedTimestamp && Number.isFinite(parsedTimestamp.getTime());
  const publishedDate = normalizePublishedDate(
    tip.publishedDate || (hasTimestamp ? formatLocalIsoDate(parsedTimestamp) : tip.date),
  );
  const publishedTime = normalizePublishedTime(
    tip.publishedTime || (hasTimestamp ? formatLocalTime(parsedTimestamp) : '12:00'),
  );

  return {
    publishedDate,
    publishedTime,
    publishedAt: storedTimestamp && hasTimestamp && !tip.publishedDate && !tip.publishedTime
      ? storedTimestamp
      : buildPublishedAt(publishedDate, publishedTime),
    ticketCode: generateTicketCode(Boolean(tip.isVip), publishedDate, publishedTime),
  };
};

export const getMatchEventDate = (match: Partial<Match>, fallbackDate?: string) =>
  normalizePublishedDate(match.eventDate || fallbackDate);

export const getMatchEventTime = (match: Partial<Match>) => {
  if (hasClockTime(match.eventTime)) return normalizePublishedTime(match.eventTime);
  if (hasClockTime(match.time)) return normalizePublishedTime(match.time);
  return '20:00';
};

export const getFirstMatchStartAt = (tip: Pick<Tip, 'date' | 'matches'>) => {
  const starts = (tip.matches || [])
    .map((match) => new Date(buildEventAt(getMatchEventDate(match, tip.date), getMatchEventTime(match))))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return starts[0];
};

const getTicketPublishedDate = (tip: Pick<Tip, 'publishedAt' | 'publishedDate' | 'publishedTime' | 'date' | 'createdAt'>) => {
  const value = tip.publishedAt || tip.createdAt || buildPublishedAt(tip.publishedDate || tip.date, tip.publishedTime || '12:00');
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export const getCorrectedPublicationMetaIfInvalid = (tip: Tip) => {
  const published = getTicketPublishedDate(tip);
  const firstMatchStart = getFirstMatchStartAt(tip);

  if (!published || !firstMatchStart || published.getTime() < firstMatchStart.getTime()) {
    return getTicketPublicationMeta(tip);
  }

  const seed = hashString(`${tip.id}-${firstMatchStart.toISOString()}`);
  const minutesBeforeKickoff = 60 + (seed % 241);
  const corrected = new Date(firstMatchStart.getTime() - minutesBeforeKickoff * 60 * 1000);
  const publishedDate = formatLocalIsoDate(corrected);
  const publishedTime = formatLocalTime(corrected);

  return {
    publishedDate,
    publishedTime,
    publishedAt: buildPublishedAt(publishedDate, publishedTime),
    ticketCode: generateTicketCode(Boolean(tip.isVip), publishedDate, publishedTime),
  };
};

export const isPublishedBeforeFirstMatch = (tip: Pick<Tip, 'publishedAt' | 'publishedDate' | 'publishedTime' | 'date' | 'createdAt' | 'matches'>) => {
  const published = getTicketPublishedDate(tip);
  const firstMatchStart = getFirstMatchStartAt(tip);
  if (!published || !firstMatchStart) return false;
  return published.getTime() < firstMatchStart.getTime();
};

export const formatDateTimeForDisplay = (value?: string) => {
  if (!value) return 'Nije podeseno';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Nije podeseno';
  const datePart = date.toLocaleDateString('sr-Latn-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('sr-Latn-RS', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} u ${timePart}`;
};

export const formatTicketPublishedAt = (tip: Pick<Tip, 'publishedAt' | 'publishedDate' | 'publishedTime' | 'date' | 'createdAt'>) => {
  const value = tip.publishedAt || tip.createdAt || buildPublishedAt(tip.publishedDate || tip.date, tip.publishedTime || '12:00');
  return formatDateTimeForDisplay(value);
};

export const formatFirstMatchStartAt = (tip: Pick<Tip, 'date' | 'matches'>) => {
  const firstMatchStart = getFirstMatchStartAt(tip);
  return firstMatchStart ? formatDateTimeForDisplay(firstMatchStart.toISOString()) : 'Nije podeseno';
};

export const sortTicketsByDate = (tips: Tip[]) =>
  [...tips].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return (b.publishedAt || '').localeCompare(a.publishedAt || '');
  });

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

export const hasRealTicketOdds = (tip: Pick<Tip, 'totalOdds' | 'matches' | 'locked'>) => {
  if (tip.locked) return false;
  const totalOdds = Number(tip.totalOdds);
  if (!Number.isFinite(totalOdds) || totalOdds <= 1) return false;

  return (tip.matches || []).every((match) => {
    const odds = Number(match.odds);
    return Number.isFinite(odds) && odds > 1;
  });
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
  if (tip.isVip && !canAccessVip && !isPublicFinishedTicket(tip.status)) return true;
  if (!user || (!user.isAdmin && !user.emailVerified)) {
    return !isPublicFinishedTicket(tip.status);
  }
  if (!canAccessFree && !isPublicFinishedTicket(tip.status)) return true;
  return false;
};

export const canReadVipAnalysis = (tip: Tip, canAccessVip: boolean) => tip.isVip && canAccessVip;
