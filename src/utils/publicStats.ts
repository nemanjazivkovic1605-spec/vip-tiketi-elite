import { TicketStatus, TipPublicationStatus, type GlobalStats, type Tip, type TicketProductType } from '../types.js';
import { calculateTicketUnitsProfit, getTicketUnitsStake, hasRealTicketOdds, isFinishedForStats, unitsToRsd } from './tickets.js';
import { getTicketProductType } from './ticketProduct.js';

export const STATS_SCHEMA = 1;
export const STATS_SUMMARY_PATH = 'publicStats/summary';
export const STATS_MONTHS_COLLECTION = 'publicMonthlyStats';
export const PRODUCT_TYPES: TicketProductType[] = ['vip_monthly', 'elite_ticket', 'safe_pick'];
export const TICKET_FORMATS = ['singl', 'dubl', 'tripl', 'combo'] as const;
export type TicketFormat = typeof TICKET_FORMATS[number];
export type StatsEntry = {
  id: string; date: string; publishedAt: string; category: TicketProductType;
  status: TicketStatus; odds: number; units: number; profit: number; format: TicketFormat;
};
type Totals = { count: number; wins: number; losses: number; refunds: number; units: number; profit: number; odds: number; sequence: string };
export type MonthRollup = { version: number; groups: Record<string, Totals> };
export type StatsMonth = MonthRollup & { schemaVersion: number; entries: Record<string, StatsEntry> };
export type PublicStatsSummary = {
  schemaVersion: number; version: number; generatedAt: string; source: string;
  all: GlobalStats; categories: Record<TicketProductType, GlobalStats>; months: Record<string, MonthRollup>;
};

export const entryOrderKey = (entry: StatsEntry) => `${entry.date}|${entry.publishedAt}|${entry.id}`;
export const monthOf = (entry?: StatsEntry | null) => entry?.date.slice(0, 7);
export const statsEntry = (tip?: Tip | null): StatsEntry | null => {
  if (!tip || tip.publicationStatus !== TipPublicationStatus.PUBLISHED || !isFinishedForStats(tip.status)
    || !hasRealTicketOdds(tip) || !tip.matches?.length || !/^\d{4}-\d{2}-\d{2}$/.test(tip.date)) return null;
  return {
    id: tip.id, date: tip.date, publishedAt: tip.publishedAt || '', category: getTicketProductType(tip),
    status: tip.status, odds: Number(tip.totalOdds), units: tip.status === TicketStatus.REFUND ? 0 : getTicketUnitsStake(tip),
    profit: calculateTicketUnitsProfit(tip), format: tip.matches.length === 1 ? 'singl' : tip.matches.length === 2 ? 'dubl' : tip.matches.length === 3 ? 'tripl' : 'combo',
  };
};

const totals = (entries: StatsEntry[]): Totals => entries.reduce((result, entry) => ({
  count: result.count + 1, wins: result.wins + Number(entry.status === TicketStatus.WON),
  losses: result.losses + Number(entry.status === TicketStatus.LOST), refunds: result.refunds + Number(entry.status === TicketStatus.REFUND),
  units: result.units + entry.units, profit: result.profit + entry.profit, odds: result.odds + entry.odds,
  sequence: result.sequence + (entry.status === TicketStatus.WON ? 'W' : entry.status === TicketStatus.LOST ? 'L' : ''),
}), { count: 0, wins: 0, losses: 0, refunds: 0, units: 0, profit: 0, odds: 0, sequence: '' });

export const buildStatsMonth = (entries: Record<string, StatsEntry>, version = 1): StatsMonth => {
  const ordered = Object.values(entries).sort((a, b) => entryOrderKey(b).localeCompare(entryOrderKey(a)));
  const groups: Record<string, Totals> = {};
  for (const category of ['all', ...PRODUCT_TYPES]) {
    const selected = category === 'all' ? ordered : ordered.filter((entry) => entry.category === category);
    groups[category] = totals(selected);
    for (const format of TICKET_FORMATS) groups[`${category}:${format}`] = totals(selected.filter((entry) => entry.format === format));
  }
  return { schemaVersion: STATS_SCHEMA, version, entries, groups };
};

const rounded = (value: number, digits = 2) => Number(value.toFixed(digits));
const groupStats = (months: Record<string, MonthRollup>, group: string): GlobalStats => {
  const ordered = Object.entries(months).sort(([a], [b]) => b.localeCompare(a));
  const values = ordered.map(([, month]) => month.groups[group]).filter(Boolean);
  const sum = (key: keyof Omit<Totals, 'sequence'>) => values.reduce((result, value) => result + value[key], 0);
  const count = sum('count'), wins = sum('wins'), losses = sum('losses'), units = sum('units'), profit = sum('profit');
  const sequence = values.map((value) => value.sequence).join('');
  const streak = (status: string) => Math.max(0, ...(sequence.match(new RegExp(`${status}+`, 'g')) || []).map((run) => run.length));
  const hitRate = rounded(100 * wins / (wins + losses || 1), 1);
  const yieldValue = units ? rounded(100 * profit / units, 1) : 0;
  return {
    totalTips: count, completedCount: count, winCount: wins, lossCount: losses, refundCount: sum('refunds'),
    successRate: hitRate, hitRate, unitsProfit: rounded(profit), monthlyProfit: unitsToRsd(profit),
    totalUnitsStaked: rounded(units), averageOdds: count ? rounded(sum('odds') / count) : 0,
    yield: yieldValue, roi: yieldValue, winStreak: streak('W'), loseStreak: streak('L'),
    monthlyBreakdown: ordered.flatMap(([key, month]) => {
      const value = month.groups[group];
      if (!value?.count) return [];
      const [year, monthNumber] = key.split('-').map(Number);
      return [{ key, month: new Date(year, monthNumber - 1, 1).toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' }),
        totalTickets: value.count, wins: value.wins, losses: value.losses, refunds: value.refunds,
        averageOdds: rounded(value.odds / value.count), profitUnits: rounded(value.profit), profitRsd: unitsToRsd(value.profit),
        unitsStaked: rounded(value.units), yield: value.units ? rounded(100 * value.profit / value.units, 1) : 0,
        roi: value.units ? rounded(100 * value.profit / value.units, 1) : 0, tickets: [],
      }];
    }),
  };
};

export const buildStatsSummary = (months: Record<string, MonthRollup>, version = 1, generatedAt = new Date().toISOString()): PublicStatsSummary => {
  const withFormats = (group: string) => ({ ...groupStats(months, group), formatStats: Object.fromEntries(
    TICKET_FORMATS.map((format) => [format, groupStats(months, `${group}:${format}`)]),
  ) });
  return {
    schemaVersion: STATS_SCHEMA, version, generatedAt, source: 'Firestore incremental public aggregates', months,
    all: withFormats('all'), categories: Object.fromEntries(PRODUCT_TYPES.map((category) => [category, withFormats(category)])) as Record<TicketProductType, GlobalStats>,
  };
};

// Both browser-admin writes and server cron transactions use the same ledger and formulas.
export async function preparePublicStatsUpdate(
  transaction: { get: (reference: any) => Promise<any> },
  reference: (path: string) => any,
  id: string,
  after: Tip | null,
) {
  const [beforeSnapshot, summarySnapshot] = await Promise.all([
    transaction.get(reference(`publicStatsTickets/${id}`)), transaction.get(reference(STATS_SUMMARY_PATH)),
  ]);
  const exists = (snapshot: any) => typeof snapshot.exists === 'function' ? snapshot.exists() : snapshot.exists;
  const before = statsEntry(exists(beforeSnapshot) ? { ...beforeSnapshot.data(), id } : null);
  const next = statsEntry(after);
  const summary = summarySnapshot.data() as PublicStatsSummary | undefined;
  if (!before && !next) return () => undefined;
  // A one-time, explicit bootstrap initializes the ledgers; reads never bootstrap them.
  if (summary?.schemaVersion !== STATS_SCHEMA) return () => undefined;
  const monthKeys = [...new Set([monthOf(before), monthOf(next)].filter(Boolean))] as string[];
  const snapshots = await Promise.all(monthKeys.map((key) => transaction.get(reference(`${STATS_MONTHS_COLLECTION}/${key}`))));
  const months = { ...summary.months };
  const updates = monthKeys.map((key, index) => {
    const previous = snapshots[index].data() as StatsMonth | undefined;
    if (summary.months[key] && previous?.schemaVersion !== STATS_SCHEMA) throw new Error('Mesecni agregat nije uskladjen. Pokrenite proveru javne statistike.');
    const entries = { ...previous?.entries };
    delete entries[id];
    if (next && monthOf(next) === key) entries[id] = next;
    const updated = buildStatsMonth(entries, (previous?.version || 0) + 1);
    if (Object.keys(entries).length) months[key] = { version: updated.version, groups: updated.groups };
    else delete months[key];
    return { key, updated };
  });
  const updatedSummary = buildStatsSummary(months, summary.version + 1);
  return (writer: { set: (ref: any, data: any) => any; delete: (ref: any) => any }) => {
    for (const { key, updated } of updates) {
      if (Object.keys(updated.entries).length) writer.set(reference(`${STATS_MONTHS_COLLECTION}/${key}`), updated);
      else writer.delete(reference(`${STATS_MONTHS_COLLECTION}/${key}`));
    }
    writer.set(reference(STATS_SUMMARY_PATH), updatedSummary);
  };
}
