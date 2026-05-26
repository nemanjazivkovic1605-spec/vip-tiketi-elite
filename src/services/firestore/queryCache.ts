type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

export const getCachedQuery = <T>(key: string, loader: () => Promise<T>, ttlMs = 15000): Promise<T> => {
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > Date.now()) {
    return existing.promise;
  }

  const promise = loader().catch((error) => {
    if (cache.get(key)?.promise === promise) {
      cache.delete(key);
    }
    throw error;
  });

  cache.set(key, {
    expiresAt: Date.now() + ttlMs,
    promise,
  });

  return promise;
};

export const invalidateCachedQueries = (...keys: string[]) => {
  keys.forEach((key) => cache.delete(key));
};
