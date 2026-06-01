process.env.HISTORY_START_DATE = '2026-05-01';
process.env.HISTORY_END_DATE = '2026-05-31';
process.env.HISTORY_PREFIX = 'history-may-fill-real-2026-';
process.env.HISTORY_DAYS = '31';
process.env.SKIP_DATES_WITH_EXISTING_PUBLIC_STATS = 'true';
process.env.DELETE_STALE_PREFIX_DOCUMENTS = 'false';
process.env.INDEX_PRIVATE_SETTLED_MISSING_PUBLIC_STATS = 'true';

await import('./realize-april-2026-history');
