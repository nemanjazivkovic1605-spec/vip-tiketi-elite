import { createHash } from 'node:crypto';

export type SportsEnvelope<T> = {
  response: T[];
  errors?: Record<string, unknown> | unknown[];
  paging?: { current: number; total: number };
};

export class SportsApiError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); }
}

const cache = new Map<string, { createdAt: number; until: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
let nextRequestAt = 0;
let requestQueue = Promise.resolve();

export const getSportsKey = (sport: 'football' | 'basketball' = 'football') => {
  if (process.env[sport === 'football' ? 'API_FOOTBALL_ENABLED' : 'API_BASKETBALL_ENABLED'] === 'false') return '';
  const key = sport === 'basketball'
    ? process.env.API_BASKETBALL_KEY || process.env.VITE_BASKETBALL_API_KEY || process.env.API_FOOTBALL_KEY
    : process.env.API_FOOTBALL_KEY || process.env.VITE_FOOTBALL_API_KEY;
  return key?.trim() || '';
};

export const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

export const localDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(date);

export const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const numberSetting = (name: string, fallback: number, min: number, max: number) => {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
};

// Shared across callers in a warm instance; default pacing fits the 10/minute tier.
const waitForQuota = async () => {
  const task = requestQueue.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + numberSetting('SPORTS_API_INTERVAL_MS', 6100, 0, 10000);
  });
  requestQueue = task.catch(() => undefined);
  await task;
};

export async function requestSports<T>(
  path: string,
  params: Record<string, string>,
  options: { sport?: 'football' | 'basketball'; ttlMs?: number } = {},
): Promise<SportsEnvelope<T>> {
  const sport = options.sport || 'football';
  const key = getSportsKey(sport);
  if (!key) throw new SportsApiError(`${sport === 'basketball' ? 'API_BASKETBALL_KEY ili ' : ''}API_FOOTBALL_KEY nije podešen na serveru.`, 503);
  const url = new URL(path, sport === 'basketball'
    ? 'https://v1.basketball.api-sports.io' : 'https://v3.football.api-sports.io');
  Object.entries(params).sort().forEach(([name, value]) => value && url.searchParams.set(name, value));
  // Include a one-way credential fingerprint so rotating keys also invalidates cached responses.
  const cacheKey = `${createHash('sha256').update(key).digest('hex').slice(0, 12)}:${url}`;
  const cached = cache.get(cacheKey);
  const ttl = options.ttlMs ?? 5 * 60_000;
  if (cached && cached.until > Date.now() && Date.now() - cached.createdAt < ttl) return cached.value as SportsEnvelope<T>;
  if (pending.has(cacheKey)) return pending.get(cacheKey) as Promise<SportsEnvelope<T>>;
  const task = (async () => {
    await waitForQuota();
    const response = await fetch(url, {
      headers: { 'x-apisports-key': key }, signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      throw new SportsApiError(response.status === 429
        ? 'API-Sports limit zahteva je dostignut.'
        : response.status === 401 || response.status === 403
          ? 'API-Sports ključ ili pristup paketu nije ispravan.'
          : `API-Sports nije dostupan (${response.status}).`, response.status === 429 ? 429 : 502);
    }
    const payload = await response.json() as SportsEnvelope<T>;
    if (payload.errors && Object.keys(payload.errors).length) {
      // Do not return upstream error text: providers can echo request credentials.
      const fields = Object.keys(payload.errors).map((field) => field.toLowerCase());
      if (fields.some((field) => /request|limit/.test(field))) throw new SportsApiError('API-Sports limit zahteva je dostignut.', 429);
      if (fields.some((field) => /token|key|access/.test(field))) throw new SportsApiError('API-Sports ključ nije prihvaćen. Proverite serverski API_FOOTBALL_KEY.');
      if (fields.includes('plan')) throw new SportsApiError('API-Sports paket ne dozvoljava traženu sezonu ili podatke. Proverite prava na postojećem nalogu.');
      throw new SportsApiError('API-Sports je odbio zahtev. Proverite ključ, kvotu i sezone dostupne na paketu.');
    }
    if (!Array.isArray(payload.response)) throw new SportsApiError('API-Sports je vratio neispravan odgovor.');
    if (cache.size > 300) cache.clear();
    cache.set(cacheKey, { createdAt: Date.now(), until: Date.now() + ttl, value: payload });
    return payload;
  })().finally(() => pending.delete(cacheKey));
  pending.set(cacheKey, task);
  return task;
}
