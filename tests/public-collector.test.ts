import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { englishLeague } from '../server/footballAnalytics/englishPyramid.ts';
import { hashId } from '../server/footballAnalytics/normalization.ts';
import { buildTursoCollectorSnapshot, filterStaleCollectorDatasets, parseCollectorDatasets, validateCollectorFreshness } from '../server/publicFootball/collector.ts';
import { createPublicCollectorHandler } from '../server/publicFootball/collectorHandler.ts';
import { snapshotFromMatches, publicSnapshotVersion } from '../server/publicFootball/store.ts';
import type { MatchObservation } from '../src/types/footballAnalytics.ts';
import type { PublicSnapshot } from '../src/types/publicFootball.ts';
import { createAnalyticsHandler } from '../api/football-analytics.ts';

const fixedDate = new Date('2026-11-26T12:00:00.000Z');
const observation = (patch: Partial<MatchObservation> = {}): MatchObservation => ({
  provider: 'openfootball', sourceId: 'fixture-1', environment: 'real',
  league: { sourceId: 'pl', name: 'Premier League', country: 'England', tier: 1 }, season: '2026/27',
  kickoffAt: null, matchDate: '2026-11-26', matchTime: '20:00',
  home: { sourceId: 'home', name: 'Arsenal' }, away: { sourceId: 'away', name: 'Chelsea' }, status: 'scheduled',
  ht: { home: null, away: null }, ft: { home: null, away: null }, extraTime: { home: null, away: null },
  penalties: { home: null, away: null }, xg: { home: null, away: null }, shots: { home: null, away: null },
  shotsOnTarget: { home: null, away: null }, events: null, individualShots: null,
  observedAt: fixedDate.toISOString(), statsChecked: false, ...patch,
});
const recentResults = () => [
  observation({ sourceId: 'fixture-recent-1', matchDate: '2026-11-25', matchTime: null, home: { sourceId: 'home-recent-1', name: 'Brighton' },
    away: { sourceId: 'away-recent-1', name: 'Fulham' }, status: 'finished', ht: { home: 1, away: 0 }, ft: { home: 2, away: 1 } }),
  observation({ sourceId: 'fixture-recent-2', matchDate: '2026-11-24', matchTime: null, home: { sourceId: 'home-recent-2', name: 'Wolves' },
    away: { sourceId: 'away-recent-2', name: 'Sunderland' }, status: 'finished', ht: { home: 0, away: 0 }, ft: { home: 1, away: 0 } }),
  observation({ sourceId: 'fixture-recent-3', matchDate: '2026-11-23', matchTime: null, home: { sourceId: 'home-recent-3', name: 'Liverpool' },
    away: { sourceId: 'away-recent-3', name: 'Manchester City' }, status: 'finished', ht: { home: 1, away: 1 }, ft: { home: 2, away: 2 } }),
];
const dataset = (...records: MatchObservation[]) => [{ name: 'Premier League', state: 'available' as const, records }];

test('collector validates source, data environment, English league scope and payload bounds', () => {
  assert.equal(parseCollectorDatasets({ datasets: dataset(observation()) })[0].records.length, 1);
  assert.throws(() => parseCollectorDatasets({ datasets: dataset(observation({ provider: 'pitchapi' })) }), /OpenFootball/);
  assert.throws(() => parseCollectorDatasets({ datasets: dataset(observation({ environment: 'test' })) }), /OpenFootball/);
  assert.throws(() => parseCollectorDatasets({ datasets: dataset(observation({ league: { sourceId: 'x', name: 'National League North', country: 'England', tier: 6 } })) }), /OpenFootball/);
  assert.throws(() => parseCollectorDatasets({ datasets: Array.from({ length: 25 }, (_, index) => ({ name: String(index), state: 'available', records: [] })) }), /validnu listu skupova/);
});

test('collector merge is idempotent, keeps known scores, reports conflicts and tracks sync date', () => {
  const empty = snapshotFromMatches([], fixedDate);
  const first = buildTursoCollectorSnapshot(empty, dataset(...recentResults(), observation(), observation()), fixedDate);
  assert.equal(first.summary.created, 4);
  assert.equal(first.summary.rejected, 1);
  assert.equal(first.snapshot.matches.length, 4);
  assert.equal(first.snapshot.collectorSync?.date, '2026-11-26');
  assert.equal(first.snapshot.collectorSync?.freshestFinishedDate, '2026-11-25');

  const finished = observation({ status: 'finished', ht: { home: 1, away: 0 }, ft: { home: 2, away: 1 } });
  const update = buildTursoCollectorSnapshot(first.snapshot, dataset(...recentResults(), finished, observation()), fixedDate);
  assert.equal(update.summary.updated, 1);
  const updatedMatch = update.snapshot.matches.find(match => match.homeTeam === 'Arsenal');
  assert.deepEqual(updatedMatch?.ft, { home: 2, away: 1 });
  assert.deepEqual(updatedMatch?.ht, { home: 1, away: 0 });

  const conflicting = observation({ status: 'finished', ht: { home: 0, away: 1 }, ft: { home: 0, away: 2 } });
  const conflict = buildTursoCollectorSnapshot(update.snapshot, dataset(...recentResults(), conflicting, observation()), fixedDate);
  assert.equal(conflict.summary.conflicts, 1);
  const conflictedMatch = conflict.snapshot.matches.find(match => match.homeTeam === 'Arsenal');
  assert.deepEqual(conflictedMatch?.ft, { home: 2, away: 1 });
  assert.equal(conflictedMatch?.status, 'finished');
  assert.throws(() => buildTursoCollectorSnapshot(empty, [{ name: 'Premier League', state: 'error', records: [] }], fixedDate), /nije uspešno preuzet/);
});

test('collector rejects stale feeds and unresolved matches in the past before writing', () => {
  const stale = observation({ matchDate: '2026-09-20', status: 'finished', ht: { home: 0, away: 0 }, ft: { home: 1, away: 0 } });
  assert.throws(() => validateCollectorFreshness(dataset(stale), fixedDate), /nema sveže završene rezultate/);
  assert.throws(() => buildTursoCollectorSnapshot(snapshotFromMatches([], fixedDate), dataset(stale), fixedDate), /nije promenjen/);
  const staleSet = filterStaleCollectorDatasets(dataset(stale), fixedDate)[0];
  assert.equal(staleSet.state, 'unavailable');
  assert.equal(staleSet.records.length, 0);
  assert.match(staleSet.reason || '', /Skup isključen/);
  const duplicateRecent = recentResults()[0];
  assert.throws(() => validateCollectorFreshness(dataset(duplicateRecent, duplicateRecent, duplicateRecent), fixedDate), /nema sveže završene rezultate/);
  const pastWithoutResult = observation({ matchDate: '2026-11-25', status: 'unknown' });
  const plan = buildTursoCollectorSnapshot(snapshotFromMatches([], fixedDate), dataset(...recentResults(), pastWithoutResult, observation()), fixedDate);
  assert.equal(plan.summary.rejected, 1);
  assert.equal(plan.snapshot.matches.some(match => match.date === '2026-11-25' && match.homeTeam === 'Arsenal'), false);
});

const makeResponse = () => ({
  statusCode: 200, headers: {} as Record<string, string>, body: '',
  setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; },
  end(value = '') { this.body = value; },
});
const call = async (handler: (req: any, res: any, action: any) => Promise<void>, url: string, method: string, body?: unknown, auth?: string) => {
  const request = Object.assign(Readable.from(body === undefined ? [] : [JSON.stringify(body)]), { url, method, headers: { authorization: auth } });
  const response = makeResponse();
  await handler(request as any, response as any, new URL(url, 'https://eliteviptips.com').searchParams.get('action'));
  return { ...response, json: response.body ? JSON.parse(response.body) : null };
};

test('collector API is OIDC-gated, Neon-independent, and repeated daily ingest performs no second write', async () => {
  const auth = 'Bearer trusted-workflow';
  const empty = snapshotFromMatches([], fixedDate);
  let record: { snapshot: PublicSnapshot; version: string; updatedAt: string } | null = null;
  let writes = 0, neonCalls = 0;
  const collector = createPublicCollectorHandler({
    authorize: async request => request.headers.authorization === auth,
    enabled: () => true,
    readSelected: () => true,
    readConfig: () => ({ deployment: 'production', configured: true, url: 'libsql://test.turso.io', authToken: 'read' }),
    writeConfig: () => ({ deployment: 'production', configured: true, url: 'libsql://test.turso.io', authToken: 'write' }),
    readSnapshot: async () => record,
    writeSnapshot: async (snapshot, expected) => {
      assert.equal(expected.version, record?.version ?? null);
      assert.equal(expected.updatedAt, record?.updatedAt ?? null);
      writes++;
      record = { snapshot, version: publicSnapshotVersion(snapshot), updatedAt: fixedDate.toISOString() };
      return { provider: 'turso', verified: true, version: record.version, matchCount: snapshot.matches.length };
    },
    fallback: () => empty,
    clock: () => fixedDate,
  });
  const api = createAnalyticsHandler(async () => false, async () => { neonCalls++; throw new Error('Neon must remain unused'); }, () => false, undefined, collector);

  const denied = await call(api as any, '/api/football-analytics?action=public-sync-status', 'GET');
  assert.equal(denied.statusCode, 403);
  const status = await call(api as any, '/api/football-analytics?action=public-sync-status', 'GET', undefined, auth);
  assert.equal(status.statusCode, 200);
  assert.equal(status.json.snapshotAvailable, false);

  const body = { datasets: dataset(...recentResults(), observation()) };
  const ingested = await call(api as any, '/api/football-analytics?action=public-sync-ingest', 'POST', body, auth);
  assert.equal(ingested.statusCode, 200);
  assert.equal(ingested.json.created, 4);
  assert.equal(ingested.json.snapshotWrite.verified, true);
  assert.equal(writes, 1);
  const repeated = await call(api as any, '/api/football-analytics?action=public-sync-ingest', 'POST', body, auth);
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.json.skipped, true);
  assert.equal(writes, 1);
  const verifiedStatus = await call(api as any, '/api/football-analytics?action=public-sync-status', 'GET', undefined, auth);
  assert.equal(verifiedStatus.json.alreadySynced, true);
  assert.equal(verifiedStatus.json.snapshotVerified, true);
  assert.equal(neonCalls, 0);
});

test('collector API rejects duplicate action parameters and non-POST ingest', async () => {
  const handler = createPublicCollectorHandler({ authorize: async () => true });
  const duplicate = await call(handler, '/?action=public-sync-status&action=public-sync-ingest', 'GET');
  assert.equal(duplicate.statusCode, 400);
  const method = await call(handler, '/?action=public-sync-ingest', 'GET');
  assert.equal(method.statusCode, 405);
});

test('fallback-derived IDs are stable for an unchanged fixture identity', () => {
  const value = observation();
  const a = buildTursoCollectorSnapshot(snapshotFromMatches([], fixedDate), dataset(...recentResults(), value), fixedDate).snapshot.matches.find(match => match.homeTeam === value.home.name)!;
  const b = buildTursoCollectorSnapshot(snapshotFromMatches([], fixedDate), dataset(...recentResults(), value), fixedDate).snapshot.matches.find(match => match.homeTeam === value.home.name)!;
  assert.equal(a.id, b.id);
  assert.equal(a.id, hashId('openfootball-public', englishLeague(value.league.name)!.id, value.season, 'arsenal', 'chelsea'));
});
