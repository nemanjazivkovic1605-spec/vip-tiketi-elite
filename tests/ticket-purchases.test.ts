import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFirestore } from './helpers/memoryFirestore.ts';
import { TicketStatus, TipPublicationStatus, type Tip } from '../src/types.ts';
import { mapActiveTicketForAccess, mapTicketForPublic } from '../src/services/tickets/ticketMappers.ts';
import { paymentReferenceCandidate, readAdminTicketPurchases, readTicketPurchases, requestTicketPurchase, setTicketPurchaseStatus, ticketPurchaseId, type PurchaseActor } from '../server/ticketPurchases.ts';
import { createTicketPurchasesHandler } from '../api/ticket-purchases.ts';
import { safeLoginRedirect } from '../src/utils/loginRedirect.ts';

const now = new Date('2099-11-10T08:00:00Z');
const buyer: PurchaseActor = { uid: 'buyer', email: 'buyer@example.test', emailVerified: true, isAdmin: false };
const admin: PurchaseActor = { uid: 'admin', email: 'admin@example.test', emailVerified: true, isAdmin: true };
const other: PurchaseActor = { ...buyer, uid: 'other', email: 'other@example.test' };
const makeTicket = (id = 'auto-elite_ticket-2099-11-10', type: 'elite_ticket' | 'safe_pick' = 'elite_ticket'): Tip => ({
  id, type, isVip: true, date: '2099-11-10', status: TicketStatus.PENDING,
  publishedDate: '2099-11-10', publishedTime: '09:00', ticketCode: 'V101120990900', publicationStatus: TipPublicationStatus.PUBLISHED,
  totalOdds: 3.24, analysis: 'Private analysis', matches: [0, 1].map(index => ({
    id: `${id}-${index}`, homeTeam: `Home ${index}`, awayTeam: `Away ${index}`, teams: `Home ${index} - Away ${index}`,
    league: 'League', prediction: '1X', odds: 1.8, time: '19:00', eventTime: '19:00', eventDate: '2099-11-10', kickoffAt: '2099-11-10T18:00:00Z',
  })),
});
const fixture = () => {
  const db = new MemoryFirestore(), ticket = makeTicket(), safe = makeTicket('auto-safe_pick-2099-11-10', 'safe_pick');
  for (const actor of [buyer, other, admin]) db.documents.set(`users/${actor.uid}`, { status: 'active', role: actor.isAdmin ? 'admin' : 'user', vipAccess: false, vipApproved: false });
  for (const tip of [ticket, safe]) {
    db.documents.set(`tickets/${tip.id}`, tip);
    db.documents.set(`publicTickets/${tip.id}`, mapTicketForPublic(tip));
  }
  return { db, ticket, safe };
};

test('payment request binds a fixed price and reference to one verified user and ticket, without granting VIP', async () => {
  const { db, ticket } = fixture(), before = JSON.stringify([...db.documents]);
  const row = await requestTicketPurchase(db as any, buyer, ticket.id, now);
  assert.equal(row.status, 'pending');
  assert.equal(row.userId, buyer.uid);
  assert.equal(row.ticketId, ticket.id);
  assert.equal(row.priceEur, 15);
  assert.equal(row.priceRsd, 1758);
  assert.match(row.reference, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.deepEqual(db.documents.get(`ticketPurchaseReferences/${row.reference}`), { purchaseId: row.id });
  assert.equal(row.paymentAvailable, true);
  assert.equal((await readTicketPurchases(db as any, buyer, [ticket.id], now)).tickets.length, 0);
  assert.equal(JSON.stringify([...db.documents].filter(([path]) => !path.startsWith('ticketPurchases/') && !path.startsWith('ticketPurchaseReferences/'))), before);
});

test('repeat and overlapping requests reuse the same pending payment record', async () => {
  const { db, ticket } = fixture();
  const rows = await Promise.all(Array.from({ length: 4 }, () => requestTicketPurchase(db as any, buyer, ticket.id, now)));
  assert.equal(new Set(rows.map(row => row.id)).size, 1);
  assert.equal(new Set(rows.map(row => row.reference)).size, 1);
  assert.equal([...db.documents.keys()].filter(path => path.startsWith('ticketPurchases/')).length, 1);
  assert.equal([...db.documents.keys()].filter(path => path.startsWith('ticketPurchaseReferences/')).length, 1);
  const approved = await setTicketPurchaseStatus(db as any, admin, rows[0].id, 'approved', true, now);
  assert.equal((await requestTicketPurchase(db as any, buyer, ticket.id, now)).status, 'approved');
  assert.equal(db.documents.get(`ticketPurchases/${approved.id}`).approvedBy, admin.uid);
});

test('occupied payment references are never reassigned, including after revocation', async () => {
  const { db, ticket } = fixture();
  const occupied = paymentReferenceCandidate(ticketPurchaseId(buyer.uid, ticket.id));
  db.documents.set(`ticketPurchaseReferences/${occupied}`, { purchaseId: 'historic-purchase' });
  const first = await requestTicketPurchase(db as any, buyer, ticket.id, now);
  assert.notEqual(first.reference, occupied);
  assert.deepEqual(db.documents.get(`ticketPurchaseReferences/${occupied}`), { purchaseId: 'historic-purchase' });
  await setTicketPurchaseStatus(db as any, admin, first.id, 'revoked', false, now);
  assert.deepEqual(db.documents.get(`ticketPurchaseReferences/${first.reference}`), { purchaseId: first.id });
  const second = await requestTicketPurchase(db as any, other, ticket.id, now);
  assert.notEqual(first.reference, second.reference);
});

test('reference allocation fails without writing a purchase when all candidates are occupied', async () => {
  const { db, ticket } = fixture(), id = ticketPurchaseId(buyer.uid, ticket.id);
  for (let attempt = 0; attempt < 32; attempt++) {
    db.documents.set(`ticketPurchaseReferences/${paymentReferenceCandidate(id, attempt)}`, { purchaseId: 'historic-purchase' });
  }
  const before = JSON.stringify([...db.documents]);
  await assert.rejects(() => requestTicketPurchase(db as any, buyer, ticket.id, now), { status: 503 });
  assert.equal(JSON.stringify([...db.documents]), before);
});

test('issued legacy references and amounts survive retries and approval without allocating another reference', async () => {
  const { db, ticket } = fixture();
  const row = await requestTicketPurchase(db as any, buyer, ticket.id, now);
  db.documents.delete(`ticketPurchaseReferences/${row.reference}`);
  Object.assign(db.documents.get(`ticketPurchases/${row.id}`), { reference: 'T123456789ABC', priceRsd: 1800 });
  assert.equal((await requestTicketPurchase(db as any, buyer, ticket.id, now)).reference, 'T123456789ABC');
  await setTicketPurchaseStatus(db as any, admin, row.id, 'approved', true, now);
  const owned = await readTicketPurchases(db as any, buyer, [ticket.id], now);
  assert.equal(owned.purchases[0].reference, 'T123456789ABC');
  assert.equal(owned.purchases[0].priceRsd, 1800);
  assert.equal(owned.tickets.length, 1);
  assert.equal([...db.documents.keys()].some(path => path.startsWith('ticketPurchaseReferences/')), false);
});

test('only admin confirmation unlocks the purchased ticket; another user and another ticket stay locked', async () => {
  const { db, ticket, safe } = fixture();
  const row = await requestTicketPurchase(db as any, buyer, ticket.id, now);
  await assert.rejects(() => setTicketPurchaseStatus(db as any, buyer, row.id, 'approved', true, now), /administratorska/);
  await assert.rejects(() => setTicketPurchaseStatus(db as any, admin, row.id, 'approved', false, now), /uplata/);
  await setTicketPurchaseStatus(db as any, admin, row.id, 'approved', true, now);
  const owned = await readTicketPurchases(db as any, buyer, [ticket.id, safe.id], now);
  assert.deepEqual(owned.tickets.map(tip => tip.id), [ticket.id]);
  assert.equal(owned.tickets[0].locked, false);
  assert.equal(owned.tickets[0].ticketCode, row.ticketCode);
  assert.match(owned.tickets[0].ticketCode!, /^V101120990900-[A-Z0-9]{7}$/);
  assert.equal(owned.tickets[0].matches[0].prediction, '1X');
  assert.equal((await readTicketPurchases(db as any, other, [ticket.id], now)).tickets.length, 0);
  assert.equal((await readTicketPurchases(db as any, other, [ticket.id], now)).purchases.length, 0);
  assert.equal(db.documents.get(`users/${buyer.uid}`).vipAccess, false);
});

test('revocation, blocking, hidden/deleted tickets and recategorization remove individual access', async () => {
  for (const change of ['revoke', 'block', 'hide', 'delete', 'category']) {
    const { db, ticket } = fixture();
    const row = await requestTicketPurchase(db as any, buyer, ticket.id, now);
    await setTicketPurchaseStatus(db as any, admin, row.id, 'approved', true, now);
    if (change === 'revoke') await setTicketPurchaseStatus(db as any, admin, row.id, 'revoked', false, now);
    if (change === 'block') db.documents.get(`users/${buyer.uid}`).status = 'blocked';
    if (change === 'hide') db.documents.get(`tickets/${ticket.id}`).publicationStatus = TipPublicationStatus.DRAFT;
    if (change === 'delete') db.documents.delete(`publicTickets/${ticket.id}`);
    if (change === 'category') db.documents.get(`tickets/${ticket.id}`).type = 'safe_pick';
    if (change === 'block') await assert.rejects(() => readTicketPurchases(db as any, buyer, [ticket.id], now), /blokiran/);
    else assert.equal((await readTicketPurchases(db as any, buyer, [ticket.id], now)).tickets.length, 0, change);
  }
});

test('unverified and blocked users cannot request or read purchases; ordinary users cannot list admin payments', async () => {
  const { db, ticket } = fixture();
  for (const actor of [{ ...buyer, emailVerified: false }, { ...buyer, blocked: true }]) {
    await assert.rejects(() => requestTicketPurchase(db as any, actor, ticket.id, now));
    await assert.rejects(() => readTicketPurchases(db as any, actor, [ticket.id], now));
  }
  await assert.rejects(() => readAdminTicketPurchases(db as any, buyer), /administratorska/);
});

test('payment cannot be prepared after kickoff, for monthly/free/hidden tickets or arbitrary document paths', async () => {
  for (const invalid of ['started', 'monthly', 'free', 'hidden', 'missing', 'path']) {
    const { db, ticket } = fixture();
    if (invalid === 'started') ticket.matches[0].kickoffAt = '2099-11-10T07:00:00Z', ticket.matches[0].time = ticket.matches[0].eventTime = '08:00';
    if (invalid === 'monthly') ticket.type = 'vip_monthly';
    if (invalid === 'free') ticket.isVip = false;
    if (invalid === 'hidden') ticket.publicationStatus = TipPublicationStatus.DRAFT;
    await assert.rejects(() => requestTicketPurchase(db as any, buyer, invalid === 'missing' ? 'missing' : invalid === 'path' ? '../users/admin' : ticket.id, now), undefined, invalid);
    assert.equal([...db.documents.keys()].filter(path => path.startsWith('ticketPurchases/')).length, 0);
  }
});

test('an old pending request stops offering payment after kickoff or a category edit', async () => {
  const { db, ticket } = fixture();
  await requestTicketPurchase(db as any, buyer, ticket.id, now);
  const later = new Date('2099-11-10T20:00:00Z');
  assert.equal((await readTicketPurchases(db as any, buyer, [ticket.id], later)).purchases[0].paymentAvailable, false);
  assert.equal((await requestTicketPurchase(db as any, buyer, ticket.id, later)).paymentAvailable, false);
  ticket.type = 'safe_pick';
  assert.equal((await readTicketPurchases(db as any, buyer, [ticket.id], now)).purchases[0].paymentAvailable, false);
});

test('client ticket mapping grants only the exact purchased ID and still requires a verified active session', () => {
  const ticket = makeTicket(), safe = makeTicket('safe', 'safe_pick');
  const access = { canAccessFree: true, canAccessVip: false, purchasedTicketIds: [ticket.id] };
  assert.equal(mapActiveTicketForAccess(mapTicketForPublic(ticket), ticket, access), ticket);
  assert.equal(mapActiveTicketForAccess(mapTicketForPublic(safe), safe, access).locked, true);
  assert.equal(mapActiveTicketForAccess(mapTicketForPublic(ticket), ticket, { ...access, canAccessFree: false }).locked, true);
  assert.equal(mapActiveTicketForAccess(mapTicketForPublic(ticket), ticket, { ...access, purchasedTicketIds: [] }).locked, true);
});

test('purchase IDs cannot be confused by delimiters in user or ticket IDs', () => {
  assert.notEqual(ticketPurchaseId('a_b', 'c'), ticketPurchaseId('a', 'b_c'));
});

const callHandler = async (handler: ReturnType<typeof createTicketPurchasesHandler>, method: string, url: string, body?: unknown, authorized = true) => {
  const response = { statusCode: 200, body: '', headers: {} as Record<string, string>, setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value; }, end(value: string) { this.body = value; } };
  await handler({ method, url, headers: authorized ? { authorization: 'Bearer synthetic-token' } : {}, body } as any, response as any);
  return { ...response, json: JSON.parse(response.body) };
};

test('HTTP route rejects missing authorization, unsupported methods and forged user/price/admin fields', async () => {
  const { db, ticket } = fixture();
  const handler = createTicketPurchasesHandler({ getDb: () => db as any, identify: async () => buyer });
  assert.equal((await callHandler(handler, 'GET', '/api/ticket-purchases', undefined, false)).statusCode, 401);
  assert.equal((await callHandler(handler, 'DELETE', '/api/ticket-purchases')).statusCode, 405);
  for (const extra of [{ userId: other.uid }, { priceEur: 0.01 }, { isAdmin: true }]) {
    assert.equal((await callHandler(handler, 'POST', '/api/ticket-purchases', { action: 'request', ticketId: ticket.id, ...extra })).statusCode, 400);
  }
  assert.equal((await callHandler(handler, 'GET', '/api/ticket-purchases?mode=admin')).statusCode, 403);
  assert.equal((await callHandler(handler, 'POST', '/api/ticket-purchases', { action: 'approve', purchaseId: ticketPurchaseId(buyer.uid, ticket.id), paymentVerified: true })).statusCode, 403);
  assert.equal([...db.documents.keys()].filter(path => path.startsWith('ticketPurchases/')).length, 0);
});

test('HTTP checkout request and admin approval expose only the owner ticket and use private no-store responses', async () => {
  const { db, ticket } = fixture();
  const asBuyer = createTicketPurchasesHandler({ getDb: () => db as any, identify: async () => buyer });
  const asAdmin = createTicketPurchasesHandler({ getDb: () => db as any, identify: async () => admin });
  const requested = await callHandler(asBuyer, 'POST', '/api/ticket-purchases', { action: 'request', ticketId: ticket.id });
  assert.equal(requested.statusCode, 200);
  assert.equal(requested.json.purchase.status, 'pending');
  const id = requested.json.purchase.id;
  assert.equal((await callHandler(asAdmin, 'POST', '/api/ticket-purchases', { action: 'approve', purchaseId: id, paymentVerified: true })).statusCode, 200);
  const response = await callHandler(asBuyer, 'GET', `/api/ticket-purchases?ticketIds=${ticket.id}&userId=${other.uid}`);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json.tickets[0].id, ticket.id);
  assert.equal(response.headers['cache-control'], 'private, no-store');
  const asOther = createTicketPurchasesHandler({ getDb: () => db as any, identify: async () => other });
  assert.equal((await callHandler(asOther, 'GET', `/api/ticket-purchases?ticketIds=${ticket.id}&userId=${buyer.uid}`)).json.tickets.length, 0);
});

test('login return paths accept checkout/tickets but reject external or malformed redirects', () => {
  assert.equal(safeLoginRedirect('/checkout?product=safe-pick-day'), '/checkout?product=safe-pick-day');
  for (const value of ['https://example.com', '//example.com', '/\\example.com', '/admin', '/checkout\r\nLocation:bad']) assert.equal(safeLoginRedirect(value), '/dashboard');
});
