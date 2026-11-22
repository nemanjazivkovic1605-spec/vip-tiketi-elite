import test from 'node:test';
import assert from 'node:assert/strict';
import { withRequestTimeout } from '../src/utils/async.ts';
import { footballApiService, SUPPORTED_COMPETITIONS } from '../src/services/footballApiService.ts';
import { pitchMatchesService } from '../src/services/pitchMatchesService.ts';

const rawMatch = (extra: Record<string, unknown> = {}) => ({
  id: 1, utcDate: '2026-11-21T19:00:00Z', status: 'FINISHED',
  homeTeam: { name: 'Home' }, awayTeam: { name: 'Away' }, competition: { code: 'PL', name: 'Premier League' },
  score: { fullTime: { home: 2, away: 0 } }, ...extra,
});
const publicMatch = { id: 'pitchapi:m_Real12', pitchMatchId: 'm_Real12', source: 'pitchapi', homeTeam: 'Other Home',
  awayTeam: 'Other Away', league: 'Championship', date: '2026-11-21', time: '20:00', status: 'FINISHED' };

async function withBrowser(fetcher: typeof fetch, run: () => Promise<void>, storageBlocked = false) {
  const originalFetch = globalThis.fetch;
  const descriptors = new Map(['window', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://eliteviptips.test' } } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() {
    if (storageBlocked) throw new DOMException('Storage blocked', 'SecurityError');
    return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value) };
  } });
  globalThis.fetch = fetcher;
  try { await run(); }
  finally {
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('request timeout aborts the transport and also bounds an unresponsive response body', async () => {
  let active: AbortSignal | undefined;
  await assert.rejects(withRequestTimeout(async signal => {
    active = signal;
    return new Promise(() => {});
  }, { timeoutMs: 15 }), /Ucitavanje traje predugo/);
  assert.equal(active?.aborted, true);
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(withRequestTimeout(async () => { called = true; }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(called, false);
});

test('a stalled Pitch request cannot hide successful fallback fixtures forever', async () => {
  let stalled: AbortSignal | undefined;
  await withBrowser((async (input, init) => {
    if (String(input).includes('pitch-matches')) {
      stalled = init?.signal as AbortSignal;
      return new Promise(() => {});
    }
    return Response.json({ matches: [rawMatch()] });
  }) as typeof fetch, async () => {
    const result = await pitchMatchesService.getMatchesForDate('2026-11-21', { timeoutMs: 20 });
    assert.equal(result.pitchAvailable, false);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].homeTeam, 'Home');
    assert.equal(stalled?.aborted, true);
  });
});

test('a stalled fallback cannot hide successful Pitch fixtures forever', async () => {
  await withBrowser((async input => String(input).includes('pitch-matches')
    ? Response.json({ source: 'pitchapi', matches: [publicMatch] }) : new Promise(() => {})) as typeof fetch, async () => {
    const result = await pitchMatchesService.getMatchesForDate('2026-11-21', { timeoutMs: 20 });
    assert.equal(result.pitchAvailable, true);
    assert.deepEqual(result.matches, [publicMatch]);
  });
});

test('changing dates cancels both source requests instead of returning an empty successful feed', async () => {
  const signals: AbortSignal[] = [];
  await withBrowser((async (_input, init) => {
    signals.push(init!.signal as AbortSignal);
    return new Promise(() => {});
  }) as typeof fetch, async () => {
    const controller = new AbortController();
    const pending = pitchMatchesService.getMatchesForDate('2026-11-21', { signal: controller.signal });
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    await rejected;
    assert.equal(signals.length, 2);
    assert.ok(signals.every(signal => signal.aborted));
  });
});

test('browser storage denial never discards successfully fetched results or breaks cache fallback', async () => {
  await withBrowser((async () => Response.json({ matches: [rawMatch()] })) as typeof fetch, async () => {
    assert.equal((await footballApiService.fetchMatches()).length, 1);
    assert.equal((await footballApiService.fetchFinishedMatchesByDateRange('2026-11-20', '2026-11-21')).length, SUPPORTED_COMPETITIONS.length);
    assert.deepEqual(footballApiService.getCachedOrMockMatches(), []);
    assert.deepEqual(footballApiService.getFetchIssues(), []);
  }, true);
});

test('match mapping preserves genuine zero scores, omits incomplete scores and rejects malformed fixtures', async () => {
  await withBrowser((async () => Response.json({ matches: [rawMatch(),
    rawMatch({ id: 2, source: 'OpenLigaDB', score: { fullTime: { home: 0, away: 0 } } }),
    rawMatch({ id: 3, score: { fullTime: { home: 2, away: null } } }),
    rawMatch({ id: 4, score: { fullTime: { home: '2', away: 1 } } }),
    rawMatch({ id: 5, utcDate: 'invalid' }), rawMatch({ id: null }), rawMatch({ homeTeam: {} }), null,
  ] })) as typeof fetch, async () => {
    const rows = await footballApiService.fetchMatches();
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0].score, { home: 2, away: 0 });
    assert.deepEqual(rows[1].score, { home: 0, away: 0 });
    assert.equal(rows[1].source, 'OpenLigaDB');
    assert.equal(rows[2].score, undefined);
    assert.equal(rows[3].score, undefined);
  });
});

test('xG validates complete finite nonnegative numbers while preserving true zero and allowing retries after failure', async () => {
  let response: unknown = { xg: { home: 'bad', away: 1 } };
  await withBrowser((async () => Response.json(response)) as typeof fetch, async () => {
    await assert.rejects(pitchMatchesService.getMatchXg('m_Real12'), /xG trenutno nije dostupan/);
    response = { xg: { home: 0, away: 1.25 } };
    assert.deepEqual(await pitchMatchesService.getMatchXg('m_Real12'), { home: 0, away: 1.25 });
    response = { xg: null };
    assert.equal(await pitchMatchesService.getMatchXg('m_Real12'), null);
  });
});

test('a stalled JSON body and failure of both sources stop loading with a bounded error', async () => {
  await withBrowser((async () => {
    const response = Response.json({});
    response.json = () => new Promise(() => {});
    return response;
  }) as typeof fetch, async () => {
    await assert.rejects(pitchMatchesService.getMatchesForDate('2026-11-21', { timeoutMs: 20 }), /Izvori fudbalskih utakmica trenutno nisu dostupni/);
  });
});
