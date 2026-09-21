/**
 * @fileoverview Modelos analíticos para evaluación de adquisiciones y evolución de dividendos/payout.
 * @module services/reportExport/dividendsAndAcquisitionsModel
 */

import { parseSecNumber, cell, COLORS } from './exportColors.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';

/**
 * Determina si las operaciones corporativas del ejercicio (adquisiciones, desinversiones,
 * spin-offs o reestructuraciones) superan el umbral de materialidad (50M$ o relevancia estratégica).
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
  const section = report?.conclusion?.acquisitions;
  const text = String(section?.text ?? '');
  const saysNone = /no se realizaron|no hubo|no material|sin adquisiciones|no acquisitions|no se produjeron|el ejercicio no registró|none/i.test(text);
  const hasOtherCorporateEvents = section?.hasDivestitures === true
    || section?.hasSpinOffs === true
    || section?.hasRestructurings === true;
  const material = (Number.isFinite(acquisitions) && Math.abs(acquisitions) >= 50)
    || (Number.isFinite(divestitures) && Math.abs(divestitures) >= 50)
    || hasOtherCorporateEvents
    || (text.trim().length > 0 && !saysNone);
  return { acquisitions: acquisitions ?? 0, divestitures: divestitures ?? 0, material };
}

/**
 * Genera el modelo analítico de dividendos por acción, total distribuido y payout sobre BPA ajustado.
 * @param {object} report - Informe financiero consolidado.
 * @returns {object|null} Serie histórica de dividendos, métricas CAGR y variaciones, o null si no aplica.
 */
export function buildDividendModel(report) {
  const lang = normalizeLanguage(report?.language);
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

  const fmtNum = (value) => {
    const fixed = Number(value).toFixed(2);
    return lang === 'en' ? fixed : fixed.replace('.', ',');
  };
  const generatedText = Number.isFinite(changePct)
    ? t('El dividendo por acción {verb} un {pct} % en {year}, pasando de {prev} $ a {curr} $.', {
      verb: changeType === 'cut' ? t('se recortó', null, lang) : t('aumentó', null, lang),
      pct: lang === 'en' ? Math.abs(changePct).toFixed(1) : Math.abs(changePct).toFixed(1).replace('.', ','),
      year: last.year,
      prev: fmtNum(previous.dps),
      curr: fmtNum(last.dps),
    }, lang)
    : null;

  const acquisitionsMaterial = buildAcquisitionsModel(report).material;
  const repurchasesShown = Boolean(report?.conclusion?.repurchases);
  const dividendNumber = 3 + (repurchasesShown ? 1 : 0) + (acquisitionsMaterial ? 1 : 0);

  return {
    title: div?.title || t('{number}: Dividendos', { number: dividendNumber }, lang),
    text: div?.text || generatedText,
    language: lang,
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
  const lang = normalizeLanguage(chart.language);
  const num = (value, digits = 2) => {
    const fixed = Number(value).toFixed(digits);
    return lang === 'en' ? fixed : fixed.replace('.', ',');
  };
  const colYear = t('Año', null, lang);
  const colDps = t('Dividendo/acción', null, lang);
  const colTotal = t('Dividendo total ($M)', null, lang);
  const colEps = t('BPA usado ($)', null, lang);
  const colPayout = t('Payout (%)', null, lang);
  const headers = [
    cell(colYear, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell(colDps, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell(colTotal, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell(colEps, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell(colPayout, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
  ];
  const rows = chart.points.map((point) => [
    cell(String(point.year), { bold: true, color: COLORS.ink }),
    cell(Number.isFinite(point.dps) ? `${num(point.dps)} $` : '—', { color: COLORS.ink }),
    cell(Number.isFinite(point.total) ? `$${num(point.total, 1)}M` : '—', { color: COLORS.ink }),
    cell(Number.isFinite(point.epsUsed) ? `${num(point.epsUsed)} $${point.epsIsAdjusted ? '' : ' *'}` : '—', { color: COLORS.ink }),
    cell(Number.isFinite(point.payoutPct) ? `${num(point.payoutPct, 1)} %` : '—', { bold: true, color: '#0f766e' }),
  ]);
  return { columns: [colYear, colDps, colTotal, colEps, colPayout], widths: [60, 110, 130, 110, 105], headers, rows };
}
