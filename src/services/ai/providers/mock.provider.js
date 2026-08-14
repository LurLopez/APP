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
  defensive: [
    /beverages?/i,
    /beer|brewing|brewery|alcoholic drinks?|spirits|wine/i,
    /(packaged\s+)?foods?|snacks?|cereal|confectionery|chocolate/i,
    /tobacco|cigarettes?/i,
    /household (products|care)/i,
    /personal care/i,
    /consumer staples/i,
    /grocery|supermarket|hypermarket/i,
    /(soft|carbonated)\s+drinks?|cola/i,
  ],
  notDefensive: [
    /software|technology company/i,
    /semiconductor|chips?/i,
    /telecommunications|telecom/i,
    /automotive|automobiles?|vehicles?/i,
    /apparel|fashion|luxury goods/i,
    /fast food|restaurant chain/i,
    /airlines?|aviation/i,
    /bank|banking|insurance|financial services/i,
    /pharmaceutical|biotech|biotechnology/i,
    /oil\s+and\s+gas|petroleum|energy company/i,
  ],
};

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => (pattern.test(text) ? count + 1 : count), 0);
}

function hasMatch(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function classifyOrigin(text) {
  const isFinancial = countMatches(text, PATTERNS.financial) >= 2;
  const isUsa = countMatches(text, PATTERNS.usa) >= 1;
  const formType = PATTERNS.form10q.test(text)
    ? '10-Q'
    : PATTERNS.form10k.test(text)
      ? '10-K'
      : null;

  return JSON.stringify({ isFinancial, isUsa, formType });
}

function classifySector(text) {
  const isDefensiveConsumer = hasMatch(text, PATTERNS.defensive) && !hasMatch(text, PATTERNS.notDefensive);
  return JSON.stringify({ isDefensiveConsumer });
}

export const mockProvider = {
  name: 'mock',

  async chat(messages) {
    const systemPrompt = messages.find((m) => m.role === 'system')?.content ?? '';
    const text = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content ?? '')
      .join('\n');

    if (systemPrompt.includes('isDefensiveConsumer')) {
      return classifySector(text);
    }
    return classifyOrigin(text);
  },
};
