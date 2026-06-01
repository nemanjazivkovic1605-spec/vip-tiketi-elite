import 'dotenv/config';
import fs from 'node:fs';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { type Tip, TipPublicationStatus } from '../src/types';
import { isFinishedForStats } from '../src/utils/tickets';
import { mapTicketForPublic } from '../src/services/tickets/ticketMappers';

type PublicIndexCollection = 'publicTickets' | 'publicStatsTickets';

type UpsertOperation = {
  collection: PublicIndexCollection;
  id: string;
  data: Tip;
};

type DeleteOperation = {
  collection: PublicIndexCollection;
  id: string;
};

type FirestoreRestValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreRestValue[] } }
  | { mapValue: { fields: Record<string, FirestoreRestValue> } };

const stripQuotes = (value?: string) => (value || '').trim().replace(/^["']|["']$/g, '');
const getEnv = (name: string) => stripQuotes(process.env[name]);
const getPositiveInteger = (name: string, fallback: number) => {
  const value = Number(getEnv(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
};
const FIRESTORE_DATABASE_ID = getEnv('FIRESTORE_DATABASE_ID')
  || getEnv('VITE_FIRESTORE_DATABASE_ID')
  || firebaseConfig.firestoreDatabaseId;
const PROJECT_ID = firebaseConfig.projectId;
const BATCH_LIMIT = Math.min(getPositiveInteger('PUBLIC_INDEX_SYNC_BATCH_LIMIT', 10), 50);
const BATCH_PAUSE_MS = getPositiveInteger('PUBLIC_INDEX_SYNC_BATCH_PAUSE_MS', 1000);
const MAX_RETRIES = getPositiveInteger('PUBLIC_INDEX_SYNC_MAX_RETRIES', 5);
const RETRY_BASE_MS = getPositiveInteger('PUBLIC_INDEX_SYNC_RETRY_BASE_MS', 2500);
const REQUEST_TIMEOUT_MS = getPositiveInteger('PUBLIC_INDEX_SYNC_REQUEST_TIMEOUT_MS', 30000);
const MAX_PLANNED_WRITES = getPositiveInteger('PUBLIC_INDEX_SYNC_MAX_PLANNED_WRITES', 500);
const SHOULD_CLEANUP = process.argv.includes('--cleanup');
const SHOULD_WRITE = process.argv.includes('--write');
const LARGE_SYNC_CONFIRMED = process.argv.includes('--confirm-large-sync');
const STATS_ONLY = process.argv.includes('--stats-only');

const initializeFirebaseAdmin = () => {
  if (admin.apps.length) return;
  const rawServiceAccount = getEnv('FIREBASE_SERVICE_ACCOUNT_KEY');
  const serviceAccountPath = getEnv('FIREBASE_SERVICE_ACCOUNT_KEY_PATH') || getEnv('GOOGLE_APPLICATION_CREDENTIALS');

  if (rawServiceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(rawServiceAccount)),
      projectId: PROJECT_ID,
    });
    return;
  }

  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || PROJECT_ID,
    });
    return;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
  });
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const toPlainObject = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const encodeRestValue = (value: unknown): FirestoreRestValue => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return {
    arrayValue: {
      values: value.map(encodeRestValue),
    },
  };
  if (typeof value === 'object') return {
    mapValue: {
      fields: encodeRestFields(value as Record<string, unknown>),
    },
  };
  return { stringValue: String(value) };
};

const encodeRestFields = (value: Record<string, unknown>) =>
  Object.entries(value).reduce<Record<string, FirestoreRestValue>>((fields, [key, entry]) => {
    if (entry !== undefined) fields[key] = encodeRestValue(entry);
    return fields;
  }, {});

const documentName = (collection: PublicIndexCollection, id: string) =>
  `projects/${PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents/${collection}/${id}`;

const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

const isRetryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;
const isDailyWriteQuotaError = (error: unknown) =>
  error instanceof Error && error.message.includes('Free daily write units per project');

const batchWrite = async (operations: Array<UpsertOperation | DeleteOperation>, accessToken: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents:batchWrite`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          writes: operations.map((operation) => (
            'data' in operation
              ? {
                update: {
                  name: documentName(operation.collection, operation.id),
                  fields: encodeRestFields(operation.data as unknown as Record<string, unknown>),
                },
              }
              : { delete: documentName(operation.collection, operation.id) }
          )),
        }),
        signal: controller.signal,
      },
    );
    const body = await response.json().catch(() => ({})) as {
      status?: Array<{ code?: number; message?: string }>;
      error?: { code?: number; message?: string; status?: string };
    };
    if (!response.ok) {
      const error = new Error(body.error?.message || `Firestore batchWrite HTTP ${response.status}`);
      Object.assign(error, { status: response.status, firestoreStatus: body.error?.status });
      throw error;
    }
    const failedWrite = body.status?.find((status) => status.code !== undefined && Number(status.code) !== 0);
    if (failedWrite) {
      const error = new Error(failedWrite.message || `Firestore batchWrite failed with code ${failedWrite.code}`);
      Object.assign(error, { status: Number(failedWrite.code) });
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
};

const writeWithRetry = async (
  operations: Array<UpsertOperation | DeleteOperation>,
  accessToken: string,
  label: string,
) => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await batchWrite(operations, accessToken);
      return;
    } catch (error) {
      if (isDailyWriteQuotaError(error)) {
        throw new Error('Firestore dnevna write kvota je iscrpljena. Sacekajte reset kvote, prvo proverite dry-run, zatim eksplicitno pokrenite npm run sync:public-ticket-indexes:write.');
      }
      const status = Number((error as { status?: number }).status);
      const retryable = error instanceof Error && error.name === 'AbortError'
        ? true
        : isRetryableStatus(status) || status === 8;
      if (!retryable || attempt === MAX_RETRIES) throw error;
      const backoff = RETRY_BASE_MS * (2 ** (attempt - 1));
      console.warn(`${label} nije uspeo (pokušaj ${attempt}/${MAX_RETRIES}). Novi pokušaj za ${backoff}ms.`);
      await wait(backoff);
    }
  }
};

const writeInSmallBatches = async (
  operations: Array<UpsertOperation | DeleteOperation>,
  accessToken: string,
  label: string,
) => {
  const batches = chunk(operations, BATCH_LIMIT);
  for (let index = 0; index < batches.length; index += 1) {
    await writeWithRetry(batches[index], accessToken, `${label} batch ${index + 1}/${batches.length}`);
    console.log(`${label}: ${Math.min((index + 1) * BATCH_LIMIT, operations.length)}/${operations.length}`);
    if (index < batches.length - 1) await wait(BATCH_PAUSE_MS);
  }
};

const main = async () => {
  initializeFirebaseAdmin();
  const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
  const ticketSnapshot = await db.collection('tickets').get();
  const publishedTips = ticketSnapshot.docs
    .map((ticketDoc) => ({ id: ticketDoc.id, ...ticketDoc.data() }) as Tip)
    .filter((tip) => tip.publicationStatus === TipPublicationStatus.PUBLISHED);
  const settledTips = publishedTips.filter((tip) => isFinishedForStats(tip.status));
  const publishedIds = new Set(publishedTips.map((tip) => tip.id));
  const settledIds = new Set(settledTips.map((tip) => tip.id));
  const [publicTicketsSnapshot, publicStatsSnapshot] = await Promise.all([
    db.collection('publicTickets').get(),
    db.collection('publicStatsTickets').get(),
  ]);
  const publicTicketsById = new Map(publicTicketsSnapshot.docs.map((ticketDoc) => [ticketDoc.id, toPlainObject(ticketDoc.data())]));
  const publicStatsById = new Map(publicStatsSnapshot.docs.map((ticketDoc) => [ticketDoc.id, toPlainObject(ticketDoc.data())]));
  const publicTips = new Map(publishedTips.map((tip) => [tip.id, toPlainObject(mapTicketForPublic(tip))]));
  const statsTips = new Map(settledTips.map((tip) => [tip.id, toPlainObject(mapTicketForPublic(tip))]));
  const upserts: UpsertOperation[] = [];

  // Statistics/history are restored first so the public proof pages recover
  // before the broader active ticket index if the free-tier quota is tight.
  statsTips.forEach((data, id) => {
    if (stableStringify(publicStatsById.get(id)) !== stableStringify(data)) {
      upserts.push({ collection: 'publicStatsTickets', id, data });
    }
  });
  if (!STATS_ONLY) {
    publicTips.forEach((data, id) => {
      if (stableStringify(publicTicketsById.get(id)) !== stableStringify(data)) {
        upserts.push({ collection: 'publicTickets', id, data });
      }
    });
  }

  const staleDocuments: DeleteOperation[] = [
    ...(STATS_ONLY
      ? []
      : publicTicketsSnapshot.docs
        .filter((ticketDoc) => !publishedIds.has(ticketDoc.id))
        .map((ticketDoc) => ({ collection: 'publicTickets' as const, id: ticketDoc.id }))),
    ...publicStatsSnapshot.docs
      .filter((ticketDoc) => !settledIds.has(ticketDoc.id))
      .map((ticketDoc) => ({ collection: 'publicStatsTickets' as const, id: ticketDoc.id })),
  ];
  const summary = {
    mode: SHOULD_WRITE ? 'write' : 'dry-run',
    statsOnly: STATS_ONLY,
    cleanupEnabled: SHOULD_CLEANUP,
    batchLimit: BATCH_LIMIT,
    batchPauseMs: BATCH_PAUSE_MS,
    maxPlannedWrites: MAX_PLANNED_WRITES,
    largeSyncConfirmed: LARGE_SYNC_CONFIRMED,
    source: {
      tickets: ticketSnapshot.size,
      publishedTickets: publishedTips.length,
      settledTickets: settledTips.length,
    },
    existingIndexes: {
      publicTickets: publicTicketsSnapshot.size,
      publicStatsTickets: publicStatsSnapshot.size,
    },
    incrementalPlan: {
      upserts: upserts.length,
      publicTicketsUpserts: upserts.filter((operation) => operation.collection === 'publicTickets').length,
      publicStatsTicketsUpserts: upserts.filter((operation) => operation.collection === 'publicStatsTickets').length,
      staleDocuments: staleDocuments.length,
      cleanupDeletes: SHOULD_CLEANUP ? staleDocuments.length : 0,
      plannedWrites: upserts.length + (SHOULD_CLEANUP ? staleDocuments.length : 0),
    },
  };
  console.log(JSON.stringify(summary, null, 2));

  const plannedWrites = upserts.length + (SHOULD_CLEANUP ? staleDocuments.length : 0);
  if (!SHOULD_WRITE) {
    console.log('Dry-run zavrsen. Za eksplicitni upis koristite npm run sync:public-ticket-indexes:write.');
    return;
  }
  if (plannedWrites > MAX_PLANNED_WRITES && !LARGE_SYNC_CONFIRMED) {
    throw new Error(
      `Planirano je ${plannedWrites} Firestore write operacija. Limit je ${MAX_PLANNED_WRITES}. `
      + 'Sync je prekinut. Pregledajte dry-run i tek zatim eksplicitno dodajte --confirm-large-sync ako je veci upis nameran.',
    );
  }
  const credential = admin.app().options.credential;
  if (!credential) throw new Error('Firebase Admin credential nije dostupan.');
  const accessToken = (await credential.getAccessToken()).access_token;

  if (upserts.length) {
    await writeInSmallBatches(upserts, accessToken, 'Incremental upsert');
  }
  if (SHOULD_CLEANUP && staleDocuments.length) {
    await writeInSmallBatches(staleDocuments, accessToken, 'Cleanup');
  }

  console.log(JSON.stringify({
    success: true,
    upsertsWritten: upserts.length,
    cleanupDeletesWritten: SHOULD_CLEANUP ? staleDocuments.length : 0,
    note: SHOULD_CLEANUP
      ? 'Incremental upsert i eksplicitni cleanup su završeni.'
      : 'Incremental upsert je završen. Zastareli dokumenti nisu brisani bez --cleanup opcije.',
  }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
