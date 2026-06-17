import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  logCron,
  sendJson,
  updateWorldCupResults,
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

  try {
    const result = await updateWorldCupResults();
    sendJson(response, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'World Cup result update failed.';
    try {
      await logCron({
        action: 'results',
        status: 'error',
        message,
      });
    } catch {
      // Logging failure should not hide the original cron error.
    }
    sendJson(response, 502, { error: message });
  }
}
