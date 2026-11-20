import type { EnrichedMatchStats } from '../../src/services/sportsData/sportsDataProvider.js';

export type AnalysisRequest = {
  analysisType: 'FREE' | 'VIP';
  match: string;
  prediction: string;
  odds: number;
  confidence: number;
  fixtureId?: string;
  sport?: 'football' | 'basketball';
  league?: string;
  date?: string;
  homeTeam?: string;
  awayTeam?: string;
  manualRequest?: boolean;
  forceRegenerate?: boolean;
};

export type AnalysisResult = {
  analysis: string;
  source: 'gemini' | 'fallback';
  model?: string;
  aiCacheHit?: boolean;
  insufficientData?: boolean;
};

export const STATS_GROUNDING_INSTRUCTION = 'KORISTI ISKLJUČIVO DOSTAVLJENE STATISTIKE. NE IZMIŠLJAJ xG, POVREDE, SUSPENZIJE ILI BROJEVE KOJI NISU PRISUTNI U enrichedStats.';
export const INSUFFICIENT_DATA_MESSAGE = 'Nema dovoljno relevantnih podataka za kvalitetnu AI analizu.';

export const FREE_SYSTEM_INSTRUCTION = `Napiši kratku, prirodnu FREE sportsku analizu na srpskom jeziku za dostavljeni tip. Objasni odnos tipa, kvote i podataka koji su stvarno prisutni u enrichedStats. Kada su dostavljene konkretne brojke, koristi relevantne brojke u obrazloženju.

Tekst neka bude čitljiv i sažet, u jednom ili dva pasusa. Ne obećavaj ishod i ne navodi podatke koji nisu dostavljeni.`;

export const VIP_SYSTEM_INSTRUCTION = `Napiši premium VIP sportsku analizu na srpskom jeziku za dostavljeni tip. Analiza treba da bude konkretnija od FREE verzije: objasni value kvote i relevantne činjenice iz enrichedStats, uz jasan zaključak o izabranom marketu. Kada su dostavljene konkretne brojke, koristi relevantne brojke u obrazloženju.

Piši prirodno u povezanim pasusima. Ne obećavaj ishod i ne dodaj statistiku, formu, H2H, povrede, suspenzije ili kontekst koji nije dostavljen u enrichedStats.`;

export const getSystemInstruction = (type: AnalysisRequest['analysisType']) =>
  `${type === 'VIP' ? VIP_SYSTEM_INSTRUCTION : FREE_SYSTEM_INSTRUCTION}\n\n${STATS_GROUNDING_INSTRUCTION}`;

export const cleanGeneratedText = (value: string) => value
  .replace(/\*\*/g, '').replace(/^\s*[-*]\s+/gm, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

const formatEnrichedStats = (stats: EnrichedMatchStats | null) => {
  if (!stats) return 'Nema dostupnih dodatnih statistika za ovaj meč.';
  const serialized = JSON.stringify(stats);
  return serialized.length > 12_000 ? `${serialized.slice(0, 12_000)}...` : serialized;
};

export const buildUserPrompt = (input: AnalysisRequest, stats: EnrichedMatchStats | null) =>
  `Meč: ${input.match} | Tip: ${input.prediction} | Kvota: ${input.odds.toFixed(2)} | Confidence: ${input.confidence}%\n\n${STATS_GROUNDING_INSTRUCTION}\n\nenrichedStats:\n${formatEnrichedStats(stats)}`;

const hasDataValue = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || typeof value !== 'object') return value !== null && value !== undefined && value !== '';
  return Object.values(value as Record<string, unknown>).some(hasDataValue);
};

export const hasRelevantStatsForAnalysis = (stats: EnrichedMatchStats | null) =>
  Boolean(stats && [stats.statistics, stats.lastMatches, stats.h2h, stats.standings, stats.homeAwayForm].some(hasDataValue));
