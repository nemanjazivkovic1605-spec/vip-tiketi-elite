export type OddsColumn = { kind: 'price'; market: '1x2' | 'total_goals' | 'asian_handicap'; selection: string;
  phase: 'pre_closing' | 'closing'; bookmaker: string | null; aggregation: 'average' | 'maximum' | null;
  line?: number } | { kind: 'line' | 'count' };
const bookmakers: Record<string, string> = {
  '1XB': '1XBet', B365: 'Bet365', BF: 'Betfair', BFD: 'Betfred', BFE: 'Betfair Exchange', BMGM: 'BetMGM',
  BV: 'BetVictor', BS: 'Blue Square', BW: 'Bet & Win', CL: 'Coral', GB: 'Gamebookers', IW: 'Interwetten',
  LB: 'Ladbrokes', PP: 'Paddy Power', P: 'Pinnacle', PS: 'Pinnacle', SK: 'Skybet', SKB: 'SKB', SO: 'Sporting Odds',
  SB: 'Sportingbet', SJ: 'Stan James', SY: 'Stanleybet', VC: 'BetVictor', WH: 'William Hill',
};
function prefix(value: string) {
  // VC is a bookmaker abbreviation, not a closing marker; VCC is its closing prefix.
  const closing = !bookmakers[value] && value.endsWith('C'), base = closing ? value.slice(0, -1) : value;
  const aggregation: 'maximum' | 'average' | null = ['Max', 'BbMx'].includes(base) ? 'maximum' : ['Avg', 'BbAv'].includes(base) ? 'average' : null;
  if (!bookmakers[base] && !aggregation) return null;
  return { phase: closing ? 'closing' as const : 'pre_closing' as const, bookmaker: bookmakers[base] || null, aggregation };
}
export function describeOddsColumn(column: string): OddsColumn | null {
  if (['Bb1X2', 'BbOU', 'BbAH'].includes(column)) return { kind: 'count' };
  if (['AHh', 'AHCh', 'BbAHh'].includes(column) || /^(GB|LB|B365)AH$/.test(column)) return { kind: 'line' };
  const ah = column.match(/^(.+)(AHH|AHA)$/);
  if (ah) { const meta = prefix(ah[1]); if (meta) return { kind: 'price', ...meta, market: 'asian_handicap', selection: ah[2] === 'AHH' ? 'home' : 'away' }; }
  const total = column.match(/^(.+)([<>])(\d+(?:\.\d+)?)$/);
  if (total) { const meta = prefix(total[1]); if (meta) return { kind: 'price', ...meta, market: 'total_goals', selection: total[2] === '>' ? 'over' : 'under', line: Number(total[3]) }; }
  const result = column.match(/^(.+)(H|D|A)$/);
  if (result) { const meta = prefix(result[1]); if (meta) return { kind: 'price', ...meta, market: '1x2', selection: ({ H: 'home', D: 'draw', A: 'away' })[result[2]]! }; }
  return null;
}
export type ArchiveOdds = { prices: Record<string, number>; lines: Record<string, number>; bookmakerCounts: Record<string, number> };
export function parseArchiveOdds(row: Record<string, string>) {
  const odds: ArchiveOdds = { prices: {}, lines: {}, bookmakerCounts: {} }, invalid: string[] = [], statistics: Record<string, string | number> = {};
  for (const [column, raw] of Object.entries(row)) {
    const text = raw.trim(); if (!text) continue;
    const definition = describeOddsColumn(column), value = Number(text);
    if (definition) {
      if (!Number.isFinite(value) || definition.kind === 'price' && value <= 1
        || definition.kind === 'count' && (!Number.isSafeInteger(value) || value < 0)) { invalid.push(column); continue; }
      if (definition.kind === 'price') odds.prices[column] = value;
      else if (definition.kind === 'line') odds.lines[column] = value;
      else odds.bookmakerCounts[column] = value;
    } else if (!['Div', 'Date', 'Time', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG', 'FTR', 'HTHG', 'HTAG', 'HTR', 'HG', 'AG', 'Res', 'Season'].includes(column)) {
      statistics[column] = Number.isFinite(value) ? value : text;
    }
  }
  return { odds, invalid, statistics };
}
export function expandArchiveOdds(odds: ArchiveOdds) {
  return Object.entries(odds.prices).map(([column, value]) => {
    const meta = describeOddsColumn(column);
    if (!meta || meta.kind !== 'price') throw new Error('Unmapped stored odds column.');
    let line: number | null = meta.line ?? null;
    if (meta.market === 'asian_handicap') {
      const base = column.slice(0, -3), specific = `${base}AH`;
      line = odds.lines[specific] ?? (meta.phase === 'closing' ? odds.lines.AHCh : odds.lines.AHh ?? odds.lines.BbAHh) ?? null;
    }
    return { column, value, ...meta, line };
  });
}
