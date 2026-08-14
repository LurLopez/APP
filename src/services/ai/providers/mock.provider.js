const PATTERNS = {
  usa: [
    /securities and exchange commission/i,
    /washington,?\s*d\.?\s*c\.?/i,
    /exchange act of 1934/i,
    /united states\s+(of america|securities)/i,
  ],
  form10q: /form\s*10-?q\b/i,
  form10k: /form\s*10-?k\b/i,
  financial: [
    /consolidated balance sheets?/i,
    /consolidated statements? of (income|operations|earnings)/i,
    /consolidated statements? of cash flows?/i,
    /balance sheets?/i,
    /statements? of income/i,
    /statements? of cash flows?/i,
    /total (assets|liabilities|revenues|net income)/i,
  ],
};

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => (pattern.test(text) ? count + 1 : count), 0);
}

export const mockProvider = {
  name: 'mock',

  async chat(messages) {
    const text = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content ?? '')
      .join('\n');
    const isFinancial = countMatches(text, PATTERNS.financial) >= 2;
    const isUsa = countMatches(text, PATTERNS.usa) >= 1;
    const formType = PATTERNS.form10q.test(text)
      ? '10-Q'
      : PATTERNS.form10k.test(text)
        ? '10-K'
        : null;

    return JSON.stringify({ isFinancial, isUsa, formType });
  },
};
