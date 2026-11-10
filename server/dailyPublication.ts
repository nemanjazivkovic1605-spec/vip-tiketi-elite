import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { DailyAnalysisItem, DailyAnalysisStatus, Tip } from '../src/types.js';
import { TicketStatus, TipPublicationStatus } from '../src/types.js';
import { mapTicketForPublic } from '../src/services/tickets/ticketMappers.js';
import { selectDailyPicks, type Candidate } from './dailyPickSelection.js';
import { localDate, numberSetting } from './sportsApi.js';
import { preparePublicStatsUpdate } from '../src/utils/publicStats.js';

type Reservation = { id: string; fixtureId?: number; access: 'FREE' | 'VIP' };
export const publicationSlots = (existing: Reservation[]) => {
  const count = (access: 'FREE' | 'VIP') => existing.filter((item) => item.access === access).length;
  return [
    ...Array(Math.max(0, numberSetting('DAILY_FREE_PICKS', 1, 0, 2) - count('FREE'))).fill('FREE'),
    ...Array(Math.max(0, numberSetting('DAILY_VIP_PICKS', 2, 0, 3) - count('VIP'))).fill('VIP'),
  ] as Array<'FREE' | 'VIP'>;
};

export function analysisTicket(analysis: DailyAnalysisItem): Tip {
  const status = analysis.status === 'WON' ? TicketStatus.WON : analysis.status === 'LOST' ? TicketStatus.LOST
    : analysis.status === 'REFUND' ? TicketStatus.REFUND : analysis.status === 'POSTPONED' ? TicketStatus.POSTPONED : TicketStatus.PENDING;
  return {
    id: `daily-${analysis.id}`, source: 'admin', type: 'vip_monthly', publicationStatus: TipPublicationStatus.PUBLISHED,
    date: analysis.date, publishedDate: analysis.publishedDate, publishedTime: analysis.publishedTime, publishedAt: analysis.publishedAt,
    sourceProvider: analysis.source, fixtureId: String(analysis.providerFixtureId || analysis.fixtureId || ''),
    matches: [{ id: `${analysis.id}-match`, externalMatchId: String(analysis.fixtureId || ''),
      teams: `${analysis.homeTeam} - ${analysis.awayTeam}`, homeTeam: analysis.homeTeam, awayTeam: analysis.awayTeam,
      league: analysis.league, prediction: analysis.prediction, odds: analysis.odds,
      time: analysis.kickoffTime || analysis.time, eventTime: analysis.kickoffTime || analysis.time, eventDate: analysis.date,
      status, ...(analysis.result ? { result: analysis.result } : {}), analysis: analysis.reasoning || '',
    }],
    ticketType: 'SINGL', totalOdds: analysis.odds, unitsStake: analysis.units || 3, status,
    analysis: analysis.reasoning || '', isVip: analysis.access === 'VIP',
    updatedAt: new Date().toISOString(),
  };
}

export const lockedDailyIndex = (item: DailyAnalysisItem) => ({
  id: item.id, sport: item.sport || 'football', league: item.league, date: item.date,
  time: item.time, type: 'VIP', status: item.status || 'ACTIVE', locked: true,
});

const withoutUndefined = (value: any): any => {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, withoutUndefined(entry)]),
  );
  return value;
};

export async function applyDailyResult(
  db: Firestore,
  expected: DailyAnalysisItem,
  result: { fixtureStatus: string; homeScore: number | null; awayScore: number | null; finished: boolean; postponed: boolean },
  evaluate: (prediction: string, home: number, away: number) => DailyAnalysisStatus,
) {
  return db.runTransaction(async (transaction) => {
    const ref = db.collection('dailyAnalyses').doc(expected.id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return false;
    const current = { ...snapshot.data(), id: snapshot.id } as DailyAnalysisItem;
    if (current.resultManualOverride || current.hidden || current.enabled === false
      || !['ACTIVE', 'PENDING_REVIEW', 'POSTPONED'].includes(current.status || 'ACTIVE')
      || current.fixtureId !== expected.fixtureId || current.date !== expected.date
      || current.homeTeam !== expected.homeTeam || current.awayTeam !== expected.awayTeam) return false;
    if (!result.postponed && (!result.finished || result.homeScore === null || result.awayScore === null)) return false;
    const status = result.postponed ? 'POSTPONED' : evaluate(current.prediction, result.homeScore!, result.awayScore!);
    const settled = ['WON', 'LOST', 'REFUND'].includes(status);
    const updated: DailyAnalysisItem = { ...current, status, fixtureStatus: result.fixtureStatus, isFinished: result.finished,
      ...(result.homeScore !== null && result.awayScore !== null ? {
        homeScore: result.homeScore, awayScore: result.awayScore, result: `${result.homeScore}:${result.awayScore}`,
      } : {}),
    };
    const ticket = withoutUndefined(analysisTicket(updated));
    const publicTicket = mapTicketForPublic(ticket);
    const applyStats = await preparePublicStatsUpdate(transaction, (path) => {
      const [name, id] = path.split('/');
      return db.collection(name).doc(id);
    }, ticket.id, settled ? publicTicket : null);
    transaction.update(ref, withoutUndefined({ fixtureStatus: result.fixtureStatus, status, isFinished: result.finished,
      ...(result.homeScore !== null && result.awayScore !== null ? { homeScore: result.homeScore, awayScore: result.awayScore } : {}),
      ...(updated.result ? { result: updated.result } : {}), updatedAt: FieldValue.serverTimestamp(),
      lastResultCheckAt: new Date().toISOString(),
      nextResultCheckAt: !settled ? new Date(Date.now() + 6 * 3600000).toISOString() : null,
    }));
    if (status === 'WON' && current.enabled && !current.hidden) {
      if (current.access === 'VIP') {
        transaction.set(db.collection('publicDailyAnalyses').doc(current.id), lockedDailyIndex(updated));
        transaction.delete(db.collection('freeDailyAnalyses').doc(current.id));
      }
      else {
        const { vipAnalysis, ...free } = updated;
        transaction.set(db.collection('freeDailyAnalyses').doc(current.id), withoutUndefined(free));
        transaction.delete(db.collection('publicDailyAnalyses').doc(current.id));
      }
    } else {
      transaction.delete(db.collection('publicDailyAnalyses').doc(current.id));
      transaction.delete(db.collection('freeDailyAnalyses').doc(current.id));
    }
    transaction.set(db.collection('tickets').doc(ticket.id), ticket);
    transaction.set(db.collection('publicTickets').doc(ticket.id), publicTicket);
    if (settled) transaction.set(db.collection('publicStatsTickets').doc(ticket.id), publicTicket);
    else transaction.delete(db.collection('publicStatsTickets').doc(ticket.id));
    applyStats(transaction);
    return true;
  });
}

export async function publishDailyCandidates(db: Firestore, date: string, candidates: Candidate[], now = new Date()) {
  const manifestRef = db.collection('dailyAutomation').doc(date);
  return db.runTransaction(async (transaction) => {
    // Query and manifest are read together in the transaction; parallel cron/admin runs serialize here.
    const [snapshot, manifest] = await Promise.all([
      transaction.get(db.collection('dailyAnalyses').where('date', '==', date)), transaction.get(manifestRef),
    ]);
    const reserved = new Map<string, Reservation>();
    for (const item of (manifest.data()?.published || []) as Reservation[]) reserved.set(item.id, item);
    for (const document of snapshot.docs) {
      const item = document.data();
      reserved.set(document.id, { id: document.id, ...(item.fixtureId ? { fixtureId: item.fixtureId } : {}), access: item.access === 'VIP' ? 'VIP' : 'FREE' });
    }
    const usedFixtures = new Set([...reserved.values()].map((item) => item.fixtureId).filter(Boolean));
    const eligible = candidates.filter((item) => !reserved.has(item.id) && !usedFixtures.has(item.fixtureId)
      && item.date === date && Date.parse(item.kickoffAt || '') > now.getTime() + 30 * 60_000);
    const selected = selectDailyPicks(eligible, publicationSlots([...reserved.values()]));
    if (!selected.length) return { saved: 0, fetched: candidates.length, skippedManualOverride: snapshot.docs.filter((doc) => doc.data().manualOverride).length };
    const existing = await transaction.getAll(...selected.flatMap((item) => [
      db.collection('dailyAnalyses').doc(item.id), db.collection('tickets').doc(`daily-${item.id}`),
    ]));
    let saved = 0;
    const publishedTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: '2-digit', minute: '2-digit' }).format(now);
    for (let index = 0; index < selected.length; index++) {
      const item = selected[index];
      // Insert only. Even a manually moved record or edited ticket cannot be overwritten.
      if (existing[index * 2].exists || existing[index * 2 + 1].exists) continue;
      const analysis = { ...item, publishedAt: now.toISOString(), publishedDate: localDate(now), publishedTime,
        automation: 'daily-picks', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
      transaction.create(db.collection('dailyAnalyses').doc(item.id), analysis);
      if (item.access === 'FREE') {
        const { vipAnalysis, ...free } = analysis;
        transaction.set(db.collection('freeDailyAnalyses').doc(item.id), free);
      } else transaction.set(db.collection('publicDailyAnalyses').doc(item.id), lockedDailyIndex(item));
      const ticket = analysisTicket(analysis as unknown as DailyAnalysisItem);
      transaction.create(db.collection('tickets').doc(ticket.id), ticket);
      transaction.set(db.collection('publicTickets').doc(ticket.id), mapTicketForPublic(ticket));
      reserved.set(item.id, { id: item.id, fixtureId: item.fixtureId!, access: item.access });
      saved++;
    }
    // Reservations survive admin deletion: the scheduler does not recreate a removed pick that day.
    transaction.set(manifestRef, { published: [...reserved.values()], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { saved, fetched: candidates.length, skippedManualOverride: snapshot.docs.filter((doc) => doc.data().manualOverride).length };
  });
}
