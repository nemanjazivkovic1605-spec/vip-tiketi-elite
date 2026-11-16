import { parse } from 'csv-parse/sync';
import { readFile } from 'node:fs/promises';
import type { MatchObservation, ScorePair } from '../../src/types/footballAnalytics.js';
import type { HistoricalDataset, HistoricalImportOptions, HistoricalSource } from '../../src/types/historicalAnalytics.js';
import { ENGLISH_PYRAMID, englishClubName, englishLeague, historicalSeason, validHistoricalDate } from './englishPyramid.js';
import { completeScore, hashId, nameKey, normalizeFootballData, normalizePitchMatch } from './normalization.js';

const memory = new Map<string, { expires: number; task: Promise<any> }>();
const gates = new Map<string, Promise<void>>();
const nextRequest = new Map<string, number>();
export class HistoricalSourceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function historicalJson(url: URL, headers: Record<string, string> = {}, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!['openfootball.github.io', 'raw.githubusercontent.com', 'api.pitchapi.dev', 'api.football-data.org'].includes(url.hostname) || url.protocol !== 'https:')
    throw new Error('Izvor nije dozvoljen.');
  const key = hashId(url.toString(), JSON.stringify(headers));
  const cached = memory.get(key);
  if (cached && cached.expires > Date.now()) return cached.task;
  const task = (async () => {
    const host = url.hostname;
    const previous = gates.get(host) || Promise.resolve();
    let release!: () => void;
    gates.set(host, new Promise<void>(resolve => { release = resolve; }));
    await previous;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        signal?.throwIfAborted();
        await wait(Math.max(0, (nextRequest.get(host) || 0) - Date.now()));
        nextRequest.set(host, Date.now() + (host === 'api.football-data.org' ? 6500 : 300));
        let response: Response;
        try {
          response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'EliteVIPTips-Historical/1.0', ...headers }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
        } catch {
          signal?.throwIfAborted();
          if (attempt === 2) throw new HistoricalSourceError(504, 'Izvor nije odgovorio u dozvoljenom vremenu.');
          await wait(500 * 2 ** attempt);
          continue;
        }
        if (!response.ok) {
          if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
            const header = response.headers.get('Retry-After');
            const delay = header ? (/^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 500 * 2 ** attempt;
            if (delay > 10000) throw new HistoricalSourceError(response.status, 'Izvor traži dužu pauzu. Pokušajte kasnije.');
            await wait(Math.max(500, delay || 500));
            continue;
          }
          throw new HistoricalSourceError(response.status, `Izvor je vratio HTTP ${response.status}.`);
        }
        if (Number(response.headers.get('Content-Length') || 0) > 4_000_000)
          throw new HistoricalSourceError(413, 'Odgovor izvora je prevelik.');
        const text = await response.text();
        if (text.length > 4_000_000) throw new HistoricalSourceError(413, 'Odgovor izvora je prevelik.');
        try { return JSON.parse(text); } catch { throw new HistoricalSourceError(502, 'Izvor nije vratio validan JSON.'); }
      }
    } finally { release(); }
  })();
  if (memory.size >= 100) memory.clear();
  const entry = { expires: Date.now() + 15 * 60000, task };
  memory.set(key, entry);
  task.catch(() => { if (memory.get(key) === entry) memory.delete(key); });
  return task;
}
const emptyScore = (): ScorePair => ({ home: null, away: null });
const integer = (value: unknown) => value !== '' && value !== null && value !== undefined && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const pair = (value: unknown): ScorePair => Array.isArray(value) && value.length === 2 ? { home: integer(value[0]), away: integer(value[1]) } : emptyScore();
export const matchDate = (record: MatchObservation) => record.matchDate || record.kickoffAt?.slice(0, 10) || '';
export function validHistoricalObservation(record: MatchObservation, now = new Date()) {
  const league = englishLeague(record.league.name), season = historicalSeason(record.season);
  if (!league || !season || record.environment !== 'real' || !validHistoricalDate(matchDate(record), season)
    || !nameKey(record.home.name) || !nameKey(record.away.name) || nameKey(record.home.name) === nameKey(record.away.name)) return false;
  if (record.kickoffAt !== null && !Number.isFinite(Date.parse(record.kickoffAt))) return false;
  for (const score of [record.ft, record.ht]) if ([score.home, score.away].some(value => value !== null && (!Number.isInteger(value) || value < 0))) return false;
  if (completeScore(record.ht) && completeScore(record.ft) && (record.ht.home! > record.ft.home! || record.ht.away! > record.ft.away!)) return false;
  if (record.status === 'finished' && (!completeScore(record.ft) || matchDate(record) > now.toISOString().slice(0, 10))) return false;
  return true;
}
function basicObservation(raw: any, leagueId: string, season: string, provider: 'manual' | 'openfootball', sourceUrl: string, sourceName = ''): MatchObservation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const league = englishLeague(leagueId);
  const date = String(raw.date || raw.matchDate || '').trim();
  const home = englishClubName(String(raw.homeTeam || raw.team1 || '').trim());
  const away = englishClubName(String(raw.awayTeam || raw.team2 || '').trim());
  if (!league || !validHistoricalDate(date, season) || !home || !away) return null;
  const ht = raw.score ? pair(raw.score.ht) : { home: integer(raw.htHome), away: integer(raw.htAway) };
  const ft = raw.score ? pair(raw.score.ft) : { home: integer(raw.ftHome), away: integer(raw.ftAway) };
  const time = typeof raw.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time) ? raw.time : null;
  // Archive wall-clock times have no documented timezone. Preserve them without inventing a UTC instant.
  const explicitKickoff = typeof raw.kickoffAt === 'string' && /(Z|[+-]\d\d:\d\d)$/.test(raw.kickoffAt) && Number.isFinite(Date.parse(raw.kickoffAt)) ? new Date(raw.kickoffAt).toISOString() : null;
  const statusNames: Record<string, MatchObservation['status']> = { FT: 'finished', FINISHED: 'finished', SCHEDULED: 'scheduled', NS: 'scheduled', POSTPONED: 'postponed', CANCELED: 'canceled', CANCELLED: 'canceled', LIVE: 'live', UNKNOWN: 'unknown' };
  const supplied = raw.status ? statusNames[String(raw.status).toUpperCase()] : null;
  if (raw.status && !supplied) return null;
  const observation: MatchObservation = {
    provider, environment: 'real',
    sourceId: provider === 'manual' && raw.id ? hashId(sourceName, String(raw.id)) : hashId(league.id, season, nameKey(home), nameKey(away), String(raw.round || 'regular'), provider === 'manual' ? sourceName : ''),
    league: { sourceId: league.id, name: league.name, country: 'England', tier: league.tier }, season,
    matchDate: date, matchTime: time, timeZone: explicitKickoff ? 'UTC' : null, kickoffAt: explicitKickoff,
    home: { sourceId: hashId('england', nameKey(home)), name: home },
    away: { sourceId: hashId('england', nameKey(away)), name: away },
    status: supplied || (completeScore(ft) ? 'finished' : 'unknown'), ht, ft,
    extraTime: emptyScore(), penalties: emptyScore(), xg: emptyScore(), shots: emptyScore(), shotsOnTarget: emptyScore(),
    events: null, individualShots: null, statsChecked: false,
    sourceUrl, license: provider === 'openfootball' ? 'CC0-1.0' : 'User-confirmed permission',
    observedAt: new Date().toISOString(), lastCheckedAt: new Date().toISOString(),
  };
  return validHistoricalObservation(observation) ? observation : null;
}
export const normalizeHistoricalJson = basicObservation;

async function pitchDataset(leagueId: string, season: string, signal?: AbortSignal): Promise<{ rows: any[]; normalize: (row: any) => MatchObservation | null; url: string; license: string }> {
  const key = (process.env.PITCHAPI_KEY || process.env.PITCHAPI_API_KEY || '').trim();
  if (!key.startsWith('pk_live_')) throw new HistoricalSourceError(403, key.startsWith('pk_test_') ? 'PitchAPI testni ključ nije izvor stvarnih rezultata.' : 'PitchAPI produkcijski ključ nije podešen.');
  const catalog = await historicalJson(new URL('https://api.pitchapi.dev/v1/leagues'), { 'X-API-KEY': key }, signal);
  if ([catalog, catalog.data].some(value => value?.environment === 'test' || value?.is_test === true)) throw new HistoricalSourceError(403, 'PitchAPI je vratio testno okruženje.');
  const league = ENGLISH_PYRAMID.find(row => row.id === leagueId)!;
  const found = catalog.data?.leagues?.filter((row: any) => ['ENG', 'England'].includes(row.country_code || row.country) && englishLeague(row.name)?.id === leagueId);
  if (!Array.isArray(found) || found.length !== 1) throw new HistoricalSourceError(404, 'Liga nije potvrđena u PitchAPI katalogu.');
  const sourceSeason = (found[0].seasons || []).find((value: string) => historicalSeason(value) === season);
  if (!sourceSeason) throw new HistoricalSourceError(404, 'Sezona nije potvrđena u PitchAPI katalogu.');
  const url = new URL(`https://api.pitchapi.dev/v1/leagues/${encodeURIComponent(found[0].id)}/matches`);
  url.searchParams.set('season', sourceSeason); url.searchParams.set('status', 'all');
  const data = await historicalJson(url, { 'X-API-KEY': key }, signal);
  if (!Array.isArray(data.data?.matches)) throw new HistoricalSourceError(502, 'Nedostaje lista PitchAPI utakmica.');
  return { rows: data.data.matches, url: url.toString(), license: 'PitchAPI API terms', normalize: raw => {
    if (raw.is_test === true || raw.environment === 'test' || raw.league?.id && String(raw.league.id) !== String(found[0].id)) return null;
    const value = normalizePitchMatch(raw, { leagueId: String(found[0].id), leagueName: league.name, country: 'England', season });
    return value ? { ...value, league: { ...value.league, tier: league.tier }, sourceUrl: url.toString(), lastCheckedAt: new Date().toISOString() } : null;
  } };
}
async function fetchDataset(provider: Exclude<HistoricalSource, 'manual'>, leagueId: string, season: string, signal?: AbortSignal) {
  const league = englishLeague(leagueId)!;
  if (provider === 'pitchapi') return pitchDataset(leagueId, season, signal);
  if (provider === 'football-data.org') {
    const code = 'footballData' in league ? league.footballData : null;
    const key = process.env.FOOTBALL_DATA_API_KEY?.trim();
    if (!code || !key) throw new HistoricalSourceError(403, 'Liga ili ključ nisu dostupni u besplatnom football-data.org paketu.');
    const url = new URL(`https://api.football-data.org/v4/competitions/${code}/matches?season=${season.slice(0, 4)}`);
    const data = await historicalJson(url, { 'X-Auth-Token': key }, signal);
    if (!Array.isArray(data.matches)) throw new HistoricalSourceError(502, 'Nedostaje lista football-data.org utakmica.');
    return { rows: data.matches, url: url.toString(), license: 'football-data.org API terms; attribution required', normalize: (raw: any) => {
      const value = normalizeFootballData(raw, { leagueId: code, leagueName: league.name, country: 'England', season });
      return value ? { ...value, league: { ...value.league, tier: league.tier }, sourceUrl: url.toString(), lastCheckedAt: new Date().toISOString() } : null;
    } };
  }
  if (!('openfootball' in league)) throw new HistoricalSourceError(404, 'OpenFootball ne potvrđuje ovaj rang. Potreban je dozvoljen ručni izvor.');
  const paths = [
    `https://raw.githubusercontent.com/openfootball/football.json/master/${season.replace('/', '-')}/en.${league.tier}.json`,
    `https://openfootball.github.io/england/${season.replace('/', '-')}_${league.openfootball}.json`,
  ];
  let data: any, url = '';
  for (const path of paths) {
    try { data = await historicalJson(new URL(path), {}, signal); url = path; break; }
    catch (error) { if (!(error instanceof HistoricalSourceError) || ![404, 500, 502, 503, 504].includes(error.status)) throw error; }
  }
  if (!data) {
    const archive = JSON.parse(await readFile(new URL('../../data/match-history/england.json', import.meta.url), 'utf8'));
    const found = archive.seasons?.find((row: any) => englishLeague(row.competition)?.id === leagueId && historicalSeason(row.season) === season);
    if (!found) throw new HistoricalSourceError(404, 'Nema udaljenog ni postojećeg lokalnog skupa za ligu/sezonu.');
    data = { name: `${league.name} ${season}`, matches: found.matches };
    url = `https://github.com/openfootball/football.json/blob/master/${found.sourcePath}`;
  }
  if (!Array.isArray(data.matches) || !String(data.name).includes(season)) throw new HistoricalSourceError(502, 'Neispravan identitet sezone u OpenFootball izvoru.');
  if (englishLeague(String(data.name).replace(/20\d{2}\/\d{2}/g, '').trim())?.id !== league.id)
    throw new HistoricalSourceError(502, 'Liga u odgovoru ne odgovara traženom skupu.');
  return { rows: data.matches, url, license: 'CC0-1.0', normalize: (raw: any) => basicObservation(raw, leagueId, season, 'openfootball', url) };
}
export async function loadHistoricalDataset(leagueId: string, season: string, provider: HistoricalSource | 'auto' = 'auto', signal?: AbortSignal): Promise<HistoricalDataset> {
  const warnings: string[] = [];
  let transient = false;
  const candidates: Array<Exclude<HistoricalSource, 'manual'>> = provider !== 'auto' && provider !== 'manual' ? [provider]
    : [...((process.env.PITCHAPI_KEY || process.env.PITCHAPI_API_KEY || '').startsWith('pk_live_') ? ['pitchapi' as const] : []), 'openfootball', ...(process.env.FOOTBALL_DATA_API_KEY ? ['football-data.org' as const] : [])];
  for (const candidate of candidates) {
    signal?.throwIfAborted();
    try {
      const data = await fetchDataset(candidate, leagueId, season, signal);
      return inspectDataset(data.rows, data.normalize, { league: leagueId, season, provider: candidate, sourceUrl: data.url, license: data.license, warnings });
    } catch (error) {
      signal?.throwIfAborted();
      transient ||= !(error instanceof HistoricalSourceError) || error.status >= 500 || error.status === 429;
      warnings.push(`${candidate}: ${error instanceof HistoricalSourceError ? error.message : 'Izvor nije dostupan.'}`);
    }
  }
  return { league: leagueId, season, provider: provider === 'auto' ? 'openfootball' : provider, sourceUrl: '', license: '', checkedAt: new Date().toISOString(), sourceRows: 0, validRows: 0, rejected: 0, duplicateRows: 0, withFt: 0, withHtFt: 0, missingTime: 0, missingTimezone: 0, sourceComplete: false, state: transient ? 'error' : 'unavailable', warnings, records: [] };
}
export function inspectDataset(rows: any[], normalize: (raw: any) => MatchObservation | null, context: Pick<HistoricalDataset, 'league' | 'season' | 'provider' | 'sourceUrl' | 'license' | 'warnings'>): HistoricalDataset {
  if (rows.length > 5000) throw new Error('Najviše 5.000 redova po skupu podataka.');
  const unique = new Map<string, MatchObservation>();
  const conflicted = new Set<string>();
  const fixtureIds = new Map<string, string>();
  let rejected = 0, duplicateRows = 0;
  for (const row of rows) {
    const value = normalize(row);
    if (!value || !validHistoricalObservation(value)) { rejected++; continue; }
    const id = `${value.provider}:${value.sourceId}`;
    const fixtureKey = `${context.league}:${context.season}:${nameKey(value.home.name)}:${nameKey(value.away.name)}:${matchDate(value)}`;
    const knownId = fixtureIds.get(fixtureKey) || id;
    const previous = unique.get(knownId) || unique.get(id);
    if (previous) {
      const same = (value: MatchObservation) => JSON.stringify({ date: matchDate(value), home: value.home, away: value.away, ft: value.ft, ht: value.ht, status: value.status });
      if (same(previous) !== same(value)) conflicted.add(knownId);
      duplicateRows++;
      continue;
    }
    unique.set(id, value);
    fixtureIds.set(fixtureKey, id);
  }
  for (const id of conflicted) { unique.delete(id); rejected++; }
  const records = [...unique.values()];
  return { ...context, checkedAt: new Date().toISOString(), sourceRows: rows.length, validRows: records.length, rejected, duplicateRows,
    withFt: records.filter(row => row.status === 'finished' && completeScore(row.ft)).length,
    withHtFt: records.filter(row => row.status === 'finished' && completeScore(row.ht) && completeScore(row.ft)).length,
    missingTime: records.filter(row => !row.matchTime && !row.kickoffAt).length,
    missingTimezone: records.filter(row => !row.kickoffAt).length,
    sourceComplete: false, state: 'available', records,
    warnings: [...context.warnings, ...(rejected ? [`Odbačeno neispravnih ili konfliktnih zapisa: ${rejected}.`] : []), 'Obim fajla nije dokaz da je cela sezona kompletna.'],
  };
}
export function manualHistoricalDataset(options: HistoricalImportOptions): HistoricalDataset {
  const league = englishLeague(options.league), season = historicalSeason(options.season || '');
  if (!league || !season || !options.content || !options.sourceName?.trim() || options.rightsConfirmed !== true)
    throw new Error('Izaberite ligu i sezonu, navedite izvor i potvrdite pravo korišćenja fajla.');
  if (Buffer.byteLength(options.content, 'utf8') > 2_000_000) throw new Error('Fajl može imati najviše 2 MB.');
  const sourceUrl = options.sourceUrl || '';
  if (sourceUrl && !/^https:\/\//.test(sourceUrl)) throw new Error('Izvor mora biti HTTPS URL.');
  const rows = options.format === 'json' ? JSON.parse(options.content) : parse(options.content, { columns: true, bom: true, skip_empty_lines: true, trim: true, max_record_size: 20000 });
  const list = Array.isArray(rows) ? rows : rows.matches;
  if (!Array.isArray(list)) throw new Error('JSON mora sadržati listu utakmica ili matches niz.');
  return inspectDataset(list, raw => {
    if (raw.league && englishLeague(String(raw.league))?.id !== league.id || raw.season && historicalSeason(String(raw.season)) !== season) return null;
    return basicObservation(raw, league.id, season, 'manual', sourceUrl, options.sourceName);
  }, { league: league.id, season, provider: 'manual', sourceUrl, license: `Permission confirmed: ${options.sourceName.trim().slice(0, 100)}`, warnings: [] });
}
export async function repositoryHistoricalDatasets(): Promise<HistoricalDataset[]> {
  const archive = JSON.parse(await readFile(new URL('../../data/match-history/england.json', import.meta.url), 'utf8'));
  if (!Array.isArray(archive.seasons)) throw new Error('Postojeća engleska arhiva nije validna.');
  return archive.seasons.map((item: any) => {
    const league = englishLeague(item.competition), season = historicalSeason(item.season);
    if (!league || !season || !Array.isArray(item.matches)) throw new Error('Arhiva sadrži nepodržanu ligu ili sezonu.');
    const sourceUrl = `https://github.com/openfootball/football.json/blob/master/${item.sourcePath}`;
    return inspectDataset(item.matches, raw => basicObservation(raw, league.id, season, 'openfootball', sourceUrl), {
      league: league.id, season, provider: 'openfootball', sourceUrl, license: 'CC0-1.0',
      warnings: [`Postojeći repozitorijumski snapshot: ${archive.asOf}; blob ${item.sourceBlob || 'nije zabeležen'}.`],
    });
  });
}
