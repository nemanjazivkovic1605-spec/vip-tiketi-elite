import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolveFootballData, validateFootballRequest } from '../server/footballData.js';
import { SportsApiError } from '../server/sportsApi.js';

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method !== 'GET') { response.statusCode = 405; response.end(JSON.stringify({ error: 'Method not allowed.' })); return; }
  try {
    const { path, params } = validateFootballRequest(new URL(request.url || '/', 'https://eliteviptips.com'));
    const payload = await resolveFootballData(path, params);
    response.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=180');
    response.end(JSON.stringify(payload));
  } catch (error) {
    response.setHeader('Cache-Control', 'no-store');
    response.statusCode = error instanceof SportsApiError ? error.status : 502;
    response.end(JSON.stringify({ error: error instanceof SportsApiError ? error.message : 'Sportski podaci trenutno nisu dostupni.' }));
  }
}
