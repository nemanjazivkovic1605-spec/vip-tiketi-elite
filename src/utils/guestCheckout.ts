import type { SingleTicketProductId } from './ticketPurchases';

const TOKEN = /^[a-f0-9]{64}$/;
const keyFor = (ticketId: string) => `elite:guest-ticket:${ticketId}`;
export const guestCheckoutStorage = (): Storage | undefined => {
  try { return window.localStorage; } catch { return undefined; }
};
export const savedGuestToken = (ticketId: string, hash = '', storage?: Pick<Storage, 'getItem'>) => {
  const shared = new URLSearchParams(hash.replace(/^#/, '')).get('purchase');
  if (shared && TOKEN.test(shared)) return shared;
  try { const saved = storage?.getItem(keyFor(ticketId)); return saved && TOKEN.test(saved) ? saved : ''; }
  catch { return ''; }
};
export const saveGuestToken = (ticketId: string, token: string, storage?: Pick<Storage, 'setItem'>) => {
  if (!TOKEN.test(token)) return false;
  try { if (!storage) return false; storage.setItem(keyFor(ticketId), token); return true; } catch { return false; }
};
export const newGuestToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
export const guestCheckoutLink = (origin: string, productId: SingleTicketProductId, ticketId: string, token: string) => {
  if (!TOKEN.test(token)) return '';
  const url = new URL('/checkout', origin);
  url.searchParams.set('product', productId); url.searchParams.set('ticketId', ticketId);
  url.hash = `purchase=${token}`;
  return url.toString();
};
