import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { initAdminDb } from './_world-cup-automation.js';
import { assertPurchaseActor, readAdminTicketPurchases, readTicketPurchases, requestTicketPurchase, setTicketPurchaseStatus,
  TicketPurchaseError, type PurchaseActor } from '../server/ticketPurchases.js';
import { readGuestTicketPurchase, requestGuestTicketPurchase } from '../server/guestTicketPurchases.js';

async function identify(request: IncomingMessage, db: Firestore): Promise<PurchaseActor> {
  const bearer = request.headers.authorization?.match(/^Bearer\s+(.+)$/)?.[1];
  if (!bearer) throw new TicketPurchaseError('Potrebna je prijava.', 401);
  let token;
  try { token = await getAuth().verifyIdToken(bearer, true); }
  catch { throw new TicketPurchaseError('Prijava je istekla. Prijavite se ponovo.', 401); }
  const profile = await db.doc(`users/${token.uid}`).get();
  const data = profile.data();
  const actor: PurchaseActor = {
    uid: token.uid, email: token.email || '', emailVerified: token.email_verified === true,
    isAdmin: token.email?.toLowerCase() === 'nemanjazivkovic1605@gmail.com' || data?.role === 'admin',
    blocked: !profile.exists || data?.status === 'blocked' || data?.accountStatus === 'blocked',
  };
  assertPurchaseActor(actor);
  return actor;
}

async function bodyOf(request: IncomingMessage) {
  const supplied = (request as IncomingMessage & { body?: unknown }).body;
  let body: unknown;
  if (supplied !== undefined) body = typeof supplied === 'string' ? JSON.parse(supplied) : supplied;
  else {
    let raw = '';
    for await (const chunk of request) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 4096) throw new TicketPurchaseError('Zahtev je prevelik.', 413);
    }
    body = JSON.parse(raw || '{}');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 4096) throw new TicketPurchaseError('Neispravan zahtev.');
  const data = body as Record<string, unknown>;
  const fields = data.action === 'guest-request' ? ['action', 'ticketId', 'email']
    : data.action === 'guest-read' ? ['action', 'ticketId'] : ['action', 'ticketId', 'purchaseId', 'paymentVerified'];
  if (Object.keys(data).some(key => !fields.includes(key))) throw new TicketPurchaseError('Nepodržani podaci zahteva.');
  return data;
}

export const createTicketPurchasesHandler = (dependencies: { getDb: () => Firestore; identify: typeof identify }) => async (request: IncomingMessage, response: ServerResponse) => {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Referrer-Policy', 'no-referrer');
  const send = (status: number, data: unknown) => { response.statusCode = status; response.end(JSON.stringify(data)); };
  if (!['GET', 'POST'].includes(request.method || '')) return send(405, { error: 'Method not allowed.' });
  const guestHeader = request.headers.authorization?.startsWith('Guest ');
  if (!guestHeader && !request.headers.authorization?.match(/^Bearer\s+\S+$/)) return send(401, { error: 'Potrebna je prijava ili privatan link za kupovinu.' });
  try {
    const body = request.method === 'POST' ? await bodyOf(request) : null;
    if (guestHeader) {
      const token = request.headers.authorization?.match(/^Guest ([a-f0-9]{64})$/)?.[1];
      if (!token || !body) return send(401, { error: 'Privatan link nije ispravan.' });
      if (!['guest-request', 'guest-read'].includes(String(body.action))) return send(403, { error: 'Akcija nije dozvoljena.' });
      if (typeof body.ticketId !== 'string' || body.action === 'guest-request' && typeof body.email !== 'string') return send(400, { error: 'Neispravan zahtev.' });
      const db = dependencies.getDb();
      if (body.action === 'guest-read') return send(200, await readGuestTicketPurchase(db, body.ticketId, token));
      // Vercel overwrites these forwarding headers; locally use the connected peer.
      const forwarded = request.headers['x-vercel-forwarded-for'] || request.headers['x-forwarded-for'];
      const clientIp = process.env.VERCEL === '1' && typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim().slice(0, 128) : request.socket?.remoteAddress || 'local';
      return send(200, { purchase: await requestGuestTicketPurchase(db, body.ticketId, body.email as string, token, clientIp) });
    }
    const db = dependencies.getDb(), actor = await dependencies.identify(request, db);
    assertPurchaseActor(actor);
    const url = new URL(request.url || '/', 'https://eliteviptips.com');
    if (request.method === 'GET') {
      if (url.searchParams.get('mode') === 'admin') return send(200, { purchases: await readAdminTicketPurchases(db, actor) });
      const ticketIds = (url.searchParams.get('ticketIds') || '').split(',').filter(Boolean);
      return send(200, await readTicketPurchases(db, actor, ticketIds));
    }
    if (body?.action === 'request' && typeof body.ticketId === 'string') {
      return send(200, { purchase: await requestTicketPurchase(db, actor, body.ticketId) });
    }
    if (body && (body.action === 'approve' || body.action === 'revoke') && typeof body.purchaseId === 'string') {
      return send(200, { purchase: await setTicketPurchaseStatus(db, actor, body.purchaseId, body.action === 'approve' ? 'approved' : 'revoked', body.paymentVerified === true) });
    }
    return send(400, { error: 'Neispravna akcija.' });
  } catch (error) {
    if (error instanceof TicketPurchaseError) return send(error.status, { error: error.message });
    if (error instanceof SyntaxError) return send(400, { error: 'Neispravan zahtev.' });
    return send(503, { error: 'Pristup tiketu trenutno nije dostupan. Pokušajte ponovo.' });
  }
};

export default createTicketPurchasesHandler({ getDb: initAdminDb, identify });
