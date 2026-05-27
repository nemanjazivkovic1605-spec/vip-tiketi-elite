import type { DailyAnalysisItem, DailyAnalysisStatus } from '../types';
import { getDailyPublicationMeta } from './dailyPublication';

const DAILY_TIMEZONE = 'Europe/Belgrade';

const todayInDailyTimezone = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: DAILY_TIMEZONE }).format(new Date());

const normalizeDailyStatusValue = (status?: string): DailyAnalysisStatus => {
  const normalized = String(status || 'ACTIVE').trim().toUpperCase();

  if (['ACTIVE', 'PENDING', 'OPEN', 'UNRESOLVED', 'IN_PROGRESS'].includes(normalized)) return 'ACTIVE';
  if (['WON', 'PROŠAO', 'PROSAO', 'PROSLO', 'FINISHED', 'COMPLETED', 'DONE'].includes(normalized)) return 'WON';
  if (['LOST', 'PAO', 'PALO', 'FAILED'].includes(normalized)) return 'LOST';
  if (['POSTPONED', 'ODLOŽENO', 'ODLOZEN', 'DELAYED'].includes(normalized)) return 'POSTPONED';
  if (['REFUND', 'VOID', 'PUSH', 'RETURN', 'DRAW'].includes(normalized)) return 'REFUND';
  if (['HIDDEN', 'SAKRIVENO'].includes(normalized)) return 'HIDDEN';

  return 'ACTIVE';
};

export const normalizeDailyAnalysisStatus = (status?: string): DailyAnalysisStatus =>
  normalizeDailyStatusValue(status);

export const isFinishedDailyAnalysisStatus = (status?: string) => {
  const normalized = normalizeDailyAnalysisStatus(status);
  return normalized !== 'ACTIVE' && normalized !== 'HIDDEN';
};

export const isVisibleInDailyFeed = (
  analysis: Pick<DailyAnalysisItem, 'status' | 'date' | 'publishedDate' | 'publishedTime' | 'publishTime' | 'publishedAt' | 'createdAt'>,
) =>
  analysis.status === 'ACTIVE'
  || (analysis.status === 'WON' && getDailyPublicationMeta(analysis).publishedDate === todayInDailyTimezone());

export const isVisibleInAdminActiveDailyList = (
  analysis: Pick<DailyAnalysisItem, 'status' | 'enabled' | 'hidden'>,
) => {
  const normalizedStatus = normalizeDailyAnalysisStatus(analysis.status as string | undefined);
  return analysis.enabled && !analysis.hidden && (normalizedStatus === 'ACTIVE' || normalizedStatus === 'POSTPONED');
};
