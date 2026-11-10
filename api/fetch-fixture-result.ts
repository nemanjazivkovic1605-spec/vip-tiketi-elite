import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAdminRequest } from '../server/adminAuth.js';
import { requestSports } from '../server/sportsApi.js';
import { fullTimeFixtureScore } from '../server/resultScores.js';
import { findFreeFixture } from '../server/freeFootballFeeds.js';

type ApiRequest = IncomingMessage & { body?: unknown };
type FixtureLookup = {
  fixtureId?: string;
  date?: string;
  league?: string;
  homeTeam: string;
  awayTeam: string;
};
type ApiFixture = {
  fixture?: {
    id?: number;
    date?: string;
    status?: { long?: string; short?: string; elapsed?: number | null };
  };
  league?: { name?: string };
  teams?: { home?: { name?: string }; away?: { name?: string } };
  goals?: { home?: number | null; away?: number | null };
  score?: { fulltime?: { home?: number | null; away?: number | null } };
};

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
const POSTPONED_STATUSES = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO']);
const MATCH_TIMEZONE = 'Europe/Belgrade';

const sendJson = (response: ServerResponse, status: number, payload: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const readBody = async (request: ApiRequest) => {
  if (request.body && typeof request.body === 'object') return request.body;
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown : {};
};

const normalize = (value?: string) =>
  (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const sameTeam = (expected?: string, actual?: string) => {
  const left = normalize(expected);
  const right = normalize(actual);
  return Boolean(left && right && (left.includes(right) || right.includes(left)));
};

const localMatchDate = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-CA', { timeZone: MATCH_TIMEZONE }).format(date)
    : value.slice(0, 10);
};

const parseLookup = (input: unknown): FixtureLookup | null => {
  if (!input || typeof input !== 'object') return null;
  const data = input as Record<string, unknown>;
  const homeTeam = typeof data.homeTeam === 'string' ? data.homeTeam.trim() : '';
  const awayTeam = typeof data.awayTeam === 'string' ? data.awayTeam.trim() : '';
  if (!homeTeam || !awayTeam) return null;
  return {
    fixtureId: typeof data.fixtureId === 'string' || typeof data.fixtureId === 'number' ? String(data.fixtureId) : undefined,
    date: typeof data.date === 'string' ? data.date.slice(0, 10) : undefined,
    league: typeof data.league === 'string' ? data.league.trim() : undefined,
    homeTeam,
    awayTeam,
  };
};

const requestFixtures = async (params: Record<string, string>) =>
  (await requestSports<ApiFixture>('/fixtures', params, { ttlMs: 2 * 60_000 })).response;

export const selectFixture = (fixtures: ApiFixture[], lookup: FixtureLookup) => {
  const expectedLeague = normalize(lookup.league);
  return fixtures.find((fixture) => {
    const actualLeague = normalize(fixture.league?.name);
    return sameTeam(lookup.homeTeam, fixture.teams?.home?.name)
      && sameTeam(lookup.awayTeam, fixture.teams?.away?.name)
      && (!expectedLeague || Boolean(actualLeague) && (expectedLeague.includes(actualLeague) || actualLeague.includes(expectedLeague)));
  }) || fixtures.find((fixture) =>
    sameTeam(lookup.homeTeam, fixture.teams?.home?.name) && sameTeam(lookup.awayTeam, fixture.teams?.away?.name),
  );
};

export const findFixtureResult = async (lookup: FixtureLookup) => {
  let fixtures: ApiFixture[] = [];
  try { if (lookup.fixtureId) fixtures = await requestFixtures({ id: lookup.fixtureId }); } catch { /* Independent result sources follow. */ }
  let fixture = selectFixture(fixtures, lookup);
  let lookupMethod = fixture ? 'fixture_id' : 'teams_date_league';

  if (!fixture && lookup.date) {
    try {
      fixtures = await requestFixtures({ date: lookup.date.slice(0, 10), timezone: MATCH_TIMEZONE });
      fixture = selectFixture(fixtures, lookup);
    } catch { /* Continue with free sources. */ }
    if (!fixture) {
      fixture = await findFreeFixture({ ...lookup, date: lookup.date }) || undefined;
    }
  }
  if (!fixture) return null;

  const shortStatus = fixture.fixture?.status?.short || '';
  const { homeScore, awayScore } = fullTimeFixtureScore(fixture);
  return {
    fixtureId: fixture.fixture?.id,
    lookupMethod,
    date: localMatchDate(fixture.fixture?.date),
    league: fixture.league?.name,
    homeTeam: fixture.teams?.home?.name,
    awayTeam: fixture.teams?.away?.name,
    homeScore,
    awayScore,
    status: shortStatus,
    statusLong: fixture.fixture?.status?.long,
    elapsed: fixture.fixture?.status?.elapsed ?? null,
    finished: FINISHED_STATUSES.has(shortStatus),
    postponed: POSTPONED_STATUSES.has(shortStatus),
  };
};

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    if (!await isAdminRequest(request)) {
      sendJson(response, 403, { error: 'Admin authorization required.' });
      return;
    }
    const lookup = parseLookup(await readBody(request));
    if (!lookup) {
      sendJson(response, 400, { error: 'Home team and away team are required.' });
      return;
    }
    const result = await findFixtureResult(lookup);
    sendJson(response, 200, { result });
  } catch (error) {
    sendJson(response, 502, { error: error instanceof Error ? error.message : 'Result request failed.' });
  }
}
