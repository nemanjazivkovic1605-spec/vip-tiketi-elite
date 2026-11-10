import { createHash } from 'node:crypto';
import { localDate, validDate } from './sportsApi.js';
import type { Fixture, Prediction } from './dailyPickSelection.js';
import { footballDataRegularScore } from './resultScores.js';

export type FreeFixture = Fixture & {
  sourceProvider: 'football-data.org' | 'TheSportsDB' | 'OpenLigaDB';
  providerId: string;
  providerHomeId?: number;
  providerAwayId?: number;
  goals: { home: number | null; away: number | null };
  score: { fulltime: { home: number | null; away: number | null }; halftime?: { home: number | null; away: number | null } };
};
const cache = new Map<string, { until: number; task: Promise<any> }>();
const queues = new Map<string, Promise<void>>();
const nextRequest = new Map<string, number>();
const unavailableUntil = new Map<string, number>();
const numericId = (source: string, id: string) => parseInt(createHash('sha256').update(`${source}:${id}`).digest('hex').slice(0, 12), 16);
export const teamKey = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b(fc|cf|afc|sc)\b/g, '').replace(/[^a-z0-9]/g, '');
const score = (value: any) => value !== null && value !== undefined && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function cachedSportsJson(url: URL, headers: Record<string, string> = {}, ttl = 5 * 60000): Promise<any> {
  const key = createHash('sha256').update(`${url}:${JSON.stringify(headers)}`).digest('hex');
  const previous = cache.get(key);
  if (previous && previous.until > Date.now()) return previous.task;
  const account = createHash('sha256').update(`${url.origin}:${JSON.stringify(headers)}:${url.searchParams.get('apiKey') || ''}`).digest('hex');
  const gate = (queues.get(account) || Promise.resolve()).then(async () => {
    if ((unavailableUntil.get(account) || 0) > Date.now()) throw new Error('Sports provider cooling down.');
    const delay = Math.max(0, (nextRequest.get(account) || 0) - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const interval = url.hostname === 'api.football-data.org' ? 6100 : url.hostname.endsWith('thesportsdb.com') ? 2200 : 500;
    nextRequest.set(account, Date.now() + interval);
  });
  queues.set(account, gate.catch(() => undefined));
  const task = gate.then(() => fetch(url, { headers: { 'User-Agent': 'EliteVipTips/1.0 (support@eliteviptips.com)', ...headers }, signal: AbortSignal.timeout(10000) }))
    .then(async (response) => {
      if (!response.ok) {
        if ([401, 403, 429].includes(response.status)) unavailableUntil.set(account, Date.now() + (response.status === 429 ? 60000 : 30 * 60000));
        throw new Error(`Sports provider HTTP ${response.status}`);
      }
      return response.json();
    })
    .catch((error) => { cache.delete(key); throw error; });
  if (cache.size > 150) cache.clear();
  cache.set(key, { until: Date.now() + ttl, task });
  return task;
}

const normalized = (provider: FreeFixture['sourceProvider'], id: any, date: string, league: string, leagueId: any,
  home: string, away: string, status: string, homeScore: any, awayScore: any): FreeFixture | null => {
  if (!id || !home || !away || !league || !Number.isFinite(Date.parse(date))) return null;
  const goals = { home: score(homeScore), away: score(awayScore) };
  return { sourceProvider: provider, providerId: String(id), fixture: { id: numericId(provider, String(id)), date, status: { short: status } },
    league: { id: numericId(provider, String(leagueId || league)), name: league },
    teams: { home: { id: numericId(provider, home), name: home }, away: { id: numericId(provider, away), name: away } },
    goals, score: { fulltime: goals } };
};

export function mapFootballDataMatch(match: any): FreeFixture | null {
  const statuses: Record<string, string> = { FINISHED: 'FT', SCHEDULED: 'NS', TIMED: 'NS', IN_PLAY: '2H', PAUSED: 'HT', POSTPONED: 'PST', CANCELLED: 'CANC', SUSPENDED: 'SUSP' };
  const goals = footballDataRegularScore(match.score);
  const item = normalized('football-data.org', match.id, match.utcDate, match.competition?.name, match.competition?.id,
    match.homeTeam?.name, match.awayTeam?.name, statuses[match.status] || 'TBD', goals.home, goals.away);
  if (item) item.score.halftime = { home: score(match.score?.halfTime?.home), away: score(match.score?.halfTime?.away) };
  if (item && match.area?.name) item.league.country = match.area.name;
  if (item) { item.providerHomeId = match.homeTeam?.id; item.providerAwayId = match.awayTeam?.id; }
  return item;
}

export function mapSportsDbEvent(event: any): FreeFixture | null {
  if (event.strSport && event.strSport !== 'Soccer') return null;
  const status = String(event.strStatus || '').toUpperCase();
  const rawDate = event.strTimestamp || (event.dateEvent && event.strTime ? `${event.dateEvent}T${event.strTime}` : '');
  const date = rawDate && !/(Z|[+-]\d\d:\d\d)$/.test(rawDate) ? `${rawDate}Z` : rawDate;
  // A score alone is not proof of full time, and ET/penalty scores are not regular-time scores.
  const short = /^(MATCH FINISHED|FT|FINISHED)$/.test(status) ? 'FT' : /POSTPON/.test(status) ? 'PST'
    : /CANCEL/.test(status) ? 'CANC' : /^(NOT STARTED|NS)$/.test(status)
      || !status && score(event.intHomeScore) === null && score(event.intAwayScore) === null && Date.parse(date) > Date.now() ? 'NS' : 'TBD';
  return normalized('TheSportsDB', event.idEvent, date, event.strLeague, event.idLeague, event.strHomeTeam, event.strAwayTeam,
    short, event.intHomeScore, event.intAwayScore);
}

export function mapOpenLigaMatch(match: any): FreeFixture | null {
  const final = (match.matchResults || []).find((value: any) => value.resultTypeID === 2);
  // Only the explicitly labelled final score is used, never the half-time score.
  return normalized('OpenLigaDB', match.matchID, match.matchDateTimeUTC, match.leagueName, match.leagueShortcut,
    match.team1?.teamName, match.team2?.teamName, match.matchIsFinished && final ? 'FT' : match.matchIsFinished ? 'TBD' : 'NS',
    final?.pointsTeam1, final?.pointsTeam2);
}

export async function openLigaSeason(date: string): Promise<FreeFixture[]> {
  const year = Number(date.slice(0, 4)) - Number(Number(date.slice(5, 7)) < 7);
  const rows = await Promise.allSettled(['bl1', 'bl2', 'bl3'].map(async (league) => {
    const data = await cachedSportsJson(new URL(`https://api.openligadb.de/getmatchdata/${league}/${year}`), {}, 30 * 60000);
    return (Array.isArray(data) ? data : []).map(mapOpenLigaMatch).filter(Boolean) as FreeFixture[];
  }));
  return rows.flatMap((row) => row.status === 'fulfilled' ? row.value : []);
}

export async function freeFixturesForDate(date: string): Promise<FreeFixture[]> {
  if (!validDate(date)) throw new Error('Neispravan datum.');
  const requests: Array<Promise<FreeFixture[]>> = [];
  const key = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (key) requests.push(cachedSportsJson(new URL(`https://api.football-data.org/v4/matches?dateFrom=${date}&dateTo=${date}`), { 'X-Auth-Token': key })
    .then((data) => (data.matches || []).map(mapFootballDataMatch).filter(Boolean)));
  const sportsKey = process.env.THESPORTSDB_API_KEY?.trim() || '123';
  requests.push(openLigaSeason(date));
  requests.push(cachedSportsJson(new URL(`https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(sportsKey)}/eventsday.php?d=${date}&s=Soccer`))
    .then((data) => (data.events || []).map(mapSportsDbEvent).filter(Boolean)));
  const responses = await Promise.allSettled(requests);
  const unique = new Map<string, FreeFixture>();
  for (const response of responses) if (response.status === 'fulfilled') for (const item of response.value) {
    if (localDate(new Date(item.fixture.date)) !== date) continue;
    const key = `${teamKey(item.teams.home.name)}:${teamKey(item.teams.away.name)}:${item.fixture.date.slice(0, 16)}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  if (!unique.size && responses.every((response) => response.status === 'rejected')) throw new Error('Besplatni izvori meceva trenutno nisu dostupni.');
  return [...unique.values()];
}

export async function findFreeFixture(lookup: { date: string; homeTeam: string; awayTeam: string }): Promise<FreeFixture | null> {
  if (!validDate(lookup.date) || !lookup.homeTeam || !lookup.awayTeam) return null;
  const same = (item: FreeFixture) => teamKey(item.teams.home.name) === teamKey(lookup.homeTeam)
    && teamKey(item.teams.away.name) === teamKey(lookup.awayTeam) && localDate(new Date(item.fixture.date)) === lookup.date;
  try {
    const matches = (await freeFixturesForDate(lookup.date)).filter(same);
    if (matches.length === 1) return matches[0];
  } catch { /* A targeted event search can still work when another endpoint fails. */ }
  const key = process.env.THESPORTSDB_API_KEY?.trim() || '123';
  const url = new URL(`https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/searchevents.php`);
  url.searchParams.set('e', `${lookup.homeTeam}_vs_${lookup.awayTeam}`);
  url.searchParams.set('d', lookup.date);
  try {
    const data = await cachedSportsJson(url);
    const matches = (data.event || data.events || []).map(mapSportsDbEvent).filter(Boolean).filter(same);
    return matches.length === 1 ? matches[0] : null;
  } catch { return null; }
}

export async function historicalModel(fixture: FreeFixture): Promise<Prediction | null> {
  const date = localDate(new Date(fixture.fixture.date));
  let history: FreeFixture[] = [];
  if (fixture.sourceProvider === 'OpenLigaDB') history = await openLigaSeason(date);
  else if (process.env.FOOTBALL_DATA_API_KEY?.trim() && fixture.providerHomeId && fixture.providerAwayId) {
    try {
      const responses = await Promise.all([fixture.providerHomeId, fixture.providerAwayId].map((team) =>
        cachedSportsJson(new URL(`https://api.football-data.org/v4/teams/${team}/matches?dateTo=${date}&status=FINISHED&limit=10`),
          { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY!.trim() }, 30 * 60000)));
      history = [...new Map<string, FreeFixture>(responses.flatMap((data) => (data.matches || []).map(mapFootballDataMatch).filter(Boolean))
        .map((item: FreeFixture) => [item.providerId, item])).values()];
    } catch { return null; }
  }
  history = history.filter((item) => item.fixture.status.short === 'FT' && Date.parse(item.fixture.date) < Date.parse(fixture.fixture.date)
    && item.goals.home !== null && item.goals.away !== null);
  const stats = (name: string, id: number) => {
    const games = history.filter((item) => [item.teams.home.name, item.teams.away.name].some((team) => teamKey(team) === teamKey(name)))
      .sort((a, b) => b.fixture.date.localeCompare(a.fixture.date)).slice(0, 10);
    if (games.length < 5) return null;
    const mean = (forTeam: boolean) => games.reduce((sum, game) => {
      const home = teamKey(game.teams.home.name) === teamKey(name);
      return sum + ((home === forTeam ? game.goals.home : game.goals.away) || 0);
    }, 0) / games.length;
    return { id, league: { fixtures: { played: { total: games.length } }, goals: {
      for: { average: { total: String(mean(true)) } }, against: { average: { total: String(mean(false)) } },
    } } };
  };
  const home = stats(fixture.teams.home.name, fixture.teams.home.id), away = stats(fixture.teams.away.name, fixture.teams.away.id);
  return home && away ? { teams: { home, away } } : null;
}
