import 'dotenv/config';
import fs from 'node:fs';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { type Tip, TipPublicationStatus } from '../src/types';
import { isFinishedForStats } from '../src/utils/tickets';
import { mapTicketForPublic } from '../src/services/tickets/ticketMappers';

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

const toPlainObject = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const main = async () => {
  initializeFirebaseAdmin();
  const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
  const ticketSnapshot = await db.collection('tickets').get();
  const publishedTips = ticketSnapshot.docs
    .map((ticketDoc) => ({ id: ticketDoc.id, ...ticketDoc.data() }) as Tip)
    .filter((tip) => tip.publicationStatus === TipPublicationStatus.PUBLISHED);
  const publishedIds = new Set(publishedTips.map((tip) => tip.id));
  const settledIds = new Set(publishedTips.filter((tip) => isFinishedForStats(tip.status)).map((tip) => tip.id));
  const [publicTicketsSnapshot, publicStatsSnapshot] = await Promise.all([
    db.collection('publicTickets').get(),
    db.collection('publicStatsTickets').get(),
  ]);

  const operations: Array<{ collection: string; id: string; data?: Tip }> = [];
  publishedTips.forEach((tip) => {
    const publicTip = toPlainObject(mapTicketForPublic(tip));
    operations.push({ collection: 'publicTickets', id: tip.id, data: publicTip });
    if (isFinishedForStats(tip.status)) {
      operations.push({ collection: 'publicStatsTickets', id: tip.id, data: publicTip });
    }
  });
  publicTicketsSnapshot.docs
    .filter((ticketDoc) => !publishedIds.has(ticketDoc.id))
    .forEach((ticketDoc) => operations.push({ collection: 'publicTickets', id: ticketDoc.id }));
  publicStatsSnapshot.docs
    .filter((ticketDoc) => !settledIds.has(ticketDoc.id))
    .forEach((ticketDoc) => operations.push({ collection: 'publicStatsTickets', id: ticketDoc.id }));

  for (let index = 0; index < operations.length; index += 300) {
    const batch = db.batch();
    operations.slice(index, index + 300).forEach((operation) => {
      const ref = db.collection(operation.collection).doc(operation.id);
      if (operation.data) batch.set(ref, operation.data);
      else batch.delete(ref);
    });
    await batch.commit();
  }

  console.log(JSON.stringify({
    publishedTickets: publishedTips.length,
    settledTickets: settledIds.size,
    operations: operations.length,
    publicTicketsRemoved: publicTicketsSnapshot.docs.filter((ticketDoc) => !publishedIds.has(ticketDoc.id)).length,
    publicStatsTicketsRemoved: publicStatsSnapshot.docs.filter((ticketDoc) => !settledIds.has(ticketDoc.id)).length,
  }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
