import fs from 'node:fs';
import readXlsxFile from 'read-excel-file/node';
import { type Match, type Tip, TicketStatus, TipPublicationStatus } from '../src/types';
import {
  buildPublishedAt,
  calculateTotalOdds,
  generateTicketCode,
  unitsToRsd,
} from '../src/utils/tickets';
import { mapTicketForPublic } from '../src/services/tickets/ticketMappers';
import { formatLeagueName } from '../src/utils/leagueMapper';

type Market = '1' | 'X' | '2' | 'Over 2.5' | 'Under 2.5';

type FinishedMatch = {
  id: string;
  date: string;
  time: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  oddsHome?: number;
  oddsDraw?: number;
  oddsAway?: number;
  oddsOver25?: number;
  oddsUnder25?: number;
};

type MonthConfig = {
  start: string;
  end: string;
  prefix: string;
  vipTargetOdds: number;
};

const MONTHS: MonthConfig[] = [
  { start: '2025-07-01', end: '2025-07-31', prefix: 'history-july-real-2025-', vipTargetOdds: 1.65 },
  { start: '2025-08-01', end: '2025-08-31', prefix: 'history-august-real-2025-', vipTargetOdds: 1.65 },
  { start: '2025-09-01', end: '2025-09-30', prefix: 'history-september-real-2025-', vipTargetOdds: 1.9 },
  { start: '2025-10-01', end: '2025-10-31', prefix: 'history-october-real-2025-', vipTargetOdds: 1.9 },
  { start: '2025-11-01', end: '2025-11-30', prefix: 'history-november-real-2025-', vipTargetOdds: 1.9 },
  { start: '2025-12-01', end: '2025-12-31', prefix: 'history-december-real-2025-', vipTargetOdds: 1.9 },
  { start: '2026-01-01', end: '2026-01-31', prefix: 'history-january-real-2026-', vipTargetOdds: 1.9 },
  { start: '2026-02-01', end: '2026-02-28', prefix: 'history-february-snapshot-2026-', vipTargetOdds: 1.9 },
  { start: '2026-03-01', end: '2026-03-31', prefix: 'history-march-snapshot-2026-', vipTargetOdds: 1.9 },
  { start: '2026-04-01', end: '2026-04-30', prefix: 'history-april-real-2026-', vipTargetOdds: 1.9 },
  { start: '2026-05-01', end: '2026-05-31', prefix: 'history-may-snapshot-2026-', vipTargetOdds: 1.9 },
];

const EXCEL_PATH = process.env.HISTORY_EXCEL_PATH || 'C:/Users/Nemanja/Downloads/all-euro-data-2025-2026.xlsx';
const SNAPSHOT_PATH = 'public/public-history-snapshot.json';
const MAX_TIPS_PER_DAY = 4;

const pad2 = (value: number) => String(value).padStart(2, '0');
const normalizeName = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const stableMinute = (seed: string) =>
  pad2(seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 60);
const stableNumber = (seed: string) =>
  seed.split('').reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) >>> 0, 0);
const numberOrUndefined = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : undefined;
};
const isoDate = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
};
const normalizeTime = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().slice(11, 16);
  const match = String(value || '').trim().match(/(\d{1,2}):(\d{2})/);
  return match ? `${pad2(Number(match[1]))}:${match[2]}` : '';
};

const availableMarkets = (match: FinishedMatch) => ([
  { prediction: '1' as const, odds: match.oddsHome },
  { prediction: 'X' as const, odds: match.oddsDraw },
  { prediction: '2' as const, odds: match.oddsAway },
  { prediction: 'Over 2.5' as const, odds: match.oddsOver25 },
  { prediction: 'Under 2.5' as const, odds: match.oddsUnder25 },
]).filter((market): market is { prediction: Market; odds: number } => Number.isFinite(market.odds) && Number(market.odds) > 1);

const marketWon = (prediction: Market, match: FinishedMatch) => {
  const totalGoals = match.homeScore + match.awayScore;
  if (prediction === '1') return match.homeScore > match.awayScore;
  if (prediction === 'X') return match.homeScore === match.awayScore;
  if (prediction === '2') return match.awayScore > match.homeScore;
  if (prediction === 'Over 2.5') return totalGoals > 2.5;
  return totalGoals < 2.5;
};

const chooseMarket = (match: FinishedMatch, slot: number, vipTargetOdds: number) => {
  const markets = availableMarkets(match);
  if (!markets.length) return null;
  const targetOdds = slot === 0 ? 1.75 : vipTargetOdds;
  const offset = stableNumber(`${match.id}-${slot}`) % markets.length;
  return [...markets].sort((left, right) => {
    const leftScore = Math.abs(left.odds - targetOdds) + ((markets.indexOf(left) + offset) % markets.length) * 0.025;
    const rightScore = Math.abs(right.odds - targetOdds) + ((markets.indexOf(right) + offset) % markets.length) * 0.025;
    return leftScore - rightScore;
  })[0];
};

const toTip = (
  match: FinishedMatch,
  slot: number,
  market: { prediction: Market; odds: number },
  prefix: string,
): Tip => {
  const isVip = slot > 0;
  const publishedTime = `12:${stableMinute(`${match.id}-${slot}`)}`;
  const id = `${prefix}${match.date}-${slot}-${normalizeName(match.homeTeam)}-${normalizeName(match.awayTeam)}`.slice(0, 180);
  const result = `${match.homeScore}-${match.awayScore}`;
  const status = marketWon(market.prediction, match) ? TicketStatus.WON : TicketStatus.LOST;
  const unitsStake = isVip ? 10 : 5;
  const matchTip: Match = {
    id: match.id,
    teams: `${match.homeTeam} - ${match.awayTeam}`,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    league: match.league,
    prediction: market.prediction,
    odds: market.odds,
    time: match.time,
    result,
    status,
  };

  return mapTicketForPublic({
    id,
    source: 'admin',
    publicationStatus: TipPublicationStatus.PUBLISHED,
    publishedDate: match.date,
    publishedTime,
    publishedAt: buildPublishedAt(match.date, publishedTime),
    ticketCode: generateTicketCode(isVip, match.date, publishedTime),
    createdAt: buildPublishedAt(match.date, publishedTime),
    date: match.date,
    matches: [matchTip],
    totalOdds: calculateTotalOdds([matchTip]),
    ticketType: 'SINGL',
    unitsStake,
    stake: unitsToRsd(unitsStake),
    status,
    analysis: '',
    isVip,
    result,
  });
};

const main = async () => {
  if (!fs.existsSync(EXCEL_PATH)) throw new Error(`Excel source not found: ${EXCEL_PATH}`);
  const workbook = await readXlsxFile(EXCEL_PATH) as Array<{ sheet: string; data: unknown[][] }>;
  const rows = workbook.flatMap((sheet) => {
    const header = (sheet.data?.[0] || []).map(String);
    const index = Object.fromEntries(header.map((name, idx) => [name, idx]));
    return (sheet.data || []).slice(1).map((row) => ({ sheet: sheet.sheet, row, index }));
  });

  const matches = rows.flatMap(({ sheet, row, index }) => {
    const date = isoDate(row[index.Date]);
    const month = MONTHS.find((config) => date >= config.start && date <= config.end);
    if (!month) return [];
    const homeScore = Number(row[index.FTHG]);
    const awayScore = Number(row[index.FTAG]);
    const homeTeam = String(row[index.HomeTeam] || '').trim();
    const awayTeam = String(row[index.AwayTeam] || '').trim();
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || !homeTeam || !awayTeam) return [];
    return [{
      id: `xlsx-${sheet}-${date}-${normalizeName(homeTeam)}-${normalizeName(awayTeam)}`,
      date,
      time: normalizeTime(row[index.Time]),
      league: formatLeagueName(String(row[index.Div] || sheet || 'Imported League')),
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      oddsHome: numberOrUndefined(row[index.B365H] ?? row[index.AvgH]),
      oddsDraw: numberOrUndefined(row[index.B365D] ?? row[index.AvgD]),
      oddsAway: numberOrUndefined(row[index.B365A] ?? row[index.AvgA]),
      oddsOver25: numberOrUndefined(row[index['B365>2.5']] ?? row[index['Avg>2.5']]),
      oddsUnder25: numberOrUndefined(row[index['B365<2.5']] ?? row[index['Avg<2.5']]),
    } satisfies FinishedMatch];
  });

  const uniqueMatches = Array.from(new Map(matches.map((match) => [
    `${match.date}-${normalizeName(match.homeTeam)}-${normalizeName(match.awayTeam)}`,
    match,
  ])).values());
  const tips = MONTHS.flatMap((config) => {
    const monthDates = Array.from(new Set(
      uniqueMatches.filter((match) => match.date >= config.start && match.date <= config.end).map((match) => match.date),
    )).sort();
    return monthDates.flatMap((date) => uniqueMatches
      .filter((match) => match.date === date && availableMarkets(match).length > 0)
      .sort((left, right) => availableMarkets(right).length - availableMarkets(left).length || left.id.localeCompare(right.id))
      .slice(0, MAX_TIPS_PER_DAY)
      .flatMap((match, slot) => {
        const market = chooseMarket(match, slot, config.vipTargetOdds);
        return market ? [toTip(match, slot, market, config.prefix)] : [];
      }));
  });

  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: 'Local Excel workbook with real results and bookmaker odds',
    tips,
  };
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot)}\n`);
  console.log(JSON.stringify({
    snapshotPath: SNAPSHOT_PATH,
    tickets: tips.length,
    months: MONTHS.map((month) => ({
      month: month.start.slice(0, 7),
      tickets: tips.filter((tip) => tip.date.startsWith(month.start.slice(0, 7))).length,
    })),
  }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
