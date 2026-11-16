import type { IncomingMessage, ServerResponse } from "node:http";
import { isAdminRequest, isCronRequest } from "../server/adminAuth.js";
import { validDate, localDate } from "../server/sportsApi.js";
import {
  analyticsDatabaseConfig,
  analyticsSchemaReady,
  getAnalyticsDatabase,
  migrateAnalytics,
} from "../server/footballAnalytics/database.js";
import {
  analyticsTotals,
  readCoverage,
} from "../server/footballAnalytics/store.js";
import {
  discoverAnalyticsCatalog,
  importAnalyticsStep,
  refreshAnalytics,
} from "../server/footballAnalytics/importer.js";
import {
  analyzeStoredMatch,
  listAnalyticMatches,
} from "../server/footballAnalytics/analysis.js";
import { historicalOverview } from '../server/footballAnalytics/historicalOverview.js';
import { planHistoricalImport, syncHistoricalCurrentSeason, writeHistoricalImport } from '../server/footballAnalytics/historicalImport.js';
import type { HistoricalImportOptions } from '../src/types/historicalAnalytics.js';
import { htftRanking, htftTransitions, readHtftTeam, readHtftMatch, htftSchedule, validateHtftFilters } from '../server/footballAnalytics/htftAnalytics.js';
import type { HtftFilters, HtftCode } from '../src/types/htftAnalytics.js';

export const maxDuration = 240;
const send = (response: ServerResponse, status: number, data: unknown) => {
  response.statusCode = status;
  response.end(JSON.stringify(data));
};
async function readHistoricalBody(request: IncomingMessage): Promise<{ options?: HistoricalImportOptions; fingerprint?: string; allowLarge?: boolean }> {
  let text = '', bytes = 0;
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 2_100_000) throw new Error('Fajl je prevelik.');
    text += chunk.toString();
  }
  const value = text ? JSON.parse(text) : {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Neispravan zahtev.');
  return value;
}
export const createAnalyticsHandler =
  (
    authorize = isAdminRequest,
    database = getAnalyticsDatabase,
    cron = isCronRequest,
  ) =>
  async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "private, no-store");
    const url = new URL(request.url || "/", "https://eliteviptips.com");
    const action =
      url.searchParams.get("action") || (cron(request) ? "sync" : "status");
    const scheduled = action === "sync" && cron(request);
    if (!scheduled && !(await authorize(request)))
      return send(response, 403, {
        error: "Ovaj analizator je dostupan samo administratoru.",
      });
    if (!["GET", "POST"].includes(request.method || ""))
      return send(response, 405, { error: "Method not allowed." });
    const config = analyticsDatabaseConfig();
    if (!config.configured)
      return send(
        response,
        scheduled ? 200 : action === "status" ? 200 : 503,
        scheduled
          ? { skipped: true, reason: config.message }
          : {
              database: { ...config, ready: false },
              providers: [],
              coverage: [],
              totals: {
                leagues: 0,
                matches: 0,
                finished: 0,
                withHt: 0,
                withXg: 0,
                unresolved: 0,
              },
              error: config.message,
            },
      );
    try {
      const db = await database();
      if (action === "migrate" && request.method === "POST") {
        await migrateAnalytics(db);
        return send(response, 200, { ready: true });
      }
      const ready = await analyticsSchemaReady(db);
      if (!ready && action !== "status")
        return send(response, 409, {
          error:
            "Analitička šema još nije inicijalizovana. Pokrenite inicijalizaciju baze.",
        });
      if (action === "status")
        return send(response, 200, {
          database: { ...config, ready },
          providers: ready
            ? (
                await db.query("SELECT payload FROM fa_providers ORDER BY id")
              ).map((r) => JSON.parse(r.payload))
            : [],
          coverage: ready ? await readCoverage(db) : [],
          totals: ready
            ? await analyticsTotals(
                db,
                url.searchParams.get("environment") === "test"
                  ? "test"
                  : "real",
              )
            : {
                leagues: 0,
                matches: 0,
                finished: 0,
                withHt: 0,
                withXg: 0,
                unresolved: 0,
              },
        });
      if (action === "sync" && scheduled)
        return send(response, 200, {
          results: process.env.ANALYTICS_SYNC_ENABLED === 'true' ? await refreshAnalytics(db) : [],
          historical: await syncHistoricalCurrentSeason(db),
        });
      if (action.startsWith('htft-')) {
        if (request.method !== 'GET') return send(response, 405, { error: 'Analitički pregledi dozvoljavaju samo čitanje.' });
        try {
          const input = Object.fromEntries(['league', 'season', 'transition', 'role', 'search', 'sort', 'direction'].map(key => [key, url.searchParams.get(key) || undefined]));
          const filters = validateHtftFilters({ ...input, offset: Number(url.searchParams.get('offset') || 0), ...(url.searchParams.has('tier') ? { tier: Number(url.searchParams.get('tier')) } : {}) } as HtftFilters);
          if (action === 'htft-ranking') return send(response, 200, await htftRanking(db, filters));
          if (action === 'htft-transitions') {
            if (!filters.transition) return send(response, 400, { error: 'Izaberite HT/FT prelaz.' });
            return send(response, 200, await htftTransitions(db, filters.transition as HtftCode, filters));
          }
          if (action === 'htft-schedule') return send(response, 200, await htftSchedule(db, url.searchParams.get('date') || localDate(), Number(url.searchParams.get('days') || 1), filters));
          const id = url.searchParams.get('id') || '';
          if (!/^[a-f0-9]{32}$/.test(id)) return send(response, 400, { error: 'Neispravan identifikator.' });
          const value = action === 'htft-team' ? await readHtftTeam(db, id, filters) : action === 'htft-match' ? await readHtftMatch(db, id) : null;
          return send(response, value ? 200 : 404, value || { error: 'Podaci nisu pronađeni u engleskoj analitičkoj bazi.' });
        } catch (error) { return send(response, 400, { error: error instanceof Error ? error.message : 'HT/FT pregled nije dostupan.' }); }
      }
      if (action.startsWith('historical-')) {
        if (!(await db.query('SELECT version FROM fa_schema WHERE version=$1', [2])).length)
          return send(response, 409, { error: 'Pokrenite inicijalizaciju analitičke šeme verzije 2.' });
        if (action === 'historical-overview') {
          if (request.method !== 'GET') return send(response, 405, { error: 'Method not allowed.' });
          return send(response, 200, await historicalOverview(db, {
            league: url.searchParams.get('league') || undefined,
            season: url.searchParams.get('season') || undefined,
            tier: url.searchParams.has('tier') ? Number(url.searchParams.get('tier')) : undefined,
            team: (url.searchParams.get('team') || '').slice(0, 100),
            against: (url.searchParams.get('against') || '').slice(0, 100),
          }, Number(url.searchParams.get('offset') || 0)));
        }
        if (!['historical-plan', 'historical-write'].includes(action)) return send(response, 400, { error: 'Nepodržana istorijska akcija.' });
        if (request.method !== 'POST') return send(response, 405, { error: 'Uvoz zahteva eksplicitnu POST akciju administratora.' });
        try {
          const body = await readHistoricalBody(request);
          const plan = await planHistoricalImport(db, body.options || {});
          if (action === 'historical-plan') return send(response, 200, plan.summary);
          if (body.fingerprint !== plan.summary.fingerprint) return send(response, 409, { error: 'Plan se promenio. Ponovite dry-run.' });
          return send(response, 200, await writeHistoricalImport(db, plan, body.fingerprint, { allowLarge: body.allowLarge === true }));
        } catch (error) {
          return send(response, 400, { error: error instanceof Error ? error.message : 'Istorijski uvoz nije uspeo.' });
        }
      }
      if (["catalog", "step", "refresh"].includes(action)) {
        if (request.method !== "POST")
          return send(response, 405, {
            error: "Uvoz zahteva eksplicitnu POST akciju administratora.",
          });
        if (action === "catalog")
          return send(response, 200, {
            providers: await discoverAnalyticsCatalog(db),
          });
        const id = url.searchParams.get("id") || undefined;
        if (id && !/^[a-f0-9]{32}$/.test(id))
          return send(response, 400, {
            error: "Neispravan identifikator serije.",
          });
        if (action === "refresh" && !id)
          return send(response, 400, {
            error: "Izaberite ligu i sezonu za osvežavanje.",
          });
        return send(
          response,
          200,
          await importAnalyticsStep(db, id, {
            refresh: action === "refresh",
            environment:
              url.searchParams.get("environment") === "test" ? "test" : "real",
          }),
        );
      }
      if (request.method !== "GET")
        return send(response, 405, { error: "Method not allowed." });
      if (action === "match") {
        const id = url.searchParams.get("id") || "";
        if (!/^[a-f0-9]{32}$/.test(id))
          return send(response, 400, { error: "Neispravan ID utakmice." });
        const result = await analyzeStoredMatch(
          db,
          id,
          url.searchParams.get("scope") === "league" ? "league" : "all",
        );
        return send(
          response,
          result ? 200 : 404,
          result || { error: "Utakmica nije pronađena u analitičkoj bazi." },
        );
      }
      if (action === "fixtures") {
        const date = url.searchParams.get("date") || localDate();
        if (!validDate(date))
          return send(response, 400, { error: "Neispravan datum." });
        const offset = Number(url.searchParams.get("offset") || 0);
        if (!Number.isInteger(offset) || offset < 0 || offset > 10000)
          return send(response, 400, {
            error: "Neispravna stranica rezultata.",
          });
        return send(
          response,
          200,
          await listAnalyticMatches(
            db,
            date,
            url.searchParams.get("environment") === "test" ? "test" : "real",
            url.searchParams.get("league") || "",
            (url.searchParams.get("search") || "").slice(0, 100),
            offset,
          ),
        );
      }
      return send(response, 400, { error: "Nepodržana analitička akcija." });
    } catch {
      return send(response, 503, {
        error:
          "Analitička baza ili izvor trenutno nisu dostupni. Sačuvani napredak nije izgubljen.",
      });
    }
  };
export default createAnalyticsHandler();
