import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, archiveDate, FOOTBALL_DATA_LEAGUES } from '../server/footballAnalytics/footballDataArchive/normalization.js';
import { openArchiveStage, stageArchive, type ArchiveFile } from '../server/footballAnalytics/footballDataArchive/staging.js';
import { archiveStats, auditArchiveTarget, planArchive } from '../server/footballAnalytics/footballDataArchive/planner.js';
import { extractFootballArchive } from '../server/footballAnalytics/footballDataArchive/extraction.js';
import { writeArchive } from '../server/footballAnalytics/footballDataArchive/writer.js';
import { verifyArchiveImport } from '../server/footballAnalytics/footballDataArchive/verification.js';

const root = fileURLToPath(new URL('../', import.meta.url)), args = process.argv.slice(2);
const option = (name: string) => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const command = args.find(value => !value.startsWith('--')) || 'dry-run';
const asOf = option('as-of') || new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(new Date());
const assertLocal = (directory: string) => {
  const relative = path.relative(path.join(root, '.local-data'), directory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Output must be a new subdirectory of the project .local-data directory.');
};
function writeReports(directory: string, report: ReturnType<typeof planArchive>, stage: DatabaseSync, extra: Record<string, unknown>) {
  const value = { ...extra, ...report };
  writeFileSync(path.join(directory, 'dry-run-report.json'), JSON.stringify(value, null, 2));
  const issues = stage.prepare('SELECT file,line,code,payload FROM archive_issues ORDER BY file,line,code').all();
  writeFileSync(path.join(directory, 'issues.json'), JSON.stringify(issues, null, 2));
  const files = stage.prepare('SELECT payload FROM archive_files ORDER BY name').all().map(row => JSON.parse(row.payload as string));
  writeFileSync(path.join(directory, 'files.json'), JSON.stringify(files, null, 2));
  const quoteColumns = [...new Set<string>(files.flatMap(row => row.columns))];
  const recognized = stage.prepare("SELECT value FROM archive_meta WHERE key='oddsColumnCatalog'").get();
  writeFileSync(path.join(directory, 'odds-columns.json'), JSON.stringify({ headers: quoteColumns, mapping: JSON.parse(recognized!.value as string) }, null, 2));
  const review = stage.prepare("SELECT m.payload AS match,p.payload AS review,p.action FROM archive_matches m JOIN archive_plan p ON p.identity=m.identity WHERE p.action IN ('conflict','identityReview') ORDER BY m.date,m.identity").all();
  writeFileSync(path.join(directory, 'needs-review.json'), JSON.stringify(review.map(row => ({ action: row.action, match: JSON.parse(row.match as string), review: JSON.parse(row.review as string) })), null, 2));
  const n = (value: number) => value.toLocaleString('sr-Latn-RS');
  const total = archiveStats(stage);
  const text = [
    '# Football-Data.co.uk: probni uvoz', '',
    '**Nema produkcionog uvoza. Firestore upisi: 0. Postojeća SQL baza je otvorena samo za čitanje.**', '',
    '| Provera | Broj |', '| --- | ---: |',
    `| CSV fajlovi / pročitani | ${report.files} / ${report.filesProcessed} |`,
    `| Greške celog CSV fajla | ${report.fileErrors} |`,
    `| Izvorni redovi | ${n(report.sourceRows)} |`, `| Prihvaćeni redovi | ${n(report.acceptedRows)} |`,
    `| Odbijeni redovi | ${n(report.rejectedRows)} |`, `| Prazni redovi | ${n(report.emptyRows)} |`,
    `| Jedinstvene utakmice | ${n(report.uniqueMatches)} |`, `| Duplirana pojavljivanja u arhivi | ${n(report.duplicateOccurrences)} |`,
    `| Utakmice sa FT bez konflikta u arhivi | ${n(report.withFt)} |`, `| Koherentan HT + FT bez konflikta u arhivi | ${n(report.withHtFt)} |`,
    `| Nema FT / nema HT | ${n(report.missingFt)} / ${n(report.missingHt)} |`,
    `| Nema poznatog vremena početka | ${n(report.missingKickoffTime)} |`,
    `| Neispravne kvote, isključene iz normalizovanih cena | ${n(report.invalidOddsValues)} |`,
    `| Postojeće realne utakmice u analitičkoj bazi | ${n(report.target.matches)} |`,
    `| Plan: novi mečevi | ${n(report.target.create)} |`, `| Plan: dopuna postojećih | ${n(report.target.enrich)} |`,
    `| Plan: nepromenjeni | ${n(report.target.unchanged)} |`, `| Plan: konflikti / ručna provera identiteta | ${n(report.target.conflict)} / ${n(report.target.identityReview)} |`,
    `| Plan: izvorni zapisi kvota/statistike | ${n(report.target.quoteSnapshots)} |`,
    `| Konzervativna gornja procena SQL operacija | ${n(report.planned.sqlWritesUpperBound)} |`, '',
    '## HT/FT u arhivi', '', '| Prelaz | Broj | Uzorak | Procenat |', '| --- | ---: | ---: | ---: |',
    ...total.transitions.map(row => `| ${row.code} | ${n(row.count)} | ${n(row.sample)} | ${row.percent === null ? 'n/a' : `${row.percent.toFixed(2)}%`} |`), '',
    '## Pokrivenost', '', '| Liga | Sezona | Mečevi | FT | HT + FT | Konflikti |', '| --- | --- | ---: | ---: | ---: | ---: |',
    ...report.coverage.map((row: any) => `| ${FOOTBALL_DATA_LEAGUES[row.division]?.name || row.division} (${row.division}) | ${row.season} | ${row.matches} | ${row.withFt} | ${row.withHtFt} | ${row.conflicts} |`), '',
    '## Značenje i ograničenja', '',
    '- Ovo je istorija stvarnih utakmica, ne istorija prognoza/tiketa EliteVIPTips. Ne računaju se tipsterski profit, yield ili ROI iz naknadno izabranih prognoza.',
    '- Provera obuhvata strukturu, usklađenost i duplikate dostavljenih CSV zapisa, ne nezavisnu online potvrdu svakog rezultata i cene.',
    '- Originalni CSV fajlovi, SHA-256 i broj izvornog reda ostaju sačuvani lokalno. Nepoznate vrednosti su NULL, ne nule.',
    '- Datum se čita kao dan/mesec/godina. Sezona se prepoznaje na nivou celog fajla, uključujući odloženi završetak sezone 2019/20.',
    '- Vremenska zona CSV satnice nije potvrđena: ostaje NULL, a poznato UTC vreme postojećeg meča se ne prepisuje.',
    '- Pre-closing nije garancija prve opening kvote. C označava closing; proseci i maksimumi se ne predstavljaju kao pojedinačne kladioničarske ponude.',
    '- Sirove kvote, linije AH i broj kladionica su odvojene vrednosti. Ne dodaje se marža i ne koristi se kvota 1.00 kao zamena za nedostajući podatak.',
    '- Pinnacle kvote od 23.07.2025. nose upozorenje izvora o mogućoj zastarelosti. Ne biraju se automatski kao pouzdaniji izvor.',
    '- Konflikt rezultata, sezone ili nejasan identitet ide u izdvojen izveštaj; postojeći podaci se ne prepisuju.',
    '- Lokalni privatni uvoz zahteva izričito odobrenje fingerprinta plana, backup i proveru upisnog budžeta. Produkcijski uvoz nije omogućen.',
    '- Football-Data.co.uk navodi privatnu/nekomercijalnu upotrebu. Arhiva nije automatski odobrena za komercijalnu objavu ili AI trening.', '',
    'Izvori: [opis i uslovi](https://football-data.co.uk/data.php), [značenje CSV kolona](https://football-data.co.uk/notes.txt).', '',
    `Fingerprint plana: \`${report.fingerprint}\``, '',
  ].join('\n');
  writeFileSync(path.join(directory, 'dry-run-report.md'), text);
}

try {
  if (args.includes('--write') || !['dry-run', 'plan', 'stats', 'import', 'verify'].includes(command)) throw new Error('Koristite dry-run, stats, verify ili eksplicitni import --local-private --confirm=FINGERPRINT. Produkcijski upis nije omogućen.');
  if (archiveDate(asOf) !== asOf) throw new Error('Invalid as-of date.');
  if (command === 'import') {
    if (!args.includes('--local-private') || !option('confirm')) throw new Error('Import zahteva --local-private i --confirm=FINGERPRINT iz odobrenog dry-run izveštaja.');
    const stagePath = path.resolve(option('stage') || '');
    assertLocal(realpathSync(path.dirname(stagePath)));
    assertLocal(realpathSync(stagePath));
    const directory = path.dirname(stagePath), report = JSON.parse(readFileSync(path.join(directory, 'dry-run-report.json'), 'utf8'));
    const archive = option('archive');
    if (!archive || sha256(readFileSync(path.resolve(archive))) !== report.archiveSha) throw new Error('Originalna ZIP arhiva ne odgovara odobrenom planu.');
    const parserVersion = sha256(['normalization.ts', 'odds.ts', 'staging.ts'].map(file => readFileSync(path.join(root, 'server/footballAnalytics/footballDataArchive', file), 'utf8')).join('\n'));
    if (report.parserVersion !== parserVersion) throw new Error('Parser se promenio. Ponovite dry-run.');
    const database = realpathSync(path.resolve(option('database') || path.join(root, '.local-data/football-analytics.sqlite')));
    assertLocal(database);
    if (database === realpathSync(stagePath)) throw new Error('Staging i ciljna baza moraju biti odvojeni.');
    const stage = new DatabaseSync(stagePath, { readOnly: true });
    stage.exec('BEGIN');
    try {
      for (const file of stage.prepare('SELECT name,sha FROM archive_files').iterate()) {
        const source = realpathSync(path.join(directory, 'source', String(file.name)));
        assertLocal(source);
        if (sha256(readFileSync(source)) !== file.sha) throw new Error(`Izvorni CSV se promenio: ${file.name}`);
      }
      console.log(JSON.stringify({ mode: 'local-private', database, planned: report.target, budget: report.planned,
        batchMatches: Number(option('batch-matches') || 100), productionWrites: 0, firestoreWrites: 0 }));
      let lastReported = 0;
      const result = await writeArchive({ database, stage, approvedPlan: report, confirmation: option('confirm')!,
        privateLocal: true, allowLarge: args.includes('--allow-large'), resume: args.includes('--resume'),
        batchMatches: Number(option('batch-matches') || 100), backupDirectory: path.join(root, '.local-backups'),
        onProgress: run => { if (run.processed - lastReported >= 5000) {
          console.log(JSON.stringify({ processed: run.processed, created: run.created, enriched: run.enriched, quotes: run.quotes })); lastReported = run.processed;
        } } });
      writeFileSync(path.join(directory, 'import-report.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
    } finally { stage.exec('ROLLBACK'); stage.close(); }
  } else if (command === 'verify') {
    const stagePath = realpathSync(path.resolve(option('stage') || ''));
    assertLocal(stagePath);
    const directory = path.dirname(stagePath), run = JSON.parse(readFileSync(path.join(directory, 'import-report.json'), 'utf8'));
    const database = realpathSync(path.resolve(option('database') || path.join(root, '.local-data/football-analytics.sqlite')));
    assertLocal(database);
    const stage = new DatabaseSync(stagePath, { readOnly: true });
    try {
      const result = verifyArchiveImport(database, stage, run);
      writeFileSync(path.join(directory, 'import-verification.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
    } finally { stage.close(); }
  } else if (command === 'stats') {
    const stagePath = path.resolve(option('stage') || '');
    assertLocal(path.dirname(stagePath));
    const stage = new DatabaseSync(stagePath, { readOnly: true });
    try {
      const venue = option('venue');
      if (venue && (!['home', 'away'].includes(venue) || !option('team'))) throw new Error('Venue zahteva --team i home ili away.');
      console.log(JSON.stringify(archiveStats(stage, { division: option('league'), season: option('season'), team: option('team'), venue: venue as 'home' | 'away' }), null, 2));
    } finally { stage.close(); }
  } else {
    const archive = option('archive');
    if (!archive) throw new Error('Navedite --archive=PATH do ZIP arhive.');
    const archivePath = path.resolve(archive), archiveSha = sha256(readFileSync(archivePath));
    const parserVersion = sha256(['normalization.ts', 'odds.ts', 'staging.ts'].map(file => readFileSync(path.join(root, 'server/footballAnalytics/footballDataArchive', file), 'utf8')).join('\n'));
    const output = path.resolve(option('out') || path.join(root, '.local-data/football-data-archive', `${archiveSha.slice(0, 12)}-${asOf}-${parserVersion.slice(0, 8)}`));
    assertLocal(output); mkdirSync(output, { recursive: true });
    const files = await extractFootballArchive(archivePath, path.join(output, 'source'), path.join(root, '.local-data'));
    console.log(JSON.stringify({ stage: 'extracted', files: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0) }));
    const expected = Number(option('expected-files') || 434);
    if (files.length !== expected) throw new Error(`Expected ${expected} CSV files, found ${files.length}.`);
    const database = path.resolve(option('database') || path.join(root, '.local-data/football-analytics.sqlite'));
    const before = auditArchiveTarget(database), stage = openArchiveStage(path.join(output, 'archive-stage.sqlite'));
    try {
      const parsed = stageArchive(stage, path.join(output, 'source'), files, archiveSha, asOf, value => console.log(JSON.stringify(value)), parserVersion);
      stage.prepare("INSERT INTO archive_meta(key,value) VALUES('oddsColumnCatalog',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(parsed.oddsColumnCatalog));
      const reportPath = path.join(output, 'dry-run-report.json');
      const previousReport = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : undefined;
      const report = planArchive(stage, before), after = auditArchiveTarget(database);
      if (before.fingerprint !== after.fingerprint || JSON.stringify(before.tables) !== JSON.stringify(after.tables)) throw new Error('Target changed during the audit. No approval-ready report has been produced; rerun.');
      if (sha256(readFileSync(archivePath)) !== archiveSha) throw new Error('Archive changed during the audit.');
      writeReports(output, report, stage, { generatedAt: new Date().toISOString(), archiveSha, parserVersion, asOf,
        resumedFiles: parsed.resumedFiles, repeatVerified: parsed.resumedFiles === files.length && previousReport?.fingerprint === report.fingerprint,
        sourceArchiveUnchanged: true, targetUnchanged: true });
      console.log(JSON.stringify({ files: report.files, rows: report.sourceRows, uniqueMatches: report.uniqueMatches,
        withHtFt: report.withHtFt, duplicates: report.duplicateOccurrences, rejected: report.rejectedRows, missingHt: report.missingHt,
        target: report.target, planned: report.planned, fingerprint: report.fingerprint, resumedFiles: parsed.resumedFiles,
        repeatVerified: parsed.resumedFiles === files.length && previousReport?.fingerprint === report.fingerprint,
        targetUnchanged: true, report: path.join(output, 'dry-run-report.md'), stage: path.join(output, 'archive-stage.sqlite') }, null, 2));
    } finally { stage.close(); }
  }
} catch (error) { console.error(error instanceof Error ? error.message : 'Archive audit failed.'); process.exitCode = 1; }
