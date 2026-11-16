import type { AnalyticsDatabase } from "./database.js";
import type {
  AnalyticsEnvironment,
  AnalyticsMatch,
  MatchAnalysis,
  MetricSample,
  TeamWindow,
} from "../../src/types/footballAnalytics.js";
import { completeScore } from "./normalization.js";
import { matchVersionsBefore, readMatch } from "./store.js";

export const belgradeDate = (date: Date | string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(
    new Date(date),
  );
export function belgradeDayBounds(date: string) {
  const midnight = (day: string) => {
    const utc = Date.parse(`${day}T00:00:00Z`);
    const zone =
      new Intl.DateTimeFormat("en", {
        timeZone: "Europe/Belgrade",
        timeZoneName: "shortOffset",
      })
        .formatToParts(new Date(utc))
        .find((part) => part.type === "timeZoneName")?.value || "";
    const offset = zone.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!offset) throw new Error("Vremenska zona nije dostupna.");
    const minutes =
      (Number(offset[2]) * 60 + Number(offset[3] || 0)) *
      (offset[1] === "+" ? 1 : -1);
    return new Date(utc - minutes * 60000).toISOString();
  };
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    start: midnight(date),
    end: midnight(next.toISOString().slice(0, 10)),
  };
}
const isFinished = (m: AnalyticsMatch) =>
  m.status === "finished" && completeScore(m.ft);
const resultCode = (home: number, away: number) =>
  home > away ? "1" : home < away ? "2" : "X";
export function htftCounts(matches: AnalyticsMatch[]) {
  const known = matches.filter((m) => isFinished(m) && completeScore(m.ht));
  return ["1/1", "1/X", "1/2", "X/1", "X/X", "X/2", "2/1", "2/X", "2/2"].map(
    (code) => ({
      code,
      denominator: known.length,
      count: known.filter(
        (m) =>
          `${resultCode(m.ht.home!, m.ht.away!)}/${resultCode(m.ft.home!, m.ft.away!)}` ===
          code,
      ).length,
    }),
  );
}
export function teamWindow(
  matches: AnalyticsMatch[],
  teamId: string,
): TeamWindow {
  const average = (
    read: (
      match: AnalyticsMatch,
      side: "home" | "away",
      opponent: "home" | "away",
    ) => number | null,
  ): MetricSample => {
    const values = matches
      .map((match) => ({
        id: match.id,
        value: read(
          match,
          match.homeId === teamId ? "home" : "away",
          match.homeId === teamId ? "away" : "home",
        ),
      }))
      .filter((row) => row.value !== null);
    return {
      value: values.length
        ? values.reduce((sum, row) => sum + row.value!, 0) / values.length
        : null,
      available: values.length,
      total: matches.length,
      matchIds: values.map((row) => row.id),
    };
  };
  const metrics = {
    goalsFor: average((m, s) => m.ft[s]),
    goalsAgainst: average((m, s, o) => m.ft[o]),
    xg: average((m, s) => m.xg[s]),
    xga: average((m, s, o) => m.xg[o]),
    shots: average((m, s) => m.shots[s]),
    shotsOnTarget: average((m, s) => m.shotsOnTarget[s]),
    nonPenaltyXg: average((m, s) => m.nonPenaltyXg?.[s] ?? null),
    goalsMinusXg: average((m, s) =>
      m.xg[s] !== null && m.ft[s] !== null ? m.ft[s]! - m.xg[s]! : null,
    ),
  };
  const sorted = [...matches].sort(
    (a, b) =>
      b.ft[b.homeId === teamId ? "home" : "away"]! -
      a.ft[a.homeId === teamId ? "home" : "away"]!,
  );
  const maximum = sorted[0];
  const extremes =
    maximum && matches.length >= 3
      ? {
          matchId: maximum.id,
          goals: maximum.ft[maximum.homeId === teamId ? "home" : "away"]!,
          averageWithout:
            sorted
              .slice(1)
              .reduce(
                (sum, m) => sum + m.ft[m.homeId === teamId ? "home" : "away"]!,
                0,
              ) /
            (sorted.length - 1),
        }
      : null;
  const context = {
    knownEventMatches: matches.filter(
      (m) => m.eventCoverage?.penalties === true,
    ).length,
    knownCardMatches: matches.filter((m) => m.eventCoverage?.redCards === true)
      .length,
    penalties: matches
      .filter((m) => m.eventCoverage?.penalties)
      .flatMap((m) => m.events || [])
      .filter((e) => e.type === "Goal" && e.penalty === true).length,
    earlyReds: matches
      .filter((m) => m.eventCoverage?.redCards)
      .flatMap((m) => m.events || [])
      .filter(
        (e) => /red.?card/i.test(e.type) && e.minute !== null && e.minute <= 30,
      ).length,
  };
  return { matches, metrics, extremes, context };
}
const display = (value: number | null) =>
  value === null ? "—" : value.toFixed(2);

export function analyzeFromHistory(
  match: AnalyticsMatch,
  history: AnalyticsMatch[],
  scope: "league" | "all" = "all",
  now = new Date(),
): MatchAnalysis {
  const asOf = new Date(
    Math.min(now.getTime(), match.kickoffAt ? Date.parse(match.kickoffAt) : Date.parse(`${match.matchDate}T00:00:00Z`)),
  ).toISOString();
  const prior = history
    .filter(
      (m) =>
        isFinished(m) &&
        m.environment === match.environment &&
        m.kickoffAt !== null && Date.parse(m.kickoffAt) < Date.parse(asOf) &&
        Date.parse(m.observedAt) <= Date.parse(asOf),
    )
    .sort((a, b) => (b.kickoffAt || '').localeCompare(a.kickoffAt || ''));
  const scoped =
    scope === "league"
      ? prior.filter((m) => m.leagueId === match.leagueId)
      : prior;
  const homeMatches = scoped.filter(
    (m) => m.homeId === match.homeId || m.awayId === match.homeId,
  );
  const awayMatches = scoped.filter(
    (m) => m.homeId === match.awayId || m.awayId === match.awayId,
  );
  const home = {
    last5: teamWindow(homeMatches.slice(0, 5), match.homeId),
    last10: teamWindow(homeMatches.slice(0, 10), match.homeId),
    venue5: teamWindow(
      homeMatches.filter((m) => m.homeId === match.homeId).slice(0, 5),
      match.homeId,
    ),
  };
  const away = {
    last5: teamWindow(awayMatches.slice(0, 5), match.awayId),
    last10: teamWindow(awayMatches.slice(0, 10), match.awayId),
    venue5: teamWindow(
      awayMatches.filter((m) => m.awayId === match.awayId).slice(0, 5),
      match.awayId,
    ),
  };
  const h2h = prior
    .filter(
      (m) =>
        (m.homeId === match.homeId && m.awayId === match.awayId) ||
        (m.homeId === match.awayId && m.awayId === match.homeId),
    )
    .slice(0, 30);
  const attack = home.venue5.metrics.xg,
    defense = away.venue5.metrics.xga;
  const realXg = attack.available >= 3 && defense.available >= 3;
  const sample = `${home.last10.matches.length} utakmica domaćina i ${away.last10.matches.length} gosta`;
  let conclusion: string, reason: string;
  if (realXg) {
    reason = `${match.home.name}: ${display(attack.value)} stvorenih xG kod kuće (${attack.available}/${attack.total}); ${match.away.name}: ${display(defense.value)} dopuštenih xG u gostima (${defense.available}/${defense.total}).`;
    conclusion =
      attack.value! >= 1.5 && defense.value! >= 1.5
        ? `Podaci više podržavaju napadački učinak domaćina. ${reason}`
        : `xG pokazatelji ne izdvajaju snažnu jednostranu prednost. ${reason}`;
  } else if (home.last5.matches.length && away.last5.matches.length) {
    reason = `${match.home.name} postiže ${display(home.venue5.metrics.goalsFor.value)} golova kod kuće; ${match.away.name} prima ${display(away.venue5.metrics.goalsAgainst.value)} u gostima. Uzorci: ${home.venue5.matches.length} / ${away.venue5.matches.length}.`;
    conclusion = `Dostupni rezultati omogućavaju osnovno poređenje, ali ne i zaključak o kvalitetu šansi. ${reason}`;
  } else {
    reason = `Mali pre-meč uzorak: ${sample}.`;
    conclusion =
      "Nema dovoljno prethodno zabeleženih rezultata za pouzdan zaključak.";
  }
  const against = away.venue5.metrics.xg;
  const caution =
    realXg && against.value !== null && against.value > attack.value!
      ? `Protiv jednostranog zaključka govori napad gosta: ${display(against.value)} xG (${against.available}/${against.total}).`
      : !realXg
        ? "xG nije dostupan u dovoljnom uzorku; rezultati nisu zamena za xG. Ne procenjujemo procenat sigurnosti."
        : `Ograničenje: uzorak ${sample}; forma i završnica mogu odstupati od stvorenih šansi.`;
  const formMatches = [
    ...new Map(
      [...home.last10.matches, ...away.last10.matches].map((m) => [m.id, m]),
    ).values(),
  ];
  const opponentStrength = formMatches.map((m) => {
    const ownTeam =
      m.homeId === match.homeId || m.awayId === match.homeId
        ? match.homeId
        : match.awayId;
    const opponent = m.homeId === ownTeam ? m.awayId : m.homeId;
    const earlier = prior
      .filter(
        (p) =>
          p.leagueId === m.leagueId &&
          p.kickoffAt !== null && m.kickoffAt !== null && p.kickoffAt < m.kickoffAt &&
          p.observedAt < m.kickoffAt &&
          (p.homeId === opponent || p.awayId === opponent),
      )
      .slice(0, 5);
    return {
      matchId: m.id,
      sample: earlier.length,
      pointsPerMatch: earlier.length
        ? earlier.reduce((sum, p) => {
            const own = p.ft[p.homeId === opponent ? "home" : "away"]!,
              other = p.ft[p.homeId === opponent ? "away" : "home"]!;
            return sum + (own > other ? 3 : own === other ? 1 : 0);
          }, 0) / earlier.length
        : null,
    };
  });
  return {
    match,
    asOf,
    scope,
    home,
    away,
    h2h,
    htft: htftCounts(h2h),
    conclusion,
    caution,
    opponentStrength,
    reason,
    priority:
      Math.min(home.last10.matches.length, away.last10.matches.length) * 2 +
      Math.min(attack.available, defense.available) * 4 +
      (realXg && attack.value! >= 1.5 && defense.value! >= 1.5 ? 10 : 0),
  };
}
export async function analyzeStoredMatch(
  db: AnalyticsDatabase,
  id: string,
  scope: "league" | "all" = "all",
  now = new Date(),
) {
  const match = await readMatch(db, id);
  if (!match) return null;
  const cutoff = new Date(
    Math.min(now.getTime(), match.kickoffAt ? Date.parse(match.kickoffAt) : Date.parse(`${match.matchDate}T00:00:00Z`)),
  ).toISOString();
  const history = await matchVersionsBefore(
    db,
    cutoff,
    [match.homeId, match.awayId],
    match.environment,
    1000,
  );
  const opponents = [
    ...new Set(history.slice(0, 40).flatMap((m) => [m.homeId, m.awayId])),
  ];
  const context = await matchVersionsBefore(
    db,
    cutoff,
    opponents,
    match.environment,
    4000,
  );
  return analyzeFromHistory(
    match,
    [...new Map([...history, ...context].map((m) => [m.id, m])).values()],
    scope,
    now,
  );
}
export async function listAnalyticMatches(
  db: AnalyticsDatabase,
  date: string,
  environment: AnalyticsEnvironment = "real",
  league = "",
  search = "",
  offset = 0,
) {
  const bounds = belgradeDayBounds(date);
  const args: unknown[] = [environment, bounds.start, bounds.end];
  const conditions = ["environment=$1", "kickoff_at >= $2", "kickoff_at < $3"];
  if (league) {
    args.push(league);
    conditions.push(`league_id=$${args.length}`);
  }
  if (search) {
    args.push(`%${nameSearch(search)}%`);
    conditions.push(
      `(home_key LIKE $${args.length} OR away_key LIKE $${args.length})`,
    );
  }
  const rows = await db.query(
    `SELECT payload FROM fa_matches WHERE ${conditions.join(" AND ")} ORDER BY kickoff_at,id LIMIT 51 OFFSET $${args.length + 1}`,
    [...args, offset],
  );
  const matches = rows
    .map((row) => JSON.parse(row.payload) as AnalyticsMatch)
    .slice(0, 50);
  const ids = [...new Set(matches.flatMap((m) => [m.homeId, m.awayId]))];
  const now = new Date();
  const history = await matchVersionsBefore(
    db,
    now.toISOString(),
    ids,
    environment,
  );
  const summaries = matches.map((match) => {
    const a = analyzeFromHistory(match, history, "all", now);
    return {
      match,
      reason: a.reason,
      priority: a.priority,
      samples: {
        home: a.home.last10.matches.length,
        away: a.away.last10.matches.length,
      },
    };
  });
  return {
    matches: summaries,
    highlighted: [...summaries]
      .filter((a) => a.samples.home >= 3 && a.samples.away >= 3)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5),
    hasMore: rows.length > 50,
  };
}
const nameSearch = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
