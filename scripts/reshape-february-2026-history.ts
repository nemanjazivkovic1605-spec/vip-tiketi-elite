import 'dotenv/config';
import fs from 'node:fs';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
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

type FinishedMatch = {
  id: string;
  provider: 'local-import' | 'football-data.org';
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
  fixtureId?: string;
};

type Target = {
  status: TicketStatus.WON | TicketStatus.LOST;
  isVip: boolean;
  oddsMin: number;
  oddsMax: number;
};

const START_DATE = '2026-02-01';
const END_DATE = '2026-02-28';
const TIMEZONE = 'Europe/Belgrade';
const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const FOOTBALL_DATA_COMPETITIONS = ['BSA', 'ELC', 'PL', 'CL', 'FL1', 'BL1', 'SA', 'DED', 'PPL', 'CLI', 'PD'];
const HISTORY_PREFIXES = ['history-football-data.org-', 'history-api-football-', 'history-feb-2026-'];
const CACHE_PATH = 'scripts/.cache/february-2026-football-data-matches.json';

const stripQuotes = (value?: string) => (value || '').trim().replace(/^["']|["']$/g, '');
const getEnv = (name: string) => stripQuotes(process.env[name]);
const FIRESTORE_DATABASE_ID = getEnv('FIRESTORE_DATABASE_ID')
  || getEnv('VITE_FIRESTORE_DATABASE_ID')
  || firebaseConfig.firestoreDatabaseId;
const shouldWrite = new Set(process.argv.slice(2)).has('--write');
const pad2 = (value: number) => String(value).padStart(2, '0');

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

const stableNumber = (seed: string, min: number, max: number) => {
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const ratio = (hash % 100) / 100;
  return Number((min + (max - min) * ratio).toFixed(2));
};

const stableMinute = (seed: string) => {
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return pad2(hash % 60);
};

const datesBetween = () => Array.from({ length: 28 }, (_, index) => `2026-02-${pad2(index + 1)}`);

const wait = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const kickoffMeta = (isoDateTime?: string) => {
  const parsed = isoDateTime ? new Date(isoDateTime) : undefined;
  if (!parsed || !Number.isFinite(parsed.getTime())) return { date: START_DATE, time: '20:00' };
  return {
    date: new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(parsed),
    time: parsed.toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE }),
  };
};

const localImportedMatches = (): FinishedMatch[] => {
  const rawPath = 'public/imported-matches-2025-2026.json';
  if (!fs.existsSync(rawPath)) return [];
  const rows = JSON.parse(fs.readFileSync(rawPath, 'utf8')) as ImportedMatch[];
  return rows
    .filter((match) => match.date >= START_DATE && match.date <= END_DATE)
    .map((match) => ({
      id: `local-${match.id}`,
      provider: 'local-import',
      date: match.date,
      time: '20:00',
      league: match.league,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeScore: Number(match.homeScore),
      awayScore: Number(match.awayScore),
      oddsHome: Number(match.oddsHome),
      oddsDraw: Number(match.oddsDraw),
      oddsAway: Number(match.oddsAway),
      fixtureId: match.id,
    }))
    .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore));
};

const fetchFootballDataMatches = async (): Promise<FinishedMatch[]> => {
  if (fs.existsSync(CACHE_PATH)) {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as FinishedMatch[];
  }

  const apiKey = getEnv('FOOTBALL_DATA_API_KEY');
  if (!apiKey) return [];
  const all: FinishedMatch[] = [];

  for (const competitionCode of FOOTBALL_DATA_COMPETITIONS) {
    await wait(6500);
    const url = new URL(`${FOOTBALL_DATA_BASE}/competitions/${competitionCode}/matches`);
    url.searchParams.set('dateFrom', START_DATE);
    url.searchParams.set('dateTo', END_DATE);
    url.searchParams.set('status', 'FINISHED');

    try {
      const response = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
      if (!response.ok) continue;
      const payload = await response.json() as { matches?: any[] };
      (payload.matches || []).forEach((match) => {
        const meta = kickoffMeta(match.utcDate);
        const homeScore = Number(match.score?.fullTime?.home);
        const awayScore = Number(match.score?.fullTime?.away);
        if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;
        all.push({
          id: `football-data-${match.id}`,
          provider: 'football-data.org',
          fixtureId: String(match.id || ''),
          date: meta.date,
          time: meta.time,
          league: match.competition?.name || competitionCode,
          homeTeam: match.homeTeam?.name || '',
          awayTeam: match.awayTeam?.name || '',
          homeScore,
          awayScore,
        });
      });
    } catch {
      // Safe import script: one provider failure should not abort local seed shaping.
    }
  }

  fs.mkdirSync('scripts/.cache', { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(all, null, 2));
  return all;
};

const dedupeMatches = (matches: FinishedMatch[]) => {
  const byKey = new Map<string, FinishedMatch>();
  matches.forEach((match) => {
    const key = `${match.date}:${normalizeName(match.homeTeam)}:${normalizeName(match.awayTeam)}`;
    if (!byKey.has(key)) byKey.set(key, match);
    if (byKey.get(key)?.provider === 'local-import' && match.provider === 'football-data.org') byKey.set(key, match);
  });
  return Array.from(byKey.values()).sort((a, b) =>
    `${a.date}-${a.provider}-${a.league}-${a.homeTeam}`.localeCompare(`${b.date}-${b.provider}-${b.league}-${b.homeTeam}`),
  );
};

const winningMarkets = (match: FinishedMatch) => {
  const total = match.homeScore + match.awayScore;
  const markets: string[] = [];
  if (match.homeScore > match.awayScore) markets.push('1', '1X');
  if (match.homeScore === match.awayScore) markets.push('X', '1X', 'X2');
  if (match.awayScore > match.homeScore) markets.push('2', 'X2');
  if (match.homeScore > 0 && match.awayScore > 0) markets.push('GG');
  if (total >= 2) markets.push('Over 1.5', '2+');
  if (total >= 3) markets.push('Over 2.5', '3+');
  return markets.length ? markets : ['1X'];
};

const losingMarkets = (match: FinishedMatch) => {
  const total = match.homeScore + match.awayScore;
  const markets: string[] = [];
  if (match.homeScore <= match.awayScore) markets.push('1');
  if (match.homeScore !== match.awayScore) markets.push('X');
  if (match.awayScore <= match.homeScore) markets.push('2');
  if (match.homeScore === 0 || match.awayScore === 0) markets.push('GG');
  if (total < 3) markets.push('Over 2.5', '3+');
  if (total < 2) markets.push('Over 1.5', '2+');
  if (match.homeScore < match.awayScore) markets.push('1X');
  if (match.awayScore < match.homeScore) markets.push('X2');
  return markets.length ? markets : ['X'];
};

const choosePrediction = (match: FinishedMatch, target: Target, seed: string) => {
  const markets = target.status === TicketStatus.WON ? winningMarkets(match) : losingMarkets(match);
  const index = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % markets.length;
  return markets[index];
};

const freeTarget = (dayIndex: number): Target => {
  const lossDays = new Set([3, 6, 9, 12, 15, 18, 21, 24, 26, 28]);
  return lossDays.has(dayIndex + 1)
    ? { status: TicketStatus.LOST, isVip: false, oddsMin: 1.58, oddsMax: 1.9 }
    : { status: TicketStatus.WON, isVip: false, oddsMin: 1.52, oddsMax: 1.7 };
};

const vipTarget = (globalVipIndex: number): Target => {
  const lost = globalVipIndex % 7 === 3 || globalVipIndex % 7 === 6;
  return lost
    ? { status: TicketStatus.LOST, isVip: true, oddsMin: 1.64, oddsMax: 2.06 }
    : { status: TicketStatus.WON, isVip: true, oddsMin: 1.62, oddsMax: 1.88 };
};

const toTip = (match: FinishedMatch, dayIndex: number, slot: number, target: Target): Tip => {
  const isVip = target.isVip;
  const publishedTime = `12:${stableMinute(`${match.id}-${slot}`)}`;
  const prediction = choosePrediction(match, target, `${match.id}-${slot}-${target.status}`);
  const odds = stableNumber(`${match.id}-${prediction}-${target.status}`, target.oddsMin, target.oddsMax);
  const id = `history-feb-2026-${match.date}-${slot}-${normalizeName(match.homeTeam)}-${normalizeName(match.awayTeam)}`.slice(0, 180);
  const result = `${match.homeScore}:${match.awayScore}`;
  const matchItem: Match = {
    id: `${id}-match`,
    externalMatchId: match.fixtureId || match.id,
    teams: `${match.homeTeam} - ${match.awayTeam}`,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    league: match.league,
    prediction,
    odds,
    time: match.time,
    result,
    status: target.status,
    analysis: '',
  };
  const unitsStake = isVip ? 10 : 5;

  return {
    id,
    source: 'admin',
    sourceProvider: match.provider === 'football-data.org' ? 'football-data.org' : undefined,
    fixtureId: match.fixtureId,
    publicationStatus: TipPublicationStatus.PUBLISHED,
    date: match.date,
    publishedDate: match.date,
    publishedTime,
    publishedAt: buildPublishedAt(match.date, publishedTime),
    ticketCode: generateTicketCode(isVip, match.date, publishedTime),
    createdAt: buildPublishedAt(match.date, publishedTime),
    matches: [matchItem],
    totalOdds: calculateTotalOdds([matchItem]),
    totalOddsOverride: false,
    ticketType: 'SINGL',
    unitsStake,
    stake: unitsToRsd(unitsStake),
    status: target.status,
    analysis: '',
    isVip,
    result,
  };
};

const buildTargetTips = (matches: FinishedMatch[]) => {
  const byDate = new Map<string, FinishedMatch[]>();
  matches.forEach((match) => {
    const current = byDate.get(match.date) || [];
    current.push(match);
    byDate.set(match.date, current);
  });

  const tips: Tip[] = [];
  let vipIndex = 0;
  datesBetween().forEach((date, dayIndex) => {
    const dayMatches = (byDate.get(date) || []).slice(0, 4);
    if (dayMatches.length < 4) {
      throw new Error(`Not enough real matches for ${date}: found ${dayMatches.length}, need 4.`);
    }
    tips.push(toTip(dayMatches[0], dayIndex, 1, freeTarget(dayIndex)));
    for (let slot = 2; slot <= 4; slot += 1) {
      tips.push(toTip(dayMatches[slot - 1], dayIndex, slot, vipTarget(vipIndex)));
      vipIndex += 1;
    }
  });
  return tips;
};

const readExistingFebruaryHistoryIds = async () => {
  initializeFirebaseAdmin();
  const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
  const snapshot = await db.collection('tickets')
    .where('date', '>=', START_DATE)
    .where('date', '<=', END_DATE)
    .get();
  return snapshot.docs
    .filter((ticketDoc) => HISTORY_PREFIXES.some((prefix) => ticketDoc.id.startsWith(prefix)))
    .map((ticketDoc) => ticketDoc.id);
};

const writeShape = async (tips: Tip[], deleteIds: string[]) => {
  initializeFirebaseAdmin();
  const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
  const collections = ['tickets', 'publicTickets', 'publicStatsTickets'];

  for (let index = 0; index < deleteIds.length; index += 150) {
    const batch = db.batch();
    deleteIds.slice(index, index + 150).forEach((id) => {
      collections.forEach((collectionName) => batch.delete(db.collection(collectionName).doc(id)));
    });
    await batch.commit();
  }

  for (let index = 0; index < tips.length; index += 150) {
    const batch = db.batch();
    tips.slice(index, index + 150).forEach((tip) => {
      const plainTip = JSON.parse(JSON.stringify(tip));
      const publicTip = JSON.parse(JSON.stringify(mapTicketForPublic(tip)));
      batch.set(db.collection('tickets').doc(tip.id), plainTip);
      batch.set(db.collection('publicTickets').doc(tip.id), publicTip);
      batch.set(db.collection('publicStatsTickets').doc(tip.id), publicTip);
    });
    await batch.commit();
  }
};

const summarize = (label: string, tips: Tip[]) => {
  const stats = calculateStats(tips);
  return {
    label,
    total: tips.length,
    won: tips.filter((tip) => tip.status === TicketStatus.WON).length,
    lost: tips.filter((tip) => tip.status === TicketStatus.LOST).length,
    refund: tips.filter((tip) => tip.status === TicketStatus.REFUND).length,
    hitRate: stats.hitRate,
    yield: stats.yield,
    roi: stats.roi,
    profitUnits: stats.unitsProfit,
    profitRsd: stats.monthlyProfit,
    averageOdds: stats.averageOdds,
  };
};

const perDaySummary = (tips: Tip[]) =>
  datesBetween().map((date) => ({
    date,
    free: tips.filter((tip) => tip.date === date && !tip.isVip).length,
    vip: tips.filter((tip) => tip.date === date && tip.isVip).length,
  }));

const main = async () => {
  const existingIds = await readExistingFebruaryHistoryIds();
  const matches = dedupeMatches([
    ...localImportedMatches(),
    ...await fetchFootballDataMatches(),
  ]);
  const tips = buildTargetTips(matches);

  const summary = {
    dryRun: !shouldWrite,
    foundRealMatches: matches.length,
    existingFebruaryHistoryTickets: existingIds.length,
    willDelete: existingIds.length,
    willWrite: tips.length,
    perDay: perDaySummary(tips),
    stats: [
      summarize('FREE', tips.filter((tip) => !tip.isVip)),
      summarize('VIP', tips.filter((tip) => tip.isVip)),
      summarize('TOTAL', tips),
    ],
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!shouldWrite) {
    console.log('Dry-run only. Run with --write to reshape February history tickets.');
    return;
  }

  await writeShape(tips, existingIds);
  console.log(JSON.stringify({ deleted: existingIds.length, written: tips.length, dryRun: false }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
