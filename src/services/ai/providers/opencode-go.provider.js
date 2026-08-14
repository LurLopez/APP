const API_URL = 'https://opencode.ai/zen/go/v1/chat/completions';
const MODEL = process.env.OPENCODE_GO_MODEL || 'deepseek-v4-flash';

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

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: Number(process.env.AI_MAX_TOKENS || 8000),
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OpenCode Go API error ${response.status}: ${detail.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('OpenCode Go no devolvió contenido válido.');
    }
    return cleanResponse(content);
  },
};
