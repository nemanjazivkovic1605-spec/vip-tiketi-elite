import type { AnalyticsDatabase } from "./database.js";
import type { CoverageRow } from "../../src/types/footballAnalytics.js";
import {
  AnalyticsProviderError,
  fetchSeason,
  footballDataCatalog,
  normalizeProviderMatch,
  openLigaCatalog,
  pitchCatalog,
} from "./providers.js";
import {
  coverageCounts,
  getCoverage,
  ingestMatch,
  readCoverage,
  saveCatalog,
  saveProviderStatus,
  writeCoverage,
} from "./store.js";
import { isSourceEnabled, sourceRegistry } from "./sourceRegistry.js";

export async function discoverAnalyticsCatalog(db: AnalyticsDatabase) {
  const result: Array<{ provider: string; leagues: number; error?: string; skipped?: boolean }> =
    [];
  const enabled = new Set((await sourceRegistry(db)).filter((source) => source.enabled.internal).map((source) => source.id));
  for (const [provider, catalog] of [
    ["pitchapi", pitchCatalog],
    ["football-data.org", footballDataCatalog],
    ["openligadb", openLigaCatalog],
  ] as const) {
    if (!enabled.has(provider)) {
      result.push({ provider, leagues: 0, skipped: true });
      continue;
    }
    try {
      const leagues = await catalog();
      await saveCatalog(db, leagues);
      const environment = leagues[0]?.environment || "real";
      await saveProviderStatus(
        db,
        provider,
        "ok",
        `${leagues.length} liga u dostupnom katalogu.`,
        environment,
      );
      result.push({ provider, leagues: leagues.length });
    } catch (error) {
      const message =
        error instanceof AnalyticsProviderError
          ? error.message
          : "Izvor trenutno nije dostupan. Pristup i pokrivenost nisu potvrđeni.";
      await saveProviderStatus(db, provider, "unavailable", message);
      result.push({ provider, leagues: 0, error: message });
    }
  }
  await saveProviderStatus(
    db,
    "football-data.co.uk",
    "not_enabled",
    "Automatizovana komercijalna upotreba CSV arhive nije dozvoljena bez posebne dozvole izvora.",
  );
  return result;
}

export async function importAnalyticsStep(
  db: AnalyticsDatabase,
  id?: string,
  options: {
    refresh?: boolean;
    batchSize?: number;
    provider?: string;
    environment?: "real" | "test";
  } = {},
) {
  const all = await readCoverage(db);
  const job = id
    ? all.find((row) => row.id === id)
    : all
        .filter(
          (row) =>
            ["unverified", "queued", "importing"].includes(row.state) &&
            row.environment === (options.environment || "real") &&
            (!options.provider || row.provider === options.provider),
        )
        .sort(
          (a, b) =>
            b.season.localeCompare(a.season) ||
            a.provider.localeCompare(b.provider),
        )[0];
  if (!job) return { done: true, processed: 0 };
  if (!(await isSourceEnabled(db, job.provider, "internal")))
    return { done: true, processed: 0, skipped: true, reason: "Izvor je isključen za internu obradu." };
  const lease = new Date(Date.now() + 300000).toISOString();
  const claimed = await db.query(
    "UPDATE fa_coverage SET lease_until=$1 WHERE id=$2 AND (lease_until IS NULL OR lease_until < $3) RETURNING id",
    [lease, job.id, new Date().toISOString()],
  );
  if (!claimed.length)
    return { done: false, busy: true, processed: 0, id: job.id };
  let current = (await getCoverage(db, job.id))!;
  try {
    if (current.state === "complete" && !options.refresh)
      return { done: true, processed: 0, job: current };
    if (
      current.state === "unverified" ||
      options.refresh ||
      current.total === 0
    ) {
      const rows = await fetchSeason(current);
      // The source's season response is checkpointed once; following requests resume from SQL, not the API list.
      await db.transaction(async (tx) => {
        await tx.query("DELETE FROM fa_items WHERE job_id=$1", [current.id]);
        for (const [ordinal, row] of rows.entries())
          await tx.query(
            "INSERT INTO fa_items(job_id,ordinal,payload) VALUES($1,$2,$3)",
            [current.id, ordinal, JSON.stringify(row)],
          );
        current = {
          ...current,
          total: rows.length,
          cursor: 0,
          state: rows.length ? "queued" : "empty",
          error: null,
        };
        await writeCoverage(tx, current);
      });
    }
    const batchSize = Math.min(
      current.provider === "pitchapi" ? 3 : 50,
      Math.max(1, options.batchSize || 30),
    );
    const items = await db.query(
      "SELECT payload,ordinal FROM fa_items WHERE job_id=$1 AND ordinal >= $2 ORDER BY ordinal LIMIT $3",
      [current.id, current.cursor, batchSize],
    );
    const counts = {
      created: 0,
      updated: 0,
      unchanged: 0,
      unresolved: 0,
      invalid: 0,
    };
    const deadline = Date.now() + 40000;
    for (const item of items) {
      if (Date.now() > deadline) break;
      const normalized = await normalizeProviderMatch(
        JSON.parse(item.payload),
        current,
      );
      if (normalized) counts[await ingestMatch(db, normalized)]++;
      else counts.invalid++;
      current = {
        ...current,
        cursor: Number(item.ordinal) + 1,
        state: "importing",
      };
      await writeCoverage(db, current);
    }
    current = await coverageCounts(db, {
      ...current,
      state:
        current.total === 0
          ? "empty"
          : current.cursor >= current.total
            ? "complete"
            : "importing",
      lastSyncedAt: new Date().toISOString(),
      error: null,
    });
    await writeCoverage(db, current);
    return {
      done: current.state === "complete" || current.state === "empty",
      processed: Object.values(counts).reduce((a, b) => a + b, 0),
      counts,
      job: current,
    };
  } catch (error) {
    const unavailable =
      error instanceof AnalyticsProviderError &&
      [401, 403, 404, 422].includes(error.status);
    current = await coverageCounts(db, {
      ...current,
      state: unavailable ? "unavailable" : "error",
      error:
        error instanceof AnalyticsProviderError
          ? error.message
          : "Uvoz je prekinut. Sačuvani napredak može da se nastavi.",
      lastSyncedAt: new Date().toISOString(),
    });
    await writeCoverage(db, current);
    return { done: false, processed: 0, error: current.error, job: current };
  } finally {
    await db.query(
      "UPDATE fa_coverage SET lease_until=NULL WHERE id=$1 AND lease_until=$2",
      [job.id, lease],
    );
  }
}

export async function refreshAnalytics(
  db: AnalyticsDatabase,
  deadline = Date.now() + 180000,
) {
  const rows = await readCoverage(db);
  const latest = new Map<string, string>();
  rows.forEach((row) =>
    latest.set(
      `${row.provider}:${row.sourceId}`,
      [latest.get(`${row.provider}:${row.sourceId}`) || "", row.season]
        .sort()
        .at(-1)!,
    ),
  );
  const results: any[] = [];
  for (const row of rows) {
    if (Date.now() > deadline) break;
    if (row.environment !== "real") continue;
    const currentSeason =
      latest.get(`${row.provider}:${row.sourceId}`) === row.season;
    if (
      !currentSeason &&
      !["unverified", "queued", "importing"].includes(row.state)
    )
      continue;
    if (
      currentSeason &&
      ["complete", "empty", "error", "unavailable"].includes(row.state) &&
      (!row.lastSyncedAt ||
        Date.now() - Date.parse(row.lastSyncedAt) > 12 * 3600000)
    ) {
      results.push(await importAnalyticsStep(db, row.id, { refresh: true }));
    } else if (["unverified", "queued", "importing"].includes(row.state))
      results.push(await importAnalyticsStep(db, row.id));
  }
  return results;
}
