import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, isDeepStrictEqual } from 'node:util';
import { initializeApp, cert, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import config from '../firebase-applet-config.json' with { type: 'json' };
import { parseTipCsv } from '../server/historyImport/csv.js';
import { planHistoricalTips } from '../server/historyImport/planner.js';
import { verifyHistoricalResults } from '../server/historyImport/verification.js';
import { inspectHistoricalImport, previewHistoricalStats, plannedImportWrites, applyHistoricalImport } from '../server/historyImport/firestore.js';
import { statsEntry } from '../src/utils/publicStats.js';
import type { TicketProductType, Tip } from '../src/types.js';
import { mapTicketForPublic } from '../src/services/tickets/ticketMappers.js';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });
const { values } = parseArgs({ options: {
  file: { type: 'string' }, credentials: { type: 'string' }, report: { type: 'string' }, controls: { type: 'string' },
  category: { type: 'string', default: 'vip_monthly' }, 'as-of': { type: 'string' },
  write: { type: 'boolean', default: false }, confirm: { type: 'string' },
  'acknowledge-unconfirmed': { type: 'boolean', default: false }, 'confirm-large-import': { type: 'boolean', default: false },
  help: { type: 'boolean', default: false },
} });
if (values.help || !values.file) {
  console.log('npm run import:history:csv -- --file "tips.csv" [--credentials "service-account.json"] [--controls "checks.json"]');
  console.log('Dry-run je podrazumevan. Upis: --write --confirm FINGERPRINT [--acknowledge-unconfirmed] [--confirm-large-import]');
  if (!values.file && !values.help) process.exitCode = 1;
} else {
  const category = values.category as TicketProductType;
  if (!['vip_monthly', 'elite_ticket', 'safe_pick'].includes(category)) throw new Error('Nepoznata kategorija.');
  // Each CSV row is an independent single, never an invented Elite combination.
  if (category !== 'vip_monthly') throw new Error('Ovaj CSV sadrzi pojedinacne tipove. Koristite vip_monthly, ne Elite/Safe kombinacije.');
  const input = await fs.readFile(values.file);
  const asOf = values['as-of'] || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Belgrade' });
  const parsed = parseTipCsv(input, asOf);
  if (!parsed.rows.length) throw new Error('CSV nema validnih redova: ' + JSON.stringify(parsed.errors));
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const credentialFile = values.credentials || process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const account = raw ? JSON.parse(raw) : credentialFile ? JSON.parse(await fs.readFile(credentialFile, 'utf8')) : null;
  if (account && account.project_id !== config.projectId) throw new Error('Firebase project mismatch. Nije bilo upisa.');
  const app = initializeApp({ projectId: config.projectId, credential: account ? cert(account) : applicationDefault() }, 'historical-tip-import');
  const db = getFirestore(app, config.firestoreDatabaseId);
  try {
    const state = await inspectHistoricalImport(db, parsed);
    const verification = await verifyHistoricalResults(parsed.rows);
    const plan = planHistoricalTips(parsed, state.existing, verification.byIdentity, {
      category, fileName: path.basename(values.file), now: new Date(), occupiedPublicIds: state.occupiedPublicIds,
      previouslyImportedIds: state.previouslyImportedIds,
    });
    const projected = await previewHistoricalStats(db, plan);
    const controls = values.controls ? JSON.parse(await fs.readFile(values.controls, 'utf8')) : null;
    const controlErrors: string[] = [];
    for (const [key, expected] of Object.entries(controls?.totals || {})) {
      if (typeof expected !== 'number' || Math.abs((plan.totals as any)[key] - expected) > .005) controlErrors.push(`Ukupno ${key}: dobijeno ${(plan.totals as any)[key]}, ocekivano ${expected}.`);
    }
    for (const [month, checks] of Object.entries(controls?.months || {})) for (const [key, expected] of Object.entries(checks as object)) {
      if (typeof expected !== 'number' || Math.abs((plan.months[month] as any)?.[key] - expected) > .005 || !plan.months[month]) controlErrors.push(`${month} ${key}: kontrolni zbir nije uskladjen.`);
    }
    const report = { dryRun: !values.write, project: config.projectId, database: config.firestoreDatabaseId,
      fileHash: plan.fileHash, fingerprint: plan.fingerprint, inputRows: plan.totalRows,
      readyToWrite: plan.tickets.length, duplicates: plan.duplicates, conflicts: plan.conflicts,
      confirmed: plan.confirmed, unconfirmed: plan.unconfirmed, csvTotals: plan.totals, csvMonths: plan.months,
      plannedWriteOperations: plannedImportWrites(plan), controlErrors, verificationWarnings: verification.warnings,
      projected: { total: projected.all.completedCount, wins: projected.all.winCount, losses: projected.all.lossCount,
        units: projected.all.totalUnitsStaked, profit: projected.all.unitsProfit, months: projected.categories.vip_monthly.monthlyBreakdown.filter(month => Object.hasOwn(plan.months, month.key)) },
      written: 0, postWriteVerified: false,
    };
    const reportPath = path.resolve(values.report || `.local-data/history-imports/${plan.fileHash}-report.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    const saveReport = async () => fs.writeFile(reportPath, JSON.stringify({ report, plan, verification }, null, 2));
    await saveReport();
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
    if (values.write) {
      if (controlErrors.length) throw new Error('Kontrolni zbirovi se ne poklapaju. Nije bilo upisa.');
      const result = await applyHistoricalImport(db, plan, { confirmation: values.confirm || '', acknowledgeUnconfirmed: values['acknowledge-unconfirmed'],
        confirmLargeImport: values['confirm-large-import'], backupDirectory: path.join(path.dirname(reportPath), 'backups') });
      report.written = result.written;
      // Read back every written projection and compare values, not only document counts.
      for (let offset = 0; offset < plan.tickets.length; offset += 100) {
        const selected = plan.tickets.slice(offset, offset + 100);
        const snapshots = await db.getAll(...selected.flatMap(ticket => ['tickets', 'publicTickets', 'publicStatsTickets'].map(collection => db.doc(`${collection}/${ticket.id}`))));
        for (const [index, ticket] of selected.entries()) {
          const documents = snapshots.slice(index * 3, index * 3 + 3);
          if (documents.some(document => !document.exists)) throw new Error('Post-write provera: nedostaje jedan od zapisa.');
          for (const document of documents) {
            const saved = document.data() as Tip;
            const expected = document.ref.parent.id === 'tickets' ? ticket : mapTicketForPublic(ticket);
            if (!isDeepStrictEqual(statsEntry(saved), statsEntry(ticket)) || !isDeepStrictEqual(saved.matches, expected.matches)) throw new Error('Post-write provera: podaci tiketa se ne poklapaju.');
            if (document.ref.parent.id !== 'tickets' && (saved.historicalImport || saved.adminImportRef || saved.analysis)) throw new Error('Admin podatak je dospeo u javni indeks.');
          }
          const safe = mapTicketForPublic(ticket);
          if (safe.historicalImport || safe.adminImportRef) throw new Error('Neispravna javna projekcija.');
        }
      }
      const after = await inspectHistoricalImport(db, parsed);
      const repeated = planHistoricalTips(parsed, after.existing, verification.byIdentity, { category, fileName: plan.fileName, now: new Date(),
        occupiedPublicIds: after.occupiedPublicIds, previouslyImportedIds: after.previouslyImportedIds });
      if (repeated.tickets.length) throw new Error('Idempotency provera nije prosla.');
      const actual = after.summary;
      for (const month of Object.keys(plan.months)) {
        const expected = projected.months[month]?.groups.vip_monthly, obtained = actual.months[month]?.groups.vip_monthly;
        if (expected && (!obtained || ['count', 'wins', 'losses', 'units', 'profit'].some(key => Math.abs((expected as any)[key] - (obtained as any)[key]) > .001))) throw new Error(`Agregat za ${month} nije uskladjen sa upisanim tiketima.`);
      }
      report.postWriteVerified = true;
      await saveReport();
      console.log(JSON.stringify({ result, postWriteVerified: true, repeatImportNewTickets: repeated.tickets.length,
        confirmed: plan.confirmed, unconfirmed: plan.unconfirmed, reportPath }, null, 2));
    }
  } catch (error) {
    const failure = error as Error & { partialReport?: unknown };
    console.error(JSON.stringify({ error: failure.message, partialReport: failure.partialReport || null }));
    process.exitCode = 1;
  } finally { await db.terminate(); await deleteApp(app); }
}
