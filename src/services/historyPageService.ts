import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { type Tip, type TicketProductType, type TicketStatus } from '../types';
import { entryOrderKey, statsEntry, STATS_MONTHS_COLLECTION, type StatsEntry, type StatsMonth } from '../utils/publicStats';
import { mapTicketForPublic } from './tickets/ticketMappers';
import { readPublicStatsSummary } from './publicStatsSummary';
import { readPublicHistorySnapshot } from './publicHistorySnapshot';
import { getCachedQuery } from './firestore/queryCache';
import { getTicketProductType } from '../utils/ticketProduct';

export type HistoryPageOptions = { category?: 'all' | TicketProductType; status?: 'all' | TicketStatus; month?: string; date?: string; cursor?: string; limit?: number };
export type HistoryPage = { tips: Tip[]; cursor?: string; hasMore: boolean };
const monthCache = new Map<string, Promise<StatsMonth | undefined>>();
const CACHE_PREFIX = 'elite:history-page:v3:';

const readMonth = (key: string, version: number) => {
  const cacheKey = `${key}:${version}`;
  if (!monthCache.has(cacheKey)) {
    if (monthCache.size > 36) monthCache.clear();
    monthCache.set(cacheKey, getDoc(doc(db, STATS_MONTHS_COLLECTION, key)).then((value) => value.data() as StatsMonth | undefined).catch((error) => { monthCache.delete(cacheKey); throw error; }));
  }
  return monthCache.get(cacheKey)!;
};

const persisted = (key: string): HistoryPage | null => {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || 'null'); } catch { return null; }
};
const persist = (key: string, page: HistoryPage) => {
  try {
    const keys = Object.keys(localStorage).filter((item) => item.startsWith(CACHE_PREFIX));
    keys.slice(0, Math.max(0, keys.length - 10)).forEach((item) => localStorage.removeItem(item));
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(page));
  } catch { /* Offline history still works when browser storage is full. */ }
};

export async function readHistoryPage(options: HistoryPageOptions = {}): Promise<HistoryPage> {
  const summary = await readPublicStatsSummary();
  const limit = Math.min(50, Math.max(1, options.limit || 50));
  const category = options.category || 'all', status = options.status || 'all';
  const cacheKey = JSON.stringify([summary?.version || summary?.generatedAt, category, status, options.month, options.date, options.cursor, limit]);
  const cached = persisted(cacheKey);
  if (cached) return cached;
  return getCachedQuery(`history-page:${cacheKey}`, async () => {
    let result: HistoryPage;
    const fallbackPage = async (): Promise<HistoryPage> => {
      const fallback = (await readPublicHistorySnapshot()).filter((tip) =>
        (category === 'all' || getTicketProductType(tip) === category) && (status === 'all' || tip.status === status)
        && (!options.month || tip.date.startsWith(options.month)) && (!options.date || tip.date === options.date))
        .flatMap((tip) => { const entry = statsEntry(tip); return entry ? [{ tip, key: entryOrderKey(entry) }] : []; })
        .filter((item) => !options.cursor || item.key < options.cursor)
        .sort((a, b) => b.key.localeCompare(a.key));
      return { tips: fallback.slice(0, limit).map(({ tip }) => mapTicketForPublic(tip)), hasMore: fallback.length > limit,
        cursor: fallback.slice(0, limit).at(-1)?.key };
    };
    if (!summary?.months) result = await fallbackPage();
    else try {
      const entries: StatsEntry[] = [];
      for (const [month, rollup] of Object.entries(summary.months).sort(([a], [b]) => b.localeCompare(a))) {
        if (options.month && options.month !== month || options.date && !options.date.startsWith(month)
          || options.cursor && month > options.cursor.slice(0, 7) || !rollup.groups[category]?.count) continue;
        const ledger = await readMonth(month, rollup.version);
        if (!ledger) throw new Error('Public month ledger unavailable.');
        entries.push(...Object.values(ledger?.entries || {}).filter((entry) =>
          (category === 'all' || entry.category === category) && (status === 'all' || entry.status === status)
          && (!options.date || entry.date === options.date) && (!options.cursor || entryOrderKey(entry) < options.cursor),
        ).sort((a, b) => entryOrderKey(b).localeCompare(entryOrderKey(a))));
        if (entries.length > limit) break;
      }
      const selected = entries.slice(0, limit);
      const snapshots = await Promise.all(Array.from({ length: Math.ceil(selected.length / 30) }, (_, index) =>
        getDocs(query(collection(db, 'publicStatsTickets'), where(documentId(), 'in', selected.slice(index * 30, index * 30 + 30).map((entry) => entry.id)))),
      ));
      const byId = new Map(snapshots.flatMap((snapshot) => snapshot.docs.map((value) => [value.id, mapTicketForPublic({ ...value.data(), id: value.id } as Tip)] as const)));
      result = { tips: selected.flatMap((entry) => byId.has(entry.id) ? [byId.get(entry.id)!] : []),
        hasMore: entries.length > limit, cursor: selected.length ? entryOrderKey(selected[selected.length - 1]) : undefined };
    } catch (error) {
      console.warn('History read failed; using the last public snapshot.', error);
      result = await fallbackPage();
      if (!result.tips.length) throw error;
      // Do not persist a degraded page under the live aggregate version.
      return result;
    }
    persist(cacheKey, result);
    return result;
  }, 60000);
}
