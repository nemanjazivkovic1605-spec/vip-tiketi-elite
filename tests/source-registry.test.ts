import test from "node:test";
import assert from "node:assert/strict";
import { DATA_SOURCE_REGISTRY, isSourceEnabled, setSourceActivation, sourceRegistry } from "../server/footballAnalytics/sourceRegistry.js";
import type { AnalyticsDatabase } from "../server/footballAnalytics/database.js";

test("source registry describes capabilities and keeps unknown usage rights unapproved", () => {
  const open = DATA_SOURCE_REGISTRY.find((source) => source.id === "openfootball");
  const apiFootball = DATA_SOURCE_REGISTRY.find((source) => source.id === "api-football");
  const footballDataArchive = DATA_SOURCE_REGISTRY.find((source) => source.id === "football-data.co.uk");
  assert.deepEqual(open?.tierCoverage, [1, 2, 3, 4]);
  assert.equal(open?.rightsStatus, "confirmed-open");
  assert.equal(apiFootball?.dailyLimit, 100);
  assert.equal(apiFootball?.rightsStatus, "permission-required");
  assert.equal(footballDataArchive?.rightsStatus, "permission-required");
  const odds = DATA_SOURCE_REGISTRY.find((source) => source.id === "the-odds-api");
  assert.equal(odds?.monthlyLimit, 500);
  assert.equal(odds?.rightsStatus, "commercial-display");
  const bigBalls = DATA_SOURCE_REGISTRY.find((source) => source.id === "bigballsdata");
  assert.equal(bigBalls?.dailyLimit, 1000);
  assert.deepEqual(bigBalls?.tierCoverage, [1]);
  assert.equal(bigBalls?.priority, null);
  assert.equal(bigBalls?.rightsStatus, "commercial-display");
  const apiNinjas = DATA_SOURCE_REGISTRY.find((source) => source.id === "api-ninjas");
  assert.equal(apiNinjas?.monthlyLimit, 3000);
  assert.equal(apiNinjas?.rightsStatus, "permission-required");
  assert.equal(apiNinjas?.priority, null);
  const dataScraper = DATA_SOURCE_REGISTRY.find((source) => source.id === "datascraper-pro");
  assert.equal(dataScraper?.availability, "contract_only");
  assert.equal(dataScraper?.rights.publicDisplay, "unknown");
  assert.equal(DATA_SOURCE_REGISTRY.some((source) => (source.tierCoverage.includes(6) || source.tierCoverage.includes(7)) && source.rightsStatus === "confirmed-open"), false);
});

test("registry distinguishes configured keys from verified connections and aggregates stored coverage", async () => {
  const previous = process.env.FOOTBALL_DATA_API_KEY;
  const sentinel = "must-not-be-returned";
  process.env.FOOTBALL_DATA_API_KEY = sentinel;
  const db = {
    query: async () => [{ id: "football-data.org", payload: JSON.stringify({ status: "working", checkedAt: "2026-11-20T10:00:00.000Z" }) }],
  } as unknown as AnalyticsDatabase;
  try {
    const rows = await sourceRegistry(db, [{
      id: "coverage", leagueId: "england-championship", leagueName: "Championship", country: "England",
      provider: "football-data.org", sourceId: "ELC", season: "2025/26", environment: "real",
      state: "complete", cursor: 100, total: 120, imported: 100, finished: 90, withHt: 72,
      withXg: 0, statsChecked: 0, lastSyncedAt: "2026-11-21T08:00:00.000Z", error: null,
    }]);
    const footballData = rows.find((source) => source.id === "football-data.org")!;
    const openFootball = rows.find((source) => source.id === "openfootball")!;
    assert.equal(footballData.configured, true);
    assert.equal(footballData.status, "working");
    assert.equal(footballData.checkedAt, "2026-11-20T10:00:00.000Z");
    assert.equal(footballData.lastSuccessfulSync, "2026-11-21T08:00:00.000Z");
    assert.deepEqual(footballData.coverage, { matches: 100, total: 120, finished: 90, withHt: 72, withXg: 0, completenessPct: 83.33 });
    assert.equal(openFootball.configured, false);
    assert.equal(openFootball.status, "not_checked");
    assert.equal(JSON.stringify(rows).includes(sentinel), false);
  } finally {
    if (previous === undefined) delete process.env.FOOTBALL_DATA_API_KEY;
    else process.env.FOOTBALL_DATA_API_KEY = previous;
  }
});

test("source activation is scope-specific and refuses unknown rights or unacknowledged conditions", async () => {
  const rows = new Map<string, string>();
  rows.set("api-football", JSON.stringify({
    id: "api-football",
    activation: { internal: true, public: true },
  }));
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith("SELECT id,payload FROM fa_providers"))
        return [...rows].map(([id, payload]) => ({ id, payload }));
      if (sql.startsWith("INSERT INTO fa_providers")) {
        rows.set(String(params[0]), String(params[1]));
        return [];
      }
      return [];
    },
  } as unknown as AnalyticsDatabase;

  const initial = await sourceRegistry(db);
  assert.equal(initial.find((source) => source.id === "openfootball")?.enabled.public, true);
  assert.equal(initial.find((source) => source.id === "openligadb")?.enabled.internal, true);
  assert.equal(initial.find((source) => source.id === "openligadb")?.enabled.public, false);
  assert.equal(initial.find((source) => source.id === "api-football")?.canEnable.public, false);
  assert.equal(initial.find((source) => source.id === "api-football")?.enabled.internal, false);
  assert.equal(initial.find((source) => source.id === "api-football")?.enabled.public, false);
  assert.equal(initial.find((source) => source.id === "api-football")?.usage.requestsUsed, null);

  await assert.rejects(setSourceActivation(db, "openligadb", "public", true), /uslovi licence/i);
  await assert.rejects(setSourceActivation(db, "api-football", "public", true, true), /nisu potvrđena/i);
  const enabled = await setSourceActivation(db, "openligadb", "public", true, true);
  assert.equal(enabled?.enabled.public, true);
  assert.equal(await isSourceEnabled(db, "openligadb", "public"), true);
  const disabled = await setSourceActivation(db, "openligadb", "public", false);
  assert.equal(disabled?.enabled.public, false);
  assert.equal(await isSourceEnabled(db, "openligadb", "public"), false);
});
