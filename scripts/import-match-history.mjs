import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const archive = await readJson('../data/match-history/england.json');
const records = new Map();
const scorePair = value => Array.isArray(value) && value.length === 2
  && value.every(goal => Number.isInteger(goal) && goal >= 0);

for (const { competition, season, matches } of archive.seasons) {
  for (const match of matches) {
    const { date, team1, team2, score } = match;
    if (!date || !team1 || !team2 || !scorePair(score?.ft) || (score.ht != null && !scorePair(score.ht))) {
      throw new Error('Invalid match in ' + competition + ' ' + season);
    }
    const identity = [competition, season, date, team1, team2];
    const id = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    if (records.has(id)) throw new Error('Duplicate match: ' + identity.join(' / '));
    records.set(id, { competition, season, date, home: team1, away: team2,
      round: match.round ?? null, ft: score.ft, ht: score.ht ?? null, source: 'openfootball' });
  }
}

if (!process.argv.includes('--write')) {
  console.log('Validated ' + records.size + ' results. Use --write to import into Firestore.');
} else {
  await import('dotenv/config');
  const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const config = await readJson('../firebase-applet-config.json');
  const accountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || (accountPath && await readFile(accountPath, 'utf8'));
  const account = raw && JSON.parse(raw);
  if (account && account.project_id !== config.projectId) throw new Error('Firebase project mismatch');
  const app = initializeApp({ projectId: config.projectId, credential: account ? cert(account) : applicationDefault() });
  const db = getFirestore(app, process.env.FIRESTORE_DATABASE_ID || config.firestoreDatabaseId);
  const collection = db.collection('openfootballMatchHistory');
  const entries = [...records.entries()];
  let written = 0;
  for (let offset = 0; offset < entries.length; offset += 100) {
    const group = entries.slice(offset, offset + 100);
    written += await db.runTransaction(async transaction => {
      const snapshots = await transaction.getAll(...group.map(([id]) => collection.doc(id)));
      let changed = 0;
      snapshots.forEach((doc, index) => {
        const record = group[index][1];
        if (isDeepStrictEqual(record, doc.data())) return;
        transaction.set(doc.ref, record);
        changed++;
      });
      return changed;
    });
  }
  console.log({ collection: collection.id, verified: entries.length, written });
}
