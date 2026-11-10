import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { GlobalStats, TicketProductType } from '../types';
import { STATS_SCHEMA, STATS_SUMMARY_PATH, type PublicStatsSummary } from '../utils/publicStats';
import { withTimeout } from '../utils/async';

type Summary = Omit<PublicStatsSummary, 'schemaVersion' | 'version' | 'months'> & Partial<Pick<PublicStatsSummary, 'schemaVersion' | 'version' | 'months'>>;
let cached: Summary | null = null;
let expiresAt = 0;
let pending: Promise<Summary | null> | null = null;
let stopListener: (() => void) | undefined;
let observedVersion = '';
const subscribers = new Set<() => void>();
const CACHE_KEY = 'elite:public-stats:v1';

const valid = (value: any): value is Summary => value?.all && typeof value.all.completedCount === 'number' && value.categories;
const remember = (value: Summary) => {
  const changed = cached?.generatedAt !== value.generatedAt || cached?.version !== value.version;
  cached = value;
  expiresAt = Date.now() + 30000;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch { /* Storage can be disabled. */ }
  if (changed) subscribers.forEach((subscriber) => subscriber());
  return value;
};
try {
  const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  if (valid(value) && value.schemaVersion === STATS_SCHEMA) cached = value;
} catch { /* Use the server/CDN when storage is unavailable. */ }

export const readPublicStatsSummary = (): Promise<Summary | null> => {
  if (cached && expiresAt > Date.now()) return Promise.resolve(cached);
  if (pending) return cached ? Promise.resolve(cached) : pending;
  const fallback = async () => {
    if (cached) return cached;
    const response = await fetch('/public-stats-summary.json', { cache: 'no-cache' });
    const value = response.ok ? await response.json() : null;
    return valid(value) ? remember(value) : null;
  };
  pending = withTimeout(getDoc(doc(db, STATS_SUMMARY_PATH)), 'Public stats timeout.', 6000).then(async (snapshot) => {
    const data = snapshot.data();
    return valid(data) && data.schemaVersion === STATS_SCHEMA ? remember(data) : fallback();
  }).catch(async (error) => {
    console.warn('Public aggregate read failed; keeping the last public cache.', error);
    return fallback().catch(() => cached);
  }).finally(() => { pending = null; });
  return cached ? Promise.resolve(cached) : pending;
};

export const subscribePublicStatsSummary = (callback: () => void) => {
  subscribers.add(callback);
  if (!stopListener) stopListener = onSnapshot(doc(db, STATS_SUMMARY_PATH), (snapshot) => {
    const value = snapshot.data();
    if (!valid(value) || value.schemaVersion !== STATS_SCHEMA) return;
    const version = `${value.version}:${value.generatedAt}`;
    if (version === observedVersion) return;
    observedVersion = version;
    remember(value);
  }, (error) => console.warn('Public aggregate subscription failed.', error));
  return () => {
    subscribers.delete(callback);
    if (!subscribers.size) { stopListener?.(); stopListener = undefined; observedVersion = ''; }
  };
};

export const getStatsFromSummary = async (filter: 'all' | TicketProductType = 'all'): Promise<GlobalStats | null> => {
  const summary = await readPublicStatsSummary();
  return summary ? filter === 'all' ? summary.all : summary.categories[filter] || null : null;
};
