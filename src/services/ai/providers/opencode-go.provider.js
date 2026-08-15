const API_URL = 'https://opencode.ai/zen/go/v1/chat/completions';
const MODEL = process.env.OPENCODE_GO_MODEL || 'deepseek-v4-flash';
const REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 180000);

function cleanResponse(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : trimmed;
}

export const opencodeGoProvider = {
  name: 'opencode-go',

  async chat(messages) {
    const apiKey = process.env.OPENCODE_GO_API_KEY;
    if (!apiKey) {
      throw new Error('Falta OPENCODE_GO_API_KEY en el archivo .env');
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
      throw new Error(`OpenCode Go API error ${response.status}: ${detail.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('OpenCode Go no devolvió contenido válido.');
    }
    const cleaned = cleanResponse(content);
    if (!cleaned.trim()) {
      throw new Error('OpenCode Go devolvió una respuesta vacía.');
    }
    return cleaned;
  },
};
