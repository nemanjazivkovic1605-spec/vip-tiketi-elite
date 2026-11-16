import { createHash } from "node:crypto";
import type {
  MatchObservation,
  AnalyticsMatch,
  ScorePair,
  AnalyticsEvent,
} from "../../src/types/footballAnalytics.js";
import { footballDataRegularScore } from "../resultScores.js";
import { englishClubName, englishLeague } from './englishPyramid.js';

export const hashId = (...parts: string[]) =>
  createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
export const nameKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|afc|cf|sc)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
const countries: Record<string, string> = {
  ENG: "England",
  DEU: "Germany",
  GER: "Germany",
  FRA: "France",
  ESP: "Spain",
  ITA: "Italy",
  GBR: "England",
};
export const countryName = (value = "") =>
  countries[value.toUpperCase()] || value;
export const leagueKey = (name: string, country: string) =>
  hashId(
    countryName(country).toLowerCase(),
    nameKey(
      (countryName(country) === 'England' ? englishLeague(name)?.name || name : name)
        .replace(/\b20\d{2}(\s*[/-]\s*20?\d{2})?\b/g, "")
        .replace(/^English\s+/i, "")
        .replace(/^1\.\s*Bundesliga/i, "Bundesliga"),
    ),
  );
export const numberOrNull = (value: unknown): number | null =>
  (typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "")) &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0
    ? Number(value)
    : null;
const score = (a: unknown, b: unknown): ScorePair => ({
  home: numberOrNull(a),
  away: numberOrNull(b),
});
export const completeScore = (s: ScorePair) =>
  Number.isInteger(s.home) &&
  Number.isInteger(s.away) &&
  s.home! >= 0 &&
  s.away! >= 0;
const empty = (): ScorePair => ({ home: null, away: null });
type Context = {
  leagueId: string;
  leagueName: string;
  country: string;
  season: string;
  observedAt?: string;
};

export function normalizePitchMatch(
  raw: any,
  context: Context,
  details: { stats?: any; events?: any; shots?: any } = {},
  test = false,
): MatchObservation | null {
  if (
    !raw.id ||
    !raw.home_team?.name ||
    !raw.away_team?.name ||
    !Number.isFinite(Date.parse(raw.time_utc))
  )
    return null;
  const homeId = String(raw.home_team.id),
    awayId = String(raw.away_team.id);
  const side = (id: unknown) =>
    String(id) === homeId
      ? ("home" as const)
      : String(id) === awayId
        ? ("away" as const)
        : null;
  const events: AnalyticsEvent[] | null = Array.isArray(details.events?.events)
    ? details.events.events.map((event: any) => ({
        type: /^goal$/i.test(event.event_type)
          ? "Goal"
          : /redcard|secondyellow/i.test(event.event_type)
            ? "RedCard"
            : String(event.event_type || ""),
        minute: numberOrNull(event.minute),
        added: numberOrNull(event.minute_added),
        side:
          event.is_own_goal === true && side(event.team_id)
            ? side(event.team_id) === "home"
              ? "away"
              : "home"
            : side(event.team_id),
        penalty:
          typeof event.is_penalty === "boolean" ? event.is_penalty : null,
        score: score(event.score_home, event.score_away),
      }))
    : null;
  const hasExtraTime =
    raw.has_playoff === true || /extra|penalt/i.test(raw.status);
  const ft = hasExtraTime
    ? score(raw.score_90_home, raw.score_90_away)
    : score(raw.score_home, raw.score_away);
  let ht = score(raw.score_halftime_home, raw.score_halftime_away);
  // Derive HT only from a complete, score-consistent goal timeline, never from a partial feed.
  if (!completeScore(ht) && events && completeScore(ft) && !hasExtraTime) {
    const goals = events.filter((e) => e.type === "Goal");
    if (
      goals.length === ft.home! + ft.away! &&
      goals.every((e) => e.minute !== null && e.side) &&
      goals.filter((e) => e.side === "home").length === ft.home &&
      goals.filter((e) => e.side === "away").length === ft.away
    ) {
      ht = {
        home: goals.filter((e) => e.side === "home" && e.minute! <= 45).length,
        away: goals.filter((e) => e.side === "away" && e.minute! <= 45).length,
      };
    }
  }
  const all = (details.stats?.periods || []).find(
    (period: any) => period.period === "All",
  );
  const items = (all?.groups || []).flatMap((group: any) => group.items || []);
  const stat = (...keys: string[]) => {
    if (hasExtraTime) return empty();
    const keyOf = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const item = items.find((item: any) =>
      keys.some((key) => keyOf(key) === keyOf(String(item.key || ""))),
    );
    return score(item?.home, item?.away);
  };
  const individualShots = Array.isArray(details.shots?.periods)
    ? details.shots.periods
        .filter((p: any) => ["FirstHalf", "SecondHalf"].includes(p.period))
        .flatMap((p: any) =>
          (p.shots || []).map((s: any) => ({
            id: String(s.id),
            side: side(s.team_id),
            minute: numberOrNull(s.minute),
            xg: numberOrNull(s.expected_goals),
            onTarget:
              typeof s.is_on_target === "boolean" ? s.is_on_target : null,
            penalty: s.situation ? /penalty/i.test(s.situation) : null,
            x: numberOrNull(s.x),
            y: numberOrNull(s.y),
          })),
        )
    : null;
  return {
    provider: "pitchapi",
    sourceId: String(raw.id),
    environment: test ? "test" : "real",
    league: {
      sourceId: context.leagueId,
      name: context.leagueName,
      country: countryName(context.country),
    },
    season: context.season,
    kickoffAt: new Date(raw.time_utc).toISOString(),
    home: { sourceId: homeId, name: countryName(context.country) === 'England' ? englishClubName(raw.home_team.name) : raw.home_team.name },
    away: { sourceId: awayId, name: countryName(context.country) === 'England' ? englishClubName(raw.away_team.name) : raw.away_team.name },
    status: /finished|^ft$|extra_time_finished|penalties_finished/.test(
      raw.status,
    )
      ? "finished"
      : /not_started|scheduled|upcoming/.test(raw.status)
        ? "scheduled"
        : /postpon/.test(raw.status)
          ? "postponed"
          : /cancel/.test(raw.status)
            ? "canceled"
            : /live|half|playing/.test(raw.status)
              ? "live"
              : "unknown",
    ht,
    ft,
    extraTime: score(raw.score_extra_home, raw.score_extra_away),
    penalties: score(raw.score_penalty_home, raw.score_penalty_away),
    xg: stat("expected_goals"),
    nonPenaltyXg: stat("expected_goals_non_penalty"),
    shots: stat("total_shots", "shots"),
    shotsOnTarget: stat("shots_on_target", "shots_on_goal"),
    eventCoverage: {
      goals: events !== null,
      penalties: events !== null,
      redCards: events !== null,
    },
    events,
    individualShots,
    observedAt: context.observedAt || new Date().toISOString(),
    statsChecked: details.stats !== undefined,
  };
}

export function normalizeFootballData(
  raw: any,
  context: Context,
): MatchObservation | null {
  if (
    !raw.id ||
    !raw.homeTeam?.name ||
    !raw.awayTeam?.name ||
    !Number.isFinite(Date.parse(raw.utcDate))
  )
    return null;
  const statuses: Record<string, MatchObservation["status"]> = {
    FINISHED: "finished",
    SCHEDULED: "scheduled",
    TIMED: "scheduled",
    IN_PLAY: "live",
    PAUSED: "live",
    POSTPONED: "postponed",
    CANCELLED: "canceled",
  };
  return {
    provider: "football-data.org",
    sourceId: String(raw.id),
    environment: "real",
    league: {
      sourceId: context.leagueId,
      name: context.leagueName,
      country: countryName(context.country),
    },
    season: context.season,
    kickoffAt: new Date(raw.utcDate).toISOString(),
    home: { sourceId: String(raw.homeTeam.id), name: countryName(context.country) === 'England' ? englishClubName(raw.homeTeam.name) : raw.homeTeam.name },
    away: { sourceId: String(raw.awayTeam.id), name: countryName(context.country) === 'England' ? englishClubName(raw.awayTeam.name) : raw.awayTeam.name },
    status: statuses[raw.status] || "unknown",
    ht: score(raw.score?.halfTime?.home, raw.score?.halfTime?.away),
    ft: footballDataRegularScore(raw.score),
    extraTime: score(raw.score?.extraTime?.home, raw.score?.extraTime?.away),
    penalties: score(raw.score?.penalties?.home, raw.score?.penalties?.away),
    xg: empty(),
    shots: empty(),
    shotsOnTarget: empty(),
    events: null,
    individualShots: null,
    observedAt: context.observedAt || new Date().toISOString(),
    statsChecked: false,
  };
}

export function normalizeOpenLiga(
  raw: any,
  context: Context,
): MatchObservation | null {
  if (
    !raw.matchID ||
    !raw.team1?.teamName ||
    !raw.team2?.teamName ||
    !Number.isFinite(Date.parse(raw.matchDateTimeUTC))
  )
    return null;
  const final = (raw.matchResults || []).find((s: any) => s.resultTypeID === 2),
    half = (raw.matchResults || []).find((s: any) => s.resultTypeID === 1);
  const events: AnalyticsEvent[] | null = Array.isArray(raw.goals)
    ? raw.goals.map((goal: any) => ({
        type: "Goal",
        minute: numberOrNull(goal.matchMinute),
        added: null,
        side: null,
        penalty: typeof goal.isPenalty === "boolean" ? goal.isPenalty : null,
        score: score(goal.scoreTeam1, goal.scoreTeam2),
      }))
    : null;
  return {
    provider: "openligadb",
    sourceId: String(raw.matchID),
    environment: "real",
    league: {
      sourceId: context.leagueId,
      name: context.leagueName,
      country: "Germany",
    },
    season: context.season,
    kickoffAt: new Date(raw.matchDateTimeUTC).toISOString(),
    home: { sourceId: String(raw.team1.teamId), name: raw.team1.teamName },
    away: { sourceId: String(raw.team2.teamId), name: raw.team2.teamName },
    status: raw.matchIsFinished ? "finished" : "scheduled",
    ht: score(half?.pointsTeam1, half?.pointsTeam2),
    ft: score(final?.pointsTeam1, final?.pointsTeam2),
    extraTime: empty(),
    penalties: empty(),
    xg: empty(),
    shots: empty(),
    shotsOnTarget: empty(),
    events,
    individualShots: null,
    eventCoverage: {
      goals: events !== null,
      penalties: events !== null && events.every((e) => e.penalty !== null),
      redCards: false,
    },
    observedAt: context.observedAt || new Date().toISOString(),
    statsChecked: false,
  };
}

const priority = { manual: 4, pitchapi: 3, "football-data.org": 2, "football-data.co.uk": 1, openligadb: 1, openfootball: 1 };
export function mergeObservation(
  previous: AnalyticsMatch | null,
  next: MatchObservation,
  identity: { id: string; leagueId: string; homeId: string; awayId: string },
): AnalyticsMatch {
  const merged = {
    ...(previous ? structuredClone(previous) : {}),
    ...identity,
    sources: [...(previous?.sources || [])],
    provenance: { ...(previous?.provenance || {}) },
  } as AnalyticsMatch;
  const merge = (target: any, incoming: any, prefix = "") => {
    for (const [key, value] of Object.entries(incoming)) {
      if (value === null || value === undefined) continue;
      const field = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object" && !Array.isArray(value)) {
        target[key] ||= {};
        merge(target[key], value, field);
        continue;
      }
      const source = merged.provenance[field];
      if (
        target[key] != null &&
        source &&
        priority[source.provider] > priority[next.provider]
      )
        continue;
      if (
        Array.isArray(value) &&
        value.length === 0 &&
        target[key]?.length &&
        source?.provider !== next.provider
      )
        continue;
      target[key] = value;
      merged.provenance[field] = {
        provider: next.provider,
        sourceId: next.sourceId,
        observedAt: next.observedAt,
      };
    }
  };
  merge(merged, next);
  // Null is meaningful absence; initialize it for new rows without replacing known facts.
  for (const key of [
    "ht",
    "ft",
    "extraTime",
    "penalties",
    "xg",
    "nonPenaltyXg",
    "shots",
    "shotsOnTarget",
  ] as const)
    merged[key] = { home: null, away: null, ...merged[key] };
  merged.events ??= null;
  merged.individualShots ??= null;
  merged.kickoffAt ??= null;
  merged.observedAt = next.observedAt;
  if (
    !merged.sources.some(
      (s) => s.provider === next.provider && s.sourceId === next.sourceId,
    )
  )
    merged.sources.push({ provider: next.provider, sourceId: next.sourceId });
  return merged;
}
