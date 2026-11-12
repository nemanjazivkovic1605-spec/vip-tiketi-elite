import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { MemoryFirestore } from './helpers/memoryFirestore.ts';
import { TicketStatus, TipPublicationStatus, type Tip } from '../src/types.ts';
import { mapTicketForPublic } from '../src/services/tickets/ticketMappers.ts';
import { readTicketPurchases, setTicketPurchaseStatus, type PurchaseActor } from '../server/ticketPurchases.ts';
import { GUEST_REQUESTS_PER_HOUR, readGuestTicketPurchase, requestGuestTicketPurchase } from '../server/guestTicketPurchases.ts';
import { createTicketPurchasesHandler } from '../api/ticket-purchases.ts';
import { guestCheckoutLink, savedGuestToken, saveGuestToken } from '../src/utils/guestCheckout.ts';

const now = new Date('2099-11-10T08:00:00Z');
const token = randomBytes(32).toString('hex');
const admin: PurchaseActor = { uid: 'admin', email: 'admin@example.test', isAdmin: true, emailVerified: true };
const account: PurchaseActor = { uid: 'account', email: 'buyer@example.test', isAdmin: false, emailVerified: true };
const fixture = () => {
  const db = new MemoryFirestore();
  const ticket: Tip = {
    id: 'auto-elite_ticket-2099-11-10', isVip: true, type: 'elite_ticket', date: '2099-11-10',
    publicationStatus: TipPublicationStatus.PUBLISHED, publishedDate: '2099-11-10', publishedTime: '09:00', ticketCode: 'V101120990900',
    status: TicketStatus.PENDING, totalOdds: 3.24, analysis: 'Private ticket analysis',
    matches: [0, 1].map(index => ({ id: `match-${index}`, teams: `Home ${index} - Away ${index}`, homeTeam: `Home ${index}`, awayTeam: `Away ${index}`,
      league: 'League', prediction: '1X', odds: 1.8, time: '19:00', eventDate: '2099-11-10', eventTime: '19:00', kickoffAt: '2099-11-10T18:00:00Z' })),
  };
  for (const tip of [ticket, { ...ticket, id: 'other-ticket', type: 'safe_pick' }]) {
    db.documents.set(`tickets/${tip.id}`, tip);
    db.documents.set(`publicTickets/${tip.id}`, mapTicketForPublic(tip as Tip));
  }
  db.documents.set('users/admin', { role: 'admin', status: 'active' });
  db.documents.set('users/account', { role: 'user', status: 'active', vipAccess: false });
  return { db, ticket };
};

test('guest request creates a fixed-price pending purchase without an account and never stores its raw access key', async () => {
  const { db, ticket } = fixture(), before = JSON.stringify([...db.documents]);
  const purchase = await requestGuestTicketPurchase(db as any, ticket.id, ' Buyer@Example.Test ', token, '198.51.100.1', now);
  assert.equal(purchase.buyerType, 'guest');
  assert.equal(purchase.userEmail, 'buyer@example.test');
  assert.equal(purchase.status, 'pending');
  assert.equal(purchase.priceEur, 15);
  assert.equal(purchase.priceRsd, 1758);
  assert.equal((await readGuestTicketPurchase(db as any, ticket.id, token, now)).ticket, undefined);
  assert.equal(JSON.stringify([...db.documents].filter(([path]) => !path.startsWith('ticketPurchases/') && !path.startsWith('guestPurchaseLimits/'))), before);
  const stored = JSON.stringify([...db.documents]);
  assert.equal(stored.includes(token), false);
  assert.equal(stored.includes('198.51.100.1'), false);
});

test('retries reuse one request and a new key cannot claim a purchase by knowing the same email', async () => {
  const { db, ticket } = fixture();
  const rows = await Promise.all(Array.from({ length: 4 }, () => requestGuestTicketPurchase(db as any, ticket.id, account.email, token, '198.51.100.1', now)));
  assert.equal(new Set(rows.map(row => row.id)).size, 1);
  assert.equal([...db.documents.keys()].filter(path => path.startsWith('ticketPurchases/')).length, 1);
  await setTicketPurchaseStatus(db as any, admin, rows[0].id, 'approved', true, now);
  await assert.rejects(() => readGuestTicketPurchase(db as any, ticket.id, randomBytes(32).toString('hex'), now), /nije pronađen/);
  const other = await requestGuestTicketPurchase(db as any, ticket.id, account.email, randomBytes(32).toString('hex'), '198.51.100.2', now);
  assert.notEqual(other.id, rows[0].id);
  assert.equal(other.status, 'pending');
  assert.equal((await readTicketPurchases(db as any, account, [ticket.id], now)).tickets.length, 0);
  await assert.rejects(() => requestGuestTicketPurchase(db as any, ticket.id, 'changed@example.test', token, '198.51.100.1', now), /Email/);
});

test('only verified admin approval unlocks the guest exact ticket, and revocation removes it', async () => {
  const { db, ticket } = fixture();
  const purchase = await requestGuestTicketPurchase(db as any, ticket.id, account.email, token, '198.51.100.1', now);
  await assert.rejects(() => setTicketPurchaseStatus(db as any, account, purchase.id, 'approved', true, now), /administratorska/);
  await assert.rejects(() => setTicketPurchaseStatus(db as any, admin, purchase.id, 'approved', false, now), /uplata/);
  await setTicketPurchaseStatus(db as any, admin, purchase.id, 'approved', true, now);
  const owned = await readGuestTicketPurchase(db as any, ticket.id, token, now);
  assert.equal(owned.ticket?.id, ticket.id);
  assert.equal(owned.ticket?.ticketCode, purchase.ticketCode);
  assert.equal(owned.ticket?.matches[0].prediction, '1X');
  assert.equal('approvedBy' in owned.purchase, false);
  await assert.rejects(() => readGuestTicketPurchase(db as any, 'other-ticket', token, now), /nije pronađen/);
  await setTicketPurchaseStatus(db as any, admin, purchase.id, 'revoked', false, now);
  assert.equal((await readGuestTicketPurchase(db as any, ticket.id, token, now)).ticket, undefined);
  assert.equal(db.documents.get('users/account').vipAccess, false);
});

test('guest grants fail closed when the paid ticket is hidden, deleted or moved to another product', async () => {
  for (const change of ['hide', 'delete', 'product']) {
    const { db, ticket } = fixture();
    const row = await requestGuestTicketPurchase(db as any, ticket.id, account.email, token, '198.51.100.1', now);
    await setTicketPurchaseStatus(db as any, admin, row.id, 'approved', true, now);
    if (change === 'hide') db.documents.get(`tickets/${ticket.id}`).publicationStatus = TipPublicationStatus.DRAFT;
    if (change === 'delete') db.documents.delete(`publicTickets/${ticket.id}`);
    if (change === 'product') db.documents.get(`tickets/${ticket.id}`).type = 'safe_pick';
    assert.equal((await readGuestTicketPurchase(db as any, ticket.id, token, now)).ticket, undefined, change);
  }
});

test('Safe guest orders use their own price and an approved private link keeps working after kickoff', async () => {
  const { db } = fixture();
  const row = await requestGuestTicketPurchase(db as any, 'other-ticket', account.email, token, '198.51.100.1', now);
  assert.equal(row.productId, 'safe-pick-day');
  assert.equal(row.priceEur, 10);
  assert.equal(row.priceRsd, 1172);
  const later = new Date('2099-11-10T19:00:00Z');
  assert.equal((await readGuestTicketPurchase(db as any, 'other-ticket', token, later)).purchase.paymentAvailable, false);
  await setTicketPurchaseStatus(db as any, admin, row.id, 'approved', true, later);
  assert.equal((await readGuestTicketPurchase(db as any, 'other-ticket', token, later)).ticket?.id, 'other-ticket');
});

test('guest checkout rejects invalid credentials, email and started/free/monthly/unpublished products', async () => {
  for (const [ticketId, email, key] of [['../users/admin', account.email, token], ['valid', 'invalid', token], ['valid', account.email, 'short']]) {
    const { db } = fixture();
    await assert.rejects(() => requestGuestTicketPurchase(db as any, ticketId, email, key, 'ip', now));
    assert.equal([...db.documents.keys()].filter(path => path.startsWith('ticketPurchases/')).length, 0);
  }
  for (const change of ['started', 'free', 'monthly', 'hidden']) {
    const { db, ticket } = fixture();
    if (change === 'started') ticket.matches.forEach(match => { match.kickoffAt = '2099-11-10T07:00:00Z'; match.eventTime = '08:00'; match.time = '08:00'; });
    if (change === 'free') ticket.isVip = false;
    if (change === 'monthly') ticket.type = 'vip_monthly';
    if (change === 'hidden') ticket.publicationStatus = TipPublicationStatus.DRAFT;
    await assert.rejects(() => requestGuestTicketPurchase(db as any, ticket.id, account.email, token, 'ip', now));
    assert.equal([...db.documents.keys()].filter(path => path.startsWith('ticketPurchases/')).length, 0, change);
  }
});

test('guest request quotas are transactional, do not penalize retries, and reset after their window', async () => {
  const { db, ticket } = fixture();
  const requests = await Promise.allSettled(Array.from({ length: GUEST_REQUESTS_PER_HOUR + 2 }, () => requestGuestTicketPurchase(db as any, ticket.id, account.email, randomBytes(32).toString('hex'), 'same-ip', now)));
  assert.equal(requests.filter(result => result.status === 'fulfilled').length, GUEST_REQUESTS_PER_HOUR);
  assert.equal(requests.filter(result => result.status === 'rejected' && result.reason.status === 429).length, 2);
  const later = new Date(now.getTime() + 3600001);
  await requestGuestTicketPurchase(db as any, ticket.id, account.email, token, 'same-ip', later);
  await requestGuestTicketPurchase(db as any, ticket.id, account.email, token, 'same-ip', later);
  const limit = [...db.documents].find(([path]) => path.startsWith('guestPurchaseLimits/'))![1];
  assert.equal(limit.count, 1);
});

const call = async (handler: ReturnType<typeof createTicketPurchasesHandler>, body: unknown, authorization = `Guest ${token}`) => {
  const response = { statusCode: 200, body: '', headers: {} as Record<string, string>, setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value; }, end(value: string) { this.body = value; } };
  await handler({ method: 'POST', url: '/api/ticket-purchases', headers: { authorization }, body, socket: { remoteAddress: '198.51.100.5' } } as any, response as any);
  return { ...response, json: JSON.parse(response.body) };
};
test('HTTP guest checkout needs no Firebase login and rejects forged price, owner and approval fields', async () => {
  const { db, ticket } = fixture();
  let identified = 0;
  const handler = createTicketPurchasesHandler({ getDb: () => db as any, identify: async () => { identified++; throw new Error('Guest must not invoke Firebase auth'); } });
  const response = await call(handler, { action: 'guest-request', ticketId: ticket.id, email: account.email });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json.purchase.status, 'pending');
  assert.equal(identified, 0);
  assert.equal(response.headers['cache-control'], 'private, no-store');
  const read = await call(handler, { action: 'guest-read', ticketId: ticket.id });
  assert.equal(read.statusCode, 200);
  assert.equal(read.json.ticket, undefined);
  for (const extra of [{ priceEur: 0.01 }, { userId: 'admin' }, { buyerType: 'account' }, { paymentVerified: true }, { status: 'approved' }]) {
    assert.equal((await call(handler, { action: 'guest-request', ticketId: ticket.id, email: account.email, ...extra })).statusCode, 400);
  }
  assert.equal((await call(handler, { action: 'approve', purchaseId: response.json.purchase.id, paymentVerified: true })).statusCode, 403);
  assert.equal((await call(handler, { action: 'guest-read', ticketId: ticket.id }, 'Guest invalid')).statusCode, 401);
  assert.equal((await call(handler, { action: 'guest-read', ticketId: ticket.id }, '')).statusCode, 401);
  const asAdmin = createTicketPurchasesHandler({ getDb: () => db as any, identify: async () => admin });
  assert.equal((await call(asAdmin, { action: 'approve', purchaseId: response.json.purchase.id, paymentVerified: true }, 'Bearer synthetic-admin-token')).statusCode, 200);
  const approved = await call(handler, { action: 'guest-read', ticketId: ticket.id });
  assert.equal(approved.json.ticket.id, ticket.id);
  assert.equal((await call(handler, { action: 'guest-read', ticketId: ticket.id }, `Guest ${randomBytes(32).toString('hex')}`)).statusCode, 404);
  assert.equal(identified, 0);
});

test('private link stores its key only in the fragment and restores it per ticket even after checkout reload', () => {
  const memory = new Map<string, string>(), storage = { getItem: (key: string) => memory.get(key) || null, setItem: (key: string, value: string) => { memory.set(key, value); } };
  const link = new URL(guestCheckoutLink('https://eliteviptips.com', 'vip-ticket-day', 'ticket-1', token));
  assert.equal(link.pathname, '/checkout');
  assert.equal(link.searchParams.get('ticketId'), 'ticket-1');
  assert.equal(link.search.includes(token), false);
  assert.equal(savedGuestToken('ticket-1', link.hash, storage), token);
  assert.equal(saveGuestToken('ticket-1', token, storage), true);
  assert.equal(savedGuestToken('ticket-1', '', storage), token);
  assert.equal(savedGuestToken('ticket-2', '', storage), '');
  assert.equal(savedGuestToken('ticket-1', '#purchase=invalid'), '');
  assert.equal(saveGuestToken('ticket-1', 'invalid', storage), false);
  assert.equal(saveGuestToken('ticket-1', token, { setItem: () => { throw new Error('Storage unavailable'); } }), false);
});
