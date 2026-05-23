const formatIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getDailyAnalysisDates = () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(today.getDate() + 2);

  return [
    { key: 'today', label: 'Danas', date: formatIsoDate(today) },
    { key: 'tomorrow', label: 'Sutra', date: formatIsoDate(tomorrow) },
    { key: 'dayAfterTomorrow', label: 'Prekosutra', date: formatIsoDate(dayAfterTomorrow) },
  ] as const;
};
