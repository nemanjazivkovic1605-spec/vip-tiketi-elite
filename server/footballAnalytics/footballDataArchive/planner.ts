import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { completeScore, leagueKey, nameKey } from '../normalization.js';
import { archiveIdentity, archiveTeamName, sha256, type ArchiveMatch } from './normalization.js';
import type { AnalyticsMatch } from '../../../src/types/footballAnalytics.js';

export function auditArchiveTarget(database: string) {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const digest = createHash('sha256'), byIdentity = new Map<string, AnalyticsMatch[]>(), byDay = new Map<string, AnalyticsMatch[]>();
    const byPair = new Map<string, AnalyticsMatch[]>(), tables: Record<string, number> = {}, matches: AnalyticsMatch[] = [];
    for (const table of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'fa_%' ORDER BY name").all() as Array<{ name: string }>) {
      if (!/^fa_[a-z_]+$/.test(table.name)) throw new Error('Unexpected analytics table name.');
      tables[table.name] = Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table.name}`).get() as any).count);
    }
    for (const row of db.prepare('SELECT id,payload,checked_at FROM fa_matches ORDER BY id').iterate() as Iterable<{ id: string; payload: string; checked_at: string }>) {
      digest.update(JSON.stringify([row.id, row.payload, row.checked_at]));
      const match = JSON.parse(row.payload) as AnalyticsMatch;
      if (match.environment !== 'real') continue;
      matches.push(match);
      const date = match.matchDate || match.kickoffAt?.slice(0, 10);
      if (!date) continue;
      const identity = archiveIdentity(match.league, date, match.home.name, match.away.name);
      byIdentity.set(identity, [...(byIdentity.get(identity) || []), match]);
      const day = `${leagueKey(match.league.name, match.league.country)}:${date}`;
      byDay.set(day, [...(byDay.get(day) || []), match]);
      const pair = [leagueKey(match.league.name, match.league.country), nameKey(archiveTeamName(match.home.name, match.league.country)),
        nameKey(archiveTeamName(match.away.name, match.league.country))].join(':');
      byPair.set(pair, [...(byPair.get(pair) || []), match]);
    }
    const odds = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fa_historical_quotes'").get();
    const existingSnapshots = new Set<string>();
    if (odds) for (const row of db.prepare('SELECT id FROM fa_historical_quotes').iterate() as Iterable<{ id: string }>) existingSnapshots.add(row.id);
    return { fingerprint: digest.digest('hex'), tables, matches, byIdentity, byDay, byPair, existingSnapshots };
  } finally { db.close(); }
}
export type TargetAudit = ReturnType<typeof auditArchiveTarget>;
const meaningful = (value: unknown) => value !== null && value !== undefined && value !== '';
const normalizedSeason = (value: string) => {
  const parts = value.match(/^(\d{4})[/-](\d{4}|\d{2})$/);
  return parts ? `${parts[1]}/${parts[2].slice(-2)}` : value;
};
export const statisticsFields = { HS: ['shots', 'home'], AS: ['shots', 'away'], HST: ['shotsOnTarget', 'home'], AST: ['shotsOnTarget', 'away'],
  HxG: ['xg', 'home'], AxG: ['xg', 'away'] } as const;
export function compareArchiveTarget(incoming: ArchiveMatch, previous?: AnalyticsMatch) {
  const conflicts: string[] = [], missing: string[] = [];
  if (!previous) return { conflicts, missing };
  for (const field of ['ft', 'ht'] as const) for (const side of ['home', 'away'] as const) {
    if (previous[field][side] !== null && incoming[field][side] !== null && previous[field][side] !== incoming[field][side]) conflicts.push(`${field}.${side}`);
    if (previous[field][side] === null && incoming[field][side] !== null) missing.push(`${field}.${side}`);
  }
  const ht = { home: previous.ht.home ?? incoming.ht.home, away: previous.ht.away ?? incoming.ht.away };
  const ft = { home: previous.ft.home ?? incoming.ft.home, away: previous.ft.away ?? incoming.ft.away };
  if (completeScore(ht) && completeScore(ft) && (ht.home! > ft.home! || ht.away! > ft.away!)) conflicts.push('merged_ht_ft');
  if (normalizedSeason(previous.season) !== normalizedSeason(incoming.season)) conflicts.push('season');
  if (['postponed', 'canceled'].includes(previous.status)) conflicts.push('match_status');
  return { conflicts, missing };
}
export function planArchive(stage: DatabaseSync, target: TargetAudit) {
  // This is a disposable local plan table, never the application's data or a Firestore index.
  stage.exec('DELETE FROM archive_plan');
  const save = stage.prepare('INSERT INTO archive_plan(identity,action,existing_id,payload) VALUES(?,?,?,?)');
  const rowsFor = stage.prepare('SELECT id,payload FROM archive_rows WHERE identity=?');
  const refsFor = stage.prepare('SELECT id,has_odds FROM archive_rows WHERE identity=?');
  const counts = { create: 0, enrich: 0, unchanged: 0, conflict: 0, identityReview: 0,
    existingDuplicates: 0, resultFills: 0, statisticsFills: 0, statisticsConflicts: 0, quoteSnapshots: 0, rowsWithAdditionalQuotes: 0 };
  const dayNear = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= 86400000;
  const similar = (a: string, b: string) => a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a));
  const snapshotId = (id: string) => sha256(`football-data.co.uk:${id}`);
  stage.exec('BEGIN');
  try {
    for (const row of stage.prepare('SELECT identity,payload,conflicted FROM archive_matches ORDER BY identity').iterate() as Iterable<{ identity: string; payload: string; conflicted: number }>) {
      const match = JSON.parse(row.payload) as ArchiveMatch, candidates = target.byIdentity.get(match.key) || [];
      const previous = candidates.length === 1 ? candidates[0] : undefined;
      if (candidates.length) counts.existingDuplicates++;
      const comparison = compareArchiveTarget(match, previous);
      let action: 'create' | 'enrich' | 'unchanged' | 'conflict' | 'identityReview' = 'create', reasons: string[] = [], possibleMatches: string[] = [];
      const home = nameKey(match.homeTeam), away = nameKey(match.awayTeam), league = leagueKey(match.league.name, match.league.country);
      if (row.conflicted || candidates.length > 1 || comparison.conflicts.length) { action = 'conflict'; reasons = comparison.conflicts; }
      else if (!previous) {
        const sameDay = target.byDay.get(`${league}:${match.date}`) || [];
        const possible = sameDay.filter(item => {
          const h = nameKey(archiveTeamName(item.home.name, match.league.country)), a = nameKey(archiveTeamName(item.away.name, match.league.country));
          return (h === home || similar(h, home)) && (a === away || similar(a, away));
        });
        const dateShift = (target.byPair.get(`${league}:${home}:${away}`) || []).filter(item => dayNear(item.matchDate || item.kickoffAt!.slice(0, 10), match.date));
        if (possible.length || dateShift.length) {
          action = 'identityReview'; reasons = [...(possible.length ? ['unverified_team_alias'] : []), ...(dateShift.length ? ['date_shift'] : [])];
          possibleMatches = [...new Set([...possible, ...dateShift].map(item => item.id))];
        }
      }
      const refs = refsFor.all(match.key) as Array<{ id: string; has_odds: number }>;
      const snapshotsToAdd = refs.filter(item => !target.existingSnapshots.has(snapshotId(item.id)));
      // New matches do not need millions of price fields decoded just to count their snapshots.
      const snapshots = previous || refs.length > 1 ? (rowsFor.all(match.key) as Array<{ id: string; payload: string }>)
        .map(item => ({ id: snapshotId(item.id), ...JSON.parse(item.payload) })) : [];
      const statsToFill = new Set<string>();
      const inconsistentStatistics: string[] = [];
      for (const [column, [field, side]] of Object.entries(statisticsFields)) {
        if (new Set(snapshots.map(item => item.statistics[column]).filter(meaningful)).size > 1) inconsistentStatistics.push(`${field}.${side}`);
      }
      if (previous && action !== 'conflict') for (const snapshot of snapshots) for (const [column, [field, side]] of Object.entries(statisticsFields)) {
        if (!inconsistentStatistics.includes(`${field}.${side}`) && !meaningful(previous[field]?.[side])
          && typeof snapshot.statistics[column] === 'number') statsToFill.add(`${field}.${side}`);
      }
      if (previous && action !== 'conflict') {
        action = comparison.missing.length || statsToFill.size || snapshotsToAdd.length ? 'enrich' : 'unchanged';
      }
      counts[action]++;
      if (!['conflict', 'identityReview'].includes(action)) {
        counts.resultFills += comparison.missing.length;
        counts.statisticsFills += statsToFill.size;
        counts.statisticsConflicts += inconsistentStatistics.length;
        counts.quoteSnapshots += snapshotsToAdd.length;
        if (previous && snapshotsToAdd.some(item => item.has_odds)) counts.rowsWithAdditionalQuotes++;
      }
      save.run(match.key, action, previous?.id || null, JSON.stringify({ reasons, missingResults: comparison.missing,
        missingStatistics: [...statsToFill], inconsistentStatistics, snapshotsToAdd: snapshotsToAdd.length,
        existingMatches: candidates.map(item => item.id), possibleMatches }));
    }
    stage.exec('COMMIT');
  } catch (error) { stage.exec('ROLLBACK'); throw error; }
  const get = (sql: string) => (stage.prepare(sql).get() as any).count as number;
  const files = (stage.prepare('SELECT payload FROM archive_files').all() as Array<{ payload: string }>).map(row => JSON.parse(row.payload));
  const sum = (key: string) => files.reduce((total, row) => total + (row[key] || 0), 0);
  const unique = get('SELECT COUNT(*) AS count FROM archive_matches'), accepted = sum('accepted');
  if (sum('rows') !== accepted + sum('rejected') + sum('empty') || accepted < unique)
    throw new Error('Archive row reconciliation failed.');
  const groups = stage.prepare(`SELECT division,season,COUNT(*) AS matches,SUM(ft_h IS NOT NULL AND ft_a IS NOT NULL) AS withFt,
    SUM(transition IS NOT NULL) AS withHtFt,SUM(conflicted) AS conflicts FROM archive_matches GROUP BY division,season ORDER BY division,season`).all();
  const transitions = stage.prepare('SELECT transition AS code,COUNT(*) AS count FROM archive_matches WHERE transition IS NOT NULL AND conflicted=0 GROUP BY transition ORDER BY transition').all();
  const odds = stage.prepare('SELECT COUNT(*) AS snapshots,SUM(odds_count) AS priceValues,SUM(has_odds) AS pricedSnapshots FROM archive_rows').get();
  const result = { dryRun: true, source: 'football-data.co.uk', sourceRestrictions: 'Private individuals only; commercial permission must be verified before production use.',
    files: files.length, filesProcessed: files.filter(row => !row.error).length, fileErrors: files.filter(row => row.error).length,
    sourceRows: sum('rows'), acceptedRows: accepted, rejectedRows: sum('rejected'), emptyRows: sum('empty'),
    uniqueMatches: unique, duplicateOccurrences: accepted - unique,
    duplicateIdentities: get('SELECT COUNT(*) AS count FROM (SELECT identity FROM archive_rows GROUP BY identity HAVING COUNT(*)>1)'),
    archiveConflictIdentities: get('SELECT COUNT(*) AS count FROM archive_matches WHERE conflicted=1'),
    withFt: get('SELECT COUNT(*) AS count FROM archive_matches WHERE ft_h IS NOT NULL AND ft_a IS NOT NULL AND conflicted=0'),
    withHtFt: get('SELECT COUNT(*) AS count FROM archive_matches WHERE transition IS NOT NULL AND conflicted=0'),
    missingFt: get('SELECT COUNT(*) AS count FROM archive_matches WHERE ft_h IS NULL OR ft_a IS NULL'),
    missingHt: get('SELECT COUNT(*) AS count FROM archive_matches WHERE ht_h IS NULL OR ht_a IS NULL'),
    missingKickoffTime: get("SELECT COUNT(*) AS count FROM archive_matches WHERE json_extract(payload,'$.time') IS NULL"),
    missingTimezone: unique, invalidOddsValues: sum('invalidOdds'), odds,
    target: { matches: target.matches.length, tables: target.tables, fingerprint: target.fingerprint, ...counts },
    planned: { firestoreReads: 0, firestoreWrites: 0, sqlWritesUpperBound: counts.create * 10 + counts.enrich * 10 + counts.quoteSnapshots + files.length + 4,
      suggestedBatchMatches: 100, maximumBatchMatches: 500, requiresApproval: true, requiresCommercialRightsConfirmation: true },
    transitions, coverage: groups,
    issues: stage.prepare('SELECT code,COUNT(*) AS occurrences FROM archive_issues GROUP BY code ORDER BY occurrences DESC,code').all(),
  };
  const planKey = sha256(JSON.stringify({ parser: stage.prepare("SELECT value FROM archive_meta WHERE key='parserVersion'").get(), archive: stage.prepare("SELECT value FROM archive_meta WHERE key='archiveSha'").get(),
    target: target.fingerprint, counts, issues: result.issues }));
  stage.prepare("INSERT INTO archive_meta(key,value) VALUES('planFingerprint',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(planKey);
  return { fingerprint: planKey, ...result };
}

export function archiveStats(stage: DatabaseSync, filters: { division?: string; season?: string; team?: string; venue?: 'home' | 'away' } = {}) {
  const conditions = ['conflicted=0'], values: string[] = [];
  if (filters.division) { conditions.push('division=?'); values.push(filters.division); }
  if (filters.season) { conditions.push('season=?'); values.push(filters.season); }
  const rows = stage.prepare(`SELECT payload FROM archive_matches WHERE ${conditions.join(' AND ')} ORDER BY date,identity`).all(...values) as Array<{ payload: string }>;
  const matches = rows.map(row => JSON.parse(row.payload) as ArchiveMatch).filter(match => !filters.team ||
    (filters.venue !== 'away' && nameKey(match.homeTeam) === nameKey(archiveTeamName(filters.team, match.league.country)))
    || (filters.venue !== 'home' && nameKey(match.awayTeam) === nameKey(archiveTeamName(filters.team, match.league.country))));
  const known = matches.filter(match => completeScore(match.ft)), htft = matches.filter(match => match.transition);
  const codes = ['1/1', '1/X', '1/2', 'X/1', 'X/X', 'X/2', '2/1', '2/X', '2/2'];
  return { filters, matches: matches.length, finishedSample: known.length, htftSample: htft.length,
    homeWins: known.filter(match => match.ft.home! > match.ft.away!).length,
    draws: known.filter(match => match.ft.home === match.ft.away).length,
    awayWins: known.filter(match => match.ft.away! > match.ft.home!).length,
    averageHomeGoals: known.length ? known.reduce((sum, match) => sum + match.ft.home!, 0) / known.length : null,
    averageAwayGoals: known.length ? known.reduce((sum, match) => sum + match.ft.away!, 0) / known.length : null,
    transitions: codes.map(code => { const count = htft.filter(match => match.transition === code).length; return { code, count, sample: htft.length, percent: htft.length ? count / htft.length * 100 : null }; }),
    ...(filters.team ? { wins: known.filter(match => {
      const home = nameKey(match.homeTeam) === nameKey(archiveTeamName(filters.team!, match.league.country));
      return home ? match.ft.home! > match.ft.away! : match.ft.away! > match.ft.home!;
    }).length } : {}) };
}
