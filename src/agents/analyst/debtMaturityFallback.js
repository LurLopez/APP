/**
 * @fileoverview Fallback determinista del calendario de vencimientos cuando la IA no rellena
 * "maturityItems" y la nota de deuda está ordenada por año de vencimiento
 * ("Notes due 2019", "Notes due 2024-2047", "Other, due 2018-2026"...).
 * @module agents/analyst/debtMaturityFallback
 */

import { parseLooseAmount } from './financialParsers.js';

const YEAR_PATTERN = /(?:19|20)\d{2}/g;
const RATE_PATTERN = /(\d+(?:[.,]\d+)?)\s*%/g;
const YEAR_HEADER_PATTERN = /vencimiento|maturity|maturing|due|año|amortizacion|amortización/i;
const BUCKET_LABEL_PATTERN = /\b(?:less than|more than|greater than|or more|and beyond|en adelante|between|thereafter|posterior(?:es)?|despu[eé]s de|m[aá]s de|menos de|a partir de)\b|\b[1-5]\s*[-–—]\s*[1-5]\s*(?:years?|años?)\b/i;

/**
 * Detecta calendarios agregados por periodos en lugar de año a año por emisión:
 * rangos que pisan la ventana de 5 años ("due 2020-2021", "2022 – 2023"), etiquetas
 * "menos de 1 año", "1-3 years", "3-5 years", "más de 5 años", "2024 and beyond", etc.
 * @param {Array<object>} items - Partidas de vencimiento extraídas.
 * @param {string|number} [fiscalYear] - Año fiscal del informe.
 * @returns {boolean} true si alguna partida viene agregada por periodos.
 */
export function maturityItemsLookBucketed(items, fiscalYear) {
  if (!Array.isArray(items) || !items.length) return false;
  const baseYear = Number(fiscalYear);
  return items.some((item) => {
    const label = String(item?.label ?? item?.name ?? item?.type ?? '').trim();
    if (!label) return false;
    if (BUCKET_LABEL_PATTERN.test(label)) return true;
    const range = label.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const startsInWindow = !Number.isFinite(baseYear) || (start >= baseYear + 1 && start <= baseYear + 5);
      if (end - start >= 1 && startsInWindow) return true;
    }
    return false;
  });
}

/**
 * Decide si hay que recuperar/reemplazar el calendario de vencimientos: falta por completo
 * o viene agregado en rangos/periodos en lugar de año a año.
 * @param {Array<object>} items - "maturityItems" de la extracción.
 * @param {Array<object>} schedule - "maturitySchedule" de la extracción.
 * @param {string|number} [fiscalYear] - Año fiscal del informe.
 * @returns {boolean} true si procede reconstruirlo.
 */
export function shouldRecoverMaturitySchedule(items, schedule, fiscalYear) {
  const hasItems = Array.isArray(items) && items.length > 0;
  const hasSchedule = Array.isArray(schedule) && schedule.length > 0;
  if (!hasItems && !hasSchedule) return true;
  if (hasItems) return maturityItemsLookBucketed(items, fiscalYear);
  return maturityItemsLookBucketed(schedule, fiscalYear);
}

function rowCells(row) {
  return Array.isArray(row) ? row.map((c) => String(c ?? '')) : [String(row?.metric ?? row?.name ?? ''), String(row?.value ?? '')];
}

function findBalanceIndex(headers) {
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
  return balanceIdx >= 0 ? balanceIdx : (headers.length >= 2 ? headers.length - 1 : 1);
}

function extractYears(text) {
  return [...new Set([...String(text ?? '').matchAll(YEAR_PATTERN)].map((match) => Number(match[0])))];
}

function rateFromText(text) {
  const rates = [...String(text ?? '').matchAll(RATE_PATTERN)]
    .map((match) => Number(String(match[1]).replace(',', '.')))
    .filter((rate) => Number.isFinite(rate) && rate > 0);
  if (!rates.length) return null;
  if (rates.length === 1) return { rate: rates[0], estimated: false };
  const average = (Math.min(...rates) + Math.max(...rates)) / 2;
  return { rate: Math.round(average * 100) / 100, estimated: true };
}

function extractRate(cells, rateIndexes = []) {
  const textRate = rateFromText(cells.join(' '));
  if (textRate) return textRate;
  if (Array.isArray(rateIndexes) && rateIndexes.length) {
    for (const idx of rateIndexes) {
      const parsed = parseLooseAmount(cells[idx]);
      if (Number.isFinite(parsed) && parsed > 0 && parsed < 40) {
        return { rate: Math.round(parsed * 100) / 100, estimated: false };
      }
    }
  }
  return null;
}

function maturityType(label) {
  if (/note|notas|bono|bond|senior/i.test(label)) return 'Senior Notes';
  if (/commercial paper|pagar[eé]s/i.test(label)) return 'Commercial Paper';
  if (/term loan|pr[eé]stamo/i.test(label)) return 'Term Loan';
  return 'Deuda total';
}

/**
 * Convierte la tabla de la nota de deuda (filas ordenadas por año de vencimiento) en un calendario.
 * @param {object} table - Extracto SEC con headers y rows de la nota de deuda.
 * @param {string|number} fiscalYear - Año fiscal del informe.
 * @returns {{items: Array<object>, afterYearFive: number|null}|null} Calendario o null si no se puede derivar.
 */
export function buildMaturityScheduleFromDebtTable(table, fiscalYear) {
  if (!table || !Array.isArray(table.rows) || !table.rows.length) return null;
  const baseYear = Number(fiscalYear);
  if (!Number.isFinite(baseYear) || baseYear < 2000) return null;
  const minYear = baseYear + 1;
  const maxYear = baseYear + 5;

  const headers = Array.isArray(table.headers) ? table.headers : [];
  const balanceIdx = findBalanceIndex(headers);
  const yearIndexes = headers
    .map((header, index) => (YEAR_HEADER_PATTERN.test(String(header)) ? index : -1))
    .filter((index) => index >= 0 && index !== balanceIdx);
  const rateIndexes = headers
    .map((header, index) => (/rate|cup[oó]n|interest|tipo|cupon/i.test(String(header)) ? index : -1))
    .filter((index) => index >= 0 && index !== balanceIdx);

  const items = [];
  let afterYearFive = null;

  table.rows.forEach((row) => {
    const cells = rowCells(row);
    const label = cells[0].trim();
    if (!label) return;
    const years = extractYears([cells[0], ...yearIndexes.map((index) => cells[index])].join(' '));
    const isThereafter = /thereafter|posterior|despu[eé]s|beyond|later|remaining/i.test(label);
    if (!years.length) {
      if (isThereafter) {
        const amount = parseLooseAmount(cells[balanceIdx]);
        if (Number.isFinite(amount) && amount > 0) {
          afterYearFive = (afterYearFive ?? 0) + amount;
        }
      }
      return;
    }
    const amount = parseLooseAmount(cells[balanceIdx]);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const firstYear = Math.min(...years);
    if (firstYear > maxYear) {
      afterYearFive = (afterYearFive ?? 0) + amount;
      return;
    }
    if (firstYear < minYear) return;

    const rateData = extractRate(cells, rateIndexes);
    items.push({
      year: firstYear,
      label,
      amount,
      rate: rateData?.rate ?? null,
      estimated: rateData?.estimated === true,
      type: maturityType(label),
    });
  });

  if (!items.length) return null;
  return { items, afterYearFive };
}

/**
 * Normaliza una lista de partidas de vencimiento (de la IA o de otra fuente) a un calendario.
 * @param {Array<object>} rawItems - Partidas con year/label/amount/rate opcionales.
 * @param {string|number} fiscalYear - Año fiscal del informe.
 * @returns {{items: Array<object>, afterYearFive: number|null}|null} Calendario o null.
 */
export function normalizeMaturityItems(rawItems, fiscalYear) {
  if (!Array.isArray(rawItems) || !rawItems.length) return null;
  const baseYear = Number(fiscalYear);
  if (!Number.isFinite(baseYear) || baseYear < 2000) return null;
  const minYear = baseYear + 1;
  const maxYear = baseYear + 5;

  const items = [];
  let afterYearFive = null;

  rawItems.forEach((raw) => {
    const label = String(raw?.label ?? raw?.name ?? raw?.type ?? '').trim();
    const years = extractYears([raw?.year, label].join(' '));
    const amount = parseLooseAmount(raw?.amount ?? raw?.totalAmount ?? raw?.value);
    if (!Number.isFinite(amount) || amount <= 0) return;

    if (!years.length) {
      if (/thereafter|posterior|despu[eé]s|beyond|later|remaining/i.test(label) || /thereafter/i.test(String(raw?.year))) {
        afterYearFive = (afterYearFive ?? 0) + amount;
      }
      return;
    }

    const firstYear = Math.min(...years);
    if (firstYear > maxYear) {
      afterYearFive = (afterYearFive ?? 0) + amount;
      return;
    }
    if (firstYear < minYear) return;

    const labelRates = [...label.matchAll(RATE_PATTERN)]
      .map((match) => Number(String(match[1]).replace(',', '.')))
      .filter((rate) => Number.isFinite(rate) && rate > 0);
    const rateData = (labelRates.length < 2 && (raw?.rate != null || raw?.interestRate != null))
      ? { rate: parseLooseAmount(raw?.rate ?? raw?.interestRate), estimated: raw?.estimated === true }
      : rateFromText(label);
    items.push({
      year: firstYear,
      label: label || 'Deuda',
      amount,
      rate: Number.isFinite(rateData?.rate) && rateData.rate > 0 ? rateData.rate : null,
      estimated: rateData?.estimated === true,
      type: raw?.type || maturityType(label),
    });
  });

  if (!items.length) return null;
  return { items, afterYearFive };
}

/**
 * Normaliza la respuesta completa de la pasada focalizada de IA ({ items, afterYearFive }).
 * @param {object} payload - Respuesta JSON del modelo.
 * @param {string|number} fiscalYear - Año fiscal del informe.
 * @returns {{items: Array<object>, afterYearFive: number|null}|null} Calendario o null.
 */
export function normalizeMaturityPayload(payload, fiscalYear) {
  if (!payload || typeof payload !== 'object') return null;
  const result = normalizeMaturityItems(payload.items, fiscalYear);
  if (!result) return null;
  const explicitAfter = parseLooseAmount(payload.afterYearFive);
  if (Number.isFinite(explicitAfter) && explicitAfter > 0 && result.afterYearFive == null) {
    result.afterYearFive = explicitAfter;
  }
  return result;
}
