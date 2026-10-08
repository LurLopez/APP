/**
 * @fileoverview Normaliza la respuesta JSON de la IA al contrato interno de extracción.
 * La IA puede devolver aliases de nombres, pero el resto del pipeline solo debe consumir
 * una forma canónica y estable.
 * @module agents/analyst/extractionNormalizer
 */

import { parseLooseAmount } from './financialParsers.js';

const SECTION_ALIASES = {
  annualDetails: ['annual', 'annualData', 'annual_details'],
  balance: ['balanceSheet', 'balance_sheet'],
  cashFlow: ['cashflow', 'cash_flow', 'cashFlows'],
  workingCapital: ['working_capital', 'working-capital'],
};

const DEBT_FIELD_ALIASES = {
  maturityAfterFive: ['afterYearFive', 'afterFiveYears', 'maturitiesAfterFive'],
  secTable: ['debtTable', 'maturityTable', 'debtObligationsTable'],
  rateBuckets: ['interestRateBuckets', 'debtRateBuckets', 'rateGroups'],
  allDebtAverageRate: ['weightedAverageRate', 'averageDebtRate', 'totalDebtAverageRate', 'debtAverageRate'],
  allDebtAverageRateSource: ['weightedAverageRateSource', 'averageDebtRateSource', 'debtAverageRateSource'],
  interestExpense: ['debtInterestExpense', 'annualInterestExpense'],
  interestPaid: ['cashInterestPaid', 'annualInterestPaid'],
  refinancing: ['debtRefinancing'],
};

const MATURITY_ARRAY_ALIASES = ['maturitySchedule', 'items', 'maturities'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstPresent(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function numericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value)
    .replace(/[$€£%]/g, '')
    .replace(/(?:m|mm|million|millions|millones|billion|billions|billones)\b/gi, '')
    .trim();
  const parsed = parseLooseAmount(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSectionAliases(data, warnings) {
  for (const [canonical, aliases] of Object.entries(SECTION_ALIASES)) {
    const alias = aliases.find((key) => data[key] !== undefined);
    if (!alias) continue;
    if (data[canonical] === undefined || data[canonical] === null) {
      data[canonical] = data[alias];
    } else if (JSON.stringify(data[canonical]) !== JSON.stringify(data[alias])) {
      warnings.push(`Se ignoró ${alias}: ${canonical} ya estaba presente.`);
    }
    delete data[alias];
  }
}

function normalizeMaturityItem(raw, index, warnings) {
  if (!isObject(raw)) {
    warnings.push(`annualDetails.debt.maturityItems[${index}] no es un objeto.`);
    return null;
  }

  const rawYear = firstPresent(raw, ['year', 'maturityYear', 'dueYear', 'maturity_year']);
  const label = firstPresent(raw, ['label', 'name', 'description', 'instrument']) ?? null;
  const yearText = String(rawYear ?? label ?? '');
  const yearMatch = yearText.match(/\b((?:19|20)\d{2})\b/);
  const year = Number.isFinite(Number(rawYear))
    ? Number(rawYear)
    : (yearMatch ? Number(yearMatch[1]) : null);
  const amount = numericValue(firstPresent(raw, ['amount', 'totalAmount', 'value', 'principal', 'balance']));
  const rate = numericValue(firstPresent(raw, ['rate', 'interestRate', 'coupon', 'couponRate']));
  const type = firstPresent(raw, ['type', 'category', 'instrumentType']) ?? null;

  if (year === null) warnings.push(`annualDetails.debt.maturityItems[${index}] no tiene año de vencimiento.`);
  if (amount === null || amount <= 0) {
    warnings.push(`annualDetails.debt.maturityItems[${index}] no tiene un importe válido.`);
    return null;
  }

  const item = { year, label, amount, rate, type };
  if (raw.estimated === true) item.estimated = true;
  return item;
}

function normalizeDebtDetails(annualDetails, warnings) {
  if (!isObject(annualDetails)) return;

  const debtAlias = annualDetails.debtDetails;
  if (annualDetails.debt == null && isObject(debtAlias)) {
    annualDetails.debt = debtAlias;
    delete annualDetails.debtDetails;
  }

  const debt = annualDetails.debt;
  if (!isObject(debt)) return;

  for (const [canonical, aliases] of Object.entries(DEBT_FIELD_ALIASES)) {
    const aliasValue = firstPresent(debt, aliases);
    if (aliasValue === undefined) continue;
    if (debt[canonical] === undefined || debt[canonical] === null) {
      debt[canonical] = aliasValue;
    } else if (JSON.stringify(debt[canonical]) !== JSON.stringify(aliasValue)) {
      warnings.push(`annualDetails.debt.${aliases.find((key) => debt[key] === aliasValue)} se ignoró porque ${canonical} ya estaba presente.`);
    }
    for (const alias of aliases) delete debt[alias];
  }

  const aliasItems = MATURITY_ARRAY_ALIASES
    .filter((key) => Array.isArray(debt[key]));
  const rawItems = Array.isArray(debt.maturityItems)
    ? debt.maturityItems
    : aliasItems.map((key) => debt[key]).find(Array.isArray);

  if (Array.isArray(debt.maturityItems)) {
    for (const alias of aliasItems) {
      if (JSON.stringify(debt.maturityItems) !== JSON.stringify(debt[alias])) {
        warnings.push(`annualDetails.debt.${alias} se ignoró porque maturityItems ya estaba presente.`);
      }
    }
  }

  for (const alias of MATURITY_ARRAY_ALIASES) {
    if (debt[alias] !== undefined && !Array.isArray(debt[alias])) {
      warnings.push(`annualDetails.debt.${alias} no es un array y se ignoró.`);
    }
  }

  if (Array.isArray(rawItems)) {
    const normalizedItems = rawItems
      .map((item, index) => normalizeMaturityItem(item, index, warnings))
      .filter(Boolean);
    debt.maturityItems = normalizedItems;
  }

  for (const alias of MATURITY_ARRAY_ALIASES) delete debt[alias];

  if (typeof debt.maturitiesSchedule === 'string' && debt.maturitiesSchedule.trim()) {
    warnings.push('annualDetails.debt.maturitiesSchedule es texto libre; se ignora como fuente estructurada y se usa el parser de la nota de deuda.');
  }
  delete debt.maturitiesSchedule;

  const afterFive = numericValue(debt.maturityAfterFive);
  if (afterFive !== null) debt.maturityAfterFive = afterFive;

  if (Array.isArray(debt.rateBuckets)) {
    debt.rateBuckets = debt.rateBuckets.filter(Boolean).join('; ');
  }
}

/**
 * Normaliza la respuesta de extracción de la IA sin inventar datos.
 * @param {Object} payload - JSON devuelto por el extractor.
 * @returns {{data: Object, warnings: string[]}} Datos canónicos y advertencias.
 */
export function normalizeExtractionPayload(payload) {
  const data = isObject(payload) ? payload : {};
  const warnings = [];

  normalizeSectionAliases(data, warnings);
  normalizeDebtDetails(data.annualDetails, warnings);

  return { data, warnings };
}
