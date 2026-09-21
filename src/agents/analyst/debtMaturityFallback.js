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
const MATURITY_TABLE_HEADING = /maturit(?:y|ies)\s+of\s+(?:our\s+|the\s+company'?s\s+)?(?:long[-\s]?term\s+)?debt\b/i;
const MATURITY_TABLE_SUMMARY_HEADING = /(?:summari[sz]es|sets?\s+forth|presents|details)[^.\n]*\bmaturit(?:y|ies)\b[^.\n]*\b(?:long[-\s]?term\s+)?debt\b/i;
const MATURITY_TABLE_EXCLUDED = /lease|securit|investment|available-for-sale|portfolio|operating/i;
const MATURITY_TABLE_YEAR_ROW = /^((?:19|20)\d{2})\s*(?:[$\u20ac\u00a3]\s*)?([\d][\d,]*(?:\.\d+)?)\s*$/;
const MATURITY_TABLE_THEREAFTER_ROW = /^thereafter\s*(?:[$\u20ac\u00a3]\s*)?([\d][\d,]*(?:\.\d+)?)\s*$/i;

/**
 * Ventana de los próximos 5 años del calendario de vencimientos.
 * Si el ejercicio cierra en diciembre, la ventana empieza en el año siguiente;
 * si cierra en otro mes, parte del año de cierre aún es futuro y cuenta como primer año
 * (ej. cierre 31-may-2026 -> ventana 2026-2030, con los vencimientos de octubre de 2026 dentro).
 * @param {string|number} fiscalYear - Año fiscal del informe.
 * @param {string} [periodEnd] - Fecha de cierre en formato AAAA-MM-DD.
 * @returns {{minYear: number, maxYear: number}|null} Límites de la ventana o null.
 */
export function maturityWindowBounds(fiscalYear, periodEnd) {
  const baseYear = Number(fiscalYear);
  if (!Number.isFinite(baseYear) || baseYear < 2000) return null;
  const month = Number(String(periodEnd ?? '').slice(5, 7));
  const minYear = Number.isFinite(month) && month >= 1 && month <= 11 ? baseYear : baseYear + 1;
  return { minYear, maxYear: minYear + 4 };
}

function resolveWindow(fiscalYear, periodEnd) {
  return maturityWindowBounds(fiscalYear, periodEnd) ?? { minYear: Number(fiscalYear) + 1, maxYear: Number(fiscalYear) + 5 };
}

/**
 * Detecta calendarios agregados por periodos en lugar de año a año por emisión:
 * rangos que pisan la ventana de 5 años ("due 2020-2021", "2022 – 2023"), etiquetas
 * "menos de 1 año", "1-3 years", "3-5 years", "más de 5 años", "2024 and beyond", etc.
 * @param {Array<object>} items - Partidas de vencimiento extraídas.
 * @param {string|number} [fiscalYear] - Año fiscal del informe.
 * @param {string} [periodEnd] - Fecha de cierre en formato AAAA-MM-DD.
 * @returns {boolean} true si alguna partida viene agregada por periodos.
 */
export function maturityItemsLookBucketed(items, fiscalYear, periodEnd) {
  if (!Array.isArray(items) || !items.length) return false;
  const window = resolveWindow(fiscalYear, periodEnd);
  const baseYear = Number(fiscalYear);
  return items.some((item) => {
    const label = String(item?.label ?? item?.name ?? item?.type ?? '').trim();
    if (!label) return false;
    if (BUCKET_LABEL_PATTERN.test(label)) return true;
    const range = label.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const startsInWindow = !Number.isFinite(baseYear) || (start >= window.minYear && start <= window.maxYear);
      if (end - start >= 1 && startsInWindow) return true;
    }
    return false;
  });
}

/**
 * Detecta tablas de deuda que la extracción ha resumido (p. ej. una fila "Otras notas / Varios"
 * con un importe grande sin año de vencimiento): señal de que el calendario está incompleto.
 * @param {object} table - Extracto SEC con headers y rows de la nota de deuda.
 * @returns {boolean} true si hay importes materiales sin año de vencimiento.
 */
export function maturityTableLooksIncomplete(table) {
  if (!table || !Array.isArray(table.rows) || !table.rows.length) return false;
  const headers = Array.isArray(table.headers) ? table.headers : [];
  const balanceIdx = findBalanceIndex(headers);
  const AGGREGATE_LABEL = /total|subtotal|unamortized|discount|issuance cost|current|less|face value|menos|amortiz|short-term|long-term|obligations|commercial paper|borrowings|pr[eé]stamos/i;
  let total = 0;
  let unmapped = 0;
  table.rows.forEach((row) => {
    const cells = rowCells(row);
    const label = cells[0].trim();
    if (!label) return;
    const amount = parseLooseAmount(cells[balanceIdx]);
    if (!Number.isFinite(amount) || amount <= 0) return;
    total += amount;
    if (AGGREGATE_LABEL.test(label)) return;
    if (/rate|cup[oó]n|interest|tipo/i.test(cells.join(' '))) return;
    if (!extractYears([cells[0], ...cells.slice(1)].join(' ')).length) unmapped += amount;
  });
  return total > 0 && unmapped / total >= 0.25;
}

/**
 * Detecta etiquetas con rangos de años amplios (p. ej. "due 2024-2093", "2024-2041"), que
 * agrupan emisiones de muchos ejercicios y no son un vencimiento anual concreto.
 * @param {Array<object>} items - Partidas de vencimiento.
 * @returns {boolean} true si alguna etiqueta abarca 5 años o más.
 */
export function hasWideRangeLabels(items) {
  return (Array.isArray(items) ? items : []).some((item) => {
    const label = String(item?.label ?? item?.name ?? item?.type ?? '');
    for (const match of label.matchAll(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/g)) {
      if (Number(match[2]) - Number(match[1]) >= 5) return true;
    }
    return false;
  });
}

/**
 * Decide si hay que recuperar/reemplazar el calendario de vencimientos: falta por completo,
 * viene agregado en rangos/periodos en lugar de año a año, o la tabla de deuda está resumida.
 * @param {Array<object>} items - "maturityItems" de la extracción.
 * @param {Array<object>} schedule - "maturitySchedule" de la extracción.
 * @param {string|number} [fiscalYear] - Año fiscal del informe.
 * @param {string} [periodEnd] - Fecha de cierre en formato AAAA-MM-DD.
 * @returns {boolean} true si procede reconstruirlo.
 */
export function shouldRecoverMaturitySchedule(items, schedule, fiscalYear, periodEnd) {
  const hasItems = Array.isArray(items) && items.length > 0;
  const hasSchedule = Array.isArray(schedule) && schedule.length > 0;
  if (!hasItems && !hasSchedule) return true;
  if (hasItems) return maturityItemsLookBucketed(items, fiscalYear, periodEnd);
  return maturityItemsLookBucketed(schedule, fiscalYear, periodEnd);
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
 * @param {string} [periodEnd] - Fecha de cierre en formato AAAA-MM-DD.
 * @returns {{items: Array<object>, afterYearFive: number|null}|null} Calendario o null si no se puede derivar.
 */
export function buildMaturityScheduleFromDebtTable(table, fiscalYear, periodEnd) {
  if (!table || !Array.isArray(table.rows) || !table.rows.length) return null;
  const baseYear = Number(fiscalYear);
  if (!Number.isFinite(baseYear) || baseYear < 2000) return null;
  const { minYear, maxYear } = resolveWindow(fiscalYear, periodEnd);

  const headers = Array.isArray(table.headers) ? table.headers : [];
  const balanceIdx = findBalanceIndex(headers);
  const yearIndexes = headers
    .map((header, index) => (YEAR_HEADER_PATTERN.test(String(header)) ? index : -1))
    .filter((index) => index >= 0 && index !== balanceIdx);
  const rateIndexes = headers
    .map((header, index) => (/rate|cup[oó]n|interest|tipo|cupon/i.test(String(header)) ? index : -1))
    .filter((index) => index >= 0 && index !== balanceIdx);

  const items = [];
  const ratedItems = [];
  let afterYearFive = null;
  let skippedRangeAmount = 0;

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
    const lastYear = Math.max(...years);
    if (firstYear > maxYear) {
      afterYearFive = (afterYearFive ?? 0) + amount;
      const rateData = extractRate(cells, rateIndexes);
      ratedItems.push({ amount, rate: rateData?.rate ?? null, estimated: rateData?.estimated === true });
      return;
    }
    // Una fila con rango de años ("U.S. dollar notes due 2024-2093", "Euro notes due 2024-2041")
    // agrupa emisiones de varios ejercicios: no es un vencimiento de un único año y asignarla
    // al primer año inflaría ese ejercicio (caso KO 10-K). Se descarta como partida anual.
    if (lastYear > firstYear) {
      skippedRangeAmount += amount;
      return;
    }
    if (firstYear < minYear) return;

    const rateData = extractRate(cells, rateIndexes);
    const item = {
      year: firstYear,
      label,
      amount,
      rate: rateData?.rate ?? null,
      estimated: rateData?.estimated === true,
      type: maturityType(label),
    };
    ratedItems.push(item);
    items.push(item);
  });

  if (!items.length) return null;
  // Si lo descartado por rangos supera lo aprovechable, la tabla no es un calendario año a año.
  const keptAmount = items.reduce((sum, item) => sum + item.amount, 0);
  if (skippedRangeAmount > keptAmount) return null;
  return {
    items,
    afterYearFive: afterYearFive == null ? null : Math.round(afterYearFive * 10) / 10,
    weightedAverageRate: weightedAverageRateFromItems(ratedItems),
  };
}

/**
 * Calcula el tipo medio ponderado por saldo de las partidas de vencimiento con cupón conocido.
 * @param {Array<object>} items - Partidas con amount y rate.
 * @returns {{rate: number, estimated: boolean}|null} Tipo medio o null si no hay datos.
 */
export function weightedAverageRateFromItems(items) {
  let total = 0;
  let weighted = 0;
  let estimated = false;
  (Array.isArray(items) ? items : []).forEach((item) => {
    const amount = parseLooseAmount(item?.amount ?? item?.totalAmount ?? item?.value);
    const rate = Number(item?.rate ?? item?.interestRate);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0) return;
    total += amount;
    weighted += amount * rate;
    if (item?.estimated === true) estimated = true;
  });
  if (total <= 0) return null;
  return { rate: Math.round((weighted / total) * 100) / 100, estimated };
}

/**
 * Suma los importes positivos de una lista de partidas de vencimiento.
 * @param {Array<object>} items - Partidas con amount.
 * @returns {number} Importe total.
 */
export function sumMaturityAmounts(items) {
  return (Array.isArray(items) ? items : []).reduce((acc, item) => {
    const amount = parseLooseAmount(item?.amount ?? item?.totalAmount ?? item?.value);
    return acc + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
}

/**
 * Normaliza una lista de partidas de vencimiento (de la IA o de otra fuente) a un calendario.
 * @param {Array<object>} rawItems - Partidas con year/label/amount/rate opcionales.
 * @param {string|number} fiscalYear - Año fiscal del informe.
 * @param {string} [periodEnd] - Fecha de cierre en formato AAAA-MM-DD.
 * @returns {{items: Array<object>, afterYearFive: number|null}|null} Calendario o null.
 */
export function normalizeMaturityItems(rawItems, fiscalYear, periodEnd) {
  if (!Array.isArray(rawItems) || !rawItems.length) return null;
  const baseYear = Number(fiscalYear);
  if (!Number.isFinite(baseYear) || baseYear < 2000) return null;
  const { minYear, maxYear } = resolveWindow(fiscalYear, periodEnd);

  const items = [];
  const ratedItems = [];
  let afterYearFive = null;

  rawItems.forEach((raw) => {
    const label = String(raw?.label ?? raw?.name ?? raw?.type ?? '').trim();
    const years = extractYears([raw?.year, label].join(' '));
    const amount = parseLooseAmount(raw?.amount ?? raw?.totalAmount ?? raw?.value);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const labelRates = [...label.matchAll(RATE_PATTERN)]
      .map((match) => Number(String(match[1]).replace(',', '.')))
      .filter((rate) => Number.isFinite(rate) && rate > 0);
    const rateData = (labelRates.length < 2 && (raw?.rate != null || raw?.interestRate != null))
      ? { rate: parseLooseAmount(raw?.rate ?? raw?.interestRate), estimated: raw?.estimated === true }
      : rateFromText(label);
    const rate = Number.isFinite(rateData?.rate) && rateData.rate > 0 ? rateData.rate : null;
    const estimated = rateData?.estimated === true;

    if (!years.length) {
      if (/thereafter|posterior|despu[eé]s|beyond|later|remaining/i.test(label) || /thereafter/i.test(String(raw?.year))) {
        afterYearFive = (afterYearFive ?? 0) + amount;
        ratedItems.push({ amount, rate, estimated });
      }
      return;
    }

    const firstYear = Math.min(...years);
    if (firstYear > maxYear) {
      afterYearFive = (afterYearFive ?? 0) + amount;
      ratedItems.push({ amount, rate, estimated });
      return;
    }
    if (firstYear < minYear) return;

    const item = {
      year: firstYear,
      label: label || 'Deuda',
      amount,
      rate,
      estimated,
      type: raw?.type || maturityType(label),
    };
    ratedItems.push(item);
    items.push(item);
  });

  if (!items.length) return null;
  return {
    items,
    afterYearFive: afterYearFive == null ? null : Math.round(afterYearFive * 10) / 10,
    weightedAverageRate: weightedAverageRateFromItems(ratedItems),
  };
}

/**
 * Normaliza la respuesta completa de la pasada focalizada de IA ({ items, afterYearFive }).
 * @param {object} payload - Respuesta JSON del modelo.
 * @param {string|number} fiscalYear - Año fiscal del informe.
 * @returns {{items: Array<object>, afterYearFive: number|null}|null} Calendario o null.
 */
export function normalizeMaturityPayload(payload, fiscalYear, periodEnd) {
  if (!payload || typeof payload !== 'object') return null;
  const result = normalizeMaturityItems(payload.items, fiscalYear, periodEnd);
  if (!result) return null;
  const explicitAfter = parseLooseAmount(payload.afterYearFive);
  if (Number.isFinite(explicitAfter) && explicitAfter > 0 && result.afterYearFive == null) {
    result.afterYearFive = explicitAfter;
  }
  return result;
}

const TEXT_DEBT_KEYWORD = /note|senior|debt|loan|bond|borrow|paper|lease|maturit|obligation|nota|deuda|pr[eé]stamo|bono|arrendamiento/i;
const TEXT_AGGREGATE_LABEL = /total|subtotal|less|current|unamortized|discount|issuance cost|face value|menos|amortiz/i;
const TEXT_INDEX_LINE = /8-k|exhibit|form of|incorporated by reference|table of contents|^\s*\d+(?:\.\d+)*\s/i;

function amountAfterPosition(text) {
  const match = String(text).match(/^\s*(?:\([^)]*\)\s*)?\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/);
  if (!match) return NaN;
  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0) return NaN;
  // Un número de 4 cifras sin separadores es un año (índice de exhibits, narrativa), no un importe.
  if (!match[1].includes(',') && !match[1].includes('.') && value >= 1900 && value <= 2100) return NaN;
  return value;
}

const MONTH_DATE_PATTERN = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*((?:19|20)\d{2})\b/gi;
const DATED_DEBT_LABEL = /note|debenture|bond|loan|obligation|borrowing|mortgage/i;
const DATED_EXCLUDED_LABEL = /revolving|credit\s+agreement|line\s+of\s+credit|letter(?:s)?\s+of\s+credit|commercial\s+paper|commitment/i;
const DATED_INDEX_CONTEXT = /exhibit\s+index|incorporated\s+by\s+reference|table\s+of\s+contents|8-k\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i;

function decodeTextEntities(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/gi, ' ');
}

/**
 * Reconstruye el nombre del instrumento que precede a una fecha de vencimiento
 * ("2026-B Notes", "2028 Merger Notes", "Revolving Credit Agreement (1)").
 */
function labelBeforeDatedMaturity(source, index) {
  const tokens = source.slice(Math.max(0, index - 160), index).split(/\s+/).filter(Boolean);
  const picked = [];
  for (let idx = tokens.length - 1; idx >= 0 && picked.length < 6; idx -= 1) {
    const token = tokens[idx];
    if (/^\(\d+\)$/.test(token)) { picked.unshift(token); continue; }
    if (/[A-Za-z]/.test(token)) { picked.unshift(token); continue; }
    if (picked.length === 0) continue;
    break;
  }
  return picked.filter((token) => !/^\(\d+\)$/.test(token)).join(' ');
}

/**
 * Lee el cupón y el importe de la columna del ejercicio actual tras la fecha de vencimiento.
 * Exige una segunda celda (importe o guion de la columna anterior) para descartar fechas
 * narrativas ("€ 10.35 billion") que no son filas de una tabla de deuda.
 */
function datedMaturityTail(source, index) {
  const tokens = source.slice(index, index + 200).split(/\s+/).filter(Boolean);
  let rate = null;
  let amount = null;
  let amountIndex = -1;
  for (let idx = 0; idx < tokens.length && idx < 14; idx += 1) {
    const token = tokens[idx];
    if (/^\(\d+\)$/.test(token)) continue;
    if (/^(?:floating|compounded|sofr|plus|spread|of|and|at|per|annum|interest|million|billion|millones|billones)$/i.test(token)) continue;
    // No seguir leyendo tras la fecha siguiente ("... 2030 and $500M ... due August 1, 2035"):
    // la columna del ejercicio es la primera celda tras la fecha, no la del tramo siguiente.
    if (/^(?:january|february|march|april|may|june|july|august|september|october|november|december)$/i.test(token)) break;
    const clean = token.replace(/[%$€£,]/g, '');
    const numeric = clean === '' ? NaN : Number(clean);
    const followedByPercent = tokens[idx + 1] === '%';
    if (Number.isFinite(numeric) && (/%$/.test(token) || followedByPercent)) {
      if (rate == null) rate = numeric;
      continue;
    }
    if (token === '$' || token === '€' || token === '£') continue;
    if (/^[–—-]$/.test(token)) { amount = 0; amountIndex = idx; break; }
    if (/^[$€£]?[\d][\d,]*(?:\.\d+)?$/.test(token)) { amount = Number(clean); amountIndex = idx; break; }
  }
  if (amount == null || amountIndex < 0) return { amount, rate };
  const secondCell = tokens.slice(amountIndex + 1, amountIndex + 4)
    .some((token) => /^[–—-]$/.test(token) || /^[$€£]?[\d][\d,]*(?:\.\d+)?$/.test(token));
  return { amount: secondCell ? amount : null, rate };
}

/**
 * Parser de tablas de deuda con columna "Maturity Date" ("2026 Notes September 15, 2026 2.550 % 400 400"):
 * toma el año de la fecha de vencimiento, el cupón y el importe del ejercicio actual de cada emisión.
 * Cubre las notas que no usan el formato "due 20XX" (p. ej. KDP 10-K FY2025).
 * @param {string} source - Texto de la nota de deuda.
 * @returns {Array<object>} Filas con year, label, amount y rate.
 */
function parseDatedMaturityRows(source) {
  const rows = [];
  for (const match of source.matchAll(MONTH_DATE_PATTERN)) {
    const before = source.slice(Math.max(0, match.index - 250), match.index);
    if (DATED_INDEX_CONTEXT.test(before)) continue;
    const label = labelBeforeDatedMaturity(source, match.index);
    if (!label || !DATED_DEBT_LABEL.test(label) || DATED_EXCLUDED_LABEL.test(label)) continue;
    // Una etiqueta que termina en conector ("senior unsecured notes due August 1, 2030") es
    // una mención narrativa, no una fila de la tabla de vencimientos.
    if (/(?:^|\s)(?:due|on|in|of|through|thru|until|maturing|payable|issued|dated|amended)$/i.test(label)) continue;
    const { amount, rate } = datedMaturityTail(source, match.index + match[0].length);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    rows.push({ year: Number(match[2]), dateText: match[0], label, amount, rate });
  }
  return rows;
}

const MONTH_YEAR_PATTERN = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+((?:19|20)\d{2})\b/gi;

/**
 * Parser de tablas de deuda por emisión con columnas "Issuance Date" / "Due Date" en formato
 * mes y año, sin día ("1.90% 2025 Notes February 2020 February 2025 2.07% $ — $ 500",
 * "2.15% 2027 Notes February 2020 February 2027 2.26% 850 850"). Cubre notas que listan cada
 * tramo con su cupón (efectivo) y los saldos del ejercicio actual y anterior (p. ej. Adobe 10-K).
 * Toma el año de la fecha de vencimiento (la última del tramo) y el importe de la columna del
 * ejercicio actual: si el saldo actual es un guion ("—") el tramo ya se amortizó y no es un
 * vencimiento futuro.
 * @param {string} source - Texto de la nota de deuda.
 * @returns {Array<object>} Filas con year, label, amount y rate.
 */
function parseMonthYearMaturityRows(source) {
  const rows = [];
  for (const line of String(source ?? '').split(/\r?\n/)) {
    const text = line.replace(/\s+/g, ' ').trim();
    if (!text || text.length > 300 || TEXT_INDEX_LINE.test(text)) continue;
    // Las filas "due <mes> <año>" ya las procesa el parser de líneas: aquí se evitan para no duplicarlas.
    if (/\bdue\s+(?:on\s+)?(?:[A-Za-z]+\s+)?(?:19|20)\d{2}\b/i.test(text)) continue;
    if (/\b(?:through|thru|until)\s+(?:19|20)\d{2}\b/i.test(text)) continue;
    const dates = [...text.matchAll(MONTH_YEAR_PATTERN)];
    if (!dates.length) continue;
    const label = text.slice(0, dates[0].index).trim();
    if (!label || !DATED_DEBT_LABEL.test(label) || DATED_EXCLUDED_LABEL.test(label)) continue;
    if (TEXT_AGGREGATE_LABEL.test(label)) continue;
    const due = dates[dates.length - 1];
    const dueYear = Number(due[2]);
    if (!Number.isFinite(dueYear)) continue;
    const { amount, rate } = datedMaturityTail(text, due.index + due[0].length);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const labelRate = rateFromText(label);
    rows.push({
      year: dueYear,
      dateText: due[0],
      label,
      amount,
      rate: labelRate?.rate ?? rate ?? null,
      estimated: labelRate?.estimated === true,
    });
  }
  return rows;
}

/**
 * Localiza la tabla explícita "maturities of long-term debt" (año → importe) que muchas
 * notas publican tras un encabezado del tipo "The following table summarizes the maturities
 * of long-term debt for the five years succeeding ...". Es la fuente canónica del calendario:
 * evita asignar al primer año los agregados por rango ("U.S. dollar notes due 2024-2093").
 * @param {string} source - Texto de la nota de deuda.
 * @returns {{rows: Array<{year: number, amount: number}>, afterYearFive: number|null}|null}
 */
function parseMaturityTableFromText(source) {
  const lines = String(source ?? '').split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim());
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || !/maturit/i.test(line) || !/debt/i.test(line) || MATURITY_TABLE_EXCLUDED.test(line)) continue;
    if (!MATURITY_TABLE_HEADING.test(line) && !MATURITY_TABLE_SUMMARY_HEADING.test(line)) continue;

    const rows = [];
    let afterYearFive = null;
    let sawRow = false;
    let misses = 0;
    for (let next = index + 1; next < lines.length && next <= index + 30; next += 1) {
      const candidate = lines[next];
      if (!candidate) {
        if (sawRow) { misses += 1; if (misses > 2) break; }
        continue;
      }
      const yearMatch = candidate.match(MATURITY_TABLE_YEAR_ROW);
      if (yearMatch) {
        const year = Number(yearMatch[1]);
        const amount = Number(yearMatch[2].replace(/,/g, ''));
        if (Number.isFinite(year) && Number.isFinite(amount) && amount > 0) {
          rows.push({ year, amount });
          sawRow = true;
          misses = 0;
        }
        continue;
      }
      const thereafterMatch = candidate.match(MATURITY_TABLE_THEREAFTER_ROW);
      if (thereafterMatch && sawRow) {
        const amount = Number(thereafterMatch[1].replace(/,/g, ''));
        if (Number.isFinite(amount) && amount > 0) afterYearFive = (afterYearFive ?? 0) + amount;
        continue;
      }
      if (sawRow) {
        misses += 1;
        if (misses > 2) break;
      } else if (next - index > 8) {
        break;
      }
    }

    const ascending = rows.every((row, idx) => idx === 0 || row.year > rows[idx - 1].year);
    if (rows.length >= 3 && ascending) return { rows, afterYearFive };
  }
  return null;
}

/**
 * Parser determinista del calendario sobre el texto de la nota de deuda:
 * localiza las filas "due <mes> <año>", "due <año>" o "through <año>" y toma el primer
 * importe posterior al año. Evita que el calendario dependa solo de la IA.
 * @param {string} text - Texto de la nota de deuda (p. ej. salida de extractDebtFilingText).
 * @param {string|number} fiscalYear - Año fiscal del informe.
 * @param {string} [periodEnd] - Fecha de cierre en formato AAAA-MM-DD.
 * @returns {{items: Array<object>, afterYearFive: number|null, weightedAverageRate: object|null}|null} Calendario o null.
 */
export function buildMaturityScheduleFromFilingText(text, fiscalYear, periodEnd) {
  const source = decodeTextEntities(text).replace(/\u00a0/g, ' ');
  if (!source) return null;
  const baseYear = Number(fiscalYear);
  if (!Number.isFinite(baseYear) || baseYear < 2000) return null;
  const { minYear, maxYear } = resolveWindow(fiscalYear, periodEnd);

  // Tabla explícita año a año ("maturities of long-term debt"): manda sobre las filas de rango.
  const maturityTable = parseMaturityTableFromText(source);
  if (maturityTable) {
    const tableItems = [];
    let tableAfterYearFive = maturityTable.afterYearFive;
    maturityTable.rows.forEach((row) => {
      if (row.year < minYear) return;
      if (row.year > maxYear) {
        tableAfterYearFive = (tableAfterYearFive ?? 0) + row.amount;
        return;
      }
      tableItems.push({
        year: row.year,
        label: 'Maturities of long-term debt',
        amount: row.amount,
        rate: null,
        estimated: false,
        type: 'Deuda total',
      });
    });
    if (tableItems.length) {
      return {
        items: tableItems,
        afterYearFive: tableAfterYearFive == null ? null : Math.round(tableAfterYearFive * 10) / 10,
        weightedAverageRate: null,
        authoritative: true,
      };
    }
  }

  const items = [];
  const ratedItems = [];
  const seen = new Set();
  let afterYearFive = null;

  // Une las filas partidas por el salto de línea del PDF ("... due on various dates through" + "2043 240.4").
  const rawLines = source.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim());
  const lines = [];
  for (let idx = 0; idx < rawLines.length; idx += 1) {
    let line = rawLines[idx];
    if (!line) continue;
    while (idx + 1 < rawLines.length && /\b(?:due|through|thru|until|maturing(?:\s+in)?|on)\s*$/i.test(line)) {
      idx += 1;
      line = `${line} ${rawLines[idx]}`.trim();
    }
    lines.push(line);
  }

  lines.forEach((line) => {
    if (!line || line.length > 300) return;
    if (TEXT_INDEX_LINE.test(line)) return;
    if (!TEXT_DEBT_KEYWORD.test(line)) return;
    const match = line.match(/\bdue\s+(?:on\s+)?(?:([A-Za-z]+)\s+)?((?:19|20)\d{2})\b/i)
      || line.match(/\b(?:through|thru|until)\s+((?:19|20)\d{2})\b/i);
    if (!match) return;
    const year = Number(match[2] ?? match[1]);
    if (!Number.isFinite(year)) return;
    const label = line.slice(0, match.index + match[0].length).trim();
    if (TEXT_AGGREGATE_LABEL.test(label)) return;
    const amount = amountAfterPosition(line.slice(match.index + match[0].length));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const key = `${year}|${label}|${amount}`;
    if (seen.has(key)) return;
    seen.add(key);
    const rateData = rateFromText(label);
    const item = {
      year,
      label: line,
      amount,
      rate: rateData?.rate ?? null,
      estimated: rateData?.estimated === true,
      type: maturityType(line),
    };
    if (year > maxYear) {
      afterYearFive = (afterYearFive ?? 0) + amount;
      ratedItems.push(item);
      return;
    }
    if (year < minYear) return;
    ratedItems.push(item);
    items.push(item);
  });

  // Tablas con columna "Maturity Date" (cada emisión con su fecha), que no usan "due 20XX".
  parseDatedMaturityRows(source).forEach((row) => {
    const key = `${row.dateText}|${row.label}|${row.amount}`;
    if (seen.has(key)) return;
    seen.add(key);
    const item = {
      year: row.year,
      label: `${row.label} ${row.dateText}`.trim(),
      amount: row.amount,
      rate: row.rate ?? null,
      estimated: false,
      type: maturityType(row.label),
    };
    if (row.year < minYear) return;
    if (row.year > maxYear) {
      afterYearFive = (afterYearFive ?? 0) + row.amount;
      ratedItems.push(item);
      return;
    }
    ratedItems.push(item);
    items.push(item);
  });

  // Tablas por emisión con "Issuance Date" / "Due Date" en mes y año (sin día), p. ej. Adobe 10-K.
  parseMonthYearMaturityRows(source).forEach((row) => {
    const key = `${row.dateText}|${row.label}|${row.amount}`;
    if (seen.has(key)) return;
    seen.add(key);
    const item = {
      year: row.year,
      label: `${row.label} ${row.dateText}`.trim(),
      amount: row.amount,
      rate: row.rate ?? null,
      estimated: row.estimated === true,
      type: maturityType(row.label),
    };
    if (row.year < minYear) return;
    if (row.year > maxYear) {
      afterYearFive = (afterYearFive ?? 0) + row.amount;
      ratedItems.push(item);
      return;
    }
    ratedItems.push(item);
    items.push(item);
  });

  if (!items.length) return null;
  return {
    items,
    afterYearFive: afterYearFive == null ? null : Math.round(afterYearFive * 10) / 10,
    weightedAverageRate: weightedAverageRateFromItems(ratedItems),
  };
}

/**
 * Elige, entre los candidatos que cubren al menos el 60 % de la deuda total, el que más se
 * aproxima a esa deuda total. Si no se conoce la deuda total, devuelve el primer candidato.
 * @param {Array<object>} candidates - Calendarios candidatos por orden de preferencia.
 * @param {string|number} [totalDebt] - Deuda total del balance.
 * @returns {object|null} Calendario elegido o null.
 */
export function pickCoveringMaturitySchedule(candidates, totalDebt) {
  const list = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate && Array.isArray(candidate.items) && candidate.items.length);
  if (!list.length) return null;
  const totalDebtNum = Number(totalDebt);
  if (!Number.isFinite(totalDebtNum) || totalDebtNum <= 0) return list[0];
  const coverage = (candidate) => sumMaturityAmounts(candidate.items)
    + (Number.isFinite(Number(candidate.afterYearFive)) ? Number(candidate.afterYearFive) : 0);
  const covering = list
    .map((candidate) => ({ candidate, coverage: coverage(candidate) }))
    .filter((entry) => entry.coverage >= totalDebtNum * 0.6);
  if (!covering.length) return null;
  covering.sort((a, b) => Math.abs(a.coverage - totalDebtNum) - Math.abs(b.coverage - totalDebtNum));
  return covering[0].candidate;
}
