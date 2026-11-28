import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRetryChunkLoad } from '../src/components/errors/AppErrorBoundary.js';

test('a stale lazy chunk triggers one reload, then leaves the manual fallback', () => {
  const error = new TypeError('Failed to fetch dynamically imported module: /assets/FootballAnalytics-old.js');
  assert.equal(shouldRetryChunkLoad(error, null, 100_000), true);
  assert.equal(shouldRetryChunkLoad(error, '100000', 100_001), false);
  assert.equal(shouldRetryChunkLoad(error, '100000', 160_001), true);
});

test('ordinary render errors never trigger a page reload', () => {
  assert.equal(shouldRetryChunkLoad(new Error('Cannot read properties of undefined'), null, 100_000), false);
  assert.equal(shouldRetryChunkLoad(new Error('Importing a module script failed'), '100000', 100_100), false);
});
