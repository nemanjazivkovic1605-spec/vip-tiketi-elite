import type { DailyAnalysisItem } from '../src/types.js';

export type Fixture = {
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
  teams?: { home?: { id?: number }; away?: { id?: number } };
  predictions?: {
    winner?: { id?: number };
    win_or_draw?: boolean;
    percent?: { home?: string; draw?: string; away?: string };
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

export function buildCandidate(fixture: Fixture, odds: Odds[], model: Prediction, now = new Date()): Candidate | null {
  if (!isUpcomingFixture(fixture, now)) return null;
  // A provider mismatch must never silently borrow another match's prediction.
  if (model.teams?.home?.id !== fixture.teams.home.id || model.teams?.away?.id !== fixture.teams.away.id) return null;
  const values = model.predictions?.percent;
  const home = percent(values?.home), draw = percent(values?.draw), away = percent(values?.away);
  if (![home, draw, away].every(Number.isFinite) || Math.abs(home + draw + away - 100) > 2) return null;
  const winner = model.predictions?.winner?.id;
  const side = winner === fixture.teams.home.id ? 'home' : winner === fixture.teams.away.id ? 'away' : null;
  if (!side) return null;
  const doubleChance = model.predictions?.win_or_draw === true;
  const prediction = doubleChance ? (side === 'home' ? '1X' : 'X2') : (side === 'home' ? '1' : '2');
  const confidence = Math.round((side === 'home' ? home : away) + (doubleChance ? draw : 0));
  if (confidence < 55) return null;
  const names = doubleChance ? ['double chance'] : ['match winner', 'fulltime result', '1x2'];
  const outcomes = doubleChance
    ? side === 'home' ? ['home/draw', '1x'] : ['draw/away', 'x2']
    : side === 'home' ? ['home', '1'] : ['away', '2'];
  const offer = odds.filter((item) => item.fixture?.id === fixture.fixture.id).flatMap((item) =>
    (item.bookmakers || []).flatMap((bookmaker) => bookmaker.bets.flatMap((bet) => {
      if (!names.includes(normalized(bet.name))) return [];
      const outcome = bet.values.find((value) => outcomes.includes(normalized(value.value)));
      const value = Number(outcome?.odd?.replace(',', '.'));
      if (!Number.isFinite(value) || value < 1.15 || value > 3.5) return [];
      return [{ value, bookmaker: bookmaker.name, updatedAt: item.update }];
    })),
  ).sort((a, b) => a.bookmaker.localeCompare(b.bookmaker))[0];
  if (!offer) return null;
  const kickoff = new Date(fixture.fixture.date);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(kickoff);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: '2-digit', minute: '2-digit' }).format(kickoff);
  const text = `Za meč ${fixture.teams.home.name} - ${fixture.teams.away.name}, API-Football model izdvaja tip ${prediction} uz procenu od ${confidence}%. Dostupna kvota kod ${offer.bookmaker} iznosi ${offer.value.toFixed(2)}. Procena modela ne garantuje ishod; kvota se može promeniti do početka utakmice.`;
  return {
    id: `api-football-${fixture.fixture.id}`, source: 'api-football', sport: 'football', fixtureId: fixture.fixture.id,
    kickoffAt: fixture.fixture.date, analysisSource: 'api-predictions',
    leagueId: fixture.league.id, league: fixture.league.country ? `${fixture.league.name} · ${fixture.league.country}` : fixture.league.name,
    date, time, kickoffTime: time, matchTime: time,
    homeTeam: fixture.teams.home.name, awayTeam: fixture.teams.away.name,
    homeLogo: fixture.teams.home.logo || '', awayLogo: fixture.teams.away.logo || '',
    prediction, odds: offer.value, confidence, reasoning: text, analysis: text,
    status: 'ACTIVE', access: 'VIP', sortOrder: 0, units: 3, enabled: true, hidden: false,
    manualOverride: false, resultManualOverride: false, badges: ['API MODEL'],
    selectionScore: confidence - 100 / offer.value, bookmaker: offer.bookmaker,
    ...(offer.updatedAt ? { oddsUpdatedAt: offer.updatedAt } : {}),
  };
}

// All league IDs are eligible. Diversity prefers a different league before a repeat.
export function selectDailyPicks(candidates: Candidate[], slots: Array<'FREE' | 'VIP'>): DailyAnalysisItem[] {
  const remaining = [...candidates].sort((a, b) => b.selectionScore - a.selectionScore || b.confidence! - a.confidence! || a.id.localeCompare(b.id));
  const usedLeagues = new Set<number>();
  const usedFixtures = new Set<number>();
  const picks: DailyAnalysisItem[] = [];
  for (const access of slots) {
    const eligible = remaining.filter((item) => !usedFixtures.has(item.fixtureId!) && (access !== 'FREE' || item.odds <= 1.85));
    const chosen = eligible.find((item) => !usedLeagues.has(item.leagueId!)) || eligible[0];
    if (!chosen) continue;
    const { selectionScore, ...item } = chosen;
    picks.push({ ...item, access, units: access === 'FREE' ? 3 : 5, sortOrder: picks.length,
      ...(access === 'FREE' ? { freeAnalysis: item.reasoning } : { vipAnalysis: item.reasoning }),
    });
    usedFixtures.add(item.fixtureId!);
    usedLeagues.add(item.leagueId!);
  }
  return picks;
}
