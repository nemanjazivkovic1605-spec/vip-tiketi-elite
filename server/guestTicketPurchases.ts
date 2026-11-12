import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { TipPublicationStatus, type Tip } from '../src/types.js';
import { isPurchaseEmail, normalizePurchaseEmail, type TicketPurchase } from '../src/utils/ticketPurchases.js';
import { resolveTicketCode } from '../src/utils/tickets.js';
import { assertPublished, buildTicketPurchase, buyerView, paymentAvailable, plain, purchaseMatchesProduct,
  reservePaymentReference, ticketPurchaseId, TicketPurchaseError, validPurchaseTicketId } from './ticketPurchases.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const guestPurchaseOwner = (token: string) => `guest:${digest(token)}`;
export const GUEST_REQUESTS_PER_HOUR = 30;
const assertCredential = (ticketId: string, token: string) => {
  if (!validPurchaseTicketId(ticketId) || !/^[a-f0-9]{64}$/.test(token)) throw new TicketPurchaseError('Privatan link nije ispravan.', 400);
};

export async function requestGuestTicketPurchase(db: Firestore, ticketId: string, emailInput: string, token: string, clientIp: string, now = new Date()) {
  assertCredential(ticketId, token);
  const email = normalizePurchaseEmail(emailInput);
  if (!isPurchaseEmail(email)) throw new TicketPurchaseError('Unesite ispravnu email adresu.');
  const uid = guestPurchaseOwner(token), id = ticketPurchaseId(uid, ticketId), ref = db.doc(`ticketPurchases/${id}`);
  const limitRef = db.doc(`guestPurchaseLimits/${digest(clientIp || 'unknown')}`);
  return db.runTransaction(async transaction => {
    const [existing, ticket, summary, limit] = await transaction.getAll(ref, db.doc(`tickets/${ticketId}`), db.doc(`publicTickets/${ticketId}`), limitRef);
    const tip = ticket.exists ? { ...ticket.data(), id: ticketId } as Tip : undefined;
    if (existing.exists) {
      const row = { ...existing.data(), id } as TicketPurchase;
      if (row.buyerType !== 'guest' || row.userId !== uid || row.ticketId !== ticketId) throw new TicketPurchaseError('Zahtev nije dostupan.', 404);
      if (row.userEmail !== email) throw new TicketPurchaseError('Email postojećeg zahteva je drugačiji. Obratite se podršci.', 409);
      return buyerView(row, purchaseMatchesProduct(tip, row) && paymentAvailable(tip, summary.data() as Tip, now));
    }
    assertPublished(tip, summary.exists ? summary.data() as Tip : undefined);
    if (!paymentAvailable(tip, summary.data() as Tip, now)) throw new TicketPurchaseError('Kupovina je dostupna samo pre početka prvog meča.', 409);
    const previous = limit.data(), windowStart = Number(previous?.windowStart);
    const sameWindow = Number.isFinite(windowStart) && now.getTime() >= windowStart && now.getTime() - windowStart < 3600000;
    const count = sameWindow ? Number(previous?.count) || 0 : 0;
    if (count >= GUEST_REQUESTS_PER_HOUR) throw new TicketPurchaseError('Previše zahteva. Pokušajte kasnije ili kontaktirajte podršku.', 429);
    const reference = await reservePaymentReference(db, transaction, id);
    const row: TicketPurchase = { ...buildTicketPurchase({ uid, email }, tip!, now, reference), buyerType: 'guest' };
    transaction.create(ref, plain(row));
    transaction.set(limitRef, { windowStart: sameWindow ? windowStart : now.getTime(), count: count + 1 });
    return buyerView(row, true);
  });
}

export async function readGuestTicketPurchase(db: Firestore, ticketId: string, token: string, now = new Date()) {
  assertCredential(ticketId, token);
  const uid = guestPurchaseOwner(token), id = ticketPurchaseId(uid, ticketId);
  return db.runTransaction(async transaction => {
    const record = await transaction.get(db.doc(`ticketPurchases/${id}`));
    const row = record.exists ? { ...record.data(), id } as TicketPurchase : undefined;
    if (!row || row.buyerType !== 'guest' || row.userId !== uid || row.ticketId !== ticketId) throw new TicketPurchaseError('Zahtev nije pronađen. Proverite sačuvani privatan link.', 404);
    const [ticket, summary] = await transaction.getAll(db.doc(`tickets/${ticketId}`), db.doc(`publicTickets/${ticketId}`));
    const tip = ticket.exists ? { ...ticket.data(), id: ticketId } as Tip : undefined;
    const available = Boolean(tip && summary.exists && tip.publicationStatus === TipPublicationStatus.PUBLISHED
      && summary.data()?.publicationStatus === TipPublicationStatus.PUBLISHED && purchaseMatchesProduct(tip, row));
    return {
      purchase: buyerView(row, available && paymentAvailable(tip, summary.data() as Tip, now)),
      ...(row.status === 'approved' && available ? { ticket: plain({ ...tip!, ticketCode: resolveTicketCode(tip!, row.ticketCode), locked: false }) } : {}),
    };
  });
}
