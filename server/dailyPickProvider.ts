import { buildCandidate, isUpcomingFixture, type Candidate, type Fixture, type Odds, type Prediction } from './dailyPickSelection.js';
import { numberSetting, requestSports } from './sportsApi.js';

export async function loadDailyCandidates(date: string, now = new Date(), deadline = Date.now() + 220_000) {
  const fixtures = (await requestSports<Fixture>('/fixtures', { date, timezone: 'Europe/Belgrade' })).response;
  const upcoming = fixtures.filter((fixture) => isUpcomingFixture(fixture, now))
    .sort((a, b) => a.fixture.date.localeCompare(b.fixture.date) || a.fixture.id - b.fixture.id);
  if (!upcoming.length) return { candidates: [] as Candidate[], fixtures: fixtures.length, upcoming: 0, oddsPages: 0, oddsPagesTotal: 0, warnings: [] as string[] };
  const odds: Odds[] = [];
  const pageLimit = numberSetting('DAILY_ODDS_PAGE_LIMIT', 3, 1, 10);
  let pagesTotal = 1, pagesRead = 0;
  for (let page = 1; page <= Math.min(pagesTotal, pageLimit) && Date.now() < deadline; page++) {
    const payload = await requestSports<Odds>('/odds', { date, page: String(page), timezone: 'Europe/Belgrade' }, { ttlMs: 30 * 60_000 });
    odds.push(...payload.response);
    pagesTotal = payload.paging?.total || 1;
    pagesRead++;
  }
  const withOdds = upcoming.filter((fixture) => odds.some((offer) => offer.fixture?.id === fixture.fixture.id));
  const queue: Fixture[] = [];
  const leagueGroups = new Map<number, Fixture[]>();
  withOdds.forEach((fixture) => leagueGroups.set(fixture.league.id, [...(leagueGroups.get(fixture.league.id) || []), fixture]));
  while ([...leagueGroups.values()].some((group) => group.length)) {
    for (const group of leagueGroups.values()) { const fixture = group.shift(); if (fixture) queue.push(fixture); }
  }
  const candidates: Candidate[] = [];
  const warnings: string[] = [];
  const limit = numberSetting('DAILY_PREDICTION_LIMIT', 4, 3, 10);
  for (const fixture of queue.slice(0, limit)) {
    if (Date.now() >= deadline) { warnings.push('Vremenski budžet za preuzimanje je dostignut.'); break; }
    try {
      const payload = await requestSports<Prediction>('/predictions', { fixture: String(fixture.fixture.id) }, { ttlMs: 60 * 60_000 });
      const candidate = payload.response[0] && buildCandidate(fixture, odds, payload.response[0], new Date(Math.max(now.getTime(), Date.now())));
      if (candidate) candidates.push(candidate);
    } catch { warnings.push(`Prognoza nije dostupna za utakmicu ${fixture.fixture.id}.`); }
  }
  if (pagesTotal > pagesRead) warnings.push(`Pregledano ${pagesRead} od ${pagesTotal} stranica kvota radi kontrole potrošnje API-ja.`);
  if (!candidates.length) warnings.push('Nema budućih utakmica sa odgovarajućom stvarnom kvotom i API prognozom.');
  return { candidates, fixtures: fixtures.length, upcoming: upcoming.length, oddsPages: pagesRead, oddsPagesTotal: pagesTotal, warnings };
}
