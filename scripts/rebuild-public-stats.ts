import fs from 'node:fs';
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import config from '../firebase-applet-config.json' with { type: 'json' };
import { buildStatsMonth, buildStatsSummary, statsEntry, STATS_SUMMARY_PATH, STATS_MONTHS_COLLECTION, type StatsEntry, type StatsMonth } from '../src/utils/publicStats.js';
import type { Tip } from '../src/types.js';
import { mapTicketForPublic } from '../src/services/tickets/ticketMappers.js';
import { sortTicketsByDate } from '../src/utils/tickets.js';

dotenv.config({ quiet: true });
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || (process.env.FIREBASE_SERVICE_ACCOUNT_PATH ? fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8') : '');
if (!raw) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVICE_ACCOUNT_PATH.');
const account = JSON.parse(raw);
if (account.project_id !== config.projectId) throw new Error('Firebase project mismatch.');
const db = getFirestore(initializeApp({ credential: cert(account), projectId: config.projectId }), config.firestoreDatabaseId);
let snapshotExport: { summary: ReturnType<typeof buildStatsSummary>; tips: Tip[] } | undefined;
const stable = (value: any): string => JSON.stringify(value, (_key, entry) => entry && !Array.isArray(entry) && Object.getPrototypeOf(entry) === Object.prototype
  ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);

try {
  const result = await db.runTransaction(async (transaction) => {
    const [tickets, months, summarySnapshot] = await Promise.all([
      transaction.get(db.collection('publicStatsTickets')), transaction.get(db.collection(STATS_MONTHS_COLLECTION)), transaction.get(db.doc(STATS_SUMMARY_PATH)),
    ]);
    const groups = new Map<string, Record<string, StatsEntry>>();
    const invalid: string[] = [];
    for (const document of tickets.docs) {
      const entry = statsEntry({ ...document.data(), id: document.id } as Tip);
      if (!entry) { invalid.push(document.id); continue; }
      const key = entry.date.slice(0, 7);
      if (!groups.has(key)) groups.set(key, {});
      groups.get(key)![entry.id] = entry;
    }
    const previousMonths = new Map(months.docs.map((document) => [document.id, document.data() as StatsMonth]));
    const changed: Array<{ key: string; value: StatsMonth }> = [];
    const rollups: ReturnType<typeof buildStatsSummary>['months'] = {};
    for (const [key, entries] of groups) {
      const previous = previousMonths.get(key);
      const different = !previous || stable(previous.entries) !== stable(entries);
      const value = buildStatsMonth(entries, (previous?.version || 0) + Number(different));
      rollups[key] = { version: value.version, groups: value.groups };
      if (different) changed.push({ key, value });
    }
    const removed = months.docs.filter((document) => document.data().schemaVersion === 1 && !groups.has(document.id));
    const previous = summarySnapshot.data();
    const summary = buildStatsSummary(rollups, (previous?.version || 0) + 1);
    const needsSummary = !previous || changed.length > 0 || removed.length > 0 || stable(previous.all) !== stable(summary.all);
    const plannedWrites = changed.length + removed.length + Number(needsSummary);
    if (process.argv.includes('--snapshot')) snapshotExport = {
      summary: needsSummary ? summary : previous as ReturnType<typeof buildStatsSummary>,
      tips: sortTicketsByDate(tickets.docs.map((document) => ({ ...document.data(), id: document.id } as Tip)).filter((tip) => statsEntry(tip)).map(mapTicketForPublic)),
    };
    const report = { dryRun: !process.argv.includes('--write'), readTickets: tickets.size, validTickets: summary.all.completedCount,
      invalidSkipped: invalid, changedMonths: changed.map((month) => month.key), plannedWrites,
      categories: Object.fromEntries(Object.entries(summary.categories).map(([key, stats]) => [key, { tickets: stats.completedCount, wins: stats.winCount, losses: stats.lossCount, profit: stats.unitsProfit, yield: stats.yield }])),
    };
    if (plannedWrites > 500) throw new Error(`Planned ${plannedWrites} writes; automatic bootstrap limit is 500.`);
    if (process.argv.includes('--write')) {
      changed.forEach(({ key, value }) => transaction.set(db.collection(STATS_MONTHS_COLLECTION).doc(key), value));
      removed.forEach((document) => transaction.delete(document.ref));
      if (needsSummary) transaction.set(db.doc(STATS_SUMMARY_PATH), summary);
    }
    return report;
  });
  console.log(JSON.stringify(result, null, 2));
  if (snapshotExport) {
    fs.writeFileSync('public/public-history-snapshot.json', JSON.stringify({ generatedAt: snapshotExport.summary.generatedAt, source: 'Firestore public indexes read-only export', tips: snapshotExport.tips }) + '\n');
    fs.writeFileSync('public/public-stats-summary.json', JSON.stringify(snapshotExport.summary) + '\n');
    console.log('Updated local public CDN snapshots; no extra Firestore writes.');
  }
} finally { await db.terminate(); }
