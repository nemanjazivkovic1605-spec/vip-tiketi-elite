import dotenv from 'dotenv';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openAnalyticsDatabase } from '../server/footballAnalytics/database.js';
import { readEnglishMatches } from '../server/footballAnalytics/historicalMatches.js';
import { rankHtftTeams, htftSchedule } from '../server/footballAnalytics/htftAnalytics.js';
import { historicalOverview } from '../server/footballAnalytics/historicalOverview.js';
import { planHtftSync } from '../server/footballAnalytics/htftSync.js';
import { writeHistoricalImport } from '../server/footballAnalytics/historicalImport.js';
import { localDate } from '../server/sportsApi.js';

dotenv.config({ path: '.env.analysis.local', quiet: true });
const args = process.argv.slice(2), command = args[0] || 'report';
const argument = (name: string) => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const db = await openAnalyticsDatabase();
try {
  if (command === 'report') {
    const matches = await readEnglishMatches(db), ranking = rankHtftTeams(matches);
    const overview = await historicalOverview(db), schedule = await htftSchedule(db, localDate(), 7);
    const value = { asOf: new Date().toISOString(), matches: matches.length, finished: ranking.aggregate.finished, htft: ranking.aggregate.withHtFt,
      transitions: ranking.aggregate.htft, leaders: ranking.leaders,
      coverage: overview.coverage.filter(row => row.matches), uncovered: overview.coverage.filter(row => !row.matches).map(({ name, season, reason }) => ({ name, season, reason })),
      nextSevenDays: schedule.total, sourceFreshness: schedule.coverage, sources: overview.sources, database: overview.database.kind, firestoreWrites: 0 };
    console.log(JSON.stringify(value, null, 2));
    if (argument('output')) await writeFile(resolve(argument('output')!), JSON.stringify(value, null, 2));
  } else if (command === 'plan' || command === 'sync') {
    const plan = await planHtftSync(db, { league: argument('league') });
    console.log(JSON.stringify({ dryRun: true, ...plan.summary }, null, 2));
    if (argument('output')) await writeFile(resolve(argument('output')!), JSON.stringify(plan.summary, null, 2));
    if (args.includes('--write')) {
      if (command !== 'sync' || !argument('confirm-plan')) throw new Error('Upis zahteva sync --write --confirm-plan=FINGERPRINT iz prethodnog dry-run-a.');
      console.log(JSON.stringify(await writeHistoricalImport(db, plan, argument('confirm-plan')!, { maxMatches: 1000 }), null, 2));
    }
  } else throw new Error('Koristite report, plan ili sync. Bez --write nema upisa.');
} catch (error) { console.error(error instanceof Error ? error.message : 'HT/FT provera nije uspela.'); process.exitCode = 1; }
finally { await db.close(); }
