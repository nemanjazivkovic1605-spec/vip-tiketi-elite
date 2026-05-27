import { apiFootballProvider } from './apiFootballProvider.js';
import { footballDataProvider } from './footballDataProvider.js';
import { theSportsDbProvider } from './theSportsDbProvider.js';
import { normalizeComparableText } from './providerUtils.js';

export type EnrichedMatchStats = {
  provider: string;
  fixtureId?: string;
  league?: string;
  date?: string;
  homeTeam?: string;
  awayTeam?: string;
  standings?: unknown;
  lastMatches?: unknown;
  h2h?: unknown;
  goalsForAgainst?: unknown;
  homeAwayForm?: unknown;
  injuries?: unknown;
  odds?: unknown;
  statistics?: unknown;
  xg?: unknown;
};

export type SportsMatchLookup = {
  fixtureId?: string;
  sport?: 'football' | 'basketball';
  league?: string;
  date?: string;
  homeTeam: string;
  awayTeam: string;
};

export interface SportsDataProvider {
  id: string;
  endpointLabel: string;
  getEnrichedStats: (lookup: SportsMatchLookup) => Promise<EnrichedMatchStats | null>;
}

export type SportsDataResolution = {
  stats: EnrichedMatchStats | null;
  fromCache: boolean;
  attemptedProviders: string[];
};

const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;
const ENRICHMENT_BUDGET_MS = 8_000;
const cacheTtlMinutes = Number(process.env.SPORTS_STATS_CACHE_TTL_MINUTES);
const CACHE_TTL_MS = Number.isFinite(cacheTtlMinutes) && cacheTtlMinutes >= 15 && cacheTtlMinutes <= 60
  ? cacheTtlMinutes * 60 * 1000
  : DEFAULT_CACHE_TTL_MS;
const cache = new Map<string, { expiresAt: number; resolution: SportsDataResolution }>();
const inFlight = new Map<string, Promise<SportsDataResolution>>();

const providers: SportsDataProvider[] = [
  apiFootballProvider,
  footballDataProvider,
  theSportsDbProvider,
];

export const getConfiguredSportsProviderIds = () => [
  ...(process.env.API_FOOTBALL_KEY?.trim() ? ['API-Football'] : []),
  ...(process.env.FOOTBALL_DATA_API_KEY?.trim() ? ['football-data.org'] : []),
  ...(process.env.THESPORTSDB_API_KEY?.trim() ? ['TheSportsDB'] : []),
];

const hasObjectData = (value: unknown) => {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || typeof value !== 'object') return value !== null && value !== undefined && value !== '';
  return Object.values(value as Record<string, unknown>).some((entry) => hasObjectData(entry));
};

export const hasMeaningfulEnrichedStats = (stats: EnrichedMatchStats | null) =>
  Boolean(stats && [
    stats.standings,
    stats.lastMatches,
    stats.h2h,
    stats.goalsForAgainst,
    stats.homeAwayForm,
    stats.injuries,
    stats.odds,
    stats.statistics,
    stats.xg,
  ].some(hasObjectData));

export const buildSportsDataCacheKey = (lookup: SportsMatchLookup) =>
  [
    lookup.sport || 'football',
    lookup.fixtureId || '',
    lookup.date || '',
    normalizeComparableText(lookup.homeTeam),
    normalizeComparableText(lookup.awayTeam),
  ].join(':');

const debugProvider = (message: string, details: Record<string, unknown>) => {
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[sportsData] ${message}`, details);
  }
};

export const clearSportsDataCache = () => {
  cache.clear();
  inFlight.clear();
};

const getWithinBudget = async (
  provider: SportsDataProvider,
  lookup: SportsMatchLookup,
  timeoutMs: number,
) => new Promise<EnrichedMatchStats | null>((resolve) => {
  const timeoutId = setTimeout(() => resolve(null), timeoutMs);
  provider.getEnrichedStats(lookup)
    .then((stats) => {
      clearTimeout(timeoutId);
      resolve(stats);
    })
    .catch(() => {
      clearTimeout(timeoutId);
      resolve(null);
    });
});

export async function resolveSportsDataWithProviders(
  lookup: SportsMatchLookup,
  availableProviders: SportsDataProvider[] = providers,
): Promise<SportsDataResolution> {
  const cacheKey = buildSportsDataCacheKey(lookup);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    debugProvider('cache hit', {
      provider: cached.resolution.stats?.provider || null,
      fixtureId: cached.resolution.stats?.fixtureId || lookup.fixtureId || null,
      enrichedStats: Boolean(cached.resolution.stats),
    });
    return { ...cached.resolution, fromCache: true };
  }

  const attemptedProviders: string[] = [];
  const deadline = Date.now() + ENRICHMENT_BUDGET_MS;
  for (const provider of availableProviders) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    attemptedProviders.push(provider.id);
    try {
      const stats = await getWithinBudget(provider, lookup, remainingMs);
      if (!hasMeaningfulEnrichedStats(stats)) continue;

      const resolution = { stats, fromCache: false, attemptedProviders };
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, resolution });
      debugProvider('provider success', {
        provider: provider.id,
        endpoint: provider.endpointLabel,
        fixtureId: stats?.fixtureId || lookup.fixtureId || null,
        enrichedStats: true,
      });
      return resolution;
    } catch {
      debugProvider('provider failed', {
        provider: provider.id,
        endpoint: provider.endpointLabel,
        fixtureId: lookup.fixtureId || null,
        enrichedStats: false,
      });
    }
  }

  const resolution = { stats: null, fromCache: false, attemptedProviders };
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, resolution });
  debugProvider('no enrichment found', {
    provider: null,
    fixtureId: lookup.fixtureId || null,
    enrichedStats: false,
  });
  return resolution;
}

export const getEnrichedMatchStats = (
  lookup: SportsMatchLookup,
  availableProviders: SportsDataProvider[] = providers,
) => {
  const cacheKey = buildSportsDataCacheKey(lookup);
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const request = resolveSportsDataWithProviders(lookup, availableProviders)
    .finally(() => {
      if (inFlight.get(cacheKey) === request) {
        inFlight.delete(cacheKey);
      }
    });
  inFlight.set(cacheKey, request);
  return request;
};
