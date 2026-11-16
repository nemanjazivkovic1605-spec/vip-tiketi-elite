import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parse } from 'csv-parse/sync';
import { completeScore } from '../normalization.js';
import { archiveDate, inferArchiveSeason, normalizeArchiveMatch, sha256, transitionForArchive, type ArchiveMatch } from './normalization.js';
import { describeOddsColumn, parseArchiveOdds } from './odds.js';

export type ArchiveFile = { name: string; bytes: number; sha256: string };
export function decodeArchiveCsv(bytes: Buffer) {
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }; }
  catch { return { text: new TextDecoder('windows-1252', { fatal: true }).decode(bytes), encoding: 'windows-1252' }; }
}
export function readArchiveCsv(bytes: Buffer) {
  const decoded = decodeArchiveCsv(bytes);
  // csv-parse's synchronous overload does not model the documented info:true envelope.
  const parsed = parse(decoded.text, { bom: true, skip_empty_lines: true, relax_column_count: true, info: true }) as unknown as Array<{ record: string[]; info: { lines: number } }>;
  if (!parsed.length) return { ...decoded, headers: [], rows: [] };
  const headers = parsed.shift()!.record.map(value => value.replace(/^\uFEFF/, '').trim());
  if (!headers.includes('Date') || !headers.includes('HomeTeam') || !headers.includes('AwayTeam')) throw new Error('invalid_header');
  const nonEmptyHeaders = headers.filter(Boolean);
  if (new Set(nonEmptyHeaders).size !== nonEmptyHeaders.length) throw new Error('duplicate_header');
  return { encoding: decoded.encoding, headers, rows: parsed.map(({ record, info }) => ({
    line: info.lines,
    malformed: record.some((value, index) => value.trim() && (!headers[index] || index >= headers.length)),
    row: Object.fromEntries(headers.map((header, index) => [header, record[index]?.trim() || '']).filter(([header]) => header)),
  })) };
}
export function openArchiveStage(file: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;
    CREATE TABLE IF NOT EXISTS archive_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS archive_files(name TEXT PRIMARY KEY,sha TEXT NOT NULL,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS archive_matches(identity TEXT PRIMARY KEY,division TEXT NOT NULL,season TEXT NOT NULL,date TEXT NOT NULL,
      home TEXT NOT NULL,away TEXT NOT NULL,ft_h INTEGER,ft_a INTEGER,ht_h INTEGER,ht_a INTEGER,transition TEXT,conflicted INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS archive_rows(id TEXT PRIMARY KEY,identity TEXT NOT NULL,file_sha TEXT NOT NULL,line INTEGER NOT NULL,
      has_odds INTEGER NOT NULL,odds_count INTEGER NOT NULL,payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS archive_row_identity ON archive_rows(identity);
    CREATE INDEX IF NOT EXISTS archive_match_group ON archive_matches(division,season,date);
    CREATE TABLE IF NOT EXISTS archive_issues(id TEXT PRIMARY KEY,file TEXT NOT NULL,line INTEGER,code TEXT NOT NULL,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS archive_plan(identity TEXT PRIMARY KEY,action TEXT NOT NULL,existing_id TEXT,payload TEXT NOT NULL);
  `);
  return db;
}
export function mergeArchiveMatch(previous: ArchiveMatch, next: ArchiveMatch) {
  const conflicts: string[] = [];
  for (const field of ['ft', 'ht'] as const) for (const side of ['home', 'away'] as const) {
    if (previous[field][side] !== null && next[field][side] !== null && previous[field][side] !== next[field][side]) conflicts.push(`${field}_${side}_conflict`);
  }
  const merged = { ...previous, time: previous.time || next.time,
    ft: { home: previous.ft.home ?? next.ft.home, away: previous.ft.away ?? next.ft.away },
    ht: { home: previous.ht.home ?? next.ht.home, away: previous.ht.away ?? next.ht.away },
    warnings: [...new Set([...previous.warnings, ...next.warnings])] };
  if (completeScore(merged.ht) && completeScore(merged.ft) && (merged.ht.home! > merged.ft.home! || merged.ht.away! > merged.ft.away!)) conflicts.push('merged_ht_conflict');
  merged.transition = transitionForArchive(merged);
  return { merged, conflicts };
}

export function stageArchive(db: DatabaseSync, directory: string, files: ArchiveFile[], archiveSha: string, asOf: string, progress?: (value: unknown) => void, version = 'football-data-archive-v1') {
  const existing = db.prepare("SELECT value FROM archive_meta WHERE key='archiveSha'").get() as { value: string } | undefined;
  const oldVersion = db.prepare("SELECT value FROM archive_meta WHERE key='parserVersion'").get() as { value: string } | undefined;
  if (existing && (existing.value !== archiveSha || oldVersion?.value !== version)) throw new Error('Staging belongs to another archive/parser; use a new output directory.');
  const meta = db.prepare('INSERT INTO archive_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  meta.run('archiveSha', archiveSha); meta.run('parserVersion', version); meta.run('asOf', asOf);
  const insertIssue = db.prepare('INSERT INTO archive_issues(id,file,line,code,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING');
  const existingMatch = db.prepare('SELECT payload,conflicted FROM archive_matches WHERE identity=?');
  const saveMatch = db.prepare(`INSERT INTO archive_matches(identity,division,season,date,home,away,ft_h,ft_a,ht_h,ht_a,transition,conflicted,payload)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(identity) DO UPDATE SET ft_h=excluded.ft_h,ft_a=excluded.ft_a,ht_h=excluded.ht_h,ht_a=excluded.ht_a,
    transition=excluded.transition,conflicted=excluded.conflicted,payload=excluded.payload`);
  const insertRow = db.prepare('INSERT INTO archive_rows(id,identity,file_sha,line,has_odds,odds_count,payload) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING');
  const saveFile = db.prepare('INSERT INTO archive_files(name,sha,payload) VALUES(?,?,?)');
  const oldFile = db.prepare('SELECT sha FROM archive_files WHERE name=?');
  let resumedFiles = 0;
  for (const [index, file] of files.entries()) {
    const sourcePath = path.resolve(directory, file.name);
    if (!sourcePath.startsWith(path.resolve(directory) + path.sep) || !existsSync(sourcePath)) throw new Error('Unsafe or missing extracted CSV path.');
    const bytes = readFileSync(sourcePath);
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error('Extracted CSV checksum mismatch.');
    const processed = oldFile.get(file.name) as { sha: string } | undefined;
    if (processed) { if (processed.sha !== file.sha256) throw new Error('CSV changed after staging.'); resumedFiles++; continue; }
    const summary = { name: file.name, sha256: file.sha256, bytes: file.bytes, encoding: '', season: null as string | null,
      rows: 0, accepted: 0, rejected: 0, empty: 0, odds: 0, invalidOdds: 0, columns: [] as string[], error: null as string | null };
    db.exec('BEGIN IMMEDIATE');
    try {
      let csv: ReturnType<typeof readArchiveCsv>;
      try { csv = readArchiveCsv(bytes); }
      catch (error) {
        summary.error = error instanceof Error ? error.message : 'csv_parse_error';
        insertIssue.run(sha256(`${file.name}:file`), file.name, null, 'csv_file_error', JSON.stringify({ error: summary.error }));
        saveFile.run(file.name, file.sha256, JSON.stringify(summary)); db.exec('COMMIT'); continue;
      }
      summary.encoding = csv.encoding; summary.columns = csv.headers;
      summary.season = inferArchiveSeason(csv.rows.map(value => archiveDate(value.row.Date || '')).filter((date): date is string => Boolean(date)));
      const fallback = file.name.split(/[\\/]/).at(-1)!.replace(/(?: \(\d+\))?\.csv$/i, '').toUpperCase();
      for (const { row, line, malformed } of csv.rows) {
        summary.rows++;
        if (Object.values(row).every(value => !value)) { summary.empty++; continue; }
        try {
          if (malformed) throw new Error('unmapped_extra_cells');
          const match = normalizeArchiveMatch(row, summary.season, fallback, asOf);
          const { odds, invalid, statistics } = parseArchiveOdds(row), oddsCount = Object.keys(odds.prices).length;
          const previous = existingMatch.get(match.key) as { payload: string; conflicted: number } | undefined;
          const merged = previous ? mergeArchiveMatch(JSON.parse(previous.payload), match) : { merged: match, conflicts: [] };
          if (previous && JSON.parse(previous.payload).season !== match.season) merged.conflicts.push('season_conflict');
          const record = merged.merged;
          saveMatch.run(match.key, match.division, record.season, record.date, record.homeTeam, record.awayTeam,
            record.ft.home, record.ft.away, record.ht.home, record.ht.away, record.transition,
            Number(Boolean(previous?.conflicted || merged.conflicts.length)), JSON.stringify(record));
          const rowId = sha256(`${file.sha256}:${line}`);
          insertRow.run(rowId, match.key, file.sha256, line, Number(oddsCount > 0), oddsCount,
            JSON.stringify({ odds, statistics, sourceValues: { Date: row.Date, HomeTeam: row.HomeTeam, AwayTeam: row.AwayTeam,
              FTHG: row.FTHG, FTAG: row.FTAG, HTHG: row.HTHG, HTAG: row.HTAG, Time: row.Time }, invalidOdds: invalid }));
          for (const code of [...match.warnings, ...merged.conflicts, ...(invalid.length ? ['invalid_odds'] : [])]) {
            insertIssue.run(sha256(`${file.name}:${line}:${code}`), file.name, line, code,
              JSON.stringify({ identity: match.key, ...(code === 'invalid_odds' ? { columns: invalid } : {}) }));
          }
          summary.accepted++; summary.odds += oddsCount; summary.invalidOdds += invalid.length;
        } catch (error) {
          const code = error instanceof Error ? error.message : 'row_error';
          if (!['unmapped_extra_cells', 'unknown_league', 'invalid_date', 'unresolved_season', 'invalid_teams', 'future_result', 'inconsistent_ft_result'].includes(code)) throw error;
          summary.rejected++;
          insertIssue.run(sha256(`${file.name}:${line}:${code}`), file.name, line, code,
            JSON.stringify({ date: row.Date, home: row.HomeTeam, away: row.AwayTeam }));
        }
      }
      saveFile.run(file.name, file.sha256, JSON.stringify(summary)); db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    if ((index + 1) % 25 === 0 || index === files.length - 1) progress?.({ stage: 'parse', files: index + 1, total: files.length });
  }
  const metadata = (db.prepare('SELECT payload FROM archive_files ORDER BY name').all() as Array<{ payload: string }>).map(row => JSON.parse(row.payload));
  const columns = [...new Set<string>(metadata.flatMap(row => row.columns))].sort();
  return { files: metadata, resumedFiles, oddsColumnCatalog: Object.fromEntries(columns.flatMap(column => {
    const value = describeOddsColumn(column); return value ? [[column, value]] : [];
  })) };
}
