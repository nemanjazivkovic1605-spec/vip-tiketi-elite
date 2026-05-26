import { type Tip, TicketStatus } from '../../types';

export const mapTicketForPublic = (tip: Tip): Tip => {
  if (tip.status === TicketStatus.PENDING) {
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
      prediction: tip.isVip ? 'VIP TIP' : match.prediction,
      analysis: '',
    })),
  };
};

export const mapTicketForFree = (tip: Tip): Tip =>
  tip.isVip ? mapTicketForPublic(tip) : tip;

export const mapTicketForVip = (tip: Tip): Tip => tip;

export const mapTicketForAdmin = (tip: Tip): Tip => tip;
