process.env.HISTORY_START_DATE = '2025-08-01';
process.env.HISTORY_END_DATE = '2025-08-31';
process.env.HISTORY_PREFIX = 'history-august-real-2025-';
process.env.HISTORY_DAYS = '31';
process.env.REPLACE_SETTLED_HISTORY_RANGE = 'true';
process.env.HISTORY_VIP_TARGET_ODDS = '1.65';

await import('./realize-april-2026-history');
