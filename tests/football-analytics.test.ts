import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  openAnalyticsDatabase,
  migrateAnalytics,
  analyticsSchemaReady,
} from "../server/footballAnalytics/database.ts";
import {
  analyticsTotals,
  ingestMatch,
  matchVersionsBefore,
  readMatch,
  saveCatalog,
  readCoverage,
} from "../server/footballAnalytics/store.ts";
import {
  analyzeFromHistory,
  analyzeStoredMatch,
  belgradeDate,
  belgradeDayBounds,
  htftCounts,
  listAnalyticMatches,
  teamWindow,
} from "../server/footballAnalytics/analysis.ts";
import {
  normalizeFootballData,
  normalizeOpenLiga,
  normalizePitchMatch,
  numberOrNull,
} from "../server/footballAnalytics/normalization.ts";
import { importAnalyticsStep } from "../server/footballAnalytics/importer.ts";
import {
  pitchCatalog,
  recentSeasons,
} from "../server/footballAnalytics/providers.ts";
import { createAnalyticsHandler } from "../api/football-analytics.ts";
import type {
  AnalyticsLeague,
  AnalyticsMatch,
  MatchObservation,
} from "../src/types/footballAnalytics.ts";

const context = {
  leagueId: "bl1",
  leagueName: "Bundesliga",
  country: "Germany",
  season: "2026/2027",
  observedAt: "2026-11-01T20:00:00.000Z",
};
const raw = (id = 1) => ({
  matchID: id,
  matchDateTimeUTC: "2026-10-01T15:30:00Z",
  team1: { teamId: 1, teamName: "Home FC" },
  team2: { teamId: 2, teamName: "Away FC" },
  matchIsFinished: true,
  matchResults: [
    { resultTypeID: 1, pointsTeam1: 1, pointsTeam2: 0 },
    { resultTypeID: 2, pointsTeam1: 2, pointsTeam2: 1 },
  ],
  goals: [],
});
const observation = (id = 1) => normalizeOpenLiga(raw(id), context)!;
const stored = (id: number): AnalyticsMatch => ({
  ...observation(id),
  id: String(id),
  leagueId: "league",
  homeId: "home",
  awayId: "away",
  provenance: {},
  sources: [],
  kickoffAt: `2026-10-${String(id).padStart(2, "0")}T15:00:00.000Z`,
  observedAt: `2026-10-${String(id).padStart(2, "0")}T18:00:00.000Z`,
  xg: { home: 1.5, away: 0.5 },
});
const league: AnalyticsLeague = {
  id: "league",
  provider: "openligadb",
  sourceId: "bl1",
  name: "Bundesliga",
  country: "Germany",
  seasons: ["2026/2027"],
  environment: "real",
};

test("analytics schema is repeatable and persists after reopening a separate SQLite database", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "elite-analytics-"));
  const file = path.join(directory, "analysis.sqlite");
  let db = await openAnalyticsDatabase(file);
  try {
    await migrateAnalytics(db);
    await migrateAnalytics(db);
    await ingestMatch(db, observation());
    await db.close();
    db = await openAnalyticsDatabase(file);
    assert.equal((await analyticsTotals(db)).matches, 1);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test("schema probe distinguishes a missing schema from an unavailable database", async () => {
  const sqlite = await openAnalyticsDatabase(":memory:");
  try {
    assert.equal(await analyticsSchemaReady(sqlite), false);
    await migrateAnalytics(sqlite);
    assert.equal(await analyticsSchemaReady(sqlite), true);
  } finally {
    await sqlite.close();
  }
  const missing = { kind: "postgres", query: async () => { throw Object.assign(new Error("relation missing"), { code: "42P01" }); } };
  assert.equal(await analyticsSchemaReady(missing as any), false);
  const unavailable = { kind: "postgres", query: async () => { throw Object.assign(new Error("connection unavailable"), { code: "08006" }); } };
  await assert.rejects(analyticsSchemaReady(unavailable as any), { code: "08006" });
});
test("source IDs, cross-provider matching and rescheduling keep one internal match, with null-safe corrections", async () => {
  const db = await openAnalyticsDatabase(":memory:");
  try {
    await migrateAnalytics(db);
    const first = observation();
    assert.equal(await ingestMatch(db, first), "created");
    assert.equal(await ingestMatch(db, first), "unchanged");
    const id = (await db.query("SELECT id FROM fa_matches"))[0].id;
    const another: MatchObservation = {
      ...first,
      provider: "football-data.org",
      sourceId: "external",
      home: { ...first.home, sourceId: "h" },
      away: { ...first.away, sourceId: "a" },
      ht: { home: null, away: null },
      xg: { home: 1.2, away: 0.7 },
    };
    assert.equal(await ingestMatch(db, another), "updated");
    assert.equal((await analyticsTotals(db)).matches, 1);
    assert.equal((await readMatch(db, id))?.ht.home, 1);
    assert.equal(
      await ingestMatch(db, {
        ...another,
        kickoffAt: "2026-10-02T15:30:00.000Z",
        ft: { home: 3, away: 1 },
        observedAt: "2026-11-02T20:00:00.000Z",
      }),
      "updated",
    );
    const match = (await readMatch(db, id))!;
    assert.equal(match.ft.home, 3);
    assert.equal(match.kickoffAt, "2026-10-02T15:30:00.000Z");
    assert.equal((await analyticsTotals(db)).matches, 1);
  } finally {
    await db.close();
  }
});
test("ambiguous cross-provider kickoff stays unresolved instead of creating a duplicate", async () => {
  const db = await openAnalyticsDatabase(":memory:");
  try {
    await migrateAnalytics(db);
    await ingestMatch(db, observation());
    assert.equal(
      await ingestMatch(db, {
        ...observation(),
        provider: "football-data.org",
        sourceId: "new",
        kickoffAt: "2026-10-04T15:30:00.000Z",
      }),
      "unresolved",
    );
    assert.equal((await analyticsTotals(db)).matches, 1);
    assert.equal((await analyticsTotals(db)).unresolved, 1);
  } finally {
    await db.close();
  }
});
test("as-of versions exclude later corrections, late imports and matches not yet played", async () => {
  const db = await openAnalyticsDatabase(":memory:");
  try {
    await migrateAnalytics(db);
    const first = { ...observation(), observedAt: "2026-10-01T18:00:00.000Z" };
    await ingestMatch(db, first);
    const id = (await db.query("SELECT id FROM fa_matches"))[0].id;
    const match = (await readMatch(db, id))!;
    await ingestMatch(db, {
      ...first,
      observedAt: "2026-11-02T20:00:00.000Z",
      ft: { home: 9, away: 1 },
    });
    assert.equal((await readMatch(db, id))!.ft.home, 9);
    assert.equal(
      (await db.query("SELECT id FROM fa_versions WHERE match_id=$1", [id]))
        .length,
      2,
    );
    const historic = await matchVersionsBefore(db, "2026-11-01T00:00:00.000Z", [
      match.homeId,
    ]);
    assert.equal(historic[0].ft.home, 2);
    const target = {
      ...match,
      id: "future",
      kickoffAt: "2026-10-02T15:30:00.000Z",
      status: "scheduled" as const,
    };
    const result = analyzeFromHistory(
      target,
      [{ ...match, observedAt: "2026-11-02T20:00:00.000Z" }],
      "all",
      new Date("2026-11-03"),
    );
    assert.equal(result.home.last10.matches.length, 0);
  } finally {
    await db.close();
  }
});
test("same-provider corrections create versions without mutating the prior observation or replacing known facts with null", async () => {
  const db = await openAnalyticsDatabase(":memory:");
  try {
    await migrateAnalytics(db);
    const first = observation();
    await ingestMatch(db, first);
    const id = (await db.query("SELECT id FROM fa_matches"))[0].id;
    const revised = {
      ...first,
      ft: { home: 4, away: 2 },
      observedAt: "2026-11-02T20:00:00.000Z",
    };
    assert.equal(await ingestMatch(db, revised), "updated");
    assert.equal(first.ft.home, 2);
    assert.equal((await readMatch(db, id))!.ft.home, 4);
    assert.equal(
      await ingestMatch(db, { ...revised, ft: { home: null, away: null } }),
      "unchanged",
    );
    assert.equal((await readMatch(db, id))!.ft.home, 4);
    assert.equal(numberOrNull(0), 0);
    assert.equal(numberOrNull("0"), 0);
    assert.equal(numberOrNull(" "), null);
    assert.equal(numberOrNull(false), null);
  } finally {
    await db.close();
  }
});
test("the last-five xG denominator stays 4/5 and never substitutes a sixth older match", () => {
  const history = Array.from({ length: 6 }, (_, index) => stored(index + 1));
  history[4].xg.home = null;
  const target = { ...stored(12), status: "scheduled" as const };
  const result = analyzeFromHistory(
    target,
    history,
    "all",
    new Date("2026-11-03"),
  );
  assert.equal(result.home.last5.matches.length, 5);
  assert.equal(result.home.last5.metrics.xg.available, 4);
  assert.equal(result.home.last5.metrics.xg.total, 5);
  assert.equal(result.home.last5.metrics.xg.value, 1.5);
  assert.ok(!result.home.last5.matches.some((m) => m.id === "1"));
  assert.equal(result.home.last5.metrics.goalsMinusXg.available, 4);
});
test("HT/FT covers nine combinations, excludes unknown HT and preserves each fixture home/away orientation", () => {
  const pair = {
    1: { home: 1, away: 0 },
    X: { home: 0, away: 0 },
    2: { home: 0, away: 1 },
  };
  const matches = ["1", "X", "2"].flatMap((ht, i) =>
    ["1", "X", "2"].map((ft, j) => ({
      ...stored(i * 3 + j + 1),
      ht: pair[ht],
      ft: pair[ft],
      homeId: i % 2 ? "away" : "home",
      awayId: i % 2 ? "home" : "away",
    })),
  );
  const result = htftCounts([
    ...matches,
    { ...stored(15), ht: { home: null, away: null } },
  ]);
  assert.equal(result.length, 9);
  result.forEach((row) => {
    assert.equal(row.denominator, 9);
    assert.equal(row.count, 1);
  });
});
test("venue and competition windows are independent, with unknown optional statistics left null", () => {
  const history = Array.from({ length: 10 }, (_, index) => ({
    ...stored(index + 1),
    leagueId: index % 2 ? "cup" : "league",
    homeId: index % 3 ? "home" : "other",
    awayId: index % 3 ? "away" : "home",
  }));
  const target = { ...stored(20), status: "scheduled" as const };
  const all = analyzeFromHistory(
    target,
    history,
    "all",
    new Date("2026-11-03"),
  );
  const same = analyzeFromHistory(
    target,
    history,
    "league",
    new Date("2026-11-03"),
  );
  assert.equal(all.home.last10.matches.length, 10);
  assert.equal(same.home.last10.matches.length, 5);
  assert.ok(all.home.venue5.matches.every((m) => m.homeId === "home"));
  assert.equal(teamWindow([stored(1)], "home").metrics.shots.value, null);
});
test("Pitch normalization uses actual stat keys, zero values, lowercase goals, own goals and consistent HT", () => {
  const data = {
    id: "m_000001",
    status: "finished",
    time_utc: "2026-10-01T15:00:00Z",
    home_team: { id: "h", name: "Home" },
    away_team: { id: "a", name: "Away" },
    score_home: 1,
    score_away: 1,
  };
  const stats = {
    periods: [
      {
        period: "All",
        groups: [
          {
            items: [
              { key: "expected_goals", home: "0", away: "1.2" },
              { key: "ShotsOnTarget", home: "2", away: "3" },
            ],
          },
        ],
      },
    ],
  };
  const events = {
    events: [
      { event_type: "goal", minute: 20, team_id: "h" },
      { event_type: "goal", minute: 60, team_id: "a" },
    ],
  };
  const mapped = normalizePitchMatch(data, context, { stats, events }, true)!;
  assert.equal(mapped.xg.home, 0);
  assert.equal(mapped.shotsOnTarget.home, 2);
  assert.deepEqual(mapped.ht, { home: 1, away: 0 });
  assert.equal(mapped.environment, "test");
  assert.deepEqual(
    normalizePitchMatch(data, context, {
      stats,
      events: { events: events.events.slice(0, 1) },
    })!.ht,
    { home: null, away: null },
  );
  assert.deepEqual(
    normalizePitchMatch({ ...data, has_playoff: true }, context, {
      stats,
      events,
    })!.ft,
    { home: null, away: null },
  );
});
test("regular-time, extra-time and penalty scores remain separate in football-data normalization", () => {
  const match = normalizeFootballData(
    {
      id: 1,
      utcDate: "2026-10-01T15:00:00Z",
      status: "FINISHED",
      homeTeam: { id: 1, name: "A" },
      awayTeam: { id: 2, name: "B" },
      score: {
        duration: "PENALTY_SHOOTOUT",
        fullTime: { home: 6, away: 5 },
        regularTime: { home: 1, away: 1 },
        halfTime: { home: 0, away: 0 },
        extraTime: { home: 0, away: 0 },
        penalties: { home: 5, away: 4 },
      },
    },
    context,
  )!;
  assert.deepEqual(match.ft, { home: 1, away: 1 });
  assert.deepEqual(match.penalties, { home: 5, away: 4 });
});
test("Belgrade calendar handles UTC midnight and both daylight-saving boundaries", () => {
  assert.equal(belgradeDate("2026-11-01T23:30:00Z"), "2026-11-02");
  assert.equal(belgradeDate("2026-07-01T22:30:00Z"), "2026-07-02");
  assert.equal(belgradeDate("2026-03-29T22:30:00Z"), "2026-03-30");
  assert.equal(belgradeDate("2026-10-25T22:30:00Z"), "2026-10-25");
});
test("bounded imports checkpoint list data once, resume, repeat without duplicates and isolate test records", async () => {
  const db = await openAnalyticsDatabase(":memory:");
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(
      JSON.stringify([
        raw(1),
        {
          ...raw(2),
          team2: { teamId: 3, teamName: "Third" },
          matchDateTimeUTC: "2026-10-02T15:30:00Z",
        },
      ]),
    );
  };
  try {
    await migrateAnalytics(db);
    await saveCatalog(db, [league]);
    const id = (await readCoverage(db))[0].id;
    const first = await importAnalyticsStep(db, id, { batchSize: 1 });
    assert.equal(first.processed, 1);
    assert.equal(first.done, false);
    const second = await importAnalyticsStep(db, id, { batchSize: 1 });
    assert.equal(second.done, true);
    assert.equal(calls, 1);
    assert.equal((await analyticsTotals(db)).matches, 2);
    await importAnalyticsStep(db, id, { refresh: true });
    assert.equal((await analyticsTotals(db)).matches, 2);
    await ingestMatch(db, { ...observation(), environment: "test" });
    assert.equal((await analyticsTotals(db, "test")).matches, 1);
    assert.equal((await analyticsTotals(db)).matches, 2);
  } finally {
    globalThis.fetch = previous;
    await db.close();
  }
});
test("Pitch catalogue takes the actual key-visible leagues/seasons without assuming xG availability", async () => {
  const previous = globalThis.fetch,
    old = process.env.PITCHAPI_KEY;
  process.env.PITCHAPI_KEY = "pk_test_unit_fixture";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          leagues: [
            {
              id: "l_one",
              name: "League One",
              seasons: [
                "2022/2023",
                "2023/2024",
                "2024/2025",
                "2025/2026",
                "2026/2027",
              ],
              is_free: true,
            },
            {
              id: "l_two",
              name: "League Two",
              seasons: ["2026/2027"],
              is_free: true,
            },
            { id: "paid", name: "Paid", seasons: [], is_free: false },
          ],
        },
      }),
    );
  try {
    const rows = await pitchCatalog();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].environment, "test");
    assert.equal(rows[0].seasons.length, 4);
    assert.equal(rows[0].seasons[0], "2026/2027");
    assert.deepEqual(
      recentSeasons(["2035", "2025", "2024"], new Date("2026-11-12")),
      ["2025", "2024"],
    );
  } finally {
    globalThis.fetch = previous;
    if (old === undefined) delete process.env.PITCHAPI_KEY;
    else process.env.PITCHAPI_KEY = old;
  }
});
test("private routes reject guests and non-admins before opening the analytics database, including cron misuse", async () => {
  let opened = 0;
  const handler = createAnalyticsHandler(
    async () => false,
    async () => {
      opened++;
      throw new Error("Must not open");
    },
    () => false,
  );
  let status = 0,
    payload: any;
  const response = {
    setHeader() {},
    set statusCode(value: number) {
      status = value;
    },
    end(value: string) {
      payload = JSON.parse(value);
    },
  };
  await handler(
    {
      method: "GET",
      url: "/api/football-analytics?action=fixtures",
      headers: {},
    } as any,
    response as any,
  );
  assert.equal(status, 403);
  assert.equal(opened, 0);
  assert.ok(payload.error);
});
test("admin status reports database outages without offering a schema migration", async () => {
  const old = process.env.ANALYTICS_DATABASE_URL;
  process.env.ANALYTICS_DATABASE_URL = "postgresql://unused.invalid/test";
  try {
    const handler = createAnalyticsHandler(
      async () => true,
      async () => ({ kind: "postgres", query: async () => {
        throw Object.assign(new Error("connection unavailable"), { code: "08006" });
      } }) as any,
      () => false,
    );
    let status = 0;
    let payload: any;
    await handler(
      { method: "GET", url: "/api/football-analytics?action=status", headers: {} } as any,
      { setHeader() {}, set statusCode(value: number) { status = value; }, end(value: string) { payload = JSON.parse(value); } } as any,
    );
    assert.equal(status, 503);
    assert.match(payload.error, /baza.*nisu dostupni/i);
    assert.equal(payload.database?.ready, undefined);
  } finally {
    if (old === undefined) delete process.env.ANALYTICS_DATABASE_URL;
    else process.env.ANALYTICS_DATABASE_URL = old;
  }
});
test("SQL calendar bounds cover 23/25-hour Serbian days without truncating paginated fixtures", () => {
  const spring = belgradeDayBounds("2026-03-29"),
    autumn = belgradeDayBounds("2026-10-25");
  assert.equal(
    (Date.parse(spring.end) - Date.parse(spring.start)) / 3600000,
    23,
  );
  assert.equal(
    (Date.parse(autumn.end) - Date.parse(autumn.start)) / 3600000,
    25,
  );
});

test("analytics read routes query stored data without fetching sports APIs or mutating records", async () => {
  const db = await openAnalyticsDatabase(":memory:");
  const previous = globalThis.fetch;
  try {
    await migrateAnalytics(db);
    await ingestMatch(db, observation());
    const storedId = (await db.query("SELECT id FROM fa_matches"))[0].id;
    globalThis.fetch = async () => {
      throw new Error("Read page must not call a provider");
    };
    const before = (await analyticsTotals(db)).matches;
    const result = await listAnalyticMatches(db, "2026-10-01");
    assert.equal(result.matches.length, 1);
    const analysis = await analyzeStoredMatch(db, storedId);
    assert.equal(analysis!.home.last5.matches.length, 0);
    assert.equal((await analyticsTotals(db)).matches, before);
  } finally {
    globalThis.fetch = previous;
    await db.close();
  }
});
