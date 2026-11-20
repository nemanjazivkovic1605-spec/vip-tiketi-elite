import { createHash } from 'node:crypto';
import type { EnrichedMatchStats } from '../../src/services/sportsData/sportsDataProvider.js';
import {
  buildUserPrompt, cleanGeneratedText, getSystemInstruction, hasRelevantStatsForAnalysis,
  INSUFFICIENT_DATA_MESSAGE, type AnalysisRequest, type AnalysisResult,
} from './analysisPrompts.js';
import {
  getGeminiModels, modelGenerationConfig, needsGemmaPromptAdapter,
  GEMINI_MAX_ATTEMPTS, GEMINI_REQUEST_TIMEOUT_MS, GEMINI_GENERATION_BUDGET_MS,
} from './geminiConfig.js';

export class GeminiAnalysisError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public retryable = false,
    public retryAfterMs = 0,
  ) { super(message); this.name = 'GeminiAnalysisError'; }
}

type GoogleError = { error?: { status?: string; message?: string; details?: Array<{
  reason?: string;
  violations?: Array<{ quotaId?: string; quotaDimensions?: Record<string, string> }>;
}> } };

export function classifyGeminiError(status: number, payload: GoogleError, retryAfterMs = 0) {
  const details = Array.isArray(payload?.error?.details) ? payload.error.details.filter(detail => detail && typeof detail === 'object') : [];
  const reasons = details.map(detail => detail.reason || '').join(' ');
  const invalidKey = /API_KEY_(?:INVALID|EXPIRED|NOT_FOUND)/.test(reasons)
    || /api key (?:not valid|invalid|expired)/i.test(payload?.error?.message || '');
  if (invalidKey || status === 401) return new GeminiAnalysisError('Gemini API ključ nije važeći. Proverite GEMINI_API_KEY u Vercel podešavanjima.', 503, 'GEMINI_INVALID_KEY');
  if (status === 403 || /SERVICE_DISABLED|BILLING_DISABLED|CONSUMER_INVALID|API_KEY_SERVICE_BLOCKED/.test(reasons)) {
    return new GeminiAnalysisError('Gemini pristup nije dozvoljen za ovaj projekat ili ključ.', 503, 'GEMINI_ACCESS_DENIED');
  }
  if (status === 429) {
    const violations = details.flatMap(detail => Array.isArray(detail.violations) ? detail.violations.filter(Boolean) : []);
    const globalQuota = /PROJECT_QUOTA_EXCEEDED|BILLING_QUOTA_EXCEEDED/.test(reasons)
      || violations.length > 0 && violations.every(violation =>
        !violation.quotaDimensions?.model && !/permodel/i.test(violation.quotaId || ''));
    return new GeminiAnalysisError(
      globalQuota ? 'Gemini kvota projekta je iscrpljena. Sačekajte reset kvote.' : 'Gemini kvota modela je trenutno iscrpljena. Pokušajte kasnije.',
      429, globalQuota ? 'GEMINI_PROJECT_QUOTA' : 'GEMINI_MODEL_QUOTA', !globalQuota, retryAfterMs,
    );
  }
  if (status === 404 || status === 410 || payload?.error?.status === 'NOT_FOUND') return new GeminiAnalysisError('Gemini model trenutno nije dostupan.', 503, 'GEMINI_MODEL_UNAVAILABLE', true);
  if ([408, 500, 502, 503, 504].includes(status)) return new GeminiAnalysisError('Gemini servis trenutno nije dostupan. Pokušajte ponovo.', 503, 'GEMINI_UNAVAILABLE', true, retryAfterMs);
  return new GeminiAnalysisError('Gemini nije prihvatio zahtev. Proverite podatke i konfiguraciju modela.', 502, 'GEMINI_REQUEST_REJECTED');
}

export function buildGeminiPayload(input: AnalysisRequest, stats: EnrichedMatchStats | null, model: string, retry = false) {
  const instruction = getSystemInstruction(input.analysisType);
  const prompt = `${buildUserPrompt(input, stats)}${retry ? '\nPrethodni odgovor je bio nepotpun. Vrati celovit tekst sa završenim rečenicama, koristeći samo dostavljene podatke.' : ''}`;
  const adapter = needsGemmaPromptAdapter(model);
  return {
    ...(adapter ? {} : { systemInstruction: { parts: [{ text: instruction }] } }),
    contents: [{ role: 'user', parts: [{ text: adapter ? `${instruction}\n\n${prompt}` : prompt }] }],
    generationConfig: {
      temperature: input.analysisType === 'VIP' ? 0.58 : 0.64,
      maxOutputTokens: (input.analysisType === 'VIP' ? 1800 : 800) * (retry ? 2 : 1),
      ...modelGenerationConfig(model),
    },
  };
}

export function parseGeminiResponse(payload: unknown, analysisType: AnalysisRequest['analysisType']): string {
  const data = payload as { promptFeedback?: { blockReason?: string }; candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: unknown; thought?: boolean }> };
  }> } | null;
  if (data?.promptFeedback?.blockReason) throw new GeminiAnalysisError('Gemini je odbio sadržaj zahteva. Proverite ulazne podatke.', 422, 'GEMINI_CONTENT_BLOCKED');
  const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : undefined;
  if (candidate && ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'RECITATION', 'SPII'].includes(candidate.finishReason || '')) {
    throw new GeminiAnalysisError('Gemini je odbio sadržaj zahteva. Proverite ulazne podatke.', 422, 'GEMINI_CONTENT_BLOCKED');
  }
  const parts = candidate?.content?.parts;
  const text = cleanGeneratedText(Array.isArray(parts)
    ? parts.filter(part => part && part.thought !== true && typeof part.text === 'string').map(part => part.text).join('') : '');
  if (candidate?.finishReason !== 'STOP' || text.length < (analysisType === 'VIP' ? 180 : 100)
    || !/[.!?]["'»”)]?$/.test(text)) {
    throw new GeminiAnalysisError('Gemini nije vratio kompletnu analizu. Pokušajte ponovo.', 502, 'GEMINI_INVALID_RESPONSE', true);
  }
  return text;
}

const validateInput = (input: AnalysisRequest) => {
  if (!input || !['FREE', 'VIP'].includes(input.analysisType) || !input.match?.trim() || !input.prediction?.trim()
    || !Number.isFinite(input.odds) || input.odds <= 1 || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 100) {
    throw new GeminiAnalysisError('Unesite meč, tip, kvotu i confidence pre generisanja analize.', 400, 'INVALID_ANALYSIS_INPUT');
  }
};

type ServiceOptions = {
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  requestTimeoutMs?: number;
  budgetMs?: number;
  log?: (event: Record<string, unknown>) => void;
};

export function createGeminiAnalysisService(options: ServiceOptions = {}) {
  const env = options.env || process.env;
  const now = options.now || Date.now;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const log = options.log || (event => console.info('[gemini]', JSON.stringify(event)));
  const cache = new Map<string, { expiresAt: number; result: AnalysisResult }>();
  const pending = new Map<string, Promise<AnalysisResult>>();

  async function requestModel(input: AnalysisRequest, stats: EnrichedMatchStats | null, model: string, deadline: number, retry: boolean) {
    const remaining = deadline - now();
    if (remaining <= 0) throw new GeminiAnalysisError('Generisanje analize traje predugo. Pokušajte ponovo.', 504, 'GEMINI_TIMEOUT', true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(options.requestTimeoutMs ?? GEMINI_REQUEST_TIMEOUT_MS, remaining));
    try {
      const response = await (options.fetch || fetch)(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY!.trim() },
        body: JSON.stringify(buildGeminiPayload(input, stats, model, retry)),
        signal: controller.signal,
      });
      let data: unknown;
      try { data = await response.json(); }
      catch {
        if (!response.ok) throw classifyGeminiError(response.status, {});
        throw new GeminiAnalysisError('Gemini je vratio neispravan odgovor. Pokušajte ponovo.', 502, 'GEMINI_INVALID_RESPONSE', true);
      }
      if (!response.ok) {
        const seconds = Number(response.headers.get('retry-after'));
        throw classifyGeminiError(response.status, data as GoogleError, Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 0);
      }
      return parseGeminiResponse(data, input.analysisType);
    } catch (error) {
      if (error instanceof GeminiAnalysisError) throw error;
      throw new GeminiAnalysisError(
        controller.signal.aborted ? 'Generisanje analize traje predugo. Pokušajte ponovo.' : 'Veza sa Gemini servisom trenutno nije dostupna.',
        503, controller.signal.aborted ? 'GEMINI_TIMEOUT' : 'GEMINI_NETWORK_ERROR', true,
      );
    } finally { clearTimeout(timer); }
  }

  async function generateSportsAnalysis(input: AnalysisRequest, stats: EnrichedMatchStats | null = null): Promise<AnalysisResult> {
    validateInput(input);
    if (!hasRelevantStatsForAnalysis(stats)) return { analysis: INSUFFICIENT_DATA_MESSAGE, source: 'fallback', insufficientData: true };
    if (!env.GEMINI_API_KEY?.trim()) throw new GeminiAnalysisError('GEMINI_API_KEY nije podešen na serveru.', 503, 'GEMINI_NOT_CONFIGURED');
    let models: string[];
    try { models = getGeminiModels(env); }
    catch { throw new GeminiAnalysisError('Gemini konfiguracija modela nije ispravna. Podesite najviše tri modela.', 503, 'GEMINI_CONFIG_INVALID'); }
    const deadline = now() + (options.budgetMs ?? GEMINI_GENERATION_BUDGET_MS);
    let attempts = 0;
    let outputRetryUsed = false;
    let lastError = new GeminiAnalysisError('Gemini modeli trenutno nisu dostupni.', 503, 'GEMINI_UNAVAILABLE');
    for (const model of models) {
      for (let retry = 0; retry < 2 && attempts < GEMINI_MAX_ATTEMPTS && now() < deadline; retry++) {
        attempts++;
        try {
          const analysis = await requestModel(input, stats, model, deadline, retry > 0);
          log({ event: 'generated', model, analysisType: input.analysisType, attempts });
          return { analysis, source: 'gemini', model };
        } catch (error) {
          lastError = error instanceof GeminiAnalysisError ? error : new GeminiAnalysisError('Generisanje analize nije uspelo.', 503, 'GEMINI_UNAVAILABLE');
          log({ event: 'attempt_failed', model, code: lastError.code, attempt: attempts });
          if (!lastError.retryable) throw lastError;
          // Retry malformed/truncated output once; quota/outages move to the next model.
          const sameModelRetry = lastError.code === 'GEMINI_INVALID_RESPONSE' && retry === 0 && !outputRetryUsed;
          if (sameModelRetry) outputRetryUsed = true;
          if (attempts < GEMINI_MAX_ATTEMPTS && (sameModelRetry || models.indexOf(model) < models.length - 1)) {
            const delay = Math.max(lastError.retryAfterMs, Math.min(1500, 250 * 2 ** (attempts - 1)));
            if (delay < deadline - now() && delay <= 1500) await sleep(delay);
            else if (delay > 1500) break;
          }
          if (!sameModelRetry) break;
        }
      }
      if (attempts >= GEMINI_MAX_ATTEMPTS || now() >= deadline) break;
    }
    throw lastError;
  }

  async function generateProtectedSportsAnalysis(input: AnalysisRequest, stats: EnrichedMatchStats | null = null): Promise<AnalysisResult> {
    validateInput(input);
    const key = createHash('sha256').update(JSON.stringify([
      input.analysisType, input.fixtureId, input.date, input.sport, input.match, input.prediction, input.odds, input.confidence, stats,
    ])).digest('hex');
    for (const [id, entry] of cache) if (entry.expiresAt <= now()) cache.delete(id);
    const cached = !input.forceRegenerate && cache.get(key);
    if (cached) return { ...cached.result, aiCacheHit: true };
    const running = pending.get(key);
    if (running) return { ...(await running), aiCacheHit: true };
    if (pending.size >= 20) throw new GeminiAnalysisError('Previše AI zahteva je u toku. Pokušajte uskoro.', 429, 'GEMINI_BUSY');
    const task = generateSportsAnalysis(input, stats).then(result => {
      const completed = { ...result, aiCacheHit: false };
      if (result.source === 'gemini') {
        if (cache.size >= 200) cache.delete(cache.keys().next().value!);
        cache.set(key, { expiresAt: now() + 20 * 60_000, result: completed });
      }
      return completed;
    }).finally(() => { if (pending.get(key) === task) pending.delete(key); });
    pending.set(key, task);
    return task;
  }
  return { generateSportsAnalysis, generateProtectedSportsAnalysis };
}

const service = createGeminiAnalysisService();
export const generateSportsAnalysis = service.generateSportsAnalysis;
export const generateProtectedSportsAnalysis = service.generateProtectedSportsAnalysis;
