import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldPath, FieldValue, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import config from '../firebase-applet-config.json' with { type: 'json' };
import { localDate, validDate } from '../server/sportsApi.js';
import { planStaleDailyCleanup, staleDailyPaths } from '../server/staleDailyCleanup.js';

dotenv.config({ quiet: true });
const write = process.argv.includes('--write');
const before = process.argv.find((argument) => argument.startsWith('--before='))?.slice(9) || localDate();
if (!validDate(before) || before > localDate()) throw new Error('Cleanup cutoff must be today or earlier.');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || (process.env.FIREBASE_SERVICE_ACCOUNT_PATH ? fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8') : '');
if (!raw) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_KEY.');
const account = JSON.parse(raw);
if (account.project_id !== config.projectId) throw new Error('Firebase project mismatch.');
const db = getFirestore(initializeApp({ credential: cert(account), projectId: config.projectId }), config.firestoreDatabaseId);

try {
  const summaryBefore = (await db.doc('publicStats/summary').get()).data();
  const candidates: DocumentSnapshot[] = [];
  let cursor: DocumentSnapshot | undefined;
  for (let page = 0; page < 5; page++) {
    const query = db.collection('dailyAnalyses').where('status', 'in', ['ACTIVE', 'PENDING_REVIEW', 'POSTPONED']).orderBy(FieldPath.documentId()).limit(100);
    const snapshot = await (cursor ? query.startAfter(cursor) : query).get();
    candidates.push(...snapshot.docs.filter((document) => String(document.data().date || '') < before));
    if (snapshot.size < 100) break;
    if (page === 4) throw new Error('More than 500 open records; cleanup stopped for review.');
    cursor = snapshot.docs.at(-1);
  }
  const plans: Array<{ id: string; snapshots: DocumentSnapshot[]; plan: ReturnType<typeof planStaleDailyCleanup> }> = [];
  for (let index = 0; index < candidates.length; index += 10) {
    const group = candidates.slice(index, index + 10);
    const snapshots = await db.getAll(...group.flatMap((document) => staleDailyPaths(document.id).map((value) => db.doc(value))));
    group.forEach((document, item) => {
      const records = snapshots.slice(item * 6, item * 6 + 6);
      const documents = new Map(records.filter((record) => record.exists).map((record) => [record.ref.path, record.data()!]));
      const plan = planStaleDailyCleanup(document.id, documents, before);
      if (plan.operations.length) plans.push({ id: document.id, snapshots: records, plan });
    });
  }
  const plannedWrites = plans.reduce((count, entry) => count + entry.plan.operations.length, 0);
  const report = { dryRun: !write, before, analyses: plans.length,
    deleteAnalyses: plans.filter((entry) => !entry.plan.protectedHistory).length,
    hideOnlyToPreserveHistory: plans.filter((entry) => entry.plan.protectedHistory).length,
    plannedWrites, historyCountBefore: summaryBefore?.all?.completedCount,
    dates: [...new Set(plans.map((entry) => entry.snapshots[0].data()?.date))].sort(),
  };
  console.log(JSON.stringify(report, null, 2));
  if (plannedWrites > 500) throw new Error('Cleanup exceeds 500 planned writes; stopped before writing.');
  if (write && plans.length) {
    const backupDirectory = path.resolve('.local-backups');
    fs.mkdirSync(backupDirectory, { recursive: true });
    const backup = path.join(backupDirectory, `stale-daily-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backup, JSON.stringify({ project: config.projectId, database: config.firestoreDatabaseId, before, summaryBefore,
      records: plans.map((entry) => ({ id: entry.id, protectedHistory: entry.plan.protectedHistory,
        documents: entry.snapshots.filter((record) => record.exists).map((record) => ({ path: record.ref.path, data: record.data(), updateTime: record.updateTime?.toDate().toISOString() })) })),
    }, null, 2), { flag: 'wx' });
    let removed = 0, hidden = 0, changedSkipped = 0, writes = 0;
    for (let index = 0; index < plans.length; index += 10) {
      const group = plans.slice(index, index + 10);
      const result = await db.runTransaction(async (transaction) => {
        const current = await transaction.getAll(...group.flatMap((entry) => entry.snapshots.map((record) => record.ref)));
        const counts = { removed: 0, hidden: 0, changedSkipped: 0, writes: 0 };
        group.forEach((entry, item) => {
          const records = current.slice(item * 6, item * 6 + 6);
          if (records.some((record, position) => record.exists !== entry.snapshots[position].exists
            || record.exists && !record.updateTime?.isEqual(entry.snapshots[position].updateTime!))) { counts.changedSkipped++; return; }
          const documents = new Map(records.filter((record) => record.exists).map((record) => [record.ref.path, record.data()!]));
          const plan = planStaleDailyCleanup(entry.id, documents, before);
          for (const operation of plan.operations) {
            if (operation.action === 'hide') transaction.update(db.doc(operation.path), {
              status: 'HIDDEN', hidden: true, enabled: false, manualOverride: true,
              archivedAt: FieldValue.serverTimestamp(), archiveReason: 'stale-admin-active-cleanup', updatedAt: FieldValue.serverTimestamp(),
            });
            else transaction.delete(db.doc(operation.path));
            counts.writes++;
          }
          if (plan.operations.length) plan.protectedHistory ? counts.hidden++ : counts.removed++;
        });
        return counts;
      });
      removed += result.removed; hidden += result.hidden; changedSkipped += result.changedSkipped; writes += result.writes;
      console.log(JSON.stringify({ processed: Math.min(index + 10, plans.length), removed, hidden, changedSkipped, writes }));
      if (index + 10 < plans.length) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const summaryAfter = (await db.doc('publicStats/summary').get()).data();
    console.log(JSON.stringify({ backup, removed, hidden, changedSkipped, writes,
      historyCountAfter: summaryAfter?.all?.completedCount,
      statsUnchanged: JSON.stringify(summaryBefore) === JSON.stringify(summaryAfter),
    }, null, 2));
  }
} finally { await db.terminate(); }
