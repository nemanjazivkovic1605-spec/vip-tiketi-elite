import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  dateInBelgrade,
  getRequestUrl,
  logCron,
  sendJson,
  upsertWorldCupPicks,
  verifyCronRequest,
} from './_world-cup-automation.js';

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (!['GET', 'POST'].includes(request.method || '')) {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!verifyCronRequest(request)) {
    sendJson(response, 401, { error: 'Cron authorization required.' });
    return;
  }

  const url = getRequestUrl(request);
  const date = url.searchParams.get('date') || dateInBelgrade();

  try {
    const result = await upsertWorldCupPicks(date);
    sendJson(response, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'World Cup seed failed.';
    try {
      await logCron({
        action: 'seed',
        status: 'error',
        message,
        details: { date },
      });
    } catch {
      // Logging failure should not hide the original cron error.
    }
    sendJson(response, 502, { error: message, date });
  }
}
