import { mockProvider } from './providers/mock.provider.js';
import { deepseekProvider } from './providers/deepseek.provider.js';
import { opencodeGoProvider } from './providers/opencode-go.provider.js';

const registry = {
  mock: mockProvider,
  deepseek: deepseekProvider,
  opencode: opencodeGoProvider,
  'opencode-go': opencodeGoProvider,
};

function resolveActiveProvider() {
  return process.env.AI_PROVIDER || 'deepseek';
}

const activeProvider = resolveActiveProvider();

export function getProvider() {
  const provider = registry[activeProvider];
  if (!provider) {
    throw new Error(`Proveedor de IA no registrado: ${activeProvider}`);
  }
  return provider;
}

export function chat(messages) {
  return getProvider().chat(messages);
}

const MAX_ATTEMPTS = 2;

export async function chatJson(messages, attempts = MAX_ATTEMPTS) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const raw = await chat(messages);
      return JSON.parse(raw);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('El modelo no devolvió una respuesta JSON válida.');
}
