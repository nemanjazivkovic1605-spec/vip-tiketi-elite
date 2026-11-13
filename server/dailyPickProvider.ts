import { buildCandidates, isUpcomingFixture, type Candidate, type Fixture, type Odds, type Prediction } from './dailyPickSelection.js';
import { getSportsKey, numberSetting, requestSports } from './sportsApi.js';
import { freeFixturesForDate, historicalModel, teamKey } from './freeFootballFeeds.js';
import { buildDailyProposals, loadDailyMarketData, proposalOffers } from './dailyProposalProvider.js';
import { ODDS_CACHE_TTL_MS } from './oddsPolicy.js';

async function loadFreeCandidates(date: string, now: Date, deadline: number) {
  const data = await loadDailyMarketData(date, now);
  const fixtures = data.fixtures;
  const upcoming = fixtures.filter((fixture) => isUpcomingFixture(fixture, now));
  const candidates: Candidate[] = [];
  const proposals = buildDailyProposals(upcoming, data.odds, now).filter(item => item.date === date && item.analysis.odds > 1);
  let known: Awaited<ReturnType<typeof freeFixturesForDate>> = [];
  if (proposals.length && Date.now() < deadline - 15000) {
    try { known = await freeFixturesForDate(date); }
    catch { data.warnings.push('Dodatna istorijska statistika trenutno nije dostupna. Ne prikazuje se izmisljena procena sigurnosti.'); }
  }
  let modeled = 0;
  const modelLimit = numberSetting('DAILY_PREDICTION_LIMIT', 4, 3, 10);
  for (const proposal of proposals) {
    if (Date.now() >= deadline) break;
    const item = proposal.analysis;
    const fixture = known.find(match => teamKey(match.teams.home.name) === teamKey(item.homeTeam)
      && teamKey(match.teams.away.name) === teamKey(item.awayTeam)
      && Math.abs(Date.parse(match.fixture.date) - Date.parse(item.kickoffAt || '')) <= 600000);
    if (fixture && modeled < modelLimit && Date.now() < deadline - 15000) {
      modeled++;
      const model = await historicalModel(fixture).catch(() => null);
      if (model) {
        const prices = data.odds.filter(offer => offer.fixture.id === item.fixtureId)
          .map(offer => ({ ...offer, fixture: { id: fixture.fixture.id } }));
        candidates.push(...buildCandidates(fixture, prices, model, now));
        // Do not replace a rejected statistical pick with a market-only claim.
        continue;
      }
    }
    const offers = proposalOffers(upcoming.find(match => match.fixture.id === item.fixtureId)!, data.odds, now);
    const best = new Map<string, (typeof offers)[number]>();
    for (const quote of offers) if (!best.has(quote.prediction) || best.get(quote.prediction)!.odds < quote.odds) best.set(quote.prediction, quote);
    for (const quote of best.values()) {
      if (quote.odds < 1.2 || quote.odds > 3) continue;
      candidates.push({ ...item, prediction: quote.prediction, odds: quote.odds, analysisSource: 'market-odds', marketCategory: quote.category,
        enabled: true, hidden: false, manualOverride: false, resultManualOverride: false,
        analysis: '', reasoning: '', bookmaker: quote.bookmaker, oddsUpdatedAt: quote.updatedAt,
        selectionScore: -100 - Math.abs(Math.log(quote.odds / 1.8)) * 10,
      });
    }
  }
  if (!candidates.length) data.warnings.push('Nema buducih meceva sa dovoljno svezom, proverenom kvotom za objavu.');
  return { candidates, fixtures: fixtures.length, upcoming: upcoming.length, oddsPages: Number(data.odds.length > 0), oddsPagesTotal: 0,
    warnings: data.warnings };
}

export async function loadDailyCandidates(date: string, now = new Date(), deadline = Date.now() + 220_000) {
  if (!getSportsKey()) return loadFreeCandidates(date, now, deadline);
  let fixtures: Fixture[];
  try { fixtures = (await requestSports<Fixture>('/fixtures', { date, timezone: 'Europe/Belgrade' })).response; }
  catch { return loadFreeCandidates(date, now, deadline); }
  const upcoming = fixtures.filter((fixture) => isUpcomingFixture(fixture, now))
    .sort((a, b) => a.fixture.date.localeCompare(b.fixture.date) || a.fixture.id - b.fixture.id);
  if (!upcoming.length) return loadFreeCandidates(date, now, deadline);
  const odds: Odds[] = [];
  const pageLimit = numberSetting('DAILY_ODDS_PAGE_LIMIT', 3, 1, 10);
  let pagesTotal = 1, pagesRead = 0;
  for (let page = 1; page <= Math.min(pagesTotal, pageLimit) && Date.now() < deadline; page++) {
    let payload;
    try { payload = await requestSports<Odds>('/odds', { date, page: String(page), timezone: 'Europe/Belgrade' }, { ttlMs: ODDS_CACHE_TTL_MS }); }
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
  if (!candidates.length) return loadFreeCandidates(date, now, deadline);
  return { candidates, fixtures: fixtures.length, upcoming: upcoming.length, oddsPages: pagesRead, oddsPagesTotal: pagesTotal, warnings };
}
