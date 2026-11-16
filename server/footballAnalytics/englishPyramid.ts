export const HISTORICAL_SEASONS = ['2023/24', '2024/25', '2025/26', '2026/27'] as const;
export const ENGLISH_PYRAMID = [
  { id: 'premier-league', name: 'Premier League', tier: 1, openfootball: '1-premierleague', footballData: 'PL', aliases: ['English Premier League', 'EPL'] },
  { id: 'championship', name: 'Championship', tier: 2, openfootball: '2-championship', footballData: 'ELC', aliases: ['English Championship', 'EFL Championship'] },
  { id: 'league-one', name: 'League One', tier: 3, openfootball: '3-league1', aliases: ['English League One', 'League 1', 'EFL League One'] },
  { id: 'league-two', name: 'League Two', tier: 4, openfootball: '4-league2', aliases: ['English League Two', 'League 2', 'EFL League Two'] },
  { id: 'national-league', name: 'National League', tier: 5, openfootball: '5-nationalleague', aliases: ['English National League', 'Conference National', 'Vanarama National League'] },
  { id: 'national-league-north', name: 'National League North', tier: 6, aliases: ['Conference North', 'Vanarama National League North'] },
  { id: 'national-league-south', name: 'National League South', tier: 6, aliases: ['Conference South', 'Vanarama National League South'] },
  { id: 'isthmian-premier', name: 'Isthmian Premier', tier: 7, aliases: ['Isthmian League Premier Division', 'Isthmian League - Premier Division'] },
  { id: 'northern-premier', name: 'Northern Premier', tier: 7, aliases: ['Northern Premier League Premier Division', 'Northern Premier League - Premier Division'] },
  { id: 'southern-premier-central', name: 'Southern Premier Central', tier: 7, aliases: ['Southern League Premier Central', 'Southern League - Premier Central'] },
  { id: 'southern-premier-south', name: 'Southern Premier South', tier: 7, aliases: ['Southern League Premier South', 'Southern League - Premier South'] },
] as const;
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
export const englishLeague = (value = '') => ENGLISH_PYRAMID.find(league =>
  [league.id, league.name, ...league.aliases].some(name => key(name) === key(value)));
export function historicalSeason(value: string) {
  const found = value.match(/^(20\d{2})[/-](?:20)?(\d{2})$/);
  if (!found || Number(found[2]) !== (Number(found[1]) + 1) % 100) return null;
  const season = `${found[1]}/${found[2]}`;
  return (HISTORICAL_SEASONS as readonly string[]).includes(season) ? season : null;
}
export function validHistoricalDate(date: string, season: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return false;
  const start = Number(season.slice(0, 4));
  return date >= `${start}-07-01` && date < `${start + 1}-07-01`;
}
const clubAliases: Record<string, string> = {
  manutd: 'Manchester United', manchesterutd: 'Manchester United',
  mancity: 'Manchester City', spurs: 'Tottenham Hotspur', tottenham: 'Tottenham Hotspur',
  wolves: 'Wolverhampton Wanderers', westbrom: 'West Bromwich Albion', westbromwich: 'West Bromwich Albion',
  qpr: 'Queens Park Rangers', sheffutd: 'Sheffield United', sheffieldutd: 'Sheffield United',
  sheffwed: 'Sheffield Wednesday', nottmforest: 'Nottingham Forest', nottsforest: 'Nottingham Forest',
  mkdons: 'Milton Keynes Dons', brighton: 'Brighton & Hove Albion',
};
export function englishClubName(value: string) {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return clubAliases[key(trimmed.replace(/\b(fc|afc)\b/gi, ''))] || trimmed;
}
