import { createHash } from 'node:crypto';
import { englishClubName } from '../englishPyramid.js';
import { leagueKey, nameKey, completeScore } from '../normalization.js';
import { historicalTransition } from '../historicalStats.js';
import type { AnalyticsMatch, ScorePair } from '../../../src/types/footballAnalytics.js';

export const FOOTBALL_DATA_LEAGUES: Record<string, { name: string; country: string; tier: number }> = {
  E0: { name: 'Premier League', country: 'England', tier: 1 }, E1: { name: 'Championship', country: 'England', tier: 2 },
  E2: { name: 'League One', country: 'England', tier: 3 }, E3: { name: 'League Two', country: 'England', tier: 4 },
  EC: { name: 'National League', country: 'England', tier: 5 },
  SC0: { name: 'Scottish Premiership', country: 'Scotland', tier: 1 }, SC1: { name: 'Scottish Championship', country: 'Scotland', tier: 2 },
  SC2: { name: 'Scottish League One', country: 'Scotland', tier: 3 }, SC3: { name: 'Scottish League Two', country: 'Scotland', tier: 4 },
  D1: { name: 'Bundesliga', country: 'Germany', tier: 1 }, D2: { name: '2. Bundesliga', country: 'Germany', tier: 2 },
  I1: { name: 'Serie A', country: 'Italy', tier: 1 }, I2: { name: 'Serie B', country: 'Italy', tier: 2 },
  SP1: { name: 'La Liga', country: 'Spain', tier: 1 }, SP2: { name: 'Segunda Division', country: 'Spain', tier: 2 },
  F1: { name: 'Ligue 1', country: 'France', tier: 1 }, F2: { name: 'Ligue 2', country: 'France', tier: 2 },
  B1: { name: 'Belgian Pro League', country: 'Belgium', tier: 1 }, N1: { name: 'Eredivisie', country: 'Netherlands', tier: 1 },
  P1: { name: 'Primeira Liga', country: 'Portugal', tier: 1 }, T1: { name: 'Super Lig', country: 'Turkey', tier: 1 },
  G1: { name: 'Super League Greece', country: 'Greece', tier: 1 },
};
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function archiveDate(value: string): string | null {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  const european = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})$/);
  if (!iso && !european) return null;
  let year = Number(iso?.[1] || european![3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const date = `${year}-${String(Number(iso?.[2] || european![2])).padStart(2, '0')}-${String(Number(iso?.[3] || european![1])).padStart(2, '0')}`;
  return year >= 1870 && year <= 2100 && Number.isFinite(Date.parse(`${date}T12:00:00Z`))
    && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date ? date : null;
}
export function inferArchiveSeason(dates: string[]): string | null {
  if (!dates.length) return null;
  const counts = new Map<number, number>();
  for (const date of dates) {
    const start = Number(date.slice(0, 4)) - Number(Number(date.slice(5, 7)) < 7);
    counts.set(start, (counts.get(start) || 0) + 1);
  }
  const [start, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  // A file is a season dataset. This retains the delayed July/August 2020 fixtures in 2019/20.
  if (count / dates.length < .6 || dates.some(date => date < `${start}-07-01` || date >= `${start + 1}-09-01`)) return null;
  return `${start}/${String(start + 1).slice(-2)}`;
}
const aliases: Record<string, Record<string, string>> = {
  England: { leeds: 'Leeds United', forestgreen: 'Forest Green Rovers', nottscounty: 'Notts County',
    southend: 'Southend United', hartlepool: 'Hartlepool United', cambridge: 'Cambridge United',
    oxford: 'Oxford United', peterboro: 'Peterborough United', peterborough: 'Peterborough United',
    rotherham: 'Rotherham United', shrewsbury: 'Shrewsbury Town', yeovil: 'Yeovil Town',
    bristolrovers: 'Bristol Rovers', mansfield: 'Mansfield Town', huddersfield: 'Huddersfield Town',
    luton: 'Luton Town', ipswich: 'Ipswich Town', norwich: 'Norwich City', stoke: 'Stoke City',
    birmingham: 'Birmingham City', coventry: 'Coventry City', swansea: 'Swansea City',
    cardiff: 'Cardiff City', leicester: 'Leicester City', hull: 'Hull City', bradford: 'Bradford City',
    swindon: 'Swindon Town', accrington: 'Accrington Stanley', grimsby: 'Grimsby Town',
    wimbledon: 'AFC Wimbledon', chesterfield: 'Chesterfield', manunited: 'Manchester United',
    sheffweds: 'Sheffield Wednesday', bolton: 'Bolton Wanderers', blackburn: 'Blackburn Rovers',
    charlton: 'Charlton Athletic', crewe: 'Crewe Alexandra', doncaster: 'Doncaster Rovers', oldham: 'Oldham Athletic',
    preston: 'Preston North End', tranmere: 'Tranmere Rovers', wigan: 'Wigan Athletic', northampton: 'Northampton Town',
    crawley: 'Crawley Town', cheltenham: 'Cheltenham Town', torquay: 'Torquay United', york: 'York City',
    dagred: 'Dagenham & Redbridge', kidderminster: 'Kidderminster Harriers' },
  Germany: { bayernmunich: 'Bayern Munich', bayernmunchen: 'Bayern Munich', bayernmuenchen: 'Bayern Munich',
    dortmund: 'Borussia Dortmund', mgladbach: 'Borussia Monchengladbach', borussiamonchengladbach: 'Borussia Monchengladbach',
    borussiamonchengladbach1899: 'Borussia Monchengladbach', schalke04: 'Schalke 04', schalke: 'Schalke 04',
    mainz: 'Mainz 05', mainz05: 'Mainz 05', leverkusen: 'Bayer Leverkusen', koln: 'FC Koln',
    cologne: 'FC Koln', '1koln': 'FC Koln', hertha: 'Hertha BSC', herthaberlin: 'Hertha BSC', dusseldorf: 'Fortuna Dusseldorf',
    stuttgart: 'VfB Stuttgart', hamburg: 'Hamburger SV', hannover: 'Hannover 96', hannover96: 'Hannover 96',
    bielefeld: 'Arminia Bielefeld', greutherfurth: 'Greuther Furth', paderborn: 'SC Paderborn 07',
    darmstadt: 'SV Darmstadt 98', heidenheim: 'FC Heidenheim 1846', kiel: 'Holstein Kiel', leipzig: 'RB Leipzig',
    munich1860: 'TSV 1860 Munich', karlsruhe: 'Karlsruher SC', braunschweig: 'Eintracht Braunschweig',
    nurnberg: 'FC Nurnberg', '1nurnberg': 'FC Nurnberg', '1mainz05': 'Mainz 05',
    kaiserslautern: 'FC Kaiserslautern', '1kaiserslautern': 'FC Kaiserslautern' },
  Spain: { athmadrid: 'Atletico Madrid', atleticomadrid: 'Atletico Madrid', athbilbao: 'Athletic Club',
    athleticbilbao: 'Athletic Club', lacoruna: 'Deportivo La Coruna', sociedad: 'Real Sociedad' },
};
export function archiveTeamName(value: string, country: string) {
  const clean = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  const english = country === 'England' ? englishClubName(clean) : clean;
  return aliases[country]?.[nameKey(english)] || english;
}
export function archiveIdentity(league: { name: string; country: string }, date: string, home: string, away: string) {
  return sha256([leagueKey(league.name, league.country), date,
    nameKey(archiveTeamName(home, league.country)), nameKey(archiveTeamName(away, league.country))].join('|'));
}
export type ArchiveMatch = {
  key: string; division: string; league: { name: string; country: string; tier: number }; season: string;
  date: string; time: string | null; timeZone: null; homeTeam: string; awayTeam: string;
  ft: ScorePair; ht: ScorePair; transition: string | null; warnings: string[];
};
export const archiveScore = (value: string | undefined): number | null => value?.trim()
  && /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const outcome = (score: ScorePair) => score.home! > score.away! ? 'H' : score.home! < score.away! ? 'A' : 'D';
export function normalizeArchiveMatch(row: Record<string, string>, season: string | null, fallbackDivision: string, asOf: string): ArchiveMatch {
  const division = (row.Div || fallbackDivision).trim().toUpperCase(), league = FOOTBALL_DATA_LEAGUES[division];
  if (!league) throw new Error('unknown_league');
  const date = archiveDate(row.Date || '');
  if (!date) throw new Error('invalid_date');
  if (!season || date < `${season.slice(0, 4)}-07-01` || date >= `${Number(season.slice(0, 4)) + 1}-09-01`) throw new Error('unresolved_season');
  const homeTeam = archiveTeamName(row.HomeTeam || '', league.country), awayTeam = archiveTeamName(row.AwayTeam || '', league.country);
  if (!homeTeam || !awayTeam || nameKey(homeTeam) === nameKey(awayTeam)) throw new Error('invalid_teams');
  const ft = { home: archiveScore(row.FTHG ?? row.HG), away: archiveScore(row.FTAG ?? row.AG) };
  let ht = { home: archiveScore(row.HTHG), away: archiveScore(row.HTAG) };
  const warnings: string[] = [];
  if (completeScore(ft) && date > asOf) throw new Error('future_result');
  const ftr = (row.FTR || row.Res || '').trim();
  if (completeScore(ft) && ftr && ftr !== outcome(ft)) throw new Error('inconsistent_ft_result');
  if (completeScore(ht) && (completeScore(ft) && (ht.home! > ft.home! || ht.away! > ft.away!)
    || row.HTR?.trim() && row.HTR.trim() !== outcome(ht))) {
    warnings.push('inconsistent_ht'); ht = { home: null, away: null };
  }
  const rawTime = row.Time?.trim() || '', time = /^([01]?\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime.padStart(5, '0') : null;
  if (rawTime && !time) warnings.push('invalid_time');
  const match: ArchiveMatch = { key: archiveIdentity(league, date, homeTeam, awayTeam), division, league, season,
    date, time, timeZone: null, homeTeam, awayTeam, ft, ht, transition: null, warnings };
  match.transition = transitionForArchive(match);
  return match;
}
export function transitionForArchive(match: Pick<ArchiveMatch, 'ft' | 'ht'>) {
  return historicalTransition({ environment: 'real', status: 'finished', ft: match.ft, ht: match.ht } as AnalyticsMatch);
}
