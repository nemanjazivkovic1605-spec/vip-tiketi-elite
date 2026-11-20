import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createGeminiAnalysisService, classifyGeminiError, buildGeminiPayload, parseGeminiResponse, GeminiAnalysisError } from '../server/ai/geminiAnalysis.ts';
import { getGeminiModels } from '../server/ai/geminiConfig.ts';
import { buildUserPrompt, FREE_SYSTEM_INSTRUCTION, VIP_SYSTEM_INSTRUCTION, STATS_GROUNDING_INSTRUCTION, type AnalysisRequest } from '../server/ai/analysisPrompts.ts';
import { createDailyAnalysisHandler, parseAnalysisRequest } from '../server/ai/dailyAnalysisHandler.ts';

const input: AnalysisRequest = { analysisType: 'FREE', match: 'Test Home - Test Away', prediction: 'Over 2.5', odds: 1.9, confidence: 68, date: '2026-11-20', fixtureId: 'isolated-17', manualRequest: true };
const stats = { provider: 'isolated-test', homeTeam: 'Test Home', awayTeam: 'Test Away', statistics: { matches: 10, goalsFor: 18, goalsAgainst: 12 } };
const analysis = 'Test Home i Test Away posmatramo kroz dostavljeni uzorak od deset utakmica. Za predlog Over 2.5 po kvoti 1.90 relevantni su prikazani golovi, ali istorijski uzorak nije garancija budućeg ishoda. Procenu treba tumačiti u granicama dostupnih podataka.';
const success = (text = analysis) => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });
const fakeEnv = { GEMINI_API_KEY: 'isolated-secret-not-a-real-key' } as NodeJS.ProcessEnv;
const service = (fetcher: typeof fetch, extra: Partial<Parameters<typeof createGeminiAnalysisService>[0]> = {}) =>
  createGeminiAnalysisService({ fetch: fetcher, env: fakeEnv, sleep: async () => {}, log: () => {}, ...extra });

test('central model configuration retains legacy env and caps/validates configurable chains', () => {
  assert.deepEqual(getGeminiModels({}), ['gemini-3-flash-preview', 'gemini-3.5-flash-lite', 'gemma-4-26b-a4b-it']);
  assert.equal(getGeminiModels({ GEMINI_ANALYSIS_MODEL: 'gemini-2.5-flash-lite' })[0], 'gemini-2.5-flash-lite');
  assert.deepEqual(getGeminiModels({ GEMINI_PRIMARY_MODEL: 'gemini-3-flash-preview', GEMINI_FALLBACK_MODELS: '' }), ['gemini-3-flash-preview']);
  assert.throws(() => getGeminiModels({ GEMINI_PRIMARY_MODEL: 'https://attacker.invalid/key' }));
  assert.throws(() => getGeminiModels({ GEMINI_FALLBACK_MODELS: 'gemini-a,gemini-b,gemini-c' }));
});

test('FREE/VIP system instructions and actual enrichedStats reach REST; Gemma 3 has a supported text adapter', () => {
  const free = buildGeminiPayload(input, stats, 'gemini-3-flash-preview');
  const vip = buildGeminiPayload({ ...input, analysisType: 'VIP' }, stats, 'gemini-2.5-flash-lite');
  assert.ok(free.systemInstruction?.parts[0].text.startsWith(FREE_SYSTEM_INSTRUCTION));
  assert.ok(vip.systemInstruction?.parts[0].text.startsWith(VIP_SYSTEM_INSTRUCTION));
  assert.ok(free.systemInstruction?.parts[0].text.includes(STATS_GROUNDING_INSTRUCTION));
  assert.match(free.contents[0].parts[0].text, /"goalsFor":18/);
  assert.match(buildUserPrompt(input, stats), /^Meč: Test Home - Test Away \| Tip: Over 2.5 \| Kvota: 1.90 \| Confidence: 68%/);
  assert.deepEqual(free.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
  assert.deepEqual(vip.generationConfig.thinkingConfig, { thinkingBudget: 0 });
  const gemma = buildGeminiPayload(input, stats, 'gemma-3-27b-it');
  assert.equal(gemma.systemInstruction, undefined);
  assert.ok(gemma.contents[0].parts[0].text.startsWith(FREE_SYSTEM_INSTRUCTION));
  assert.equal(gemma.generationConfig.thinkingConfig, undefined);
  const gemma4 = buildGeminiPayload(input, stats, 'gemma-4-26b-a4b-it');
  assert.ok(gemma4.systemInstruction);
  assert.deepEqual(gemma4.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
  assert.deepEqual(buildGeminiPayload(input, stats, 'gemini-3.5-flash-lite').generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
});

test('parser uses one complete candidate, joins all text fragments, removes Markdown and excludes thoughts', () => {
  const parsed = parseGeminiResponse({ candidates: [
    { finishReason: 'STOP', content: { parts: [{ thought: true, text: 'private reasoning' }, { text: '**' + analysis.slice(0, 83) }, { text: analysis.slice(83) + '**' }] } },
    { finishReason: 'STOP', content: { parts: [{ text: 'alternative text must not be appended' }] } },
  ] }, 'VIP');
  assert.equal(parsed, analysis);
  for (const payload of [null, {}, { candidates: [] }, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: analysis }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'short' }] } }] }, { candidates: [{ finishReason: 'STOP', content: { parts: 'bad' } }] }]) {
    assert.throws(() => parseGeminiResponse(payload, 'FREE'), (e: unknown) => e instanceof GeminiAnalysisError && e.code === 'GEMINI_INVALID_RESPONSE');
  }
  assert.throws(() => parseGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }, 'FREE'), (e: unknown) => e instanceof GeminiAnalysisError && !e.retryable);
});

test('missing input and missing server key fail before sending Google a request; no-data does not invent text', async () => {
  let calls = 0;
  const client = service((async () => { calls++; return success(); }) as typeof fetch, { env: {} });
  for (const item of [{ ...input, match: '' }, { ...input, prediction: '' }, { ...input, odds: 1 }, { ...input, confidence: NaN }]) {
    await assert.rejects(client.generateSportsAnalysis(item, stats), (e: unknown) => e instanceof GeminiAnalysisError && e.status === 400);
  }
  await assert.rejects(client.generateSportsAnalysis(input, stats), (e: unknown) => e instanceof GeminiAnalysisError && e.code === 'GEMINI_NOT_CONFIGURED');
  const result = await client.generateSportsAnalysis(input, null);
  assert.deepEqual(result, { analysis: 'Nema dovoljno relevantnih podataka za kvalitetnu AI analizu.', source: 'fallback', insufficientData: true });
  assert.equal(calls, 0);
});

test('valid model response preserves the API result format and keeps credentials only in the server header', async () => {
  const events: unknown[] = [];
  const client = service((async (url, init) => {
    assert.match(String(url), /models\/gemini-3-flash-preview:generateContent$/);
    assert.equal((init?.headers as Record<string, string>)['x-goog-api-key'], fakeEnv.GEMINI_API_KEY);
    assert.equal(String(init?.body).includes(fakeEnv.GEMINI_API_KEY!), false);
    return success();
  }) as typeof fetch, { log: event => events.push(event) });
  assert.deepEqual(await client.generateSportsAnalysis(input, stats), { analysis, source: 'gemini', model: 'gemini-3-flash-preview' });
  assert.equal(JSON.stringify(events).includes(fakeEnv.GEMINI_API_KEY!), false);
  assert.equal(JSON.stringify(events).includes(input.match), false);
  assert.equal(JSON.stringify(events).includes(analysis), false);
});

for (const status of [429, 500, 503, 404]) {
  test(`model-scoped ${status} switches to Flash-Lite with bounded exponential backoff`, async () => {
    const models: string[] = [], delays: number[] = [];
    const client = service((async url => {
      models.push(String(url).split('/models/')[1].split(':')[0]);
      return models.length === 1 ? Response.json({ error: { status: status === 429 ? 'RESOURCE_EXHAUSTED' : 'UNAVAILABLE' } }, { status }) : success();
    }) as typeof fetch, { sleep: async ms => { delays.push(ms); } });
    const result = await client.generateSportsAnalysis(input, stats);
    assert.equal(result.model, 'gemini-3.5-flash-lite');
    assert.deepEqual(models, ['gemini-3-flash-preview', 'gemini-3.5-flash-lite']);
    assert.deepEqual(delays, [250]);
  });
}

test('invalid key, denied access and global project quota stop immediately instead of trying every model', async () => {
  for (const [status, payload, code] of [
    [400, { error: { details: [{ reason: 'API_KEY_INVALID' }] } }, 'GEMINI_INVALID_KEY'],
    [403, { error: { status: 'PERMISSION_DENIED' } }, 'GEMINI_ACCESS_DENIED'],
    [429, { error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProject', quotaDimensions: { location: 'global' } }] }] } }, 'GEMINI_PROJECT_QUOTA'],
  ] as const) {
    let calls = 0;
    const client = service((async () => { calls++; return Response.json(payload, { status }); }) as typeof fetch);
    await assert.rejects(client.generateSportsAnalysis(input, stats), (e: unknown) => e instanceof GeminiAnalysisError && e.code === code);
    assert.equal(calls, 1);
  }
  const quota = classifyGeminiError(429, { error: { details: [{ violations: [{ quotaId: 'RequestsPerDayPerProjectPerModel', quotaDimensions: { model: 'gemini-3-flash-preview' } }] }] } });
  assert.equal(quota.retryable, true);
  assert.equal(classifyGeminiError(503, { error: { details: 'malformed' } } as any).retryable, true);
  assert.equal(classifyGeminiError(429, { error: { details: [{ violations: [null] }] } } as any).retryable, true);
});

test('truncated output retries once with more output tokens; invalid JSON and unavailable models stay bounded', async () => {
  const configs: any[] = [];
  const client = service((async (_url, init) => {
    configs.push(JSON.parse(String(init?.body)).generationConfig);
    return configs.length === 1 ? Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'unfinished' }] } }] }) : success();
  }) as typeof fetch);
  assert.equal((await client.generateSportsAnalysis(input, stats)).source, 'gemini');
  assert.equal(configs.length, 2);
  assert.equal(configs[1].maxOutputTokens, configs[0].maxOutputTokens * 2);
  for (const invalid of [() => new Response('<html>bad gateway</html>'), () => Response.json({ candidates: [] }), () => Response.json({ error: {} }, { status: 503 })]) {
    let calls = 0;
    const failed = service((async () => { calls++; return invalid(); }) as typeof fetch);
    await assert.rejects(failed.generateSportsAnalysis(input, stats), GeminiAnalysisError);
    assert.ok(calls <= 4 && calls >= 3);
  }
});

test('request timeout and overall budget terminate work instead of infinite loading or retries', async () => {
  let calls = 0;
  const client = service((async (_url, init) => {
    calls++;
    return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')), { once: true }));
  }) as typeof fetch, { requestTimeoutMs: 10, budgetMs: 25 });
  await assert.rejects(client.generateSportsAnalysis(input, stats), (e: unknown) => e instanceof GeminiAnalysisError && e.code === 'GEMINI_TIMEOUT');
  assert.ok(calls <= 3);
});

test('cache/dedup separate FREE, VIP, fixture dates and changed statistics; regenerate remains explicit', async () => {
  let calls = 0, now = 1000;
  const client = service((async () => { calls++; return success(); }) as typeof fetch, { now: () => now });
  const simultaneous = await Promise.all([client.generateProtectedSportsAnalysis(input, stats), client.generateProtectedSportsAnalysis(input, stats)]);
  assert.equal(calls, 1);
  assert.equal(simultaneous[1].aiCacheHit, true);
  assert.equal((await client.generateProtectedSportsAnalysis(input, stats)).aiCacheHit, true);
  await client.generateProtectedSportsAnalysis({ ...input, analysisType: 'VIP' }, stats);
  await client.generateProtectedSportsAnalysis({ ...input, date: '2026-11-21' }, stats);
  await client.generateProtectedSportsAnalysis(input, { ...stats, statistics: { matches: 11 } });
  await client.generateProtectedSportsAnalysis({ ...input, forceRegenerate: true }, stats);
  assert.equal(calls, 5);
  now += 21 * 60_000;
  assert.equal((await client.generateProtectedSportsAnalysis(input, stats)).aiCacheHit, false);
  assert.equal(calls, 6);
});

test('failed generations are not cached and a later manual attempt can succeed', async () => {
  let fail = true, calls = 0;
  const client = service((async () => { calls++; return fail ? Response.json({ error: { status: 'PERMISSION_DENIED' } }, { status: 403 }) : success(); }) as typeof fetch);
  await assert.rejects(client.generateProtectedSportsAnalysis(input, stats));
  fail = false;
  assert.equal((await client.generateProtectedSportsAnalysis(input, stats)).source, 'gemini');
  assert.equal(calls, 2);
});

const callApi = async (handler: ReturnType<typeof createDailyAnalysisHandler>, body: unknown, method = 'POST') => {
  const response = { statusCode: 200, headers: {} as Record<string, string>, body: '',
    setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value; }, end(value: string) { this.body = value; } };
  await handler(Object.assign(Readable.from([]), { method, body, headers: {} }) as any, response as any);
  return { ...response, json: JSON.parse(response.body) };
};
const dependencies = () => ({
  verifyFirebaseUser: async () => ({ uid: 'test-admin', email: 'admin@example.invalid', emailVerified: true }),
  getConfiguredSportsProviderIds: () => ['isolated-test'],
  getEnrichedMatchStats: async () => ({ stats, fromCache: true, attemptedProviders: ['isolated-test'] }),
  generateProtectedSportsAnalysis: async () => ({ analysis, source: 'gemini' as const, model: 'gemini-3-flash-preview', aiCacheHit: false }),
});

test('AI API stays admin-only/manual-only and validates input before enrichment or generation', async () => {
  let generated = 0;
  const deps = dependencies();
  deps.generateProtectedSportsAnalysis = async () => { generated++; throw new Error('must not generate'); };
  const handler = createDailyAnalysisHandler(deps);
  assert.equal((await callApi(handler, input, 'GET')).statusCode, 405);
  assert.equal((await callApi(createDailyAnalysisHandler({ ...deps, verifyFirebaseUser: async () => null }), input)).statusCode, 403);
  assert.equal((await callApi(handler, { ...input, manualRequest: false })).statusCode, 400);
  for (const field of ['match', 'prediction', 'odds', 'confidence']) {
    assert.equal((await callApi(handler, { ...input, [field]: undefined })).statusCode, 400);
  }
  assert.equal(parseAnalysisRequest({ ...input, confidence: null }), null);
  assert.equal(generated, 0);
});

test('AI API forwards enrichedStats, preserves result fields and returns the existing cooldown message', async () => {
  const deps = dependencies();
  let seen: unknown[] = [];
  const handler = createDailyAnalysisHandler({ ...deps, generateProtectedSportsAnalysis: async (item, enriched) => { seen = [item, enriched]; return deps.generateProtectedSportsAnalysis(); } });
  const result = await callApi(handler, input);
  assert.equal(result.statusCode, 200);
  assert.equal(result.json.enrichedStatsFound, true);
  assert.equal(result.json.enrichmentCacheHit, true);
  assert.equal(result.json.statsProvider, 'isolated-test');
  assert.equal(result.json.model, 'gemini-3-flash-preview');
  assert.deepEqual(seen[1], stats);
  const repeated = await callApi(handler, input);
  assert.equal(repeated.statusCode, 429);
  assert.match(repeated.json.error, /Sačekaj nekoliko sekundi/);
  assert.equal(repeated.headers['cache-control'], 'no-store');
});

test('AI API returns clear typed failures, never provider secrets or fake success text', async () => {
  const handler = createDailyAnalysisHandler({ ...dependencies(), generateProtectedSportsAnalysis: async () => {
    throw new GeminiAnalysisError('Gemini kvota projekta je iscrpljena.', 429, 'GEMINI_PROJECT_QUOTA', false, 60_000);
  } });
  const response = await callApi(handler, input);
  assert.equal(response.statusCode, 429);
  assert.equal(response.json.code, 'GEMINI_PROJECT_QUOTA');
  assert.equal(response.headers['retry-after'], '60');
  assert.equal(response.json.analysis, undefined);
});

test('the seven-second cooldown survives a minute-rate-window reset', async () => {
  let now = 1_000_000;
  const handler = createDailyAnalysisHandler(dependencies(), () => now);
  assert.equal((await callApi(handler, input)).statusCode, 200);
  now += 59_000;
  assert.equal((await callApi(handler, input)).statusCode, 200);
  now += 2000;
  assert.equal((await callApi(handler, input)).statusCode, 429);
});
