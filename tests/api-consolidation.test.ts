import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFileSync, readdirSync } from 'node:fs';
import { createApiDispatcher, type ApiHandler } from '../server/http/apiDispatcher.ts';
import { createSeedHandler } from '../server/worldCup/seedHandler.ts';
import { createResultsHandler } from '../server/worldCup/resultsHandler.ts';
import { createFootballDataHandler } from '../server/footballProviders/footballDataHandler.ts';
import { createFixtureResultHandler } from '../server/footballProviders/fixtureResultHandler.ts';
import worldCup from '../api/world-cup.ts';
import footballProviders from '../api/football-providers.ts';
import { SportsApiError } from '../server/sportsApi.ts';

const request = (url: string, method = 'GET', body?: unknown, authorization?: string) =>
  Object.assign(Readable.from([]), { url, method, body, headers: { authorization } });

async function call(handler: ApiHandler, req: ReturnType<typeof request>) {
  const response = {
    statusCode: 200, headers: {} as Record<string, string>, body: '',
    setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value; },
    end(body: string) { this.body = body; },
  };
  await handler(req as any, response as any);
  return { ...response, json: JSON.parse(response.body) };
}

const originalSecret = process.env.CRON_SECRET;
test.before(() => { process.env.CRON_SECRET = 'isolated-test-cron'; });
test.after(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

const dispatchWorldCup = (seed: ApiHandler, results: ApiHandler) => createApiDispatcher({
  endpoint: '/api/world-cup',
  aliases: { '/api/world-cup-seed': 'seed', '/api/world-cup-results': 'results' },
  handlers: { seed: async () => ({ default: seed }), results: async () => ({ default: results }) },
});

test('world-cup legacy URLs preserve GET/POST, date queries, result bodies and cron auth', async () => {
  const dates: string[] = [];
  let results = 0;
  const seedResult = { date: '2026-06-19', created: 3, free: 1, vip: 2 };
  const resultResult = { checked: 3, updated: 2 };
  const seed = createSeedHandler({ upsertWorldCupPicks: async date => { dates.push(date); return seedResult; }, logCron: async () => {} } as any);
  const finish = createResultsHandler({ updateWorldCupResults: async () => { results++; return resultResult; }, logCron: async () => {} } as any);
  const handler = dispatchWorldCup(seed, finish);
  for (const method of ['GET', 'POST']) {
    const response = await call(handler, request('/api/world-cup-seed?date=2026-06-19&action=results', method, { untouched: true }, 'Bearer isolated-test-cron'));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, seedResult);
    assert.match(response.headers['content-type'], /application\/json/);
    const result = await call(handler, request('/api/world-cup-results?date=2026-06-19&action=seed', method, undefined, 'Bearer isolated-test-cron'));
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.json, resultResult);
  }
  assert.deepEqual(dates, ['2026-06-19', '2026-06-19']);
  assert.equal(results, 2);
  for (const path of ['/api/world-cup-seed', '/api/world-cup-results']) {
    assert.deepEqual((await call(handler, request(path))).json, { error: 'Cron authorization required.' });
    assert.equal((await call(handler, request(path))).statusCode, 401);
    assert.equal((await call(handler, request(path, 'PATCH'))).statusCode, 405);
  }
  assert.equal(dates.length, 2, 'unauthorized calls never write or seed');
});

test('World Cup errors retain their status and log the original operation, without hiding errors when logging fails', async () => {
  const logs: unknown[] = [];
  const fail = async () => { throw new Error('isolated provider failure'); };
  const logCron = async value => { logs.push(value); throw new Error('isolated log failure'); };
  const handler = dispatchWorldCup(
    createSeedHandler({ upsertWorldCupPicks: fail, logCron } as any),
    createResultsHandler({ updateWorldCupResults: fail, logCron } as any),
  );
  const auth = 'Bearer isolated-test-cron';
  const seed = await call(handler, request('/api/world-cup-seed?date=2026-06-20', 'POST', {}, auth));
  assert.equal(seed.statusCode, 502);
  assert.deepEqual(seed.json, { error: 'isolated provider failure', date: '2026-06-20' });
  const results = await call(handler, request('/api/world-cup-results', 'GET', undefined, auth));
  assert.equal(results.statusCode, 502);
  assert.deepEqual(results.json, { error: 'isolated provider failure' });
  assert.deepEqual(logs, [
    { action: 'seed', status: 'error', message: 'isolated provider failure', details: { date: '2026-06-20' } },
    { action: 'results', status: 'error', message: 'isolated provider failure' },
  ]);
});

test('football-data keeps query validation, GET-only methods, response shape and cache headers', async () => {
  const payload = { matches: [{ id: 17, homeTeam: { name: 'Test Home' } }] };
  const queries: unknown[] = [];
  const provider = createFootballDataHandler(async (path, params) => { queries.push({ path, params }); return payload; });
  const handler = createApiDispatcher({ endpoint: '/api/football-providers', aliases: { '/api/football-data': 'football-data' }, handlers: { 'football-data': async () => ({ default: provider }) } });
  const response = await call(handler, request('/api/football-data?path=/competitions/PL/matches&dateFrom=2026-11-20&dateTo=2026-11-21&status=SCHEDULED&action=fetch-fixture-result'));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json, payload);
  assert.deepEqual(queries, [{ path: '/competitions/PL/matches', params: { dateFrom: '2026-11-20', dateTo: '2026-11-21', status: 'SCHEDULED' } }]);
  assert.equal(response.headers['cache-control'], 'public, s-maxage=120, stale-while-revalidate=180');
  assert.equal((await call(handler, request('/api/football-data', 'POST'))).statusCode, 405);
  assert.equal((await call(handler, request('/api/football-data?path=/secret'))).statusCode, 400);
  assert.equal((await call(handler, request('/api/football-data?dateFrom=2026-02-30'))).statusCode, 400);
  const broken = createFootballDataHandler(async () => { throw new SportsApiError('Test upstream unavailable.', 503); });
  const failure = await call(broken, request('/api/football-data'));
  assert.equal(failure.statusCode, 503);
  assert.deepEqual(failure.json, { error: 'Test upstream unavailable.' });
  assert.equal(failure.headers['cache-control'], 'no-store');
});

test('fixture-result retains admin protection, parsed and streamed bodies and result shape', async () => {
  const lookups: unknown[] = [];
  const fixture = { fixtureId: 9, homeScore: 2, awayScore: 1, finished: true };
  const provider = createFixtureResultHandler({
    isAdminRequest: async req => req.headers.authorization === 'Bearer isolated-admin',
    findFixtureResult: async lookup => { lookups.push(lookup); return fixture; },
  } as any);
  const handler = createApiDispatcher({
    endpoint: '/api/football-providers', aliases: { '/api/fetch-fixture-result': 'fetch-fixture-result' },
    handlers: { 'fetch-fixture-result': async () => ({ default: provider }) },
  });
  const url = '/api/fetch-fixture-result?action=football-data&date=2026-11-20';
  assert.equal((await call(handler, request(url, 'POST', {}))).statusCode, 403);
  assert.equal((await call(handler, request(url))).statusCode, 405);
  const body = { homeTeam: ' Test Home ', awayTeam: 'Test Away', fixtureId: 9, league: 'PL', date: '2026-11-20' };
  const req = request(url, 'POST', body, 'Bearer isolated-admin');
  const response = await call(handler, req);
  assert.equal(req.body, body);
  assert.equal(req.url, url);
  assert.deepEqual(response.json, { result: fixture });
  const streamed = Object.assign(Readable.from([JSON.stringify(body)]), { url, method: 'POST', headers: { authorization: 'Bearer isolated-admin' } });
  assert.equal((await call(handler, streamed as any)).statusCode, 200);
  assert.equal(lookups.length, 2);
  assert.deepEqual(lookups[0], { fixtureId: '9', league: 'PL', date: '2026-11-20', homeTeam: 'Test Home', awayTeam: 'Test Away' });
  assert.equal((await call(handler, request(url, 'POST', {}, 'Bearer isolated-admin'))).statusCode, 400);
  const missing = createFixtureResultHandler({ isAdminRequest: async () => true, findFixtureResult: async () => null });
  assert.deepEqual((await call(missing, request(url, 'POST', body))).json, { result: null });
  const broken = createFixtureResultHandler({ isAdminRequest: async () => true, findFixtureResult: async () => { throw new Error('test result failure'); } });
  assert.equal((await call(broken, request(url, 'POST', body))).statusCode, 502);
});

test('dispatcher imports only its selected handler and never consumes, clones or replaces the request', async () => {
  const loaded: string[] = [];
  const req = request('/api/combined?action=one&date=2026-11-20&tag=a&tag=b', 'POST', { preserved: true }, 'Bearer test');
  const handler = createApiDispatcher({ endpoint: '/api/combined', aliases: {}, handlers: {
    one: async () => { loaded.push('one'); return { default: async (seen, res) => {
      assert.equal(seen, req);
      res.end(JSON.stringify({ url: seen.url, body: (seen as any).body, auth: seen.headers.authorization }));
    } }; },
    two: async () => { loaded.push('two'); throw new Error('must stay unloaded'); },
  } });
  assert.deepEqual((await call(handler, req)).json, { url: req.url, body: req.body, auth: req.headers.authorization });
  assert.deepEqual(loaded, ['one']);
  for (const action of ['', 'bad', '__proto__', 'constructor', 'one&action=two', 'one&action=one']) {
    assert.equal((await call(handler, request(`/api/combined?action=${action}`))).statusCode, 400);
  }
  assert.equal((await call(handler, request('/api/not-a-route?action=one'))).statusCode, 404);
  assert.deepEqual(loaded, ['one']);
});

test('real entrypoints preserve legacy unauthorized/method responses without upstream or database access', async () => {
  for (const path of ['/api/world-cup-seed', '/api/world-cup-results']) {
    assert.equal((await call(worldCup, request(`${path}?action=__proto__`))).statusCode, 401);
    assert.equal((await call(worldCup, request(path, 'DELETE'))).statusCode, 405);
  }
  assert.equal((await call(footballProviders, request('/api/fetch-fixture-result?action=football-data', 'POST', {}))).statusCode, 403);
  assert.equal((await call(footballProviders, request('/api/pitch-matches', 'POST'))).statusCode, 405);
  assert.equal((await call(footballProviders, request('/api/football-data', 'POST'))).statusCode, 405);
  assert.equal((await call(worldCup, request('/api/world-cup?action=seed&action=results'))).statusCode, 400);
});

test('Vercel rewrites keep all five aliases before SPA, preserve SEO and cron paths, and leave nine entrypoints', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const aliases = {
    '/api/world-cup-seed': '/api/world-cup?action=seed', '/api/world-cup-results': '/api/world-cup?action=results',
    '/api/football-data': '/api/football-providers?action=football-data', '/api/pitch-matches': '/api/football-providers?action=pitch-matches',
    '/api/fetch-fixture-result': '/api/football-providers?action=fetch-fixture-result',
  };
  const spa = config.rewrites.findIndex(rule => rule.destination === '/index.html');
  const spaPattern = new RegExp(`^${config.rewrites[spa].source}$`);
  assert.equal(spaPattern.test('/api/not-a-real-route'), false);
  assert.equal(spaPattern.test('/api'), false);
  assert.equal(spaPattern.test('/history'), true);
  assert.equal(spaPattern.test('/login'), true);
  for (const [source, destination] of Object.entries(aliases)) {
    const index = config.rewrites.findIndex(rule => rule.source === source);
    assert.ok(index >= 0 && index < spa);
    assert.equal(config.rewrites[index].destination, destination);
  }
  assert.equal(config.rewrites.find(rule => rule.source === '/sitemap.xml').destination, '/api/football-analytics?public=1&page=sitemap');
  assert.ok(readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8').includes('Sitemap:'));
  assert.deepEqual(config.crons, [
    { path: '/api/football-analytics?action=sync', schedule: '17 5 * * *' },
    { path: '/api/daily-picks', schedule: '0 8 * * *' }, { path: '/api/daily-results', schedule: '30 23 * * *' },
  ]);
  assert.equal(readdirSync(new URL('../api/', import.meta.url)).filter(name => name.endsWith('.ts')).length, 9);
});
