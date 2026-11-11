import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { DailyProposal } from '../../types';
import { getDailyAnalysisDates } from '../../utils/dailyDates';

const COLLECTION = 'dailyProposals';

export const dailyProposalsService = {
  subscribe(callback: (items: DailyProposal[]) => void, onError: (error: Error) => void) {
    const dates = getDailyAnalysisDates();
    return onSnapshot(query(collection(db, COLLECTION), where('date', '>=', dates[0].date), orderBy('date'), limit(30)),
      (snapshot) => callback(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as DailyProposal)
        .filter((item) => !item.dismissed && !item.published && dates.some((date) => date.date === item.date)
          && Date.parse(item.analysis.kickoffAt || '') > Date.now())
        .sort((a, b) => a.date.localeCompare(b.date) || a.analysis.sortOrder - b.analysis.sortOrder)), onError);
  },
  dismiss(id: string) {
    return updateDoc(doc(db, COLLECTION, id), { dismissed: true, updatedAt: new Date().toISOString() });
  },
  markPublished(id: string) {
    return updateDoc(doc(db, COLLECTION, id), { published: true, updatedAt: new Date().toISOString() });
  },
};
