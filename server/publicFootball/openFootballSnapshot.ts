import { ENGLISH_PYRAMID, englishClubName } from '../footballAnalytics/englishPyramid.js';
import { hashId, nameKey } from '../footballAnalytics/normalization.js';
import { localDate } from '../sportsApi.js';
import type { PublicMatch, PublicSnapshot, PublicSnapshotProvenance, PublicSnapshotSourceFile } from '../../src/types/publicFootball.js';
import { snapshotFromMatches } from './store.js';

const REPOSITORY = 'openfootball/football.json';
const ROOT = `https://github.com/${REPOSITORY}`;
const API = `https://api.github.com/repos/${REPOSITORY}`;
const RAW = `https://raw.githubusercontent.com/${REPOSITORY}/master`;
const LICENSE = 'CC0 1.0';
const LICENSE_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';
const DATASETS = [
  { path: '2026-27/en.1.json', tier: 1 },
  { path: '2026-27/en.2.json', tier: 2 },
] as const;

type Score = { home: number | null; away: number | null };
type RawMatch = { date?: unknown; time?: unknown; team1?: unknown; team2?: unknown; score?: { ht?: unknown; ft?: unknown } };
type LiveFile = { path: string; blobSha: string; commitSha: string; committedAt: string | null; records: RawMatch[] };
type DatasetSummary = { path: string; blobSha: string; commitSha: string; committedAt: string | null; records: number; finished: number; withHt: number };

const score = (value: unknown): Score => Array.isArray(value) && value.length === 2
  && value.every((part) => Number.isInteger(part) && part >= 0 && part < 100)
  ? { home: value[0] as number, away: value[1] as number }
  : { home: null, away: null };
const complete = (value: Score) => value.home !== null && value.away !== null;
const matchKey = (match: Pick<PublicMatch, 'league' | 'season' | 'date' | 'homeTeam' | 'awayTeam'>) =>
  [match.league.slug, match.season, match.date, nameKey(match.homeTeam), nameKey(match.awayTeam)].join('|');
const seasonFromPath = (path: string) => path.split('/')[0].replace('-', '/');

async function getJson(url: string, accept = 'application/vnd.github+json') {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: accept, 'User-Agent': 'EliteVIPTips-public-snapshot-import' },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) return await response.json() as any;
      const retryable = response.status === 429 || response.status >= 500;
      const detail = response.status === 403 ? 'GitHub API limit ili dozvola nije dostupna.' : `OpenFootball izvor je vratio HTTP ${response.status}.`;
      if (!retryable || attempt === 2) throw new Error(detail);
      const retryAfter = Number(response.headers.get('retry-after'));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 3) * 1000 : 250 * (attempt + 1)));
    } catch (error) {
      lastError = error;
      if (attempt === 2 || error instanceof Error && /vratio HTTP|API limit|dozvola/.test(error.message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('OpenFootball podaci nisu dostupni.');
}

export async function fetchLatestOpenFootballEnglishFiles(): Promise<{ files: LiveFile[]; summaries: DatasetSummary[]; retrievedAt: string }> {
  const retrievedAt = new Date().toISOString();
  const files: LiveFile[] = [];
  const summaries: DatasetSummary[] = [];
  for (const expected of DATASETS) {
    const metadata = await getJson(`${API}/contents/${expected.path}?ref=master`);
    if (typeof metadata.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(metadata.sha) || metadata.path !== expected.path)
      throw new Error(`OpenFootball fajl ${expected.path} nema validne metapodatke.`);
    const [content, commits] = await Promise.all([
      getJson(`${RAW}/${expected.path}`, 'application/json'),
      getJson(`${API}/commits?path=${encodeURIComponent(expected.path)}&per_page=1`),
    ]);
    const commit = Array.isArray(commits) ? commits[0] : undefined;
    const commitSha = typeof commit?.sha === 'string' && /^[a-f0-9]{40}$/i.test(commit.sha) ? commit.sha : '';
    const committedAt = typeof commit?.commit?.committer?.date === 'string' && Number.isFinite(Date.parse(commit.commit.committer.date))
      ? new Date(commit.commit.committer.date).toISOString() : null;
    if (!commitSha || !Array.isArray(content.matches)) throw new Error(`OpenFootball fajl ${expected.path} nema validan commit ili listu utakmica.`);
    files.push({ path: expected.path, blobSha: metadata.sha.toLowerCase(), commitSha, committedAt, records: content.matches as RawMatch[] });
    const season = seasonFromPath(expected.path);
    const league = ENGLISH_PYRAMID.find((item) => item.tier === expected.tier)!;
    const matches = content.matches.map((row: RawMatch) => toPublicMatch(row, season, league, expected.path, metadata.sha, committedAt, new Date(retrievedAt))).filter(Boolean) as PublicMatch[];
    summaries.push({ path: expected.path, blobSha: metadata.sha.toLowerCase(), commitSha, committedAt, records: content.matches.length,
      finished: matches.filter((match) => match.status === 'finished').length,
      withHt: matches.filter((match) => match.status === 'finished' && complete(match.ht)).length });
  }
  return { files, summaries, retrievedAt };
}

function toPublicMatch(row: RawMatch, season: string, league: typeof ENGLISH_PYRAMID[number], path: string, blobSha: string, committedAt: string | null, now: Date): PublicMatch | null {
  const date = typeof row.date === 'string' && /^\d{4}-\d\d-\d\d$/.test(row.date) && Number.isFinite(Date.parse(`${row.date}T12:00:00Z`)) ? row.date : '';
  const homeTeam = englishClubName(typeof row.team1 === 'string' ? row.team1 : '');
  const awayTeam = englishClubName(typeof row.team2 === 'string' ? row.team2 : '');
  if (!date || !homeTeam || !awayTeam || nameKey(homeTeam) === nameKey(awayTeam)) return null;
  const future = date > localDate(now);
  const rawFt = score(row.score?.ft);
  const rawHt = score(row.score?.ht);
  const ft = !future && complete(rawFt) ? rawFt : { home: null, away: null };
  let ht = !future && complete(ft) && complete(rawHt) ? rawHt : { home: null, away: null };
  if (complete(ht) && complete(ft) && (ht.home! > ft.home! || ht.away! > ft.away!)) ht = { home: null, away: null };
  const rawTime = typeof row.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.time) ? row.time : null;
  const status: PublicMatch['status'] = complete(ft) ? 'finished' : future ? 'scheduled' : 'unknown';
  const leagueSlug = `england-${league.id}`;
  return {
    id: hashId('openfootball-public', leagueSlug, season, date, nameKey(homeTeam), nameKey(awayTeam)),
    league: { slug: leagueSlug, name: league.name, country: 'England' }, season, date, time: rawTime, kickoffAt: null,
    homeTeam, awayTeam, status, ht, ft, checkedAt: committedAt, sources: ['openfootball'],
  };
}

export function mergeOpenFootballSnapshot(base: PublicSnapshot, live: { files: LiveFile[]; summaries: DatasetSummary[]; retrievedAt: string }, now = new Date()) {
  const matches = [...base.matches];
  const byKey = new Map(matches.map((match, index) => [matchKey(match), index]));
  let added = 0, duplicates = 0, scoreUpdates = 0, rejected = 0, conflicts = 0;
  for (const file of live.files) {
    const tier = Number(file.path.match(/(?:^|\/)en\.(\d+)\.json$/)?.[1]);
    const league = ENGLISH_PYRAMID.find((item) => item.tier === tier);
    if (!league || !/^2026-27\/en\.[12]\.json$/.test(file.path)) throw new Error('OpenFootball importer je dobio fajl van dozvoljenog engleskog opsega.');
    const season = seasonFromPath(file.path);
    for (const row of file.records) {
      const incoming = toPublicMatch(row, season, league, file.path, file.blobSha, file.committedAt, now);
      if (!incoming) { rejected++; continue; }
      const key = matchKey(incoming);
      const index = byKey.get(key);
      if (index === undefined) {
        byKey.set(key, matches.length);
        matches.push(incoming);
        added++;
        continue;
      }
      duplicates++;
      const current = matches[index];
      const hasCurrentFt = complete(current.ft), hasIncomingFt = complete(incoming.ft);
      if (hasCurrentFt && hasIncomingFt && (current.ft.home !== incoming.ft.home || current.ft.away !== incoming.ft.away)) conflicts++;
      const ft = !hasCurrentFt && hasIncomingFt ? incoming.ft : current.ft;
      const incomingHtAllowed = complete(incoming.ht) && complete(ft) && incoming.ht.home! <= ft.home! && incoming.ht.away! <= ft.away!;
      const ht = !complete(current.ht) && incomingHtAllowed ? incoming.ht : current.ht;
      if (!hasCurrentFt && hasIncomingFt) scoreUpdates++;
      matches[index] = {
        ...current,
        time: current.time || incoming.time,
        status: complete(ft) ? 'finished' : current.status === 'unknown' && incoming.status === 'scheduled' ? current.status : incoming.status,
        ft, ht,
        checkedAt: [current.checkedAt, incoming.checkedAt].filter((value): value is string => Boolean(value)).sort().at(-1) || null,
        sources: [...new Set([...current.sources, ...incoming.sources])].sort(),
      };
    }
  }
  const liveProvenance: PublicSnapshotProvenance = {
    source: 'OpenFootball current English league files', repository: ROOT, license: LICENSE, licenseUrl: LICENSE_URL,
    retrievedAt: live.retrievedAt, asOf: live.summaries.map((file) => file.committedAt || '').sort().at(-1) || '',
    files: live.summaries.map((file) => ({ path:file.path,blobSha:file.blobSha,season:'2026/27',records:file.records,finished:file.finished,withHt:file.withHt,commitSha:file.commitSha,committedAt:file.committedAt })),
  };
  const provenance = [...(base.provenance || []).map((source) => ({
    ...source,
    files: source.files.filter((file) => !live.summaries.some((latest) => latest.path === file.path && latest.blobSha === file.blobSha)),
  })).filter((source) => source.files.length), liveProvenance];
  const snapshot = snapshotFromMatches(matches, now, base.truncated, base.excluded + rejected, provenance);
  return { snapshot, summary: { baseMatches:base.matches.length, added, duplicates, scoreUpdates, conflicts, rejected, finalMatches:matches.length,
    finalFinished:matches.filter((match)=>match.status==='finished').length,finalWithHt:matches.filter((match)=>match.status==='finished'&&complete(match.ht)).length,
    finalScheduled:matches.filter((match)=>match.status==='scheduled').length } };
}

export const openFootballSourceInfo = { repository:ROOT, license:LICENSE, licenseUrl:LICENSE_URL, datasets:DATASETS };
