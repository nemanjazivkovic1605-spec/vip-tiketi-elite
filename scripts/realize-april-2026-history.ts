import 'dotenv/config';
import fs from 'node:fs';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import readXlsxFile from 'read-excel-file/node';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { type ImportedMatch, type Match, type Tip, TicketStatus, TipPublicationStatus } from '../src/types';
import {
  buildPublishedAt,
  calculateTotalOdds,
  generateTicketCode,
  unitsToRsd,
} from '../src/utils/tickets';
import { calculateStats } from '../src/utils/ticketStats';
import { mapTicketForPublic } from '../src/services/tickets/ticketMappers';

type Market = '1' | 'X' | '2' | 'Over 2.5' | 'Under 2.5';

type FinishedMatch = {
  id: string;
  date: string;
  time: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  oddsHome?: number;
  oddsDraw?: number;
  oddsAway?: number;
  oddsOver25?: number;
  oddsUnder25?: number;
};

type PlannedPick = {
  match: FinishedMatch;
  isVip: boolean;
  slot: number;
  prediction: Market;
  odds: number;
};

type StoredDocument = Record<string, unknown>;

type WriteOperation = {
  kind: 'set' | 'delete';
  collectionName: string;
  id: string;
  data?: StoredDocument;
};

const START_DATE = '2026-04-01';
const END_DATE = '2026-04-30';
const HISTORY_PREFIX = 'history-april-real-2026-';
const MAX_TIPS_PER_DAY = 4;
const MAX_PLANNED_WRITES = 500;
const WRITE_BATCH_SIZE = 15;
const WRITE_BATCH_PAUSE_MS = 500;
const shouldWrite = new Set(process.argv.slice(2)).has('--write');
const COLLECTIONS = ['tickets', 'publicTickets', 'publicStatsTickets'] as const;

const stripQuotes = (value?: string) => (value || '').trim().replace(/^["']|["']$/g, '');
const getEnv = (name: string) => stripQuotes(process.env[name]);
const FIRESTORE_DATABASE_ID = getEnv('FIRESTORE_DATABASE_ID')
  || getEnv('VITE_FIRESTORE_DATABASE_ID')
  || firebaseConfig.firestoreDatabaseId;

const pad2 = (value: number) => String(value).padStart(2, '0');
const datesBetween = () => Array.from({ length: 30 }, (_, index) => `2026-04-${pad2(index + 1)}`);
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

const normalizeName = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const stableMinute = (seed: string) => {
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return pad2(hash % 60);
};

const stableNumber = (seed: string) =>
  seed.split('').reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) >>> 0, 0);

const numberOrUndefined = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : undefined;
};

const isoDate = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
};

const normalizeTime = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().slice(11, 16);
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  return match ? `${pad2(Number(match[1]))}:${match[2]}` : '';
};

const toPlain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, sortKeys(nestedValue)]),
  );
};
const sameDocument = (left?: StoredDocument, right?: StoredDocument) =>
  JSON.stringify(sortKeys(left || null)) === JSON.stringify(sortKeys(right || null));

const readRowsFromWorkbook = async () => {
  const candidates = [
    getEnv('HISTORY_EXCEL_PATH'),
    'C:/Users/Nemanja/Downloads/all-euro-data-2025-2026.xlsx',
  ].filter(Boolean);
  const excelPath = candidates.find((path) => fs.existsSync(path));
  if (!excelPath) return [];
  const workbook = await readXlsxFile(excelPath) as Array<{ sheet: string; data: unknown[][] }>;
  return workbook.flatMap((sheet) => {
    const header = (sheet.data?.[0] || []).map(String);
    const index = Object.fromEntries(header.map((name, idx) => [name, idx]));
    return (sheet.data || []).slice(1).map((row) => ({ sheet: sheet.sheet, row, index }));
  });
};

const xlsxImportedMatches = async (): Promise<FinishedMatch[]> => {
  const rows = await readRowsFromWorkbook();
  return rows
    .map(({ sheet, row, index }) => {
      const date = isoDate(row[index.Date]);
      if (date < START_DATE || date > END_DATE) return null;
      const homeScore = Number(row[index.FTHG]);
      const awayScore = Number(row[index.FTAG]);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
      const homeTeam = String(row[index.HomeTeam] || '').trim();
      const awayTeam = String(row[index.AwayTeam] || '').trim();
      if (!homeTeam || !awayTeam) return null;
      return {
        id: `xlsx-${sheet}-${date}-${normalizeName(homeTeam)}-${normalizeName(awayTeam)}`,
        date,
        time: normalizeTime(row[index.Time]),
        league: String(row[index.Div] || sheet || 'Imported League'),
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        oddsHome: numberOrUndefined(row[index.B365H] ?? row[index.AvgH]),
        oddsDraw: numberOrUndefined(row[index.B365D] ?? row[index.AvgD]),
        oddsAway: numberOrUndefined(row[index.B365A] ?? row[index.AvgA]),
        oddsOver25: numberOrUndefined(row[index['B365>2.5']] ?? row[index['Avg>2.5']]),
        oddsUnder25: numberOrUndefined(row[index['B365<2.5']] ?? row[index['Avg<2.5']]),
      };
    })
    .filter((match): match is FinishedMatch => Boolean(match));
};

const jsonImportedMatches = (): FinishedMatch[] => {
  const path = 'public/imported-matches-2025-2026.json';
  if (!fs.existsSync(path)) return [];
  const rows = JSON.parse(fs.readFileSync(path, 'utf8')) as ImportedMatch[];
  return rows
    .filter((match) => match.date >= START_DATE && match.date <= END_DATE)
    .map((match) => ({
      id: match.id,
      date: match.date,
      time: '',
      league: match.league,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      oddsHome: numberOrUndefined(match.oddsHome),
      oddsDraw: numberOrUndefined(match.oddsDraw),
      oddsAway: numberOrUndefined(match.oddsAway),
    }));
};

const availableMarkets = (match: FinishedMatch) => ([
  { prediction: '1' as const, odds: match.oddsHome },
  { prediction: 'X' as const, odds: match.oddsDraw },
  { prediction: '2' as const, odds: match.oddsAway },
  { prediction: 'Over 2.5' as const, odds: match.oddsOver25 },
  { prediction: 'Under 2.5' as const, odds: match.oddsUnder25 },
]).filter((market): market is { prediction: Market; odds: number } => Number.isFinite(market.odds) && Number(market.odds) > 1);

const chooseMarket = (match: FinishedMatch, slot: number) => {
  const markets = availableMarkets(match);
  if (!markets.length) return null;
  const targetOdds = slot === 0 ? 1.75 : 1.9;
  const offset = stableNumber(`${match.id}-${slot}`) % markets.length;
  return [...markets].sort((left, right) => {
    const leftScore = Math.abs(left.odds - targetOdds) + ((markets.indexOf(left) + offset) % markets.length) * 0.025;
    const rightScore = Math.abs(right.odds - targetOdds) + ((markets.indexOf(right) + offset) % markets.length) * 0.025;
    return leftScore - rightScore;
  })[0];
};

const marketWon = (prediction: Market, match: FinishedMatch) => {
  const totalGoals = match.homeScore + match.awayScore;
  if (prediction === '1') return match.homeScore > match.awayScore;
  if (prediction === 'X') return match.homeScore === match.awayScore;
  if (prediction === '2') return match.awayScore > match.homeScore;
  if (prediction === 'Over 2.5') return totalGoals > 2.5;
  return totalGoals < 2.5;
};

const dedupeMatches = (matches: FinishedMatch[]) => {
  const unique = new Map<string, FinishedMatch>();
  matches.forEach((match) => {
    const key = `${match.date}-${normalizeName(match.homeTeam)}-${normalizeName(match.awayTeam)}`;
    const current = unique.get(key);
    if (!current || availableMarkets(match).length > availableMarkets(current).length) unique.set(key, match);
  });
  return Array.from(unique.values());
};

const planPicks = (matches: FinishedMatch[]) => datesBetween().flatMap((date) => {
  const dayMatches = matches
    .filter((match) => match.date === date && availableMarkets(match).length > 0)
    .sort((left, right) => {
      const marketCount = availableMarkets(right).length - availableMarkets(left).length;
      return marketCount !== 0 ? marketCount : left.id.localeCompare(right.id);
    });

  return dayMatches.slice(0, MAX_TIPS_PER_DAY).flatMap((match, slot) => {
    const market = chooseMarket(match, slot);
    return market ? [{
      match,
      isVip: slot > 0,
      slot,
      prediction: market.prediction,
      odds: market.odds,
    }] : [];
  });
});

const toTip = (pick: PlannedPick): Tip => {
  const { match } = pick;
  const publishedTime = `12:${stableMinute(`${match.id}-${pick.slot}`)}`;
  const ticketCode = generateTicketCode(pick.isVip, match.date, publishedTime);
  const id = `${HISTORY_PREFIX}${match.date}-${pick.slot}-${normalizeName(match.homeTeam)}-${normalizeName(match.awayTeam)}`.slice(0, 180);
  const result = `${match.homeScore}-${match.awayScore}`;
  const status = marketWon(pick.prediction, match) ? TicketStatus.WON : TicketStatus.LOST;
  const unitsStake = pick.isVip ? 10 : 5;
  const matchTip: Match = {
    id: match.id,
    teams: `${match.homeTeam} - ${match.awayTeam}`,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    league: match.league,
    prediction: pick.prediction,
    odds: pick.odds,
    time: match.time,
    result,
    status,
  };

  return {
    id,
    source: 'admin',
    publicationStatus: TipPublicationStatus.PUBLISHED,
    publishedDate: match.date,
    publishedTime,
    publishedAt: buildPublishedAt(match.date, publishedTime),
    ticketCode,
    createdAt: buildPublishedAt(match.date, publishedTime),
    date: match.date,
    matches: [matchTip],
    totalOdds: calculateTotalOdds([matchTip]),
    ticketType: 'SINGL',
    unitsStake,
    stake: unitsToRsd(unitsStake),
    status,
    analysis: '',
    isVip: pick.isVip,
    result,
  };
};

const readCollection = async (collectionName: string) => {
  initializeFirebaseAdmin();
  const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
  const snapshot = await db.collection(collectionName)
    .where('date', '>=', START_DATE)
    .where('date', '<=', END_DATE)
    .get();
  return new Map(snapshot.docs.map((doc) => [doc.id, toPlain(doc.data())]));
};

const planWriteOperations = async (tips: Tip[]) => {
  const existingByCollection = new Map<string, Map<string, StoredDocument>>();
  for (const collectionName of COLLECTIONS) {
    existingByCollection.set(collectionName, await readCollection(collectionName));
  }

  const desiredByCollection = new Map<string, Map<string, StoredDocument>>();
  for (const collectionName of COLLECTIONS) {
    const documents = new Map<string, StoredDocument>();
    tips.forEach((tip) => {
      const data = collectionName === 'tickets' ? tip : mapTicketForPublic(tip);
      documents.set(tip.id, toPlain(data) as StoredDocument);
    });
    desiredByCollection.set(collectionName, documents);
  }

  const operations: WriteOperation[] = [];
  for (const collectionName of COLLECTIONS) {
    const existing = existingByCollection.get(collectionName) || new Map();
    const desired = desiredByCollection.get(collectionName) || new Map();
    desired.forEach((data, id) => {
      if (!sameDocument(existing.get(id), data)) operations.push({ kind: 'set', collectionName, id, data });
    });
    existing.forEach((_data, id) => {
      if (id.startsWith(HISTORY_PREFIX) && !desired.has(id)) operations.push({ kind: 'delete', collectionName, id });
    });
  }
  return operations;
};

const isRetryableWriteError = (error: unknown) =>
  /RESOURCE_EXHAUSTED|quota|UNAVAILABLE|deadline/i.test(error instanceof Error ? error.message : String(error));

const commitOperations = async (operations: WriteOperation[]) => {
  initializeFirebaseAdmin();
  const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
  for (let index = 0; index < operations.length; index += WRITE_BATCH_SIZE) {
    const batchOperations = operations.slice(index, index + WRITE_BATCH_SIZE);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const batch = db.batch();
        batchOperations.forEach((operation) => {
          const reference = db.collection(operation.collectionName).doc(operation.id);
          if (operation.kind === 'delete') batch.delete(reference);
          else batch.set(reference, operation.data || {});
        });
        await batch.commit();
        break;
      } catch (error) {
        if (!isRetryableWriteError(error) || attempt === 3) throw error;
        await sleep(1000 * (2 ** (attempt - 1)));
      }
    }
    if (index + WRITE_BATCH_SIZE < operations.length) await sleep(WRITE_BATCH_PAUSE_MS);
  }
};

const summarize = (label: string, tips: Tip[]) => {
  const stats = calculateStats(tips);
  return {
    label,
    total: tips.length,
    won: tips.filter((tip) => tip.status === TicketStatus.WON).length,
    lost: tips.filter((tip) => tip.status === TicketStatus.LOST).length,
    hitRate: stats.hitRate,
    yield: stats.yield,
    profitUnits: stats.unitsProfit,
    averageOdds: stats.averageOdds,
  };
};

const verifyTips = (tips: Tip[]) => {
  const invalidOdds = tips.filter((tip) => !Number.isFinite(tip.totalOdds) || tip.totalOdds <= 1);
  const mismatchedStatuses = tips.filter((tip) => {
    const match = tip.matches[0];
    const [homeScore, awayScore] = String(match.result || '').split('-').map(Number);
    const finishedMatch: FinishedMatch = {
      id: match.id || tip.id,
      date: tip.date,
      time: match.time,
      league: match.league,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeScore,
      awayScore,
    };
    return (marketWon(match.prediction as Market, finishedMatch) ? TicketStatus.WON : TicketStatus.LOST) !== tip.status;
  });
  return { invalidOdds, mismatchedStatuses };
};

const main = async () => {
  const xlsxMatches = await xlsxImportedMatches();
  const importedMatches = dedupeMatches(xlsxMatches.length ? xlsxMatches : jsonImportedMatches());
  const tips = planPicks(importedMatches).map(toTip);
  const verification = verifyTips(tips);
  const operations = await planWriteOperations(tips);
  const perDay = datesBetween().map((date) => ({
    date,
    availableMatchesWithRealOdds: importedMatches.filter((match) => match.date === date && availableMarkets(match).length > 0).length,
    plannedTickets: tips.filter((tip) => tip.date === date).length,
  }));
  const summary = {
    dryRun: !shouldWrite,
    source: xlsxMatches.length ? 'Excel workbook with bookmaker odds' : 'Imported JSON with bookmaker odds',
    foundFinishedMatches: importedMatches.length,
    validDays: perDay.filter((day) => day.plannedTickets > 0).length,
    skippedDays: perDay.filter((day) => day.plannedTickets === 0).map((day) => day.date),
    daysWithFewerThanFourTickets: perDay.filter((day) => day.plannedTickets > 0 && day.plannedTickets < MAX_TIPS_PER_DAY),
    plannedTickets: tips.length,
    freeTickets: tips.filter((tip) => !tip.isVip).length,
    vipTickets: tips.filter((tip) => tip.isVip).length,
    invalidOrPlaceholderOdds: verification.invalidOdds.length,
    statusMismatches: verification.mismatchedStatuses.length,
    plannedWriteOperations: operations.length,
    writeOperationLimit: MAX_PLANNED_WRITES,
    writeBreakdown: operations.reduce<Record<string, number>>((acc, operation) => {
      const key = `${operation.kind}:${operation.collectionName}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    perDay,
    stats: [
      summarize('FREE', tips.filter((tip) => !tip.isVip)),
      summarize('VIP', tips.filter((tip) => tip.isVip)),
      summarize('TOTAL', tips),
    ],
  };

  console.log(JSON.stringify(summary, null, 2));
  if (verification.invalidOdds.length) throw new Error('Found invalid or placeholder odds. Aborting.');
  if (verification.mismatchedStatuses.length) throw new Error('Found status mismatch. Aborting.');
  if (operations.length > MAX_PLANNED_WRITES) {
    throw new Error(`Planned ${operations.length} writes, above safe limit ${MAX_PLANNED_WRITES}. Aborting.`);
  }
  if (!shouldWrite) {
    console.log('Dry-run only. Run with --write after reviewing the summary.');
    return;
  }

  await commitOperations(operations);
  console.log(JSON.stringify({ writtenOperations: operations.length, importedTickets: tips.length, dryRun: false }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
