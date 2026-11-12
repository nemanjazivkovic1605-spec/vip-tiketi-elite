import { TicketStatus, TipPublicationStatus, type Tip } from '../types.js';

const belgradeDate = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Belgrade', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

export const activeTicketDateRange = (now = new Date()) => {
  const today = belgradeDate(now);
  const offset = (days: number) => {
    const day = new Date(`${today}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + days);
    return day.toISOString().slice(0, 10);
  };
  return { first: offset(-6), last: offset(2) };
};

export const isCurrentActiveTicket = (tip: Pick<Tip, 'date' | 'status' | 'publicationStatus'>, now = new Date()) => {
  const { first, last } = activeTicketDateRange(now);
  return tip.publicationStatus === TipPublicationStatus.PUBLISHED
    && [TicketStatus.PENDING, TicketStatus.POSTPONED].includes(tip.status)
    && /^\d{4}-\d{2}-\d{2}$/.test(tip.date) && tip.date >= first && tip.date <= last;
};
