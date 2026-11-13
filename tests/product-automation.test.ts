import test from 'node:test';
import assert from 'node:assert/strict';
import { TicketStatus, TipPublicationStatus, type Tip } from '../src/types.ts';
import { buildStatsSummary } from '../src/utils/publicStats.ts';
import { calculateTicketUnitsProfit } from '../src/utils/tickets.ts';
import { preserveProductAdminEdits } from '../src/utils/productTicketAdminEdits.ts';
import { getTicketProductType } from '../src/utils/ticketProduct.ts';
import { mapActiveTicketForAccess, mapTicketForPublic } from '../src/services/tickets/ticketMappers.ts';
import { buildProductTicket, productMatchKickoff, productSettlement, selectProductPicks, type ProductPick } from '../server/productTickets.ts';
import { applyProductResults, publishProductTickets, runProductPublication, runProductResults, type ProductEvidence } from '../server/productAutomation.ts';
import { MemoryFirestore } from './helpers/memoryFirestore.ts';

const now = new Date('2099-11-10T08:00:00Z'), date = '2099-11-10';
const pool = (count = 8): ProductPick[] => Array.from({ length: count }, (_, index) => ({
  id: `fixture-${index}`, source: 'the-odds-api', sport: 'football', status: 'ACTIVE', date, time: '19:00', kickoffTime: '19:00',
  kickoffAt: '2099-11-10T18:00:00Z', fixtureId: index + 1, providerFixtureId: String(index + 1),
  homeTeam: `Home ${index}`, awayTeam: `Away ${index}`, league: `League ${index % 3}`, prediction: '1', odds: 1.8, oddsUpdatedAt: now.toISOString(),
  reasoning: '', access: 'VIP', sortOrder: index, enabled: false, hidden: true,
}));
const later = new Date('2099-11-10T22:00:00Z');
const evidence = (tip: Tip, status = 'FT', score = { home: 2, away: 0 }): ProductEvidence[] => tip.matches.map(match => ({
  matchId: match.id!, provider: 'TheSportsDB', fixture: { fixture: { date: match.kickoffAt, status: { short: status } },
    teams: { home: { name: match.homeTeam }, away: { name: match.awayTeam } }, goals: score, score: { fulltime: score } },
}));
const saved = (db: MemoryFirestore, type = 'elite_ticket') => structuredClone(db.documents.get(`tickets/auto-${type}-${date}`)) as Tip;

test('builds existing Elite/Safe categories with correct match counts, actual odds, units and publication time', () => {
  const elite = buildProductTicket('elite_ticket', date, pool(), now)!;
  const safe = buildProductTicket('safe_pick', date, pool(), now)!;
  assert.ok(elite.matches.length >= 2 && elite.matches.length <= 6);
  assert.ok(safe.matches.length >= 1 && safe.matches.length <= 3);
  assert.ok(elite.totalOdds >= 2.5);
  assert.ok(safe.totalOdds >= 1.5 && safe.totalOdds <= 3);
  assert.equal(getTicketProductType(elite), 'elite_ticket');
  assert.equal(getTicketProductType(safe), 'safe_pick');
  assert.equal(elite.publishedAt, now.toISOString());
  assert.equal(elite.publishedTime, '09:00');
  assert.equal(elite.status, TicketStatus.PENDING);
  assert.equal(elite.publicationStatus, TipPublicationStatus.PUBLISHED);
  assert.equal(elite.analysis, '');
  assert.ok(elite.matches.every(match => match.odds === 1.8 && match.analysis === ''));
  assert.equal(new Set(elite.matches.map(match => match.externalMatchId)).size, elite.matches.length);
  assert.notEqual(elite.id, safe.id);
});

test('selection prefers available real basic statistics and rejects missing, started, ungradable and duplicate fixtures', () => {
  const values = pool(3);
  values[1].statisticsAvailable = true;
  assert.equal(selectProductPicks(values, 'safe_pick', date, now)[0].id, values[1].id);
  const bad = [{ ...values[0], odds: 1 }, { ...values[0], odds: NaN }, { ...values[0], prediction: 'unknown market' },
    { ...values[0], kickoffAt: now.toISOString() }, { ...values[0], status: 'WON' as const }];
  assert.equal(buildProductTicket('safe_pick', date, bad, now), null);
  assert.equal(buildProductTicket('elite_ticket', date, [values[0], values[0]], now), null);
  assert.equal(buildProductTicket('elite_ticket', date, [], now), null);
});

test('supports double, triple and larger combinations without inventing extra legs', () => {
  assert.equal(buildProductTicket('elite_ticket', date, pool(2), now)!.matches.length, 2);
  assert.equal(buildProductTicket('elite_ticket', date, pool(3), now)!.matches.length, 3);
  const lowerPrices = pool().map(item => ({ ...item, odds: 1.2 }));
  assert.equal(buildProductTicket('elite_ticket', date, lowerPrices, now)!.matches.length, 6);
  assert.equal(buildProductTicket('safe_pick', date, lowerPrices, now)!.matches.length, 3);
});

test('Belgrade event times respect winter/summer offsets and admin date/time edits', () => {
  const match = buildProductTicket('safe_pick', date, pool(), now)!.matches[0];
  assert.equal(productMatchKickoff(match, date), Date.parse('2099-11-10T18:00:00Z'));
  assert.equal(productMatchKickoff({ ...match, eventTime: '20:00' }, date), Date.parse('2099-11-10T19:00:00Z'));
  assert.equal(productMatchKickoff({ ...match, eventDate: '2099-07-10' }, date), Date.parse('2099-07-10T17:00:00Z'));
});

test('dry-run plans both products but makes zero database writes; live publication is atomic and locked publicly', async () => {
  const db = new MemoryFirestore();
  const dry = await publishProductTickets(db as any, date, pool(), now, true);
  assert.equal(dry.saved, 0);
  assert.equal(dry.plannedWrites, 6);
  assert.equal(db.documents.size, 0);
  const published = await publishProductTickets(db as any, date, pool(), now);
  assert.equal(published.saved, 2);
  for (const type of ['elite_ticket', 'safe_pick']) {
    const tip = saved(db, type);
    const publicTip = db.documents.get(`publicTickets/${tip.id}`);
    assert.equal(publicTip.locked, true);
    assert.equal(publicTip.matches[0].homeTeam, '');
    assert.equal(publicTip.matches[0].prediction, '');
    assert.equal(publicTip.totalOdds, 1);
    assert.equal(db.documents.has(`publicStatsTickets/${tip.id}`), false);
  }
});

test('parallel/repeated runs, admin edits and deletion never duplicate, overwrite or resurrect products', async () => {
  const db = new MemoryFirestore();
  const runs = await Promise.all([publishProductTickets(db as any, date, pool(), now), publishProductTickets(db as any, date, pool(), now)]);
  assert.equal(runs.reduce((sum, run) => sum + run.saved, 0), 2);
  const elite = saved(db);
  elite.matches[0].prediction = 'Admin custom market';
  db.documents.set(`tickets/${elite.id}`, elite);
  const safeId = saved(db, 'safe_pick').id;
  db.documents.delete(`tickets/${safeId}`);
  db.documents.delete(`publicTickets/${safeId}`);
  assert.equal((await publishProductTickets(db as any, date, pool(), now)).saved, 0);
  assert.equal(saved(db).matches[0].prediction, 'Admin custom market');
  assert.equal(db.documents.has(`tickets/${safeId}`), false);
  assert.equal((await runProductPublication(db as any, date, false, now) as any).reserved, true);
});

test('existing manual product occupies its category without being overwritten', async () => {
  const db = new MemoryFirestore(), manual = buildProductTicket('elite_ticket', date, pool(), now)!;
  manual.id = 'manual-product';
  db.documents.set(`tickets/${manual.id}`, manual);
  assert.equal((await publishProductTickets(db as any, date, pool(), now)).saved, 1);
  assert.equal(db.documents.get(`tickets/${manual.id}`), manual);
  assert.equal(db.documents.has(`tickets/auto-elite_ticket-${date}`), false);
});

test('insufficient data logs the category reason once and never creates placeholder tickets', async () => {
  const db = new MemoryFirestore();
  const result = await publishProductTickets(db as any, date, [], now);
  assert.equal(result.saved, 0);
  assert.equal(result.results.filter(item => item.status === 'skipped').length, 2);
  assert.equal([...db.documents.keys()].filter(key => key.startsWith('tickets/')).length, 0);
  const before = JSON.stringify([...db.documents]);
  await publishProductTickets(db as any, date, [], now);
  assert.equal(JSON.stringify([...db.documents]), before);
});

test('real scores settle each product into public history and the existing category aggregates exactly once', async () => {
  const db = new MemoryFirestore();
  db.documents.set('publicStats/summary', buildStatsSummary({}));
  await publishProductTickets(db as any, date, pool(), now);
  for (const type of ['elite_ticket', 'safe_pick']) {
    const tip = saved(db, type);
    assert.equal(await applyProductResults(db as any, tip, evidence(tip, 'FT', type === 'elite_ticket' ? { home: 2, away: 0 } : { home: 0, away: 2 }), later), true);
    const updated = saved(db, type);
    assert.equal(updated.status, type === 'elite_ticket' ? TicketStatus.WON : TicketStatus.LOST);
    assert.equal(db.documents.get(`publicStatsTickets/${tip.id}`).locked, false);
    assert.equal(db.documents.get(`publicStatsTickets/${tip.id}`).analysis, '');
    assert.equal(await applyProductResults(db as any, updated, evidence(updated), later), false);
  }
  const stats = db.documents.get('publicStats/summary');
  assert.equal(stats.categories.elite_ticket.totalTips, 1);
  assert.equal(stats.categories.safe_pick.totalTips, 1);
  assert.equal(stats.categories.vip_monthly.totalTips, 0);
  assert.equal(stats.all.totalTips, 2);
  assert.equal(stats.all.winCount, 1);
  assert.equal(stats.all.lossCount, 1);
  assert.equal(stats.categories.elite_ticket.unitsProfit, calculateTicketUnitsProfit(saved(db)));
});

test('a lost leg does not expose the remaining active VIP matches before the whole ticket settles', async () => {
  const db = new MemoryFirestore();
  await publishProductTickets(db as any, date, pool(), now);
  const tip = saved(db);
  await applyProductResults(db as any, tip, evidence(tip, 'FT', { home: 0, away: 2 }).slice(0, 1), later);
  assert.equal(saved(db).status, TicketStatus.PENDING);
  assert.equal(db.documents.get(`publicTickets/${tip.id}`).locked, true);
  assert.equal(db.documents.has(`publicStatsTickets/${tip.id}`), false);
});

test('no provider/mismatched scores/extra-time-only scores stay pending review without invented outcomes', async () => {
  for (const scenario of ['missing', 'wrong-team', 'extra-time']) {
    const db = new MemoryFirestore();
    await publishProductTickets(db as any, date, pool(), now);
    const tip = saved(db), rows = evidence(tip);
    for (const row of rows) {
      if (scenario === 'missing') delete row.fixture;
      else if (scenario === 'wrong-team') row.fixture.teams.home.name = 'Other team';
      else { row.fixture.fixture.status.short = 'AET'; delete row.fixture.score; }
    }
    await applyProductResults(db as any, tip, rows, later);
    assert.equal(saved(db).status, TicketStatus.PENDING);
    assert.equal(saved(db).resultReviewRequired, true);
    assert.equal(db.documents.has(`publicStatsTickets/${tip.id}`), false);
  }
});

test('admin manual results and in-flight edits/deletion are protected from result refresh', async () => {
  const db = new MemoryFirestore();
  await publishProductTickets(db as any, date, pool(), now);
  const original = saved(db), edited = preserveProductAdminEdits(original, { ...original, status: TicketStatus.LOST });
  db.documents.set(`tickets/${original.id}`, edited);
  assert.equal(edited.resultManualOverride, true);
  assert.equal(await applyProductResults(db as any, original, evidence(original), later), false);
  assert.equal(saved(db).status, TicketStatus.LOST);
  db.documents.delete(`tickets/${original.id}`);
  assert.equal(await applyProductResults(db as any, original, evidence(original), later), false);
  const safe = saved(db, 'safe_pick');
  db.documents.set(`tickets/${safe.id}`, preserveProductAdminEdits(safe, { ...safe, matches: safe.matches.map(match => ({ ...match, prediction: 'GG' })) }));
  assert.equal(await applyProductResults(db as any, safe, evidence(safe), later), false);
});

test('combo losses/refunds use actual outcomes and void legs have an effective odds value of one only at settlement', () => {
  const matches = buildProductTicket('elite_ticket', date, pool(), now)!.matches;
  const won = matches.map(match => ({ ...match, status: TicketStatus.WON }));
  assert.equal(productSettlement([{ ...won[0], status: TicketStatus.LOST }, ...won.slice(1)], 5.83).status, TicketStatus.LOST);
  assert.equal(productSettlement(won.map(match => ({ ...match, status: TicketStatus.REFUND })), 5.83).status, TicketStatus.REFUND);
  const partial = productSettlement([{ ...won[0], status: TicketStatus.REFUND }, ...won.slice(1)], 5.83);
  assert.equal(partial.status, TicketStatus.WON);
  assert.equal(partial.totalOdds, Number((1.8 ** (won.length - 1)).toFixed(2)));
});

test('canceled legs settle mixed tickets correctly, while fully void tickets never count as wins or losses', async () => {
  for (const allVoid of [false, true]) {
    const db = new MemoryFirestore();
    db.documents.set('publicStats/summary', buildStatsSummary({}));
    await publishProductTickets(db as any, date, pool(), now);
    const tip = saved(db), rows = evidence(tip);
    rows.forEach((row, index) => { if (allVoid || index === 0) row.fixture.fixture.status.short = 'CANC'; });
    await applyProductResults(db as any, tip, rows, later);
    const updated = saved(db), stats = db.documents.get('publicStats/summary').categories.elite_ticket;
    assert.equal(updated.status, allVoid ? TicketStatus.REFUND : TicketStatus.WON);
    assert.equal(stats.winCount, allVoid ? 0 : 1);
    assert.equal(stats.lossCount, 0);
    assert.equal(stats.refundCount, allVoid ? 1 : 0);
    assert.equal(stats.unitsProfit, allVoid ? 0 : calculateTicketUnitsProfit(updated));
    assert.equal(updated.matches[0].odds, 1.8, 'original real quoted leg price is preserved for the audit');
    if (!allVoid) {
      assert.equal(updated.totalOddsOverride, true);
      assert.equal(updated.totalOdds, Number((1.8 ** (tip.matches.length - 1)).toFixed(2)));
    }
  }
});

test('result runner examines bounded active products and never reads/rewrites completed history', async () => {
  const db = new MemoryFirestore();
  await publishProductTickets(db as any, date, pool(), now);
  const result = await runProductResults(db as any, async lookup => ({ provider: 'TheSportsDB', fixture: {
    fixture: { date: '2099-11-10T18:00:00Z', status: { short: 'FT' } }, teams: { home: { name: lookup.homeTeam }, away: { name: lookup.awayTeam } },
    goals: { home: 2, away: 0 }, score: { fulltime: { home: 2, away: 0 } },
  } }), later);
  assert.equal(result.checked, 2);
  assert.equal(result.updated, 2);
  const before = JSON.stringify([...db.documents]);
  assert.equal((await runProductResults(db as any, async () => { throw new Error('should not fetch'); }, later)).checked, 0);
  assert.equal(JSON.stringify([...db.documents]), before);
});

test('preview cannot publish automatic tickets into the production database', async () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  try { await assert.rejects(() => publishProductTickets(new MemoryFirestore() as any, date, pool(), now), /produkciji/); }
  finally { if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous; }
});

test('active category read layer exposes full tickets only to the existing authorized access level', () => {
  const full = buildProductTicket('elite_ticket', date, pool(), now)!;
  const summary = mapTicketForPublic(full);
  for (const access of [{ canAccessFree: false, canAccessVip: false }, { canAccessFree: true, canAccessVip: false }]) {
    const safe = mapActiveTicketForAccess(summary, full, access);
    assert.equal(safe.matches[0].homeTeam, '');
    assert.equal(safe.matches[0].prediction, '');
    assert.equal(safe.totalOdds, 1);
  }
  assert.equal(mapActiveTicketForAccess(summary, full, { canAccessFree: true, canAccessVip: true }), full);
  assert.equal(mapActiveTicketForAccess(summary, { ...full, id: 'other' }, { canAccessFree: true, canAccessVip: true }).locked, true);
  assert.equal(mapActiveTicketForAccess(summary, { ...full, publicationStatus: TipPublicationStatus.DRAFT }, { canAccessFree: true, canAccessVip: true }).locked, true);
  const free = { ...full, isVip: false };
  assert.equal(mapActiveTicketForAccess(mapTicketForPublic(free), free, { canAccessFree: true, canAccessVip: false }), free);
});
