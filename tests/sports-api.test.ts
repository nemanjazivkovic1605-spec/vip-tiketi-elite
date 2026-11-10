import test from 'node:test';
import assert from 'node:assert/strict';
import { requestSports, getSportsKey, SportsApiError } from '../server/sportsApi.ts';
import { resolveFootballData } from '../server/footballData.ts';

test('server keeps provider keys separate, handles API-level errors, and shares cached requests', async (t) => {
  process.env.API_FOOTBALL_KEY = 'sports-unit-test';
  process.env.API_BASKETBALL_KEY = 'basket-unit-test';
  process.env.FOOTBALL_DATA_API_KEY = 'football-data-unit-test';
  process.env.SPORTS_API_INTERVAL_MS = '0';
  assert.equal(getSportsKey('basketball'), 'basket-unit-test');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (input: URL, init: RequestInit) => {
    calls++;
    const url = new URL(input);
    assert.equal(url.hostname, 'v3.football.api-sports.io');
    assert.equal((init.headers as any)['x-apisports-key'], 'sports-unit-test');
    assert.equal(url.searchParams.has('key'), false);
    return Response.json({ response: [{ id: 7 }], errors: {}, paging: { current: 1, total: 1 } });
  });
  const [first, second] = await Promise.all([requestSports('/fixtures', { date: '2099-11-01' }), requestSports('/fixtures', { date: '2099-11-01' })]);
  assert.deepEqual(first, second);
  assert.equal(calls, 1);
  await requestSports('/fixtures', { date: '2099-11-01' });
  assert.equal(calls, 1);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ response: [], errors: { plan: 'restricted sports-unit-test' } }));
  await assert.rejects(requestSports('/fixtures', { date: '2099-11-02' }), (error: any) => error instanceof SportsApiError && !error.message.includes('sports-unit-test'));
  t.mock.restoreAll();
});

test('uses football-data token only with football-data.org when API-Sports rejects the current season', async (t) => {
  process.env.API_FOOTBALL_KEY = 'sports-unit-test';
  process.env.FOOTBALL_DATA_API_KEY = 'football-data-unit-test';
  process.env.SPORTS_API_INTERVAL_MS = '0';
  const providers: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: URL, init: RequestInit) => {
    const url = new URL(input); providers.push(url.hostname);
    if (url.hostname === 'v3.football.api-sports.io') return Response.json({ response: [], errors: { plan: 'not available' } });
    assert.equal(url.hostname, 'api.football-data.org');
    assert.equal(url.pathname, '/v4/matches');
    assert.equal((init.headers as any)['X-Auth-Token'], 'football-data-unit-test');
    assert.equal((init.headers as any)['x-apisports-key'], undefined);
    return Response.json({ matches: [{ id: 9 }] });
  });
  const result = await resolveFootballData('/matches', { dateFrom: '2099-11-03', dateTo: '2099-11-03' });
  assert.deepEqual(result.matches, [{ id: 9 }]);
  assert.deepEqual(providers, ['v3.football.api-sports.io', 'api.football-data.org']);
});
