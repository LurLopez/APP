/**
 * @fileoverview Modelos de datos y tablas para el análisis de evolución de acciones y programas de recompras.
 * @module services/reportExport/sharesModel
 */

import { parseSecNumber, cell, COLORS } from './exportColors.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';

/**
 * Formatea un porcentaje con signo y coma decimal.
 * @param {number} pct - Porcentaje a formatear.
 * @param {string} [language] - Idioma del informe.
 * @returns {string} Texto formateado con signo y símbolo %.
 */
export function fmtPct(pct, language = 'es') {
  const value = pct.toFixed(1);
  return `${pct < 0 ? '' : '-'}${language === 'en' ? value : value.replace('.', ',')} %`;
}

/**
 * Formatea el impacto positivo en BPA derivado de recompras.
 * @param {number} pct - Porcentaje de aumento en BPA.
 * @param {string} [language] - Idioma del informe.
 * @returns {string} Texto formateado (ej. '+3,5 %').
 */
export function fmtBpa(pct, language = 'es') {
  const value = pct.toFixed(1);
  return `+${language === 'en' ? value : value.replace('.', ',')} %`;
}

/**
 * Añade una fila calculada de 'Average price paid (in $)' al extracto SEC de recompras si no está presente.
 * @param {object} snippet - Extracto de tabla SEC de recompras.
 * @returns {object} Extracto con la fila calculada incorporada si es factible.
 */
export function withAveragePriceRow(snippet) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return snippet;
  if (snippet.rows.some((r) => /average price/i.test(String(Array.isArray(r) ? r[0] : (r.metric ?? r.name))))) {
    return snippet;
  }
  const sharesRow = snippet.rows.find((r) => /shares repurchased/i.test(String(Array.isArray(r) ? r[0] : (r.metric ?? r.name))));
  const costRow = snippet.rows.find((r) => /aggregate cost/i.test(String(Array.isArray(r) ? r[0] : (r.metric ?? r.name))));
  if (!sharesRow || !costRow) return snippet;

  const width = Math.max(Array.isArray(sharesRow) ? sharesRow.length : 2, Array.isArray(costRow) ? costRow.length : 2);
  const prices = [];
  for (let i = 1; i < width; i += 1) {
    const shares = parseSecNumber(Array.isArray(sharesRow) ? sharesRow[i] : sharesRow.value);
    const cost = parseSecNumber(Array.isArray(costRow) ? costRow[i] : costRow.value);
    if (Number.isFinite(shares) && Number.isFinite(cost) && shares > 0) {
      const price = (cost * 1e6) / shares;
      prices.push(`$${price.toFixed(1).replace('.', ',')}`);
    } else {
      prices.push('—');
    }
  }
  if (prices.every((p) => p === '—')) return snippet;
  return { ...snippet, rows: [...snippet.rows, ['Average price paid (in $)', ...prices]] };
}

/**
 * Construye el modelo de datos para el gráfico de barras y tendencia de recuento de acciones.
 * @param {Array<{year: string|number, shares: number}>} sharesHistory - Histórico de acciones en circulación.
 * @returns {object|null} Modelo matemático para renderizado gráfico o null si no hay datos suficientes.
 */
export function buildSharesChartModel(sharesHistory, language = 'es') {
  const lang = normalizeLanguage(language);
  if (!Array.isArray(sharesHistory) || !sharesHistory.length) return null;
  const points = sharesHistory
    .map((h) => ({ year: String(h?.year ?? '').trim(), shares: Number(h?.shares) }))
    .filter((p) => p.year && Number.isFinite(p.shares) && p.shares > 0);
  if (points.length < 2) return null;

  const max = Math.max(...points.map((p) => p.shares));
  const title = points.length >= 5
    ? t('EVOLUCIÓN DEL NÚMERO DE ACCIONES (ÚLTIMOS 5 AÑOS)', null, lang)
    : t('EVOLUCIÓN DEL NÚMERO DE ACCIONES (AÑOS DISPONIBLES)', null, lang);
  const n = points.length;
  const first = points[0].shares;
  const lastPoint = points[n - 1].shares;
  const cagrPct = (1 - Math.pow(lastPoint / first, 1 / (n - 1))) * 100;
  const bpaCagr = (cagrPct / (100 - cagrPct)) * 100;
  const prevPoint = points[n - 2].shares;
  const lastPct = (1 - lastPoint / prevPoint) * 100;
  const bpaLast = (lastPct / (100 - lastPct)) * 100;

  return {
    title,
    language: lang,
    max,
    points,
    metrics: [
      { label: t('Reducción media anual (CAGR, {years} años)', { years: n - 1 }, lang), pct: cagrPct, bpa: bpaCagr },
      { label: t('Último año', null, lang), pct: lastPct, bpa: bpaLast },
    ],
  };
}

/**
 * Genera la estructura tabular equivalente del gráfico de acciones para formatos que no admiten gráficos.
 * @param {object} chart - Modelo retornado por buildSharesChartModel.
 * @returns {object|null} Definición de columnas, cabeceras y filas.
 */
export function buildSharesChartTable(chart) {
  if (!chart || !Array.isArray(chart.points) || !chart.points.length) return null;
  const lang = normalizeLanguage(chart.language);
  const colYear = t('Año', null, lang);
  const colShares = t('Acciones (millones)', null, lang);
  const colDelta = t('Δ vs año anterior', null, lang);
  const headers = [
    cell(colYear, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell(colShares, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell(colDelta, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
  ];
  const rows = chart.points.map((p, i) => {
    const prev = i > 0 ? chart.points[i - 1].shares : null;
    const delta = prev != null ? ((p.shares - prev) / prev) * 100 : null;
    const sharesValue = lang === 'en' ? String(p.shares) : String(p.shares).replace('.', ',');
    return [
      cell(String(p.year), { bold: true, color: COLORS.ink }),
      cell(`${sharesValue}M`, { color: COLORS.ink }),
      cell(delta != null ? fmtPct(delta, lang) : '—', { color: delta != null && delta < 0 ? COLORS.negative : COLORS.ink }),
    ];
  });
  const metricRows = (chart.metrics ?? []).map((m) => [
    cell(m.label, { bold: true, color: COLORS.ink, bg: '#e0f2fe' }),
    cell('—', { color: COLORS.ink, bg: '#e0f2fe' }),
    cell(`${fmtPct(m.pct, lang)} (BPA ${fmtBpa(m.bpa, lang)})`, { bold: true, color: COLORS.negative, bg: '#e0f2fe' }),
  ]);
  return { columns: [colYear, colShares, colDelta], widths: [70, 140, 120], headers, rows: [...rows, ...metricRows] };
}
