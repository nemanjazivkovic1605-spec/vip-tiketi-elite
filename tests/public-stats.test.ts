import test from 'node:test';
import assert from 'node:assert/strict';
import { TicketStatus, TipPublicationStatus, type Tip } from '../src/types.ts';
import { buildStatsMonth, buildStatsSummary, statsEntry, preparePublicStatsUpdate } from '../src/utils/publicStats.ts';
import { calculateStats } from '../src/utils/ticketStats.ts';
import { getTicketProductType } from '../src/utils/ticketProduct.ts';
import { sendCheckedEmail } from '../server/emailDelivery.ts';
import { coalesceRefresh } from '../src/utils/coalesceRefresh.ts';

const ticket = (id: string, date: string, status: TicketStatus, odds = 1.8): Tip => ({
  id, date, status, totalOdds: odds, unitsStake: 5, publicationStatus: TipPublicationStatus.PUBLISHED,
  type: 'vip_monthly', isVip: true, analysis: '', publishedAt: `${date}T10:00:00Z`,
  matches: [{ id: `${id}-match`, teams: 'Home - Away', homeTeam: 'Home', awayTeam: 'Away', league: 'League', prediction: '1', odds, status, time: '20:00' }],
});

test('incremental public aggregates match the existing units, odds, refund and monthly formulas', () => {
  const tips = [ticket('a', '2026-01-01', TicketStatus.WON, 2.1), ticket('b', '2026-01-02', TicketStatus.LOST), ticket('c', '2026-02-01', TicketStatus.REFUND), ticket('d', '2026-02-02', TicketStatus.WON, 1.65)];
  const months = Object.fromEntries(['2026-01', '2026-02'].map((key) => {
    const month = buildStatsMonth(Object.fromEntries(tips.filter((item) => item.date.startsWith(key)).map((item) => [item.id, statsEntry(item)!])));
    return [key, { version: month.version, groups: month.groups }];
  }));
  const actual = buildStatsSummary(months).all;
  const expected = calculateStats(tips);
  for (const key of ['completedCount', 'winCount', 'lossCount', 'refundCount', 'hitRate', 'averageOdds', 'unitsProfit', 'totalUnitsStaked', 'yield', 'roi', 'monthlyProfit'] as const) assert.equal(actual[key], expected[key], key);
  assert.deepEqual(actual.monthlyBreakdown, expected.monthlyBreakdown.map((month) => ({ ...month, tickets: [] })));
  assert.equal(actual.formatStats!.singl!.completedCount, 4);
  assert.equal(buildStatsSummary(months).categories.elite_ticket.completedCount, 0);
  assert.equal(statsEntry(ticket('bad', '2026-01-02', TicketStatus.WON, 1)), null);
  assert.equal(statsEntry(ticket('open', '2026-01-02', TicketStatus.PENDING)), null);
});

test('editing month/category, settling, deleting and repeat writes do not inflate public totals', async () => {
  const store = new Map<string, any>([['publicStats/summary', buildStatsSummary({})]]);
  const write = async (id: string, value: Tip | null) => {
    const reader = { get: async (path: string) => ({ exists: store.has(path), data: () => store.get(path) }) };
    const apply = await preparePublicStatsUpdate(reader, (path) => path, id, value);
    if (value) store.set(`publicStatsTickets/${id}`, value); else store.delete(`publicStatsTickets/${id}`);
    apply({ set: (path, data) => store.set(path, data), delete: (path) => store.delete(path) });
  };
  const first = ticket('a', '2026-01-01', TicketStatus.WON, 2);
  await write('a', first);
  await write('a', first);
  assert.equal(store.get('publicStats/summary').all.completedCount, 1);
  await write('a', { ...first, date: '2026-02-01', status: TicketStatus.LOST, type: 'safe_pick' });
  const summary = store.get('publicStats/summary');
  assert.equal(summary.categories.vip_monthly.completedCount, 0);
  assert.equal(summary.categories.safe_pick.lossCount, 1);
  assert.equal(summary.all.unitsProfit, -5);
  assert.equal(store.has('publicMonthlyStats/2026-01'), false);
  await write('a', null);
  assert.equal(store.get('publicStats/summary').all.completedCount, 0);
});

test('legacy history stays monthly, explicit SAFE and manual category edits are respected', () => {
  const legacy = ticket('history-old', '2026-01-01', TicketStatus.WON);
  assert.equal(getTicketProductType({ ...legacy, type: 'elite_ticket' }), 'vip_monthly');
  assert.equal(getTicketProductType({ ...legacy, type: 'safe_pick' }), 'safe_pick');
  assert.equal(getTicketProductType({ ...legacy, type: 'elite_ticket', categoryManualOverride: true }), 'elite_ticket');
});

test('email provider rejection cannot be reported as success and reply-to is preserved', async () => {
  await assert.rejects(sendCheckedEmail({ emails: { send: async () => ({ data: null, error: { name: 'validation_error' } }) } }, {}));
  let payload: any;
  const result = await sendCheckedEmail({ emails: { send: async (value) => { payload = value; return { data: { id: 'accepted' } }; } } }, { replyTo: 'customer@example.com' });
  assert.equal(result.id, 'accepted');
  assert.equal(payload.replyTo, 'customer@example.com');
});

test('concurrent admin refreshes are coalesced and retain requested user/notification loads', async () => {
  const calls: any[] = [];
  const run = coalesceRefresh<{ users: boolean }>(async (options) => { calls.push(options); }, (previous, next) => ({ users: Boolean(previous?.users || next.users) }));
  await Promise.all([run({ users: false }), run({ users: true }), run({ users: false })]);
  assert.deepEqual(calls, [{ users: true }]);
});
