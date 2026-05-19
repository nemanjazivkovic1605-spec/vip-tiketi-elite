import readXlsxFile, { readSheet } from 'read-excel-file/browser';
import { ImportedMatch } from '../types';

const IMPORTED_MATCHES_KEY = 'elite_imported_matches';
const IMPORTED_MATCHES_UPDATED_EVENT = 'elite_imported_matches_updated';
const IMPORTED_MATCHES_SEED_PATH = '/imported-matches-2025-2026.json';
const IMPORTED_MATCHES_SEEDED_KEY = 'elite_imported_matches_seeded_2025_2026';

type RawImportedMatch = Record<string, unknown>;

const REQUIRED_COLUMNS = [
  'date',
  'league',
  'homeTeam',
  'awayTeam',
  'homeScore',
  'awayScore',
  'oddsHome',
  'oddsDraw',
  'oddsAway',
] as const;

const LEAGUE_NAMES: Record<string, string> = {
  E0: 'Premier League',
  E1: 'Championship',
  E2: 'League One',
  E3: 'League Two',
  EC: 'National League',
  SP1: 'La Liga',
  SP2: 'La Liga 2',
  I1: 'Serie A',
  I2: 'Serie B',
  D1: 'Bundesliga',
  D2: 'Bundesliga 2',
  F1: 'Ligue 1',
  F2: 'Ligue 2',
  N1: 'Eredivisie',
  P1: 'Primeira Liga',
  B1: 'Belgian Pro League',
  T1: 'Super Lig',
  G1: 'Greek Super League',
  SC0: 'Scottish Premiership',
  SC1: 'Scottish Championship',
  SC2: 'Scottish League One',
  SC3: 'Scottish League Two',
};

const safeString = (value: unknown) => String(value ?? '').trim();

const safeNumber = (value: unknown) => {
  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
};

const normalizeDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }

  if (typeof value === 'number') {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().split('T')[0];
  }

  const raw = safeString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const dotted = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dotted) {
    const [, day, month, year] = dotted;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return raw;
};

const createMatchId = (match: Omit<ImportedMatch, 'id' | 'importedAt'>) => {
  return [
    match.date,
    match.league,
    match.homeTeam,
    match.awayTeam,
    match.homeScore,
    match.awayScore,
    match.oddsHome,
    match.oddsDraw,
    match.oddsAway,
  ].join('|').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
};

const normalizeRow = (row: RawImportedMatch, importedAt: string): ImportedMatch | null => {
  const isFootballDataRow = row.Div !== undefined || row.FTHG !== undefined || row.B365H !== undefined;
  const missing = !isFootballDataRow && REQUIRED_COLUMNS.some((column) => row[column] === undefined || row[column] === null || safeString(row[column]) === '');
  if (missing) return null;

  const leagueCode = safeString(row.Div);

  const match = {
    date: normalizeDate(row.date ?? row.Date),
    league: safeString(row.league) || LEAGUE_NAMES[leagueCode] || leagueCode,
    homeTeam: safeString(row.homeTeam ?? row.HomeTeam),
    awayTeam: safeString(row.awayTeam ?? row.AwayTeam),
    homeScore: safeNumber(row.homeScore ?? row.FTHG),
    awayScore: safeNumber(row.awayScore ?? row.FTAG),
    oddsHome: safeNumber(row.oddsHome ?? row.B365H ?? row.AvgH ?? row.MaxH),
    oddsDraw: safeNumber(row.oddsDraw ?? row.B365D ?? row.AvgD ?? row.MaxD),
    oddsAway: safeNumber(row.oddsAway ?? row.B365A ?? row.AvgA ?? row.MaxA),
  };

  if (
    !match.date ||
    !match.league ||
    !match.homeTeam ||
    !match.awayTeam ||
    !Number.isFinite(match.homeScore) ||
    !Number.isFinite(match.awayScore) ||
    !Number.isFinite(match.oddsHome) ||
    !Number.isFinite(match.oddsDraw) ||
    !Number.isFinite(match.oddsAway)
  ) {
    return null;
  }

  return {
    id: createMatchId(match),
    ...match,
    importedAt,
  };
};

const readMatches = (): ImportedMatch[] => {
  try {
    const stored = localStorage.getItem(IMPORTED_MATCHES_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeMatches = (matches: ImportedMatch[]) => {
  localStorage.setItem(IMPORTED_MATCHES_KEY, JSON.stringify(matches));
  localStorage.setItem(IMPORTED_MATCHES_SEEDED_KEY, 'true');
  window.dispatchEvent(new Event(IMPORTED_MATCHES_UPDATED_EVENT));
};

const loadSeedMatches = async (): Promise<ImportedMatch[]> => {
  try {
    const response = await fetch(IMPORTED_MATCHES_SEED_PATH, { cache: 'force-cache' });
    if (!response.ok) return [];
    const matches = await response.json();
    return Array.isArray(matches) ? matches : [];
  } catch {
    return [];
  }
};

const parseCsvLine = (line: string, delimiter: ',' | ';') => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
};

const parseRowsFromCsv = (text: string): RawImportedMatch[] => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  const [headerLine, ...dataLines] = lines;
  if (!headerLine) return [];

  const delimiter = headerLine.includes(';') && !headerLine.includes(',') ? ';' : ',';
  const headers = parseCsvLine(headerLine, delimiter).map((header) => header.trim());
  return dataLines.map((line) => {
    const cells = parseCsvLine(line, delimiter);
    return headers.reduce<RawImportedMatch>((row, header, index) => {
      row[header] = cells[index] ?? '';
      return row;
    }, {});
  });
};

const parseRowsFromWorkbook = async (file: File): Promise<RawImportedMatch[]> => {
  const sheets = await readXlsxFile(file);
  const normalizedSheets = Array.isArray(sheets) && sheets.some((sheet) => 'data' in (sheet as object))
    ? sheets as Array<{ sheet: string; data: unknown[][] }>
    : [{ sheet: file.name, data: await readSheet(file) as unknown[][] }];

  return normalizedSheets.flatMap((sheet) => {
    const [headers, ...dataRows] = sheet.data;
    if (!headers) return [];

    const normalizedHeaders = headers.map((header) => safeString(header));
    return dataRows.map((cells) => {
      return normalizedHeaders.reduce<RawImportedMatch>((row, header, index) => {
        row[header] = cells[index] ?? '';
        return row;
      }, {});
    });
  });
};

export const importedMatchesService = {
  getMatches: async (): Promise<ImportedMatch[]> => {
    const storedMatches = readMatches();
    if (storedMatches.length > 0) {
      return storedMatches.sort((a, b) => b.date.localeCompare(a.date));
    }

    if (localStorage.getItem(IMPORTED_MATCHES_SEEDED_KEY) === 'true') {
      return [];
    }

    const seedMatches = await loadSeedMatches();
    if (seedMatches.length > 0) {
      writeMatches(seedMatches);
    }

    return seedMatches.sort((a, b) => b.date.localeCompare(a.date));
  },

  importFile: async (file: File): Promise<{ imported: number; skipped: number; total: number }> => {
    const importedAt = new Date().toISOString();
    const extension = file.name.split('.').pop()?.toLowerCase();
    const rows = extension === 'csv'
      ? parseRowsFromCsv(await file.text())
      : await parseRowsFromWorkbook(file);

    const normalized = rows.map((row) => normalizeRow(row, importedAt));
    const valid = normalized.filter((match): match is ImportedMatch => Boolean(match));
    const existing = readMatches();
    const byId = new Map(existing.map((match) => [match.id, match]));
    let added = 0;
    let duplicates = 0;

    valid.forEach((match) => {
      if (byId.has(match.id)) {
        duplicates += 1;
        return;
      }

      added += 1;
      byId.set(match.id, match);
    });

    writeMatches(Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date)));

    return {
      imported: added,
      skipped: rows.length - valid.length + duplicates,
      total: rows.length,
    };
  },

  deleteMatch: async (id: string): Promise<void> => {
    writeMatches(readMatches().filter((match) => match.id !== id));
  },

  clearMatches: async (): Promise<void> => {
    writeMatches([]);
  },

  subscribe: (callback: () => void): (() => void) => {
    const handler = () => callback();
    window.addEventListener(IMPORTED_MATCHES_UPDATED_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(IMPORTED_MATCHES_UPDATED_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  },
};
