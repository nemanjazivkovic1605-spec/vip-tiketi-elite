import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalOpenFootballFallback } from '../server/publicFootball/localOpenFootballFallback.ts';
import { publicSnapshotCache } from '../server/publicFootball/store.ts';

test('local OpenFootball recovery data keeps real provenance and exact score coverage', () => {
  const snapshot = buildLocalOpenFootballFallback();

  assert.equal(snapshot.matches.length, 2792);
  assert.equal(snapshot.matches.filter((match) => match.ft.home !== null && match.ft.away !== null).length, 2792);
  assert.equal(snapshot.matches.filter((match) => match.ht.home !== null && match.ht.away !== null).length, 2653);
  assert.deepEqual(snapshot.leagues.map((league) => league.name).sort(), ['Championship', 'League One', 'League Two']);
  assert.ok(snapshot.matches.every((match) => match.sources.length === 1 && match.sources[0] === 'openfootball'));
  assert.ok(snapshot.matches.every((match) => match.kickoffAt === null));
  assert.equal(snapshot.lastUpdatedAt, null);
  assert.equal(snapshot.loadedAt, '2026-11-14T00:00:00.000Z');
});

test('database outage serves the bounded local snapshot as stale and opens retry circuit', async () => {
  const fallback = buildLocalOpenFootballFallback();
  let attempts = 0;
  const cache = publicSnapshotCache(async () => {
    attempts++;
    throw new Error('Neon unavailable');
  }, 60_000, 30_000, fallback);

  const result = await cache.readWithStatus();

  assert.equal(result.stale, true);
  assert.equal(result.snapshot.matches.length, 2792);
  assert.equal(attempts, 1);
  assert.equal(cache.stats().circuitOpen, true);

  const second = await cache.readWithStatus();
  assert.equal(second.stale, true);
  assert.equal(attempts, 1);
});
