import { auth } from '../lib/firebase';
import type { DailyAnalysisItem } from '../types';

type AiAnalysisResult = {
  analysis: string;
  source: 'gemini' | 'fallback';
};

const fallbackAnalysis = (item: DailyAnalysisItem) => {
  const oddsText = Number(item.odds) > 1 ? ` po kvoti ${Number(item.odds).toFixed(2)}` : '';
  return `${item.homeTeam} i ${item.awayTeam} ulaze u duel u okviru ${item.league}, gde predlog ${item.prediction}${oddsText} predstavlja razuman izbor u odnosu na profil meca. Matchup zahteva disciplinovan pristup, uz fokus na ritam, stabilnost igre i situacije koje podrzavaju izabrani market. Dostupne informacije ukazuju na vrednost ovog tipa, uz obavezno odgovorno upravljanje ulogom.`;
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
        ? result.analysis.trim()
        : fallback;
      return { analysis, source: result.source === 'gemini' ? 'gemini' : 'fallback' };
    } catch (error) {
      console.error('Daily analysis AI request failed:', error);
      return { analysis: fallback, source: 'fallback' };
    }
  },

  fallbackAnalysis,
};
