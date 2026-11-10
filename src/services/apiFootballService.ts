import type { DailyAnalysisItem } from '../types';
import { auth } from '../lib/firebase';

// Predictions and bookmaker odds are resolved on the server. No sports key reaches this client.
export const apiFootballService = {
  fetchDailyAnalysesForDate: async (date: string, signal?: AbortSignal): Promise<DailyAnalysisItem[]> => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Administratorska prijava je potrebna.');
    const response = await fetch(`/api/fetch-daily-sports?mode=picks&sport=football&date=${encodeURIComponent(date)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal,
    });
    const payload = await response.json() as { response?: DailyAnalysisItem[]; error?: string };
    if (!response.ok) throw new Error(payload.error || 'Preuzimanje nije uspelo.');
    return payload.response || [];
  },
};
