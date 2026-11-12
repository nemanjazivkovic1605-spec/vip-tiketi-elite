import test from 'node:test';
import assert from 'node:assert/strict';
import { TicketStatus, TipPublicationStatus } from '../src/types.ts';
import { generateTicketCode, resolveTicketCode } from '../src/utils/tickets.ts';
import { activeTicketDateRange, isCurrentActiveTicket } from '../src/utils/activeTickets.ts';

test('two products published in the same minute have stable distinct codes', () => {
  const elite = generateTicketCode(true, '2026-11-12', '09:44', 'auto-elite_ticket-2026-11-12');
  const safe = generateTicketCode(true, '2026-11-12', '09:44', 'auto-safe_pick-2026-11-12');
  assert.notEqual(elite, safe);
  assert.equal(elite, generateTicketCode(true, '2026-11-12', '09:44', 'auto-elite_ticket-2026-11-12'));
  assert.notEqual(elite, generateTicketCode(true, '2026-11-12', '09:44', 'manual-ticket'));
  assert.match(elite, /^V121120260944-[A-Z0-9]{7}$/);
});

test('legacy active codes gain an ID suffix without rewriting historical or custom codes', () => {
  const legacy = 'V121120260944';
  const tip = { id: 'auto-elite_ticket-2026-11-12', status: TicketStatus.PENDING, ticketCode: legacy };
  const resolved = resolveTicketCode(tip, 'fallback');
  assert.equal(resolved, generateTicketCode(true, '2026-11-12', '09:44', tip.id));
  assert.equal(resolveTicketCode({ ...tip, ticketCode: resolved }, 'fallback'), resolved);
  assert.equal(resolveTicketCode({ ...tip, status: TicketStatus.WON }, 'fallback'), legacy);
  assert.equal(resolveTicketCode({ ...tip, ticketCode: 'MY-REFERENCE' }, 'fallback'), 'MY-REFERENCE');
});

test('active view excludes stale unresolved history and retains current postponed tickets', () => {
  const now = new Date('2026-11-12T09:00:00Z');
  assert.deepEqual(activeTicketDateRange(now), { first: '2026-11-06', last: '2026-11-14' });
  const tip = { date: '2026-11-12', status: TicketStatus.POSTPONED, publicationStatus: TipPublicationStatus.PUBLISHED };
  assert.equal(isCurrentActiveTicket(tip, now), true);
  assert.equal(isCurrentActiveTicket({ ...tip, date: '2026-05-29' }, now), false);
  assert.equal(isCurrentActiveTicket({ ...tip, publicationStatus: TipPublicationStatus.DRAFT }, now), false);
  assert.equal(isCurrentActiveTicket({ ...tip, status: TicketStatus.WON }, now), false);
  assert.equal(isCurrentActiveTicket({ ...tip, date: '2026-11-14' }, now), true);
  assert.equal(isCurrentActiveTicket({ ...tip, date: '2026-11-15' }, now), false);
});

test('active date range follows Belgrade at midnight and daylight-saving transitions', () => {
  assert.deepEqual(activeTicketDateRange(new Date('2026-11-12T23:30:00Z')), { first: '2026-11-07', last: '2026-11-15' });
  assert.deepEqual(activeTicketDateRange(new Date('2026-03-29T22:30:00Z')), { first: '2026-03-24', last: '2026-04-01' });
});
