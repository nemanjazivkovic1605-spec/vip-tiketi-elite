import { TicketStatus, TipPublicationStatus, type DailyAnalysisItem, type Match, type Tip } from '../src/types.js';
import { calculateTotalOdds, generateTicketCode, getDefaultUnitsStake, getTicketKind, unitsToRsd } from '../src/utils/tickets.js';
import { evaluateFullTimePrediction } from '../src/utils/predictionResults.js';
import { getAutomaticProductTicketId } from '../src/utils/ticketProduct.js';
import { buildCandidates } from './dailyPickSelection.js';
import { buildDailyProposals, loadDailyMarketData, proposalIdentity } from './dailyProposalProvider.js';
import { freeFixturesForDate, historicalModel, teamKey } from './freeFootballFeeds.js';
import { loadDailyCandidates } from './dailyPickProvider.js';
import { getSportsKey, localDate } from './sportsApi.js';
import { isFreshOddsTimestamp } from './oddsPolicy.js';

export const PRODUCT_AUTOMATION = 'product-tickets' as const;
export const AUTOMATED_PRODUCTS = ['elite_ticket', 'safe_pick'] as const;
export type AutomatedProduct = typeof AUTOMATED_PRODUCTS[number];
export type ProductPick = DailyAnalysisItem & { statisticsAvailable?: boolean; oddsUpdatedAt?: string };
const timeInBelgrade = (date: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: '2-digit', minute: '2-digit' }).format(date);
export const productTicketId = getAutomaticProductTicketId;

export function productMatchKickoff(match: Match, date: string): number {
  const day = match.eventDate || date, time = match.eventTime || match.time;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  const original = Date.parse(match.kickoffAt || '');
  if (Number.isFinite(original) && localDate(new Date(original)) === day && timeInBelgrade(new Date(original)) === time) return original;
  const utc = Date.parse(`${day}T${time}:00Z`);
  const offsetName = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Belgrade', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(utc)).find((part) => part.type === 'timeZoneName')?.value;
  const hours = Number(offsetName?.match(/GMT([+-]\d+)/)?.[1]);
  const value = utc - hours * 3600000;
  return Number.isFinite(value) && localDate(new Date(value)) === day && timeInBelgrade(new Date(value)) === time ? value : NaN;
}

export async function loadProductPicks(date: string, now = new Date(), deadline = Date.now() + 150000) {
  const data = await loadDailyMarketData(date, now);
  const proposals = buildDailyProposals(data.fixtures, data.odds, now);
  const picks: ProductPick[] = proposals.filter((item) => item.analysis.odds > 1)
    .map((item) => ({ ...item.analysis, oddsUpdatedAt: item.oddsUpdatedAt }));
  // Reuse existing basic results/statistics only. No AI, H2H database or additional paid provider.
  if (picks.length && Date.now() < deadline - 15000) {
    try {
      const known = await freeFixturesForDate(date);
      for (const pick of picks.slice(0, 4)) {
        if (Date.now() >= deadline - 15000) break;
        const fixture = known.find((item) => teamKey(item.teams.home.name) === teamKey(pick.homeTeam)
          && teamKey(item.teams.away.name) === teamKey(pick.awayTeam)
          && Math.abs(Date.parse(item.fixture.date) - Date.parse(pick.kickoffAt || '')) <= 600000);
        if (!fixture) continue;
        const model = await historicalModel(fixture);
        if (!model) continue;
        const sourceFixture = data.fixtures.find((item) => item.fixture.id === pick.fixtureId);
        if (!sourceFixture) continue;
        const offers = data.odds.filter((item) => item.fixture.id === sourceFixture.fixture.id)
          .map((item) => ({ ...item, fixture: { id: fixture.fixture.id } }));
        const candidates = buildCandidates(fixture, offers, model, now)
          .filter(item => item.odds >= 1.2 && item.odds <= 3 && evaluateFullTimePrediction(item.prediction, 0, 0) !== undefined)
          .sort((a, b) => b.selectionScore - a.selectionScore);
        const best = candidates[0];
        if (best) Object.assign(pick, { prediction: best.prediction, odds: best.odds, confidence: best.confidence, statisticsAvailable: true,
          oddsUpdatedAt: best.oddsUpdatedAt, source: fixture.sourceProvider, fixtureId: fixture.fixture.id, providerFixtureId: fixture.providerId });
      }
    } catch { data.warnings.push('Osnovna statistika nije dostupna; koriste se provereni trzisni podaci bez izmisljanja statistike.'); }
  }
  if (!picks.length && getSportsKey() && Date.now() < deadline) {
    const modeled = await loadDailyCandidates(date, now, deadline);
    picks.push(...modeled.candidates.map((item) => ({ ...item, statisticsAvailable: true })));
    data.warnings.push(...modeled.warnings);
  }
  return { picks, fixtures: data.fixtures.length, warnings: data.warnings };
}

const totalPrice = (picks: ProductPick[]) => Number(picks.reduce((total, pick) => total * pick.odds, 1).toFixed(2));

export function selectProductPicks(pool: ProductPick[], type: AutomatedProduct, date: string, now = new Date()): ProductPick[] {
  const unique = new Map<string, ProductPick>();
  for (const pick of pool) {
    if (pick.date !== date || pick.sport !== 'football' || pick.status !== 'ACTIVE' || !pick.homeTeam || !pick.awayTeam || !pick.league || !pick.prediction?.trim()
      || !Number.isFinite(pick.odds) || pick.odds < 1.2 || pick.odds > 3 || !isFreshOddsTimestamp(pick.oddsUpdatedAt, now) || !Number.isFinite(Date.parse(pick.kickoffAt || ''))
      || Date.parse(pick.kickoffAt!) < now.getTime() + 30 * 60000 || localDate(new Date(pick.kickoffAt!)) !== date
      || timeInBelgrade(new Date(pick.kickoffAt!)) !== (pick.kickoffTime || pick.time)
      || evaluateFullTimePrediction(pick.prediction, 0, 0) === undefined) continue;
    const key = proposalIdentity(pick.homeTeam, pick.awayTeam, pick.kickoffAt!);
    const previous = unique.get(key);
    if (!previous || Number(Boolean(pick.statisticsAvailable)) > Number(Boolean(previous.statisticsAvailable))) unique.set(key, pick);
  }
  const candidates = [...unique.values()].slice(0, 10);
  const minimum = type === 'safe_pick' ? 1 : 2, maximum = type === 'safe_pick' ? 3 : 6;
  let best: ProductPick[] = [], bestScore = -Infinity;
  // At most 1,023 combinations from the existing ten-match discovery pool.
  for (let mask = 1; mask < 2 ** candidates.length; mask++) {
    const chosen = candidates.filter((_, index) => mask & 2 ** index);
    if (chosen.length < minimum || chosen.length > maximum) continue;
    const price = totalPrice(chosen);
    if (type === 'safe_pick' ? price < 1.5 || price > 3 : price < 2.5 || price > 15) continue;
    const statistics = chosen.filter((pick) => pick.statisticsAvailable).length / chosen.length;
    const diversity = new Set(chosen.map((pick) => pick.league)).size / chosen.length;
    const target = type === 'safe_pick' ? 1.8 : 5;
    const score = statistics * 20 + diversity - Math.abs(Math.log(price / target)) * 3
      - chosen.length * (type === 'safe_pick' ? 1 : 0.12);
    if (score > bestScore) { best = chosen; bestScore = score; }
  }
  return best;
}

export function buildProductTicket(type: AutomatedProduct, date: string, picks: ProductPick[], now = new Date()): Tip | null {
  const selected = selectProductPicks(picks, type, date, now);
  if (!selected.length) return null;
  const id = productTicketId(date, type), publishedTime = timeInBelgrade(now);
  const matches: Match[] = selected.map((pick, index) => ({ id: `${id}-${index + 1}`, externalMatchId: String(pick.fixtureId || ''),
    sourceProvider: pick.source, providerFixtureId: pick.providerFixtureId, kickoffAt: pick.kickoffAt,
    teams: `${pick.homeTeam} - ${pick.awayTeam}`, homeTeam: pick.homeTeam, awayTeam: pick.awayTeam, league: pick.league,
    eventDate: pick.date, eventTime: pick.time, time: pick.time, prediction: pick.prediction, odds: pick.odds,
    status: TicketStatus.PENDING, analysis: '',
  }));
  const unitsStake = getDefaultUnitsStake(true, matches.length);
  return { id, type, source: 'admin', automation: PRODUCT_AUTOMATION, automationDate: date, manualOverride: false, resultManualOverride: false,
    date, publishedDate: localDate(now), publishedTime, publishedAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString(),
    ticketCode: generateTicketCode(true, localDate(now), publishedTime, id), publicationStatus: TipPublicationStatus.PUBLISHED,
    matches, totalOdds: calculateTotalOdds(matches), totalOddsOverride: false, ticketType: getTicketKind(matches.length),
    unitsStake, stake: unitsToRsd(unitsStake), status: TicketStatus.PENDING, analysis: '', isVip: true,
  };
}

export function productSettlement(matches: Match[], originalOdds: number): { status: TicketStatus; totalOdds: number } {
  if (matches.some((match) => ![TicketStatus.WON, TicketStatus.LOST, TicketStatus.REFUND].includes(match.status!))) {
    return { status: matches.some((match) => match.status === TicketStatus.POSTPONED) ? TicketStatus.POSTPONED : TicketStatus.PENDING, totalOdds: originalOdds };
  }
  if (matches.some((match) => match.status === TicketStatus.LOST)) return { status: TicketStatus.LOST, totalOdds: originalOdds };
  if (matches.every((match) => match.status === TicketStatus.REFUND)) return { status: TicketStatus.REFUND, totalOdds: originalOdds };
  return { status: TicketStatus.WON, totalOdds: Number(matches.reduce((price, match) => price * (match.status === TicketStatus.REFUND ? 1 : match.odds), 1).toFixed(2)) };
}
