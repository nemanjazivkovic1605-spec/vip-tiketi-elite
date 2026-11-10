import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAdminRequest } from '../server/adminAuth.js';
import { loadDailyCandidates } from '../server/dailyPickProvider.js';
import { selectDailyPicks } from '../server/dailyPickSelection.js';
import { requestSports, SportsApiError, validDate } from '../server/sportsApi.js';

export const maxDuration = 120;

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const send = (status: number, data: unknown) => {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify(data));
  };
  if (request.method !== 'GET') return send(405, { error: 'Method not allowed.' });
  if (!await isAdminRequest(request)) return send(403, { error: 'Admin authorization required.' });
  const url = new URL(request.url || '/', 'https://eliteviptips.com');
  const date = url.searchParams.get('date') || '';
  const sport = url.searchParams.get('sport') || 'football';
  if (!validDate(date) || !['football', 'basketball'].includes(sport)) return send(400, { error: 'Neispravan datum ili sport.' });
  try {
    if (url.searchParams.get('mode') === 'picks') {
      if (sport !== 'football') return send(400, { error: 'Automatski predlozi su trenutno dostupni za fudbal.' });
      const data = await loadDailyCandidates(date);
      return send(200, { response: selectDailyPicks(data.candidates, ['FREE', 'VIP', 'VIP']), warnings: data.warnings });
    }
    return send(200, await requestSports(sport === 'basketball' ? '/games' : '/fixtures', { date, timezone: 'Europe/Belgrade' }, { sport: sport as 'football' | 'basketball' }));
  } catch (error) {
    return send(error instanceof SportsApiError ? error.status : 502, { error: error instanceof SportsApiError ? error.message : 'Preuzimanje sportskih podataka nije uspelo.' });
  }
}
