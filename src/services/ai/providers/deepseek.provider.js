const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.AI_MODEL || 'deepseek-chat';
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
      throw new Error('Falta DEEPSEEK_API_KEY en el archivo .env');
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
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error(`La API de IA tardó más de ${REQUEST_TIMEOUT_MS / 1000} s en responder.`);
      }
      throw error;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`DeepSeek API error ${response.status}: ${detail.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('DeepSeek no devolvió contenido válido.');
    }
    const cleaned = cleanResponse(content);
    if (!cleaned.trim()) {
      throw new Error('DeepSeek devolvió una respuesta vacía.');
    }
    return cleaned;
  },
};
