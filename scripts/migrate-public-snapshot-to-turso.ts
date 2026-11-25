import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { openAnalyticsDatabase } from '../server/footballAnalytics/database.js';
import { getServerDeployment, tursoConnectionConfig } from '../server/runtimeEnvironment.js';
import { readPublicSnapshot, publicSnapshotVersion } from '../server/publicFootball/store.js';
import { encodeTursoSnapshot, createTursoPublicSnapshotSchema, probeTursoConnection, readTursoPublicSnapshotIfPresent, writeTursoPublicSnapshot } from '../server/publicFootball/tursoSnapshot.js';
import { buildLocalOpenFootballFallback } from '../server/publicFootball/localOpenFootballFallback.js';
import { fetchLatestOpenFootballEnglishFiles, mergeOpenFootballSnapshot } from '../server/publicFootball/openFootballSnapshot.js';

const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const sourceKind = arg('source') || 'neon';
const environment = arg('environment');
const envFile = arg('env-file') || '.env.analysis.local';
dotenv.config({ path: envFile, quiet: true });
if (environment) {
  if (!['development', 'preview', 'production'].includes(environment)) throw new Error('Nepoznato Vercel okruženje.');
  process.env.VERCEL_ENV = environment;
}

const write = process.argv.includes('--write');
const allowProductionWrite = process.argv.includes('--allow-production-write');
const confirmation = arg('confirm');
if (!['neon', 'openfootball'].includes(sourceKind)) throw new Error('Izvor mora biti neon ili openfootball.');
if (write && getServerDeployment() === 'production' && !allowProductionWrite)
  throw new Error('Upis u produkcioni Turso zahteva i --allow-production-write.');
const config = tursoConnectionConfig();
if (!config.configured) throw new Error(config.message || 'Turso nije konfigurisan za ovo okruženje.');

let source: Awaited<ReturnType<typeof openAnalyticsDatabase>> | undefined;
try {
  let snapshot;
  let sourceSummary: Record<string, unknown>;
  if (sourceKind === 'openfootball') {
    const base = buildLocalOpenFootballFallback();
    const live = await fetchLatestOpenFootballEnglishFiles();
    const merged = mergeOpenFootballSnapshot(base, live);
    snapshot = merged.snapshot;
    sourceSummary = { source:'OpenFootball CC0 + local verified archive', baseLoadedAt:base.loadedAt, ...merged.summary,
      retrievedAt:live.retrievedAt, sourceFiles:live.summaries };
  } else {
    source = await openAnalyticsDatabase();
    snapshot = await readPublicSnapshot(source);
    sourceSummary = { source:'Neon public sanitized snapshot',sourceMatches:snapshot.matches.length };
  }
  const version = publicSnapshotVersion(snapshot);
  const fingerprint = createHash('sha256').update(`${version}:${snapshot.matches.length}`).digest('hex');
  const targetState = await probeTursoConnection(config);
  const target = targetState.schemaReady && targetState.snapshotReady ? await readTursoPublicSnapshotIfPresent(config) : null;
  const encoded = encodeTursoSnapshot(snapshot);
  const unchanged = target !== null && publicSnapshotVersion(target) === version;

  const summary = {
    mode: write ? 'write' : 'dry-run',
    ...sourceSummary,
    target: 'Turso fa_public_snapshots',
    fingerprint,
    sourceMatches: snapshot.matches.length,
    sourcePayloadBytes: encoded.uncompressedPayloadBytes,
    estimatedStoredPayloadBytes:encoded.payloadBytes,
    compressionRatio:Number((encoded.uncompressedPayloadBytes/Math.max(1,encoded.payloadBytes)).toFixed(2)),
    sourceVersion: version,
    targetMatches: target?.matches.length ?? 0,
    targetVersion: target ? publicSnapshotVersion(target) : null,
    targetNote: target ? undefined : 'Turso snapshot još nije upisan.',
    plannedWrites: unchanged ? 0 : 1,
    plannedSchemaOperations:targetState.schemaReady?0:1,
    privateRowsCopied: 0,
    targetState:{reachable:targetState.reachable,schemaReady:targetState.schemaReady,snapshotReady:targetState.snapshotReady,tableCount:targetState.tableCount},
  };

  if (!write) {
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 0;
  } else {
    if (confirmation !== fingerprint) throw new Error(`Potvrda ne odgovara. Dry-run fingerprint: ${fingerprint}`);
    if (unchanged) {
      console.log(JSON.stringify({ ...summary, written:false, verified:true, reason:'Snapshot verzija se nije promenila.' }, null, 2));
      process.exitCode = 0;
    } else {
      if (target && publicSnapshotVersion(target) !== version &&
        (target.matches.length > snapshot.matches.length || Date.parse(target.loadedAt) > Date.parse(snapshot.loadedAt)))
        throw new Error('Turso već ima noviji ili veći snapshot; automatsko prepisivanje nije dozvoljeno.');
      await createTursoPublicSnapshotSchema(config);
      const result = await writeTursoPublicSnapshot(snapshot, config);
      console.log(JSON.stringify({ ...summary, ...result, verified: true }, null, 2));
    }
  }
} finally {
  await source?.close();
}
