import { getSportsKey, requestSports, SportsApiError, validDate, localDate } from './sportsApi.js';
import { cachedSportsJson, freeFixturesForDate } from './freeFootballFeeds.js';

const LEAGUES: Record<string, number> = { PL: 39, EL1: 40, PD: 140, SA: 135, BL1: 78, FL1: 61, CL: 2, PPL: 94, DED: 88, BSA: 71, WC: 1, EC: 4 };
const completed = new Set(['FT', 'AET', 'PEN']);
const postponed = new Set(['PST', 'CANC', 'ABD', 'SUSP']);
const scheduled = new Set(['NS', 'TBD']);
const cache = new Map<string, { until: number; task: Promise<any> }>();

export function validateFootballRequest(url: URL) {
  const path = url.searchParams.get('path') || '/matches';
  if (!/^\/(?:matches|competitions(?:\/[A-Za-z0-9_-]{1,40}\/(?:matches|standings))?)$/.test(path)) throw new SportsApiError('Nepodržan sportski zahtev.', 400);
  const params: Record<string, string> = {};
  for (const key of ['dateFrom', 'dateTo']) {
    const value = url.searchParams.get(key);
    if (value && !validDate(value)) throw new SportsApiError('Neispravan datum.', 400);
    if (value) params[key] = value;
  }
  if (params.dateFrom && params.dateTo && (params.dateFrom > params.dateTo
    || Date.parse(params.dateTo) - Date.parse(params.dateFrom) > 31 * 86400_000)) throw new SportsApiError('Izaberite raspon do 31 dan.', 400);
  const status = url.searchParams.get('status');
  if (status && !['SCHEDULED', 'TIMED', 'LIVE', 'IN_PLAY', 'FINISHED'].includes(status)) throw new SportsApiError('Neispravan status.', 400);
  if (status) params.status = status;
  return { path, params };
}

const mapFixture = (item: any) => {
  const short = item.fixture?.status?.short;
  const final = completed.has(short);
  return {
    id: item.fixture?.id, utcDate: item.fixture?.date, source: 'api-football',
    status: final ? 'FINISHED' : postponed.has(short) ? 'POSTPONED' : scheduled.has(short) ? 'SCHEDULED' : 'IN_PLAY',
    competition: { id: item.league?.id, code: Object.keys(LEAGUES).find((key) => LEAGUES[key] === item.league?.id) || `AF_${item.league?.id}`, name: item.league?.name },
    homeTeam: item.teams?.home, awayTeam: item.teams?.away,
    score: { fullTime: { home: final ? item.score?.fulltime?.home ?? item.goals?.home : item.goals?.home ?? null,
      away: final ? item.score?.fulltime?.away ?? item.goals?.away : item.goals?.away ?? null } },
  };
};

async function apiSportsData(path: string, params: Record<string, string>) {
  const competition = path.match(/^\/competitions\/([^/]+)\//)?.[1];
  const league = competition ? LEAGUES[competition] || Number(competition.replace(/^AF_/, '')) : undefined;
  if (competition && (!Number.isInteger(league) || Number(league) < 1)) throw new SportsApiError('Takmičenje nije dostupno kod API-Sports.', 400);
  if (path === '/competitions') {
    const data = await requestSports<any>('/leagues', { current: 'true' }, { ttlMs: 24 * 60 * 60_000 });
    return { competitions: data.response.map((item) => ({ id: item.league.id, code: Object.keys(LEAGUES).find((key) => LEAGUES[key] === item.league.id) || `AF_${item.league.id}`,
      name: item.league.name, area: { name: item.country?.name || '' } })) };
  }
  if (path.endsWith('/standings')) {
    const leagues = await requestSports<any>('/leagues', { id: String(league), current: 'true' }, { ttlMs: 24 * 60 * 60_000 });
    const season = leagues.response[0]?.seasons?.find((item: any) => item.current)?.year;
    if (!season) return { standings: [] };
    const data = await requestSports<any>('/standings', { league: String(league), season: String(season) });
    const table = data.response[0]?.league?.standings?.[0] || [];
    return { standings: [{ table: table.map((row: any) => ({ position: row.rank, team: row.team, playedGames: row.all?.played,
      won: row.all?.win, draw: row.all?.draw, lost: row.all?.lose, points: row.points,
      goalsFor: row.all?.goals?.for, goalsAgainst: row.all?.goals?.against, goalDifference: row.goalsDiff })) }] };
  }
  const from = params.dateFrom || localDate();
  const to = params.dateTo || from;
  const query: Record<string, string> = from === to ? { date: from } : { from, to };
  if (league) query.league = String(league);
  const data = await requestSports<any>('/fixtures', { ...query, timezone: 'Europe/Belgrade' }, { ttlMs: 2 * 60_000 });
  const matches = data.response.map(mapFixture).filter((item) => !params.status
    || (['LIVE', 'IN_PLAY'].includes(params.status) ? item.status === 'IN_PLAY'
      : ['SCHEDULED', 'TIMED'].includes(params.status) ? item.status === 'SCHEDULED' : item.status === params.status));
  return { matches };
}

export async function resolveFootballData(path: string, params: Record<string, string>) {
  const cacheKey = `${path}:${JSON.stringify(params)}`;
  const existing = cache.get(cacheKey);
  if (existing && existing.until > Date.now()) return existing.task;
  const task = (async () => {
    let apiSportsError: unknown;
    if (getSportsKey()) {
      try { return await apiSportsData(path, params); } catch (error) { apiSportsError = error; }
    }
    const key = process.env.FOOTBALL_DATA_API_KEY?.trim();
    if (key) try {
      const url = new URL(path, 'https://api.football-data.org/v4/');
      url.pathname = `/v4${path}`;
      Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
      const payload = await cachedSportsJson(url, { 'X-Auth-Token': key }, 120000);
      if (path !== '/matches' || payload.matches?.length || params.dateTo && params.dateTo !== params.dateFrom) return payload;
    } catch { /* Free fixture sources follow. */ }
    if (path !== '/matches') throw apiSportsError || new SportsApiError('Izabrano takmicenje ili tabela trenutno nisu dostupni.', 503);
    const date = params.dateFrom || localDate();
    if (params.dateTo && params.dateTo !== date) throw new SportsApiError('Rezervni izvor podrzava jedan datum po zahtevu.', 400);
    return { matches: (await freeFixturesForDate(date)).map((item) => ({ ...mapFixture(item), source: item.sourceProvider }))
      .filter((item) => !params.status || (['SCHEDULED', 'TIMED'].includes(params.status) ? item.status === 'SCHEDULED'
        : ['LIVE', 'IN_PLAY'].includes(params.status) ? item.status === 'IN_PLAY' : item.status === params.status)) };
  })().catch((error) => { cache.delete(cacheKey); throw error; });
  if (cache.size > 200) cache.clear();
  cache.set(cacheKey, { until: Date.now() + (path === '/competitions' ? 3600_000 : 120_000), task });
  return task;
}
