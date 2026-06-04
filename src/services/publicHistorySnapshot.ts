import { type Tip } from '../types';

const PUBLIC_HISTORY_SNAPSHOT_PATH = '/public-history-snapshot.json';
const PUBLIC_HISTORY_CACHE_KEY = 'eliteVipTips:publicHistory:v1';
const PUBLIC_HISTORY_META_KEY = 'eliteVipTips:publicHistoryMeta:v1';

type PublicHistorySnapshot = {
  generatedAt: string;
  source: string;
  tips: Tip[];
};

let snapshotPromise: Promise<Tip[]> | null = null;
let refreshPromise: Promise<{ tips: Tip[]; changed: boolean }> | null = null;

export const isPublicHistorySnapshotEnabled = () =>
  import.meta.env.VITE_PUBLIC_HISTORY_SNAPSHOT_ENABLED !== 'false';

const canUseBrowserCache = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const readCachedSnapshot = (): PublicHistorySnapshot | null => {
  if (!canUseBrowserCache()) return null;
  try {
    const raw = window.localStorage.getItem(PUBLIC_HISTORY_CACHE_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as PublicHistorySnapshot;
    return Array.isArray(snapshot.tips) ? snapshot : null;
  } catch {
    return null;
  }
};

const writeCachedSnapshot = (snapshot: PublicHistorySnapshot) => {
  if (!canUseBrowserCache()) return;
  try {
    window.localStorage.setItem(PUBLIC_HISTORY_CACHE_KEY, JSON.stringify(snapshot));
    window.localStorage.setItem(PUBLIC_HISTORY_META_KEY, JSON.stringify({
      generatedAt: snapshot.generatedAt,
      count: snapshot.tips.length,
      cachedAt: new Date().toISOString(),
    }));
  } catch {
    // If browser storage is full or disabled, the CDN snapshot still works.
  }
};

const fetchPublicHistorySnapshot = async (cacheMode: RequestCache): Promise<PublicHistorySnapshot> => {
  const response = await fetch(PUBLIC_HISTORY_SNAPSHOT_PATH, { cache: cacheMode });
  if (!response.ok) {
    throw new Error(`Public history snapshot HTTP ${response.status}`);
  }
  const snapshot = await response.json() as PublicHistorySnapshot;
  return {
    ...snapshot,
    tips: Array.isArray(snapshot.tips) ? snapshot.tips : [],
  };
};

export const refreshPublicHistorySnapshot = async (): Promise<{ tips: Tip[]; changed: boolean }> => {
  if (!isPublicHistorySnapshotEnabled()) return { tips: [], changed: false };
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetchPublicHistorySnapshot('no-cache')
    .then((snapshot) => {
      const cached = readCachedSnapshot();
      const changed = !cached
        || cached.generatedAt !== snapshot.generatedAt
        || cached.tips.length !== snapshot.tips.length;
      if (changed) writeCachedSnapshot(snapshot);
      return { tips: snapshot.tips, changed };
    })
    .catch((error) => {
      console.warn('Public history snapshot refresh failed.', error);
      return { tips: [], changed: false };
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
};

export const readPublicHistorySnapshot = async (): Promise<Tip[]> => {
  if (!isPublicHistorySnapshotEnabled()) return [];
  if (snapshotPromise) return snapshotPromise;

  const cached = readCachedSnapshot();
  if (cached?.tips.length) {
    void refreshPublicHistorySnapshot();
    return cached.tips;
  }

  snapshotPromise = fetchPublicHistorySnapshot('force-cache')
    .then((snapshot) => {
      if (snapshot.tips.length) writeCachedSnapshot(snapshot);
      return snapshot.tips;
    })
    .catch((error) => {
      snapshotPromise = null;
      console.warn('Public history snapshot is not available. Falling back to Firestore.', error);
      return [];
    });

  return snapshotPromise;
};
