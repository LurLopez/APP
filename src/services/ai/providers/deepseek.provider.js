import { AiProviderError } from '../modelProvider.js';

const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.AI_MODEL || 'deepseek-flash';
const THINKING = (process.env.AI_THINKING || 'disabled').trim().toLowerCase() === 'enabled' ? 'enabled' : 'disabled';
const REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 180000);

function cleanResponse(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : trimmed;
}

export const deepseekProvider = {
  name: 'deepseek',

  async chat(messages) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new AiProviderError(
        'El servicio de análisis no está configurado correctamente (falta la clave del proveedor de IA). Contacta con el administrador.',
        { code: 'AI_CONFIG_ERROR', status: 500 },
      );
    }

    let response;
    try {
      response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          max_tokens: Number(process.env.AI_MAX_TOKENS || 16000),
          temperature: 0,
          thinking: { type: THINKING },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new AiProviderError(
          'El modelo de IA está tardando demasiado en responder. Inténtalo de nuevo en unos minutos.',
          { code: 'AI_TIMEOUT', status: 504 },
        );
      }
      throw new AiProviderError(
        'El servicio de IA no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
        { code: 'AI_UNAVAILABLE', status: 503, detail: error.message },
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const detailSnippet = detail.slice(0, 300);
      if (response.status === 429) {
        throw new AiProviderError(
          'El servicio de IA está saturado en este momento. Inténtalo de nuevo en unos minutos.',
          { code: 'AI_RATE_LIMIT', status: 503, detail: detailSnippet },
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new AiProviderError(
          'El servicio de análisis no está configurado correctamente (clave del proveedor de IA rechazada). Contacta con el administrador.',
          { code: 'AI_CONFIG_ERROR', status: 500, detail: detailSnippet },
        );
      }
      throw new AiProviderError(
        'El servicio de IA no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
        { code: 'AI_UNAVAILABLE', status: 503, detail: `DeepSeek API error ${response.status}: ${detailSnippet}` },
      );
    }

    const data = await response.json().catch(() => null);
    if (!data) {
      throw new AiProviderError(
        'El servicio de IA devolvió una respuesta no válida. Inténtalo de nuevo.',
        { code: 'AI_BAD_RESPONSE', status: 502 },
      );
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new AiProviderError(
        'El servicio de IA devolvió una respuesta no válida. Inténtalo de nuevo.',
        { code: 'AI_BAD_RESPONSE', status: 502 },
      );
    }
    const cleaned = cleanResponse(content);
    if (!cleaned.trim()) {
      throw new AiProviderError(
        'El servicio de IA devolvió una respuesta vacía. Inténtalo de nuevo.',
        { code: 'AI_EMPTY_RESPONSE', status: 502 },
      );
    }
    return { content: cleaned, model: MODEL, usage: data?.usage ?? null };
  },
};
