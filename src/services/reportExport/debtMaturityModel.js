/**
 * @fileoverview Modelo matemático y tabla del calendario de vencimientos de deuda a 5 años.
 * @module services/reportExport/debtMaturityModel
 */

import { parseSecNumber, cell, COLORS } from './exportColors.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';
import { maturityWindowBounds } from '../../agents/analyst/debtMaturityFallback.js';

/**
 * Colores de los segmentos apilados en el calendario de vencimientos.
 * @type {Array<{fill: string, text: string}>}
 */
export const DEBT_STACK_PALETTE = [
  { fill: '#f59e0b', text: '#ffffff' }, // Naranja
  { fill: '#0ea5e9', text: '#ffffff' }, // Azul
  { fill: '#7c3aed', text: '#ffffff' }, // Morado
  { fill: '#10b981', text: '#ffffff' }, // Verde
  { fill: '#ef4444', text: '#ffffff' }, // Rojo
];

/**
 * Calcula el tipo de interés medio ponderado a partir de las filas y cupones de una tabla SEC.
 * @param {object} snippet - Extracto SEC con desglose de emisiones de deuda.
 * @returns {{rate: number, amount: number, estimated: boolean}|null} Tipo ponderado e importe base.
 */
export function rateFromSecSnippet(snippet) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return null;
  const headers = Array.isArray(snippet.headers) ? snippet.headers : [];
  let balanceIdx = -1;
  let bestYear = -Infinity;
  headers.forEach((header, index) => {
    const match = String(header).match(/(20\d\d)/);
    if (match) {
      const year = Number(match[1]);
      if (year > bestYear) {
        bestYear = year;
        balanceIdx = index;
      }
    }
  });
  if (balanceIdx < 0) balanceIdx = headers.length >= 3 ? 2 : 1;
  let totalAmount = 0;
  let weighted = 0;
  let estimated = false;
  snippet.rows.forEach((row) => {
    const cells = Array.isArray(row) ? row : [row?.metric ?? row?.name, row?.value];
    const rowText = cells.join(' ');
    const rateMatches = [...rowText.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)]
      .map((match) => Number(String(match[1]).replace(',', '.')))
      .filter((rate) => Number.isFinite(rate) && rate > 0);
    if (!rateMatches.length) return;
    const rate = rateMatches.length >= 2
      ? (Math.min(...rateMatches) + Math.max(...rateMatches)) / 2
      : rateMatches[0];
    if (rateMatches.length >= 2) estimated = true;
    const balance = parseSecNumber(cells[balanceIdx]);
    if (!Number.isFinite(balance) || balance <= 0) return;
    totalAmount += balance;
    weighted += balance * rate;
  });
  if (totalAmount <= 0) return null;
  return { rate: weighted / totalAmount, amount: totalAmount, estimated };
}

/**
 * Construye el modelo analítico para el gráfico apilado de vencimientos de deuda a 5 años.
 * @param {object} debt - Objeto con datos de deuda del informe.
 * @param {string|number} reportFiscalYear - Año fiscal de referencia del informe.
 * @param {string} [language] - Idioma del informe.
 * @param {string} [periodEnd] - Fecha de cierre en formato AAAA-MM-DD.
 * @returns {object|null} Modelo del calendario de vencimientos o null si no hay datos.
 */
export function buildDebtMaturityModel(debt, reportFiscalYear, language = 'es', periodEnd = null) {
  const lang = normalizeLanguage(language);
  if (!debt) return null;
  let baseYear = Number(reportFiscalYear);
  if (!Number.isFinite(baseYear) || baseYear < 2000) {
    const fromSnippet = String(debt?.secSnippet?.title || debt?.title || '').match(/20\d\d/);
    baseYear = fromSnippet ? parseInt(fromSnippet[0], 10) : 2025;
  }
  const bounds = maturityWindowBounds(baseYear, periodEnd) ?? { minYear: baseYear + 1, maxYear: baseYear + 5 };
  const { minYear, maxYear } = bounds;

  const rawItems = [];
  const pushItem = (entry, fallbackYear) => {
    const yr = Number(entry?.year ?? fallbackYear);
    const amount = parseSecNumber(entry?.amount ?? entry?.totalAmount ?? entry?.value);
    const rate = parseSecNumber(entry?.interestRate ?? entry?.rate ?? entry?.averageRate);
    const type = String(entry?.type || entry?.name || entry?.label || 'Deuda total').trim();
    if (!Number.isFinite(yr) || !Number.isFinite(amount) || amount <= 0) return;
    rawItems.push({
      year: yr,
      name: String(entry?.name || entry?.label || type).trim(),
      type,
      amount,
      interestRate: Number.isFinite(rate) && rate > 0 ? rate : null,
      estimated: entry?.estimated === true,
    });
  };

  if (Array.isArray(debt.maturitySchedule)) {
    debt.maturitySchedule.forEach((entry) => {
      if (Array.isArray(entry?.items) && entry.items.length) {
        entry.items.forEach((it) => pushItem(it, entry.year));
      } else {
        pushItem(entry, entry?.year);
      }
    });
  } else if (debt.maturitySchedule && Array.isArray(debt.maturitySchedule.years)) {
    debt.maturitySchedule.years.forEach((entry) => {
      if (Array.isArray(entry?.items) && entry.items.length) {
        entry.items.forEach((it) => pushItem(it, entry.year));
      } else {
        pushItem(entry, entry?.year);
      }
    });
  }

  if (rawItems.length === 0 && Array.isArray(debt.maturityCalendar?.years)) {
    debt.maturityCalendar.years.forEach((entry) => pushItem({ ...entry, type: 'Deuda total' }));
  }

  const futureItems = rawItems.filter((it) => Number.isFinite(it.year) && it.year > maxYear && Number.isFinite(it.amount));
  const filtered = rawItems.filter((it) => Number.isFinite(it.year) && it.year >= minYear && it.year <= maxYear && Number.isFinite(it.amount) && it.amount > 0);
  if (filtered.length === 0) return null;

  const allRatedItems = rawItems.filter((it) => Number.isFinite(it.interestRate) && it.interestRate > 0);
  const allRatedAmount = allRatedItems.reduce((sum, it) => sum + it.amount, 0);
  const itemsAverageRate = allRatedAmount > 0 ? allRatedItems.reduce((sum, it) => sum + it.amount * it.interestRate, 0) / allRatedAmount : null;
  const itemsAverageRateEstimated = allRatedItems.some((it) => it.estimated === true);
  const snippetAverage = rateFromSecSnippet(debt.secSnippet);
  const fallbackRateRaw = parseSecNumber(debt.allDebtAverageRate);
  const fallbackRate = Number.isFinite(fallbackRateRaw) && fallbackRateRaw > 0 ? fallbackRateRaw : null;

  let totalAverageRate = null;
  let totalAverageRateEstimated = false;
  if (fallbackRate != null) {
    totalAverageRate = fallbackRate;
    totalAverageRateEstimated = debt.allDebtAverageRateEstimated !== false;
  } else if (snippetAverage && snippetAverage.amount > allRatedAmount) {
    totalAverageRate = snippetAverage.rate;
    totalAverageRateEstimated = snippetAverage.estimated === true;
  } else if (itemsAverageRate != null) {
    totalAverageRate = itemsAverageRate;
    totalAverageRateEstimated = itemsAverageRateEstimated;
  }

  const yearsMap = new Map();
  filtered.forEach((it) => {
    if (!yearsMap.has(it.year)) yearsMap.set(it.year, []);
    yearsMap.get(it.year).push(it);
  });

  const groupedYears = [];
  for (let yr = minYear; yr <= maxYear; yr += 1) {
    const items = (yearsMap.get(yr) ?? []).slice().sort((a, b) => b.amount - a.amount);
    items.forEach((it, index) => {
      const paletteItem = DEBT_STACK_PALETTE[index % DEBT_STACK_PALETTE.length];
      it.color = paletteItem.fill;
      it.textColor = paletteItem.text;
    });
    const totalAmount = items.reduce((sum, it) => sum + it.amount, 0);
    const ratedItems = items.filter((it) => Number.isFinite(it.interestRate) && it.interestRate > 0);
    const ratedAmount = ratedItems.reduce((sum, it) => sum + it.amount, 0);
    let averageRate = ratedAmount > 0 ? ratedItems.reduce((sum, it) => sum + it.amount * it.interestRate, 0) / ratedAmount : null;
    let averageRateEstimated = ratedItems.some((it) => it.estimated === true);
    if (averageRate == null && totalAverageRate != null && totalAmount > 0) {
      averageRate = totalAverageRate;
      averageRateEstimated = true;
    }
    groupedYears.push({ year: yr, totalAmount, averageRate, averageRateEstimated, items });
  }

  const totalAmount = filtered.reduce((sum, it) => sum + it.amount, 0);
  let afterYearFive = parseSecNumber(debt.maturityAfterFive ?? debt.maturityAfterFiveAmount);
  if (!Number.isFinite(afterYearFive) && futureItems.length) {
    afterYearFive = futureItems.reduce((sum, it) => sum + it.amount, 0);
  }

  return {
    title: t('CALENDARIO DE VENCIMIENTOS DE DEUDA ({from}–{to})', { from: minYear, to: maxYear }, lang),
    language: lang,
    baseYear,
    minYear,
    maxYear,
    years: groupedYears,
    totalAmount,
    totalAverageRate,
    totalAverageRateEstimated,
    afterYearFive: Number.isFinite(afterYearFive) ? afterYearFive : null,
    maxYearAmount: Math.max(...groupedYears.map((y) => y.totalAmount), 0),
    hasRates: allRatedAmount > 0 || snippetAverage != null || fallbackRate != null,
  };
}

/**
 * Convierte el modelo de calendario de vencimientos en una tabla detallada para exportación.
 * @param {object} chart - Modelo retornado por buildDebtMaturityModel.
 * @returns {object|null} Estructura tabular completa con resumen acumulado.
 */
export function buildDebtMaturityTable(chart) {
  if (!chart || !Array.isArray(chart.years) || !chart.years.length) return null;
  const lang = normalizeLanguage(chart.language);
  const num = (value, digits = 1) => {
    const fixed = Number(value).toFixed(digits);
    return lang === 'en' ? fixed : fixed.replace('.', ',');
  };
  const colYear = t('Año', null, lang);
  const colItem = t('Tipo / Emisión de Deuda', null, lang);
  const colAmount = t('Importe ($M)', null, lang);
  const colRate = t('Tipo Interés', null, lang);
  const colAvgRate = t('Tipo Medio Anual', null, lang);
  const headers = [
    cell(colYear, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell(colItem, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell(colAmount, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell(colRate, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell(colAvgRate, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
  ];
  const rows = [];
  chart.years.forEach((yr) => {
    if (!yr.items.length) {
      rows.push([
        cell(String(yr.year), { bold: true, color: COLORS.ink }),
        cell(t('Sin vencimientos', null, lang), { color: COLORS.muted }),
        cell(`$${num(0)}M`, { bold: true, color: COLORS.ink }),
        cell('—', { color: COLORS.muted }),
        cell('—', { color: COLORS.muted }),
      ]);
      return;
    }
    yr.items.forEach((it, idx) => {
      rows.push([
        cell(idx === 0 ? String(yr.year) : '', { bold: true, color: COLORS.ink }),
        cell(it.name, { color: COLORS.ink }),
        cell(`$${num(it.amount)}M`, { bold: true, color: COLORS.ink }),
        cell(it.interestRate != null
          ? `${it.estimated ? '~' : ''}${num(it.interestRate, 2)} %`
          : (yr.averageRate != null ? `~${num(yr.averageRate, 2)} %` : '—'),
          { bold: true, color: '#c2410c' }),
        cell(idx === 0 && yr.averageRate != null ? `${yr.averageRateEstimated ? '~' : ''}${num(yr.averageRate, 2)} %` : '', { bold: true, color: '#0369a1', bg: idx === 0 ? '#f0fdfa' : null }),
      ]);
    });
  });
  const summaryRow = [
    cell(t('TOTAL (PRÓXIMOS 5 AÑOS)', null, lang), { bold: true, color: COLORS.ink, bg: '#e0f2fe' }),
    cell(chart.afterYearFive != null ? t('Después del año 5: ${amount}M', { amount: num(chart.afterYearFive) }, lang) : '—', { color: COLORS.ink, bg: '#e0f2fe' }),
    cell(`$${num(chart.totalAmount)}M`, { bold: true, color: COLORS.ink, bg: '#e0f2fe' }),
    cell('—', { color: COLORS.ink, bg: '#e0f2fe' }),
    cell(chart.totalAverageRate != null
      ? t('{label}: {prefix}{rate} %', {
        label: chart.totalAverageRateEstimated ? t('Total medio estimado', null, lang) : t('Total medio', null, lang),
        prefix: chart.totalAverageRateEstimated ? '~' : '',
        rate: num(chart.totalAverageRate, 2),
      }, lang)
      : '—', { bold: true, color: '#0369a1', bg: '#e0f2fe' }),
  ];
  return { columns: [colYear, colItem, colAmount, colRate, colAvgRate], widths: [55, 170, 95, 95, 100], headers, rows: [...rows, summaryRow] };
}
