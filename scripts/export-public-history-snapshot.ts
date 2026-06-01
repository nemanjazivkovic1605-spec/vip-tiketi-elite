import 'dotenv/config';
import fs from 'node:fs';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { type Tip } from '../src/types';
import { isFinishedForStats, sortTicketsByDate } from '../src/utils/tickets';
import { mapTicketForPublic } from '../src/services/tickets/ticketMappers';

const SNAPSHOT_PATH = 'public/public-history-snapshot.json';
const stripQuotes = (value?: string) => (value || '').trim().replace(/^["']|["']$/g, '');
const getEnv = (name: string) => stripQuotes(process.env[name]);
const FIRESTORE_DATABASE_ID = getEnv('FIRESTORE_DATABASE_ID')
  || getEnv('VITE_FIRESTORE_DATABASE_ID')
  || firebaseConfig.firestoreDatabaseId;

const initializeFirebaseAdmin = () => {
  if (admin.apps.length) return;
  const rawServiceAccount = getEnv('FIREBASE_SERVICE_ACCOUNT_KEY');
  const serviceAccountPath = getEnv('FIREBASE_SERVICE_ACCOUNT_KEY_PATH') || getEnv('GOOGLE_APPLICATION_CREDENTIALS');

  if (rawServiceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(rawServiceAccount)),
      projectId: firebaseConfig.projectId,
    });
    return;
  }

  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || firebaseConfig.projectId,
    });
    return;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: firebaseConfig.projectId,
  });
};

const main = async () => {
  initializeFirebaseAdmin();
  const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
  const snapshot = await db.collection('publicStatsTickets').get();
  const tips = sortTicketsByDate(snapshot.docs
    .map((ticketDoc) => mapTicketForPublic({ id: ticketDoc.id, ...ticketDoc.data() } as Tip))
    .filter((tip) => isFinishedForStats(tip.status)));

  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'Firestore publicStatsTickets manual export',
    tips,
  })}\n`);
  console.log(JSON.stringify({
    snapshotPath: SNAPSHOT_PATH,
    tickets: tips.length,
    note: 'Commit and deploy this snapshot so public History/Stats/Home no longer depend on Firestore reads.',
  }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
