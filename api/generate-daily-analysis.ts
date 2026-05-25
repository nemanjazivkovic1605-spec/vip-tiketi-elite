import type { IncomingMessage, ServerResponse } from 'node:http';
import firebaseConfig from '../firebase-applet-config.json';

type MatchData = {
  league?: string;
  sport?: string;
  homeTeam?: string;
  awayTeam?: string;
  prediction?: string;
  odds?: number;
  formHome?: number | null;
  formAway?: number | null;
  confidence?: number;
  risk?: string;
  stats?: string;
};

type AuthenticatedUser = {
  uid: string;
  email: string;
  emailVerified: boolean;
};

type RateEntry = { count: number; resetAt: number };
type ApiRequest = IncomingMessage & { body?: unknown };

const MODEL = 'gemini-1.5-flash';
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const TRUSTED_ADMIN_EMAILS = new Set(['nemanjazivkovic1605@gmail.com']);
const requestCounts = new Map<string, RateEntry>();

const MASTER_PROMPT = `Ti si elitni evropski sportski analiticar i profesionalni VIP tipster koji pise premium analize za ozbiljnu betting platformu.

Tvoj zadatak je da napises profesionalnu sportsku analizu na SRPSKOM jeziku za predlozeni tip.

Analiza mora zvucati prirodno i ljudski, biti ubedljiva ali profesionalna, izgledati kao premium VIP sadrzaj, direktno pomenuti timove i objasniti zasto tip ima vrednost. Fokusiraj se na stil utakmice i logiku tipa, uz profesionalni sportski recnik.

Analiza ne sme obecavati sigurnu zaradu niti koristiti izraze: "zicer", "100% prolaz", "siguran tip", "nemoguce da padne", "garantovan dobitak".

Stil mora biti ozbiljan, samouveren i moderan evropski betting stil, bez emojija, bez bullet lista i bez preteranog statistickog nabrajanja. Napisati 3 do 5 kvalitetnih recenica.

Posebna pravila:
- Za GG / BTTS fokusiraj otvorenu utakmicu, stil igre oba tima, ranjive odbrane, efikasnost, prostor u tranziciji i tempo.
- Za OVER fokusiraj ritam, napadacki potencijal, nacin na koji matchup otvara golove/poene i efekat ranog pogotka.
- Za UNDER fokusiraj disciplinu, zatvoren pristup, oprez i tvrd mec.
- Za 1 ili 2 fokusiraj kvalitet, momentum, domaci teren/formu i matchup prednost.
- Za 1X / X2 fokusiraj stabilnost, kontrolu i tezinu da favorit izgubi.
- Za NG fokusiraj slab napad jednog tima, defanzivnu stabilnost i kontrolu ritma.

Obavezno direktno koristi imena timova i naziv lige ako prirodno zvuci. Analiza treba da zvuci kao da ju je napisao iskusan sportski analiticar.`;

const normalizeText = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const formatOptional = (value: unknown) =>
  value === null || value === undefined || value === '' ? 'Nedovoljno podataka' : String(value);

const getSafeMatchData = (body: unknown): MatchData => {
  const value = body && typeof body === 'object' && 'matchData' in body
    ? (body as { matchData: Record<string, unknown> }).matchData
    : {};

  return {
    league: normalizeText(value.league, 'Takmicenje'),
    sport: normalizeText(value.sport, 'football'),
    homeTeam: normalizeText(value.homeTeam, 'Domacin'),
    awayTeam: normalizeText(value.awayTeam, 'Gost'),
    prediction: normalizeText(value.prediction, 'predlozeni market'),
    odds: Number.isFinite(Number(value.odds)) ? Number(value.odds) : undefined,
    formHome: Number.isFinite(Number(value.formHome)) ? Number(value.formHome) : null,
    formAway: Number.isFinite(Number(value.formAway)) ? Number(value.formAway) : null,
    confidence: Number.isFinite(Number(value.confidence)) ? Number(value.confidence) : undefined,
    risk: normalizeText(value.risk, 'MEDIUM'),
    stats: normalizeText(value.stats, 'Nedovoljno dodatnih statistickih podataka.'),
  };
};

export const buildFallbackAnalysis = (matchData: MatchData) => {
  const homeTeam = normalizeText(matchData.homeTeam, 'Domaci tim');
  const awayTeam = normalizeText(matchData.awayTeam, 'gostujuci tim');
  const prediction = normalizeText(matchData.prediction, 'izabrani market');
  const league = normalizeText(matchData.league, 'ovom takmicenju');
  const oddsText = matchData.odds && matchData.odds > 1 ? ` po kvoti ${matchData.odds.toFixed(2)}` : '';

  return `${homeTeam} i ${awayTeam} ulaze u duel u okviru ${league}, gde predlog ${prediction}${oddsText} predstavlja razuman izbor u odnosu na profil meca. Matchup zahteva disciplinovan pristup, uz fokus na ritam, stabilnost igre i situacije koje podrzavaju izabrani market. Dostupne informacije ukazuju na vrednost ovog tipa, uz obavezno odgovorno upravljanje ulogom.`;
};

const buildPrompt = (matchData: MatchData) => `${MASTER_PROMPT}

Ulazni podaci:
Liga: ${formatOptional(matchData.league)}
Sport: ${formatOptional(matchData.sport)}
Domacin: ${formatOptional(matchData.homeTeam)}
Gost: ${formatOptional(matchData.awayTeam)}
Predlog: ${formatOptional(matchData.prediction)}
Kvota: ${formatOptional(matchData.odds)}
Forma domacina: ${formatOptional(matchData.formHome)}
Forma gosta: ${formatOptional(matchData.formAway)}
Confidence: ${formatOptional(matchData.confidence)}
Rizik: ${formatOptional(matchData.risk)}
Statistika: ${formatOptional(matchData.stats)}

Sada napisi premium VIP analizu.`;

export async function generateDailyAnalysisText(matchData: MatchData): Promise<string> {
  const fallback = buildFallbackAnalysis(matchData);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(matchData) }] }],
        generationConfig: {
          temperature: 0.72,
          maxOutputTokens: 380,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini generation failed with status ${response.status}.`);
  }

  const result = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const generated = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join(' ')
    .trim();

  if (!generated) {
    throw new Error('Gemini returned empty content.');
  }

  return generated;
}

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

    const matchData = getSafeMatchData(await readBody(request));
    const fallback = buildFallbackAnalysis(matchData);

    if (!canGenerateNow(user.uid)) {
      sendJson(response, 200, { analysis: fallback, source: 'fallback', reason: 'rate_limit' });
      return;
    }

    try {
      const analysis = await generateDailyAnalysisText(matchData);
      sendJson(response, 200, { analysis, source: process.env.GEMINI_API_KEY ? 'gemini' : 'fallback' });
    } catch (generationError) {
      console.error('Gemini daily analysis generation failed:', generationError instanceof Error ? generationError.message : 'Unknown error');
      sendJson(response, 200, { analysis: fallback, source: 'fallback', reason: 'generation_failed' });
    }
  } catch (error) {
    console.error('Daily analysis API handler failed:', error instanceof Error ? error.message : 'Unknown error');
    sendJson(response, 500, { error: 'Generisanje analize trenutno nije dostupno.' });
  }
}
