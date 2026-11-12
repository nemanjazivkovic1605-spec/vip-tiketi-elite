import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { initAdminDb } from './_world-cup-automation.js';
import { assertPurchaseActor, readAdminTicketPurchases, readTicketPurchases, requestTicketPurchase, setTicketPurchaseStatus,
  TicketPurchaseError, type PurchaseActor } from '../server/ticketPurchases.js';

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
  if (Object.keys(data).some(key => !['action', 'ticketId', 'purchaseId', 'paymentVerified'].includes(key))) throw new TicketPurchaseError('Nepodržani podaci zahteva.');
  return data;
}

export const createTicketPurchasesHandler = (dependencies: { getDb: () => Firestore; identify: typeof identify }) => async (request: IncomingMessage, response: ServerResponse) => {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (status: number, data: unknown) => { response.statusCode = status; response.end(JSON.stringify(data)); };
  if (!['GET', 'POST'].includes(request.method || '')) return send(405, { error: 'Method not allowed.' });
  if (!request.headers.authorization?.match(/^Bearer\s+\S+$/)) return send(401, { error: 'Potrebna je prijava.' });
  try {
    const db = dependencies.getDb(), actor = await dependencies.identify(request, db);
    assertPurchaseActor(actor);
    const url = new URL(request.url || '/', 'https://eliteviptips.com');
    if (request.method === 'GET') {
      if (url.searchParams.get('mode') === 'admin') return send(200, { purchases: await readAdminTicketPurchases(db, actor) });
      const ticketIds = (url.searchParams.get('ticketIds') || '').split(',').filter(Boolean);
      return send(200, await readTicketPurchases(db, actor, ticketIds));
    }
    const body = await bodyOf(request);
    if (body.action === 'request' && typeof body.ticketId === 'string') {
      return send(200, { purchase: await requestTicketPurchase(db, actor, body.ticketId) });
    }
    if ((body.action === 'approve' || body.action === 'revoke') && typeof body.purchaseId === 'string') {
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
