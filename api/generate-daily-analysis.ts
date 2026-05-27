import type { IncomingMessage, ServerResponse } from 'node:http';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { getConfiguredSportsProviderIds, getEnrichedMatchStats, type EnrichedMatchStats } from '../src/services/sportsData/sportsDataProvider.js';

type AnalysisType = 'FREE' | 'VIP';

type AnalysisRequest = {
  analysisType: AnalysisType;
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

type AuthenticatedUser = {
  uid: string;
  email: string;
  emailVerified: boolean;
};

type RateEntry = { count: number; resetAt: number };
type AnalysisResult = { analysis: string; source: 'gemini' | 'fallback'; model?: string; aiCacheHit?: boolean; insufficientData?: boolean };
type ApiRequest = IncomingMessage & { body?: unknown };

const PRIMARY_MODEL = process.env.GEMINI_ANALYSIS_MODEL?.trim() || 'gemini-3-flash-preview';
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const ANALYSIS_MODELS = Array.from(new Set([PRIMARY_MODEL, ...FALLBACK_MODELS]));
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const MANUAL_COOLDOWN_MS = 7_000;
const AI_CACHE_TTL_MS = 20 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 14_000;
const GENERATION_BUDGET_MS = 34_000;
const TRUSTED_ADMIN_EMAILS = new Set(['nemanjazivkovic1605@gmail.com']);
const requestCounts = new Map<string, RateEntry>();
const lastManualRequestAt = new Map<string, number>();
const aiCache = new Map<string, { expiresAt: number; result: AnalysisResult }>();
const pendingAnalyses = new Map<string, Promise<AnalysisResult>>();
const STATS_GROUNDING_INSTRUCTION = 'KORISTI ISKLJUČIVO DOSTAVLJENE STATISTIKE. NE IZMIŠLJAJ xG, POVREDE, SUSPENZIJE ILI BROJEVE KOJI NISU PRISUTNI U enrichedStats.';
const INSUFFICIENT_DATA_MESSAGE = 'Nema dovoljno relevantnih podataka za kvalitetnu AI analizu.';

const FREE_SYSTEM_INSTRUCTION = `Napiši kratku, prirodnu FREE sportsku analizu na srpskom jeziku za dostavljeni tip. Objasni odnos tipa, kvote i podataka koji su stvarno prisutni u enrichedStats. Kada su dostavljene konkretne brojke, koristi relevantne brojke u obrazloženju.

Tekst neka bude čitljiv i sažet, u jednom ili dva pasusa. Ne obećavaj ishod i ne navodi podatke koji nisu dostavljeni.`;

const VIP_SYSTEM_INSTRUCTION = `Napiši premium VIP sportsku analizu na srpskom jeziku za dostavljeni tip. Analiza treba da bude konkretnija od FREE verzije: objasni value kvote i relevantne činjenice iz enrichedStats, uz jasan zaključak o izabranom marketu. Kada su dostavljene konkretne brojke, koristi relevantne brojke u obrazloženju.

Piši prirodno u povezanim pasusima. Ne obećavaj ishod i ne dodaj statistiku, formu, H2H, povrede, suspenzije ili kontekst koji nije dostavljen u enrichedStats.`;

const normalizeText = (value: unknown) => typeof value === 'string' ? value.trim() : '';

const cleanGeneratedText = (value: string) =>
  value
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const parseRequest = (body: unknown): AnalysisRequest | null => {
  if (!body || typeof body !== 'object') return null;
  const input = body as Record<string, unknown>;
  const analysisType = input.analysisType === 'VIP' ? 'VIP' : input.analysisType === 'FREE' ? 'FREE' : undefined;
  const match = normalizeText(input.match);
  const prediction = normalizeText(input.prediction);
  const odds = Number(input.odds);
  const confidence = Number(input.confidence);

  if (!analysisType || !match || !prediction || !Number.isFinite(odds) || odds <= 1 || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    return null;
  }

  return {
    analysisType,
    match,
    prediction,
    odds,
    confidence,
    fixtureId: normalizeText(input.fixtureId) || undefined,
    sport: input.sport === 'basketball' ? 'basketball' : 'football',
    league: normalizeText(input.league) || undefined,
    date: normalizeText(input.date) || undefined,
    homeTeam: normalizeText(input.homeTeam) || match.split(/\s+-\s+/)[0]?.trim() || undefined,
    awayTeam: normalizeText(input.awayTeam) || match.split(/\s+-\s+/)[1]?.trim() || undefined,
    manualRequest: input.manualRequest === true,
    forceRegenerate: input.forceRegenerate === true,
  };
};

const formatEnrichedStats = (stats: EnrichedMatchStats | null) => {
  if (!stats) return 'Nema dostupnih dodatnih statistika za ovaj meč.';
  const serialized = JSON.stringify(stats);
  return serialized.length > 12_000 ? `${serialized.slice(0, 12_000)}...` : serialized;
};

export const buildUserPrompt = (input: AnalysisRequest, enrichedStats: EnrichedMatchStats | null) =>
  `Meč: ${input.match} | Tip: ${input.prediction} | Kvota: ${input.odds.toFixed(2)} | Confidence: ${input.confidence}%

KORISTI ISKLJUČIVO DOSTAVLJENE STATISTIKE. NE IZMIŠLJAJ xG, POVREDE, SUSPENZIJE ILI BROJEVE KOJI NISU PRISUTNI U enrichedStats.

enrichedStats:
${formatEnrichedStats(enrichedStats)}`;

const hasDataValue = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || typeof value !== 'object') return value !== null && value !== undefined && value !== '';
  return Object.values(value as Record<string, unknown>).some(hasDataValue);
};

export const hasRelevantStatsForAnalysis = (stats: EnrichedMatchStats | null) =>
  Boolean(stats && [
    stats.statistics,
    stats.lastMatches,
    stats.h2h,
    stats.standings,
    stats.homeAwayForm,
  ].some(hasDataValue));

const buildFallbackAnalysis = (input: AnalysisRequest, hasRelevantStats: boolean) => {
  if (!hasRelevantStats) return INSUFFICIENT_DATA_MESSAGE;
  const impliedProbability = (100 / input.odds).toFixed(1);
  const overlay = (input.confidence - (100 / input.odds)).toFixed(1);
  return `Za ${input.match}, tip ${input.prediction} po kvoti ${input.odds.toFixed(2)} nosi implicitnu verovatnoću od ${impliedProbability}%, u odnosu na procenu od ${input.confidence}% i razliku od ${overlay} procentnih poena. Gemini trenutno nije vratio kompletan tekst, zato ovu kratku procenu treba dopuniti ručnom proverom dostupne statistike pre objave.`;
};

const getSystemInstruction = (analysisType: AnalysisType) =>
  analysisType === 'VIP' ? VIP_SYSTEM_INSTRUCTION : FREE_SYSTEM_INSTRUCTION;

const isAcceptableAnalysis = (analysis: string, analysisType: AnalysisType) => {
  const minimumLength = analysisType === 'VIP' ? 180 : 100;
  return analysis.length >= minimumLength;
};

const requestGeminiAnalysis = async (apiKey: string, input: AnalysisRequest, enrichedStats: EnrichedMatchStats | null, model: string, deadline: number, retry = false) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now())));
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: `${getSystemInstruction(input.analysisType)}\n\n${STATS_GROUNDING_INSTRUCTION}` }],
          },
          contents: [{
            role: 'user',
            parts: [{
              text: `${buildUserPrompt(input, enrichedStats)}${retry ? '\nPrethodni tekst nije ispunio dužinu ili ton. Napiši kompletnu, povezanu analizu prema instrukciji.' : ''}`,
            }],
          }],
          generationConfig: {
            temperature: input.analysisType === 'VIP' ? 0.58 : 0.64,
            maxOutputTokens: input.analysisType === 'VIP' ? 1400 : 600,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`${response.status}`);
    }

    const result = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return cleanGeneratedText((result.candidates || [])
      .flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => part.text || '')
      .join('\n\n'));
  } finally {
    clearTimeout(timeoutId);
  }
};

export async function generateSportsAnalysis(input: AnalysisRequest, enrichedStats: EnrichedMatchStats | null = null): Promise<AnalysisResult> {
  const hasRelevantStats = hasRelevantStatsForAnalysis(enrichedStats);
  const fallback = buildFallbackAnalysis(input, hasRelevantStats);
  if (!hasRelevantStats) return { analysis: fallback, source: 'fallback', insufficientData: true };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { analysis: fallback, source: 'fallback' };

  const deadline = Date.now() + GENERATION_BUDGET_MS;
  for (const model of ANALYSIS_MODELS) {
    if (Date.now() >= deadline) break;
    try {
      const firstResult = await requestGeminiAnalysis(apiKey, input, enrichedStats, model, deadline);
      if (isAcceptableAnalysis(firstResult, input.analysisType)) {
        return { analysis: firstResult, source: 'gemini', model };
      }

      if (Date.now() >= deadline) break;
      const retryResult = await requestGeminiAnalysis(apiKey, input, enrichedStats, model, deadline, true);
      if (isAcceptableAnalysis(retryResult, input.analysisType)) {
        return { analysis: retryResult, source: 'gemini', model };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      console.info(`Gemini model fallback from ${model}: ${message}`);
    }
  }

  return { analysis: fallback, source: 'fallback' };
}

const getAnalysisCacheKey = (input: AnalysisRequest) =>
  [input.analysisType, input.match, input.prediction, input.odds.toFixed(2), input.confidence].join(':').toLowerCase();

export async function generateProtectedSportsAnalysis(
  input: AnalysisRequest,
  enrichedStats: EnrichedMatchStats | null = null,
): Promise<AnalysisResult> {
  const cacheKey = getAnalysisCacheKey(input);
  if (!input.forceRegenerate) {
    const cached = aiCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, aiCacheHit: true };
    }
  }

  const pending = pendingAnalyses.get(cacheKey);
  if (pending) {
    return { ...(await pending), aiCacheHit: true };
  }

  const request = generateSportsAnalysis(input, enrichedStats)
    .then((result) => {
      const completed = { ...result, aiCacheHit: false };
      aiCache.set(cacheKey, { expiresAt: Date.now() + AI_CACHE_TTL_MS, result: completed });
      return completed;
    })
    .finally(() => {
      if (pendingAnalyses.get(cacheKey) === request) {
        pendingAnalyses.delete(cacheKey);
      }
    });
  pendingAnalyses.set(cacheKey, request);
  return request;
}

export const getEnrichmentMessage = (configuredProviders: string[], stats: EnrichedMatchStats | null) => {
  if (configuredProviders.length === 0) {
    return 'Sports API ključevi nisu podešeni, analiza je generisana samo iz osnovnih podataka.';
  }
  return stats
    ? `Dodatna statistika: ${stats.provider}.`
    : 'Dodatna statistika nije pronađena, analiza je generisana iz osnovnih podataka.';
};

const readBody = async (request: ApiRequest) => {
  if (request.body && typeof request.body === 'object') return request.body;
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
};

const sendJson = (response: ServerResponse, status: number, data: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(data));
};

const verifyFirebaseUser = async (authorization?: string): Promise<AuthenticatedUser | null> => {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return null;

  const authResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    },
  );
  if (!authResponse.ok) return null;
  const authData = await authResponse.json() as {
    users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
  };
  const user = authData.users?.[0];
  if (!user?.localId || !user.email) return null;

  if (TRUSTED_ADMIN_EMAILS.has(user.email.toLowerCase())) {
    return { uid: user.localId, email: user.email, emailVerified: user.emailVerified === true };
  }

  const userDoc = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/users/${user.localId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!userDoc.ok) return null;
  const profile = await userDoc.json() as {
    fields?: { role?: { stringValue?: string }; isAdmin?: { booleanValue?: boolean } };
  };
  const isAdmin = profile.fields?.role?.stringValue === 'admin' || profile.fields?.isAdmin?.booleanValue === true;
  return isAdmin ? { uid: user.localId, email: user.email, emailVerified: user.emailVerified === true } : null;
};

const canGenerateNow = (key: string) => {
  const now = Date.now();
  const current = requestCounts.get(key);
  if (!current || current.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT) return false;
  current.count += 1;
  return true;
};

const canStartManualGeneration = (key: string) => {
  const now = Date.now();
  const lastRequestAt = lastManualRequestAt.get(key) || 0;
  if (now - lastRequestAt < MANUAL_COOLDOWN_MS) return false;
  lastManualRequestAt.set(key, now);
  return true;
};

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const user = await verifyFirebaseUser(request.headers.authorization);
    if (!user) {
      sendJson(response, 403, { error: 'Admin authorization required.' });
      return;
    }

    const input = parseRequest(await readBody(request));
    if (!input) {
      sendJson(response, 400, { error: 'Unesite meč, tip, kvotu i confidence pre generisanja analize.' });
      return;
    }

    if (!input.manualRequest) {
      sendJson(response, 400, { error: 'AI analiza se generiše samo ručnom admin akcijom.' });
      return;
    }

    if (!canGenerateNow(user.uid)) {
      sendJson(response, 429, { error: 'Previše zahteva. Sačekajte minut i pokušajte ponovo.' });
      return;
    }

    if (input.manualRequest && !canStartManualGeneration(user.uid)) {
      sendJson(response, 429, { error: 'Sačekaj nekoliko sekundi pre novog AI zahteva.' });
      return;
    }

    const configuredSportsProviders = getConfiguredSportsProviderIds();
    const enrichment = configuredSportsProviders.length > 0 && input.homeTeam && input.awayTeam
      ? await getEnrichedMatchStats({
          fixtureId: input.fixtureId,
          sport: input.sport,
          league: input.league,
          date: input.date,
          homeTeam: input.homeTeam,
          awayTeam: input.awayTeam,
        })
      : { stats: null, fromCache: false, attemptedProviders: [] };
    const result = await generateProtectedSportsAnalysis(input, enrichment.stats);
    sendJson(response, 200, {
      ...result,
      enrichedStatsFound: Boolean(enrichment.stats),
      statsProvider: enrichment.stats?.provider,
      enrichmentCacheHit: enrichment.fromCache,
      configuredSportsProviders,
      enrichmentMessage: getEnrichmentMessage(configuredSportsProviders, enrichment.stats),
    });
  } catch (error) {
    console.error('Daily analysis API handler failed:', error instanceof Error ? error.message : 'Unknown error');
    sendJson(response, 500, { error: 'Generisanje analize trenutno nije dostupno.' });
  }
}
