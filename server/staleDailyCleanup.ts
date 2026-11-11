import { isVisibleInAdminActiveDailyList } from '../src/utils/dailyLifecycle.js';

type StoredData = Record<string, any>;
export type CleanupOperation = { path: string; action: 'delete' | 'hide' };
const OPEN_TICKET_STATUSES = new Set(['ACTIVE', 'PENDING', 'PENDING_REVIEW', 'POSTPONED', 'SCHEDULED', 'OPEN', 'UNRESOLVED']);

export const staleDailyPaths = (id: string) => [
  `dailyAnalyses/${id}`, `freeDailyAnalyses/${id}`, `publicDailyAnalyses/${id}`,
  `tickets/daily-${id}`, `publicTickets/daily-${id}`, `publicStatsTickets/daily-${id}`,
];

export function planStaleDailyCleanup(id: string, documents: Map<string, StoredData>, before: string) {
  const [daily, free, locked, ticket, publicTicket, stats] = staleDailyPaths(id);
  const analysis = documents.get(daily);
  if (!analysis || !/^\d{4}-\d{2}-\d{2}$/.test(analysis.date || '') || analysis.date >= before
    || !isVisibleInAdminActiveDailyList(analysis as any)) return { protectedHistory: false, operations: [] as CleanupOperation[] };
  const protectedHistory = documents.has(stats) || [ticket, publicTicket].some((path) => {
    const value = documents.get(path);
    return value && !OPEN_TICKET_STATUSES.has(String(value.status || '').toUpperCase());
  });
  const operations: CleanupOperation[] = [{ path: daily, action: protectedHistory ? 'hide' : 'delete' }];
  for (const path of [free, locked, ...(protectedHistory ? [] : [ticket, publicTicket])]) {
    if (documents.has(path)) operations.push({ path, action: 'delete' });
  }
  return { protectedHistory, operations };
}
