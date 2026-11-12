export const SINGLE_TICKET_PRODUCTS = {
  'vip-ticket-day': { name: 'Elite tiket', category: 'elite_ticket', priceEur: 15 },
  'safe-pick-day': { name: 'Safe pick', category: 'safe_pick', priceEur: 10 },
} as const;
export const DEFAULT_EUR_RSD_RATE = 117.2;

export type SingleTicketProductId = keyof typeof SINGLE_TICKET_PRODUCTS;
export type TicketPurchase = {
  id: string;
  userId: string;
  userEmail: string;
  ticketId: string;
  ticketCode: string;
  ticketDate: string;
  productId: SingleTicketProductId;
  productName: string;
  priceEur: number;
  priceRsd: number;
  exchangeRate: number;
  reference: string;
  status: 'pending' | 'approved' | 'revoked';
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  paymentAvailable?: boolean;
};

export const isSingleTicketProduct = (id: string | null): id is SingleTicketProductId =>
  Boolean(id && Object.prototype.hasOwnProperty.call(SINGLE_TICKET_PRODUCTS, id));
