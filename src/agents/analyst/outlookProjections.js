/**
 * @fileoverview Módulo extraído de outlookHelpers.js.
 */

import { t, normalizeLanguage } from '../../utils/i18n.js';

function parseNum(val) {
  if (val == null) return null;
  let s = String(val).replace(/[^0-9.,\-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function fmtMoney(n, language = 'es') {
  if (n == null || !Number.isFinite(n)) return '—';
  const rounded = Math.round(n);
  const formatted = language === 'en'
    ? rounded.toLocaleString('en-US')
    : rounded.toLocaleString('de-DE');
  return '$' + formatted + 'M';
}

function fmtEps(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return '$' + n.toFixed(2);
}

function extractPctRange(g) {
  const match = g.match(/\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?\s*(?:to|a|-)\s*\(?([+\-]?\d+(?:[\.,]\d+)?)\s*%\)?/i);
  if (!match) return null;
  let p1 = parseFloat(match[1].replace(',', '.')) / 100;
  let p2 = parseFloat(match[2].replace(',', '.')) / 100;
  if (/decline|caída|descenso/i.test(g) || g.includes('(')) {
    p1 = -Math.abs(p1);
    p2 = -Math.abs(p2);
  }
  return { minP: Math.min(p1, p2), maxP: Math.max(p1, p2) };
}

function projectSales(g, prevSalesVal, prevYear, language = 'es') {
  if (/flat\s*(?:[±+\-/]+|\+\/-)\s*(\d+(?:[\.,]\d+)?)/i.test(g)) {
    const pct = parseFloat(g.match(/flat\s*(?:[±+\-/]+|\+\/-)\s*(\d+(?:[\.,]\d+)?)/i)[1].replace(',', '.')) / 100;
    if (prevSalesVal) {
      return `~${fmtMoney(prevSalesVal * (1 - pct), language)} – ${fmtMoney(prevSalesVal * (1 + pct), language)}`;
    }
    return t('En línea con {year}', { year: prevYear }, language);
  }
  const range = extractPctRange(g);
  if (range && prevSalesVal) {
    return `~${fmtMoney(prevSalesVal * (1 + range.minP), language)} – ${fmtMoney(prevSalesVal * (1 + range.maxP), language)}`;
  }
  return g;
}

function projectEbt(g, prevEbtVal, language = 'es') {
  const range = extractPctRange(g);
  if (range && prevEbtVal) {
    return `~${fmtMoney(prevEbtVal * (1 + range.minP), language)} – ${fmtMoney(prevEbtVal * (1 + range.maxP), language)}`;
  }
  return g;
}

function projectEps(g, prevEpsVal) {
  if (/\$?([0-9.,]+)\s*(?:to|a|-)\s*\$?([0-9.,]+)/i.test(g) && !g.includes('%')) {
    const match = g.match(/\$?([0-9.,]+)\s*(?:to|a|-)\s*\$?([0-9.,]+)/i);
    return `$${parseFloat(match[1].replace(',', '.'))} – $${parseFloat(match[2].replace(',', '.'))}`;
  }
  const range = extractPctRange(g);
  if (range && prevEpsVal) {
    return `~${fmtEps(prevEpsVal * (1 + range.minP))} – ${fmtEps(prevEpsVal * (1 + range.maxP))}`;
  }
  return g;
}

function projectFcf(g, prevEbtVal, language = 'es') {
  const bMatch = g.match(/\$([0-9.,]+)\s*B\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
  if (bMatch) {
    const base = parseFloat(bMatch[1].replace(',', '.')) * 1000;
    const pct = parseFloat(bMatch[2].replace(',', '.')) / 100;
    return `~${fmtMoney(base * (1 - pct), language)} – ${fmtMoney(base * (1 + pct), language)}`;
  }
  const mMatch = g.match(/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
  if (mMatch) {
    const base = parseFloat(mMatch[1].replace(',', '.'));
    const pct = parseFloat(mMatch[2].replace(',', '.')) / 100;
    return `~${fmtMoney(base * (1 - pct), language)} – ${fmtMoney(base * (1 + pct), language)}`;
  }
  if (/100\s*%/i.test(g)) {
    return prevEbtVal
      ? t('~{value} (conversión ~100 %)', { value: fmtMoney(prevEbtVal * 0.75, language) }, language)
      : t('~100 % conversión', null, language);
  }
  return g;
}

function projectCapexOrDepr(g, language = 'es') {
  const mMatch = g.match(/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
  if (mMatch) {
    const base = parseFloat(mMatch[1].replace(',', '.'));
    const pct = parseFloat(mMatch[2].replace(',', '.')) / 100;
    return `~${fmtMoney(base * (1 - pct), language)} – ${fmtMoney(base * (1 + pct), language)}`;
  }
  return g;
}

function buildComparisonRow(row, context) {
  const language = context.language;
  const metric = Array.isArray(row) ? row[0] : (row.metric ?? row.name);
  const guidance = Array.isArray(row) ? row[1] : row.value;
  if (Array.isArray(row) && row.length >= 4) return row;

  const m = String(metric).toLowerCase();
  const g = String(guidance ?? '');
  let prevStr = '—';
  let projStr = '—';

  if (/sales|ventas|revenue/i.test(m)) {
    if (context.prevSalesVal) prevStr = fmtMoney(context.prevSalesVal, language);
    projStr = projectSales(g, context.prevSalesVal, context.prevYear, language);
  } else if (/income before|ebt|operating income|beneficio/i.test(m)) {
    if (context.prevEbtVal) prevStr = `${fmtMoney(context.prevEbtVal, language)} (adj)`;
    projStr = projectEbt(g, context.prevEbtVal, language);
  } else if (/eps|earnings per share|bpa/i.test(m)) {
    if (context.prevEpsVal) prevStr = fmtEps(context.prevEpsVal);
    projStr = projectEps(g, context.prevEpsVal);
  } else if (/free cash flow|fcf/i.test(m)) {
    prevStr = context.prevFcfVal
      ? (context.prevFcfAdjVal ? `${fmtMoney(context.prevFcfVal, language)} / ${fmtMoney(context.prevFcfAdjVal, language)} (adj)` : fmtMoney(context.prevFcfVal, language))
      : '—';
    projStr = projectFcf(g, context.prevEbtVal, language);
  } else if (/depreciation|amorti/i.test(m)) {
    projStr = projectCapexOrDepr(g, language);
  } else if (/interest/i.test(m)) {
    projStr = projectCapexOrDepr(g, language);
  } else if (/capex|capital expend/i.test(m)) {
    prevStr = context.prevCapexVal ? fmtMoney(context.prevCapexVal, language) : '—';
    projStr = projectCapexOrDepr(g, language);
  } else {
    projStr = g;
  }

  return [metric, prevStr, guidance, projStr];
}

export function withOutlookComparison(snippet, report, language = null) {
  const lang = normalizeLanguage(language || report?.language);
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return snippet;
  const rawHeaders = Array.isArray(snippet.headers) ? snippet.headers : [];
  if (rawHeaders.length >= 4) return snippet;

  let nextYear = 2026;
  const titleMatch = (snippet.title || '').match(/20\d\d/);
  if (titleMatch) nextYear = parseInt(titleMatch[0], 10);
  else if (rawHeaders[1] && rawHeaders[1].match(/20\d\d/)) nextYear = parseInt(rawHeaders[1].match(/20\d\d/)[0], 10);
  else if (report?.fiscalYear) nextYear = report.fiscalYear + 1;
  const prevYear = nextYear - 1;

  const h0 = report?.horizons?.[0];
  const salesRows = h0?.sales?.rows || [];
  const cfRows = h0?.cashFlow?.rows || [];

  const getSalesRow = (names) => salesRows.find((r) => {
    const rowName = (r.name || '').toLowerCase();
    return names.some((name) => rowName.includes(name.toLowerCase()));
  });
  const getCfRow = (name) => cfRows.find((r) => (r.name || '').toLowerCase().includes(name.toLowerCase()));

  const prevSalesRow = getSalesRow(['Ventas', 'Sales']);
  const prevSalesVal = parseNum(prevSalesRow?.adjusted || prevSalesRow?.normal);
  const prevEbtRow = getSalesRow(['EBT']);
  const prevEbtVal = parseNum(prevEbtRow?.adjusted || prevEbtRow?.normal);
  const prevFcfRow = getCfRow('FCF');
  const prevFcfVal = parseNum(prevFcfRow?.values?.[0]);
  const prevFcfAdjVal = parseNum(prevFcfRow?.values?.[1]);
  const prevCapexRow = getCfRow('CAPEX');
  const prevCapexVal = parseNum(prevCapexRow?.values?.[0]);
  const prevEpsVal = parseNum(h0?.sales?.eps) || (prevEbtVal ? prevEbtVal / (parseNum(h0?.sales?.shares) || 200) : null);

  const context = {
    language: lang,
    prevYear,
    prevSalesVal,
    prevEbtVal,
    prevFcfVal,
    prevFcfAdjVal,
    prevCapexVal,
    prevEpsVal,
  };

  const newHeaders = [
    rawHeaders[0] || t('Métrica', null, lang),
    `${prevYear} ${t('(Año anterior)', null, lang)}`,
    rawHeaders[1] || `Guidance ${nextYear}E*`,
    `${t('Cifra Proyectada', null, lang)} ${nextYear}E`,
  ];

  const newRows = snippet.rows.map((row) => buildComparisonRow(row, context));

  return { ...snippet, headers: newHeaders, rows: newRows };
}
