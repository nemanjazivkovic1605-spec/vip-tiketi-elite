export const DEFAULT_GEMINI_PRIMARY_MODEL = 'gemini-3-flash-preview';
// Google free-tier pricing and hosted Gemma models checked on 2026-11-20.
// 2.5 Flash-Lite lists successfully but rejects this project's generation calls (404/new users).
export const DEFAULT_GEMINI_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemma-4-26b-a4b-it'];
export const GEMINI_MAX_ATTEMPTS = 4;
export const GEMINI_REQUEST_TIMEOUT_MS = 14_000;
export const GEMINI_GENERATION_BUDGET_MS = 34_000;

export function getGeminiModels(env: NodeJS.ProcessEnv = process.env): string[] {
  const primary = env.GEMINI_PRIMARY_MODEL?.trim() || env.GEMINI_ANALYSIS_MODEL?.trim() || DEFAULT_GEMINI_PRIMARY_MODEL;
  const fallbacks = env.GEMINI_FALLBACK_MODELS === undefined
    ? DEFAULT_GEMINI_FALLBACK_MODELS
    : env.GEMINI_FALLBACK_MODELS.split(',').map(value => value.trim()).filter(Boolean);
  const models = Array.from(new Set([primary, ...fallbacks]));
  if (models.length > 3 || models.some(model => !/^(?:gemini|gemma)-[a-zA-Z0-9._-]{1,80}$/.test(model))) {
    throw new Error('Podesite najviše tri ispravna Gemini/Gemma modela.');
  }
  return models;
}

export function modelGenerationConfig(model: string) {
  if (/^gemma-4-/.test(model)) return { thinkingConfig: { thinkingLevel: 'minimal' } };
  if (model === 'gemini-2.5-flash-lite') return { thinkingConfig: { thinkingBudget: 0 } };
  if (/^gemini-3(?:\.|-).*flash/.test(model)) {
    return { thinkingConfig: { thinkingLevel: /^gemini-3\.8/.test(model) ? 'low' : 'minimal' } };
  }
  return {};
}

export const needsGemmaPromptAdapter = (model: string) => /^gemma-3(?:-|n-)/.test(model);
