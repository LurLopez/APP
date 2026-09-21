/**
 * @fileoverview Módulo extraído de outlookHelpers.js.
 */

export function completeOutlookPriorColumn(snippet, extractionOutlook) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return snippet;
  const headers = Array.isArray(snippet.headers) ? snippet.headers : [];
  if (headers.length !== 4) return snippet;
  const priorIdx = 1;

  const fmtMoneyCell = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return null;
    return `$${(Math.round(num * 10) / 10).toLocaleString('en-US')}M`;
  };
  const fmtDecimalCell = (value, digits = 2) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return null;
    return `$${num.toFixed(digits)}`;
  };
  const fmtPercentCell = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return null;
    return `${String(num).replace('.', ',')}%`;
  };

  const out = extractionOutlook ?? {};
  const rules = [
    { re: /free cash flow conversion|conversi[oó]n/i, value: out.priorYearFcfConversion, fmt: fmtPercentCell },
    { re: /free cash flow|fcf/i, value: out.priorYearFcf, fmt: fmtMoneyCell },
    { re: /operating margin|margen/i, value: out.priorYearOperatingMargin, fmt: fmtPercentCell },
    { re: /net sales|ventas|revenue|organic/i, value: out.priorYearSales, fmt: fmtMoneyCell },
    { re: /income before|ebt/i, value: out.priorYearEbt, fmt: fmtMoneyCell },
    { re: /eps|bpa|earnings per share/i, value: out.priorYearEps, fmt: fmtDecimalCell },
    { re: /capital expenditures|capex|capital expend/i, value: out.priorYearCapex, fmt: fmtMoneyCell },
    { re: /interest/i, value: out.priorYearNetInterest, fmt: fmtMoneyCell, override: true },
  ];

  const rows = snippet.rows.map((row) => {
    if (!Array.isArray(row) || row.length < 4) return row;
    const current = String(row[priorIdx] ?? '').trim();
    const isEmpty = !current || current === '—' || current === '-';
    const metric = String(row[0] ?? '');
    for (const rule of rules) {
      if (!rule.re.test(metric)) continue;
      if (!isEmpty && !rule.override) break;
      const filled = rule.fmt(rule.value);
      if (!filled) break;
      const next = [...row];
      next[priorIdx] = filled;
      return next;
    }
    return row;
  });

  return { ...snippet, rows };
}

function normalizeMetricKey(label) {
  return String(label ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(net|underlying|adjusted|adj|organic|growth|change|revenue|total|vs|fy\d{2,4}|20\d{2})\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function mergeOutlookRows(finalSnippet, extractionSnippet) {
  if (!finalSnippet || !Array.isArray(finalSnippet.rows)) return finalSnippet;
  const finalHeaders = Array.isArray(finalSnippet.headers) ? finalSnippet.headers : [];
  if (finalHeaders.length !== 4) return finalSnippet;
  const exHeaders = Array.isArray(extractionSnippet?.headers) ? extractionSnippet.headers : [];
  const exRows = Array.isArray(extractionSnippet?.rows) ? extractionSnippet.rows : [];
  if (exHeaders.length < 4 || !exRows.length) return finalSnippet;

  const headerCount = 4;
  const finalByKey = new Map();
  finalSnippet.rows.forEach((row) => {
    finalByKey.set(normalizeMetricKey(Array.isArray(row) ? row[0] : row?.metric), row);
  });

  const orderedRows = [];
  const usedKeys = new Set();
  for (const row of exRows) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const key = normalizeMetricKey(row[0]);
    if (finalByKey.has(key)) {
      orderedRows.push(finalByKey.get(key));
      usedKeys.add(key);
      continue;
    }
    if (!key || usedKeys.has(key)) continue;
    const padded = [...row];
    while (padded.length < headerCount) padded.push('—');
    orderedRows.push(padded.slice(0, headerCount));
    usedKeys.add(key);
  }

  finalSnippet.rows.forEach((row) => {
    const key = normalizeMetricKey(Array.isArray(row) ? row[0] : row?.metric);
    if (!usedKeys.has(key)) orderedRows.push(row);
  });

  return orderedRows.length ? { ...finalSnippet, rows: orderedRows } : finalSnippet;
}
