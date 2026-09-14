/**
 * @fileoverview Modelos analíticos para evaluación de adquisiciones y evolución de dividendos/payout.
 * @module services/reportExport/dividendsAndAcquisitionsModel
 */

import { parseSecNumber, cell, COLORS } from './exportColors.js';

/**
 * Determina si las adquisiciones o desinversiones del ejercicio superan el umbral de materialidad (50M$).
 * @param {object} report - Informe financiero consolidado.
 * @returns {{acquisitions: number, divestitures: number, material: boolean}} Datos monetarios y flag de materialidad.
 */
export function buildAcquisitionsModel(report) {
  const rows = report?.horizons?.[0]?.capital?.rows ?? [];
  const readValue = (needles) => {
    for (const row of rows) {
      const name = String(row?.name ?? '').toLowerCase();
      if (!needles.some((needle) => name.includes(needle))) continue;
      const raw = Array.isArray(row?.values) ? row.values[0] : row?.value;
      const num = parseSecNumber(raw);
      if (Number.isFinite(num)) return num;
    }
    return null;
  };
  const acquisitions = readValue(['adquisic', 'acquisit']);
  const divestitures = readValue(['desinvers', 'divestit']);
  const text = String(report?.conclusion?.acquisitions?.text ?? '');
  const saysNone = /no se realizaron|no hubo|no material|sin adquisiciones|no acquisitions|no se produjeron|none/i.test(text);
  const material = (Number.isFinite(acquisitions) && Math.abs(acquisitions) >= 50)
    || (Number.isFinite(divestitures) && Math.abs(divestitures) >= 50)
    || (text.trim().length > 0 && !saysNone);
  return { acquisitions: acquisitions ?? 0, divestitures: divestitures ?? 0, material };
}

/**
 * Genera el modelo analítico de dividendos por acción, total distribuido y payout sobre BPA ajustado.
 * @param {object} report - Informe financiero consolidado.
 * @returns {object|null} Serie histórica de dividendos, métricas CAGR y variaciones, o null si no aplica.
 */
export function buildDividendModel(report) {
  const div = report?.conclusion?.dividends ?? null;
  const rawHistory = (Array.isArray(div?.history) && div.history.length)
    ? div.history
    : (Array.isArray(report?.edgarDividendHistory) ? report.edgarDividendHistory : []);
  const points = rawHistory
    .map((point) => ({
      year: Number(point?.year),
      dps: parseSecNumber(point?.dps),
      total: parseSecNumber(point?.total),
      adjustedEps: parseSecNumber(point?.adjustedEps),
      eps: parseSecNumber(point?.eps),
    }))
    .filter((point) => Number.isFinite(point.year) && Number.isFinite(point.dps) && point.dps > 0)
    .sort((a, b) => a.year - b.year)
    .slice(-5);
  if (points.length < 2) return null;

  points.forEach((point) => {
    const adjusted = Number.isFinite(point.adjustedEps) && point.adjustedEps > 0 ? point.adjustedEps : null;
    const reported = Number.isFinite(point.eps) && point.eps > 0 ? point.eps : null;
    const eps = adjusted ?? reported;
    point.epsUsed = eps;
    point.epsIsAdjusted = adjusted != null;
    point.payoutPct = eps ? Math.round(((point.dps / eps) * 100) * 10) / 10 : null;
  });

  const changePct = Number.isFinite(Number(div?.changePct))
    ? Number(div.changePct)
    : (points[points.length - 2].dps > 0
      ? Math.round(((points[points.length - 1].dps - points[points.length - 2].dps) / points[points.length - 2].dps) * 1000) / 10
      : null);
  const changeType = div?.changeType || (changePct > 0 ? 'increase' : (changePct < 0 ? 'cut' : 'unchanged'));
  const material = Number.isFinite(changePct) && Math.abs(changePct) >= 2;
  if (!div && !material) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const previous = points[points.length - 2];
  const span = last.year - first.year;
  const cagrOf = (from, to) => (span > 0 && Number.isFinite(from) && from > 0 && Number.isFinite(to) && to > 0
    ? (Math.pow(to / from, 1 / span) - 1) * 100
    : null);

  const generatedText = Number.isFinite(changePct)
    ? `El dividendo por acción ${changeType === 'cut' ? 'se recortó' : 'aumentó'} un ${Math.abs(changePct).toFixed(1).replace('.', ',')} % en ${last.year}, pasando de ${String(previous.dps).replace('.', ',')} $ a ${String(last.dps).replace('.', ',')} $.`
    : null;

  const acquisitionsMaterial = buildAcquisitionsModel(report).material;
  const repurchasesShown = Boolean(report?.conclusion?.repurchases);
  const dividendNumber = 3 + (repurchasesShown ? 1 : 0) + (acquisitionsMaterial ? 1 : 0);

  return {
    title: `${dividendNumber}: Dividendos`,
    text: div?.text || generatedText,
    points,
    changeType,
    changePct,
    material,
    dpsCagr: cagrOf(first.dps, last.dps),
    totalCagr: cagrOf(first.total, last.total),
    hasReportedFallback: points.some((point) => point.payoutPct != null && !point.epsIsAdjusted),
  };
}

/**
 * Genera la estructura de tabla detallada de dividendos y payout para exportación.
 * @param {object} chart - Modelo retornado por buildDividendModel.
 * @returns {object|null} Definición de columnas, cabeceras y celdas.
 */
export function buildDividendTable(chart) {
  if (!chart || !Array.isArray(chart.points) || !chart.points.length) return null;
  const headers = [
    cell('Año', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Dividendo/acción', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Dividendo total ($M)', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('BPA usado ($)', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Payout (%)', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
  ];
  const rows = chart.points.map((point) => [
    cell(String(point.year), { bold: true, color: COLORS.ink }),
    cell(Number.isFinite(point.dps) ? `${point.dps.toFixed(2).replace('.', ',')} $` : '—', { color: COLORS.ink }),
    cell(Number.isFinite(point.total) ? `$${point.total.toFixed(1).replace('.', ',')}M` : '—', { color: COLORS.ink }),
    cell(Number.isFinite(point.epsUsed) ? `${point.epsUsed.toFixed(2).replace('.', ',')} $${point.epsIsAdjusted ? '' : ' *'}` : '—', { color: COLORS.ink }),
    cell(Number.isFinite(point.payoutPct) ? `${point.payoutPct.toFixed(1).replace('.', ',')} %` : '—', { bold: true, color: '#0f766e' }),
  ]);
  return { columns: ['Año', 'Dividendo/acción', 'Dividendo total ($M)', 'BPA usado ($)', 'Payout (%)'], widths: [60, 110, 130, 110, 105], headers, rows };
}
