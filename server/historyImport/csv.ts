import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import { TicketStatus, type Tip } from '../../src/types.js';
import { evaluateFullTimePrediction } from '../../src/utils/predictionResults.js';
import { archiveIdentity, archiveTeamName, FOOTBALL_DATA_LEAGUES } from '../footballAnalytics/footballDataArchive/normalization.js';
import { nameKey } from '../footballAnalytics/normalization.js';
import { formatLeagueName } from '../../src/utils/leagueMapper.js';

export const IMPORT_COLUMNS = ['Mesec', 'Datum', 'Domacin', 'Gost', 'Liga', 'Tip', 'Kvota', 'Units', 'Status', 'Rezultat', 'Profit'] as const;
export type ImportIssue = { row: number; reason: string; existingId?: string };
export type ImportedTipRow = {
  row: number; original: Record<string, string>; identity: string; fixtureKey: string;
  date: string; home: string; away: string; league: string; country: string; prediction: string;
  market: string; odds: number; units: number; status: TicketStatus; result: string; homeScore: number; awayScore: number; profit: number;
};
export type ParsedTipFile = { fileHash: string; rows: ImportedTipRow[]; totalRows: number; errors: ImportIssue[]; duplicates: ImportIssue[] };
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const clean = (value: string) => fold(value).replace(/[^a-z0-9]+/g, '');

export function importDate(value: string): string {
  const raw = value.trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const local = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})\.?$/);
  if (!iso && !local) throw new Error('Neispravan datum (YYYY-MM-DD ili DD.MM.YYYY).');
  const date = iso ? raw : `${local![3]}-${local![2].padStart(2, '0')}-${local![1].padStart(2, '0')}`;
  if (!Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Datum ne postoji u kalendaru.');
  return date;
}

export function importNumber(raw: string, decimals = 2) {
  const value = raw.trim().replace(',', '.');
  if (!new RegExp(`^[+-]?\\d+(?:\\.\\d{1,${decimals}})?$`).test(value)) throw new Error('Neispravan broj.');
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 1e9) throw new Error('Broj je van podrzanog opsega.');
  return number;
}

export const importMarket = (prediction: string) => {
  const value = prediction.trim().toUpperCase().replace(/\s+/g, ' ').replace(',', '.');
  const aliases: Record<string, string> = { '3+': 'OVER 2.5', '2+': 'OVER 1.5', '0-2': 'UNDER 2.5', 'BTTS': 'GG', 'BOTH TEAMS TO SCORE': 'GG', '1X2:1': '1', '1X2:X': 'X', '1X2:2': '2' };
  return aliases[value] || value;
};

export function importLeague(raw: string) {
  const known = FOOTBALL_DATA_LEAGUES[raw.trim().toUpperCase()]
    || Object.values(FOOTBALL_DATA_LEAGUES).find(league => nameKey(league.name) === nameKey(raw));
  const name = known?.name || formatLeagueName(raw);
  if (name === 'Nepoznata liga') throw new Error('Liga nije prepoznata.');
  return { name, country: known?.country || 'Unknown' };
}

export const fixtureIdentity = (date: string, league: string, home: string, away: string) => {
  const competition = importLeague(league);
  return archiveIdentity(competition, date, home, away);
};
export const tipIdentity = (date: string, league: string, home: string, away: string, prediction: string) =>
  digest(fixtureIdentity(date, league, home, away) + '|' + importMarket(prediction));
export const canonicalTeam = (name: string, country: string) => nameKey(archiveTeamName(name, country));

export function outcomeProfit(odds: number, units: number, status: TicketStatus): number {
  // Integer money arithmetic avoids a floating-point drift across repeated imports.
  const stake = BigInt(Math.round(units * 100));
  if (status === TicketStatus.LOST) return -Number(stake) / 100;
  if (status === TicketStatus.REFUND) return 0;
  const numerator = stake * (BigInt(Math.round(odds * 10000)) - 10000n);
  return Number((numerator + 5000n) / 10000n) / 100;
}

export function parseTipCsv(input: Buffer, asOf: string): ParsedTipFile {
  importDate(asOf);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(input);
  let records: Record<string, string>[];
  const aliases = Object.fromEntries(IMPORT_COLUMNS.map(column => [clean(column), column]));
  aliases.domacin = 'Domacin';
  const delimiter = text.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
  records = parse(text, { bom: true, delimiter, skip_empty_lines: true, max_record_size: 65536,
    columns: (headers: string[]) => {
      const normalized = headers.map(header => aliases[clean(header)] || header.trim());
      if (new Set(normalized).size !== normalized.length || IMPORT_COLUMNS.some(column => !normalized.includes(column))) throw new Error('CSV nema sve obavezne kolone ili ima duple nazive kolona.');
      return normalized;
    },
  });
  const result: ParsedTipFile = { fileHash: digest(input), rows: [], totalRows: records.length, errors: [], duplicates: [] };
  const seen = new Map<string, ImportedTipRow>();
  const monthNames = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
  for (const [index, original] of records.entries()) {
    const row = index + 2;
    try {
      for (const column of IMPORT_COLUMNS) if (!original[column]?.trim()) throw new Error(`Nedostaje ${column}.`);
      if (Object.values(original).some(value => value.length > 1000)) throw new Error('Polje je predugacko.');
      const date = importDate(original.Datum);
      if (date > asOf) throw new Error('Istorijski rezultat ima buduci datum.');
      const month = fold(original.Mesec).trim().replace(/\s+/g, ' ');
      if (month !== `${monthNames[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}` && month !== date.slice(0, 7)) throw new Error('Mesec nije uskladjen sa datumom.');
      const home = original.Domacin.trim(), away = original.Gost.trim(), competition = importLeague(original.Liga);
      if (canonicalTeam(home, competition.country) === canonicalTeam(away, competition.country)) throw new Error('Domacin i gost su isti tim.');
      const odds = importNumber(original.Kvota, 4), units = importNumber(original.Units), declaredProfit = importNumber(original.Profit);
      if (odds <= 1 || units <= 0) throw new Error('Kvota mora biti veca od 1.00, a units pozitivan.');
      const scores = original.Rezultat.trim().match(/^(\d{1,2})\s*[-:]\s*(\d{1,2})$/);
      if (!scores) throw new Error('Nedostaje ili je neispravan konacan rezultat.');
      const homeScore = Number(scores[1]), awayScore = Number(scores[2]), market = importMarket(original.Tip);
      if (/^(?:OVER|UNDER) /.test(market) && !/^(?:OVER|UNDER) \d+(?:\.0|\.5)?$/.test(market)) throw new Error('Cetvrtinske linije zahtevaju rucnu proveru.');
      const evaluated = evaluateFullTimePrediction(market, homeScore, awayScore);
      if (!evaluated) throw new Error('Ishod ovog marketa nije moguce pouzdano proceniti iz FT rezultata.');
      const statusKey = clean(original.Status);
      const status = ['won', 'win', 'pogodeno', 'pogodjeno', 'prosao'].includes(statusKey) ? TicketStatus.WON
        : ['lost', 'lose', 'promaseno', 'pao'].includes(statusKey) ? TicketStatus.LOST
          : ['void', 'push', 'povrat', 'refund'].includes(statusKey) ? TicketStatus.REFUND : null;
      if (status !== evaluated) throw new Error(`Status nije uskladjen sa tipom i rezultatom (obracun: ${evaluated}).`);
      const profit = outcomeProfit(odds, units, status);
      if (Math.round(declaredProfit * 100) !== Math.round(profit * 100)) throw new Error(`Profit nije ispravan: CSV ${declaredProfit}, obracun ${profit}.`);
      const fixtureKey = fixtureIdentity(date, competition.name, home, away);
      const identity = tipIdentity(date, competition.name, home, away, market);
      const value: ImportedTipRow = { row, original, identity, fixtureKey, date, home, away, league: competition.name, country: competition.country,
        prediction: original.Tip.trim(), market, odds, units, status, result: `${homeScore}:${awayScore}`, homeScore, awayScore, profit };
      const previous = seen.get(identity);
      if (previous) {
        const equal = ['odds', 'units', 'status', 'result', 'profit'].every(key => previous[key as keyof ImportedTipRow] === value[key as keyof ImportedTipRow]);
        if (!equal) { result.errors.push({ row: previous.row, reason: 'Konfliktni redovi za isti tip u CSV-u.' }); throw new Error('Konfliktni redovi za isti tip u CSV-u.'); }
        result.duplicates.push({ row, reason: `Isti tip je vec u redu ${previous.row}.` });
      } else { seen.set(identity, value); result.rows.push(value); }
    } catch (error) { result.errors.push({ row, reason: (error as Error).message }); }
  }
  const invalid = new Set(result.errors.map(error => error.row));
  result.rows = result.rows.filter(row => !invalid.has(row.row));
  return result;
}

export function existingTipIdentity(tip: Tip): string | null {
  if (tip.matches?.length !== 1) return null;
  const match = tip.matches[0];
  try { return tipIdentity(importDate(tip.date), match.league, match.homeTeam, match.awayTeam, match.prediction); }
  catch { return null; }
}
