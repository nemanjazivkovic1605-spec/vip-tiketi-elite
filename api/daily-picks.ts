import type { IncomingMessage, ServerResponse } from 'node:http';
import { initAdminDb, sendJson } from './_world-cup-automation.js';
import { isAdminRequest, isCronRequest } from '../server/adminAuth.js';
import { loadDailyCandidates } from '../server/dailyPickProvider.js';
import { selectDailyPicks } from '../server/dailyPickSelection.js';
import { publicationSlots, publishDailyCandidates } from '../server/dailyPublication.js';
import { addDays, localDate, numberSetting, validDate } from '../server/sportsApi.js';
import { loadAdminDailyProposals } from '../server/dailyProposalProvider.js';
import { saveDailyProposals } from '../server/dailyProposalsStore.js';
import { runProductPublication } from '../server/productAutomation.js';

export const maxDuration = 300;

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(request.method || '')) return sendJson(response, 405, { error: 'Method not allowed.' });
  const cronRequest = isCronRequest(request);
  const adminRequest = request.method === 'POST' && await isAdminRequest(request);
  if (!cronRequest && !adminRequest) {
    return sendJson(response, 403, { error: 'Potrebna je cron ili administratorska autorizacija.' });
  }
  const url = new URL(request.url || '/', 'https://eliteviptips.com');
  if (url.searchParams.get('mode') === 'proposals' && !adminRequest) return sendJson(response, 403, { error: 'Predloge moze povuci samo administrator.' });
  const requestedDate = url.searchParams.get('date');
  const today = localDate();
  if (requestedDate && (!validDate(requestedDate) || requestedDate < today || requestedDate > addDays(today, 2))) {
    return sendJson(response, 400, { error: 'Objavljivanje je dostupno za danas, sutra i prekosutra.' });
  }
  const dates = requestedDate ? [requestedDate] : Array.from({ length: numberSetting('DAILY_LOOKAHEAD_DAYS', 3, 1, 3) }, (_, index) => addDays(today, index));
  const results: Array<Record<string, unknown>> = [];
  const deadline = Date.now() + 220_000;
  try {
    if (url.searchParams.get('mode') === 'proposals') {
      if (!requestedDate) return sendJson(response, 400, { error: 'Izaberite dan za predloge.' });
      const data = await loadAdminDailyProposals(requestedDate);
      const dryRun = url.searchParams.get('dryRun') === 'true';
      const stored = dryRun ? { saved: 0, existing: 0 } : await saveDailyProposals(initAdminDb(), requestedDate, data.proposals);
      return sendJson(response, 200, { dryRun, ...stored, fetched: data.proposals.length, failed: 0, skippedManualOverride: 0,
        ...(dryRun ? { proposals: data.proposals } : {}),
        results: [{ date: requestedDate, fixtures: data.fixtures, priced: data.priced, leaguesChecked: data.leaguesChecked,
          warnings: data.warnings, message: `${data.proposals.length} predloga za pregled (${data.priced} sa proverenom kvotom). Nijedan predlog nije automatski objavljen.` }],
      });
    }
    const db = initAdminDb();
    const dryRun = url.searchParams.get('dryRun') === 'true';
    const products = await runProductPublication(db, requestedDate || today, dryRun, new Date(), Math.min(deadline, Date.now() + 120000));
    if (url.searchParams.get('mode') === 'products') return sendJson(response, 200, products);
    // Dry-run reads reservations but never publishes tickets or updates logs/statistics.
    if (url.searchParams.get('dryRun') === 'true') {
      for (const date of dates) {
        try {
          const data = await loadDailyCandidates(date, new Date(), deadline);
          results.push({ date, fixtures: data.fixtures, upcoming: data.upcoming, oddsPages: data.oddsPages,
            warnings: data.warnings, picks: selectDailyPicks(data.candidates, publicationSlots([])) });
        } catch (error) {
          results.push({ date, failed: 1, error: error instanceof Error ? error.message : 'Provera sportskog API-ja nije uspela.' });
        }
      }
      return sendJson(response, results.every((result) => result.failed) ? 502 : 200, { dryRun: true, saved: 0, products, results });
    }
    for (const date of dates) {
      const [existing, manifest] = await Promise.all([
        db.collection('dailyAnalyses').where('date', '==', date).get(), db.collection('dailyAutomation').doc(date).get(),
      ]);
      const reserved = new Map<string, any>((manifest.data()?.published || []).map((item: any) => [item.id, item]));
      existing.docs.forEach((doc) => reserved.set(doc.id, { ...doc.data(), id: doc.id }));
      if (!publicationSlots([...reserved.values()]).length) {
        results.push({ date, saved: 0, fetched: 0, skippedManualOverride: existing.docs.filter((doc) => doc.data().manualOverride).length, message: 'Dnevni predlozi su već objavljeni.' });
        continue;
      }
      try {
        const data = await loadDailyCandidates(date, new Date(), deadline);
        const published = await publishDailyCandidates(db, date, data.candidates);
        const result = { date, ...published, fixtures: data.fixtures, upcoming: data.upcoming,
          oddsPages: data.oddsPages, oddsPagesTotal: data.oddsPagesTotal, warnings: data.warnings };
        results.push(result);
        await db.collection('automationLogs').add({ action: 'daily-seed', ...result, createdAt: new Date().toISOString() });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Preuzimanje nije uspelo.';
        results.push({ date, saved: 0, fetched: 0, failed: 1, error: message });
        await db.collection('automationLogs').add({ action: 'daily-seed', date, status: 'error', message, createdAt: new Date().toISOString() });
      }
    }
    const sum = (key: string) => results.reduce((total, result) => total + (Number(result[key]) || 0), 0);
    sendJson(response, results.every((result) => result.failed) ? 502 : 200, {
      saved: sum('saved') + products.saved, fetched: sum('fetched'), skippedManualOverride: sum('skippedManualOverride'), failed: sum('failed'), products, results,
    });
  } catch { sendJson(response, 503, { error: 'Automatska objava nije dostupna. Proverite serversku Firebase konfiguraciju.' }); }
}
