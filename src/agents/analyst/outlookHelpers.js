/**
 * @fileoverview Funciones auxiliares para la construcción, completado y combinación de tablas de guidance/outlook.
 * @module agents/analyst/outlookHelpers
 */

/**
 * Parsea un valor numérico flexible desde texto o número.
 * @param {string|number|null} val - Valor bruto.
 * @returns {number|null} Valor numérico o null.
 */
function parseNum(val) {
  if (val == null) return null;
  let s = String(val).replace(/[^0-9.,\-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Formatea un número como importe monetario en millones.
 * @param {number|null} n - Cifra en millones.
 * @returns {string} Texto formateado en millones ($XM).
 */
function fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return '$' + Math.round(n).toLocaleString('en-US') + 'M';
}

/**
 * Formatea un número como EPS / BPA con dos decimales.
 * @param {number|null} n - Cifra por acción.
 * @returns {string} Texto formateado ($X.XX).
 */
function fmtEps(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return '$' + n.toFixed(2);
}

/**
 * Extrae el porcentaje de variación o rango desde un texto de guidance.
 * @param {string} g - Texto de guidance.
 * @returns {{minP: number, maxP: number}|null} Rango porcentual en decimales o null.
 */
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

/**
 * Proyecta la fila de ventas netas / ingresos.
 * @param {string} g - Guidance.
 * @param {number|null} prevSalesVal - Ventas del ejercicio anterior.
 * @param {number} prevYear - Año anterior.
 * @returns {string} Proyección calculada.
 */
function projectSales(g, prevSalesVal, prevYear) {
  if (/flat\s*(?:[±+\-/]+|\+\/-)\s*(\d+(?:[\.,]\d+)?)/i.test(g)) {
    const pct = parseFloat(g.match(/flat\s*(?:[±+\-/]+|\+\/-)\s*(\d+(?:[\.,]\d+)?)/i)[1].replace(',', '.')) / 100;
    if (prevSalesVal) {
      return `~${fmtMoney(prevSalesVal * (1 - pct))} – ${fmtMoney(prevSalesVal * (1 + pct))}`;
    }
    return `En línea con ${prevYear}`;
  }
  const range = extractPctRange(g);
  if (range && prevSalesVal) {
    return `~${fmtMoney(prevSalesVal * (1 + range.minP))} – ${fmtMoney(prevSalesVal * (1 + range.maxP))}`;
  }
  return g;
}

/**
 * Proyecta la fila de EBT o resultado operativo.
 * @param {string} g - Guidance.
 * @param {number|null} prevEbtVal - EBT del ejercicio anterior.
 * @returns {string} Proyección calculada.
 */
function projectEbt(g, prevEbtVal) {
  const range = extractPctRange(g);
  if (range && prevEbtVal) {
    return `~${fmtMoney(prevEbtVal * (1 + range.minP))} – ${fmtMoney(prevEbtVal * (1 + range.maxP))}`;
  }
  return g;
}

/**
 * Proyecta la fila de EPS.
 * @param {string} g - Guidance.
 * @param {number|null} prevEpsVal - EPS del ejercicio anterior.
 * @returns {string} Proyección calculada.
 */
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

/**
 * Proyecta la fila de Free Cash Flow.
 * @param {string} g - Guidance.
 * @param {number|null} prevEbtVal - EBT previo.
 * @returns {string} Proyección calculada.
 */
function projectFcf(g, prevEbtVal) {
  const bMatch = g.match(/\$([0-9.,]+)\s*B\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
  if (bMatch) {
    const base = parseFloat(bMatch[1].replace(',', '.')) * 1000;
    const pct = parseFloat(bMatch[2].replace(',', '.')) / 100;
    return `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
  }
  const mMatch = g.match(/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
  if (mMatch) {
    const base = parseFloat(mMatch[1].replace(',', '.'));
    const pct = parseFloat(mMatch[2].replace(',', '.')) / 100;
    return `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
  }
  if (/100\s*%/i.test(g)) {
    return prevEbtVal ? `~${fmtMoney(prevEbtVal * 0.75)} (conversión ~100 %)` : '~100 % conversión';
  }
  return g;
}

/**
 * Proyecta la fila de CAPEX o depreciaciones.
 * @param {string} g - Guidance.
 * @returns {string} Proyección calculada.
 */
function projectCapexOrDepr(g) {
  const mMatch = g.match(/\$([0-9.,]+)\s*M\s*(?:[±+\-/]+|\+\/-)\s*(\d+)\s*%/i);
  if (mMatch) {
    const base = parseFloat(mMatch[1].replace(',', '.'));
    const pct = parseFloat(mMatch[2].replace(',', '.')) / 100;
    return `~${fmtMoney(base * (1 - pct))} – ${fmtMoney(base * (1 + pct))}`;
  }
  return g;
}

/**
 * Genera la comparación enriquecida para una fila individual de guidance.
 */
function buildComparisonRow(row, context) {
  const metric = Array.isArray(row) ? row[0] : (row.metric ?? row.name);
  const guidance = Array.isArray(row) ? row[1] : row.value;
  if (Array.isArray(row) && row.length >= 4) return row;

  const m = String(metric).toLowerCase();
  const g = String(guidance ?? '');
  let prevStr = '—';
  let projStr = '—';

  if (/sales|ventas|revenue/i.test(m)) {
    if (context.prevSalesVal) prevStr = fmtMoney(context.prevSalesVal);
    projStr = projectSales(g, context.prevSalesVal, context.prevYear);
  } else if (/income before|ebt|operating income|beneficio/i.test(m)) {
    if (context.prevEbtVal) prevStr = `${fmtMoney(context.prevEbtVal)} (adj)`;
    projStr = projectEbt(g, context.prevEbtVal);
  } else if (/eps|earnings per share|bpa/i.test(m)) {
    if (context.prevEpsVal) prevStr = fmtEps(context.prevEpsVal);
    projStr = projectEps(g, context.prevEpsVal);
  } else if (/free cash flow|fcf/i.test(m)) {
    prevStr = context.prevFcfVal
      ? (context.prevFcfAdjVal ? `${fmtMoney(context.prevFcfVal)} / ${fmtMoney(context.prevFcfAdjVal)} (adj)` : fmtMoney(context.prevFcfVal))
      : '—';
    projStr = projectFcf(g, context.prevEbtVal);
  } else if (/depreciation|amorti/i.test(m)) {
    projStr = projectCapexOrDepr(g);
  } else if (/interest/i.test(m)) {
    projStr = projectCapexOrDepr(g);
  } else if (/capex|capital expend/i.test(m)) {
    prevStr = context.prevCapexVal ? fmtMoney(context.prevCapexVal) : '—';
    projStr = projectCapexOrDepr(g);
  } else {
    projStr = g;
  }

  return [metric, prevStr, guidance, projStr];
}

/**
 * Añade columnas de comparación (año anterior y proyección) a la tabla de guidance.
 * @param {object} snippet - Snippet de guidance con rows y headers.
 * @param {object} report - Reporte de análisis con horizontes financieros.
 * @returns {object} Snippet enriquecido.
 */
export function withOutlookComparison(snippet, report) {
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

  const getSalesRow = (name) => salesRows.find((r) => (r.name || '').toLowerCase().includes(name.toLowerCase()));
  const getCfRow = (name) => cfRows.find((r) => (r.name || '').toLowerCase().includes(name.toLowerCase()));

  const prevSalesRow = getSalesRow('Ventas');
  const prevSalesVal = parseNum(prevSalesRow?.adjusted || prevSalesRow?.normal);
  const prevEbtRow = getSalesRow('EBT');
  const prevEbtVal = parseNum(prevEbtRow?.adjusted || prevEbtRow?.normal);
  const prevFcfRow = getCfRow('FCF');
  const prevFcfVal = parseNum(prevFcfRow?.values?.[0]);
  const prevFcfAdjVal = parseNum(prevFcfRow?.values?.[1]);
  const prevCapexRow = getCfRow('CAPEX');
  const prevCapexVal = parseNum(prevCapexRow?.values?.[0]);
  const prevEpsVal = parseNum(h0?.sales?.eps) || (prevEbtVal ? prevEbtVal / (parseNum(h0?.sales?.shares) || 200) : null);

  const context = {
    prevYear,
    prevSalesVal,
    prevEbtVal,
    prevFcfVal,
    prevFcfAdjVal,
    prevCapexVal,
    prevEpsVal,
  };

  const newHeaders = [
    rawHeaders[0] || 'Métrica',
    `${prevYear} (Año anterior)`,
    rawHeaders[1] || `Guidance ${nextYear}E*`,
    `Cifra Proyectada ${nextYear}E`,
  ];

  const newRows = snippet.rows.map((row) => buildComparisonRow(row, context));

  return { ...snippet, headers: newHeaders, rows: newRows };
}

/**
 * Completa la columna de año anterior en la tabla de guidance usando la extracción oficial.
 * @param {object} snippet - Tabla de guidance.
 * @param {object} extractionOutlook - Métricas extraídas del 10-K / 8-K.
 * @returns {object} Snippet completado.
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

/**
 * Clave normalizada para comparar nombres de métricas.
 * @param {string} label - Nombre de métrica.
 * @returns {string} Clave canónica.
 */
function normalizeMetricKey(label) {
  return String(label ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(net|underlying|adjusted|adj|organic|growth|change|revenue|total|vs|fy\d{2,4}|20\d{2})\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Une a la tabla final de guidance las filas oficiales extraídas que el modelo haya omitido.
 * @param {object} finalSnippet - Tabla final de guidance.
 * @param {object} extractionSnippet - Tabla extraída del filing.
 * @returns {object} Tabla combinada.
 */
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
