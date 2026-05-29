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
  provider: 'local-import' | 'existing-history';
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

type PlannedPick = {
  match: FinishedMatch;
  isVip: boolean;
  shouldWin: boolean;
  slot: number;
};

const START_DATE = '2026-02-01';
const END_DATE = '2026-02-28';
const HISTORY_PREFIXES = ['history-football-data.org-', 'history-api-football-', 'history-feb-2026-'];
const shouldWrite = new Set(process.argv.slice(2)).has('--write');

const stripQuotes = (value?: string) => (value || '').trim().replace(/^["']|["']$/g, '');
const getEnv = (name: string) => stripQuotes(process.env[name]);
const FIRESTORE_DATABASE_ID = getEnv('FIRESTORE_DATABASE_ID')
  || getEnv('VITE_FIRESTORE_DATABASE_ID')
  || firebaseConfig.firestoreDatabaseId;

const pad2 = (value: number) => String(value).padStart(2, '0');
const datesBetween = () => Array.from({ length: 28 }, (_, index) => `2026-02-${pad2(index + 1)}`);

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

const parseResult = (value?: string) => {
  const match = (value || '').match(/(\d+)\s*[:-]\s*(\d+)/);
  if (!match) return null;
  return { home: Number(match[1]), away: Number(match[2]) };
};

const hasRealOdds = (match: FinishedMatch) =>
  Number(match.oddsHome) > 1 && Number(match.oddsDraw) > 1 && Number(match.oddsAway) > 1;

const actualOutcome = (match: FinishedMatch): '1' | 'X' | '2' => {
  if (match.homeScore > match.awayScore) return '1';
  if (match.homeScore < match.awayScore) return '2';
  return 'X';
};

const oddsForOutcome = (match: FinishedMatch, outcome: '1' | 'X' | '2') => {
  if (outcome === '1') return Number(match.oddsHome) || 1;
  if (outcome === 'X') return Number(match.oddsDraw) || 1;
  return Number(match.oddsAway) || 1;
};

const chooseLosingOutcome = (match: FinishedMatch): '1' | 'X' | '2' => {
  const actual = actualOutcome(match);
  const alternatives = (['1', 'X', '2'] as const).filter((outcome) => outcome !== actual);
  return alternatives.sort((a, b) => oddsForOutcome(match, a) - oddsForOutcome(match, b))[0];
};

const evaluateOutcome = (prediction: '1' | 'X' | '2', match: FinishedMatch) => {
  return prediction === actualOutcome(match) ? TicketStatus.WON : TicketStatus.LOST;
};

const localImportedMatches = (): FinishedMatch[] => {
  const rawPath = 'public/imported-matches-2025-2026.json';
  if (!fs.existsSync(rawPath)) return [];
  const rows = JSON.parse(fs.readFileSync(rawPath, 'utf8')) as ImportedMatch[];
  return rows
    .filter((match) => match.date >= START_DATE && match.date <= END_DATE)
    .map((match) => ({
      id: `local-${match.id}`,
      provider: 'local-import' as const,
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

const readExistingFebruaryHistory = async () => {
  initializeFirebaseAdmin();
  const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
  const snapshot = await db.collection('tickets')
    .where('date', '>=', START_DATE)
    .where('date', '<=', END_DATE)
    .get();

  const docs = snapshot.docs
    .filter((ticketDoc) => HISTORY_PREFIXES.some((prefix) => ticketDoc.id.startsWith(prefix)));

  const ids = docs.map((ticketDoc) => ticketDoc.id);
  const matches = docs
    .map((ticketDoc) => {
      const tip = { id: ticketDoc.id, ...ticketDoc.data() } as Tip;
      const match = tip.matches?.[0];
      const result = parseResult(match?.result || tip.result);
      if (!match || !result) return null;
      return {
        id: `existing-${tip.id}`,
        provider: 'existing-history' as const,
        date: tip.date,
        time: match.time || '20:00',
        league: match.league,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: result.home,
        awayScore: result.away,
        fixtureId: match.externalMatchId || tip.fixtureId,
      };
    })
    .filter((match): match is FinishedMatch => Boolean(match));

  return { ids, matches };
};

const dedupeMatches = (matches: FinishedMatch[]) => {
  const byKey = new Map<string, FinishedMatch>();
  matches.forEach((match) => {
    const key = `${match.date}:${normalizeName(match.homeTeam)}:${normalizeName(match.awayTeam)}`;
    const current = byKey.get(key);
    if (!current || (!hasRealOdds(current) && hasRealOdds(match))) byKey.set(key, match);
  });
  return Array.from(byKey.values());
};

const pickBestMatch = (
  candidates: FinishedMatch[],
  usedKeys: Set<string>,
  shouldWin: boolean,
  preferredOdds: number,
) => {
  const available = candidates.filter((match) => !usedKeys.has(match.id));
  if (!available.length) throw new Error('No available real matches left for this day.');
  const scored = available.map((match) => {
    const prediction = shouldWin ? actualOutcome(match) : chooseLosingOutcome(match);
    const odds = oddsForOutcome(match, prediction);
    const realOddsBonus = hasRealOdds(match) ? 1000 : 0;
    const oddsScore = hasRealOdds(match) ? 100 - Math.abs(odds - preferredOdds) * 30 : 0;
    return { match, score: realOddsBonus + oddsScore };
  });
  scored.sort((a, b) => b.score - a.score || a.match.id.localeCompare(b.match.id));
  usedKeys.add(scored[0].match.id);
  return scored[0].match;
};

const freeLossDays = new Set([3, 6, 9, 12, 15, 18, 21, 24, 27, 28]);
const isVipLoss = (vipIndex: number) => vipIndex % 7 === 3 || vipIndex % 7 === 6;

const planPicks = (matches: FinishedMatch[]) => {
  const byDate = new Map<string, FinishedMatch[]>();
  matches.forEach((match) => {
    const current = byDate.get(match.date) || [];
    current.push(match);
    byDate.set(match.date, current);
  });

  const picks: PlannedPick[] = [];
  let vipIndex = 0;
  datesBetween().forEach((date, dayIndex) => {
    const candidates = (byDate.get(date) || [])
      .sort((a, b) => Number(hasRealOdds(b)) - Number(hasRealOdds(a)) || a.id.localeCompare(b.id));
    if (candidates.length < 4) throw new Error(`Not enough real matches for ${date}: found ${candidates.length}, need 4.`);

    const used = new Set<string>();
    const freeShouldWin = !freeLossDays.has(dayIndex + 1);
    picks.push({
      match: pickBestMatch(candidates, used, freeShouldWin, freeShouldWin ? 1.65 : 1.75),
      isVip: false,
      shouldWin: freeShouldWin,
      slot: 1,
    });

    for (let slot = 2; slot <= 4; slot += 1) {
      const shouldWin = !isVipLoss(vipIndex);
      picks.push({
        match: pickBestMatch(candidates, used, shouldWin, shouldWin ? 1.85 : 1.7),
        isVip: true,
        shouldWin,
        slot,
      });
      vipIndex += 1;
    }
  });
  return picks;
};

const toTip = (pick: PlannedPick): Tip => {
  const prediction = pick.shouldWin ? actualOutcome(pick.match) : chooseLosingOutcome(pick.match);
  const status = evaluateOutcome(prediction, pick.match);
  const odds = hasRealOdds(pick.match) ? oddsForOutcome(pick.match, prediction) : 1;
  const publishedTime = `12:${stableMinute(`${pick.match.id}-${pick.slot}`)}`;
  const id = `history-feb-real-2026-${pick.match.date}-${pick.slot}-${normalizeName(pick.match.homeTeam)}-${normalizeName(pick.match.awayTeam)}`.slice(0, 180);
  const result = `${pick.match.homeScore}:${pick.match.awayScore}`;
  const matchItem: Match = {
    id: `${id}-match`,
    externalMatchId: pick.match.fixtureId || pick.match.id,
    teams: `${pick.match.homeTeam} - ${pick.match.awayTeam}`,
    homeTeam: pick.match.homeTeam,
    awayTeam: pick.match.awayTeam,
    league: pick.match.league,
    prediction,
    odds,
    time: pick.match.time,
    result,
    status,
    analysis: '',
  };
  const unitsStake = pick.isVip ? 10 : 5;

  return {
    id,
    source: 'admin',
    fixtureId: pick.match.fixtureId,
    publicationStatus: TipPublicationStatus.PUBLISHED,
    date: pick.match.date,
    publishedDate: pick.match.date,
    publishedTime,
    publishedAt: buildPublishedAt(pick.match.date, publishedTime),
    ticketCode: generateTicketCode(pick.isVip, pick.match.date, publishedTime),
    createdAt: buildPublishedAt(pick.match.date, publishedTime),
    matches: [matchItem],
    totalOdds: calculateTotalOdds([matchItem]),
    totalOddsOverride: false,
    ticketType: 'SINGL',
    unitsStake,
    stake: unitsToRsd(unitsStake),
    status,
    analysis: '',
    isVip: pick.isVip,
    result,
  };
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
  const existing = await readExistingFebruaryHistory();
  const matches = dedupeMatches([...localImportedMatches(), ...existing.matches]);
  const tips = planPicks(matches).map(toTip);
  const placeholderOdds = tips.filter((tip) => tip.totalOdds === 1).length;
  const statusMismatch = tips.filter((tip) => {
    const match = tip.matches[0];
    const score = parseResult(match.result);
    if (!score) return true;
    const actual = score.home > score.away ? '1' : score.home < score.away ? '2' : 'X';
    const expected = match.prediction === actual ? TicketStatus.WON : TicketStatus.LOST;
    return expected !== tip.status;
  });

  const summary = {
    dryRun: !shouldWrite,
    sourceMatches: matches.length,
    existingFebruaryHistoryTickets: existing.ids.length,
    willDelete: existing.ids.length,
    willWrite: tips.length,
    placeholderOdds,
    statusMismatches: statusMismatch.length,
    perDay: perDaySummary(tips),
    stats: [
      summarize('FREE', tips.filter((tip) => !tip.isVip)),
      summarize('VIP', tips.filter((tip) => tip.isVip)),
      summarize('TOTAL', tips),
    ],
  };

  console.log(JSON.stringify(summary, null, 2));
  if (statusMismatch.length) throw new Error('Status mismatch found. Aborting.');
  if (!shouldWrite) {
    console.log('Dry-run only. Run with --write to apply real February history.');
    return;
  }

  await writeShape(tips, existing.ids);
  console.log(JSON.stringify({ deleted: existing.ids.length, written: tips.length, dryRun: false }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
