import type { DailyAnalysisItem } from '../src/types.js';

export type Fixture = {
  sourceProvider?: 'football-data.org' | 'TheSportsDB' | 'OpenLigaDB';
  providerId?: string;
  fixture: { id: number; date: string; status: { short: string } };
  league: { id: number; name: string; country?: string };
  teams: { home: { id: number; name: string; logo?: string }; away: { id: number; name: string; logo?: string } };
};
export type Odds = {
  fixture: { id: number };
  update?: string;
  bookmakers: Array<{ id: number; name: string; bets: Array<{ name: string; values: Array<{ value: string; odd: string }> }> }>;
};
export type Prediction = {
  teams?: { home?: TeamStats; away?: TeamStats };
  predictions?: {
    winner?: { id?: number };
    win_or_draw?: boolean;
    percent?: { home?: string; draw?: string; away?: string };
  };
};
type TeamStats = {
  id?: number;
  league?: {
    fixtures?: { played?: { total?: number } };
    goals?: {
      for?: { average?: { home?: string; away?: string; total?: string }; minute?: Record<string, { total?: number | null }> };
      against?: { average?: { home?: string; away?: string; total?: string }; minute?: Record<string, { total?: number | null }> };
    };
  };
};
export type Candidate = DailyAnalysisItem & { selectionScore: number; bookmaker: string; oddsUpdatedAt?: string };

export const isUpcomingFixture = (fixture: Fixture, now: Date, leadMinutes = 30) =>
  fixture.fixture?.status?.short === 'NS'
  && Number.isInteger(fixture.fixture.id)
  && Boolean(fixture.teams?.home?.id && fixture.teams?.away?.id && fixture.teams.home.name && fixture.teams.away.name)
  && Date.parse(fixture.fixture.date) > now.getTime() + leadMinutes * 60_000;

const percent = (value?: string) => {
  if (!value?.trim()) return NaN;
  const parsed = Number(value.replace('%', '').trim());
  return parsed >= 0 && parsed <= 100 ? parsed : NaN;
};
const normalized = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export function buildCandidates(fixture: Fixture, odds: Odds[], model: Prediction, now = new Date()): Candidate[] {
  if (!isUpcomingFixture(fixture, now)) return [];
  // A provider mismatch must never silently borrow another match's prediction.
  if (model.teams?.home?.id !== fixture.teams.home.id || model.teams?.away?.id !== fixture.teams.away.id) return [];
  const values = model.predictions?.percent;
  const home = percent(values?.home), draw = percent(values?.draw), away = percent(values?.away);
  const winner = model.predictions?.winner?.id;
  const side = winner === fixture.teams.home.id ? 'home' : winner === fixture.teams.away.id ? 'away' : null;
  const doubleChance = model.predictions?.win_or_draw === true;
  type Market = { prediction: string; probability: number; category: string; names: string[]; outcomes: string[]; basis: string };
  const markets: Market[] = [];
  if (side && [home, draw, away].every(Number.isFinite) && Math.abs(home + draw + away - 100) <= 2) {
    markets.push({ prediction: doubleChance ? (side === 'home' ? '1X' : 'X2') : (side === 'home' ? '1' : '2'),
      probability: ((side === 'home' ? home : away) + (doubleChance ? draw : 0)) / 100,
      category: doubleChance ? 'double_chance' : 'result',
      names: doubleChance ? ['double chance'] : ['match winner', 'fulltime result', '1x2'],
      outcomes: doubleChance ? side === 'home' ? ['home/draw', '1x'] : ['draw/away', 'x2'] : side === 'home' ? ['home', '1'] : ['away', '2'],
      basis: 'Procena je zasnovana na prognozi sportskog modela.',
    });
  }
  const average = (team: TeamStats, kind: 'for' | 'against', venue: 'home' | 'away') => {
    const raw = team.league?.goals?.[kind]?.average?.[venue] ?? team.league?.goals?.[kind]?.average?.total;
    return raw !== undefined && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : NaN;
  };
  const homeStats = model.teams.home, awayStats = model.teams.away;
  if ((homeStats.league?.fixtures?.played?.total || 0) >= 5 && (awayStats.league?.fixtures?.played?.total || 0) >= 5) {
    const homeGoals = (average(homeStats, 'for', 'home') + average(awayStats, 'against', 'away')) / 2;
    const awayGoals = (average(awayStats, 'for', 'away') + average(homeStats, 'against', 'home')) / 2;
    if ([homeGoals, awayGoals].every((value) => Number.isFinite(value) && value >= 0 && value <= 6)) {
      const lambda = homeGoals + awayGoals;
      const p0 = Math.exp(-lambda), p1 = p0 * lambda, p2 = p1 * lambda / 2, p3 = p2 * lambda / 3;
      const basis = `Procena koristi raspolozive proseke datih i primljenih golova oba tima, uz modelsku procenu tempa golova (${lambda.toFixed(2)}).`;
      const goalNames = ['goals over/under', 'over/under', 'total goals'];
      if (!side) {
        const poisson = (lambda: number) => {
          const values = [Math.exp(-lambda)];
          for (let goals = 1; goals <= 15; goals++) values.push(values[goals - 1] * lambda / goals);
          return values;
        };
        const homeDistribution = poisson(homeGoals), awayDistribution = poisson(awayGoals);
        let winHome = 0, winAway = 0;
        homeDistribution.forEach((pHome, h) => awayDistribution.forEach((pAway, a) => {
          if (h > a) winHome += pHome * pAway;
          if (a > h) winAway += pHome * pAway;
        }));
        markets.push(
          { prediction: '1', probability: winHome, category: 'result', names: ['match winner', '1x2'], outcomes: ['home', '1'], basis },
          { prediction: '2', probability: winAway, category: 'result', names: ['match winner', '1x2'], outcomes: ['away', '2'], basis },
          { prediction: '1X', probability: 1 - winAway, category: 'double_chance', names: ['double chance'], outcomes: ['home/draw', '1x'], basis },
          { prediction: 'X2', probability: 1 - winHome, category: 'double_chance', names: ['double chance'], outcomes: ['draw/away', 'x2'], basis },
        );
      }
      markets.push(
        { prediction: 'Over 1.5', probability: 1 - p0 - p1, category: 'goals', names: goalNames, outcomes: ['over 1.5'], basis },
        { prediction: 'Over 2.5', probability: 1 - p0 - p1 - p2, category: 'goals', names: goalNames, outcomes: ['over 2.5'], basis },
        { prediction: 'Under 3.5', probability: p0 + p1 + p2 + p3, category: 'under', names: goalNames, outcomes: ['under 3.5'], basis },
        { prediction: 'GG', probability: (1 - Math.exp(-homeGoals)) * (1 - Math.exp(-awayGoals)), category: 'btts', names: ['both teams score', 'both teams to score', 'btts'], outcomes: ['yes'], basis },
        { prediction: `${fixture.teams.home.name} daje gol`, probability: 1 - Math.exp(-homeGoals), category: 'team_goal', names: ['home team total goals', 'total - home', 'home team score a goal'], outcomes: ['over 0.5', 'yes'], basis },
        { prediction: `${fixture.teams.away.name} daje gol`, probability: 1 - Math.exp(-awayGoals), category: 'team_goal', names: ['away team total goals', 'total - away', 'away team score a goal'], outcomes: ['over 0.5', 'yes'], basis },
      );
      const firstHalfRate = (team: TeamStats, kind: 'for' | 'against') => {
        const periods = ['0-15', '16-30', '31-45'].map((period) => team.league?.goals?.[kind]?.minute?.[period]?.total);
        return periods.every((value) => Number.isFinite(value) && value !== null) ? periods.reduce((sum, value) => sum + value!, 0) / team.league!.fixtures!.played!.total! : NaN;
      };
      const halfLambda = (firstHalfRate(homeStats, 'for') + firstHalfRate(awayStats, 'against') + firstHalfRate(awayStats, 'for') + firstHalfRate(homeStats, 'against')) / 2;
      if (Number.isFinite(halfLambda)) markets.push({ prediction: '1. poluvreme Over 0.5', probability: 1 - Math.exp(-halfLambda), category: 'first_half', names: ['goals over/under first half', 'over/under first half', 'first half goals'], outcomes: ['over 0.5'], basis: 'Procena koristi stvarnu raspodelu golova u prvom poluvremenu oba tima.' });
    }
  }
  const kickoff = new Date(fixture.fixture.date);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(kickoff);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: '2-digit', minute: '2-digit' }).format(kickoff);
  return markets.flatMap(({ prediction, probability, category, names, outcomes, basis }) => {
  const confidence = Math.round(probability * 100);
  if (confidence < 55) return [];
  const offer = odds.filter((item) => item.fixture?.id === fixture.fixture.id).flatMap((item) =>
    (item.bookmakers || []).flatMap((bookmaker) => bookmaker.bets.flatMap((bet) => {
      if (!names.includes(normalized(bet.name))) return [];
      const outcome = bet.values.find((value) => outcomes.includes(normalized(value.value)));
      const value = Number(outcome?.odd?.replace(',', '.'));
      if (!Number.isFinite(value) || value < 1.15 || value > 3.5) return [];
      return [{ value, bookmaker: bookmaker.name, updatedAt: item.update }];
    })),
  ).sort((a, b) => a.bookmaker.localeCompare(b.bookmaker))[0];
  if (!offer || probability <= 1 / offer.value) return [];
  const text = `Za mec ${fixture.teams.home.name} - ${fixture.teams.away.name} izdvojen je tip ${prediction}, uz modelsku procenu ${confidence}%. ${basis} Dostupna kvota kod ${offer.bookmaker} iznosi ${offer.value.toFixed(2)}. Procena modela ne garantuje ishod; kvota se moze promeniti do pocetka utakmice.`;
  return [{
    id: `${fixture.sourceProvider || 'api-football'}-${fixture.providerId || fixture.fixture.id}`, source: fixture.sourceProvider || 'api-football', sport: 'football', fixtureId: fixture.fixture.id,
    ...(fixture.providerId ? { providerFixtureId: fixture.providerId, oddsProvider: 'The Odds API' } : {}),
    kickoffAt: fixture.fixture.date, analysisSource: fixture.sourceProvider ? 'model-statistics' : 'api-predictions',
    leagueId: fixture.league.id, league: fixture.league.country ? `${fixture.league.name} · ${fixture.league.country}` : fixture.league.name,
    date, time, kickoffTime: time, matchTime: time,
    homeTeam: fixture.teams.home.name, awayTeam: fixture.teams.away.name,
    homeLogo: fixture.teams.home.logo || '', awayLogo: fixture.teams.away.logo || '',
    prediction, marketCategory: category, odds: offer.value, confidence, reasoning: text, analysis: text,
    status: 'ACTIVE', access: 'VIP', sortOrder: 0, units: 3, enabled: true, hidden: false,
    manualOverride: false, resultManualOverride: false, badges: ['API MODEL'],
    selectionScore: confidence - 100 / offer.value, bookmaker: offer.bookmaker,
    ...(offer.updatedAt ? { oddsUpdatedAt: offer.updatedAt } : {}),
  }];
  });
}

export const buildCandidate = (fixture: Fixture, odds: Odds[], model: Prediction, now = new Date()): Candidate | null =>
  buildCandidates(fixture, odds, model, now)[0] || null;

// All league IDs are eligible. Diversity prefers a different league before a repeat.
export function selectDailyPicks(candidates: Candidate[], slots: Array<'FREE' | 'VIP'>): DailyAnalysisItem[] {
  const remaining = [...candidates].sort((a, b) => b.selectionScore - a.selectionScore || b.confidence! - a.confidence! || a.id.localeCompare(b.id));
  const usedLeagues = new Set<number>();
  const usedFixtures = new Set<number>();
  const usedMarkets = new Set<string>();
  const picks: DailyAnalysisItem[] = [];
  for (const access of slots) {
    const eligible = remaining.filter((item) => !usedFixtures.has(item.fixtureId!) && (access === 'FREE' ? item.odds <= 1.85 : item.odds >= 1.2));
    const chosen = eligible.find((item) => !usedMarkets.has(item.marketCategory || '') && !usedLeagues.has(item.leagueId!))
      || eligible.find((item) => !usedMarkets.has(item.marketCategory || '')) || eligible.find((item) => !usedLeagues.has(item.leagueId!)) || eligible[0];
    if (!chosen) continue;
    const { selectionScore, ...item } = chosen;
    picks.push({ ...item, access, units: access === 'FREE' ? 3 : 5, sortOrder: picks.length,
      ...(access === 'FREE' ? { freeAnalysis: item.reasoning } : { vipAnalysis: item.reasoning }),
    });
    usedFixtures.add(item.fixtureId!);
    usedLeagues.add(item.leagueId!);
    usedMarkets.add(item.marketCategory || '');
  }
  return picks;
}
