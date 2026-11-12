import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHistoryMonth, getHistoryMonths, isInHistoryMonth } from '../src/utils/historyMonths.ts';

test('May selection excludes June and neighboring months regardless of the current date', () => {
  const dates = ['2026-04-30', '2026-05-01', '2026-05-31', '2026-06-01', '2026-06-24', '2025-05-10'];
  assert.deepEqual(dates.filter(date => isInHistoryMonth(date, '2026-05')), ['2026-05-01', '2026-05-31']);
  assert.deepEqual(dates.filter(date => isInHistoryMonth(date, 'all')), dates);
  assert.equal(isInHistoryMonth('2026-05-10', 'unknown'), false);
});

test('month filtering handles leap days and December/January without leaking across boundaries', () => {
  assert.equal(isInHistoryMonth('2024-02-29', '2024-02'), true);
  assert.equal(isInHistoryMonth('2024-03-01', '2024-02'), false);
  assert.equal(isInHistoryMonth('2025-12-31', '2025-12'), true);
  assert.equal(isInHistoryMonth('2026-01-01', '2025-12'), false);
});

test('month choices follow available history, include previously missing months and contain no duplicates', () => {
  const months = getHistoryMonths(['2025-07-25', '2026-05-02', '2026-06-24', '2026-06-23', '2026-11-12', '', '2026-00-01']);
  assert.deepEqual(months.map(month => month.value), ['2026-11', '2026-06', '2026-05', '2025-07']);
  assert.deepEqual(getHistoryMonths([]), []);
});

test('the displayed profit month names the data period rather than assuming the previous calendar month', () => {
  assert.match(formatHistoryMonth('2026-06'), /jun.*2026/);
  assert.match(formatHistoryMonth('2025-12'), /decembar.*2025/);
  assert.equal(formatHistoryMonth('2026-13'), '');
  assert.equal(formatHistoryMonth(''), '');
});
