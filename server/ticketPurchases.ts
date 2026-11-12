import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { TicketStatus, TipPublicationStatus, type Tip } from '../src/types.js';
import { DEFAULT_EUR_RSD_RATE, SINGLE_TICKET_PRODUCTS, type SingleTicketProductId, type TicketPurchase } from '../src/utils/ticketPurchases.js';
import { getTicketProductType } from '../src/utils/ticketProduct.js';
import { generateTicketCode, resolveTicketCode } from '../src/utils/tickets.js';
import { productMatchKickoff } from './productTickets.js';

export type PurchaseActor = { uid: string; email: string; emailVerified: boolean; isAdmin: boolean; blocked?: boolean };
export class TicketPurchaseError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const COLLECTION = 'ticketPurchases';
export const validPurchaseTicketId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
export const ticketPurchaseId = (uid: string, ticketId: string) => createHash('sha256').update(JSON.stringify([uid, ticketId])).digest('hex');
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const assertPurchaseActor = (actor: PurchaseActor) => {
  if (!actor.uid) throw new TicketPurchaseError('Potrebna je prijava.', 401);
  if (actor.blocked) throw new TicketPurchaseError('Nalog je blokiran.', 403);
  if (!actor.emailVerified && !actor.isAdmin) throw new TicketPurchaseError('Potvrdite email adresu pre kupovine.', 403);
};
const assertAdmin = (actor: PurchaseActor) => {
  assertPurchaseActor(actor);
  if (!actor.isAdmin) throw new TicketPurchaseError('Potrebna je administratorska prijava.', 403);
};
const productFor = (tip: Tip): SingleTicketProductId => {
  const category = getTicketProductType(tip);
  const id = (Object.keys(SINGLE_TICKET_PRODUCTS) as SingleTicketProductId[]).find(key => SINGLE_TICKET_PRODUCTS[key].category === category);
  if (!id || !tip.isVip) throw new TicketPurchaseError('Ovaj tiket nije dostupan za pojedinačnu kupovinu.', 409);
  return id;
};
const assertPublished = (tip: Tip | undefined, summary: Tip | undefined) => {
  if (!tip || !summary || tip.publicationStatus !== TipPublicationStatus.PUBLISHED || summary.publicationStatus !== TipPublicationStatus.PUBLISHED) {
    throw new TicketPurchaseError('Tiket trenutno nije dostupan.', 409);
  }
};
const paymentAvailable = (tip: Tip | undefined, summary: Tip | undefined, now: Date) => {
  if (!tip || !summary || tip.publicationStatus !== TipPublicationStatus.PUBLISHED || summary.publicationStatus !== TipPublicationStatus.PUBLISHED
    || ![TicketStatus.PENDING, TicketStatus.POSTPONED].includes(tip.status) || !tip.matches.length) return false;
  const starts = tip.matches.map(match => productMatchKickoff(match, tip.date));
  return starts.every(Number.isFinite) && Math.min(...starts) > now.getTime();
};
const buyerView = (purchase: TicketPurchase, available = false) => {
  const { approvedBy, ...safe } = purchase;
  return { ...safe, paymentAvailable: purchase.status === 'pending' && available };
};

export async function requestTicketPurchase(db: Firestore, actor: PurchaseActor, ticketId: string, now = new Date()) {
  assertPurchaseActor(actor);
  if (!validPurchaseTicketId(ticketId)) throw new TicketPurchaseError('Neispravan tiket.');
  const id = ticketPurchaseId(actor.uid, ticketId), ref = db.collection(COLLECTION).doc(id);
  return db.runTransaction(async transaction => {
    const [existing, ticket, summary, profile] = await transaction.getAll(ref, db.doc(`tickets/${ticketId}`), db.doc(`publicTickets/${ticketId}`), db.doc(`users/${actor.uid}`));
    if (!profile.exists || ['blocked'].includes(profile.data()?.status) || profile.data()?.accountStatus === 'blocked') {
      throw new TicketPurchaseError('Nalog nije dostupan za kupovinu.', 403);
    }
    if (existing.exists) {
      const row = { ...existing.data(), id } as TicketPurchase;
      if (row.userId !== actor.uid || row.ticketId !== ticketId) throw new TicketPurchaseError('Zahtev nije dostupan.', 403);
      if (row.status === 'revoked') throw new TicketPurchaseError('Pristup je ukinut. Obratite se podršci.', 409);
      const tip = ticket.exists ? { ...ticket.data(), id: ticketId } as Tip : undefined;
      let sameProduct = false;
      try { sameProduct = Boolean(tip && productFor(tip) === row.productId); } catch { /* Invalidated product. */ }
      return buyerView(row, sameProduct && paymentAvailable(tip, summary.data() as Tip, now));
    }
    const tip = ticket.exists ? { ...ticket.data(), id: ticketId } as Tip : undefined;
    assertPublished(tip, summary.exists ? summary.data() as Tip : undefined);
    const productId = productFor(tip!), product = SINGLE_TICKET_PRODUCTS[productId];
    const kickoffs = tip!.matches.map(match => productMatchKickoff(match, tip!.date));
    if (![TicketStatus.PENDING, TicketStatus.POSTPONED].includes(tip!.status) || !kickoffs.length
      || kickoffs.some(value => !Number.isFinite(value)) || Math.min(...kickoffs) <= now.getTime()) {
      throw new TicketPurchaseError('Kupovina je dostupna samo pre početka prvog meča.', 409);
    }
    const configuredRate = Number(process.env.VITE_EUR_RSD_RATE);
    const exchangeRate = Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : DEFAULT_EUR_RSD_RATE;
    const purchase: TicketPurchase = {
      id, userId: actor.uid, userEmail: actor.email, ticketId, productId, productName: product.name,
      priceEur: product.priceEur, priceRsd: Math.round(product.priceEur * exchangeRate), exchangeRate, ticketDate: tip!.date,
      ticketCode: resolveTicketCode(tip!, generateTicketCode(true, tip!.publishedDate || tip!.date, tip!.publishedTime || '12:00', ticketId)),
      reference: `T${id.slice(0, 12).toUpperCase()}`, status: 'pending', createdAt: now.toISOString(), updatedAt: now.toISOString(),
    };
    transaction.create(ref, plain(purchase));
    return buyerView(purchase, true);
  });
}

export async function setTicketPurchaseStatus(db: Firestore, actor: PurchaseActor, id: string, status: 'approved' | 'revoked', paymentVerified: boolean, now = new Date()) {
  assertAdmin(actor);
  if (!/^[a-f0-9]{64}$/.test(id)) throw new TicketPurchaseError('Neispravan zahtev.');
  if (status === 'approved' && paymentVerified !== true) throw new TicketPurchaseError('Potvrdite da je uplata proverena.');
  const ref = db.collection(COLLECTION).doc(id);
  return db.runTransaction(async transaction => {
    const record = await transaction.get(ref);
    if (!record.exists) throw new TicketPurchaseError('Zahtev nije pronađen.', 404);
    const row = { ...record.data(), id } as TicketPurchase;
    if (ticketPurchaseId(row.userId, row.ticketId) !== id) throw new TicketPurchaseError('Podaci zahteva nisu ispravni.', 409);
    if (status === 'approved') {
      const [ticket, summary, profile] = await transaction.getAll(db.doc(`tickets/${row.ticketId}`), db.doc(`publicTickets/${row.ticketId}`), db.doc(`users/${row.userId}`));
      if (!profile.exists || profile.data()?.status === 'blocked' || profile.data()?.accountStatus === 'blocked') {
        throw new TicketPurchaseError('Nalog korisnika je blokiran ili uklonjen.', 409);
      }
      const tip = ticket.exists ? { ...ticket.data(), id: row.ticketId } as Tip : undefined;
      assertPublished(tip, summary.exists ? summary.data() as Tip : undefined);
      if (productFor(tip!) !== row.productId) throw new TicketPurchaseError('Kategorija tiketa je promenjena. Proverite zahtev.', 409);
    }
    if (row.status === status) return row;
    const updated: TicketPurchase = { ...row, status, updatedAt: now.toISOString(),
      ...(status === 'approved' ? { approvedAt: now.toISOString(), approvedBy: actor.uid } : {}) };
    transaction.set(ref, plain(updated));
    return updated;
  });
}

export async function readTicketPurchases(db: Firestore, actor: PurchaseActor, ticketIds: string[], now = new Date()) {
  assertPurchaseActor(actor);
  if (ticketIds.length > 50 || ticketIds.some(id => !validPurchaseTicketId(id))) throw new TicketPurchaseError('Neispravan izbor tiketa.');
  if (!ticketIds.length) return { purchases: [], tickets: [] };
  const records = await db.runTransaction(async transaction => {
    const ids = [...new Set(ticketIds)];
    const [profile, ...purchases] = await transaction.getAll(db.doc(`users/${actor.uid}`), ...ids.map(ticketId => db.doc(`${COLLECTION}/${ticketPurchaseId(actor.uid, ticketId)}`)));
    if (!profile.exists || profile.data()?.status === 'blocked' || profile.data()?.accountStatus === 'blocked') throw new TicketPurchaseError('Nalog je blokiran ili uklonjen.', 403);
    return Promise.all(ids.map(async (ticketId, index) => {
    const id = ticketPurchaseId(actor.uid, ticketId);
    const record = purchases[index];
    if (!record.exists) return null;
    const row = { ...record.data(), id } as TicketPurchase;
    if (row.userId !== actor.uid || row.ticketId !== ticketId) return null;
    const [ticket, summary] = await transaction.getAll(db.doc(`tickets/${ticketId}`), db.doc(`publicTickets/${ticketId}`));
    const tip = ticket.exists ? { ...ticket.data(), id: ticketId } as Tip : undefined;
    const published = tip && summary.exists && tip.publicationStatus === TipPublicationStatus.PUBLISHED && summary.data()?.publicationStatus === TipPublicationStatus.PUBLISHED;
    let sameProduct = false;
    if (published) {
      try { sameProduct = productFor(tip!) === row.productId; } catch { /* A recategorized ticket requires admin review. */ }
    }
    return { purchase: buyerView(row, sameProduct && paymentAvailable(tip, summary.data() as Tip, now)),
      ...(row.status === 'approved' && sameProduct ? { ticket: plain({ ...tip!, ticketCode: resolveTicketCode(tip!, row.ticketCode), locked: false }) } : {}) };
    }));
  });
  return { purchases: records.flatMap(row => row ? [row.purchase] : []), tickets: records.flatMap(row => row?.ticket ? [row.ticket] : []) };
}

export async function readAdminTicketPurchases(db: Firestore, actor: PurchaseActor) {
  assertAdmin(actor);
  const snapshot = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(100).get();
  return snapshot.docs.map(value => ({ ...value.data(), id: value.id } as TicketPurchase));
}
