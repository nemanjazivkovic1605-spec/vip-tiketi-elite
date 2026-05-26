import { TicketStatus, type ImportedMatch } from '../types';

export const evaluateFootballPrediction = (prediction: string, homeScore: number, awayScore: number): TicketStatus => {
  const totalGoals = homeScore + awayScore;
  const normalized = prediction.toUpperCase();

  if (normalized === 'GG') return homeScore > 0 && awayScore > 0 ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '3+') return totalGoals >= 3 ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '1') return homeScore > awayScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === 'X') return homeScore === awayScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '2') return awayScore > homeScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '1X') return homeScore >= awayScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === 'X2') return awayScore >= homeScore ? TicketStatus.WON : TicketStatus.LOST;

  return TicketStatus.PENDING;
};

export const evaluateImportedMatchPrediction = (prediction: string, match: Pick<ImportedMatch, 'homeScore' | 'awayScore'>) =>
  evaluateFootballPrediction(prediction, match.homeScore, match.awayScore);
