const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.AI_MODEL || 'deepseek-chat';

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

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 400,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`DeepSeek API error ${response.status}: ${detail.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('DeepSeek no devolvió contenido válido.');
    }
    return cleanResponse(content);
  },
};
