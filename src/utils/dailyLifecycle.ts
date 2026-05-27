import type { DailyAnalysisItem, DailyAnalysisStatus } from '../types';
import { getDailyPublicationMeta } from './dailyPublication';

const DAILY_TIMEZONE = 'Europe/Belgrade';

const todayInDailyTimezone = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: DAILY_TIMEZONE }).format(new Date());

export const isFinishedDailyAnalysisStatus = (status?: DailyAnalysisStatus) =>
  status !== undefined && status !== 'ACTIVE' && status !== 'HIDDEN';

export const isVisibleInDailyFeed = (
  analysis: Pick<DailyAnalysisItem, 'status' | 'date' | 'publishedDate' | 'publishedTime' | 'publishTime' | 'publishedAt' | 'createdAt'>,
) =>
  analysis.status === 'ACTIVE'
  || (analysis.status === 'WON' && getDailyPublicationMeta(analysis).publishedDate === todayInDailyTimezone());
