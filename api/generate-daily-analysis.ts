import type { IncomingMessage, ServerResponse } from 'node:http';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

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

// gemini-1.5-flash is no longer exposed by the current Gemini API (404).
const MODEL = 'gemini-2.5-flash';
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const MIN_ANALYSIS_LENGTH = 400;
const TRUSTED_ADMIN_EMAILS = new Set(['nemanjazivkovic1605@gmail.com']);
const requestCounts = new Map<string, RateEntry>();

const MASTER_PROMPT = `Ti si elitni evropski sportski tipster sa iskustvom u premium fudbalskim analizama.

Napiši analizu u srpskom jeziku koja zvuči kao da ju je napisao iskusan tipster, ne AI asistent. Ton treba da bude moderan, agresivan, prirodan i direktan. Analiza treba da bude fokusirana na konkretan matchup i da koristi fudbalski rečnik, bez opštih fraza i bez AI safe disklamera.

Ne koristi:
- nijedan ishod nije garantovan
- odgovorno upravljanje ulogom
- razuman izbor
- u okviru dostupnih informacija
- sportski događaji su nepredvidljivi
- predstavlja value
- profil meča
- disciplinovana procena

Nema markdowna, nema bullet lista, nema navodnika. Napiši 3 do 5 punih rečenica sa 400 do 900 karaktera. Direktno pominjaj timove više puta i koristi sportsku logiku za tempo, stil igre, matchup, prostor za golove, tranziciju, ranjive odbrane, momentum, intenzitet i način otvaranja tipa.

Za GG / BTTS fokusiraj na otvoren meč, obe ekipe napadački opasne su, prostor iza odbrane, ritam, tranziciju i zašto rani gol otvara utakmicu.
Za OVER fokusiraj na tempo, efikasnost, agresivan ritam, matchup koji vodi ka šansama i potencijal otvorenog meča posle prvog gola.
Za UNDER fokusiraj na disciplinu, sporiji ritam, tvrđi matchup i manje prostora.
Za 1 ili 2 fokusiraj na kvalitet, momentum, domaći teren, formu i matchup prednost.
Za 1X / X2 fokusiraj na stabilnost, kontrolu i zašto je favorit još uvek pod pritiskom.
Za NG fokusiraj na slab napad jednog tima, defanzivnu stabilnost drugog i kontrolu ritma.

Obavezno koristi imena timova i naziv lige prirodno i više puta. Tekst treba da zvuči kao pravi evropski VIP tipster.`;

const normalizeText = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const formatOptional = (value: unknown) =>
  value === null || value === undefined || value === '' ? 'Nedovoljno podataka' : String(value);

const cleanGeneratedText = (value: string) =>
  value
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

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

  return `${homeTeam} i ${awayTeam} ulaze u duel u okviru ${league}, gde predlog ${prediction}${oddsText} predstavlja razuman izbor u odnosu na profil ovog meca. Kod ovog marketa presudni su ritam igre, sposobnost ekipa da nametnu svoj plan i situacije u kojima izabrani tip dobija konkretnu vrednost. ${homeTeam} i ${awayTeam} zato zahtevaju disciplinovanu procenu, bez oslanjanja na reputaciju ili kratkorocni utisak. Predlog ${prediction} ima smisla u okviru dostupnih informacija, uz odgovorno upravljanje ulogom i svest da nijedan sportski ishod nije garantovan.`;
};

const buildPrompt = (matchData: MatchData, retry = false) => `${MASTER_PROMPT}

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

Sada napisi premium VIP analizu.${retry ? '\n\nPrethodni odgovor je bio previše generički i slabog tipsterskog tona. Napiši ponovo snažno i direktno, sa najmanje 400 karaktera i 3 do 5 punih, prirodnih rečenica koje zvuče kao pravi evropski VIP tipster.' : ''}`;

const requestGeminiAnalysis = async (apiKey: string, matchData: MatchData, retry = false) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(matchData, retry) }] }],
        generationConfig: {
          temperature: retry ? 0.62 : 0.72,
          maxOutputTokens: 700,
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

  return (result.candidates || [])
    .map((candidate) => cleanGeneratedText(candidate.content?.parts
      ?.map((part) => part.text || '')
      .join(' ') || ''))
    .sort((a, b) => b.length - a.length)[0] || '';
};

const isAnalysisTooGeneric = (value: string) => {
  const genericPhrases = [
    /nijedan ishod nije garantovan/i,
    /odgovorno upravljanje ulogom/i,
    /razuman izbor/i,
    /u okviru dostupnih informacija/i,
    /sportski događaji su nepredvidivi/i,
    /predstavlja value/i,
    /profil meča/i,
    /disciplinovana procena/i,
    /value/i,
  ];

  if (value.length < MIN_ANALYSIS_LENGTH) return true;
  return genericPhrases.some((phrase) => phrase.test(value));
};

export async function generateDailyAnalysisText(matchData: MatchData): Promise<string> {
  const fallback = buildFallbackAnalysis(matchData);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  const firstResult = await requestGeminiAnalysis(apiKey, matchData);
  if (!isAnalysisTooGeneric(firstResult)) return firstResult;

  const secondResult = await requestGeminiAnalysis(apiKey, matchData, true);
  if (!isAnalysisTooGeneric(secondResult)) return secondResult;

  const thirdResult = await requestGeminiAnalysis(apiKey, matchData, true);
  return !isAnalysisTooGeneric(thirdResult) ? thirdResult : fallback;
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
      const source = process.env.GEMINI_API_KEY && analysis !== fallback ? 'gemini' : 'fallback';
      sendJson(response, 200, { analysis, source });
    } catch (generationError) {
      console.error('Gemini daily analysis generation failed:', generationError instanceof Error ? generationError.message : 'Unknown error');
      sendJson(response, 200, { analysis: fallback, source: 'fallback', reason: 'generation_failed' });
    }
  } catch (error) {
    console.error('Daily analysis API handler failed:', error instanceof Error ? error.message : 'Unknown error');
    sendJson(response, 500, { error: 'Generisanje analize trenutno nije dostupno.' });
  }
}
