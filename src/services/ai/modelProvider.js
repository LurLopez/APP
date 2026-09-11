import { mockProvider } from './providers/mock.provider.js';
import { deepseekProvider } from './providers/deepseek.provider.js';
import { opencodeGoProvider } from './providers/opencode-go.provider.js';
import { localProvider } from './providers/local.provider.js';

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
  return provider.chat(messages, options);
}

const MAX_ATTEMPTS = 2;

export async function chatJson(messages, attempts = MAX_ATTEMPTS, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const raw = await chat(messages, options);
      return JSON.parse(raw);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('El modelo no devolvió una respuesta JSON válida.');
}
