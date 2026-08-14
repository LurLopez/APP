import { mockProvider } from './providers/mock.provider.js';
import { deepseekProvider } from './providers/deepseek.provider.js';

const registry = {
  mock: mockProvider,
  deepseek: deepseekProvider,
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
