import { auth } from '../lib/firebase';
import type { Tip } from '../types';
import type { TicketPurchase } from '../utils/ticketPurchases';

async function request<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Prijavite se i potvrdite email adresu.');
  const token = await user.getIdToken();
  const response = await fetch(`/api/ticket-purchases${path}`, {
    method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (auth.currentUser?.uid !== user.uid) throw new Error('Prijava je promenjena. Osvežite stranicu.');
  if (!response.ok) throw new Error(result.error || 'Zahtev trenutno nije dostupan.');
  return result as T;
}

export const ticketPurchasesService = {
  read: (ticketIds: string[]) => request<{ purchases: TicketPurchase[]; tickets: Tip[] }>(`?ticketIds=${encodeURIComponent(ticketIds.join(','))}`),
  create: (ticketId: string) => request<{ purchase: TicketPurchase }>('', { action: 'request', ticketId }),
  adminList: () => request<{ purchases: TicketPurchase[] }>('?mode=admin'),
  approve: (purchaseId: string) => request<{ purchase: TicketPurchase }>('', { action: 'approve', purchaseId, paymentVerified: true }),
  revoke: (purchaseId: string) => request<{ purchase: TicketPurchase }>('', { action: 'revoke', purchaseId }),
};
