import { type Tip, TicketStatus, TipPublicationStatus } from '../../types.js';

export const mapTicketForPublic = (tip: Tip): Tip => {
  // Import provenance/original rows are admin-only, including on settled tickets.
  if (tip.historicalImport || tip.adminImportRef) {
    const { historicalImport: _privateImport, adminImportRef: _privateReference, ...publicTip } = tip;
    return mapTicketForPublic(publicTip);
  }
  if (tip.status === TicketStatus.PENDING || tip.status === TicketStatus.POSTPONED) {
    return {
      ...tip,
      locked: true,
      analysis: '',
      result: '',
      totalOdds: 1,
      totalOddsOverride: false,
      matches: [{
        id: `${tip.id}-locked`,
        externalMatchId: '',
        teams: 'Meč zaključan',
        homeTeam: '',
        awayTeam: '',
        league: '',
        prediction: '',
        odds: 1,
        time: '',
        result: '',
        status: tip.status,
        analysis: '',
      }],
    };
  }

  return {
    ...tip,
    locked: false,
    analysis: '',
    matches: tip.matches.map((match) => ({
      ...match,
      analysis: '',
    })),
  };
};

export const mapTicketForFree = (tip: Tip): Tip =>
  tip.isVip ? mapTicketForPublic(tip) : mapTicketForVip(tip);

export const mapTicketForVip = (tip: Tip): Tip => {
  const { historicalImport: _privateImport, adminImportRef: _privateReference, ...visibleTip } = tip;
  return visibleTip;
};

export const mapTicketForAdmin = (tip: Tip): Tip => tip;

export const mapActiveTicketForAccess = (summary: Tip, full: Tip | null, access: { canAccessFree: boolean; canAccessVip: boolean; purchasedTicketIds?: readonly string[] }): Tip => {
  if (full?.id === summary.id && full.publicationStatus === TipPublicationStatus.PUBLISHED
    && [TicketStatus.PENDING, TicketStatus.POSTPONED].includes(full.status)
    && (access.canAccessVip || access.canAccessFree && (full.isVip === false || access.purchasedTicketIds?.includes(full.id)))) return full;
  return mapTicketForPublic(summary);
};
