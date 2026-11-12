const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthFormatter = new Intl.DateTimeFormat('sr-Latn-RS', {
  month: 'long', year: 'numeric', timeZone: 'Europe/Belgrade',
});

export const formatHistoryMonth = (month: string) => MONTH_KEY.test(month)
  ? monthFormatter.format(new Date(`${month}-01T12:00:00Z`)) : '';

export const getHistoryMonths = (dates: readonly string[]) => [...new Set(
  dates.map(date => date.slice(0, 7)).filter(month => MONTH_KEY.test(month)),
)].sort((a, b) => b.localeCompare(a)).map(value => ({ value, label: formatHistoryMonth(value) }));

export const isInHistoryMonth = (date: string, month: string) => month === 'all'
  || MONTH_KEY.test(month) && date.slice(0, 7) === month;
