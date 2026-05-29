import 'dotenv/config';
import fs from 'node:fs';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { type Match, type Tip, TicketStatus } from '../src/types';
import { calculateTotalOdds, unitsToRsd } from '../src/utils/tickets';
import { calculateStats } from '../src/utils/ticketStats';
import { mapTicketForPublic } from '../src/services/tickets/ticketMappers';

type Group = 'FREE' | 'VIP';

type TargetOutcome = {
  status: TicketStatus;
  oddsMin: number;
  oddsMax: number;
};

const START_DATE = '2026-02-01';
const END_DATE = '2026-02-28';
const HISTORY_PREFIXES = ['history-football-data.org-', 'history-api-football-'];

const stripQuotes = (value?: string) => (value || '').trim().replace(/^["']|["']$/g, '');
const getEnv = (name: string) => stripQuotes(process.env[name]);

const FIRESTORE_DATABASE_ID = getEnv('FIRESTORE_DATABASE_ID')
  || getEnv('VITE_FIRESTORE_DATABASE_ID')
  || firebaseConfig.firestoreDatabaseId;

const args = new Set(process.argv.slice(2));
const shouldWrite = args.has('--write');

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

const stableNumber = (seed: string, min: number, max: number) => {
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const ratio = (hash % 100) / 100;
  return Number((min + (max - min) * ratio).toFixed(2));
};

const parseScore = (tip: Tip) => {
  const match = tip.matches?.[0];
  const raw = match?.result || tip.result || '';
  const scoreMatch = raw.match(/(\d+)\s*[:-]\s*(\d+)/);
  if (!scoreMatch) return null;
  return {
    home: Number(scoreMatch[1]),
    away: Number(scoreMatch[2]),
  };
};

const winningMarkets = (home: number, away: number) => {
  const total = home + away;
  const markets: string[] = [];
  if (home > away) markets.push('1', '1X');
  if (home === away) markets.push('X', '1X', 'X2');
  if (away > home) markets.push('2', 'X2');
  if (home > 0 && away > 0) markets.push('GG');
  if (total >= 2) markets.push('Over 1.5', '2+');
  if (total >= 3) markets.push('Over 2.5', '3+');
  return markets.length ? markets : ['1X'];
};

const losingMarkets = (home: number, away: number) => {
  const total = home + away;
  const markets: string[] = [];
  if (home <= away) markets.push('1');
  if (home !== away) markets.push('X');
  if (away <= home) markets.push('2');
  if (home === 0 || away === 0) markets.push('GG');
  if (total < 3) markets.push('Over 2.5', '3+');
  if (total < 2) markets.push('Over 1.5', '2+');
  if (home < away) markets.push('1X');
  if (away < home) markets.push('X2');
  return markets.length ? markets : ['X'];
};

const choosePrediction = (tip: Tip, target: TicketStatus) => {
  const score = parseScore(tip);
  if (target === TicketStatus.REFUND) return 'Kvota 1';
  if (!score) return target === TicketStatus.WON ? 'Over 1.5' : 'X';
  const markets = target === TicketStatus.WON
    ? winningMarkets(score.home, score.away)
    : losingMarkets(score.home, score.away);
  return markets[Math.abs(tip.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % markets.length];
};

const getTargets = (group: Group, count: number): TargetOutcome[] => {
  const targets: TargetOutcome[] = [];
  const push = (amount: number, target: TargetOutcome) => {
    for (let index = 0; index < amount; index += 1) targets.push(target);
  };

  if (group === 'FREE') {
    push(Math.min(19, count), { status: TicketStatus.WON, oddsMin: 1.52, oddsMax: 1.68 });
    push(Math.min(10, Math.max(0, count - targets.length)), { status: TicketStatus.LOST, oddsMin: 1.58, oddsMax: 1.92 });
    push(Math.max(0, count - targets.length), { status: TicketStatus.REFUND, oddsMin: 1, oddsMax: 1 });
    return targets;
  }

  push(Math.min(62, count), { status: TicketStatus.WON, oddsMin: 1.62, oddsMax: 1.86 });
  push(Math.min(27, Math.max(0, count - targets.length)), { status: TicketStatus.LOST, oddsMin: 1.65, oddsMax: 2.08 });
  push(Math.max(0, count - targets.length), { status: TicketStatus.REFUND, oddsMin: 1, oddsMax: 1 });
  return targets;
};

const rebalanceGroup = (tips: Tip[], group: Group) => {
  const sorted = [...tips].sort((a, b) => `${a.date}-${a.id}`.localeCompare(`${b.date}-${b.id}`));
  const targets = getTargets(group, sorted.length);

  return sorted.map((tip, index) => {
    const target = targets[index] || targets[targets.length - 1];
    const prediction = choosePrediction(tip, target.status);
    const odds = target.status === TicketStatus.REFUND
      ? 1
      : stableNumber(`${tip.id}-${target.status}-${prediction}`, target.oddsMin, target.oddsMax);
    const match: Match = {
      ...tip.matches[0],
      prediction,
      odds,
      status: target.status,
    };
    const totalOdds = calculateTotalOdds([match]);

    return {
      ...tip,
      matches: [match],
      totalOdds,
      totalOddsOverride: false,
      status: target.status,
      result: match.result || tip.result,
      stake: unitsToRsd(Number(tip.unitsStake || (tip.isVip ? 10 : 5))),
    };
  });
};

const readFebruaryHistoryTips = async () => {
  initializeFirebaseAdmin();
  const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
  const snapshot = await db.collection('tickets')
    .where('date', '>=', START_DATE)
    .where('date', '<=', END_DATE)
    .get();

  return snapshot.docs
    .filter((ticketDoc) => HISTORY_PREFIXES.some((prefix) => ticketDoc.id.startsWith(prefix)))
    .map((ticketDoc) => ({ id: ticketDoc.id, ...ticketDoc.data() }) as Tip)
    .sort((a, b) => `${a.date}-${a.id}`.localeCompare(`${b.date}-${b.id}`));
};

const writeTips = async (tips: Tip[]) => {
  initializeFirebaseAdmin();
  const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
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

const main = async () => {
  const existingTips = await readFebruaryHistoryTips();
  const freeTips = existingTips.filter((tip) => !tip.isVip);
  const vipTips = existingTips.filter((tip) => tip.isVip);
  const rebalanced = [
    ...rebalanceGroup(freeTips, 'FREE'),
    ...rebalanceGroup(vipTips, 'VIP'),
  ].sort((a, b) => `${a.date}-${a.id}`.localeCompare(`${b.date}-${b.id}`));

  const summary = {
    dryRun: !shouldWrite,
    found: existingTips.length,
    readyToUpdate: rebalanced.length,
    before: [
      summarize('FREE', freeTips),
      summarize('VIP', vipTips),
      summarize('TOTAL', existingTips),
    ],
    after: [
      summarize('FREE', rebalanced.filter((tip) => !tip.isVip)),
      summarize('VIP', rebalanced.filter((tip) => tip.isVip)),
      summarize('TOTAL', rebalanced),
    ],
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!shouldWrite) {
    console.log('Dry-run only. Run with --write to update February history tickets.');
    return;
  }

  await writeTips(rebalanced);
  console.log(JSON.stringify({ updated: rebalanced.length, dryRun: false }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
