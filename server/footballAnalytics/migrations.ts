// Portable, isolated analytics schema. No production Firestore collections are used.
export const migrations = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS fa_schema (version INTEGER PRIMARY KEY)`,
      `CREATE TABLE IF NOT EXISTS fa_providers (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS fa_leagues (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS fa_coverage (id TEXT PRIMARY KEY, payload TEXT NOT NULL, lease_until TEXT)`,
      `CREATE TABLE IF NOT EXISTS fa_items (job_id TEXT NOT NULL, ordinal INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(job_id, ordinal))`,
      `CREATE TABLE IF NOT EXISTS fa_matches (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, season TEXT NOT NULL, environment TEXT NOT NULL, kickoff_at TEXT NOT NULL, home_id TEXT NOT NULL, away_id TEXT NOT NULL, home_key TEXT NOT NULL, away_key TEXT NOT NULL, status TEXT NOT NULL, finished_complete INTEGER NOT NULL, has_ht INTEGER NOT NULL, has_xg INTEGER NOT NULL, stats_checked INTEGER NOT NULL, payload TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS fa_sources (provider TEXT NOT NULL, source_id TEXT NOT NULL, environment TEXT NOT NULL, match_id TEXT NOT NULL, PRIMARY KEY(provider, source_id, environment))`,
      `CREATE TABLE IF NOT EXISTS fa_aliases (provider TEXT NOT NULL, source_id TEXT NOT NULL, environment TEXT NOT NULL, team_id TEXT NOT NULL, PRIMARY KEY(provider, source_id, environment))`,
      `CREATE TABLE IF NOT EXISTS fa_versions (id TEXT PRIMARY KEY, match_id TEXT NOT NULL, available_at TEXT NOT NULL, league_id TEXT NOT NULL, home_id TEXT NOT NULL, away_id TEXT NOT NULL, kickoff_at TEXT NOT NULL, environment TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS fa_unresolved (id TEXT PRIMARY KEY, reason TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS fa_match_date ON fa_matches(environment, kickoff_at)`,
      `CREATE INDEX IF NOT EXISTS fa_match_identity ON fa_matches(environment, league_id, season, home_key, away_key)`,
      `CREATE INDEX IF NOT EXISTS fa_version_home ON fa_versions(environment, home_id, available_at)`,
      `CREATE INDEX IF NOT EXISTS fa_version_away ON fa_versions(environment, away_id, available_at)`,
      `CREATE INDEX IF NOT EXISTS fa_version_match ON fa_versions(match_id, available_at)`,
    ],
  },
  {
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS fa_schema (version INTEGER PRIMARY KEY)`,
      `ALTER TABLE fa_matches ADD COLUMN checked_at TEXT`,
      `CREATE TABLE IF NOT EXISTS fa_teams (id TEXT PRIMARY KEY, environment TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS fa_historical_checks (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, season TEXT NOT NULL, payload TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS fa_import_runs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS fa_import_locks (id TEXT PRIMARY KEY, lease_until TEXT)`,
      `CREATE INDEX IF NOT EXISTS fa_historical_league ON fa_historical_checks(league_id,season)`,
      `CREATE INDEX IF NOT EXISTS fa_import_runs_created ON fa_import_runs(created_at)`,
    ],
  },
  {
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS fa_schema (version INTEGER PRIMARY KEY)`,
      `CREATE TABLE IF NOT EXISTS fa_historical_quotes (id TEXT PRIMARY KEY, match_id TEXT NOT NULL, provider TEXT NOT NULL, file_sha TEXT NOT NULL, source_line INTEGER NOT NULL, division TEXT NOT NULL, season TEXT NOT NULL, observed_at TEXT NOT NULL, payload TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS fa_historical_quote_match ON fa_historical_quotes(match_id,provider)`,
      `CREATE TABLE IF NOT EXISTS fa_archive_files (id TEXT PRIMARY KEY, archive_sha TEXT NOT NULL, file_sha TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS fa_archive_file_sha ON fa_archive_files(file_sha)`,
      `CREATE TABLE IF NOT EXISTS fa_archive_imports (id TEXT PRIMARY KEY, archive_sha TEXT NOT NULL, plan_fingerprint TEXT NOT NULL, plan_digest TEXT NOT NULL, last_identity TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL)`,
    ],
  },
  {
    version: 4,
    statements: [
      `CREATE TABLE IF NOT EXISTS fa_schema (version INTEGER PRIMARY KEY)`,
      `CREATE TABLE IF NOT EXISTS fa_public_snapshots (id TEXT PRIMARY KEY, version TEXT NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL)`,
    ],
  },
];
