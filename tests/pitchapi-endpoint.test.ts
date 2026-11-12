import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/pitch-matches.ts';

const call = async (url: string, method = 'GET') => {
  const response = {
    statusCode: 200, headers: {} as Record<string, string>, body: '',
    setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value; },
    end(body: string) { this.body = body; },
  };
  await handler({ method, url } as any, response as any);
  return { ...response, json: JSON.parse(response.body) };
};

const withProvider = async (fetcher: typeof fetch, run: () => Promise<void>, key: string | null = 'synthetic-pitch-key') => {
  const beforeFetch = globalThis.fetch, beforeKey = process.env.PITCHAPI_API_KEY;
  if (key === null) delete process.env.PITCHAPI_API_KEY;
  else process.env.PITCHAPI_API_KEY = key;
  globalThis.fetch = fetcher;
  try { await run(); }
  finally {
    globalThis.fetch = beforeFetch;
    if (beforeKey === undefined) delete process.env.PITCHAPI_API_KEY;
    else process.env.PITCHAPI_API_KEY = beforeKey;
  }
};

const rawMatch = (id: string, time: string) => ({
  id, time_utc: time, status: 'not_started', score_home: null, score_away: null,
  home_team: { name: 'Home' }, away_team: { name: 'Away' }, league: { name: 'Championship' },
});

test('date endpoint requests upcoming and played fixtures, including the previous UTC day', async () => {
  const calls: string[] = [];
  await withProvider((async (input, options) => {
    const url = new URL(String(input));
    calls.push(String(url));
    assert.equal(url.origin, 'https://api.pitchapi.dev');
    assert.equal(url.searchParams.get('status'), 'all');
    assert.equal((options?.headers as Record<string, string>)['X-API-KEY'], 'synthetic-pitch-key');
    return Response.json({ data: { matches: url.pathname.endsWith('2026-11-11')
      ? [rawMatch('m_Night1', '2026-11-11T23:30:00Z')]
      : [rawMatch('m_Next12', '2026-11-12T20:00:00Z'), rawMatch('m_Other1', '2026-11-12T23:30:00Z')] } });
  }) as typeof fetch, async () => {
    const first = await call('/api/pitch-matches?date=2026-11-12');
    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.json.matches.map((m: any) => m.pitchMatchId), ['m_Night1', 'm_Next12']);
    assert.equal(first.json.matches[0].time, '00:30');
    assert.equal(first.json.matches[1].status, 'SCHEDULED');
    assert.equal(first.json.matches[1].score, undefined);
    assert.equal(first.body.includes('synthetic-pitch-key'), false);
    assert.equal(calls.length, 2);
    await call('/api/pitch-matches?date=2026-11-12');
    assert.equal(calls.length, 2, 'repeated requests reuse the server cache');
  });
});

test('missing key and invalid input fail without calling an upstream provider', async () => {
  await withProvider((async () => { throw new Error('must not call upstream'); }) as typeof fetch, async () => {
    assert.equal((await call('/api/pitch-matches?date=2026-11-12')).statusCode, 503);
    assert.equal((await call('/api/pitch-matches?date=2026-02-30')).statusCode, 400);
    assert.equal((await call('/api/pitch-matches?date=2026-11-12&matchId=m_Next12')).statusCode, 400);
    assert.equal((await call('/api/pitch-matches?matchId=https://example.com')).statusCode, 400);
    assert.equal((await call('/api/pitch-matches?date=2026-11-12', 'POST')).statusCode, 405);
  }, null);
});

test('malformed successful responses are not reported as an empty available feed', async () => {
  await withProvider((async () => Response.json({ data: { unrelated: [] } })) as typeof fetch, async () => {
    const response = await call('/api/pitch-matches?date=2026-12-02');
    assert.equal(response.statusCode, 502);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.json.matches, undefined);
  });
});

test('xG is fetched on demand, preserves a real zero and returns null for unavailable values', async () => {
  await withProvider((async input => {
    const path = new URL(String(input)).pathname;
    assert.match(path, /^\/v1\/matches\/m_[A-Za-z0-9]{6}\/stats$/);
    return Response.json({ data: { periods: [{ period: 'All', groups: [{ items: [{
      key: 'expected_goals', home: path.includes('m_XgZero') ? '0.00' : '  ', away: '1.25',
    }] }] }] } });
  }) as typeof fetch, async () => {
    assert.deepEqual((await call('/api/pitch-matches?matchId=m_XgZero')).json.xg, { home: 0, away: 1.25 });
    assert.equal((await call('/api/pitch-matches?matchId=m_XgMiss')).json.xg, null);
  });
});

test('provider failures remain errors and are not cached as valid fixture data', async () => {
  let calls = 0;
  await withProvider((async () => { calls++; return new Response('', { status: 429 }); }) as typeof fetch, async () => {
    const response = await call('/api/pitch-matches?date=2026-12-04');
    assert.equal(response.statusCode, 502);
    assert.equal(response.headers['cache-control'], 'no-store');
    await call('/api/pitch-matches?date=2026-12-04');
    assert.equal(calls, 4);
  });
});
