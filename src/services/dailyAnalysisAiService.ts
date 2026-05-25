import { auth } from '../lib/firebase';
import type { DailyAnalysisItem } from '../types';

type AiAnalysisResult = {
  analysis: string;
  source: 'gemini' | 'fallback';
};

const cleanAnalysis = (value: string) =>
  value
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

const fallbackAnalysis = (item: DailyAnalysisItem) => {
  const oddsText = Number(item.odds) > 1 ? ` po kvoti ${Number(item.odds).toFixed(2)}` : '';
  return `${item.homeTeam} i ${item.awayTeam} ulaze u duel u okviru ${item.league}, gde predlog ${item.prediction}${oddsText} predstavlja razuman izbor u odnosu na profil ovog meca. Kod ovog marketa presudni su ritam igre, sposobnost ekipa da nametnu svoj plan i situacije u kojima izabrani tip dobija konkretnu vrednost. ${item.homeTeam} i ${item.awayTeam} zato zahtevaju disciplinovanu procenu, bez oslanjanja na reputaciju ili kratkorocni utisak. Predlog ${item.prediction} ima smisla u okviru dostupnih informacija, uz odgovorno upravljanje ulogom i svest da nijedan sportski ishod nije garantovan.`;
};

export const dailyAnalysisAiService = {
  generateDailyAnalysisText: async (item: DailyAnalysisItem): Promise<AiAnalysisResult> => {
    const fallback = fallbackAnalysis(item);
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return { analysis: fallback, source: 'fallback' };

    try {
      const token = await firebaseUser.getIdToken();
      const response = await fetch('/api/generate-daily-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          matchData: {
            league: item.league,
            sport: item.sport || 'football',
            homeTeam: item.homeTeam,
            awayTeam: item.awayTeam,
            prediction: item.prediction,
            odds: item.odds,
            formHome: item.homeFormPercent,
            formAway: item.awayFormPercent,
            confidence: item.confidence,
            risk: item.riskLevel,
            stats: [item.formNote, item.averageTotal, item.h2hNote].filter(Boolean).join(' | '),
          },
        }),
      });

      if (!response.ok) return { analysis: fallback, source: 'fallback' };
      const result = await response.json() as Partial<AiAnalysisResult>;
      const analysis = typeof result.analysis === 'string' && result.analysis.trim()
        ? cleanAnalysis(result.analysis)
        : fallback;
      return { analysis, source: result.source === 'gemini' ? 'gemini' : 'fallback' };
    } catch (error) {
      console.error('Daily analysis AI request failed:', error);
      return { analysis: fallback, source: 'fallback' };
    }
  },

  fallbackAnalysis,
};
