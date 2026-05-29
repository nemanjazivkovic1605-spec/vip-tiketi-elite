const DAILY_TIMEZONE = 'Europe/Belgrade';

const formatIsoDate = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: DAILY_TIMEZONE }).format(date);

const addDaysToIsoDate = (isoDate: string, days: number) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return formatIsoDate(date);
};

export const getDailyAnalysisDates = () => {
  const today = formatIsoDate(new Date());
  const tomorrow = addDaysToIsoDate(today, 1);
  const dayAfterTomorrow = addDaysToIsoDate(today, 2);

  return [
    { key: 'today', label: 'Danas', date: today },
    { key: 'tomorrow', label: 'Sutra', date: tomorrow },
    { key: 'dayAfterTomorrow', label: 'Prekosutra', date: dayAfterTomorrow },
  ] as const;
};
