import 'dotenv/config';
import fs from 'node:fs';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleAuth } from 'google-auth-library';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { Tip, TicketStatus, TipPublicationStatus } from '../src/types';
import {
  buildPublishedAt,
  calculateTotalOdds,
  generateTicketCode,
  getDefaultUnitsStake,
  normalizeOdds,
  unitsToRsd,
} from '../src/utils/tickets';
import { mapTicketForPublic } from '../src/services/tickets/ticketMappers';

type Provider = 'api-football' | 'football-data.org';

type FinishedMatch = {
  provider: Provider;
  fixtureId: string;
  date: string;
  time: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
};

type ImportSummary = {
  providerUsed: Provider | 'mixed' | 'none';
  found: number;
  selected: number;
  free: number;
  vip: number;
  duplicatesSkipped: number;
  readyToWrite: number;
  written: number;
  startDate: string;
  endDate: string;
  dryRun: boolean;
};

const START_DATE = '2026-02-01';
const END_DATE = '2026-02-28';
const TARGET_COUNT = 120;
const FREE_COUNT = 30;
const TIMEZONE = 'Europe/Belgrade';
const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';
const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const FOOTBALL_DATA_COMPETITIONS = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL'];

const stripQuotes = (value?: string) => (value || '').trim().replace(/^["']|["']$/g, '');

const getEnv = (name: string) => stripQuotes(process.env[name]);

const FIRESTORE_DATABASE_ID = getEnv('FIRESTORE_DATABASE_ID')
  || getEnv('VITE_FIRESTORE_DATABASE_ID')
  || firebaseConfig.firestoreDatabaseId;

const args = new Set(process.argv.slice(2));
const shouldWrite = args.has('--write');
const logProgress = (...parts: string[]) => {
  if (shouldWrite || args.has('--verbose')) console.log(`[history-import] ${parts.join(' ')}`);
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
};

const formatIsoDate = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date);

const datesBetween = (startDate: string, endDate: string) => {
  const dates: string[] = [];
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(formatIsoDate(cursor));
  }
  return dates;
};

const stableNumber = (seed: string, min: number, max: number) => {
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const ratio = (hash % 100) / 100;
  return Number((min + (max - min) * ratio).toFixed(2));
};

const stableMinute = (seed: string) => {
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return pad2(hash % 60);
};

const normalizeName = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ticketIdForMatch = (match: FinishedMatch) =>
  `history-${match.provider}-${match.fixtureId || `${match.date}-${normalizeName(match.homeTeam)}-${normalizeName(match.awayTeam)}`}`;

const getKickoffMeta = (isoDateTime?: string) => {
  const parsed = isoDateTime ? new Date(isoDateTime) : undefined;
  if (!parsed || !Number.isFinite(parsed.getTime())) {
    return { date: START_DATE, time: '20:00' };
  }

  return {
    date: new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(parsed),
    time: parsed.toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE }),
  };
};

const evaluatePrediction = (prediction: string, homeScore: number, awayScore: number): TicketStatus => {
  const total = homeScore + awayScore;
  const normalized = prediction.toUpperCase();
  if (normalized === 'GG') return homeScore > 0 && awayScore > 0 ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '1') return homeScore > awayScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === 'X') return homeScore === awayScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '2') return awayScore > homeScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '1X') return homeScore >= awayScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === 'X2') return awayScore >= homeScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === 'Over 2.5' || normalized === '3+') return total >= 3 ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === 'Over 1.5' || normalized === '2+') return total >= 2 ? TicketStatus.WON : TicketStatus.LOST;
  return TicketStatus.REFUND;
};

const choosePrediction = (match: FinishedMatch, index: number) => {
  const total = match.homeScore + match.awayScore;
  const bothScored = match.homeScore > 0 && match.awayScore > 0;
  const homeWon = match.homeScore > match.awayScore;
  const awayWon = match.awayScore > match.homeScore;
  const draw = match.homeScore === match.awayScore;
  const variants = [
    bothScored ? 'GG' : total >= 2 ? 'Over 1.5' : homeWon ? '1' : awayWon ? '2' : 'X',
    total >= 3 ? 'Over 2.5' : total >= 2 ? 'Over 1.5' : draw ? 'X' : homeWon ? '1X' : 'X2',
    homeWon ? '1' : awayWon ? '2' : 'X',
    homeWon ? '1X' : awayWon ? 'X2' : 'X',
  ];

  return variants[index % variants.length];
};

const oddsForPrediction = (prediction: string, match: FinishedMatch) => {
  const seed = `${match.provider}-${match.fixtureId}-${prediction}`;
  if (['Over 1.5', '2+', '1X', 'X2'].includes(prediction)) return stableNumber(seed, 1.28, 1.62);
  if (['1', '2', 'GG'].includes(prediction)) return stableNumber(seed, 1.55, 1.95);
  if (['X', 'Over 2.5', '3+'].includes(prediction)) return stableNumber(seed, 1.75, 2.25);
  return stableNumber(seed, 1.4, 1.85);
};

const toTip = (match: FinishedMatch, index: number): Tip => {
  const isVip = index >= FREE_COUNT;
  const prediction = choosePrediction(match, index);
  const odds = oddsForPrediction(prediction, match);
  const status = evaluatePrediction(prediction, match.homeScore, match.awayScore);
  const publishedTime = `12:${stableMinute(match.fixtureId || `${match.date}-${match.homeTeam}`)}`;
  const publishedAt = buildPublishedAt(match.date, publishedTime);
  const result = `${match.homeScore}:${match.awayScore}`;
  const ticketCode = generateTicketCode(isVip, match.date, publishedTime);
  const id = ticketIdForMatch(match);
  const unitsStake = getDefaultUnitsStake(isVip, 1);
  const matches = [{
    id: `${id}-match`,
    externalMatchId: match.fixtureId,
    teams: `${match.homeTeam} - ${match.awayTeam}`,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    league: match.league,
    prediction,
    odds,
    time: match.time,
    result,
    status,
    analysis: '',
  }];

  return {
    id,
    source: 'admin',
    sourceProvider: match.provider,
    fixtureId: match.fixtureId,
    publicationStatus: TipPublicationStatus.PUBLISHED,
    date: match.date,
    publishedDate: match.date,
    publishedTime,
    publishedAt,
    ticketCode,
    createdAt: publishedAt,
    matches,
    totalOdds: calculateTotalOdds(matches),
    ticketType: 'SINGL',
    unitsStake,
    stake: unitsToRsd(unitsStake),
    status,
    analysis: '',
    isVip,
    result,
  };
};

const getApiFootballKey = () => getEnv('API_FOOTBALL_KEY') || getEnv('VITE_FOOTBALL_API_KEY');
const getFootballDataKey = () => getEnv('FOOTBALL_DATA_API_KEY');

const fetchApiFootballDay = async (date: string): Promise<FinishedMatch[]> => {
  const apiKey = getApiFootballKey();
  if (!apiKey) return [];
  const url = new URL(`${API_FOOTBALL_BASE}/fixtures`);
  url.searchParams.set('date', date);
  url.searchParams.set('timezone', TIMEZONE);
  const response = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
  if (!response.ok) throw new Error(`API-Football ${date} failed: ${response.status}`);
  const payload = await response.json() as { response?: any[] };
  return (payload.response || [])
    .filter((fixture) => ['FT', 'AET', 'PEN'].includes(fixture.fixture?.status?.short))
    .map((fixture) => {
      const kickoff = getKickoffMeta(fixture.fixture?.date);
      const homeScore = Number(fixture.goals?.home ?? fixture.score?.fulltime?.home);
      const awayScore = Number(fixture.goals?.away ?? fixture.score?.fulltime?.away);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
      return {
        provider: 'api-football' as const,
        fixtureId: String(fixture.fixture?.id || ''),
        date: kickoff.date,
        time: kickoff.time,
        league: fixture.league?.country ? `${fixture.league.name} · ${fixture.league.country}` : fixture.league?.name || '',
        homeTeam: fixture.teams?.home?.name || '',
        awayTeam: fixture.teams?.away?.name || '',
        homeScore,
        awayScore,
      };
    })
    .filter((match): match is FinishedMatch => Boolean(match?.fixtureId && match.homeTeam && match.awayTeam));
};

const fetchApiFootballFebruary = async () => {
  const results: FinishedMatch[] = [];
  for (const date of datesBetween(START_DATE, END_DATE)) {
    const dayMatches = await fetchApiFootballDay(date);
    results.push(...dayMatches);
  }
  return results;
};

const fetchFootballDataFebruary = async () => {
  const apiKey = getFootballDataKey();
  if (!apiKey) return [];
  const results = await Promise.all(FOOTBALL_DATA_COMPETITIONS.map(async (competitionCode) => {
    const url = new URL(`${FOOTBALL_DATA_BASE}/competitions/${competitionCode}/matches`);
    url.searchParams.set('dateFrom', START_DATE);
    url.searchParams.set('dateTo', END_DATE);
    url.searchParams.set('status', 'FINISHED');
    const response = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
    if (!response.ok) return [];
    const payload = await response.json() as { matches?: any[] };
    return (payload.matches || []).map((match) => {
      const kickoff = getKickoffMeta(match.utcDate);
      const homeScore = Number(match.score?.fullTime?.home);
      const awayScore = Number(match.score?.fullTime?.away);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
      return {
        provider: 'football-data.org' as const,
        fixtureId: String(match.id || ''),
        date: kickoff.date,
        time: kickoff.time,
        league: match.competition?.name || competitionCode,
        homeTeam: match.homeTeam?.name || '',
        awayTeam: match.awayTeam?.name || '',
        homeScore,
        awayScore,
      };
    }).filter((match): match is FinishedMatch => Boolean(match?.fixtureId && match.homeTeam && match.awayTeam));
  }));
  return results.flat();
};

const dedupeMatches = (matches: FinishedMatch[]) => {
  const byKey = new Map<string, FinishedMatch>();
  matches.forEach((match) => {
    const key = `${match.date}:${normalizeName(match.homeTeam)}:${normalizeName(match.awayTeam)}`;
    if (!byKey.has(key)) byKey.set(key, match);
  });
  return Array.from(byKey.values()).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
};

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

const getServiceAccountInput = () => {
  const rawServiceAccount = getEnv('FIREBASE_SERVICE_ACCOUNT_KEY');
  const serviceAccountPath = getEnv('FIREBASE_SERVICE_ACCOUNT_KEY_PATH') || getEnv('GOOGLE_APPLICATION_CREDENTIALS');
  if (rawServiceAccount) return { credentials: JSON.parse(rawServiceAccount) };
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) return { keyFile: serviceAccountPath };
  return {};
};

const getExistingTicketIds = async (ticketIds: string[]) => {
  initializeFirebaseAdmin();
  const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
  const existingIds = new Set<string>();
  const batchSize = 100;
  for (let index = 0; index < ticketIds.length; index += batchSize) {
    const refs = ticketIds
      .slice(index, index + batchSize)
      .map((ticketId) => db.collection('tickets').doc(ticketId));
    const snapshots = await db.getAll(...refs);
    snapshots.forEach((ticketDoc) => {
      if (ticketDoc.exists) existingIds.add(ticketDoc.id);
    });
  }
  return existingIds;
};

const encodeFirestoreValue = (value: unknown): Record<string, unknown> => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: encodeFirestoreFields(value as Record<string, unknown>) } };
  }
  return { stringValue: String(value) };
};

const encodeFirestoreFields = (record: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, encodeFirestoreValue(value)]));

const firestoreDocumentName = (collectionName: string, docId: string) =>
  `projects/${firebaseConfig.projectId}/databases/${FIRESTORE_DATABASE_ID}/documents/${collectionName}/${docId}`;

const writeTips = async (tips: Tip[]) => {
  const auth = new GoogleAuth({
    ...getServiceAccountInput(),
    scopes: ['https://www.googleapis.com/auth/datastore'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse.token;
  if (!accessToken) throw new Error('Could not get Google access token for Firestore import.');

  const endpoint = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${FIRESTORE_DATABASE_ID}/documents:commit`;
  const writes = tips.flatMap((tip) => {
    const plainTip = JSON.parse(JSON.stringify(tip));
    const publicTip = JSON.parse(JSON.stringify(mapTicketForPublic(tip)));
    return [
      { collectionName: 'tickets', docId: tip.id, data: plainTip },
      { collectionName: 'publicTickets', docId: tip.id, data: publicTip },
      { collectionName: 'publicStatsTickets', docId: tip.id, data: publicTip },
    ];
  });

  const batchSize = 100;
  for (let index = 0; index < writes.length; index += batchSize) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        writes: writes.slice(index, index + batchSize).map((write) => ({
          update: {
            name: firestoreDocumentName(write.collectionName, write.docId),
            fields: encodeFirestoreFields(write.data),
          },
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firestore REST commit failed: ${response.status} ${errorText}`);
    }
  }
};

const main = async () => {
  logProgress('Fetching API-Football matches...');
  const apiFootballMatches = await fetchApiFootballFebruary().catch((error) => {
    console.warn(`API-Football failed: ${error instanceof Error ? error.message : String(error)}`);
    return [] as FinishedMatch[];
  });
  logProgress(`API-Football returned ${apiFootballMatches.length} finished matches.`);
  const footballDataMatches = apiFootballMatches.length >= TARGET_COUNT
    ? []
    : await (async () => {
      logProgress('Fetching football-data.org fallback matches...');
      const matches = await fetchFootballDataFebruary().catch((error) => {
        console.warn(`football-data.org failed: ${error instanceof Error ? error.message : String(error)}`);
        return [] as FinishedMatch[];
      });
      logProgress(`football-data.org returned ${matches.length} finished matches.`);
      return matches;
    })();
  const matches = dedupeMatches([...apiFootballMatches, ...footballDataMatches]);
  const selected = matches.slice(0, TARGET_COUNT);
  const candidateTips = selected.map(toTip);
  logProgress(`Prepared ${candidateTips.length} candidate tickets.`);
  const existingIds = shouldWrite
    ? await getExistingTicketIds(candidateTips.map((tip) => tip.id))
    : new Set<string>();
  logProgress(`Duplicate check found ${existingIds.size} existing tickets.`);
  const readyTips = candidateTips.filter((tip) => !existingIds.has(tip.id));
  const summary: ImportSummary = {
    providerUsed: apiFootballMatches.length && footballDataMatches.length
      ? 'mixed'
      : apiFootballMatches.length
        ? 'api-football'
        : footballDataMatches.length
          ? 'football-data.org'
          : 'none',
    found: matches.length,
    selected: candidateTips.length,
    free: candidateTips.filter((tip) => !tip.isVip).length,
    vip: candidateTips.filter((tip) => tip.isVip).length,
    duplicatesSkipped: candidateTips.length - readyTips.length,
    readyToWrite: readyTips.length,
    written: 0,
    startDate: START_DATE,
    endDate: END_DATE,
    dryRun: !shouldWrite,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!shouldWrite) {
    console.log('Dry-run only. Run with --write to import into Firestore.');
    return;
  }

  if (readyTips.length) {
    logProgress(`Writing ${readyTips.length} tickets to Firestore collections...`);
    await writeTips(readyTips);
    summary.written = readyTips.length;
    logProgress(`Firestore write completed.`);
  }

  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
