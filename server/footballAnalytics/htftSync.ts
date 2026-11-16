import type { AnalyticsDatabase } from './database.js';
import type { HistoricalDataset } from '../../src/types/historicalAnalytics.js';
import type { MatchObservation } from '../../src/types/footballAnalytics.js';
import { HISTORICAL_SEASONS, englishLeague } from './englishPyramid.js';
import { inspectDataset, loadHistoricalDataset, matchDate } from './historicalProvider.js';
import { planHistoricalImport, writeHistoricalImport } from './historicalImport.js';
import { hashId, nameKey, completeScore } from './normalization.js';
import { readEnglishMatches } from './historicalMatches.js';
import { shiftBelgradeDate } from './htftAnalytics.js';
import { localDate } from '../sportsApi.js';

export async function planHtftSync(db: AnalyticsDatabase, options: { now?: Date; deadline?: number; league?: string; loader?: typeof loadHistoricalDataset } = {}) {
  const today = localDate(options.now), from = shiftBelgradeDate(today, -14), to = shiftBelgradeDate(today, 6);
  const existing = await readEnglishMatches(db);
  const fixtureKey = (row: MatchObservation) => [englishLeague(row.league.name)?.id, row.season, nameKey(row.home.name), nameKey(row.away.name), matchDate(row)].join(':');
  const missing = new Set(existing.filter(row => row.season === HISTORICAL_SEASONS.at(-1) && matchDate(row) < today && (!completeScore(row.ft) || !completeScore(row.ht))).map(fixtureKey));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, (options.deadline || Date.now() + 150000) - Date.now()));
  const loader: typeof loadHistoricalDataset = async (league, season, provider) => {
    try {
      controller.signal.throwIfAborted();
      let result = await (options.loader || loadHistoricalDataset)(league, season, provider, controller.signal);
      const definition = englishLeague(league)!;
      if (result.state === 'available' && result.provider !== 'football-data.org' && process.env.FOOTBALL_DATA_API_KEY && 'footballData' in definition && result.records.some(row => matchDate(row) < today && (!completeScore(row.ft) || !completeScore(row.ht)))) {
        const alternative = await (options.loader || loadHistoricalDataset)(league, season, 'football-data.org', controller.signal);
        const known = (value: HistoricalDataset) => value.records.filter(row => row.status === 'finished' && completeScore(row.ft)).length;
        if (alternative.state === 'available' && (known(alternative) > known(result) || known(alternative) === known(result) && alternative.withHtFt > result.withHtFt)) result = alternative;
        else result.warnings.push(...alternative.warnings.map(warning => `Provera svežine: ${warning}`));
      }
      if (result.state !== 'available') return result;
      const rows = result.records.filter(row => matchDate(row) >= from && matchDate(row) <= to || row.status === 'finished' && completeScore(row.ft) && missing.has(fixtureKey(row)));
      const filtered = inspectDataset(rows, row => row, { league, season, provider: result.provider, sourceUrl: result.sourceUrl, license: result.license,
        warnings: [...result.warnings, `Dnevni prozor: ${from}–${to}; dopuna ranije nepoznatih rezultata tekuće sezone. Nema objavljivanja tiketa.`] });
      return { ...filtered, rejected: result.rejected + filtered.rejected, duplicateRows: result.duplicateRows + filtered.duplicateRows };
    } catch (error) {
      return { league, season, provider: 'openfootball', sourceUrl: '', license: '', checkedAt: new Date().toISOString(), sourceRows: 0, validRows: 0, rejected: 0, duplicateRows: 0, withFt: 0, withHtFt: 0, missingTime: 0, missingTimezone: 0, sourceComplete: false, state: 'error', records: [],
        warnings: [controller.signal.aborted ? 'Vremenski budžet sinhronizacije je potrošen; potreban je naredni pokušaj.' : error instanceof Error ? error.message : 'Izvor trenutno nije dostupan.'] } satisfies HistoricalDataset;
    }
  };
  try { return await planHistoricalImport(db, { incremental: true, season: HISTORICAL_SEASONS.at(-1), provider: 'auto', ...(options.league ? { league: options.league } : {}) }, loader); }
  finally { clearTimeout(timer); }
}

export async function runDailyHtftSync(db: AnalyticsDatabase, options: { now?: Date; deadline?: number; loader?: typeof loadHistoricalDataset } = {}) {
  if (process.env.HISTORICAL_ANALYTICS_SYNC_ENABLED !== 'true' || process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED !== 'true') return { skipped: true, reason: 'Dnevni analitički sync nije odobren.' };
  const now = options.now || new Date(), today = localDate(now), id = hashId('htft-daily', today), lock = 'htft-daily-sync';
  const previous = (await db.query('SELECT payload FROM fa_import_runs WHERE id=$1', [id]))[0];
  if (previous && ['complete', 'partial'].includes(JSON.parse(previous.payload).status)) return { skipped: true, reason: 'Današnja sinhronizacija je već završena.' };
  const lease = new Date(Date.now() + 240000).toISOString();
  await db.query('INSERT INTO fa_import_locks(id) VALUES($1) ON CONFLICT(id) DO NOTHING', [lock]);
  const claimed = await db.query('UPDATE fa_import_locks SET lease_until=$1 WHERE id=$2 AND (lease_until IS NULL OR lease_until < $3) RETURNING id', [lease, lock, new Date().toISOString()]);
  if (!claimed.length) return { skipped: true, reason: 'Druga dnevna sinhronizacija je u toku.' };
  const run = { id, kind: 'htft-daily', day: today, createdAt: now.toISOString(), completedAt: undefined as string | undefined, status: 'running', created: 0, updated: 0, unchanged: 0, unresolved: 0, error: undefined as string | undefined, datasets: [] as unknown[] };
  const save = () => db.query('INSERT INTO fa_import_runs(id,created_at,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload', [id, run.createdAt, JSON.stringify(run)]);
  try {
    const already = (await db.query('SELECT payload FROM fa_import_runs WHERE id=$1', [id]))[0];
    if (already && ['complete', 'partial'].includes(JSON.parse(already.payload).status)) return { skipped: true, reason: 'Današnja sinhronizacija je već završena.' };
    await save();
    const plan = await planHtftSync(db, options);
    run.datasets = plan.summary.datasets;
    if (plan.summary.matchChanges > 200 || plan.summary.sqlWritesUpperBound > 3000) throw new Error('Dnevni plan prelazi bezbedan budžet (200 izmenjenih mečeva / 3000 SQL upisa). Pokrenite admin dry-run i proveru.');
    const result = await writeHistoricalImport(db, plan, plan.summary.fingerprint, { maxMatches: 1000 });
    Object.assign(run, { created: result.created, updated: result.updated, unchanged: result.unchanged, unresolved: result.unresolved,
      status: plan.datasets.every(row => row.state === 'error') ? 'error' : result.status,
      ...(plan.datasets.every(row => row.state === 'error') ? { error: 'Nijedan sportski izvor nije uspešno proveren.' } : {}) });
    run.completedAt = new Date().toISOString(); await save();
    return { skipped: false, ...run, firestoreWrites: 0 };
  } catch (error) {
    run.status = 'error'; run.error = error instanceof Error ? error.message.slice(0, 300) : 'Dnevni sync nije uspeo.'; run.completedAt = new Date().toISOString();
    await save();
    return { skipped: false, ...run, firestoreWrites: 0 };
  } finally { await db.query('UPDATE fa_import_locks SET lease_until=NULL WHERE id=$1 AND lease_until=$2', [lock, lease]); }
}
