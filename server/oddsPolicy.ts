export const ODDS_CACHE_TTL_MS = 5 * 60_000;
export const MAX_ODDS_AGE_MS = 15 * 60_000;

export const isFreshOddsTimestamp = (timestamp: string | undefined, now = new Date()) => {
  if (!timestamp) return false;
  const quotedAt = Date.parse(timestamp);
  return Number.isFinite(quotedAt) && quotedAt <= now.getTime() + 60_000
    && now.getTime() - quotedAt <= MAX_ODDS_AGE_MS;
};
