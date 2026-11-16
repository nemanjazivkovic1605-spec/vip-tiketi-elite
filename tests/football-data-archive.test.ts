import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { archiveDate, archiveIdentity, archiveTeamName, inferArchiveSeason, normalizeArchiveMatch, sha256 } from '../server/footballAnalytics/footballDataArchive/normalization.ts';
import { describeOddsColumn, expandArchiveOdds, parseArchiveOdds } from '../server/footballAnalytics/footballDataArchive/odds.ts';
import { archiveEntryPath } from '../server/footballAnalytics/footballDataArchive/extraction.ts';
import { openArchiveStage, readArchiveCsv, stageArchive, mergeArchiveMatch } from '../server/footballAnalytics/footballDataArchive/staging.ts';
import { archiveStats, auditArchiveTarget, compareArchiveTarget, planArchive } from '../server/footballAnalytics/footballDataArchive/planner.ts';
import { openAnalyticsDatabase, migrateAnalytics } from '../server/footballAnalytics/database.ts';
import { ingestMatch } from '../server/footballAnalytics/store.ts';
import type { MatchObservation } from '../src/types/footballAnalytics.ts';

const base = { Div: 'E0', Date: '02/08/2024', HomeTeam: 'Man Utd', AwayTeam: 'Wolves', FTHG: '2', FTAG: '1', HTHG: '0', HTAG: '1', FTR: 'H', HTR: 'A' };
const match = (patch: Record<string, string> = {}) => normalizeArchiveMatch({ ...base, ...patch }, '2024/25', 'E0', '2026-11-15');
test('archive dates are explicit, validated and do not infer US format or fabricate kickoff UTC', () => {
  for (const date of ['02/08/24', '2/8/2024', '02.08.2024', '2024-08-02']) assert.equal(archiveDate(date), '2024-08-02');
  for (const date of ['31/02/24', '29/02/23', '08/32/24', 'yesterday', '45000']) assert.equal(archiveDate(date), null);
  assert.equal(archiveDate('29/02/24'), '2024-02-29');
  assert.equal(inferArchiveSeason(['2019-08-01', '2020-01-01', '2020-06-01', '2020-07-26', '2020-08-01']), '2019/20');
  assert.equal(inferArchiveSeason(['2019-08-01', '2021-02-01']), null);
  assert.equal(match().time, null); assert.equal(match({ Time: '9:30' }).time, '09:30'); assert.equal(match().timeZone, null);
});
test('league/team identity is country-aware and does not mislabel Spain second division', () => {
  assert.equal(archiveTeamName('Man Utd', 'England'), 'Manchester United');
  assert.equal(archiveTeamName('Man Utd', 'Scotland'), 'Man Utd');
  assert.equal(match().key, match({ HomeTeam: 'Manchester United', AwayTeam: 'Wolverhampton Wanderers' }).key);
  const spanish = normalizeArchiveMatch({ ...base, Div: 'SP2' }, '2024/25', 'SP2', '2026-11-15');
  assert.equal(spanish.league.name, 'Segunda Division'); assert.equal(spanish.league.tier, 2);
  assert.notEqual(archiveIdentity(spanish.league, spanish.date, spanish.homeTeam, spanish.awayTeam), match().key);
});
test('all nine HT/FT transitions use actual scores; unknown/invalid half-time never becomes 0:0', () => {
  const scores = { '1': ['1', '0'], X: ['0', '0'], '2': ['0', '1'] };
  for (const [half, ht] of Object.entries(scores)) for (const [full, ft] of Object.entries(scores)) {
    assert.equal(match({ HTHG: ht[0], HTAG: ht[1], FTHG: String(Number(ft[0]) + 2), FTAG: String(Number(ft[1]) + 2), FTR: '', HTR: '' }).transition, `${half}/${full}`);
  }
  assert.equal(match({ HTHG: '', HTAG: '', HTR: '' }).transition, null);
  const invalid = match({ HTHG: '3', HTAG: '0', HTR: 'H' });
  assert.deepEqual(invalid.ht, { home: null, away: null }); assert.equal(invalid.transition, null);
  assert.throws(() => match({ FTR: 'A' }), /inconsistent_ft_result/);
  assert.throws(() => match({ Date: '03/08/2099' }), /unresolved_season/);
});
test('odds distinguish closing, pre-closing, bookmaker, aggregate, AH line and bookmaker counts', () => {
  const { odds, invalid } = parseArchiveOdds({ B365H: '2.10', B365CH: '1.95', MaxH: '2.2', AvgCH: '1.9',
    'BbMx>2.5': '1.80', 'PC<2.5': '2.20', B365AHH: '1.88', B365CAHH: '2.1', AHh: '0', AHCh: '-0.5',
    Bb1X2: '40', B365A: '1', B365D: 'not-a-number' });
  assert.equal(describeOddsColumn('PSCH')?.kind, 'price');
  assert.equal((describeOddsColumn('VCH') as any)?.phase, 'pre_closing');
  assert.equal((describeOddsColumn('VCCCH') as any), null);
  assert.equal((describeOddsColumn('VCCH') as any)?.phase, 'closing');
  assert.equal((describeOddsColumn('SKBCH') as any)?.phase, 'closing');
  assert.equal(describeOddsColumn('BbAH')?.kind, 'count');
  const values = expandArchiveOdds(odds), find = (column: string) => values.find(row => row.column === column)!;
  assert.equal(find('B365H').phase, 'pre_closing'); assert.equal(find('B365CH').phase, 'closing');
  assert.equal(find('MaxH').aggregation, 'maximum'); assert.equal(find('AvgCH').aggregation, 'average');
  assert.equal(find('B365AHH').line, 0); assert.equal(find('B365CAHH').line, -.5);
  assert.equal(find('PC<2.5').line, 2.5); assert.equal(find('PC<2.5').selection, 'under');
  assert.equal(odds.bookmakerCounts.Bb1X2, 40); assert.equal(values.length, 8);
  assert.deepEqual(invalid, ['B365A', 'B365D']);
  assert.equal(odds.prices.B365A, undefined);
});
test('CSV parsing handles BOM, quoted commas, legacy encoding and flags unnamed nonempty columns', () => {
  const csv = readArchiveCsv(Buffer.from('\uFEFFDiv,Date,HomeTeam,AwayTeam,FTHG,FTAG\r\nE0,02/08/2024,"Team, A",Team B,2,1\r\n'));
  assert.equal(csv.rows[0].row.HomeTeam, 'Team, A');
  assert.equal(readArchiveCsv(Buffer.from('Div,Date,HomeTeam,AwayTeam\nSP1,02/08/2024,Málaga,Betis', 'latin1')).rows[0].row.HomeTeam, 'Málaga');
  assert.equal(readArchiveCsv(Buffer.from('Div,Date,HomeTeam,AwayTeam,\nE0,02/08/2024,A,B,extra')).rows[0].malformed, true);
  assert.throws(() => readArchiveCsv(Buffer.from('Date,Date,HomeTeam,AwayTeam\n')), /duplicate_header/);
});
test('duplicate score conflicts remain quarantined; missing data is filled without replacing known results', () => {
  const missing = match({ HTHG: '', HTAG: '', HTR: '' }), known = match();
  assert.equal(mergeArchiveMatch(missing, known).merged.transition, '2/1');
  const conflict = mergeArchiveMatch(known, match({ FTHG: '3' }));
  assert.deepEqual(conflict.conflicts, ['ft_home_conflict']); assert.equal(conflict.merged.ft.home, 2);
  const previous = { ...known, season: '2024/25', status: 'finished', ft: known.ft, ht: known.ht } as any;
  assert.deepEqual(compareArchiveTarget(known, previous).missing, []);
  assert.deepEqual(compareArchiveTarget(known, { ...previous, season: '2024/2025' }).conflicts, []);
  assert.deepEqual(compareArchiveTarget(match({ FTHG: '3' }), previous).conflicts, ['ft.home']);
});
test('unsafe extraction paths are rejected before writing files', () => {
  const root = path.resolve(os.tmpdir(), 'elite-safe-archive');
  for (const value of ['../outside.csv', '..\\outside.csv', '/absolute.csv', 'C:/outside.csv', 'x/../../outside.csv']) assert.throws(() => archiveEntryPath(root, value));
  assert.equal(archiveEntryPath(root, 'nested/E0.csv'), path.join(root, 'nested/E0.csv'));
});
test('full dry-run resumes identically and never changes target matches, schemas, quotes or tickets', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'elite-archive-test-'));
  let stage: ReturnType<typeof openArchiveStage> | undefined;
  try {
    const targetPath = path.join(root, 'analytics.sqlite'), target = await openAnalyticsDatabase(targetPath);
    await migrateAnalytics(target);
    const observation: MatchObservation = { provider: 'manual', sourceId: 'existing-test-only', environment: 'real',
      league: { sourceId: 'PL', name: 'Premier League', country: 'England' }, season: '2024/25', kickoffAt: '2024-08-02T19:00:00Z',
      home: { sourceId: 'home', name: 'Manchester United' }, away: { sourceId: 'away', name: 'Wolverhampton Wanderers' },
      status: 'finished', ft: { home: 2, away: 1 }, ht: { home: 0, away: 1 }, extraTime: { home: null, away: null }, penalties: { home: null, away: null },
      xg: { home: null, away: null }, shots: { home: 15, away: 6 }, shotsOnTarget: { home: null, away: null },
      events: null, individualShots: null, observedAt: '2026-11-15T10:00:00Z', statsChecked: true };
    await ingestMatch(target, observation); await target.close();
    const file1 = 'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,HTHG,HTAG,B365H,HS\nE0,02/08/2024,Man Utd,Wolves,2,1,0,1,2.1,9\nE0,03/08/2024,Leeds,Man Utd,1,1,1,0,2.4,8\n';
    const file2 = 'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,HTHG,HTAG,MaxCH\nE0,02/08/2024,Manchester United,Wolves,2,1,0,1,2.5\n';
    writeFileSync(path.join(root, 'E0.csv'), file1); writeFileSync(path.join(root, 'E0 (1).csv'), file2);
    const files = ['E0.csv', 'E0 (1).csv'].map(name => { const bytes = readFileSync(path.join(root, name)); return { name, bytes: bytes.length, sha256: sha256(bytes) }; });
    stage = openArchiveStage(path.join(root, 'stage.sqlite'));
    const before = auditArchiveTarget(targetPath);
    stageArchive(stage, root, files, 'unit-only-sha', '2026-11-15');
    const first = planArchive(stage, before);
    assert.equal(first.uniqueMatches, 2); assert.equal(first.duplicateOccurrences, 1);
    assert.equal(first.target.create, 1); assert.equal(first.target.enrich, 1);
    assert.equal(first.target.statisticsFills, 0, 'known reliable shots are never replaced');
    assert.equal(first.planned.firestoreWrites, 0);
    assert.equal(stageArchive(stage, root, files, 'unit-only-sha', '2026-11-15').resumedFiles, 2);
    const repeated = planArchive(stage, auditArchiveTarget(targetPath));
    assert.deepEqual(repeated, first);
    assert.equal(auditArchiveTarget(targetPath).fingerprint, before.fingerprint);
    assert.deepEqual(auditArchiveTarget(targetPath).tables, before.tables);
    assert.equal(archiveStats(stage, { division: 'E0', team: 'Man Utd', venue: 'home' }).matches, 1);
    assert.equal(archiveStats(stage, { division: 'E0', team: 'Man Utd', venue: 'away' }).matches, 1);
  } finally {
    stage?.close();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('elite-archive-test-'));
    rmSync(root, { recursive: true, force: true });
  }
});
