import type { AnalyticsDatabase } from './database.js';
import type { AnalyticsMatch } from '../../src/types/footballAnalytics.js';
import { ENGLISH_PYRAMID, HISTORICAL_SEASONS } from './englishPyramid.js';
import { leagueKey } from './normalization.js';

// Shared read model. Published tickets and test environments never enter this dataset.
export async function readEnglishMatches(db: AnalyticsDatabase): Promise<AnalyticsMatch[]> {
  const ids = ENGLISH_PYRAMID.map(league => leagueKey(league.name, 'England'));
  const seasons = HISTORICAL_SEASONS.map((_, index) => `$${ids.length + index + 2}`).join(',');
  const rows = await db.query(`SELECT payload,checked_at FROM fa_matches WHERE environment=$1 AND league_id IN (${ids.map((_, index) => `$${index + 2}`).join(',')}) AND season IN (${seasons}) ORDER BY kickoff_at DESC,id LIMIT 50001`, ['real', ...ids, ...HISTORICAL_SEASONS]);
  if (rows.length > 50000) throw new Error('Analitički obim zahteva uži SQL zbirni pregled.');
  return rows.map(row => ({ ...JSON.parse(row.payload), ...(row.checked_at ? { lastCheckedAt: row.checked_at } : {}) }) as AnalyticsMatch)
    .filter(row => row.environment === 'real' && (HISTORICAL_SEASONS as readonly string[]).includes(row.season));
}
