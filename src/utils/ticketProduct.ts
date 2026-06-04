import { type Tip, type TicketProductType } from '../types';

export const TICKET_PRODUCT_LABELS: Record<TicketProductType, string> = {
  elite_ticket: 'ELITE TIKET',
  safe_pick: 'SAFE PICK',
  vip_monthly: 'VIP MESECNI TIPOVI',
};

export const TICKET_PRODUCT_DESCRIPTIONS: Record<TicketProductType, string> = {
  elite_ticket: 'Premium tiket sa vecom kvotom i ciljem veceg profita.',
  safe_pick: 'Stabilniji pick sa fokusom na vecu prolaznost.',
  vip_monthly: 'Dnevni i mesecni VIP tipovi sa odvojenom statistikom.',
};

export const getTicketProductType = (tip: Pick<Tip, 'type' | 'id' | 'isVip' | 'ticketType' | 'matches'>): TicketProductType => {
  const rawTicketType = String(tip.ticketType || '').toLowerCase();
  const rawId = String(tip.id || '').toLowerCase();

  if (rawId.startsWith('history-') || rawId.startsWith('daily-')) return 'vip_monthly';
  if (tip.type === 'safe_pick' || tip.type === 'elite_ticket' || tip.type === 'vip_monthly') return tip.type;

  if (rawTicketType.includes('monthly') || rawTicketType.includes('mesec') || rawTicketType.includes('mese') || rawTicketType.includes('dnevni') || rawTicketType.includes('daily')) return 'vip_monthly';
  if (rawTicketType.includes('safe')) return 'safe_pick';
  if (rawTicketType.includes('elite')) return 'elite_ticket';

  return 'elite_ticket';
};

export const getTicketProductLabel = (tip: Pick<Tip, 'type' | 'id' | 'isVip' | 'ticketType' | 'matches'>) =>
  TICKET_PRODUCT_LABELS[getTicketProductType(tip)];

export const isSafePick = (tip: Pick<Tip, 'type' | 'id' | 'isVip' | 'ticketType' | 'matches'>) =>
  getTicketProductType(tip) === 'safe_pick';

export const getTicketProductTone = (tip: Pick<Tip, 'type' | 'id' | 'isVip' | 'ticketType' | 'matches'>) => {
  const type = getTicketProductType(tip);

  if (type === 'safe_pick') {
    return {
      badge: 'border-blue-400/35 bg-blue-500/10 text-blue-200',
      text: 'text-blue-300',
      active: 'border-blue-400 bg-blue-400 text-black',
      muted: 'border-blue-400/20 bg-blue-500/5 text-blue-200 hover:border-blue-400/45',
    };
  }

  if (type === 'vip_monthly') {
    return {
      badge: 'border-purple-400/35 bg-purple-500/10 text-purple-200',
      text: 'text-purple-300',
      active: 'border-purple-400 bg-purple-400 text-black',
      muted: 'border-purple-400/20 bg-purple-500/5 text-purple-200 hover:border-purple-400/45',
    };
  }

  return {
    badge: 'border-gold-500/40 bg-gold-500/12 text-gold-200',
    text: 'text-gold-300',
    active: 'border-[#f59e0b] bg-[#f59e0b] text-black',
    muted: 'border-gold-500/20 bg-gold-500/5 text-gold-200 hover:border-gold-500/45',
  };
};
