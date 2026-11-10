import { TicketStatus, type ImportedMatch } from '../types.js';

export const evaluateFullTimePrediction = (prediction: string, homeScore?: number, awayScore?: number): TicketStatus.WON | TicketStatus.LOST | TicketStatus.REFUND | undefined => {
  if (![homeScore, awayScore].every((score) => Number.isInteger(score) && Number(score) >= 0)) return undefined;
  const totalGoals = homeScore + awayScore;
  const normalized = prediction.trim().toUpperCase();

  if (normalized === 'GG') return homeScore > 0 && awayScore > 0 ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === 'NG') return homeScore === 0 || awayScore === 0 ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '3+' || normalized === 'OVER 2.5') return totalGoals >= 3 ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '2+' || normalized === 'OVER 1.5') return totalGoals >= 2 ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '0-2' || normalized === 'UNDER 2.5') return totalGoals <= 2 ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '1') return homeScore > awayScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === 'X') return homeScore === awayScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '2') return awayScore > homeScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '1X') return homeScore >= awayScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === 'X2') return awayScore >= homeScore ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '12') return homeScore !== awayScore ? TicketStatus.WON : TicketStatus.LOST;
  const line = normalized.match(/^(OVER|UNDER)\s*(\d+(?:\.\d+)?)$/);
  if (line) {
    const threshold = Number(line[2]);
    if (Number.isInteger(threshold) && totalGoals === threshold) return TicketStatus.REFUND;
    return (line[1] === 'OVER' ? totalGoals > threshold : totalGoals < threshold) ? TicketStatus.WON : TicketStatus.LOST;
  }

  return undefined;
};

export const evaluateFootballPrediction = (prediction: string, homeScore: number, awayScore: number): TicketStatus =>
  evaluateFullTimePrediction(prediction, homeScore, awayScore) || TicketStatus.PENDING;

export const evaluateImportedMatchPrediction = (prediction: string, match: Pick<ImportedMatch, 'homeScore' | 'awayScore'>) =>
  evaluateFootballPrediction(prediction, match.homeScore, match.awayScore);
