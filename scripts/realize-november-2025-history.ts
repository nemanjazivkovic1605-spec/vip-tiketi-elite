process.env.HISTORY_START_DATE = '2025-11-01';
process.env.HISTORY_END_DATE = '2025-11-30';
process.env.HISTORY_PREFIX = 'history-november-real-2025-';
process.env.HISTORY_DAYS = '30';
process.env.REPLACE_SETTLED_HISTORY_RANGE = 'true';

await import('./realize-april-2026-history');
