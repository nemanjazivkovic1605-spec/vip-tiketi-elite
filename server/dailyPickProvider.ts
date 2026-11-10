import { buildCandidates, isUpcomingFixture, type Candidate, type Fixture, type Odds, type Prediction } from './dailyPickSelection.js';
import { getSportsKey, numberSetting, requestSports } from './sportsApi.js';
import { freeFixturesForDate, historicalModel } from './freeFootballFeeds.js';
import { loadIndependentOdds } from './oddsProvider.js';

async function loadFreeCandidates(date: string, now: Date, deadline: number) {
  const fixtures = await freeFixturesForDate(date);
  const upcoming = fixtures.filter((fixture) => isUpcomingFixture(fixture, now));
  const prices = await loadIndependentOdds(upcoming, now);
  const candidates: Candidate[] = [];
  for (const fixture of upcoming.filter((item) => prices.odds.some((offer) => offer.fixture.id === item.fixture.id)).slice(0, 10)) {
    if (Date.now() >= deadline) break;
    const model = await historicalModel(fixture);
    if (model) candidates.push(...buildCandidates(fixture, prices.odds, model, now));
  }
  return { candidates, fixtures: fixtures.length, upcoming: upcoming.length, oddsPages: Number(prices.odds.length > 0), oddsPagesTotal: 0,
    warnings: [prices.warning, !candidates.length ? 'Nijedan mec nema istovremeno proverenu kvotu i dovoljno statistike za automatsku objavu. Rucni unos ostaje dostupan.' : undefined].filter(Boolean) as string[] };
}

export async function loadDailyCandidates(date: string, now = new Date(), deadline = Date.now() + 220_000) {
  if (!getSportsKey()) return loadFreeCandidates(date, now, deadline);
  let fixtures: Fixture[];
  try { fixtures = (await requestSports<Fixture>('/fixtures', { date, timezone: 'Europe/Belgrade' })).response; }
  catch { return loadFreeCandidates(date, now, deadline); }
  const upcoming = fixtures.filter((fixture) => isUpcomingFixture(fixture, now))
    .sort((a, b) => a.fixture.date.localeCompare(b.fixture.date) || a.fixture.id - b.fixture.id);
  if (!upcoming.length) return { candidates: [] as Candidate[], fixtures: fixtures.length, upcoming: 0, oddsPages: 0, oddsPagesTotal: 0, warnings: [] as string[] };
  const odds: Odds[] = [];
  const pageLimit = numberSetting('DAILY_ODDS_PAGE_LIMIT', 3, 1, 10);
  let pagesTotal = 1, pagesRead = 0;
  for (let page = 1; page <= Math.min(pagesTotal, pageLimit) && Date.now() < deadline; page++) {
    let payload;
    try { payload = await requestSports<Odds>('/odds', { date, page: String(page), timezone: 'Europe/Belgrade' }, { ttlMs: 30 * 60_000 }); }
    catch { return loadFreeCandidates(date, now, deadline); }
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
      if (payload.response[0]) candidates.push(...buildCandidates(fixture, odds, payload.response[0], new Date(Math.max(now.getTime(), Date.now()))));
    } catch { warnings.push(`Prognoza nije dostupna za utakmicu ${fixture.fixture.id}.`); }
  }
  if (pagesTotal > pagesRead) warnings.push(`Pregledano ${pagesRead} od ${pagesTotal} stranica kvota radi kontrole potrošnje API-ja.`);
  if (!candidates.length) warnings.push('Nema budućih utakmica sa odgovarajućom stvarnom kvotom i API prognozom.');
  return { candidates, fixtures: fixtures.length, upcoming: upcoming.length, oddsPages: pagesRead, oddsPagesTotal: pagesTotal, warnings };
}
