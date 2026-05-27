import type { DailyAnalysisItem } from '../types';

const pad2 = (value: number) => String(value).padStart(2, '0');

const localParts = (date: Date) => ({
  date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
  time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
});

export const createDailyPublicationMeta = (date = new Date()) => {
  const local = localParts(date);
  return {
    publishedAt: date.toISOString(),
    publishedDate: local.date,
    publishedTime: local.time,
    publishTime: local.time,
  };
};

export const buildDailyPublishedAt = (publishedDate: string, publishedTime: string) =>
  new Date(`${publishedDate}T${publishedTime}:00`).toISOString();

export const dailyPublicationMetaFromInput = (value: string) => {
  const [publishedDate, rawTime = '12:00'] = value.split('T');
  const publishedTime = rawTime.slice(0, 5);
  return {
    publishedDate,
    publishedTime,
    publishTime: publishedTime,
    publishedAt: buildDailyPublishedAt(publishedDate, publishedTime),
  };
};

export const getDailyPublicationMeta = (
  item: Pick<DailyAnalysisItem, 'date' | 'publishedAt' | 'publishedDate' | 'publishedTime' | 'publishTime' | 'createdAt'>,
) => {
  const existingDate = item.publishedAt || item.createdAt;
  if (existingDate) {
    const parsed = new Date(existingDate);
    if (Number.isFinite(parsed.getTime())) {
      return {
        ...createDailyPublicationMeta(parsed),
        publishedDate: item.publishedDate || createDailyPublicationMeta(parsed).publishedDate,
        publishedTime: item.publishedTime || item.publishTime || createDailyPublicationMeta(parsed).publishedTime,
        publishTime: item.publishTime || item.publishedTime || createDailyPublicationMeta(parsed).publishedTime,
        publishedAt: item.publishedAt || parsed.toISOString(),
      };
    }
  }

  const publishedDate = item.publishedDate || item.date;
  const publishedTime = item.publishedTime || item.publishTime || '12:00';
  return {
    publishedDate,
    publishedTime,
    publishTime: publishedTime,
    publishedAt: buildDailyPublishedAt(publishedDate, publishedTime),
  };
};

export const formatDailyPublishedAt = (item: Pick<DailyAnalysisItem, 'date' | 'publishedAt' | 'publishedDate' | 'publishedTime' | 'publishTime' | 'createdAt'>) => {
  const value = getDailyPublicationMeta(item).publishedAt;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return item.date;
  return date.toLocaleString('sr-Latn-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getDailyPublicationInputValue = (item: Pick<DailyAnalysisItem, 'date' | 'publishedAt' | 'publishedDate' | 'publishedTime' | 'publishTime' | 'createdAt'>) => {
  const meta = getDailyPublicationMeta(item);
  return `${meta.publishedDate}T${meta.publishedTime}`;
};

export const getKickoffTime = (item: Pick<DailyAnalysisItem, 'time' | 'matchTime' | 'kickoffTime'>) =>
  item.kickoffTime || item.matchTime || item.time;
