import type { Tip, TicketProductType } from '../../src/types.js';
import { TicketStatus, TipPublicationStatus } from '../../src/types.js';
import { buildPublishedAt, generateTicketCode, unitsToRsd, calculateTicketUnitsProfit } from '../../src/utils/tickets.js';
import { digest, existingTipIdentity, type ParsedTipFile, type ImportedTipRow, type ImportIssue } from './csv.js';
import type { ResultEvidence } from './verification.js';

export type ImportTotals = { count: number; wins: number; losses: number; refunds: number; units: number; profit: number; averageOdds: number; hitRate: number; roi: number };
export type HistoricalImportPlan = {
  schema: 1; fileHash: string; fingerprint: string; fileName: string; totalRows: number;
  category: TicketProductType; tickets: Tip[]; duplicates: ImportIssue[]; conflicts: ImportIssue[];
  unconfirmed: number; confirmed: number; totals: ImportTotals; months: Record<string, ImportTotals>;
};
const round = (value: number) => Number(value.toFixed(2));
export function importTotals(rows: ImportedTipRow[]): ImportTotals {
  const wins = rows.filter(row => row.status === TicketStatus.WON).length;
  const losses = rows.filter(row => row.status === TicketStatus.LOST).length;
  const units = rows.reduce((sum, row) => sum + (row.status === TicketStatus.REFUND ? 0 : Math.round(row.units * 100)), 0) / 100;
  const profit = rows.reduce((sum, row) => sum + Math.round(row.profit * 100), 0) / 100;
  return { count: rows.length, wins, losses, refunds: rows.length - wins - losses, units, profit,
    averageOdds: rows.length ? round(rows.reduce((sum, row) => sum + row.odds, 0) / rows.length) : 0,
    hitRate: wins + losses ? round(100 * wins / (wins + losses)) : 0, roi: units ? round(100 * profit / units) : 0 };
}

export function planHistoricalTips(file: ParsedTipFile, existing: Tip[], evidence: Record<string, ResultEvidence>, options: {
  category: TicketProductType; fileName: string; now: Date;
  occupiedPublicIds?: ReadonlySet<string>; previouslyImportedIds?: ReadonlySet<string>;
}): HistoricalImportPlan {
  const conflicts = [...file.errors], duplicates = [...file.duplicates], tickets: Tip[] = [];
  const existingByIdentity = new Map<string, Tip[]>(), byId = new Map(existing.map(tip => [tip.id, tip]));
  for (const tip of existing) {
    const identity = existingTipIdentity(tip);
    if (identity) existingByIdentity.set(identity, [...(existingByIdentity.get(identity) || []), tip]);
  }
  let unconfirmed = 0, confirmed = 0;
  for (const row of file.rows) {
    const id = 'csv-tip-' + row.identity;
    if (!byId.has(id) && options.previouslyImportedIds?.has(id)) {
      duplicates.push({ row: row.row, existingId: id, reason: 'Ovaj unos je ranije izvrsen; obrisani ili premesteni admin zapis nije ponovo napravljen.' });
      continue;
    }
    const found = byId.has(id) ? [byId.get(id)!] : existingByIdentity.get(row.identity) || [];
    if (found.length) {
      const same = found.length === 1 && (found[0].historicalImport?.fileHash === file.fileHash && found[0].historicalImport.identity === row.identity || (
        found[0].publicationStatus === TipPublicationStatus.PUBLISHED && found[0].status === row.status
        && Number(found[0].totalOdds) === row.odds && Number(found[0].unitsStake) === row.units
        && found[0].matches[0].result?.replace('-', ':').replace(/\s/g, '') === row.result));
      (same ? duplicates : conflicts).push({ row: row.row, existingId: found[0].id,
        reason: same ? 'Postojeci tiket je sacuvan bez izmene (ukljucujuci rucne admin izmene).' : 'Postojeci zapis za isti tip ima druge podatke. Nista nije prepisano.' });
      continue;
    }
    if (options.occupiedPublicIds?.has(id)) { conflicts.push({ row: row.row, existingId: id, reason: 'Javni indeks vec postoji bez privatnog zapisa. Potrebna je admin provera.' }); continue; }
    const proof = evidence[row.identity] || { state: 'unconfirmed', note: 'Nezavisna potvrda nije dostupna.' };
    if (proof.state === 'conflict') { conflicts.push({ row: row.row, reason: proof.note }); continue; }
    const firstMinute = proof.time ? Number(proof.time.slice(0, 2)) * 60 + Number(proof.time.slice(3)) : null;
    if (firstMinute !== null && firstMinute <= 540) { conflicts.push({ row: row.row, reason: 'Pocetak meca ne dozvoljava objavu izmedju 09:00 i 12:00.' }); continue; }
    const upper = firstMinute === null ? 720 : Math.min(720, firstMinute - 1);
    const minute = 540 + parseInt(row.identity.slice(0, 8), 16) % (upper - 540 + 1);
    const publishedTime = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    const publishedAt = buildPublishedAt(row.date, publishedTime), importedAt = options.now.toISOString();
    const tip: Tip = { id, type: options.category, source: 'admin', sourceProvider: 'manual', publicationStatus: TipPublicationStatus.PUBLISHED,
      date: row.date, publishedDate: row.date, publishedTime, publishedAt, createdAt: importedAt, updatedAt: importedAt,
      ticketCode: generateTicketCode(true, row.date, publishedTime, id), totalOdds: row.odds, unitsStake: row.units,
      stake: unitsToRsd(row.units), status: row.status, result: row.result, ticketType: 'SINGL', analysis: '', isVip: true,
      manualOverride: true, resultManualOverride: true, totalOddsOverride: false,
      matches: [{ id: id + '-match', teams: row.home + ' - ' + row.away, homeTeam: row.home, awayTeam: row.away, league: row.league,
        prediction: row.prediction, odds: row.odds, result: row.result, status: row.status, time: proof.time || '', eventDate: row.date,
        eventTime: proof.time || '', eventTimeUnknown: !proof.time, ...(proof.kickoffAt ? { kickoffAt: proof.kickoffAt } : {}) }],
      historicalImport: { fileHash: file.fileHash, fileName: options.fileName, row: row.row, identity: row.identity,
        importedAt, original: row.original, verification: proof.state, verificationNote: proof.note, assignedPublicationTime: true,
        ...(proof.source && proof.matchId && proof.checkedAt ? { evidence: { source: proof.source, matchId: proof.matchId, checkedAt: proof.checkedAt } } : {}) },
    };
    if (Math.round(calculateTicketUnitsProfit(tip) * 100) !== Math.round(row.profit * 100)) { conflicts.push({ row: row.row, reason: 'Profit postojeceg sistema i CSV obracuna se ne slazu.' }); continue; }
    if (proof.state === 'confirmed') confirmed++; else unconfirmed++;
    tickets.push(tip);
  }
  tickets.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const months = Object.fromEntries([...new Set(file.rows.map(row => row.date.slice(0, 7)))].sort().map(month => [month, importTotals(file.rows.filter(row => row.date.startsWith(month)))]));
  const fingerprint = digest(JSON.stringify({ fileHash: file.fileHash, category: options.category,
    tickets: tickets.map(tip => ({ id: tip.id, date: tip.date, status: tip.status, matches: tip.matches, odds: tip.totalOdds, units: tip.unitsStake, verification: tip.historicalImport?.verification })), duplicates, conflicts }));
  return { schema: 1, fileHash: file.fileHash, fileName: options.fileName, fingerprint, totalRows: file.totalRows,
    category: options.category, tickets, duplicates, conflicts, unconfirmed, confirmed, totals: importTotals(file.rows), months };
}
