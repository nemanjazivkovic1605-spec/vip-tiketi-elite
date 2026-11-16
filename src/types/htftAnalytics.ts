import type { AnalyticsMatch } from './footballAnalytics';
import type { HistoricalAggregate, HistoricalFilters } from './historicalAnalytics';

export const HTFT_CODES = ['2/1', '1/2', '2/X', '1/X', 'X/1', 'X/2', '1/1', '2/2', 'X/X'] as const;
export type HtftCode = typeof HTFT_CODES[number];
export type HtftRole = 'made' | 'conceded';
export type HtftSort = 'name' | 'played' | 'twoOne' | 'oneTwo' | 'total' | 'rate' | 'last' | 'selected';
export type HtftFilters = HistoricalFilters & { transition?: HtftCode; role?: HtftRole; search?: string; sort?: HtftSort; direction?: 'asc' | 'desc'; offset?: number };
export type HtftCounts = {
  played: number; sample: number; missingHt: number;
  made21: number; made12: number; made: number; madePercent: number | null;
  conceded21: number; conceded12: number; conceded: number; concededPercent: number | null;
  droppedLead: number; recoveredDraw: number; wonFromDraw: number;
  transitions: Array<{ code: HtftCode; count: number; percent: number | null }>;
};
export type HtftAppearance = {
  match: AnalyticsMatch; code: HtftCode | null; venue: 'home' | 'away'; opponent: string;
  madeComeback: boolean; concededComeback: boolean; droppedLead: boolean; recoveredDraw: boolean; wonFromDraw: boolean;
};
export type HtftRankRow = HtftCounts & {
  id: string; name: string; leagues: string[]; position: number; selectedCount: number; selectedPercent: number | null;
  last: { date: string; code: HtftCode; opponent: string; madeComeback: boolean; concededComeback: boolean } | null;
};
export type HtftCatalog = Array<{ id: string; name: string; tier: number }>;
export type HtftRanking = {
  catalog: HtftCatalog; seasons: string[]; aggregate: HistoricalAggregate;
  rows: HtftRankRow[]; totalTeams: number; hasMore: boolean; offset: number;
  leaders: { twoOne: Array<{ id: string; name: string; count: number }>; oneTwo: Array<{ id: string; name: string; count: number }> };
};
export type HtftTransitionPage = { catalog: HtftCatalog; code: HtftCode; count: number; sample: number; percent: number | null; aggregate: HistoricalAggregate; matches: AnalyticsMatch[]; offset: number; hasMore: boolean };
export type HtftTeamDetail = {
  catalog: HtftCatalog; id: string; name: string; counts: HtftCounts; currentSeason: string;
  seasons: Array<HtftCounts & { season: string }>;
  matches: HtftAppearance[]; total: number; offset: number; hasMore: boolean;
};
export type HtftTeamPreview = { id: string; name: string; all: HtftCounts; last5: HtftCounts; last10: HtftCounts; season: HtftCounts };
export type HtftMatchPreview = {
  match: AnalyticsMatch; season: string; home: HtftTeamPreview; away: HtftTeamPreview;
  h2h: AnalyticsMatch[]; h2hSample: number; h2hTransitions: HistoricalAggregate['htft']; asOf: string;
};
export type HtftScheduleCoverage = { id: string; name: string; tier: number; fixtures: number; seasonMatches: number; overdueUnresolved: number; latestResultDate: string | null; checkedAt: string | null; reason: string };
export type HtftSchedule = {
  from: string; to: string; catalog: HtftCatalog; matches: AnalyticsMatch[]; total: number; hasMore: boolean; offset: number;
  coverage: HtftScheduleCoverage[]; lastSync: string | null; syncEnabled: boolean;
};
