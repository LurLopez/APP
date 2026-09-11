import { AsyncLocalStorage } from 'node:async_hooks';
import { mockProvider } from './providers/mock.provider.js';
import { deepseekProvider } from './providers/deepseek.provider.js';
import { opencodeGoProvider } from './providers/opencode-go.provider.js';
import { localProvider } from './providers/local.provider.js';

// Contexto por análisis: cada análisis usa su propia sesión de IA (no una global),
// de modo que varias personas puedan analizar informes a la vez sin interferirse.
export const aiContext = new AsyncLocalStorage();

const registry = {
  mock: mockProvider,
  deepseek: deepseekProvider,
  opencode: opencodeGoProvider,
  'opencode-go': opencodeGoProvider,
  local: localProvider,
  ollama: localProvider,
};

export function getProvider(name) {
  const active = String(name || process.env.AI_PROVIDER || 'deepseek').trim().toLowerCase();
  const provider = registry[active];
  if (!provider) {
    throw new Error(`Proveedor de IA no registrado: ${active}`);
  }
  return provider;
}

export function chat(messages, options = {}) {
  const provider = options?.provider ? getProvider(options.provider) : getProvider();
  const sessionId = options?.sessionId || aiContext.getStore()?.sessionId || null;
  return provider.chat(messages, sessionId ? { ...options, sessionId } : options);
}

function cleanJsonText(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const target = match ? match[1].trim() : trimmed;

  // Si la respuesta incluye texto previo o posterior fuera del JSON, extraer entre { y } o [ y ]
  const firstBrace = target.indexOf('{');
  const lastBrace = target.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return target.slice(firstBrace, lastBrace + 1).trim();
  }
  const firstBracket = target.indexOf('[');
  const lastBracket = target.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return target.slice(firstBracket, lastBracket + 1).trim();
  }
  return target;
}

const MAX_ATTEMPTS = 2;

export async function chatJson(messages, attempts = MAX_ATTEMPTS, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const raw = await chat(messages, options);
      const cleaned = cleanJsonText(raw);
      return JSON.parse(cleaned);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('El modelo no devolvió una respuesta JSON válida.');
}
