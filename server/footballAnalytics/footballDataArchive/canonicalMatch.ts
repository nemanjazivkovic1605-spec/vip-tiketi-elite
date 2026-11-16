import type { AnalyticsMatch, MatchObservation } from '../../../src/types/footballAnalytics.js';
import { completeScore, hashId, leagueKey, mergeObservation, nameKey } from '../normalization.js';
import { archiveIdentity, type ArchiveMatch } from './normalization.js';
import { compareArchiveTarget, statisticsFields } from './planner.js';
import type { ArchiveOdds } from './odds.js';

export const ARCHIVE_PROVIDER = 'football-data.co.uk' as const;
export type ArchiveSourceRow = {
  odds: ArchiveOdds;
  statistics: Record<string, string | number>;
  sourceValues: Record<string, string>;
  invalidOdds: string[];
};
const pair = () => ({ home: null, away: null });
export const archiveTeamSourceId = (country: string, team: string) => hashId(country, nameKey(team));

export function archiveObservation(match: ArchiveMatch, rows: ArchiveSourceRow[], observedAt: string): MatchObservation {
  const statistics = { xg: pair(), shots: pair(), shotsOnTarget: pair() } as Pick<MatchObservation, 'xg' | 'shots' | 'shotsOnTarget'>;
  for (const [column, [field, side]] of Object.entries(statisticsFields)) {
    const values = [...new Set(rows.map(row => row.statistics[column]).filter((value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 && (field === 'xg' || Number.isInteger(value))))];
    if (values.length === 1) statistics[field][side] = values[0];
  }
  return {
    provider: ARCHIVE_PROVIDER, sourceId: match.key, environment: 'real',
    league: { ...match.league, sourceId: match.division }, season: match.season,
    kickoffAt: null, matchDate: match.date, matchTime: match.time, timeZone: null,
    sourceUrl: 'https://football-data.co.uk/data.php',
    license: 'Local private analysis only. Commercial permission has not been verified.',
    home: { sourceId: archiveTeamSourceId(match.league.country, match.homeTeam), name: match.homeTeam },
    away: { sourceId: archiveTeamSourceId(match.league.country, match.awayTeam), name: match.awayTeam },
    status: completeScore(match.ft) ? 'finished' : 'unknown', ht: match.ht, ft: match.ft,
    extraTime: pair(), penalties: pair(), ...statistics, events: null, individualShots: null,
    observedAt, lastCheckedAt: observedAt,
    statsChecked: Object.values(statistics).some(value => value.home !== null || value.away !== null),
  };
}

// Archive enrichment is fill-only, regardless of provider priority. Known facts and IDs are immutable here.
export function mergeArchiveCanonical(previous: AnalyticsMatch | null, incoming: ArchiveMatch, rows: ArchiveSourceRow[],
  identity: { id: string; homeId: string; awayId: string }, observedAt: string) {
  const observation = archiveObservation(incoming, rows, observedAt);
  if (!previous) return { ...mergeObservation(null, observation, { ...identity, leagueId: leagueKey(incoming.league.name, incoming.league.country) }),
    matchTime: incoming.time, timeZone: null };
  const previousDate = previous.matchDate || previous.kickoffAt?.slice(0, 10);
  if (previous.environment !== 'real' || !previousDate || previous.id !== identity.id ||
    archiveIdentity(previous.league, previousDate, previous.home.name, previous.away.name) !== incoming.key ||
    compareArchiveTarget(incoming, previous).conflicts.length)
    throw new Error(`Archive identity or result changed since approval: ${incoming.key}`);
  const merged = structuredClone(previous);
  const provenance = { provider: ARCHIVE_PROVIDER, sourceId: incoming.key, observedAt };
  const fill = (field: 'ht' | 'ft' | 'xg' | 'shots' | 'shotsOnTarget') => {
    for (const side of ['home', 'away'] as const) if (merged[field]?.[side] == null && observation[field][side] !== null) {
      merged[field] = { ...pair(), ...merged[field], [side]: observation[field][side] };
      merged.provenance[`${field}.${side}`] = provenance;
    }
  };
  for (const field of ['ht', 'ft', 'xg', 'shots', 'shotsOnTarget'] as const) fill(field);
  if (!merged.matchDate) { merged.matchDate = incoming.date; merged.provenance.matchDate = provenance; }
  if (!merged.kickoffAt && !merged.matchTime && incoming.time) {
    merged.matchTime = incoming.time; merged.timeZone ??= null; merged.provenance.matchTime = provenance;
  }
  if (['unknown', 'scheduled', 'live'].includes(merged.status) && completeScore(merged.ft)) {
    merged.status = 'finished'; merged.provenance.status = provenance;
  }
  if (!merged.sources.some(source => source.provider === ARCHIVE_PROVIDER && source.sourceId === incoming.key))
    merged.sources.push({ provider: ARCHIVE_PROVIDER, sourceId: incoming.key });
  merged.observedAt = observedAt;
  merged.lastCheckedAt = observedAt;
  return merged;
}
