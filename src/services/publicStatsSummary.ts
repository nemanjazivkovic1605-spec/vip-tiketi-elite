import { type GlobalStats, type TicketProductType } from '../types';

const PUBLIC_STATS_SUMMARY_PATH = '/public-stats-summary.json';

type PublicStatsSummary = {
  generatedAt: string;
  source: string;
  all: GlobalStats;
  categories: Partial<Record<TicketProductType, GlobalStats>>;
};

let summaryPromise: Promise<PublicStatsSummary | null> | null = null;

const isStatsShape = (value: unknown): value is GlobalStats => {
  if (!value || typeof value !== 'object') return false;
  const stats = value as Partial<GlobalStats>;
  return typeof stats.completedCount === 'number'
    && typeof stats.hitRate === 'number'
    && Array.isArray(stats.monthlyBreakdown);
};

const normalizeStats = (stats: GlobalStats): GlobalStats => ({
  ...stats,
  monthlyBreakdown: stats.monthlyBreakdown.map((month) => ({
    ...month,
    tickets: Array.isArray(month.tickets) ? month.tickets : [],
  })),
});

export const readPublicStatsSummary = async (): Promise<PublicStatsSummary | null> => {
  if (summaryPromise) return summaryPromise;

  summaryPromise = fetch(PUBLIC_STATS_SUMMARY_PATH, { cache: 'force-cache' })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json() as PublicStatsSummary;
      if (!isStatsShape(payload.all)) return null;

      return {
        generatedAt: payload.generatedAt,
        source: payload.source,
        all: normalizeStats(payload.all),
        categories: Object.fromEntries(
          Object.entries(payload.categories || {})
            .filter(([, stats]) => isStatsShape(stats))
            .map(([key, stats]) => [key, normalizeStats(stats as GlobalStats)]),
        ) as Partial<Record<TicketProductType, GlobalStats>>,
      };
    })
    .catch((error) => {
      console.warn('Public stats summary is not available. Falling back to ticket calculation.', error);
      return null;
    });

  return summaryPromise;
};

export const getStatsFromSummary = async (filter: 'all' | TicketProductType = 'all') => {
  const summary = await readPublicStatsSummary();
  if (!summary) return null;
  return filter === 'all' ? summary.all : summary.categories[filter] || null;
};
