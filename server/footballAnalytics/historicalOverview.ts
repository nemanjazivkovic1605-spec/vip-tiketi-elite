import type { AnalyticsDatabase } from './database.js';
import { analyticsDatabaseConfig } from './database.js';
import type { AnalyticsMatch } from '../../src/types/footballAnalytics.js';
import type { HistoricalCoverage, HistoricalFilters, HistoricalOverview } from '../../src/types/historicalAnalytics.js';
import { ENGLISH_PYRAMID, HISTORICAL_SEASONS } from './englishPyramid.js';
import { completeScore, leagueKey, nameKey } from './normalization.js';
import { matchDate } from './historicalProvider.js';
import { aggregateHistorical, historicalTeamStats } from './historicalStats.js';
import { validateHistoricalOptions } from './historicalImport.js';
import { readEnglishMatches } from './historicalMatches.js';

export async function historicalOverview(db: AnalyticsDatabase, input: HistoricalFilters = {}, offset = 0): Promise<HistoricalOverview> {
  const filters = validateHistoricalOptions(input);
  if (!Number.isInteger(offset) || offset < 0 || offset > 50000) throw new Error('Neispravna stranica utakmica.');
  const matches = await readEnglishMatches(db);
  const checks = (await db.query('SELECT payload FROM fa_historical_checks')).map(row => JSON.parse(row.payload));
  const coverage: HistoricalCoverage[] = ENGLISH_PYRAMID.flatMap(league => HISTORICAL_SEASONS.map(season => {
    const items = matches.filter(match => match.leagueId === leagueKey(league.name, 'England') && match.season === season);
    const finished = items.filter(match => match.status === 'finished' && completeScore(match.ft));
    const withHtFt = finished.filter(match => completeScore(match.ht) && match.ht.home! <= match.ft.home! && match.ht.away! <= match.ft.away!).length;
    const datasets = checks.filter(check => check.league === league.id && check.season === season);
    const latest = datasets.sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0];
    const successful = datasets.filter(check => check.state === 'available' && check.syncedAt).sort((a, b) => b.syncedAt.localeCompare(a.syncedAt))[0];
    const state: HistoricalCoverage['state'] = items.length ? 'partial' : latest?.state === 'error' ? 'unverified' : league.tier >= 6 || datasets.length && !datasets.some(check => check.state === 'available') ? 'uncovered' : 'unverified';
    return { league: league.id, name: league.name, tier: league.tier, season, matches: items.length, finished: finished.length, withHtFt,
      missingHt: finished.length - withHtFt, missingFt: items.filter(match => !completeScore(match.ft)).length,
      missingTime: items.filter(match => !match.kickoffAt && !match.matchTime).length, missingTimezone: items.filter(match => !match.kickoffAt).length,
      verifiedFieldsPercent: finished.length ? withHtFt / finished.length * 100 : null,
      fullSeasonCompleteness: null, sources: [...new Set(items.flatMap(item => item.sources.map(source => source.provider)))], checkedAt: latest?.checkedAt || null,
      lastSuccessfulSync: successful?.syncedAt || null, state,
      reason: items.length ? 'Delimična pokrivenost. Uvezeni fajl nije potvrda kompletne sezone.' : latest?.warnings?.join(' ') || (league.tier >= 6 ? 'Nema potvrđenog besplatnog izvora. Dostupan je ručni CSV/JSON uvoz uz pravo korišćenja.' : 'Izvor još nije potvrđen za ovu sezonu.'),
    };
  })).filter(row => (!filters.league || row.league === filters.league) && (!filters.tier || row.tier === filters.tier) && (!filters.season || row.season === filters.season));
  const selectedKeys = new Set(coverage.map(row => `${leagueKey(row.name, 'England')}:${row.season}`));
  const selected = matches.filter(match => selectedKeys.has(`${match.leagueId}:${match.season}`));
  const teamIds = new Map<string, string>();
  selected.forEach(match => { teamIds.set(match.homeId, match.home.name); teamIds.set(match.awayId, match.away.name); });
  const search = nameKey(filters.team || '');
  const visibleTeams = [...teamIds].filter(([id, name]) => !search || id === filters.team || nameKey(name).includes(search));
  const matching = new Set(visibleTeams.map(([id]) => id));
  const visible = selected.filter(match => !filters.team || matching.has(match.homeId) || matching.has(match.awayId));
  const coherent = visible.filter(match => match.status === 'finished' && completeScore(match.ft));
  const runs = (await db.query('SELECT payload FROM fa_import_runs ORDER BY created_at DESC LIMIT 20')).map(row => {
    const { datasets, ...summary } = JSON.parse(row.payload);
    return summary;
  });
  const h2hMatches = filters.against && matching.size === 1 ? selected.filter(match =>
    (matching.has(match.homeId) && match.awayId === filters.against) || (matching.has(match.awayId) && match.homeId === filters.against)) : null;
  const pitchKey = (process.env.PITCHAPI_KEY || process.env.PITCHAPI_API_KEY || '').trim();
  const aggregate = aggregateHistorical(visible);
  const opponents = new Map<string, string>();
  if (matching.size === 1) for (const match of selected) {
    if (matching.has(match.homeId)) opponents.set(match.awayId, match.away.name);
    if (matching.has(match.awayId)) opponents.set(match.homeId, match.home.name);
  }
  return {
    catalog: ENGLISH_PYRAMID.map(({ id, name, tier }) => ({ id, name, tier })),
    database: { ...analyticsDatabaseConfig(), ready: true },
    totals: { targetLeagues: new Set(coverage.map(row => row.league)).size, importedLeagues: new Set(visible.map(row => row.leagueId)).size, targetDatasets: coverage.length,
      matches: visible.length, finished: coherent.length, withHtFt: aggregate.withHtFt,
      missingHt: coherent.length - aggregate.withHtFt, missingFt: visible.filter(match => !completeScore(match.ft)).length,
      missingTime: visible.filter(match => !match.kickoffAt && !match.matchTime).length, missingTimezone: visible.filter(match => !match.kickoffAt).length },
    coverage, aggregate,
    teams: visibleTeams.sort((a, b) => a[1].localeCompare(b[1])).slice(0, 50).map(([id, name]) => historicalTeamStats(selected, id, name)),
    matches: visible.slice(offset, offset + 50), hasMore: visible.length > offset + 50, runs,
    sources: [
      { id: 'openfootball', status: 'enabled', message: 'CC0 JSON arhive; nedostajući rezultati i nepoznata vremenska zona ostaju null.', url: 'https://github.com/openfootball/england' },
      { id: 'pitchapi', status: pitchKey.startsWith('pk_live_') ? 'configured_not_verified' : pitchKey.startsWith('pk_test_') ? 'test_only' : 'missing', message: pitchKey.startsWith('pk_live_') ? 'Live ključ postoji; liga i sezona proveravaju se tokom dry-run-a.' : 'Bez potvrđenog live ključa PitchAPI se ne koristi za stvarnu istoriju.', url: 'https://pitchapi.dev/' },
      { id: 'football-data.org', status: process.env.FOOTBALL_DATA_API_KEY ? 'configured_not_verified' : 'missing', message: 'Premier League/Championship prema dozvoli ključa; starije sezone mogu biti nedostupne.', url: 'https://www.football-data.org/coverage' },
      { id: 'football-data.co.uk', status: 'not_enabled', message: 'Automatizovana komercijalna upotreba nije omogućena bez posebne dozvole.', url: 'https://football-data.co.uk/data.php' },
      { id: 'manual', status: 'enabled', message: 'CSV/JSON iz dozvoljenog izvora; administrator potvrđuje pravo korišćenja.', url: '' },
    ],
    incrementalEnabled: process.env.HISTORICAL_ANALYTICS_SYNC_ENABLED === 'true' && process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED === 'true',
    opponents: [...opponents].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    h2h: h2hMatches ? { sample: h2hMatches.filter(match => match.status === 'finished' && completeScore(match.ft)).length, matches: h2hMatches.slice(0, 20), aggregate: aggregateHistorical(h2hMatches) } : null,
  };
}
