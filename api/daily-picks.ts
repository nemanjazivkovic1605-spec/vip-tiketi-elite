import type { IncomingMessage, ServerResponse } from 'node:http';
import { initAdminDb, sendJson } from './_world-cup-automation.js';
import { isAdminRequest, isCronRequest } from '../server/adminAuth.js';
import { loadDailyCandidates } from '../server/dailyPickProvider.js';
import { selectDailyPicks } from '../server/dailyPickSelection.js';
import { publicationSlots, publishDailyCandidates } from '../server/dailyPublication.js';
import { addDays, localDate, numberSetting, validDate } from '../server/sportsApi.js';

export const maxDuration = 300;

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(request.method || '')) return sendJson(response, 405, { error: 'Method not allowed.' });
  if (!isCronRequest(request) && !(request.method === 'POST' && await isAdminRequest(request))) {
    return sendJson(response, 403, { error: 'Potrebna je cron ili administratorska autorizacija.' });
  }
  const url = new URL(request.url || '/', 'https://eliteviptips.com');
  const requestedDate = url.searchParams.get('date');
  const today = localDate();
  if (requestedDate && (!validDate(requestedDate) || requestedDate < today || requestedDate > addDays(today, 2))) {
    return sendJson(response, 400, { error: 'Objavljivanje je dostupno za danas, sutra i prekosutra.' });
  }
  const dates = requestedDate ? [requestedDate] : Array.from({ length: numberSetting('DAILY_LOOKAHEAD_DAYS', 3, 1, 3) }, (_, index) => addDays(today, index));
  const results: Array<Record<string, unknown>> = [];
  const deadline = Date.now() + 220_000;
  try {
    // Authenticated read-only verification also works on previews without production database credentials.
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
      return sendJson(response, results.every((result) => result.failed) ? 502 : 200, { dryRun: true, saved: 0, results });
    }
    const db = initAdminDb();
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
      saved: sum('saved'), fetched: sum('fetched'), skippedManualOverride: sum('skippedManualOverride'), failed: sum('failed'), results,
    });
  } catch { sendJson(response, 503, { error: 'Automatska objava nije dostupna. Proverite serversku Firebase konfiguraciju.' }); }
}
