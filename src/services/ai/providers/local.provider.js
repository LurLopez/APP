const DEFAULT_URL = 'http://localhost:11434/v1/chat/completions';
const DEFAULT_MODEL = 'hf.co/empero-ai/Qwen3.8-9B-GGUF:Q4_K_M';

function getEndpoint() {
  const raw = process.env.LOCAL_AI_URL || process.env.OLLAMA_URL || DEFAULT_URL;
  const trimmed = String(raw).trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions') || trimmed.endsWith('/api/chat')) {
    return trimmed;
  }
  return `${trimmed}/v1/chat/completions`;
}

function getModel() {
  return (process.env.LOCAL_AI_MODEL || process.env.OLLAMA_MODEL || DEFAULT_MODEL).trim();
}

function cleanResponse(raw) {
  let trimmed = String(raw ?? '').trim();
  // Eliminar etiquetas de razonamiento como <think>...</think> si el modelo las incluye en content
  trimmed = trimmed.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : trimmed;
}

export const localProvider = {
  name: 'local',

  async chat(messages) {
    const endpoint = getEndpoint();
    const model = getModel();
    const apiKey = process.env.LOCAL_AI_API_KEY || 'local';
    const timeoutMs = Number(
      process.env.LOCAL_AI_REQUEST_TIMEOUT_MS || process.env.AI_REQUEST_TIMEOUT_MS || 300000
    );

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: Number(process.env.AI_MAX_TOKENS || 16000),
          temperature: 0,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (
        error.cause?.code === 'ECONNREFUSED' ||
        error.code === 'ECONNREFUSED' ||
        /ECONNREFUSED/i.test(error.message)
      ) {
        throw new Error(
          `No se pudo conectar con el modelo local en ${endpoint}. Asegúrate de que el servidor local (ej. Ollama en http://localhost:11434) esté iniciado.`
        );
      }
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error(`El modelo local tardó más de ${timeoutMs / 1000} s en responder.`);
      }
      throw error;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Error en el modelo local (${response.status}): ${detail.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('El modelo local no devolvió contenido válido.');
    }

    const cleaned = cleanResponse(content);
    if (!cleaned.trim()) {
      throw new Error('El modelo local devolvió una respuesta vacía.');
    }

    return { content: cleaned, model, usage: data?.usage ?? null };
  },
};
