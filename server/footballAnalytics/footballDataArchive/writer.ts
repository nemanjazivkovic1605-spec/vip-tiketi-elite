import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import type { AnalyticsMatch, AnalyticsLeague, CoverageRow } from '../../../src/types/footballAnalytics.js';
import { migrateAnalytics, openAnalyticsDatabase } from '../database.js';
import { completeScore, hashId, leagueKey, nameKey } from '../normalization.js';
import { archiveTeamName, FOOTBALL_DATA_LEAGUES, sha256, type ArchiveMatch } from './normalization.js';
import { auditArchiveTarget, type planArchive } from './planner.js';
import { ARCHIVE_PROVIDER, archiveTeamSourceId, mergeArchiveCanonical, type ArchiveSourceRow } from './canonicalMatch.js';

type Plan = ReturnType<typeof planArchive>;
type PlanRow = { identity: string; action: string; existing_id: string | null; payload: string; match: string };
type StageRow = { id: string; file_sha: string; line: number; payload: string };
export type ArchiveImportRun = {
  id: string; status: 'running' | 'failed' | 'complete'; createdAt: string; completedAt?: string; error?: string;
  archiveSha: string; parserVersion: string; planFingerprint: string; planDigest: string; targetBefore: string;
  backup: string; backupVerified: boolean; lastIdentity: string; processed: number;
  created: number; enriched: number; quotes: number; conflictsSkipped: number; identitiesSkipped: number;
  firestoreReads: 0; firestoreWrites: 0; plan: Plan['target'];
};
export type ArchiveWriteOptions = {
  database: string; stage: DatabaseSync; approvedPlan: Plan; confirmation: string; backupDirectory: string;
  privateLocal: boolean; allowLarge?: boolean; resume?: boolean; batchMatches?: number;
  onProgress?: (run: ArchiveImportRun) => void;
};
const meta = (stage: DatabaseSync, key: string) => String(stage.prepare('SELECT value FROM archive_meta WHERE key=?').get(key)?.value || '');

export function archivePlanDigest(stage: DatabaseSync) {
  const digest = createHash('sha256');
  for (const sql of [
    'SELECT identity,action,existing_id,payload FROM archive_plan ORDER BY identity',
    'SELECT identity,payload,conflicted FROM archive_matches ORDER BY identity',
    'SELECT id,identity,file_sha,line,payload FROM archive_rows ORDER BY id',
    'SELECT name,sha,payload FROM archive_files ORDER BY name',
  ]) for (const row of stage.prepare(sql).iterate()) digest.update(JSON.stringify(row));
  return digest.digest('hex');
}

async function verifiedBackup(database: string, directory: string, expected: string) {
  mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `football-analytics-before-archive-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  const source = new DatabaseSync(database, { readOnly: true });
  try { await backup(source, destination); } finally { source.close(); }
  const check = new DatabaseSync(destination, { readOnly: true });
  try { if (check.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw new Error('Backup integrity check failed.'); }
  finally { check.close(); }
  if (auditArchiveTarget(destination).fingerprint !== expected) throw new Error('Backup does not match the approved database.');
  return destination;
}

function teamLookup(db: DatabaseSync) {
  const teams = new Map<string, Set<string>>();
  const key = (country: string, name: string) => `${country}:${nameKey(archiveTeamName(name, country))}`;
  for (const row of db.prepare("SELECT payload FROM fa_matches WHERE environment='real'").iterate()) {
    const match = JSON.parse(row.payload as string) as AnalyticsMatch;
    for (const side of ['home', 'away'] as const) {
      const teamKey = key(match.league.country, match[side].name), ids = teams.get(teamKey) || new Set<string>();
      ids.add(side === 'home' ? match.homeId : match.awayId); teams.set(teamKey, ids);
    }
  }
  const alias = db.prepare("SELECT team_id FROM fa_aliases WHERE provider=? AND source_id=? AND environment='real'");
  return (country: string, name: string) => {
    const bound = alias.get(ARCHIVE_PROVIDER, archiveTeamSourceId(country, name));
    if (bound) return String(bound.team_id);
    const existing = teams.get(key(country, name));
    return existing?.size === 1 ? [...existing][0] : hashId(ARCHIVE_PROVIDER, archiveTeamSourceId(country, name), 'real');
  };
}

function catalog(db: DatabaseSync, stage: DatabaseSync, observedAt: string) {
  const groups = db.prepare(`SELECT m.league_id,m.season,COUNT(*) AS imported,SUM(m.finished_complete) AS finished,
    SUM(CASE WHEN m.finished_complete=1 THEN m.has_ht ELSE 0 END) AS with_ht,SUM(m.has_xg) AS with_xg,
    SUM(m.stats_checked) AS stats_checked,MIN(m.payload) AS example
    FROM fa_matches m JOIN fa_sources s ON s.match_id=m.id WHERE s.provider=? AND m.environment='real'
    GROUP BY m.league_id,m.season`).all(ARCHIVE_PROVIDER);
  const divisions = new Map(Object.entries(FOOTBALL_DATA_LEAGUES).map(([code, league]) => [leagueKey(league.name, league.country), code]));
  const mergedGroups = new Map<string, { sourceId: string; match: AnalyticsMatch; season: string; imported: number; finished: number; withHt: number; withXg: number; statsChecked: number }>();
  for (const group of groups) {
    const sourceId = divisions.get(String(group.league_id));
    if (!sourceId) throw new Error('Unknown archive league in canonical source mapping.');
    const season = String(group.season).replace(/^(\d{4})\/(\d{2})(\d{2})$/, '$1/$3');
    const key = `${sourceId}:${season}`, previous = mergedGroups.get(key);
    const row = previous || { sourceId, season, match: JSON.parse(group.example as string) as AnalyticsMatch,
      imported: 0, finished: 0, withHt: 0, withXg: 0, statsChecked: 0 };
    row.imported += Number(group.imported); row.finished += Number(group.finished); row.withHt += Number(group.with_ht);
    row.withXg += Number(group.with_xg); row.statsChecked += Number(group.stats_checked); mergedGroups.set(key, row);
  }
  const leagues = new Map<string, AnalyticsLeague>();
  const saveCoverage = db.prepare('INSERT INTO fa_coverage(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload');
  const countStaged = stage.prepare('SELECT COUNT(*) AS count FROM archive_matches WHERE division=? AND season=?');
  for (const group of mergedGroups.values()) {
    const { match, sourceId, season } = group;
    const id = hashId(ARCHIVE_PROVIDER, sourceId, 'real');
    const league = leagues.get(id) || { id, provider: ARCHIVE_PROVIDER, sourceId, name: match.league.name, country: match.league.country, environment: 'real', seasons: [] };
    league.seasons.push(season); leagues.set(id, league);
    const staged = Number(countStaged.get(sourceId, season)?.count || 0), total = Math.max(staged, group.imported);
    const missing = Math.max(0, total - group.imported);
    const row: CoverageRow = { id: hashId(ARCHIVE_PROVIDER, sourceId, season, 'real'),
      provider: ARCHIVE_PROVIDER, sourceId, leagueId: match.leagueId, leagueName: match.league.name, country: match.league.country,
      season, environment: 'real', state: missing ? 'error' : 'complete', cursor: group.imported, total,
      imported: group.imported, finished: group.finished, withHt: group.withHt, withXg: group.withXg,
      statsChecked: group.statsChecked, lastSyncedAt: observedAt, error: missing ? `${missing} archive records require identity/result review.` : null };
    // Counts describe the supplied archive, not proof that the competition's full schedule is covered.
    saveCoverage.run(row.id, JSON.stringify(row));
  }
  const saveLeague = db.prepare('INSERT INTO fa_leagues(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload');
  for (const league of leagues.values()) saveLeague.run(league.id, JSON.stringify({ ...league, seasons: league.seasons.sort().reverse() }));
  db.prepare('INSERT INTO fa_providers(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(ARCHIVE_PROVIDER,
    JSON.stringify({ id: ARCHIVE_PROVIDER, status: 'available', environment: 'real', checkedAt: observedAt,
      message: 'User-supplied CSV archive. Local private analysis only; incomplete rows and identity conflicts excluded. Commercial permission unverified.' }));
}

export async function writeArchive(options: ArchiveWriteOptions): Promise<ArchiveImportRun & { alreadyComplete?: boolean }> {
  const { stage, approvedPlan: plan, database } = options;
  if (!options.privateLocal || process.env.VERCEL || process.env.NODE_ENV === 'production')
    throw new Error('Archive writes are allowed only to an explicitly approved local private database. Production is disabled.');
  if (!options.confirmation || options.confirmation !== plan.fingerprint)
    throw new Error('Confirm the exact dry-run fingerprint before importing.');
  if (plan.fileErrors || plan.archiveConflictIdentities) throw new Error('Resolve archive-level parse/result conflicts before importing.');
  if (plan.target.create + plan.target.enrich > 500 && !options.allowLarge)
    throw new Error('More than 500 matches: explicit --allow-large is required.');
  const batchSize = options.batchMatches ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error('Batch size must be 1-500 matches.');
  const archiveSha = meta(stage, 'archiveSha'), parserVersion = meta(stage, 'parserVersion');
  if (!archiveSha || !parserVersion) throw new Error('Missing archive/parser identity.');
  const id = hashId('local-football-archive', archiveSha, plan.fingerprint);
  const inspect = new DatabaseSync(database, { readOnly: true });
  let stored: ArchiveImportRun | undefined;
  try {
    if (inspect.prepare("SELECT name FROM sqlite_master WHERE name='fa_archive_imports'").get()) {
      const row = inspect.prepare('SELECT payload FROM fa_archive_imports WHERE id=?').get(id);
      if (row) stored = JSON.parse(row.payload as string);
    }
  } finally { inspect.close(); }
  if (stored?.status === 'complete') return { ...stored, alreadyComplete: true };
  if (stored && !options.resume) throw new Error('An interrupted import exists. Use --resume with the original approved plan.');
  if (meta(stage, 'planFingerprint') !== plan.fingerprint) throw new Error('The stage plan changed. Repeat the dry-run.');
  const planDigest = archivePlanDigest(stage);
  if (stored && stored.planDigest !== planDigest) throw new Error('The approved import content changed; resume is unsafe.');
  if (!stored && auditArchiveTarget(database).fingerprint !== plan.target.fingerprint)
    throw new Error('The target changed after the dry-run. No import started.');
  const backupPath = stored?.backup || await verifiedBackup(database, options.backupDirectory, plan.target.fingerprint);
  if (!stored && auditArchiveTarget(database).fingerprint !== plan.target.fingerprint) throw new Error('The target changed during backup. Repeat the dry-run.');
  const migrationDb = await openAnalyticsDatabase(database);
  try { await migrateAnalytics(migrationDb); } finally { await migrationDb.close(); }
  const db = new DatabaseSync(database);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;');
  let run: ArchiveImportRun = stored || { id, status: 'running', createdAt: new Date().toISOString(), archiveSha, parserVersion,
    planFingerprint: plan.fingerprint, planDigest, targetBefore: plan.target.fingerprint, backup: backupPath, backupVerified: true,
    lastIdentity: '', processed: 0, created: 0, enriched: 0, quotes: 0, conflictsSkipped: plan.target.conflict,
    identitiesSkipped: plan.target.identityReview, firestoreReads: 0, firestoreWrites: 0, plan: plan.target };
  const lockId = 'local-football-data-archive';
  let ownsLease = false;
  const saveRun = db.prepare(`INSERT INTO fa_archive_imports(id,archive_sha,plan_fingerprint,plan_digest,last_identity,status,created_at,payload)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_identity=excluded.last_identity,status=excluded.status,payload=excluded.payload`);
  const persist = () => saveRun.run(id, archiveSha, plan.fingerprint, planDigest, run.lastIdentity, run.status, run.createdAt, JSON.stringify(run));
  const lease = () => new Date(Date.now() + 120000).toISOString();
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      const lock = db.prepare('SELECT lease_until FROM fa_import_locks WHERE id=?').get(lockId);
      if (lock?.lease_until && String(lock.lease_until) >= new Date().toISOString()) throw new Error('Another archive importer is running.');
      db.prepare('INSERT INTO fa_import_locks(id,lease_until) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET lease_until=excluded.lease_until').run(lockId, lease());
      run = { ...run, status: 'running', error: undefined, completedAt: undefined }; persist(); db.exec('COMMIT'); ownsLease = true;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    const teamId = teamLookup(db);
    const batch = stage.prepare(`SELECT p.identity,p.action,p.existing_id,p.payload,m.payload AS match FROM archive_plan p
      JOIN archive_matches m ON m.identity=p.identity WHERE p.identity>? AND p.action IN ('create','enrich') ORDER BY p.identity LIMIT ?`);
    const sources = stage.prepare('SELECT id,file_sha,line,payload FROM archive_rows WHERE identity=? ORDER BY id');
    const readMatch = db.prepare('SELECT payload FROM fa_matches WHERE id=?');
    const readSource = db.prepare("SELECT match_id FROM fa_sources WHERE provider=? AND source_id=? AND environment='real'");
    const saveSource = db.prepare("INSERT INTO fa_sources(provider,source_id,environment,match_id) VALUES(?,?,'real',?) ON CONFLICT(provider,source_id,environment) DO NOTHING");
    const saveAlias = db.prepare("INSERT INTO fa_aliases(provider,source_id,environment,team_id) VALUES(?,?,'real',?) ON CONFLICT(provider,source_id,environment) DO NOTHING");
    const saveTeam = db.prepare("INSERT INTO fa_teams(id,environment,name,payload) VALUES(?,'real',?,?) ON CONFLICT(id) DO NOTHING");
    const saveMatch = db.prepare(`INSERT INTO fa_matches(id,league_id,season,environment,kickoff_at,home_id,away_id,home_key,away_key,status,finished_complete,has_ht,has_xg,stats_checked,payload,checked_at)
      VALUES(?,?,?,'real',?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kickoff_at=excluded.kickoff_at,status=excluded.status,
      finished_complete=excluded.finished_complete,has_ht=excluded.has_ht,has_xg=excluded.has_xg,stats_checked=excluded.stats_checked,payload=excluded.payload,checked_at=excluded.checked_at`);
    const saveVersion = db.prepare(`INSERT INTO fa_versions(id,match_id,available_at,league_id,home_id,away_id,kickoff_at,environment,status,payload)
      VALUES(?,?,?,?,?,?,?,'real',?,?) ON CONFLICT(id) DO NOTHING`);
    const saveQuote = db.prepare(`INSERT INTO fa_historical_quotes(id,match_id,provider,file_sha,source_line,division,season,observed_at,payload)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`);
    const quoteExists = db.prepare('SELECT match_id FROM fa_historical_quotes WHERE id=?');
    for (;;) {
      const rows = batch.all(run.lastIdentity, batchSize) as PlanRow[];
      if (!rows.length) break;
      const next = { ...run };
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of rows) {
          const match = JSON.parse(row.match) as ArchiveMatch;
          const canonicalId = row.existing_id || hashId(ARCHIVE_PROVIDER, row.identity, 'real');
          const old = readMatch.get(canonicalId), bound = readSource.get(ARCHIVE_PROVIDER, row.identity);
          if ((row.action === 'create' && old) || (row.action === 'enrich' && !old) || (bound && bound.match_id !== canonicalId))
            throw new Error(`Target identity changed after approval: ${row.identity}`);
          const previous = old ? JSON.parse(old.payload as string) as AnalyticsMatch : null;
          const sourceRows = sources.all(row.identity) as StageRow[];
          const decoded = sourceRows.map(source => JSON.parse(source.payload) as ArchiveSourceRow);
          for (const source of decoded) for (const price of Object.values(source.odds.prices))
            if (typeof price !== 'number' || !Number.isFinite(price) || price <= 1) throw new Error(`Invalid historical price: ${row.identity}`);
          const merged = mergeArchiveCanonical(previous, match, decoded, { id: canonicalId,
            homeId: previous?.homeId || teamId(match.league.country, match.homeTeam),
            awayId: previous?.awayId || teamId(match.league.country, match.awayTeam) }, run.createdAt);
          saveSource.run(ARCHIVE_PROVIDER, row.identity, canonicalId);
          for (const side of ['home', 'away'] as const) {
            const id = side === 'home' ? merged.homeId : merged.awayId, team = merged[side];
            saveAlias.run(ARCHIVE_PROVIDER, archiveTeamSourceId(match.league.country, side === 'home' ? match.homeTeam : match.awayTeam), id);
            saveTeam.run(id, team.name, JSON.stringify({ id, name: team.name, country: match.league.country }));
          }
          const payload = JSON.stringify(merged);
          saveMatch.run(merged.id, merged.leagueId, merged.season, merged.kickoffAt || merged.matchDate!, merged.homeId, merged.awayId,
            nameKey(merged.home.name), nameKey(merged.away.name), merged.status, Number(merged.status === 'finished' && completeScore(merged.ft)),
            Number(completeScore(merged.ht)), Number(merged.xg.home !== null && merged.xg.away !== null), Number(merged.statsChecked), payload, run.createdAt);
          saveVersion.run(hashId(merged.id, run.createdAt, sha256(payload)), merged.id, run.createdAt, merged.leagueId, merged.homeId, merged.awayId,
            merged.kickoffAt || merged.matchDate!, merged.status, payload);
          for (const source of sourceRows) {
            const quoteId = sha256(`${ARCHIVE_PROVIDER}:${source.id}`), existing = quoteExists.get(quoteId);
            if (existing && existing.match_id !== merged.id) throw new Error('Historical quote belongs to another canonical match.');
            next.quotes += Number(saveQuote.run(quoteId, merged.id, ARCHIVE_PROVIDER, source.file_sha, source.line, match.division, match.season, run.createdAt, source.payload).changes);
          }
          next.processed++; next[row.action === 'create' ? 'created' : 'enriched']++; next.lastIdentity = row.identity;
        }
        const previousRun = run; run = next;
        try { persist(); db.prepare('UPDATE fa_import_locks SET lease_until=? WHERE id=?').run(lease(), lockId); db.exec('COMMIT'); }
        catch (error) { run = previousRun; throw error; }
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      options.onProgress?.({ ...run });
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    if (run.created !== plan.target.create || run.enriched !== plan.target.enrich || run.quotes !== plan.target.quoteSnapshots)
      throw new Error('Committed match/quote counts do not reconcile with the approved plan.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const fileStatement = db.prepare('INSERT INTO fa_archive_files(id,archive_sha,file_sha,name,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING');
      for (const file of stage.prepare('SELECT name,sha,payload FROM archive_files ORDER BY name').iterate())
        fileStatement.run(hashId(archiveSha, String(file.name)), archiveSha, file.sha, file.name, file.payload);
      catalog(db, stage, run.createdAt);
      run.status = 'complete'; run.completedAt = new Date().toISOString(); persist(); db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return run;
  } catch (error) {
    if (ownsLease) { run.status = 'failed'; run.error = error instanceof Error ? error.message : 'Archive import failed.'; persist(); }
    throw error;
  } finally {
    if (ownsLease) db.prepare('UPDATE fa_import_locks SET lease_until=NULL WHERE id=?').run(lockId);
    db.close();
  }
}
