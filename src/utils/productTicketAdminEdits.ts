import { TicketStatus, type Tip } from '../types.js';

export function preserveProductAdminEdits(previous: Tip | undefined, next: Tip): Tip {
  if (previous?.automation !== 'product-tickets') return next;
  const resultChanged = previous.status !== next.status || (previous.result || '') !== (next.result || '');
  return {
    ...next, automation: previous.automation, automationDate: previous.automationDate,
    manualOverride: true,
    resultManualOverride: Boolean(previous.resultManualOverride || resultChanged),
    ...(resultChanged ? { resultReviewRequired: false } : {}),
    matches: next.matches.map(match => {
      const before = previous.matches.find(item => item.id === match.id);
      const manuallySettled = before
        ? before.status !== match.status || (before.result || '') !== (match.result || '')
        : match.status !== undefined && match.status !== TicketStatus.PENDING || Boolean(match.result);
      return { ...match, resultManualOverride: Boolean(before?.resultManualOverride || match.resultManualOverride || manuallySettled) };
    }),
  };
}
