import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalOpenFootballFallback } from '../server/publicFootball/localOpenFootballFallback.ts';
import { publicSnapshotCache } from '../server/publicFootball/store.ts';
import { createPublicFootballHandler } from '../server/publicFootball/http.ts';

test('database outage serves a labelled real fallback to HTML, API, and sitemap routes', async () => {
  const fallback = buildLocalOpenFootballFallback();
  const finishedCount = fallback.matches.filter((match) => match.status === 'finished').length;
  let attempts = 0;
  const cache = publicSnapshotCache(async () => {
    attempts += 1;
    throw new Error('database secret must not be rendered');
  }, 60_000, 30_000, fallback);
  const handler = createPublicFootballHandler(() => cache.readWithStatus(), () => new Date('2026-11-25T12:00:00Z'));
  const call = async (url: string) => {
    const response: any = { statusCode: 0, headers: {}, body: '', setHeader(key: string, value: string) { this.headers[key] = value; }, end(value: string) { this.body = value; } };
    await handler({ url, method: 'GET' } as any, response);
    return response;
  };

  const html = await call('/api/public-football?page=overview');
  assert.equal(html.statusCode, 200);
  assert.equal(html.headers['X-Data-Freshness'], 'stale');
  assert.match(html.body, /Prikaz poslednjih sačuvanih podataka/);
  assert.match(html.body, /2026/);
  assert(!html.body.includes('database secret'));

  const api = await call('/api/public-football?action=overview');
  assert.equal(api.statusCode, 200);
  assert.equal(JSON.parse(api.body).aggregate.finished, finishedCount);
  assert.equal(api.headers['X-Data-Freshness'], 'stale');

  const sitemap = await call('/api/public-football?page=sitemap');
  assert.equal(sitemap.statusCode, 200);
  assert.match(sitemap.headers['Content-Type'], /application\/xml/);
  assert.match(sitemap.body, /<sitemapindex/);
  assert.equal(attempts, 1);

  cache.clear();
  const afterClear = await cache.readWithStatus();
  assert.equal(afterClear.stale, true);
  assert.equal(afterClear.snapshot.matches.length, fallback.matches.length);
  assert.equal(attempts, 2);
});
