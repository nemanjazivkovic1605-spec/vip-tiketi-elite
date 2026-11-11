import type { Firestore } from 'firebase-admin/firestore';
import type { DailyProposal } from '../src/types.js';
import { teamKey } from './freeFootballFeeds.js';

export const proposalMatchKey = (item: DailyProposal['analysis']) =>
  `${teamKey(item.homeTeam)}:${teamKey(item.awayTeam)}:${item.date}:${(item.kickoffTime || item.time || '').slice(0, 5)}`;

export async function saveDailyProposals(db: Firestore, date: string, proposals: DailyProposal[]) {
  const unique = [...new Map(proposals.filter((item) => item.date === date).map((item) => [item.id, item])).values()].slice(0, 10);
  if (!unique.length) return { saved: 0, existing: 0 };
  return db.runTransaction(async (transaction) => {
    const published = await transaction.get(db.collection('dailyAnalyses').where('date', '==', date).limit(100));
    const dayProposals = await transaction.get(db.collection('dailyProposals').where('date', '==', date).limit(10));
    const existingKeys = new Set(published.docs.map((doc) => proposalMatchKey(doc.data() as DailyProposal['analysis'])));
    const refs = unique.map((item) => db.collection('dailyProposals').doc(item.id));
    const snapshots = await transaction.getAll(...refs);
    let saved = 0;
    unique.forEach((proposal, index) => {
      // Repeated pulls never overwrite a proposal, manual edit, publication or dismissal.
      if (dayProposals.size + saved >= 10 || snapshots[index].exists || existingKeys.has(proposalMatchKey(proposal.analysis))) return;
      transaction.create(refs[index], JSON.parse(JSON.stringify(proposal)));
      saved++;
    });
    return { saved, existing: unique.length - saved };
  });
}
