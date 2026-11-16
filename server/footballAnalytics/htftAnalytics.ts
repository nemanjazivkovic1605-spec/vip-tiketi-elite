import type { AnalyticsDatabase } from './database.js';
import type { AnalyticsMatch } from '../../src/types/footballAnalytics.js';
import { HTFT_CODES, type HtftAppearance, type HtftCode, type HtftCounts, type HtftFilters, type HtftMatchPreview, type HtftRanking, type HtftRole, type HtftSchedule, type HtftTeamDetail, type HtftTransitionPage } from '../../src/types/htftAnalytics.js';
import { ENGLISH_PYRAMID, HISTORICAL_SEASONS, englishLeague } from './englishPyramid.js';
import { aggregateHistorical, historicalTransition } from './historicalStats.js';
import { readEnglishMatches } from './historicalMatches.js';
import { validateHistoricalOptions } from './historicalImport.js';
import { completeScore, nameKey } from './normalization.js';
import { matchDate } from './historicalProvider.js';
import { localDate, validDate } from '../sportsApi.js';

const PAGE_SIZE = 50;
const catalog = () => ENGLISH_PYRAMID.map(({ id, name, tier }) => ({ id, name, tier }));
const newest = (a: AnalyticsMatch, b: AnalyticsMatch) => matchDate(b).localeCompare(matchDate(a)) || (b.kickoffAt || b.matchTime || '').localeCompare(a.kickoffAt || a.matchTime || '') || a.id.localeCompare(b.id);
const finished = (match: AnalyticsMatch, now: Date) => match.environment === 'real' && match.status === 'finished' && completeScore(match.ft) && !!matchDate(match) && matchDate(match) <= localDate(now);
const selectedMatches = (rows: AnalyticsMatch[], filters: HtftFilters) => rows.filter(match => (!filters.league || englishLeague(match.league.name)?.id === filters.league) && (!filters.tier || match.league.tier === filters.tier || englishLeague(match.league.name)?.tier === filters.tier) && (!filters.season || match.season === filters.season));
const percentage = (count: number, sample: number) => sample ? count / sample * 100 : null;

export function validateHtftFilters(input: HtftFilters): HtftFilters {
  const base = validateHistoricalOptions(input);
  if (input.transition && !(HTFT_CODES as readonly string[]).includes(input.transition)) throw new Error('Nepoznat HT/FT prelaz.');
  if (input.role && !['made', 'conceded'].includes(input.role)) throw new Error('Nepoznata uloga tima.');
  if (input.sort && !['name', 'played', 'twoOne', 'oneTwo', 'total', 'rate', 'last', 'selected'].includes(input.sort)) throw new Error('Nepoznato sortiranje.');
  if (input.direction && !['asc', 'desc'].includes(input.direction)) throw new Error('Nepoznat smer sortiranja.');
  if (input.offset !== undefined && (!Number.isInteger(input.offset) || input.offset < 0 || input.offset > 50000)) throw new Error('Neispravna stranica rezultata.');
  return { ...base, ...input, league: base.league, season: base.season, search: input.search?.slice(0, 100), offset: input.offset || 0 };
}

export function teamTransition(match: AnalyticsMatch, teamId: string): HtftAppearance {
  if (match.homeId !== teamId && match.awayId !== teamId) throw new Error('Tim ne učestvuje u ovoj utakmici.');
  const venue = match.homeId === teamId ? 'home' : 'away';
  const other = venue === 'home' ? 'away' : 'home';
  const code = historicalTransition(match);
  const ht = code ? Math.sign(match.ht[venue]! - match.ht[other]!) : null;
  const ft = code ? Math.sign(match.ft[venue]! - match.ft[other]!) : null;
  return { match, code, venue, opponent: match[other].name, madeComeback: ht === -1 && ft === 1, concededComeback: ht === 1 && ft === -1, droppedLead: ht === 1 && ft !== null && ft <= 0, recoveredDraw: ht === -1 && ft === 0, wonFromDraw: ht === 0 && ft === 1 };
}

export function countTeamTransitions(matches: AnalyticsMatch[], teamId: string, now = new Date()): HtftCounts {
  const played = matches.filter(match => finished(match, now) && (match.homeId === teamId || match.awayId === teamId));
  const rows = played.map(match => teamTransition(match, teamId)).filter(row => row.code !== null);
  const count = (read: (row: HtftAppearance) => boolean) => rows.filter(read).length;
  const made21 = count(row => row.code === '2/1' && row.madeComeback), made12 = count(row => row.code === '1/2' && row.madeComeback);
  const conceded21 = count(row => row.code === '2/1' && row.concededComeback), conceded12 = count(row => row.code === '1/2' && row.concededComeback);
  return { played: played.length, sample: rows.length, missingHt: played.length - rows.length,
    made21, made12, made: made21 + made12, madePercent: percentage(made21 + made12, rows.length),
    conceded21, conceded12, conceded: conceded21 + conceded12, concededPercent: percentage(conceded21 + conceded12, rows.length),
    droppedLead: count(row => row.droppedLead), recoveredDraw: count(row => row.recoveredDraw), wonFromDraw: count(row => row.wonFromDraw),
    transitions: HTFT_CODES.map(code => { const amount = count(row => row.code === code); return { code, count: amount, percent: percentage(amount, rows.length) }; }),
  };
}

function roleMatches(row: HtftAppearance, role: HtftRole) {
  if (!row.code) return false;
  if (['2/1', '1/2'].includes(row.code)) return role === 'made' ? row.madeComeback : row.concededComeback;
  if (['1/X', '2/X'].includes(row.code)) return role === 'made' ? row.recoveredDraw : row.droppedLead;
  const won = row.match.ft[row.venue]! > row.match.ft[row.venue === 'home' ? 'away' : 'home']!;
  return row.code === 'X/X' || (role === 'made' ? won : !won);
}

export function rankHtftTeams(input: AnalyticsMatch[], filters: HtftFilters = {}, now = new Date()): HtftRanking {
  const rows = selectedMatches(input, filters).filter(match => finished(match, now));
  const byTeam = new Map<string, { name: string; matches: AnalyticsMatch[] }>();
  for (const match of rows) for (const [id, name] of [[match.homeId, match.home.name], [match.awayId, match.away.name]]) {
    const entry = byTeam.get(id) || { name, matches: [] };
    entry.matches.push(match); byTeam.set(id, entry);
  }
  const role = filters.role || 'made';
  const all = [...byTeam].map(([id, entry]) => {
    const counts = countTeamTransitions(entry.matches, id, now);
    const relevant = entry.matches.sort(newest).map(match => teamTransition(match, id)).filter(row => filters.transition ? row.code === filters.transition && roleMatches(row, role) : role === 'made' ? row.madeComeback : row.concededComeback);
    const last = relevant[0];
    return { ...counts, id, name: entry.name, leagues: [...new Set(entry.matches.map(match => match.league.name))].sort(), position: 0,
      selectedCount: relevant.length, selectedPercent: percentage(relevant.length, counts.sample), last: last?.code ? { date: matchDate(last.match), code: last.code, opponent: last.opponent, madeComeback: last.madeComeback, concededComeback: last.concededComeback } : null };
  });
  const leaders = (key: 'made21' | 'made12') => {
    const max = Math.max(0, ...all.map(row => row[key]));
    return max ? all.filter(row => row[key] === max).map(row => ({ id: row.id, name: row.name, count: row[key] })).sort((a, b) => a.name.localeCompare(b.name)) : [];
  };
  const sort = filters.sort || (filters.transition ? 'selected' : 'total'), direction = filters.direction === 'asc' ? 1 : -1;
  const field = (row: typeof all[number]): string | number => sort === 'name' ? row.name : sort === 'played' ? row.played : sort === 'twoOne' ? role === 'made' ? row.made21 : row.conceded21 : sort === 'oneTwo' ? role === 'made' ? row.made12 : row.conceded12 : sort === 'rate' ? (filters.transition ? row.selectedPercent : role === 'made' ? row.madePercent : row.concededPercent) ?? -1 : sort === 'last' ? row.last?.date || '' : sort === 'selected' ? row.selectedCount : role === 'made' ? row.made : row.conceded;
  const ranked = all.filter(row => row.sample > 0 && (!filters.search || nameKey(row.name).includes(nameKey(filters.search))) && (!filters.transition || row.selectedCount > 0))
    .sort((a, b) => { const one = field(a), two = field(b); return direction * (typeof one === 'number' && typeof two === 'number' ? one - two : String(one).localeCompare(String(two))) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id); })
    .map((row, index) => ({ ...row, position: index + 1 }));
  const offset = filters.offset || 0;
  return { catalog: catalog(), seasons: [...HISTORICAL_SEASONS].reverse(), aggregate: aggregateHistorical(rows), rows: ranked.slice(offset, offset + PAGE_SIZE), totalTeams: ranked.length, hasMore: ranked.length > offset + PAGE_SIZE, offset, leaders: { twoOne: leaders('made21'), oneTwo: leaders('made12') } };
}

export function listHtftTransitions(input: AnalyticsMatch[], code: HtftCode, filters: HtftFilters = {}, now = new Date()): HtftTransitionPage {
  const rows = selectedMatches(input, filters).filter(match => finished(match, now));
  const sample = rows.filter(match => historicalTransition(match) !== null).length;
  const matching = rows.filter(match => historicalTransition(match) === code).sort(newest), offset = filters.offset || 0;
  return { catalog: catalog(), code, count: matching.length, sample, percent: percentage(matching.length, sample), aggregate: aggregateHistorical(rows), matches: matching.slice(offset, offset + PAGE_SIZE), offset, hasMore: matching.length > offset + PAGE_SIZE };
}

export function htftTeamDetail(input: AnalyticsMatch[], id: string, filters: HtftFilters = {}, now = new Date()): HtftTeamDetail | null {
  const all = selectedMatches(input, { league: filters.league, tier: filters.tier }).filter(match => finished(match, now) && [match.homeId, match.awayId].includes(id)).sort(newest);
  if (!all.length) return null;
  const name = all[0].homeId === id ? all[0].home.name : all[0].away.name;
  const selected = selectedMatches(all, filters);
  const appearances = selected.map(match => teamTransition(match, id)).filter(row => !filters.transition || row.code === filters.transition);
  const offset = filters.offset || 0;
  return { catalog: catalog(), id, name, counts: countTeamTransitions(selected, id, now), currentSeason: HISTORICAL_SEASONS.at(-1)!,
    seasons: [...HISTORICAL_SEASONS].reverse().map(season => ({ season, ...countTeamTransitions(all.filter(match => match.season === season), id, now) })),
    matches: appearances.slice(offset, offset + PAGE_SIZE), total: appearances.length, hasMore: appearances.length > offset + PAGE_SIZE, offset };
}

export function previewHtftMatch(input: AnalyticsMatch[], id: string, now = new Date()): HtftMatchPreview | null {
  const match = input.find(row => row.id === id);
  if (!match) return null;
  const cutoff = Math.min(now.getTime(), match.kickoffAt ? Date.parse(match.kickoffAt) : Date.parse(`${matchDate(match)}T00:00:00Z`));
  const date = matchDate(match);
  // Unknown wall-clock times cannot establish an ordering within the same day.
  const history = input.filter(row => row.id !== id && finished(row, now) && (matchDate(row) < date && (!row.kickoffAt || Date.parse(row.kickoffAt) < cutoff) || matchDate(row) === date && !!row.kickoffAt && !!match.kickoffAt && Date.parse(row.kickoffAt) < cutoff));
  const summarize = (teamId: string, name: string) => {
    const own = history.filter(row => [row.homeId, row.awayId].includes(teamId)).sort(newest);
    return { id: teamId, name, all: countTeamTransitions(own, teamId, now), last5: countTeamTransitions(own.slice(0, 5), teamId, now), last10: countTeamTransitions(own.slice(0, 10), teamId, now), season: countTeamTransitions(own.filter(row => row.season === match.season), teamId, now) };
  };
  const h2h = history.filter(row => [row.homeId, row.awayId].includes(match.homeId) && [row.homeId, row.awayId].includes(match.awayId)).sort(newest);
  return { match, season: match.season, home: summarize(match.homeId, match.home.name), away: summarize(match.awayId, match.away.name), h2h: h2h.slice(0, 50), h2hSample: h2h.length, h2hTransitions: aggregateHistorical(h2h).htft, asOf: now.toISOString() };
}

export function shiftBelgradeDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export async function htftSchedule(db: AnalyticsDatabase, from = localDate(), days = 1, filters: HtftFilters = {}, now = new Date()): Promise<HtftSchedule> {
  if (!validDate(from) || !Number.isInteger(days) || days < 1 || days > 7) throw new Error('Izaberite datum i raspon od 1 do 7 dana.');
  const to = shiftBelgradeDate(from, days - 1);
  const all = await readEnglishMatches(db), selected = selectedMatches(all, { league: filters.league, tier: filters.tier });
  const rows = selected.filter(match => matchDate(match) >= from && matchDate(match) <= to && ['scheduled', 'unknown', 'live', 'postponed'].includes(match.status) && (match.status === 'live' || !completeScore(match.ft)))
    .sort((a, b) => -newest(a, b));
  const checks = (await db.query('SELECT payload FROM fa_historical_checks')).map(row => JSON.parse(row.payload));
  const runs = (await db.query('SELECT payload FROM fa_import_runs ORDER BY created_at DESC LIMIT 20')).map(row => JSON.parse(row.payload));
  const offset = filters.offset || 0;
  return { from, to, catalog: catalog(), matches: rows.slice(offset, offset + PAGE_SIZE), total: rows.length, hasMore: rows.length > offset + PAGE_SIZE, offset,
    coverage: catalog().map(league => {
      const current = all.filter(match => englishLeague(match.league.name)?.id === league.id && match.season === HISTORICAL_SEASONS.at(-1));
      const latest = checks.filter(check => check.league === league.id && check.season === HISTORICAL_SEASONS.at(-1)).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0];
      const overdueUnresolved = current.filter(match => matchDate(match) < localDate(now) && ['unknown', 'scheduled', 'live'].includes(match.status) && !completeScore(match.ft)).length;
      const latestResultDate = current.filter(match => finished(match, now)).map(matchDate).sort().at(-1) || null;
      const reason = !current.length ? latest?.warnings?.join(' ') || 'Nema potvrđenog izvora za tekuću sezonu.' : !rows.some(match => englishLeague(match.league.name)?.id === league.id) ? 'Nema sačuvanih utakmica u ovom periodu. To nije potvrda da se liga ne igra.' : current.some(match => !match.kickoffAt) ? 'Vremenska zona pojedinih arhivskih termina nije potvrđena.' : '';
      return { ...league, fixtures: rows.filter(match => englishLeague(match.league.name)?.id === league.id).length, seasonMatches: current.length, overdueUnresolved, latestResultDate, checkedAt: latest?.checkedAt || null,
        reason: [reason, ...(overdueUnresolved ? [`Nedostaje konačan rezultat za ${overdueUnresolved} prošlih utakmica tekuće sezone.`] : [])].filter(Boolean).join(' ') };
    }),
    lastSync: runs.find(run => run.completedAt && ['complete', 'partial'].includes(run.status))?.completedAt || null,
    syncEnabled: process.env.HISTORICAL_ANALYTICS_SYNC_ENABLED === 'true' && process.env.HISTORICAL_ANALYTICS_WRITE_ENABLED === 'true' };
}

export async function htftRanking(db: AnalyticsDatabase, input: HtftFilters = {}, now = new Date()) { return rankHtftTeams(await readEnglishMatches(db), validateHtftFilters(input), now); }
export async function htftTransitions(db: AnalyticsDatabase, code: HtftCode, input: HtftFilters = {}, now = new Date()) { const filters = validateHtftFilters({ ...input, transition: code }); return listHtftTransitions(await readEnglishMatches(db), code, filters, now); }
export async function readHtftTeam(db: AnalyticsDatabase, id: string, input: HtftFilters = {}, now = new Date()) { return htftTeamDetail(await readEnglishMatches(db), id, validateHtftFilters(input), now); }
export async function readHtftMatch(db: AnalyticsDatabase, id: string, now = new Date()) { return previewHtftMatch(await readEnglishMatches(db), id, now); }
