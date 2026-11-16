import type { AnalyticsDatabase } from "./database.js";
import type {
  AnalyticsEnvironment,
  AnalyticsLeague,
  AnalyticsMatch,
  CoverageRow,
  MatchObservation,
} from "../../src/types/footballAnalytics.js";
import {
  completeScore,
  hashId,
  leagueKey,
  mergeObservation,
  nameKey,
} from "./normalization.js";

const parse = <T>(row: Record<string, any>): T => JSON.parse(row.payload);
export const coverageId = (
  provider: string,
  league: string,
  season: string,
  environment: string,
) => hashId(provider, league, season, environment);
export async function saveProviderStatus(
  db: AnalyticsDatabase,
  id: string,
  status: string,
  message: string,
  environment = "real",
) {
  await db.query(
    "INSERT INTO fa_providers(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    [
      id,
      JSON.stringify({
        id,
        status,
        message,
        environment,
        checkedAt: new Date().toISOString(),
      }),
    ],
  );
}
export async function saveCatalog(
  db: AnalyticsDatabase,
  leagues: AnalyticsLeague[],
) {
  await db.transaction(async (tx) => {
    for (const league of leagues) {
      await tx.query(
        "INSERT INTO fa_leagues(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
        [league.id, JSON.stringify(league)],
      );
      for (const season of league.seasons) {
        const id = coverageId(
          league.provider,
          league.sourceId,
          season,
          league.environment,
        );
        const row: CoverageRow = {
          id,
          leagueId: leagueKey(league.name, league.country),
          leagueName: league.name,
          country: league.country,
          provider: league.provider,
          sourceId: league.sourceId,
          season,
          environment: league.environment,
          state: "unverified",
          cursor: 0,
          total: 0,
          imported: 0,
          finished: 0,
          withHt: 0,
          withXg: 0,
          statsChecked: 0,
          lastSyncedAt: null,
          error: null,
        };
        await tx.query(
          "INSERT INTO fa_coverage(id,payload) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
          [id, JSON.stringify(row)],
        );
      }
    }
  });
}
export async function readCoverage(
  db: AnalyticsDatabase,
): Promise<CoverageRow[]> {
  return (await db.query("SELECT payload FROM fa_coverage ORDER BY id"))
    .map((row) => parse<CoverageRow>(row))
    .sort(
      (a, b) =>
        a.leagueName.localeCompare(b.leagueName) ||
        b.season.localeCompare(a.season),
    );
}
export async function getCoverage(
  db: AnalyticsDatabase,
  id: string,
): Promise<CoverageRow | null> {
  const row = (
    await db.query("SELECT payload FROM fa_coverage WHERE id=$1", [id])
  )[0];
  return row ? parse<CoverageRow>(row) : null;
}
export async function writeCoverage(db: AnalyticsDatabase, row: CoverageRow) {
  await db.query("UPDATE fa_coverage SET payload=$1 WHERE id=$2", [
    JSON.stringify(row),
    row.id,
  ]);
}
const semantic = (match: AnalyticsMatch) =>
  JSON.stringify({
    ...match,
    observedAt: "",
    lastCheckedAt: "",
    provenance: Object.fromEntries(
      Object.entries(match.provenance).map(([key, value]) => [
        key,
        { ...value, observedAt: "" },
      ]),
    ),
  });

export async function ingestMatch(
  db: AnalyticsDatabase,
  observation: MatchObservation,
  options: { dryRun?: boolean; onPreview?: (match: AnalyticsMatch) => void } = {},
): Promise<"created" | "updated" | "unchanged" | "unresolved"> {
  if (
    ![
      observation.sourceId,
      observation.home.sourceId,
      observation.away.sourceId,
    ].every((id) => id && id !== "undefined") ||
    !(observation.kickoffAt ? Number.isFinite(Date.parse(observation.kickoffAt)) : /^\d{4}-\d{2}-\d{2}$/.test(observation.matchDate || '')) ||
    !Number.isFinite(Date.parse(observation.observedAt))
  )
    throw new Error("Izvor je vratio neispravan identitet ili vreme meča.");
  const run = async (tx: AnalyticsDatabase) => {
    const env = observation.environment;
    const canonicalLeague = leagueKey(
      observation.league.name,
      observation.league.country,
    );
    // Serialize the same fixture identity across providers, not just one import job.
    if (!options.dryRun && tx.kind === "postgres")
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        hashId(
          env,
          canonicalLeague,
          observation.season,
          nameKey(observation.home.name),
          nameKey(observation.away.name),
        ),
      ]);
    const source = (
      await tx.query(
        "SELECT match_id FROM fa_sources WHERE provider=$1 AND source_id=$2 AND environment=$3",
        [observation.provider, observation.sourceId, env],
      )
    )[0];
    let previous: AnalyticsMatch | null = source
      ? await readMatch(tx, source.match_id)
      : null;
    if (!source) {
      const candidates = (
        await tx.query(
          "SELECT payload FROM fa_matches WHERE environment=$1 AND league_id=$2 AND season=$3 AND home_key=$4 AND away_key=$5",
          [
            env,
            canonicalLeague,
            observation.season,
            nameKey(observation.home.name),
            nameKey(observation.away.name),
          ],
        )
      ).map((row) => parse<AnalyticsMatch>(row));
      const sameTime = candidates.filter(
        (row) =>
          row.kickoffAt && observation.kickoffAt
            ? Math.abs(Date.parse(row.kickoffAt) - Date.parse(observation.kickoffAt)) <= 10 * 60000
            : (row.matchDate || row.kickoffAt?.slice(0, 10)) === (observation.matchDate || observation.kickoffAt?.slice(0, 10)),
      );
      if (sameTime.length === 1) previous = sameTime[0];
      else if (candidates.length) {
        const id = hashId(observation.provider, observation.sourceId, env);
        if (!options.dryRun) await tx.query(
          "INSERT INTO fa_unresolved(id,reason,payload,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,reason=excluded.reason",
          [
            id,
            sameTime.length > 1
              ? "Dvosmisleno poklapanje mečeva."
              : "Moguće pomeranje termina; potrebna provera identiteta.",
            JSON.stringify(observation),
            observation.observedAt,
          ],
        );
        return "unresolved";
      }
    }
    const alias = async (sourceId: string) =>
      (
        await tx.query(
          "SELECT team_id FROM fa_aliases WHERE provider=$1 AND source_id=$2 AND environment=$3",
          [observation.provider, sourceId, env],
        )
      )[0]?.team_id;
    const id =
      previous?.id || hashId(observation.provider, observation.sourceId, env);
    const homeId =
      previous?.homeId ||
      (await alias(observation.home.sourceId)) ||
      hashId(observation.provider, observation.home.sourceId, env);
    const awayId =
      previous?.awayId ||
      (await alias(observation.away.sourceId)) ||
      hashId(observation.provider, observation.away.sourceId, env);
    const merged = mergeObservation(previous, observation, {
      id,
      leagueId: canonicalLeague,
      homeId,
      awayId,
    });
    const changed = !previous || semantic(previous) !== semantic(merged);
    if (options.dryRun) {
      options.onPreview?.(merged);
      return !previous ? 'created' : changed ? 'updated' : 'unchanged';
    }
    if (!changed) {
      await tx.query('UPDATE fa_matches SET checked_at=$1 WHERE id=$2', [observation.observedAt, id]);
      return 'unchanged';
    }
    await tx.query(
      "INSERT INTO fa_sources(provider,source_id,environment,match_id) VALUES($1,$2,$3,$4) ON CONFLICT(provider,source_id,environment) DO NOTHING",
      [observation.provider, observation.sourceId, env, id],
    );
    for (const [external, internal] of [
      [observation.home.sourceId, homeId],
      [observation.away.sourceId, awayId],
    ]) {
      await tx.query(
        "INSERT INTO fa_aliases(provider,source_id,environment,team_id) VALUES($1,$2,$3,$4) ON CONFLICT(provider,source_id,environment) DO NOTHING",
        [observation.provider, external, env, internal],
      );
    }
    for (const [id, team] of [[homeId, merged.home], [awayId, merged.away]] as const) {
      await tx.query('INSERT INTO fa_teams(id,environment,name,payload) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,payload=excluded.payload',
        [id, env, team.name, JSON.stringify({ id, name: team.name, country: merged.league.country })]);
    }
    const payload = JSON.stringify(merged);
    await tx.query(
      `INSERT INTO fa_matches(id,league_id,season,environment,kickoff_at,home_id,away_id,home_key,away_key,status,finished_complete,has_ht,has_xg,stats_checked,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(id) DO UPDATE SET league_id=excluded.league_id,season=excluded.season,kickoff_at=excluded.kickoff_at,
      home_id=excluded.home_id,away_id=excluded.away_id,home_key=excluded.home_key,away_key=excluded.away_key,status=excluded.status,
      finished_complete=excluded.finished_complete,has_ht=excluded.has_ht,has_xg=excluded.has_xg,stats_checked=excluded.stats_checked,payload=excluded.payload`,
      [
        id,
        canonicalLeague,
        merged.season,
        env,
        merged.kickoffAt || merged.matchDate,
        homeId,
        awayId,
        nameKey(merged.home.name),
        nameKey(merged.away.name),
        merged.status,
        Number(merged.status === "finished" && completeScore(merged.ft)),
        Number(completeScore(merged.ht)),
        Number(merged.xg.home !== null && merged.xg.away !== null),
        Number(merged.statsChecked),
        payload,
      ],
    );
    // Only observed versions may be used for historical as-of analysis. Never backdate knowledge.
    await tx.query(
      `INSERT INTO fa_versions(id,match_id,available_at,league_id,home_id,away_id,kickoff_at,environment,status,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING`,
      [
        hashId(id, observation.observedAt, semantic(merged)),
        id,
        observation.observedAt,
        canonicalLeague,
        homeId,
        awayId,
        merged.kickoffAt || merged.matchDate,
        env,
        merged.status,
        payload,
      ],
    );
    await tx.query("DELETE FROM fa_unresolved WHERE id=$1", [
      hashId(observation.provider, observation.sourceId, env),
    ]);
    await tx.query('UPDATE fa_matches SET checked_at=$1 WHERE id=$2', [observation.observedAt, id]);
    return previous ? "updated" : "created";
  };
  return options.dryRun ? run(db) : db.transaction(run);
}
export async function readMatch(
  db: AnalyticsDatabase,
  id: string,
): Promise<AnalyticsMatch | null> {
  const row = (
    await db.query("SELECT payload,checked_at FROM fa_matches WHERE id=$1", [id])
  )[0];
  return row ? { ...parse<AnalyticsMatch>(row), ...(row.checked_at ? { lastCheckedAt: row.checked_at } : {}) } : null;
}
export async function matchVersionsBefore(
  db: AnalyticsDatabase,
  asOf: string,
  teamIds: string[],
  environment: AnalyticsEnvironment = "real",
  limit = 8000,
): Promise<AnalyticsMatch[]> {
  if (!teamIds.length) return [];
  const placeholders = teamIds.map((_, index) => `$${index + 3}`).join(",");
  const rows = await db.query(
    `SELECT payload FROM (
    SELECT payload,status,kickoff_at,ROW_NUMBER() OVER(PARTITION BY match_id ORDER BY available_at DESC,id DESC) AS rank
    FROM fa_versions WHERE environment=$1 AND available_at <= $2 AND (home_id IN (${placeholders}) OR away_id IN (${placeholders}))
  ) versions WHERE rank=1 AND status='finished' AND kickoff_at < $2 ORDER BY kickoff_at DESC LIMIT ${Math.min(8000, Math.max(1, limit))}`,
    [environment, asOf, ...teamIds],
  );
  return rows.map((row) => parse<AnalyticsMatch>(row));
}
export async function coverageCounts(
  db: AnalyticsDatabase,
  row: CoverageRow,
): Promise<CoverageRow> {
  const matches = (
    await db.query(
      `SELECT DISTINCT m.payload FROM fa_matches m JOIN fa_sources s ON s.match_id=m.id
    WHERE m.league_id=$1 AND m.season=$2 AND m.environment=$3 AND s.provider=$4`,
      [row.leagueId, row.season, row.environment, row.provider],
    )
  ).map((item) => parse<AnalyticsMatch>(item));
  return {
    ...row,
    imported: matches.length,
    finished: matches.filter(
      (m) => m.status === "finished" && completeScore(m.ft),
    ).length,
    withHt: matches.filter(
      (m) =>
        m.status === "finished" && completeScore(m.ft) && completeScore(m.ht),
    ).length,
    withXg: matches.filter(
      (m) =>
        m.status === "finished" && m.xg.home !== null && m.xg.away !== null,
    ).length,
    statsChecked: matches.filter((m) => m.statsChecked).length,
  };
}
export async function analyticsTotals(
  db: AnalyticsDatabase,
  environment = "real",
) {
  const row = (
    await db.query(
      `SELECT COUNT(DISTINCT league_id) AS leagues, COUNT(*) AS matches, COALESCE(SUM(finished_complete),0) AS finished,
    COALESCE(SUM(CASE WHEN finished_complete=1 THEN has_ht ELSE 0 END),0) AS with_ht, COALESCE(SUM(has_xg),0) AS with_xg
    FROM fa_matches WHERE environment=$1`,
      [environment],
    )
  )[0];
  return {
    leagues: Number(row.leagues),
    matches: Number(row.matches),
    finished: Number(row.finished),
    withHt: Number(row.with_ht),
    withXg: Number(row.with_xg),
    unresolved: Number(
      (await db.query("SELECT COUNT(*) AS count FROM fa_unresolved"))[0].count,
    ),
  };
}
