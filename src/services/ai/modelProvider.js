import { mockProvider } from './providers/mock.provider.js';
import { deepseekProvider } from './providers/deepseek.provider.js';
import { opencodeGoProvider } from './providers/opencode-go.provider.js';
import { localProvider } from './providers/local.provider.js';
import { aiContext } from './context.js';
import { recordAiCall } from './usageTracker.js';

// Contexto por análisis: cada análisis usa su propia sesión de IA (no una global),
// de modo que varias personas puedan analizar informes a la vez sin interferirse.
export { aiContext };

/**
 * Error de proveedor de IA con mensaje orientado al usuario. Se propaga hasta la
 * capa de API con su código y estado HTTP para dar respuestas claras (503 IA no
 * disponible, 429 saturada, 504 timeout, 500 por configuración del servidor).
 */
export class AiProviderError extends Error {
  constructor(message, { code = 'AI_UNAVAILABLE', status = 503, detail = null } = {}) {
    super(message);
    this.name = 'AiProviderError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

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

export async function chat(messages, options = {}) {
  const provider = options?.provider ? getProvider(options.provider) : getProvider();
  const sessionId = options?.sessionId || aiContext.getStore()?.sessionId || null;
  const response = await provider.chat(messages, sessionId ? { ...options, sessionId } : options);

  // Los proveedores devuelven { content, model, usage, cost }; se admite también
  // el formato antiguo (string) por compatibilidad.
  const normalized = typeof response === 'string' ? { content: response } : (response ?? {});
  recordAiCall({
    provider: provider.name,
    model: normalized.model ?? null,
    usage: normalized.usage ?? null,
    cost: normalized.cost ?? null,
  });
  return normalized.content;
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
      const parsed = JSON.parse(cleaned);
      // Los agentes esperan siempre un objeto; un JSON null/array/no-objeto no es válido.
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('La respuesta del modelo no es un objeto JSON.');
      }
      return parsed;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('El modelo no devolvió una respuesta JSON válida.');
}
