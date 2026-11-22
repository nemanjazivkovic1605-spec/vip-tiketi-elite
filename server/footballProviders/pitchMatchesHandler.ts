import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { mapPitchMatch, extractPitchXg } from '../pitchApi.js';
import { validDate } from '../sportsApi.js';

const BASE_URL = 'https://api.pitchapi.dev';
const cache = new Map<string, { expiresAt: number; task: Promise<unknown> }>();
const pitchKey = () => process.env.PITCHAPI_API_KEY?.trim() || process.env.PITCHAPI_KEY?.trim();

const previousDate = (date: string) => {
  const day = new Date(date + 'T12:00:00Z');
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
};

async function readPitch(path: string, ttlMs: number): Promise<unknown> {
  const key = pitchKey();
  if (!key) throw new Error('not_configured');
  const cacheKey = createHash('sha256').update(key).digest('hex') + ':' + path;
  const existing = cache.get(cacheKey);
  if (existing && existing.expiresAt > Date.now()) return existing.task;
  const task = fetch(new URL(path, BASE_URL), {
    headers: { 'X-API-KEY': key },
    signal: AbortSignal.timeout(10000),
  }).then(async (response) => {
    if (!response.ok) throw new Error('upstream_' + response.status);
    const payload: unknown = await response.json();
    const root = dataObject(payload), data = dataObject(root?.data);
    if (!root || root.error || !data || path.startsWith('/v1/date/') && !Array.isArray(data.matches)) {
      throw new Error('invalid_upstream_data');
    }
    if ([root, data].some(item => item.environment === 'test' || item.is_test === true)) throw new Error('test_data');
    return payload;
  }).catch((error) => {
    if (cache.get(cacheKey)?.task === task) cache.delete(cacheKey);
    throw error;
  });
  if (cache.size > 100) cache.clear();
  cache.set(cacheKey, { expiresAt: Date.now() + ttlMs, task });
  return task;
}

const dataObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.end(JSON.stringify({ error: 'Method not allowed.' }));
    return;
  }
  response.setHeader('Cache-Control', 'no-store');
  const url = new URL(request.url || '/', 'https://eliteviptips.com');
  const date = url.searchParams.get('date');
  const matchId = url.searchParams.get('matchId');
  if (Boolean(date) === Boolean(matchId) || date && !validDate(date) || matchId && !/^m_[A-Za-z0-9]{6}$/.test(matchId)) {
    response.statusCode = 400;
    response.end(JSON.stringify({ error: 'Neispravan datum ili ID utakmice.' }));
    return;
  }
  if (!pitchKey() || pitchKey()!.startsWith('pk_test_')) {
    response.statusCode = 503;
    response.end(JSON.stringify({ error: 'PitchAPI nije aktiviran.' }));
    return;
  }
  try {
    if (matchId) {
      const payload = await readPitch('/v1/matches/' + matchId + '/stats', 30 * 60_000);
      const xg = extractPitchXg(payload);
      response.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=600');
      response.end(JSON.stringify({ xg }));
      return;
    }
    const days = [date!, previousDate(date!)];
    const results = await Promise.allSettled(days.map((day) => readPitch('/v1/date/' + day + '?status=all', 5 * 60_000)));
    const fulfilled = results.filter((item): item is PromiseFulfilledResult<unknown> => item.status === 'fulfilled');
    if (!fulfilled.length) throw (results.find(item => item.status === 'rejected') as PromiseRejectedResult).reason;
    const unique = new Map<string, ReturnType<typeof mapPitchMatch>>();
    let validResponses = 0;
    for (const item of fulfilled) {
      const matches = dataObject(dataObject(item.value)?.data)?.matches;
      if (!Array.isArray(matches)) continue;
      validResponses++;
      for (const raw of matches) {
        const mapped = mapPitchMatch(raw);
        if (mapped && mapped.date === date) unique.set(mapped.pitchMatchId, mapped);
      }
    }
    if (!validResponses) throw new Error('invalid_upstream_data');
    const matches = [...unique.values()].filter((item) => item !== null)
      .sort((a, b) => (a!.time + a!.league).localeCompare(b!.time + b!.league));
    if (validResponses < days.length && !matches.length) throw new Error('incomplete_upstream_data');
    response.setHeader('Cache-Control', validResponses === days.length ? 'public, s-maxage=300, stale-while-revalidate=300' : 'no-store');
    response.end(JSON.stringify({ source: 'pitchapi', matches }));
  } catch (error) {
    const reason = error instanceof Error && /^(upstream_\d{3}|invalid_upstream_data|incomplete_upstream_data|test_data)$/.test(error.message)
      ? error.message : 'upstream_unavailable';
    console.warn('[PitchAPI]', { operation: matchId ? 'stats' : 'date', reason });
    response.setHeader('Cache-Control', 'no-store');
    response.statusCode = 502;
    response.end(JSON.stringify({ error: 'PitchAPI trenutno nije dostupan.' }));
  }
}
