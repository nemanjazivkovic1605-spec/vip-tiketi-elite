import dotenv from 'dotenv';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openAnalyticsDatabase, migrateAnalytics } from '../server/footballAnalytics/database.js';
import { historicalOverview } from '../server/footballAnalytics/historicalOverview.js';
import { planHistoricalImport, writeHistoricalImport } from '../server/footballAnalytics/historicalImport.js';
import type { HistoricalImportOptions } from '../src/types/historicalAnalytics.js';

dotenv.config({ path: '.env.analysis.local', quiet: true });
const command = process.argv[2] || 'report';
const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const db = await openAnalyticsDatabase();
try {
  if (command === 'migrate') {
    if (db.kind === 'postgres' && process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED !== 'true') throw new Error('Migracija produkcijske baze zahteva HISTORICAL_ANALYTICS_WRITE_ENABLED=true.');
    await migrateAnalytics(db);
    console.log(JSON.stringify({ ready: true, database: db.kind, firestoreWrites: 0 }));
  } else {
    const file = argument('file');
    const options: HistoricalImportOptions = {
      ...(argument('league') ? { league: argument('league') } : {}), ...(argument('season') ? { season: argument('season') } : {}),
      ...(argument('tier') ? { tier: Number(argument('tier')) } : {}), ...(argument('team') ? { team: argument('team') } : {}),
      provider: (argument('provider') || (file ? 'manual' : 'auto')) as HistoricalImportOptions['provider'],
      incremental: process.argv.includes('--incremental'),
      archiveOnly: process.argv.includes('--archive-only'),
      ...(file ? { content: await readFile(file, 'utf8'), format: /\.json$/i.test(file) ? 'json' as const : 'csv' as const,
        sourceName: argument('source-name'), sourceUrl: argument('source-url'), rightsConfirmed: process.argv.includes('--rights-confirmed') } : {}),
    };
    if (command === 'report') {
      const report = await historicalOverview(db, options);
      const value = { totals: report.totals, coverage: report.coverage, aggregate: report.aggregate, sources: report.sources, runs: report.runs, firestoreWrites: 0 };
      console.log(JSON.stringify(value, null, 2));
      if (argument('output')) await writeFile(resolve(argument('output')!), JSON.stringify(value, null, 2));
    } else if (['plan', 'import'].includes(command)) {
      const plan = await planHistoricalImport(db, options);
      console.log(JSON.stringify({ dryRun: true, ...plan.summary }, null, 2));
      if (argument('output')) await writeFile(resolve(argument('output')!), JSON.stringify(plan.summary, null, 2));
      if (process.argv.includes('--write')) {
        if (command !== 'import' || !argument('confirm-plan')) throw new Error('Upis zahteva import --write --confirm-plan=FINGERPRINT iz prethodnog dry-run-a.');
        const result = await writeHistoricalImport(db, plan, argument('confirm-plan')!, { allowLarge: process.argv.includes('--allow-large') });
        console.log(JSON.stringify({ dryRun: false, database: db.kind, firestoreWrites: 0, ...result }, null, 2));
      }
    } else throw new Error('Koristite report, migrate, plan ili import. Import je dry-run bez --write i --confirm-plan.');
  }
} catch (error) { console.error(error instanceof Error ? error.message : 'Istorijska provera nije uspela.'); process.exitCode = 1; }
finally { await db.close(); }
