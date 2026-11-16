import { randomUUID, createHash } from 'node:crypto';
import type { AnalyticsDatabase } from './database.js';
import type { AnalyticsMatch, MatchObservation } from '../../src/types/footballAnalytics.js';
import type { HistoricalDataset, HistoricalImportOptions, HistoricalPlanSummary } from '../../src/types/historicalAnalytics.js';
import { ENGLISH_PYRAMID, HISTORICAL_SEASONS, englishLeague, historicalSeason } from './englishPyramid.js';
import { hashId, leagueKey, nameKey } from './normalization.js';
import { ingestMatch } from './store.js';
import { loadHistoricalDataset, manualHistoricalDataset, repositoryHistoricalDatasets } from './historicalProvider.js';

export const HISTORICAL_MAX_WRITE_MATCHES = 500;
export type HistoricalImportPlan = { summary: HistoricalPlanSummary; datasets: HistoricalDataset[]; options: HistoricalImportOptions };
export function validateHistoricalOptions(input: HistoricalImportOptions): HistoricalImportOptions {
  if (input.league && !englishLeague(input.league)) throw new Error('Nepoznata engleska liga.');
  if (input.season && !historicalSeason(input.season)) throw new Error('Izaberite sezonu od 2023/24 do 2026/27.');
  if (input.tier !== undefined && (!Number.isInteger(input.tier) || input.tier < 1 || input.tier > 7)) throw new Error('Rang mora biti od 1 do 7.');
  if (input.provider && !['auto', 'openfootball', 'pitchapi', 'football-data.org', 'manual'].includes(input.provider)) throw new Error('Nepodržan izvor.');
  if (input.incremental && input.season && historicalSeason(input.season) !== '2026/27') throw new Error('Incremental sync je namenjen tekućoj sezoni 2026/27.');
  return { ...input, ...(input.league ? { league: englishLeague(input.league)!.id } : {}), ...(input.season ? { season: historicalSeason(input.season)! } : {}) };
}
const semanticRecord = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(semanticRecord);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['observedAt', 'checkedAt', 'lastCheckedAt'].includes(key)).map(([key, item]) => [key, semanticRecord(item)]));
  return value;
};
type PreviewDatabase = AnalyticsDatabase & { stagePreview?: (match: AnalyticsMatch, observation: MatchObservation) => void };
async function previewReadModel(db: AnalyticsDatabase, datasets: HistoricalDataset[]): Promise<PreviewDatabase> {
  const leagues = [...new Set(datasets.map(dataset => leagueKey(englishLeague(dataset.league)!.name, 'England')))];
  if (!leagues.length) return db;
  const placeholders = leagues.map((_, index) => `$${index + 1}`).join(',');
  const seasons = [...new Set(datasets.map(dataset => dataset.season))];
  const seasonPlaceholders = seasons.map((_, index) => `$${leagues.length + index + 1}`).join(',');
  const scope = `environment='real' AND league_id IN (${placeholders}) AND season IN (${seasonPlaceholders})`;
  const values = [...leagues, ...seasons];
  const rows = await db.query(`SELECT * FROM fa_matches WHERE ${scope} LIMIT 50001`, values);
  if (rows.length > 50000) throw new Error('Dry-run zahteva manji obim lige ili sezone.');
  const byId = new Map(rows.map(row => [row.id, row]));
  const sourceRows = await db.query(`SELECT s.* FROM fa_sources s WHERE s.match_id IN (SELECT id FROM fa_matches WHERE ${scope})`, values);
  const sources = new Map(sourceRows.map(row => [`${row.provider}:${row.source_id}:${row.environment}`, row]));
  const teamRows = await db.query(`SELECT a.* FROM fa_aliases a WHERE a.environment='real' AND a.team_id IN (SELECT home_id FROM fa_matches WHERE ${scope} UNION SELECT away_id FROM fa_matches WHERE ${scope})`, values);
  const aliases = new Map(teamRows.map(row => [`${row.provider}:${row.source_id}:${row.environment}`, row]));
  const identities = new Map<string, any[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.environment, row.league_id, row.season, row.home_key, row.away_key]);
    identities.set(key, [...(identities.get(key) || []), row]);
  }
  return { kind: db.kind, close: async () => {}, transaction: async () => { throw new Error('Dry-run je read-only.'); },
    stagePreview: (match, observation) => {
      const previous = byId.get(match.id);
      if (previous) {
        const key = JSON.stringify([previous.environment, previous.league_id, previous.season, previous.home_key, previous.away_key]);
        identities.set(key, (identities.get(key) || []).filter(row => row.id !== match.id));
      }
      const row = { id: match.id, payload: JSON.stringify(match), league_id: match.leagueId, season: match.season, environment: match.environment, home_key: nameKey(match.home.name), away_key: nameKey(match.away.name) };
      byId.set(match.id, row);
      const key = JSON.stringify([row.environment, row.league_id, row.season, row.home_key, row.away_key]);
      identities.set(key, [...(identities.get(key) || []), row]);
      sources.set(`${observation.provider}:${observation.sourceId}:${observation.environment}`, { match_id: match.id });
      aliases.set(`${observation.provider}:${observation.home.sourceId}:${observation.environment}`, { team_id: match.homeId });
      aliases.set(`${observation.provider}:${observation.away.sourceId}:${observation.environment}`, { team_id: match.awayId });
    },
    query: async (sql, values = []) => {
      if (sql.startsWith('SELECT match_id FROM fa_sources')) { const row = sources.get(values.join(':')); return (row ? [row] : []) as any; }
      if (sql.startsWith('SELECT payload,checked_at FROM fa_matches WHERE id=')) { const row = byId.get(values[0]); return (row ? [row] : []) as any; }
      if (sql.startsWith('SELECT payload FROM fa_matches WHERE environment=')) return (identities.get(JSON.stringify(values)) || []) as any;
      if (sql.startsWith('SELECT team_id FROM fa_aliases')) { const row = aliases.get(values.join(':')); return (row ? [row] : []) as any; }
      throw new Error('Neočekivan upit u read-only planu.');
    } };
}
export async function planHistoricalImport(db: AnalyticsDatabase, input: HistoricalImportOptions = {}, loader = loadHistoricalDataset): Promise<HistoricalImportPlan> {
  const options = validateHistoricalOptions(input);
  const datasets: HistoricalDataset[] = [];
  if (options.archiveOnly) datasets.push(...(await repositoryHistoricalDatasets()).filter(row => (!options.league || row.league === options.league) && (!options.season || row.season === options.season) && (!options.tier || englishLeague(row.league)!.tier === options.tier)));
  else if (options.provider === 'manual' || options.content !== undefined) datasets.push(manualHistoricalDataset(options));
  else {
    const seasons = options.incremental ? ['2026/27'] : options.season ? [options.season] : [...HISTORICAL_SEASONS];
    const leagues = ENGLISH_PYRAMID.filter(row => (!options.league || row.id === options.league) && (!options.tier || row.tier === options.tier));
    for (const league of leagues) for (const season of seasons) datasets.push(await loader(league.id, season, options.provider || 'auto'));
  }
  const summary: HistoricalPlanSummary = { fingerprint: '', datasets: [], create: 0, update: 0, unchanged: 0, unresolved: 0, rejected: 0, duplicateRows: 0, matchChanges: 0, sqlWritesUpperBound: 0, firestoreWrites: 0,
    productionWriteAllowed: process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED === 'true' };
  const preview = await previewReadModel(db, datasets);
  for (const dataset of datasets) {
    const { records, ...meta } = dataset;
    summary.datasets.push(meta); summary.rejected += meta.rejected; summary.duplicateRows += meta.duplicateRows;
    for (const record of records) {
      const action = await ingestMatch(preview, record, { dryRun: true, onPreview: match => preview.stagePreview?.(match, record) });
      summary[action === 'created' ? 'create' : action === 'updated' ? 'update' : action]++;
    }
  }
  summary.matchChanges = summary.create + summary.update;
  summary.sqlWritesUpperBound = summary.matchChanges * 10 + summary.unchanged + summary.unresolved + datasets.length * 3 + 8;
  const fingerprint = { options: { ...options, content: options.content ? createHash('sha256').update(options.content).digest('hex') : undefined },
    records: datasets.map(dataset => ({ league: dataset.league, season: dataset.season, provider: dataset.provider, state: dataset.state, records: dataset.records.map(semanticRecord) })),
    counts: [summary.create, summary.update, summary.unchanged, summary.unresolved] };
  summary.fingerprint = createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
  return { summary, datasets, options };
}
export async function writeHistoricalImport(db: AnalyticsDatabase, plan: HistoricalImportPlan, confirmation: string, options: { maxMatches?: number; allowLarge?: boolean; now?: Date } = {}) {
  if (confirmation !== plan.summary.fingerprint) throw new Error('Plan se promenio. Ponovite dry-run i potvrdite novi plan.');
  if ((process.env.VERCEL || process.env.NODE_ENV === 'production' || db.kind === 'postgres') && process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED !== 'true')
    throw new Error('Produkcijski istorijski upis nije odobren. Potreban je HISTORICAL_ANALYTICS_WRITE_ENABLED=true.');
  const maximum = Math.min(5000, Math.max(1, options.maxMatches || HISTORICAL_MAX_WRITE_MATCHES));
  if (plan.summary.create + plan.summary.update + plan.summary.unchanged + plan.summary.unresolved > maximum && !options.allowLarge)
    throw new Error(`Plan prelazi ${maximum} mečeva. Izaberite manji skup ili eksplicitno potvrdite veći lokalni uvoz.`);
  const id = randomUUID(), createdAt = (options.now || new Date()).toISOString();
  const run = { id, createdAt, status: 'running', fingerprint: confirmation, created: 0, updated: 0, unchanged: 0, unresolved: 0, invalid: plan.summary.rejected, datasets: plan.summary.datasets, completedAt: undefined as string | undefined, error: undefined as string | undefined };
  const lockId = 'english-historical-import';
  await db.query('INSERT INTO fa_import_locks(id) VALUES($1) ON CONFLICT(id) DO NOTHING', [lockId]);
  const lease = new Date(Date.now() + 300000).toISOString();
  const claimed = await db.query('UPDATE fa_import_locks SET lease_until=$1 WHERE id=$2 AND (lease_until IS NULL OR lease_until < $3) RETURNING id', [lease, lockId, new Date().toISOString()]);
  if (!claimed.length) throw new Error('Drugi istorijski uvoz je u toku. Sačekajte završetak.');
  const saveRun = () => db.query('INSERT INTO fa_import_runs(id,created_at,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload', [id, createdAt, JSON.stringify(run)]);
  try {
    await saveRun();
    for (const dataset of plan.datasets) {
      for (const record of dataset.records) {
        const action = await ingestMatch(db, record);
        run[action]++;
      }
      const { records, ...metadata } = dataset;
      const league = englishLeague(dataset.league)!;
      await db.query('INSERT INTO fa_leagues(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
        [hashId('historical', dataset.league), JSON.stringify({ id: dataset.league, name: league.name, tier: league.tier, country: 'England', seasons: HISTORICAL_SEASONS })]);
      await db.query('INSERT INTO fa_historical_checks(id,league_id,season,payload) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
        [hashId(dataset.provider, dataset.league, dataset.season), dataset.league, dataset.season, JSON.stringify({ ...metadata, syncedAt: dataset.state === 'available' ? new Date().toISOString() : null })]);
      await saveRun();
    }
    run.status = plan.datasets.some(dataset => dataset.state !== 'available') ? 'partial' : 'complete';
    run.completedAt = new Date().toISOString();
    await saveRun();
    return run;
  } catch (error) {
    run.status = 'error'; run.error = error instanceof Error ? error.message.slice(0, 200) : 'Uvoz nije završen.';
    run.completedAt = new Date().toISOString(); await saveRun(); throw error;
  } finally { await db.query('UPDATE fa_import_locks SET lease_until=NULL WHERE id=$1 AND lease_until=$2', [lockId, lease]); }
}
export async function syncHistoricalCurrentSeason(db: AnalyticsDatabase, deadline = Date.now() + 150000) {
  if (process.env.HISTORICAL_ANALYTICS_SYNC_ENABLED !== 'true' || process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED !== 'true') return { skipped: true, reason: 'Istorijski incremental sync nije odobren.' };
  return (await import('./htftSync.js')).runDailyHtftSync(db, { deadline });
}
