import { aiContext } from './context.js';

// Precios de DeepSeek en USD por millón de tokens (docs oficiales). El precio
// off-peak es la mitad del peak; el peak es de 01:00-04:00 y 06:00-10:00 UTC
// de lunes a viernes.
const DEEPSEEK_PRICING = {
  'deepseek-flash': {
    cacheHit: { peak: 0.006, offPeak: 0.003 },
    cacheMiss: { peak: 0.3, offPeak: 0.15 },
    output: { peak: 1.2, offPeak: 0.6 },
  },
  'deepseek-v4-pro': {
    cacheHit: { peak: 0.044, offPeak: 0.022 },
    cacheMiss: { peak: 1.32, offPeak: 0.66 },
    output: { peak: 3.96, offPeak: 1.98 },
  },
};

// Alias antiguos: la API los redirige a los modelos actuales.
const DEEPSEEK_ALIASES = {
  'deepseek-chat': 'deepseek-flash',
  'deepseek-reasoner': 'deepseek-flash',
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
};

export function isDeepseekPeak(date = new Date()) {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = date.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

export function estimateDeepseekCostUsd(model, usage, date = new Date()) {
  if (!usage) return null;
  const resolved = DEEPSEEK_ALIASES[model] ?? model;
  const pricing = DEEPSEEK_PRICING[resolved];
  if (!pricing) return null;

  const period = isDeepseekPeak(date) ? 'peak' : 'offPeak';
  const promptTokens = Number(usage.prompt_tokens ?? 0);
  const cacheHit = Number(usage.prompt_cache_hit_tokens ?? 0);
  const cacheMiss = Number(usage.prompt_cache_miss_tokens ?? Math.max(promptTokens - cacheHit, 0));
  const output = Number(usage.completion_tokens ?? 0);

  return (
    (cacheHit / 1e6) * pricing.cacheHit[period] +
    (cacheMiss / 1e6) * pricing.cacheMiss[period] +
    (output / 1e6) * pricing.output[period]
  );
}

function emptyUsage() {
  return {
    llamadas: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    totalTokens: 0,
    costeUsd: 0,
    costeConocido: true,
    proveedores: [],
    modelos: [],
  };
}

// Registra el consumo de una llamada al modelo dentro del análisis en curso.
// Lo llaman los proveedores a través de modelProvider.chat.
export function recordAiCall({ provider = null, model = null, usage = null, cost = null } = {}) {
  const store = aiContext.getStore();
  if (!store) return;
  if (!store.usage) store.usage = emptyUsage();
  const totals = store.usage;

  totals.llamadas += 1;
  if (provider && !totals.proveedores.includes(provider)) totals.proveedores.push(provider);
  if (model && !totals.modelos.includes(model)) totals.modelos.push(model);

  const prompt = Number(usage?.prompt_tokens ?? 0);
  const completion = Number(usage?.completion_tokens ?? 0);
  const cacheHit = Number(usage?.prompt_cache_hit_tokens ?? 0);
  const cacheMiss = Number(usage?.prompt_cache_miss_tokens ?? Math.max(prompt - cacheHit, 0));

  totals.promptTokens += prompt;
  totals.completionTokens += completion;
  totals.reasoningTokens += Number(usage?.completion_tokens_details?.reasoning_tokens ?? 0);
  totals.cacheHitTokens += cacheHit;
  totals.cacheMissTokens += cacheMiss;
  totals.totalTokens += Number(usage?.total_tokens ?? prompt + completion);

  const numericCost = Number(cost);
  if (cost !== null && cost !== undefined && Number.isFinite(numericCost)) {
    totals.costeUsd += numericCost;
  } else if (provider === 'deepseek') {
    const estimated = estimateDeepseekCostUsd(model, usage);
    if (estimated === null) totals.costeConocido = false;
    else totals.costeUsd += estimated;
  }
}

export function getSessionUsage() {
  const store = aiContext.getStore();
  return store?.usage ? { ...store.usage } : emptyUsage();
}
