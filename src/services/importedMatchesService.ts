import { readSheet } from 'read-excel-file/browser';
import { ImportedMatch } from '../types';

const IMPORTED_MATCHES_KEY = 'elite_imported_matches';
const IMPORTED_MATCHES_UPDATED_EVENT = 'elite_imported_matches_updated';

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
  const missing = REQUIRED_COLUMNS.some((column) => row[column] === undefined || row[column] === null || safeString(row[column]) === '');
  if (missing) return null;

  const match = {
    date: normalizeDate(row.date),
    league: safeString(row.league),
    homeTeam: safeString(row.homeTeam),
    awayTeam: safeString(row.awayTeam),
    homeScore: safeNumber(row.homeScore),
    awayScore: safeNumber(row.awayScore),
    oddsHome: safeNumber(row.oddsHome),
    oddsDraw: safeNumber(row.oddsDraw),
    oddsAway: safeNumber(row.oddsAway),
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
  window.dispatchEvent(new Event(IMPORTED_MATCHES_UPDATED_EVENT));
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
  const rows = await readSheet(file);
  const [headers, ...dataRows] = rows;
  if (!headers) return [];

  const normalizedHeaders = headers.map((header) => safeString(header));
  return dataRows.map((cells) => {
    return normalizedHeaders.reduce<RawImportedMatch>((row, header, index) => {
      row[header] = cells[index] ?? '';
      return row;
    }, {});
  });
};

export const importedMatchesService = {
  getMatches: async (): Promise<ImportedMatch[]> => {
    return readMatches().sort((a, b) => b.date.localeCompare(a.date));
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

    valid.forEach((match) => {
      byId.set(match.id, match);
    });

    writeMatches(Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date)));

    return {
      imported: valid.length,
      skipped: rows.length - valid.length,
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
