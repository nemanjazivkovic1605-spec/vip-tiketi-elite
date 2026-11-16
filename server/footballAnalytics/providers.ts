import type {
  AnalyticsLeague,
  CoverageRow,
  MatchObservation,
} from "../../src/types/footballAnalytics.js";
import {
  hashId,
  countryName,
  normalizeFootballData,
  normalizeOpenLiga,
  normalizePitchMatch,
} from "./normalization.js";
import { cachedSportsJson } from "../freeFootballFeeds.js";

export class AnalyticsProviderError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(`Izvor je odbio zahtev (${status}, ${code}).`);
  }
}
export const recentSeasons = (seasons: string[], now = new Date()) =>
  [...new Set(seasons)]
    .filter(
      (s) =>
        /^20\d{2}(?:[/-](?:20)?\d{2})?$/.test(s) &&
        Number(s.slice(0, 4)) <=
          Number(
            new Intl.DateTimeFormat("en", {
              year: "numeric",
              timeZone: "Europe/Belgrade",
            }).format(now),
          ),
    )
    .sort((a, b) => Number(b.slice(0, 4)) - Number(a.slice(0, 4)))
    .slice(0, 4);

export async function pitchGet(path: string): Promise<any> {
  const key = process.env.PITCHAPI_KEY?.trim();
  if (!key) throw new AnalyticsProviderError(503, "PITCHAPI_KEY_MISSING");
  if (
    !/^\/v1\/(leagues(?:\/[a-zA-Z0-9_]+(?:\/matches)?)?|matches\/[a-zA-Z0-9_]+(?:\/(stats|events|shots))?)(?:\?[^#]*)?$/.test(
      path,
    )
  )
    throw new Error("Nedozvoljen PitchAPI endpoint.");
  const response = await fetch(`https://api.pitchapi.dev${path}`, {
    headers: { "X-API-KEY": key },
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error)
    throw new AnalyticsProviderError(
      response.status,
      String(body?.error?.code || "UPSTREAM_ERROR").slice(0, 80),
    );
  if (!body || !("data" in body))
    throw new AnalyticsProviderError(502, "INVALID_RESPONSE");
  return body.data;
}
export async function pitchCatalog(): Promise<AnalyticsLeague[]> {
  const data = await pitchGet("/v1/leagues");
  if (!Array.isArray(data.leagues))
    throw new AnalyticsProviderError(502, "INVALID_CATALOG");
  const test =
    process.env.PITCHAPI_KEY?.trim().startsWith("pk_test_") ||
    data.environment === "test" ||
    data.is_test === true;
  // An unrecognised credential cannot silently label fixture data as production.
  if (!test && !process.env.PITCHAPI_KEY?.trim().startsWith("pk_live_"))
    throw new AnalyticsProviderError(422, "UNVERIFIED_KEY_ENVIRONMENT");
  return data.leagues
    .filter((l: any) => l.is_free !== false && l.id && l.name)
    .map((l: any) => ({
      id: hashId("pitchapi", l.id, test ? "test" : "real"),
      provider: "pitchapi",
      sourceId: String(l.id),
      name: l.name,
      country: countryName(l.country_code),
      seasons: recentSeasons(l.seasons || []),
      environment: test ? "test" : "real",
    }));
}
export async function footballDataCatalog(): Promise<AnalyticsLeague[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (!key)
    throw new AnalyticsProviderError(503, "FOOTBALL_DATA_API_KEY_MISSING");
  const data = await cachedSportsJson(
    new URL("https://api.football-data.org/v4/competitions"),
    { "X-Auth-Token": key },
  );
  return (data.competitions || [])
    .filter((l: any) => l.id && l.name && l.plan === "TIER_ONE")
    .map((l: any) => {
      const start = Number(l.currentSeason?.startDate?.slice(0, 4));
      const split =
        l.currentSeason?.startDate?.slice(0, 4) !==
        l.currentSeason?.endDate?.slice(0, 4);
      return {
        id: hashId("football-data.org", String(l.id)),
        provider: "football-data.org",
        sourceId: String(l.id),
        name: l.name,
        country: l.area?.name || "",
        seasons: recentSeasons(
          [0, 1, 2, 3].map((i) =>
            split ? `${start - i}/${start - i + 1}` : String(start - i),
          ),
        ),
        environment: "real",
      };
    });
}
export async function openLigaCatalog(): Promise<AnalyticsLeague[]> {
  const data = await cachedSportsJson(
    new URL("https://api.openligadb.de/getavailableleagues"),
    {},
    60 * 60000,
  );
  if (!Array.isArray(data))
    throw new AnalyticsProviderError(502, "INVALID_CATALOG");
  // Reuse only the official German divisions already supported by this project.
  return ["bl1", "bl2", "bl3"]
    .map((id) => {
      const rows = data.filter((l: any) => l.leagueShortcut === id);
      return {
        id: hashId("openligadb", id),
        provider: "openligadb",
        sourceId: id,
        name:
          id === "bl1"
            ? "Bundesliga"
            : id === "bl2"
              ? "2. Bundesliga"
              : "3. Liga",
        country: "Germany",
        seasons: recentSeasons(
          rows.map(
            (l: any) => `${l.leagueSeason}/${Number(l.leagueSeason) + 1}`,
          ),
        ),
        environment: "real",
      } as AnalyticsLeague;
    })
    .filter((l) => l.seasons.length > 0);
}
export async function fetchSeason(row: CoverageRow): Promise<any[]> {
  if (row.provider === "pitchapi") {
    const data = await pitchGet(
      `/v1/leagues/${encodeURIComponent(row.sourceId)}/matches?season=${encodeURIComponent(row.season)}&status=all`,
    );
    if (!Array.isArray(data.matches))
      throw new AnalyticsProviderError(502, "INVALID_MATCH_LIST");
    return data.matches;
  }
  if (row.provider === "football-data.org") {
    const key = process.env.FOOTBALL_DATA_API_KEY?.trim();
    if (!key)
      throw new AnalyticsProviderError(503, "FOOTBALL_DATA_API_KEY_MISSING");
    const data = await cachedSportsJson(
      new URL(
        `https://api.football-data.org/v4/competitions/${row.sourceId}/matches?season=${row.season.slice(0, 4)}`,
      ),
      { "X-Auth-Token": key },
      15 * 60000,
    );
    if (!Array.isArray(data.matches))
      throw new AnalyticsProviderError(502, "INVALID_MATCH_LIST");
    return data.matches;
  }
  const data = await cachedSportsJson(
    new URL(
      `https://api.openligadb.de/getmatchdata/${row.sourceId}/${row.season.slice(0, 4)}`,
    ),
    {},
    15 * 60000,
  );
  if (!Array.isArray(data))
    throw new AnalyticsProviderError(502, "INVALID_MATCH_LIST");
  return data;
}
export async function normalizeProviderMatch(
  raw: any,
  row: CoverageRow,
): Promise<MatchObservation | null> {
  const context = {
    leagueId: row.sourceId,
    leagueName: row.leagueName,
    country: row.country,
    season: row.season,
  };
  if (row.provider === "football-data.org")
    return normalizeFootballData(raw, context);
  if (row.provider === "openligadb") return normalizeOpenLiga(raw, context);
  const details: Record<string, any> = {};
  if (/finished|^ft$/.test(raw.status)) {
    for (const endpoint of ["stats", "events", "shots"]) {
      try {
        details[endpoint] = await pitchGet(
          `/v1/matches/${encodeURIComponent(raw.id)}/${endpoint}`,
        );
      } catch (error) {
        if (
          !(error instanceof AnalyticsProviderError) ||
          ![404, 204].includes(error.status)
        )
          throw error;
        details[endpoint] = null;
      }
    }
  }
  return normalizePitchMatch(raw, context, details, row.environment === "test");
}
