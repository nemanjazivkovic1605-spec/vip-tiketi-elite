import { auth } from '../lib/firebase';
import type { DailyAnalysisItem } from '../types';

export type AiAnalysisResult = {
  analysis: string;
  source: 'gemini' | 'fallback';
  model?: string;
  enrichedStatsFound?: boolean;
  statsProvider?: string;
  enrichmentMessage?: string;
  enrichmentCacheHit?: boolean;
  aiCacheHit?: boolean;
  insufficientData?: boolean;
};

export type AnalysisGenerationType = 'FREE' | 'VIP';
export type AnalysisGenerationOptions = {
  manualRequest?: boolean;
  forceRegenerate?: boolean;
};

const cleanAnalysis = (value: string) =>
  value
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const validateGenerationInput = (item: DailyAnalysisItem) => {
  const match = `${item.homeTeam || ''} - ${item.awayTeam || ''}`.trim();
  const odds = Number(item.odds);
  const confidence = Number(item.confidence);
  if (!item.homeTeam?.trim() || !item.awayTeam?.trim() || !item.prediction?.trim() || !Number.isFinite(odds) || odds <= 1 || !Number.isFinite(confidence)) {
    throw new Error('Unesite meč, tip, kvotu i confidence pre generisanja analize.');
  }
  return { match, odds, confidence };
};

export const dailyAnalysisAiService = {
  generateSportsAnalysis: async (
    analysisType: AnalysisGenerationType,
    item: DailyAnalysisItem,
    options?: AnalysisGenerationOptions,
  ): Promise<AiAnalysisResult> => {
    const payload = validateGenerationInput(item);
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) throw new Error('Morate biti prijavljeni kao admin da biste generisali analizu.');

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 50_000);
    try {
      const token = await firebaseUser.getIdToken();
      const response = await fetch('/api/generate-daily-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          analysisType,
          match: payload.match,
          prediction: item.prediction.trim(),
          odds: payload.odds,
          confidence: payload.confidence,
          fixtureId: item.fixtureId === undefined ? undefined : String(item.fixtureId),
          sport: item.sport || 'football',
          league: item.league,
          date: item.date,
          homeTeam: item.homeTeam,
          awayTeam: item.awayTeam,
          manualRequest: options?.manualRequest === true,
          forceRegenerate: options?.forceRegenerate === true,
        }),
        signal: controller.signal,
      });

      const result = await response.json() as Partial<AiAnalysisResult> & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Generisanje analize trenutno nije dostupno.');
      const analysis = typeof result.analysis === 'string' && result.analysis.trim()
        ? cleanAnalysis(result.analysis)
        : '';
      if (!analysis) throw new Error('Gemini nije vratio tekst analize.');
      return {
        analysis,
        source: result.source === 'gemini' ? 'gemini' : 'fallback',
        model: result.model,
        enrichedStatsFound: result.enrichedStatsFound === true,
        statsProvider: result.statsProvider,
        enrichmentMessage: result.enrichmentMessage,
        enrichmentCacheHit: result.enrichmentCacheHit === true,
        aiCacheHit: result.aiCacheHit === true,
        insufficientData: result.insufficientData === true,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Generisanje analize traje predugo. Pokušajte ponovo.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  },
};
