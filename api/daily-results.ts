import type { IncomingMessage, ServerResponse } from 'node:http';
import { initAdminDb, resolveFixtureForResult, sendJson, updateWorldCupResults } from './_world-cup-automation.js';
import { isAdminRequest, isCronRequest } from '../server/adminAuth.js';
import { isResultsRunnerRequest } from '../server/resultsRunnerAuth.js';
import { runProductResults } from '../server/productAutomation.js';

export const maxDuration = 300;

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(request.method || '')) return sendJson(response, 405, { error: 'Method not allowed.' });
  if (!isCronRequest(request) && !(request.method === 'POST' && (await isResultsRunnerRequest(request) || await isAdminRequest(request)))) return sendJson(response, 403, { error: 'Potrebna je cron ili administratorska autorizacija.' });
  try {
    const deadline = Date.now() + 220000;
    const errors: string[] = [];
    const products = await runProductResults(initAdminDb(), lookup => resolveFixtureForResult(lookup as any), new Date(), Date.now() + 90000)
      .catch(() => { errors.push('Provera Elite/Safe rezultata nije uspela.'); return { checked: 0, updated: 0 }; });
    const daily = await updateWorldCupResults(true, deadline)
      .catch(() => { errors.push('Provera dnevnih rezultata nije uspela.'); return { checked: 0, updated: 0 }; });
    sendJson(response, errors.length ? 502 : 200, { ...daily, checked: daily.checked + products.checked, updated: daily.updated + products.updated, products,
      ...(errors.length ? { errors } : {}) });
  }
  catch { sendJson(response, 502, { error: 'Automatska provera rezultata nije uspela.' }); }
}
