import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Tip } from '../../types';
import { preparePublicStatsUpdate } from '../../utils/publicStats';

export const updatePublicStatsTicket = (id: string, ticket: Tip | null) => runTransaction(db, async (transaction) => {
  const reference = (path: string) => doc(db, path);
  const applyStats = await preparePublicStatsUpdate(transaction, reference, id, ticket);
  if (ticket) transaction.set(reference(`publicStatsTickets/${id}`), ticket);
  else transaction.delete(reference(`publicStatsTickets/${id}`));
  applyStats(transaction);
});
