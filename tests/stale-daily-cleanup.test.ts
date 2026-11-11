import test from 'node:test';
import assert from 'node:assert/strict';
import { planStaleDailyCleanup, staleDailyPaths } from '../server/staleDailyCleanup.ts';

const before = '2026-11-11', id = 'old-pick';
const documents = () => new Map<string, Record<string, any>>([
  [`dailyAnalyses/${id}`, { date: '2026-06-17', status: 'PENDING_REVIEW', enabled: true, hidden: false }],
  [`tickets/daily-${id}`, { status: 'PENDING' }], [`publicTickets/daily-${id}`, { status: 'PENDING' }],
  [`publicDailyAnalyses/${id}`, { locked: true }],
]);

test('stale cleanup deletes only old visible unresolved daily picks and their active projections', () => {
  const plan = planStaleDailyCleanup(id, documents(), before);
  assert.equal(plan.protectedHistory, false);
  assert.equal(plan.operations.length, 4);
  assert.ok(plan.operations.every((operation) => operation.action === 'delete'));
  assert.ok(plan.operations.every((operation) => !operation.path.startsWith('publicStats')));
  assert.equal(staleDailyPaths(id).length, 6);
});

test('cleanup keeps current, future, hidden and completed analyses', () => {
  for (const patch of [{ date: before }, { date: '2026-11-12' }, { date: '' }, { status: 'WON' }, { status: 'LOST' }, { status: 'REFUND' }, { hidden: true }, { enabled: false }]) {
    const records = documents(); records.set(`dailyAnalyses/${id}`, { ...records.get(`dailyAnalyses/${id}`), ...patch });
    assert.equal(planStaleDailyCleanup(id, records, before).operations.length, 0);
  }
});

test('a settled linked ticket or any stats record is preserved while the stale daily row is hidden', () => {
  for (const path of [`tickets/daily-${id}`, `publicTickets/daily-${id}`, `publicStatsTickets/daily-${id}`]) {
    const records = documents(); records.set(path, { status: 'WON', analysis: 'keep' });
    const plan = planStaleDailyCleanup(id, records, before);
    assert.equal(plan.protectedHistory, true);
    assert.deepEqual(plan.operations[0], { path: `dailyAnalyses/${id}`, action: 'hide' });
    assert.ok(plan.operations.every((operation) => !operation.path.startsWith('tickets/') && !operation.path.startsWith('publicTickets/') && !operation.path.startsWith('publicStats')));
  }
});
