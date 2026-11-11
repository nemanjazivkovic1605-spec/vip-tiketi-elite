import type { IncomingMessage, ServerResponse } from 'node:http';
import { mapPitchMatch, extractPitchXg } from '../server/pitchApi.js';
import { validDate } from '../server/sportsApi.js';

const BASE_URL = 'https://api.pitchapi.dev';
const cache = new Map<string, { expiresAt: number; task: Promise<unknown> }>();

const previousDate = (date: string) => {
  const day = new Date(date + 'T12:00:00Z');
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
};

async function readPitch(path: string, ttlMs: number): Promise<unknown> {
  const key = process.env.PITCHAPI_API_KEY?.trim();
  if (!key) throw new Error('not_configured');
  const existing = cache.get(path);
  if (existing && existing.expiresAt > Date.now()) return existing.task;
  const task = fetch(new URL(path, BASE_URL), {
    headers: { 'X-API-KEY': key },
    signal: AbortSignal.timeout(10000),
  }).then(async (response) => {
    if (!response.ok) throw new Error('upstream_' + response.status);
    return response.json() as Promise<unknown>;
  }).catch((error) => {
    cache.delete(path);
    throw error;
  });
  if (cache.size > 100) cache.clear();
  cache.set(path, { expiresAt: Date.now() + ttlMs, task });
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
  if (!process.env.PITCHAPI_API_KEY?.trim()) {
    response.statusCode = 503;
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify({ error: 'PitchAPI nije aktiviran.' }));
    return;
  }
  const url = new URL(request.url || '/', 'https://eliteviptips.com');
  const date = url.searchParams.get('date');
  const matchId = url.searchParams.get('matchId');
  if (Boolean(date) === Boolean(matchId) || date && !validDate(date) || matchId && !/^m_[A-Za-z0-9]{6}$/.test(matchId)) {
    response.statusCode = 400;
    response.end(JSON.stringify({ error: 'Neispravan datum ili ID utakmice.' }));
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
    if (!fulfilled.length) throw new Error('upstream_unavailable');
    const unique = new Map<string, ReturnType<typeof mapPitchMatch>>();
    for (const item of fulfilled) {
      const matches = dataObject(dataObject(item.value)?.data)?.matches;
      if (!Array.isArray(matches)) continue;
      for (const raw of matches) {
        const mapped = mapPitchMatch(raw);
        if (mapped && mapped.date === date) unique.set(mapped.pitchMatchId, mapped);
      }
    }
    const matches = [...unique.values()].filter((item) => item !== null)
      .sort((a, b) => (a!.time + a!.league).localeCompare(b!.time + b!.league));
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    response.end(JSON.stringify({ source: 'pitchapi', matches }));
  } catch {
    response.setHeader('Cache-Control', 'no-store');
    response.statusCode = 502;
    response.end(JSON.stringify({ error: 'PitchAPI trenutno nije dostupan.' }));
  }
}
