process.env.HISTORY_START_DATE = '2025-12-01';
process.env.HISTORY_END_DATE = '2025-12-31';
process.env.HISTORY_PREFIX = 'history-december-real-2025-';
process.env.HISTORY_DAYS = '31';
process.env.REPLACE_SETTLED_HISTORY_RANGE = 'true';

await import('./realize-april-2026-history');
