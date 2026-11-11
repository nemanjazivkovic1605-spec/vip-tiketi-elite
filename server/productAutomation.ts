import { createHash } from 'node:crypto';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { TicketStatus, TipPublicationStatus, type Match, type Tip } from '../src/types.js';
import { getTicketProductType } from '../src/utils/ticketProduct.js';
import { mapTicketForPublic } from '../src/services/tickets/ticketMappers.js';
import { preparePublicStatsUpdate } from '../src/utils/publicStats.js';
import { evaluateFullTimePrediction } from '../src/utils/predictionResults.js';
import { fullTimeFixtureScore } from './resultScores.js';
import { teamKey } from './freeFootballFeeds.js';
import { resultQueueCursor } from './resultsQueue.js';
import { localDate } from './sportsApi.js';
import { AUTOMATED_PRODUCTS, PRODUCT_AUTOMATION, buildProductTicket, loadProductPicks, productMatchKickoff,
  productSettlement, productTicketId, type AutomatedProduct, type ProductPick } from './productTickets.js';

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const finished = (status?: TicketStatus) => [TicketStatus.WON, TicketStatus.LOST, TicketStatus.REFUND].includes(status!);
const stateRef = (db: Firestore, date: string) => db.collection('dailyAutomation').doc(`products-${date}`);
const reference = (db: Firestore, path: string) => db.doc(path);
const writesAllowed = () => !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'production' || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
export const productMatchFingerprint = (match: Match, date: string) => createHash('sha256').update(JSON.stringify([
  match.id, match.homeTeam, match.awayTeam, match.league, match.eventDate || date, match.eventTime || match.time, match.prediction,
])).digest('hex');
const resolvedLeg = (match: Match, date: string) => finished(match.status)
  && (match.resultManualOverride || match.settledFor === productMatchFingerprint(match, date));

export async function publishProductTickets(db: Firestore, date: string, pool: ProductPick[], now = new Date(), dryRun = false) {
  if (!dryRun && !writesAllowed()) throw new Error('Automatski upis proizvoda je dozvoljen samo na produkciji ili u emulatoru.');
  return db.runTransaction(async transaction => {
    const manifestRef = stateRef(db, date);
    const manifest = await transaction.get(manifestRef);
    const manual = await transaction.get(db.collection('tickets').where('date', '==', date).limit(50));
    const refs = AUTOMATED_PRODUCTS.flatMap(type => [db.collection('tickets').doc(productTicketId(date, type)), db.collection('publicTickets').doc(productTicketId(date, type))]);
    const existing = await transaction.getAll(...refs);
    const reservations = new Map<string, { type: string; id: string }>((manifest.data()?.published || []).map((item: any) => [item.type, item]));
    const results: Array<{ type: AutomatedProduct; id?: string; status: string; reason?: string; ticket?: Tip }> = [];
    const plans: Tip[] = [];
    for (const [index, type] of AUTOMATED_PRODUCTS.entries()) {
      const manualTicket = manual.docs.find(doc => doc.data().publicationStatus === TipPublicationStatus.PUBLISHED
        && getTicketProductType({ ...doc.data(), id: doc.id } as Tip) === type);
      if (reservations.has(type) || existing[index * 2].exists || existing[index * 2 + 1].exists || manualTicket) {
        if (!reservations.has(type)) reservations.set(type, { type, id: manualTicket?.id || productTicketId(date, type) });
        results.push({ type, id: reservations.get(type)?.id, status: 'reserved' });
        continue;
      }
      const ticket = buildProductTicket(type, date, pool, now);
      if (!ticket || ticket.matches.some(match => productMatchKickoff(match, date) < now.getTime() + 30 * 60000)) {
        results.push({ type, status: 'skipped', reason: type === 'elite_ticket'
          ? 'Nema 2-6 validnih buducih meceva sa stvarnim kvotama i ukupnom kvotom najmanje 2.50.'
          : 'Nema 1-3 validna buduca meca sa stvarnim ukupnim kvotama od 1.50 do 3.00.' });
        continue;
      }
      plans.push(ticket);
      results.push({ type, id: ticket.id, status: dryRun ? 'ready' : 'published', ...(dryRun ? { ticket } : {}) });
    }
    const plannedReservations = new Map(reservations);
    plans.forEach(ticket => plannedReservations.set(ticket.type!, { type: ticket.type!, id: ticket.id }));
    const skipped = results.filter(item => item.status === 'skipped').map(({ type, reason }) => ({ type, reason }));
    const manifestChanged = JSON.stringify(manifest.data()?.published || []) !== JSON.stringify([...plannedReservations.values()])
      || JSON.stringify(manifest.data()?.skipped || []) !== JSON.stringify(skipped);
    if (dryRun) return { date, dryRun: true, saved: 0, plannedWrites: plans.length * 2 + (manifestChanged ? 2 : 0), results };
    for (const ticket of plans) {
      transaction.create(db.collection('tickets').doc(ticket.id), plain(ticket));
      transaction.set(db.collection('publicTickets').doc(ticket.id), plain(mapTicketForPublic(ticket)));
      reservations.set(ticket.type!, { type: ticket.type!, id: ticket.id });
    }
    const published = [...reservations.values()];
    if (manifestChanged) {
      transaction.set(manifestRef, { published, skipped, updatedAt: now.toISOString() }, { merge: true });
      transaction.set(db.collection('automationLogs').doc(`products-seed-${date}`), {
        action: 'products-seed', date, saved: plans.length, results: results.map(({ ticket, ...item }) => item), createdAt: now.toISOString(),
      });
    }
    return { date, dryRun: false, saved: plans.length, results };
  });
}

export async function runProductPublication(db: Firestore, date: string, dryRun = false, now = new Date(), deadline = Date.now() + 150000) {
  if (process.env.PRODUCT_TICKETS_ENABLED === 'false') return { date, saved: 0, disabled: true };
  if (!dryRun && !writesAllowed()) throw new Error('Automatski upis proizvoda je dozvoljen samo na produkciji ili u emulatoru.');
  const manifest = await stateRef(db, date).get();
  if (AUTOMATED_PRODUCTS.every(type => (manifest.data()?.published || []).some((item: any) => item.type === type))) {
    return { date, saved: 0, reserved: true, dryRun };
  }
  const data = await loadProductPicks(date, now, deadline);
  const result = await publishProductTickets(db, date, data.picks, new Date(Math.max(now.getTime(), Date.now())), dryRun);
  return { ...result, fixtures: data.fixtures, validPicks: data.picks.length, warnings: data.warnings };
}

export type ProductResultResolver = (lookup: {
  id: string; source?: string; fixtureId?: string; date: string; homeTeam: string; awayTeam: string;
}) => Promise<{ fixture: any; provider: string } | null>;
export type ProductEvidence = { matchId: string; fixture?: any; provider?: string };

export async function applyProductResults(db: Firestore, expected: Tip, evidence: ProductEvidence[], now = new Date()) {
  if (!writesAllowed()) throw new Error('Provera rezultata sa upisom nije dozvoljena na preview deployment-u.');
  return db.runTransaction(async transaction => {
    const ref = db.collection('tickets').doc(expected.id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return false;
    const current = { ...snapshot.data(), id: snapshot.id } as Tip;
    if (current.automation !== PRODUCT_AUTOMATION || current.publicationStatus !== TipPublicationStatus.PUBLISHED
      || current.resultManualOverride || finished(current.status) || current.updatedAt !== expected.updatedAt
      || JSON.stringify(current.matches) !== JSON.stringify(expected.matches)) return false;
    let review = false, unresolved = 0;
    const providers = new Set<string>();
    const matches = current.matches.map(match => {
      if (resolvedLeg(match, current.date)) return match;
      const row = evidence.find(item => item.matchId === match.id);
      if (!row) return { ...match, status: finished(match.status) ? TicketStatus.PENDING : match.status || TicketStatus.PENDING };
      const fixture = row.fixture;
      const same = fixture && teamKey(fixture.teams?.home?.name) === teamKey(match.homeTeam)
        && teamKey(fixture.teams?.away?.name) === teamKey(match.awayTeam)
        && Math.abs(Date.parse(fixture.fixture?.date || '') - productMatchKickoff(match, current.date)) <= 10 * 60000;
      if (!same) { review = true; unresolved++; return { ...match, status: TicketStatus.PENDING }; }
      if (row.provider) providers.add(row.provider);
      const fixtureStatus = String(fixture.fixture.status?.short || '');
      if (['CANC', 'VOID'].includes(fixtureStatus)) return { ...match, status: TicketStatus.REFUND, fixtureStatus,
        settledFor: productMatchFingerprint(match, current.date) };
      if (['PST', 'POSTPONED'].includes(fixtureStatus)) return { ...match, status: TicketStatus.POSTPONED, fixtureStatus };
      if (!['FT', 'AET', 'PEN'].includes(fixtureStatus)) return { ...match, status: TicketStatus.PENDING, fixtureStatus };
      const scores = fullTimeFixtureScore(fixture);
      const status = evaluateFullTimePrediction(match.prediction, scores.homeScore ?? undefined, scores.awayScore ?? undefined);
      if (!status) { review = true; unresolved++; return { ...match, status: TicketStatus.PENDING, fixtureStatus }; }
      return { ...match, status, fixtureStatus, result: `${scores.homeScore}:${scores.awayScore}`,
        settledFor: productMatchFingerprint(match, current.date) };
    });
    const settlement = productSettlement(matches, current.totalOdds);
    const settled = finished(settlement.status);
    const attempts = unresolved ? (current.resultCheckAttempts || 0) + 1 : 0;
    const updated = plain({ ...current, matches, status: settlement.status, resultReviewRequired: review, resultCheckAttempts: attempts,
      totalOdds: current.totalOddsOverride ? current.totalOdds : settlement.totalOdds,
      totalOddsOverride: current.totalOddsOverride || settled && matches.some(match => match.status === TicketStatus.REFUND) && settlement.status === TicketStatus.WON,
      updatedAt: now.toISOString(), nextResultCheckAt: settled ? null : new Date(now.getTime() + (unresolved ? Math.min(24, 2 ** Math.min(attempts, 4)) * 3600000 : 30 * 60000)).toISOString(),
    } as Tip);
    const publicTicket = plain(mapTicketForPublic(updated));
    const applyStats = await preparePublicStatsUpdate(transaction, path => reference(db, path), updated.id, settled ? publicTicket : null);
    transaction.update(ref, { ...updated });
    transaction.set(db.collection('publicTickets').doc(updated.id), publicTicket);
    if (settled) transaction.set(db.collection('publicStatsTickets').doc(updated.id), publicTicket);
    else transaction.delete(db.collection('publicStatsTickets').doc(updated.id));
    const changed = current.status !== updated.status || JSON.stringify(current.matches) !== JSON.stringify(updated.matches)
      || current.resultReviewRequired !== updated.resultReviewRequired;
    if (changed) transaction.set(db.collection('automationLogs').doc(`products-result-${updated.id}-${createHash('sha256').update(JSON.stringify([matches, updated.status])).digest('hex').slice(0, 12)}`), {
      action: 'products-result', ticketId: updated.id, type: updated.type, status: updated.status, pendingReview: review,
      providers: [...providers], createdAt: now.toISOString(),
    });
    applyStats(transaction);
    return true;
  });
}

export async function runProductResults(db: Firestore, resolve: ProductResultResolver, now = new Date(), deadline = Date.now() + 150000) {
  if (!writesAllowed()) return { checked: 0, updated: 0, skippedPreview: true };
  const cursorRef = db.collection('automationState').doc('product-results');
  const cursor = String((await cursorRef.get()).data()?.cursorId || '');
  const base = db.collection('tickets').where('status', 'in', [TicketStatus.PENDING, TicketStatus.POSTPONED]).orderBy(FieldPath.documentId()).limit(60);
  let snapshot = await (cursor ? base.startAfter(cursor) : base).get();
  if (!snapshot.size && cursor) snapshot = await base.get();
  const due = snapshot.docs.filter(doc => {
    const tip = doc.data() as Tip;
    return tip.automation === PRODUCT_AUTOMATION && AUTOMATED_PRODUCTS.includes(getTicketProductType(tip) as AutomatedProduct)
      && tip.publicationStatus === TipPublicationStatus.PUBLISHED && !tip.resultManualOverride
      && (!tip.nextResultCheckAt || Date.parse(tip.nextResultCheckAt) <= now.getTime())
      && tip.matches.some(match => !resolvedLeg(match, tip.date) && productMatchKickoff(match, tip.date) + 120 * 60000 <= now.getTime());
  });
  let checked = 0, updated = 0, processedId: string | undefined;
  for (const doc of due.slice(0, 10)) {
    if (Date.now() >= deadline) break;
    const tip = { ...doc.data(), id: doc.id } as Tip, evidence: ProductEvidence[] = [];
    for (const match of tip.matches) {
      if (Date.now() >= deadline) break;
      if (resolvedLeg(match, tip.date) || productMatchKickoff(match, tip.date) + 120 * 60000 > now.getTime()) continue;
      try {
        const found = await resolve({ id: match.id!, source: match.sourceProvider, fixtureId: match.providerFixtureId || match.externalMatchId,
          date: match.eventDate || tip.date, homeTeam: match.homeTeam, awayTeam: match.awayTeam });
        evidence.push({ matchId: match.id!, ...(found ? found : {}) });
      } catch { evidence.push({ matchId: match.id! }); }
    }
    if (evidence.length && await applyProductResults(db, tip, evidence, now)) updated++;
    checked++;
    processedId = doc.id;
  }
  const next = resultQueueCursor(snapshot.docs.map(doc => doc.id), due.map(doc => doc.id), processedId);
  if (cursor !== next) await cursorRef.set({ cursorId: next, updatedAt: now.toISOString() });
  return { checked, updated };
}
