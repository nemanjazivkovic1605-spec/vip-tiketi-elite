import type { AnalyticsMatch } from '../../src/types/footballAnalytics.js';
import type { HistoricalAggregate, HistoricalMetric, HistoricalTeamStats } from '../../src/types/historicalAnalytics.js';
import { completeScore } from './normalization.js';
import { matchDate } from './historicalProvider.js';
import { HTFT_CODES, type HtftCode } from '../../src/types/htftAnalytics.js';

const finished = (match: AnalyticsMatch) => match.environment === 'real' && match.status === 'finished' && completeScore(match.ft);
const coherentHalves = (match: AnalyticsMatch) => finished(match) && completeScore(match.ht) && match.ht.home! <= match.ft.home! && match.ht.away! <= match.ft.away!;
const result = (home: number, away: number) => home > away ? '1' : home < away ? '2' : 'X';
export function historicalTransition(match: AnalyticsMatch): HtftCode | null {
  return coherentHalves(match) ? `${result(match.ht.home!, match.ht.away!)}/${result(match.ft.home!, match.ft.away!)}` as HtftCode : null;
}
export function aggregateHistorical(matches: AnalyticsMatch[]): HistoricalAggregate {
  const ft = matches.filter(finished), ht = ft.filter(coherentHalves);
  const metric = (sample: AnalyticsMatch[], predicate: (match: AnalyticsMatch) => boolean): HistoricalMetric => {
    const count = sample.filter(predicate).length;
    return { count, sample: sample.length, percent: sample.length ? count / sample.length * 100 : null };
  };
  const average = (sample: AnalyticsMatch[], read: (match: AnalyticsMatch) => number) => ({ sample: sample.length, average: sample.length ? sample.reduce((sum, row) => sum + read(row), 0) / sample.length : null });
  const total = (match: AnalyticsMatch) => match.ft.home! + match.ft.away!;
  return {
    records: matches.length, finished: ft.length, withHtFt: ht.length,
    invalidHt: ft.filter(match => completeScore(match.ht) && !coherentHalves(match)).length,
    htft: HTFT_CODES.map(code => ({ code, ...metric(ht, match => historicalTransition(match) === code) })),
    comebacks: metric(ht, match => ['1/2', '2/1'].includes(`${result(match.ht.home!, match.ht.away!)}/${result(match.ft.home!, match.ft.away!)}`)),
    homeWins: metric(ft, match => match.ft.home! > match.ft.away!), draws: metric(ft, match => match.ft.home === match.ft.away), awayWins: metric(ft, match => match.ft.home! < match.ft.away!),
    over05Ht: metric(ht, match => match.ht.home! + match.ht.away! > .5), over15Ht: metric(ht, match => match.ht.home! + match.ht.away! > 1.5),
    over15Ft: metric(ft, match => total(match) > 1.5), over25Ft: metric(ft, match => total(match) > 2.5), over35Ft: metric(ft, match => total(match) > 3.5),
    btts: metric(ft, match => match.ft.home! > 0 && match.ft.away! > 0),
    firstHalfGoals: average(ht, match => match.ht.home! + match.ht.away!),
    secondHalfGoals: average(ht, match => total(match) - match.ht.home! - match.ht.away!),
  };
}
export function historicalTeamStats(matches: AnalyticsMatch[], id: string, name: string): HistoricalTeamStats {
  const own = matches.filter(match => finished(match) && [match.homeId, match.awayId].includes(id))
    .sort((a, b) => matchDate(b).localeCompare(matchDate(a)) || (b.kickoffAt || '').localeCompare(a.kickoffAt || '') || a.id.localeCompare(b.id));
  const side = (match: AnalyticsMatch) => match.homeId === id ? 'home' : 'away';
  const other = (match: AnalyticsMatch) => match.homeId === id ? 'away' : 'home';
  const summary = (rows: AnalyticsMatch[]) => {
    const goalsFor = rows.reduce((sum, match) => sum + match.ft[side(match)]!, 0), goalsAgainst = rows.reduce((sum, match) => sum + match.ft[other(match)]!, 0);
    return { sample: rows.length, wins: rows.filter(match => match.ft[side(match)]! > match.ft[other(match)]!).length,
      draws: rows.filter(match => match.ft.home === match.ft.away).length,
      losses: rows.filter(match => match.ft[side(match)]! < match.ft[other(match)]!).length,
      goalsFor, goalsAgainst, averageFor: rows.length ? goalsFor / rows.length : null, averageAgainst: rows.length ? goalsAgainst / rows.length : null };
  };
  const window = (size: number) => {
    const rows = own.slice(0, size), values = summary(rows);
    return { sample: values.sample, points: values.wins * 3 + values.draws, averageFor: values.averageFor, averageAgainst: values.averageAgainst,
      form: rows.map(match => match.ft[side(match)]! > match.ft[other(match)]! ? 'W' : match.ft[side(match)] === match.ft[other(match)] ? 'D' : 'L').join(' ') };
  };
  return { id, name, ...summary(own), last5: window(5), last10: window(10), home: summary(own.filter(match => match.homeId === id)), away: summary(own.filter(match => match.awayId === id)) };
}
