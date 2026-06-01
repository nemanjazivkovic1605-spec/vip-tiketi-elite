import { type Tip } from '../types';

const PUBLIC_HISTORY_SNAPSHOT_PATH = '/public-history-snapshot.json';

type PublicHistorySnapshot = {
  generatedAt: string;
  source: string;
  tips: Tip[];
};

let snapshotPromise: Promise<Tip[]> | null = null;

export const isPublicHistorySnapshotEnabled = () =>
  import.meta.env.VITE_PUBLIC_HISTORY_SNAPSHOT_ENABLED !== 'false';

export const readPublicHistorySnapshot = async (): Promise<Tip[]> => {
  if (!isPublicHistorySnapshotEnabled()) return [];
  if (snapshotPromise) return snapshotPromise;

  snapshotPromise = fetch(PUBLIC_HISTORY_SNAPSHOT_PATH, { cache: 'force-cache' })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Public history snapshot HTTP ${response.status}`);
      }

      const snapshot = await response.json() as PublicHistorySnapshot;
      return Array.isArray(snapshot.tips) ? snapshot.tips : [];
    })
    .catch((error) => {
      snapshotPromise = null;
      console.warn('Public history snapshot is not available. Falling back to Firestore.', error);
      return [];
    });

  return snapshotPromise;
};
