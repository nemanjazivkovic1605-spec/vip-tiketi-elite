import { cachedSportsJson, teamKey } from './freeFootballFeeds.js';
import type { Fixture, Odds } from './dailyPickSelection.js';

const sportForLeague: Array<[RegExp, string]> = [
  [/premier league|premiership/i, 'soccer_epl'], [/\bbundesliga\s+2(?!\d)|\b2\..*bundesliga/i, 'soccer_germany_bundesliga2'],
  [/bundesliga|1\. fussball/i, 'soccer_germany_bundesliga'], [/la liga|primera division/i, 'soccer_spain_la_liga'],
  [/serie a/i, 'soccer_italy_serie_a'], [/ligue 1/i, 'soccer_france_ligue_one'],
  [/champions league/i, 'soccer_uefa_champs_league'], [/europa league/i, 'soccer_uefa_europa_league'],
  [/world cup|fifa wm/i, 'soccer_fifa_world_cup'],
];
export const oddsSportForFixture = (fixture: Fixture) => {
  if (fixture.sourceProvider === 'the-odds-api' && /^soccer_[a-z0-9_]+$/.test(fixture.oddsSportKey || '')) return fixture.oddsSportKey!;
  const league = fixture.league.name;
  // Do not confuse other countries' Premier Leagues with the English competition.
  if (/premier|premiership/i.test(league) && !/english|england/i.test(league) && fixture.league.country !== 'England') return null;
  if (/serie a/i.test(league) && /brazil|brasil/i.test(`${league} ${fixture.league.country || ''}`)) return 'soccer_brazil_campeonato';
  return sportForLeague.find(([pattern]) => pattern.test(league))?.[1] || null;
};

export function mapVerifiedOdds(fixture: Fixture, events: any[], sport: string, now = new Date()): Odds[] {
  const candidates = events.filter((event) => event.sport_key === sport
    && teamKey(event.home_team) === teamKey(fixture.teams.home.name)
    && teamKey(event.away_team) === teamKey(fixture.teams.away.name)
    && Math.abs(Date.parse(event.commence_time) - Date.parse(fixture.fixture.date)) <= 10 * 60000);
  if (candidates.length !== 1) return [];
  const event = candidates[0];
  return (event.bookmakers || []).flatMap((bookmaker: any, index: number) => {
    if (!bookmaker.title || !bookmaker.last_update || !Number.isFinite(Date.parse(bookmaker.last_update))
      || Math.abs(now.getTime() - Date.parse(bookmaker.last_update)) > 3 * 3600000) return [];
    const bets = (bookmaker.markets || []).flatMap((market: any) => {
      if (!['h2h', 'totals', 'btts'].includes(market.key)) return [];
      const values = (market.outcomes || []).flatMap((outcome: any) => {
        const price = Number(outcome.price);
        if (!Number.isFinite(price) || price <= 1) return [];
        let value: string | null = null;
        if (market.key === 'h2h') value = teamKey(outcome.name) === teamKey(fixture.teams.home.name) ? 'Home'
          : teamKey(outcome.name) === teamKey(fixture.teams.away.name) ? 'Away' : outcome.name === 'Draw' ? 'Draw' : null;
        if (market.key === 'totals' && ['Over', 'Under'].includes(outcome.name) && Number.isFinite(outcome.point)) value = `${outcome.name} ${outcome.point}`;
        if (market.key === 'btts' && ['Yes', 'No'].includes(outcome.name)) value = outcome.name;
        return value ? [{ value, odd: String(price) }] : [];
      });
      return values.length ? [{ name: market.key === 'h2h' ? 'Match Winner' : market.key === 'totals' ? 'Goals Over/Under' : 'Both Teams Score', values }] : [];
    });
    return bets.length ? [{ fixture: { id: fixture.fixture.id }, update: bookmaker.last_update, bookmakers: [{ id: index + 1, name: bookmaker.title, bets }] }] : [];
  });
}

export async function loadIndependentOdds(fixtures: Fixture[], now = new Date()) {
  const key = process.env.ODDS_API_KEY?.trim();
  if (!key) return { odds: [] as Odds[], warning: 'Mecevi su dostupni. Za automatsko dodavanje stvarnih kvota podesite ODDS_API_KEY (besplatan The Odds API nalog).' };
  // Two leagues x two featured markets per run; the same response covers all lookahead dates.
  const sports = [...new Set(fixtures.map(oddsSportForFixture).filter(Boolean))].slice(0, 2) as string[];
  const odds: Odds[] = [];
  let failures = 0;
  for (const sport of sports) {
    try {
      const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds/`);
      Object.entries({ apiKey: key, regions: 'eu', markets: 'h2h,totals', oddsFormat: 'decimal', dateFormat: 'iso' }).forEach(([name, value]) => url.searchParams.set(name, value));
      const events = await cachedSportsJson(url, {}, 30 * 60000);
      if (!Array.isArray(events)) throw new Error('Invalid odds response.');
      fixtures.filter((fixture) => oddsSportForFixture(fixture) === sport).forEach((fixture) => odds.push(...mapVerifiedOdds(fixture, events, sport, now)));
    } catch { failures++; }
  }
  return { odds, warning: failures ? 'Izvor kvota nije dostupan za deo liga; utakmice bez proverene kvote nisu objavljene.' : undefined };
}
