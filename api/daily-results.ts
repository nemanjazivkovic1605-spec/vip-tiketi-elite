import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson, updateWorldCupResults } from './_world-cup-automation.js';
import { isAdminRequest, isCronRequest } from '../server/adminAuth.js';
import { isResultsRunnerRequest } from '../server/resultsRunnerAuth.js';

export const maxDuration = 300;

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(request.method || '')) return sendJson(response, 405, { error: 'Method not allowed.' });
  if (!isCronRequest(request) && !(request.method === 'POST' && (await isResultsRunnerRequest(request) || await isAdminRequest(request)))) return sendJson(response, 403, { error: 'Potrebna je cron ili administratorska autorizacija.' });
  try { sendJson(response, 200, await updateWorldCupResults(true)); }
  catch { sendJson(response, 502, { error: 'Automatska provera rezultata nije uspela.' }); }
}
