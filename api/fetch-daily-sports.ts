import type { IncomingMessage, ServerResponse } from 'node:http';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

type ApiRequest = IncomingMessage & {
  query?: Record<string, string | string[] | undefined>;
};

const FOOTBALL_API_BASE_URL = 'https://v3.football.api-sports.io';
const BASKETBALL_API_BASE_URL = 'https://v1.basketball.api-sports.io';
const TRUSTED_ADMIN_EMAILS = new Set(['nemanjazivkovic1605@gmail.com']);
const DEFAULT_TIMEZONE = 'Europe/Belgrade';

const sendJson = (response: ServerResponse, status: number, payload: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const firstQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const getRequestUrl = (request: ApiRequest) =>
  new URL(request.url || '/', 'https://eliteviptips.com');

const verifyAdmin = async (authorization?: string) => {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return false;
  const lookupResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    },
  );
  if (!lookupResponse.ok) return false;
  const body = await lookupResponse.json() as { users?: Array<{ email?: string }> };
  return TRUSTED_ADMIN_EMAILS.has((body.users?.[0]?.email || '').toLowerCase());
};

const getApiKey = () =>
  process.env.API_FOOTBALL_KEY?.trim() || process.env.VITE_FOOTBALL_API_KEY?.trim();

const requestApiSports = async (sport: string, date: string, timezone: string) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API_FOOTBALL_KEY is not configured.');

  const isBasketball = sport === 'basketball';
  const baseUrl = isBasketball ? BASKETBALL_API_BASE_URL : FOOTBALL_API_BASE_URL;
  const path = isBasketball ? '/games' : '/fixtures';
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set('date', date);
  url.searchParams.set('timezone', timezone || DEFAULT_TIMEZONE);

  const apiResponse = await fetch(url, {
    headers: { 'x-apisports-key': apiKey },
  });

  if (!apiResponse.ok) {
    throw new Error(`API-Sports ${sport} request failed: ${apiResponse.status}`);
  }

  return apiResponse.json();
};

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    if (!await verifyAdmin(request.headers.authorization)) {
      sendJson(response, 403, { error: 'Admin authorization required.' });
      return;
    }

    const requestUrl = getRequestUrl(request);
    const sport = firstQueryValue(request.query?.sport) || requestUrl.searchParams.get('sport') || 'football';
    const date = firstQueryValue(request.query?.date) || requestUrl.searchParams.get('date') || '';
    const timezone = firstQueryValue(request.query?.timezone) || requestUrl.searchParams.get('timezone') || DEFAULT_TIMEZONE;

    if (!['football', 'basketball'].includes(sport)) {
      sendJson(response, 400, { error: 'Unsupported sport.' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      sendJson(response, 400, { error: 'Valid date is required.' });
      return;
    }

    const payload = await requestApiSports(sport, date, timezone);
    sendJson(response, 200, payload);
  } catch (error) {
    sendJson(response, 502, { error: error instanceof Error ? error.message : 'Daily sports request failed.' });
  }
}
