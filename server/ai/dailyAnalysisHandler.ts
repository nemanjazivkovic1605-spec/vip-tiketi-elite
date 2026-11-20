import type { IncomingMessage, ServerResponse } from 'node:http';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import { getConfiguredSportsProviderIds, getEnrichedMatchStats, type EnrichedMatchStats } from '../../src/services/sportsData/sportsDataProvider.js';
import { type AnalysisRequest } from './analysisPrompts.js';
import { GeminiAnalysisError, generateProtectedSportsAnalysis } from './geminiAnalysis.js';

type ApiRequest = IncomingMessage & { body?: unknown };
type AuthenticatedUser = { uid: string; email: string; emailVerified: boolean };
const TRUSTED_ADMIN_EMAILS = new Set(['nemanjazivkovic1605@gmail.com']);
const normalizeText = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export const parseAnalysisRequest = (body: unknown): AnalysisRequest | null => {
  if (!body || typeof body !== 'object') return null;
  const input = body as Record<string, unknown>;
  const analysisType = input.analysisType === 'VIP' ? 'VIP' : input.analysisType === 'FREE' ? 'FREE' : undefined;
  const match = normalizeText(input.match);
  const prediction = normalizeText(input.prediction);
  const odds = Number(input.odds);
  const confidence = Number(input.confidence);
  if (!analysisType || !match || !prediction || !Number.isFinite(odds) || odds <= 1
    || input.confidence === undefined || input.confidence === null || input.confidence === ''
    || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) return null;
  return {
    analysisType, match, prediction, odds, confidence,
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

export const getEnrichmentMessage = (providers: string[], stats: EnrichedMatchStats | null) => {
  if (!providers.length) return 'Sports API ključevi nisu podešeni. Dodatna statistika nije dostupna.';
  return stats ? `Dodatna statistika: ${stats.provider}.` : 'Dodatna statistika nije pronađena.';
};

const readBody = async (request: ApiRequest) => {
  if (request.body && typeof request.body === 'object') return request.body;
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown : {};
};

const sendJson = (response: ServerResponse, status: number, data: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(data));
};

const verifyFirebaseUser = async (authorization?: string): Promise<AuthenticatedUser | null> => {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return null;
  const authResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(6000),
    },
  );
  if (!authResponse.ok) return null;
  const authData = await authResponse.json() as { users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }> };
  const user = authData.users?.[0];
  if (!user?.localId || !user.email) return null;
  if (TRUSTED_ADMIN_EMAILS.has(user.email.toLowerCase())) {
    return { uid: user.localId, email: user.email, emailVerified: user.emailVerified === true };
  }
  const userDoc = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/users/${user.localId}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) },
  );
  if (!userDoc.ok) return null;
  const profile = await userDoc.json() as { fields?: { role?: { stringValue?: string }; isAdmin?: { booleanValue?: boolean } } };
  const isAdmin = profile.fields?.role?.stringValue === 'admin' || profile.fields?.isAdmin?.booleanValue === true;
  return isAdmin ? { uid: user.localId, email: user.email, emailVerified: user.emailVerified === true } : null;
};

export function createDailyAnalysisHandler(dependencies = {
  verifyFirebaseUser, getConfiguredSportsProviderIds, getEnrichedMatchStats, generateProtectedSportsAnalysis,
}, getNow = Date.now) {
  const counts = new Map<string, { count: number; resetAt: number }>();
  const lastRequest = new Map<string, number>();
  return async function handler(request: ApiRequest, response: ServerResponse) {
    if (request.method !== 'POST') { sendJson(response, 405, { error: 'Method not allowed.' }); return; }
    try {
      const user = await dependencies.verifyFirebaseUser(request.headers.authorization);
      if (!user) { sendJson(response, 403, { error: 'Admin authorization required.' }); return; }
      let body: unknown;
      try { body = await readBody(request); }
      catch { sendJson(response, 400, { error: 'Neispravan JSON zahtev.' }); return; }
      const input = parseAnalysisRequest(body);
      if (!input) { sendJson(response, 400, { error: 'Unesite meč, tip, kvotu i confidence pre generisanja analize.' }); return; }
      if (!input.manualRequest) { sendJson(response, 400, { error: 'AI analiza se generiše samo ručnom admin akcijom.' }); return; }
      const now = getNow();
      for (const [id, entry] of counts) if (entry.resetAt <= now) counts.delete(id);
      for (const [id, time] of lastRequest) if (now - time >= 60_000) lastRequest.delete(id);
      const count = counts.get(user.uid) || { count: 0, resetAt: now + 60_000 };
      if (count.count >= 12) { sendJson(response, 429, { error: 'Previše zahteva. Sačekajte minut i pokušajte ponovo.' }); return; }
      count.count++;
      counts.set(user.uid, count);
      if (now - (lastRequest.get(user.uid) || 0) < 7000) {
        sendJson(response, 429, { error: 'Sačekaj nekoliko sekundi pre novog AI zahteva.' }); return;
      }
      lastRequest.set(user.uid, now);
      const configuredSportsProviders = dependencies.getConfiguredSportsProviderIds();
      const enrichment = configuredSportsProviders.length > 0 && input.homeTeam && input.awayTeam
        ? await dependencies.getEnrichedMatchStats({
            fixtureId: input.fixtureId, sport: input.sport, league: input.league, date: input.date,
            homeTeam: input.homeTeam, awayTeam: input.awayTeam,
          }) : { stats: null, fromCache: false, attemptedProviders: [] };
      const result = await dependencies.generateProtectedSportsAnalysis(input, enrichment.stats);
      sendJson(response, 200, {
        ...result, enrichedStatsFound: Boolean(enrichment.stats), statsProvider: enrichment.stats?.provider,
        enrichmentCacheHit: enrichment.fromCache, configuredSportsProviders,
        enrichmentMessage: getEnrichmentMessage(configuredSportsProviders, enrichment.stats),
      });
    } catch (error) {
      if (error instanceof GeminiAnalysisError) {
        if (error.retryAfterMs > 0) response.setHeader('Retry-After', String(Math.ceil(error.retryAfterMs / 1000)));
        sendJson(response, error.status, { error: error.message, code: error.code });
      } else {
        console.error('Daily analysis API handler failed.');
        sendJson(response, 500, { error: 'Generisanje analize trenutno nije dostupno.' });
      }
    }
  };
}

export default createDailyAnalysisHandler();
