import { createHash } from 'node:crypto';
import type { DailyProposal } from '../src/types.js';
import { cachedSportsJson, freeFixturesForDate, teamKey } from './freeFootballFeeds.js';
import { isUpcomingFixture, type Fixture, type Odds } from './dailyPickSelection.js';
import { loadIndependentOdds, oddsSportForFixture } from './oddsProvider.js';
import { localDate, numberSetting } from './sportsApi.js';

const numericId = (value: string) => parseInt(createHash('sha256').update(value).digest('hex').slice(0, 12), 16);
const priority = (key: string) => ['soccer_uefa', 'soccer_fifa', 'soccer_epl', 'soccer_spain_la_liga', 'soccer_italy_serie_a',
  'soccer_germany_bundesliga', 'soccer_france_ligue_one'].findIndex((prefix) => key.startsWith(prefix));
const leagueRank = (key: string) => priority(key) < 0 ? 20 : priority(key);

export const proposalIdentity = (home: string, away: string, kickoff: string) =>
  `proposal-${createHash('sha256').update(`${teamKey(home)}:${teamKey(away)}:${Date.parse(kickoff)}`).digest('hex').slice(0, 24)}`;

export function mapOddsFixture(event: any, sport: { key: string; title: string }): Fixture | null {
  if (!/^soccer_[a-z0-9_]+$/.test(sport.key) || event.sport_key !== sport.key || !event.id
    || !event.home_team?.trim() || !event.away_team?.trim() || !Number.isFinite(Date.parse(event.commence_time))) return null;
  return {
    sourceProvider: 'the-odds-api', providerId: String(event.id), oddsSportKey: sport.key,
    fixture: { id: numericId(`odds:${event.id}`), date: new Date(event.commence_time).toISOString(), status: { short: 'NS' } },
    league: { id: numericId(sport.key), name: sport.title },
    teams: { home: { id: numericId(event.home_team), name: event.home_team }, away: { id: numericId(event.away_team), name: event.away_team } },
  };
}

type Offer = { prediction: string; odds: number; category: string; bookmaker: string; updatedAt?: string };
export function proposalOffers(fixture: Fixture, odds: Odds[], now = new Date()): Offer[] {
  const offers: Offer[] = [];
  for (const row of odds.filter((item) => item.fixture.id === fixture.fixture.id)) {
    if (!row.update || !Number.isFinite(Date.parse(row.update)) || Math.abs(now.getTime() - Date.parse(row.update)) > 3 * 3600_000) continue;
    for (const bookmaker of row.bookmakers) for (const bet of bookmaker.bets) for (const value of bet.values) {
      const price = Number(value.odd);
      if (!Number.isFinite(price) || price < 1.2 || price > 3) continue;
      const market = bet.name.trim().toLowerCase().replace(/\s+/g, ' '), outcome = value.value.trim().toLowerCase();
      let prediction = '', category = '';
      if (['match winner', 'fulltime result', '1x2'].includes(market)) {
        prediction = ({ home: '1', away: '2', draw: 'X', '1': '1', '2': '2', x: 'X' } as Record<string, string>)[outcome] || '';
        category = 'result';
      } else if (['goals over/under', 'total goals', 'over/under'].includes(market) && /^(over|under) \d+\.5$/.test(outcome)) {
        prediction = `${outcome[0].toUpperCase()}${outcome.slice(1)}`;
        category = outcome.startsWith('over') ? 'goals' : 'under';
      } else if (['both teams score', 'both teams to score', 'btts'].includes(market) && ['yes', 'no'].includes(outcome)) {
        prediction = outcome === 'yes' ? 'GG' : 'NG'; category = 'btts';
      }
      if (prediction) offers.push({ prediction, category, odds: price, bookmaker: bookmaker.name, updatedAt: row.update });
    }
  }
  // Choose from actual bookmaker prices, never from invented probabilities or fair odds.
  return offers.sort((a, b) => Math.abs(a.odds - 1.8) - Math.abs(b.odds - 1.8) || a.prediction.localeCompare(b.prediction));
}

export function bestProposalOffer(offers: Offer[], prediction: string): Offer | undefined {
  return offers.filter((offer) => offer.prediction === prediction)
    .sort((a, b) => b.odds - a.odds || (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.bookmaker.localeCompare(b.bookmaker))[0];
}

export function buildDailyProposals(fixtures: Fixture[], odds: Odds[], now = new Date(), limit = 10): DailyProposal[] {
  const seen = new Set<string>(), usedCategories = new Map<string, number>();
  const rows = fixtures.filter((fixture) => isUpcomingFixture(fixture, now))
    .map((fixture) => ({ fixture, offers: proposalOffers(fixture, odds, now) }))
    .sort((a, b) => Number(Boolean(b.offers.length)) - Number(Boolean(a.offers.length))
      || leagueRank(oddsSportForFixture(a.fixture) || '') - leagueRank(oddsSportForFixture(b.fixture) || '')
      || a.fixture.fixture.date.localeCompare(b.fixture.fixture.date));
  const proposals: DailyProposal[] = [];
  for (const { fixture, offers } of rows) {
    const id = proposalIdentity(fixture.teams.home.name, fixture.teams.away.name, fixture.fixture.date);
    if (seen.has(id)) continue;
    seen.add(id);
    const selectedMarket = [...offers].sort((a, b) => (usedCategories.get(a.category) || 0) - (usedCategories.get(b.category) || 0)
      || Math.abs(a.odds - 1.8) - Math.abs(b.odds - 1.8))[0];
    // Keep match/market selection unchanged; improve only its actual quoted price.
    const offer = selectedMarket ? bestProposalOffer(offers, selectedMarket.prediction) : undefined;
    if (offer) usedCategories.set(offer.category, (usedCategories.get(offer.category) || 0) + 1);
    const date = localDate(new Date(fixture.fixture.date));
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: '2-digit', minute: '2-digit' }).format(new Date(fixture.fixture.date));
    proposals.push({
      id, date, createdAt: now.toISOString(),
      ...(offer ? { bookmaker: offer.bookmaker, oddsUpdatedAt: offer.updatedAt } : {}),
      reviewNote: offer ? 'Trzisni predlog sa stvarnom kvotom. Potrebna je vasa procena pre objave; statisticka prednost nije potvrdjena.'
        : 'Stvaran mec bez dostupne proverene kvote. Unesite tip i stvarnu kvotu pre objave.',
      analysis: {
        id, source: fixture.sourceProvider || 'api-football', sport: 'football', status: 'ACTIVE',
        fixtureId: fixture.fixture.id, providerFixtureId: fixture.providerId, kickoffAt: fixture.fixture.date,
        oddsProvider: offer ? 'The Odds API' : undefined, date, time, matchTime: time, kickoffTime: time,
        league: fixture.league.name, leagueId: fixture.league.id, homeTeam: fixture.teams.home.name, awayTeam: fixture.teams.away.name,
        homeLogo: fixture.teams.home.logo, awayLogo: fixture.teams.away.logo,
        homeFormPercent: null, awayFormPercent: null,
        prediction: offer?.prediction || '', odds: offer?.odds || 0, reasoning: '',
        access: proposals.length === 0 ? 'FREE' : 'VIP', units: 3, sortOrder: proposals.length, enabled: false, hidden: true,
      },
    });
    if (proposals.length === limit) break;
  }
  return proposals;
}

export async function loadDailyMarketData(date: string, now = new Date()) {
  const warnings: string[] = [];
  let fixtures: Fixture[] = [];
  const key = process.env.ODDS_API_KEY?.trim();
  let leaguesChecked = 0;
  if (key) {
    const url = new URL('https://api.the-odds-api.com/v4/sports/');
    url.searchParams.set('apiKey', key);
    try {
      const catalog = await cachedSportsJson(url, {}, 60 * 60000);
      if (!Array.isArray(catalog)) throw new Error('Invalid sports catalog.');
      const sports = catalog.filter((sport) => sport.active && !sport.has_outrights && /^soccer_[a-z0-9_]+$/.test(sport.key))
        .sort((a, b) => leagueRank(a.key) - leagueRank(b.key) || a.key.localeCompare(b.key))
        .slice(0, numberSetting('DAILY_DISCOVERY_LEAGUE_LIMIT', 40, 1, 60));
      // Catalog/events requests consume no Odds API credits; odds remain limited to two leagues.
      const batches = await Promise.allSettled(sports.map(async (sport) => {
        const eventsUrl = new URL(`https://api.the-odds-api.com/v4/sports/${sport.key}/events/`);
        eventsUrl.searchParams.set('apiKey', key);
        const events = await cachedSportsJson(eventsUrl, {}, 30 * 60000);
        if (!Array.isArray(events)) throw new Error('Invalid events response.');
        return events.map((event) => mapOddsFixture(event, sport)).filter((fixture): fixture is Fixture => Boolean(fixture))
          .filter((fixture) => localDate(new Date(fixture.fixture.date)) === date && isUpcomingFixture(fixture, now));
      }));
      leaguesChecked = batches.filter((batch) => batch.status === 'fulfilled').length;
      fixtures = batches.flatMap((batch) => batch.status === 'fulfilled' ? batch.value : []);
      if (leaguesChecked < sports.length) warnings.push('Deo takmicenja trenutno nije dostupan kod izvora rasporeda.');
    } catch { warnings.push('Izvor rasporeda i kvota nije dostupan. Proverite ODDS_API_KEY ili limit naloga.'); }
  } else warnings.push('ODDS_API_KEY nije podesen; dostupni su samo mecevi iz besplatnih izvora, bez izmisljenih kvota.');
  if (!fixtures.length) {
    try { fixtures.push(...(await freeFixturesForDate(date)).filter((fixture) => isUpcomingFixture(fixture, now))); }
    catch { warnings.push('Dodatni izvor rasporeda trenutno nije dostupan.'); }
  }
  fixtures.sort((a, b) => leagueRank(oddsSportForFixture(a) || '') - leagueRank(oddsSportForFixture(b) || ''));
  const prices = await loadIndependentOdds(fixtures, now);
  if (prices.warning) warnings.push(prices.warning);
  return { fixtures, odds: prices.odds, leaguesChecked, warnings };
}

export async function loadAdminDailyProposals(date: string, now = new Date()) {
  const { fixtures, odds, leaguesChecked, warnings } = await loadDailyMarketData(date, now);
  const proposals = buildDailyProposals(fixtures, odds, now);
  if (!proposals.length) warnings.push('Za izabrani dan nema buducih meceva u dostupnim izvorima.');
  return { proposals, fixtures: new Set(fixtures.map((fixture) => proposalIdentity(fixture.teams.home.name, fixture.teams.away.name, fixture.fixture.date))).size,
    priced: proposals.filter((proposal) => proposal.analysis.odds > 1).length, leaguesChecked, warnings };
}
