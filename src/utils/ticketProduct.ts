import { type Tip, type TicketProductType } from '../types';

export const TICKET_PRODUCT_LABELS: Record<TicketProductType, string> = {
  elite_ticket: 'ELITE TIKET',
  safe_pick: 'SAFE PICK',
};

export const TICKET_PRODUCT_DESCRIPTIONS: Record<TicketProductType, string> = {
  elite_ticket: 'Premium tiket sa većom kvotom i ciljem većeg profita.',
  safe_pick: 'Stabilniji pick sa fokusom na veću prolaznost.',
};

export const getTicketProductType = (tip: Pick<Tip, 'type' | 'id' | 'isVip' | 'ticketType' | 'matches'>): TicketProductType => {
  if (tip.type === 'safe_pick' || tip.type === 'elite_ticket') return tip.type;

  const rawTicketType = String(tip.ticketType || '').toLowerCase();
  if (rawTicketType.includes('safe')) return 'safe_pick';
  if (rawTicketType.includes('elite')) return 'elite_ticket';

  return 'elite_ticket';
};

export const getTicketProductLabel = (tip: Pick<Tip, 'type' | 'id' | 'isVip' | 'ticketType' | 'matches'>) =>
  TICKET_PRODUCT_LABELS[getTicketProductType(tip)];

export const isSafePick = (tip: Pick<Tip, 'type' | 'id' | 'isVip' | 'ticketType' | 'matches'>) =>
  getTicketProductType(tip) === 'safe_pick';

export const getTicketProductTone = (tip: Pick<Tip, 'type' | 'id' | 'isVip' | 'ticketType' | 'matches'>) =>
  isSafePick(tip)
    ? {
      badge: 'border-blue-400/35 bg-blue-500/10 text-blue-200',
      text: 'text-blue-300',
      active: 'border-blue-400 bg-blue-400 text-black',
      muted: 'border-blue-400/20 bg-blue-500/5 text-blue-200 hover:border-blue-400/45',
    }
    : {
      badge: 'border-gold-500/40 bg-gold-500/12 text-gold-200',
      text: 'text-gold-300',
      active: 'border-[#f59e0b] bg-[#f59e0b] text-black',
      muted: 'border-gold-500/20 bg-gold-500/5 text-gold-200 hover:border-gold-500/45',
    };
