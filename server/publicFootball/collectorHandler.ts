import type { IncomingMessage, ServerResponse } from 'node:http';
import { isFootballCollectorRequest } from '../resultsRunnerAuth.js';
import { publicFootballReadConfig, tursoConnectionConfig, tursoSnapshotWriteConfig } from '../runtimeEnvironment.js';
import type { PublicSnapshot } from '../../src/types/publicFootball.js';
import { localDate } from '../sportsApi.js';
import { buildTursoCollectorSnapshot, COLLECTOR_MAX_RESULT_AGE_DAYS, COLLECTOR_MIN_RECENT_RESULTS, parseCollectorDatasets, type CollectorDataset } from './collector.js';
import { buildLocalOpenFootballFallback } from './localOpenFootballFallback.js';
import { readTursoPublicSnapshotRecord, writeTursoPublicSnapshotIfUnchanged, type TursoPublicSnapshotRecord, type TursoSnapshotRevision } from './tursoSnapshot.js';
import { publicSnapshotVersion } from './store.js';
import { collectorSourcePolicy } from '../footballAnalytics/sourceRegistry.js';

type Action = 'public-sync-status' | 'public-sync-ingest';
type ReadConfig = ReturnType<typeof tursoConnectionConfig>;
type WriteConfig = ReturnType<typeof tursoSnapshotWriteConfig>;
type Dependencies = {
  authorize: (request: IncomingMessage) => Promise<boolean>;
  enabled: () => boolean;
  readSelected: () => boolean;
  readConfig: () => ReadConfig;
  writeConfig: () => WriteConfig;
  readSnapshot: (config: ReadConfig) => Promise<TursoPublicSnapshotRecord | null>;
  writeSnapshot: (snapshot: PublicSnapshot, expected: TursoSnapshotRevision, write: WriteConfig, read: ReadConfig) => Promise<unknown>;
  fallback: () => PublicSnapshot;
  clock: () => Date;
  sourcePolicy: (provider: string) => { allowed: boolean; reason: string | null };
};

async function readJson(request: IncomingMessage) {
  let body = '', bytes = 0;
  for await (const chunk of request) {
    const value = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
    bytes += value.byteLength;
    if (bytes > 2_100_000) throw new Error('Collector payload prelazi 2.1 MB.');
    body += value.toString('utf8');
  }
  const parsed = body ? JSON.parse(body) : {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Neispravan collector zahtev.');
  return parsed;
}

export function createPublicCollectorHandler(dependencies: Partial<Dependencies> = {}) {
  const deps: Dependencies = {
    authorize: isFootballCollectorRequest,
    enabled: () => process.env.PUBLIC_FOOTBALL_SYNC_ENABLED === 'true',
    readSelected: () => {
      const config = publicFootballReadConfig();
      return config.provider === 'turso' && config.configured;
    },
    readConfig: tursoConnectionConfig,
    writeConfig: tursoSnapshotWriteConfig,
    readSnapshot: readTursoPublicSnapshotRecord,
    writeSnapshot: writeTursoPublicSnapshotIfUnchanged,
    fallback: buildLocalOpenFootballFallback,
    clock: () => new Date(),
    sourcePolicy: collectorSourcePolicy,
    ...dependencies,
  };

  return async (request: IncomingMessage, response: ServerResponse, action: Action) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'private, no-store');
    const send = (status: number, data: unknown) => {
      response.statusCode = status;
      response.end(JSON.stringify(data));
    };
    const url = new URL(request.url || '/', 'https://eliteviptips.com');
    if (url.searchParams.getAll('action').length !== 1 || url.searchParams.get('action') !== action)
      return send(400, { error: 'Neispravna collector operacija.' });
    if (!(await deps.authorize(request))) return send(403, { error: 'Collector workflow nije autorizovan.' });
    if (action === 'public-sync-status' && request.method !== 'GET') return send(405, { error: 'Method not allowed.' });
    if (action === 'public-sync-ingest' && request.method !== 'POST') return send(405, { error: 'Method not allowed.' });
    if (!deps.readSelected()) return send(503, { error: 'Javno čitanje nije usmereno na Turso; collector nije pokrenuo upis.' });

    const readConfig = deps.readConfig();
    if (!readConfig.configured || !readConfig.url) return send(503, { error: readConfig.message || 'Turso read konekcija nije podešena.' });
    let current: TursoPublicSnapshotRecord | null;
    try { current = await deps.readSnapshot(readConfig); }
    catch { return send(503, { error: 'Turso snapshot nije dostupan; nije kontaktirana analitička baza.' }); }
    const now = deps.clock();
    if (action === 'public-sync-status') {
      const sync = current?.snapshot.collectorSync;
      const today = localDate(now);
      const versionVerified = Boolean(current && current.version === publicSnapshotVersion(current.snapshot) && current.snapshot.matches.length > 0);
      const freshnessVerified = Boolean(sync?.freshestFinishedDate && sync.freshestFinishedDate <= today
        && sync.freshestFinishedDate >= localDate(new Date(Date.parse(`${today}T00:00:00Z`) - COLLECTOR_MAX_RESULT_AGE_DAYS * 86_400_000))
        && Number(sync.recentFinishedMatches) >= COLLECTOR_MIN_RECENT_RESULTS && Number(sync.lookaheadFixtures) >= 1);
      const snapshotVerified = versionVerified && freshnessVerified;
      const alreadySynced = Boolean(snapshotVerified && sync?.date === today);
      return send(200, {
        alreadySynced,
        snapshotVerified,
        status: alreadySynced ? sync?.status || 'complete' : 'pending',
        completedAt: sync?.completedAt || null,
        snapshotAvailable: Boolean(current),
        matchCount: current?.snapshot.matches.length ?? 0,
        version: current?.version ?? null,
        freshestFinishedDate: sync?.freshestFinishedDate || null,
      });
    }
    if (!deps.enabled()) return send(503, { error: 'PUBLIC_FOOTBALL_SYNC_ENABLED nije uključen; snapshot nije promenjen.' });
    const writer = deps.writeConfig();
    if (!writer.configured || !writer.url || !writer.authToken) return send(503, { error: writer.message || 'Turso writer kredencijali nisu podešeni.' });
    if (writer.url !== readConfig.url) return send(503, { error: 'Turso writer ne cilja istu bazu kao javni read profil.' });

    let datasets: CollectorDataset[];
    try { datasets = parseCollectorDatasets(await readJson(request)); }
    catch (error) { return send(400, { error: error instanceof Error ? error.message : 'Collector payload nije validan.' }); }
    for (const provider of new Set(datasets.flatMap(dataset => dataset.records.map(row => row.provider)))) {
      const policy = deps.sourcePolicy(provider);
      if (!policy.allowed) return send(403, { error: policy.reason || 'Izvor nije odobren za javni collector.' });
    }
    const currentSync = current?.snapshot.collectorSync;
    const currentVersionVerified = Boolean(current && current.version === publicSnapshotVersion(current.snapshot) && current.snapshot.matches.length > 0);
    const currentFreshnessVerified = Boolean(currentSync?.freshestFinishedDate && currentSync.freshestFinishedDate <= localDate(now)
      && currentSync.freshestFinishedDate >= localDate(new Date(Date.parse(`${localDate(now)}T00:00:00Z`) - COLLECTOR_MAX_RESULT_AGE_DAYS * 86_400_000))
      && Number(currentSync.recentFinishedMatches) >= COLLECTOR_MIN_RECENT_RESULTS && Number(currentSync.lookaheadFixtures) >= 1);
    if (current?.snapshot.collectorSync?.date === localDate(now) && currentVersionVerified && currentFreshnessVerified)
      return send(200, { skipped: true, reason: 'Dnevni Turso snapshot je već potvrđen i svež.', matchCount: current.snapshot.matches.length,
        snapshotWrite: { provider: 'turso', verified: true, version: current.version, matchCount: current.snapshot.matches.length } });

    let plan;
    try { plan = buildTursoCollectorSnapshot(current?.snapshot || deps.fallback(), datasets, now); }
    catch (error) { return send(422, { error: error instanceof Error ? error.message : 'Collector plan nije validan.' }); }
    try {
      const receipt = await deps.writeSnapshot(plan.snapshot, { version: current?.version ?? null, updatedAt: current?.updatedAt ?? null }, writer, readConfig) as {
        provider?: unknown; verified?: unknown; version?: unknown; matchCount?: unknown;
      } | null;
      if (!receipt || receipt.provider !== 'turso' || receipt.verified !== true || receipt.version !== plan.version
        || receipt.matchCount !== plan.snapshot.matches.length)
        return send(503, { error: 'Turso je upisao podatke bez potpunog read-back dokaza; status upisa nije potvrđen.' });
      return send(200, { status: plan.summary.status, ...plan.summary,
        snapshotWrite: { provider: 'turso', verified: true, version: receipt.version, matchCount: receipt.matchCount } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Turso snapshot nije uspešno upisan.';
      return send(response.statusCode === 409 || /promenjen nakon čitanja/.test(message) ? 409 : 503, { error: message });
    }
  };
}

export const publicCollectorHandler = createPublicCollectorHandler();
