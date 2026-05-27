import { MatchResult } from '../types';
import { footballApiService } from './footballApiService';

export const resultsProvider = {
  getMatchesForDate: async (date: string): Promise<MatchResult[]> => {
    try {
      return footballApiService.fetchMatches({ dateFrom: date, dateTo: date });
    } catch (error) {
      console.error('Error fetching matches for date:', error);
      return [];
    }
  },

  getTodayMatches: async (): Promise<MatchResult[]> => {
    try {
      const today = new Date().toISOString().split('T')[0];
      return footballApiService.fetchMatches({ dateFrom: today, dateTo: today });
    } catch (error) {
      console.error('Error fetching today matches:', error);
      return [];
    }
  },

  getFinishedMatchesByDate: async (date: string): Promise<MatchResult[]> => {
    try {
      return footballApiService.fetchFinishedMatches({ dateFrom: date, dateTo: date });
    } catch (error) {
      console.error('Error fetching finished matches:', error);
      return [];
    }
  },

  getMatchByTeams: async (home: string, away: string, date: string): Promise<MatchResult | null> => {
    try {
      const matches = await footballApiService.fetchMatches({ dateFrom: date, dateTo: date });
      const match = matches.find(m => 
        m.homeTeam.toLowerCase().includes(home.toLowerCase()) && 
        m.awayTeam.toLowerCase().includes(away.toLowerCase()) &&
        m.date === date
      );
      return match || null;
    } catch (error) {
      console.error('Error fetching match by teams:', error);
      return null;
    }
  },

  getAllMatches: async (): Promise<MatchResult[]> => {
    const today = new Date().toISOString().split('T')[0];
    return footballApiService.fetchMatches({ dateFrom: '2026-05-01', dateTo: today });
  }
};
