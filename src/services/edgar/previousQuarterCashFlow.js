/**
 * @fileoverview Conciliación del flujo de caja del trimestre precedente para la
 * asignación de capital (variaciones trimestrales y acumuladas del año fiscal).
 * @module services/edgar/previousQuarterCashFlow
 */

import { getCompanyResults } from './companyResults.js';

function sortQuarterlyRows(quarterly) {
  return [...(quarterly || [])]
    .filter((row) => row.periodEnd)
    .sort((a, b) => String(b.periodEnd).localeCompare(String(a.periodEnd)));
}

function parseReportingPeriod(reportingPeriod) {
  if (!reportingPeriod) return null;
  const value = String(reportingPeriod).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function findCurrentQuarterIndex(sortedRows, targetDate) {
  const targetTime = new Date(targetDate).getTime();
  return sortedRows.findIndex((row) => {
    if (row.periodEnd === targetDate) return true;
    return Math.abs(new Date(row.periodEnd).getTime() - targetTime) <= 15 * 86400000;
  });
}

function findPreviousRowByFiscalKey(sortedRows, { quarter, year, targetDate }) {
  const previousQuarterNum = quarter - 1;
  const previousKey = year ? `${year}-Q${previousQuarterNum}` : null;
  const targetSortKey = year ? year * 10 + previousQuarterNum : null;
  const candidates = sortedRows.filter((row) => !targetDate || row.periodEnd < targetDate);

  const exact = candidates.find((row) => (previousKey && row.period === previousKey) || (targetSortKey && row.sortKey === targetSortKey));
  if (exact) return exact;

  if (year) {
    const sameYear = candidates.filter(
      (row) => row.sortKey && Math.floor(row.sortKey / 10) === year && (row.sortKey % 10) <= previousQuarterNum
    );
    if (sameYear.length) return sameYear[0];
  }
  return candidates[0] ?? null;
}

function selectQuarterRows(sortedRows, { quarter, year, targetDate }) {
  let currentRow = null;
  let prevRow = null;

  if (targetDate) {
    const currentIdx = findCurrentQuarterIndex(sortedRows, targetDate);
    if (currentIdx !== -1) {
      currentRow = sortedRows[currentIdx];
      if (currentIdx + 1 < sortedRows.length) prevRow = sortedRows[currentIdx + 1];
    } else {
      prevRow = sortedRows.find((row) => row.periodEnd < targetDate) ?? null;
    }
  }

  if (!prevRow) prevRow = findPreviousRowByFiscalKey(sortedRows, { quarter, year, targetDate });
  if (!prevRow) return { currentRow, prevRow: null };

  if (targetDate && prevRow.periodEnd && prevRow.periodEnd >= targetDate) {
    const strictlyEarlier = sortedRows.filter((row) => row.periodEnd < targetDate);
    prevRow = strictlyEarlier.length ? strictlyEarlier[0] : null;
  }
  return { currentRow, prevRow };
}

function findFiscalYearStartRow({ sortedRows, currentRow, quarter, year, annualRows }) {
  if (currentRow) {
    const currentIdx = sortedRows.indexOf(currentRow);
    if (currentIdx !== -1 && currentIdx + quarter < sortedRows.length) return sortedRows[currentIdx + quarter];
  }
  if (year && annualRows) {
    return annualRows.find((row) => row.period === String(year - 1) || (row.sortKey && row.sortKey === (year - 1))) ?? null;
  }
  return null;
}

function buildValuePicker(prevRow) {
  return (key) => {
    if (prevRow.ytdValues && prevRow.ytdValues[key] !== undefined) return prevRow.ytdValues[key];
    return prevRow.values?.[key];
  };
}

function toMillions(value) {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return null;
  return Math.round((Number(value) / 1e5)) / 10;
}

export function balanceSheetDebt(row) {
  const shortTerm = toMillions(row?.values?.shortTermLoans);
  const longTerm = toMillions(row?.values?.longTermDebt);
  if (shortTerm == null || longTerm == null) return toMillions(row?.values?.totalDebt);
  const longTermCurrent = toMillions(row?.values?.longTermDebtCurrent);
  return Math.round((shortTerm + longTerm + (longTermCurrent ?? 0)) * 10) / 10;
}

/**
 * Deuda del balance sin la porción corriente de largo plazo. Sirve para detectar casos en los
 * que `longTermDebtCurrent` es en realidad una etiqueta narrativa ya incluida en `shortTermLoans`
 * (p. ej. PepsiCo: la línea del balance "Short-term debt obligations" ya contiene los vencimientos).
 */
export function balanceSheetDebtWithoutCurrentPortion(row) {
  const shortTerm = toMillions(row?.values?.shortTermLoans);
  const longTerm = toMillions(row?.values?.longTermDebt);
  if (shortTerm == null || longTerm == null) return null;
  return Math.round((shortTerm + longTerm) * 10) / 10;
}

function collectCashFlowMetrics({ currentRow, prevRow, fiscalYearStartRow }) {
  const currentValues = currentRow?.values;
  const previousValues = prevRow.values;
  const fiscalYearStartValues = fiscalYearStartRow?.values;

  const rawDivestitures3M = toMillions(currentValues?.divestitures);
  const rawDivestituresYtd = toMillions(currentRow?.ytdValues?.divestitures ?? currentValues?.divestitures);
  const rawAcquisitions3M = toMillions(currentValues?.acquisitions);
  const rawAcquisitionsYtd = toMillions(currentRow?.ytdValues?.acquisitions ?? currentValues?.acquisitions);

  return {
    currentCash: toMillions(currentValues?.cash),
    previousCash: toMillions(previousValues?.cash),
    fiscalYearStartCash: toMillions(fiscalYearStartValues?.cash),
    currentShortTerm: toMillions(currentValues?.shortTermInvestments),
    previousShortTerm: toMillions(previousValues?.shortTermInvestments),
    fiscalYearStartShortTerm: toMillions(fiscalYearStartValues?.shortTermInvestments ?? 0),
    currentDebt: toMillions(currentValues?.totalDebt),
    previousDebt: toMillions(previousValues?.totalDebt),
    fiscalYearStartDebt: toMillions(fiscalYearStartValues?.totalDebt),
    currentDivestitures3M: rawDivestitures3M == null ? null : (rawDivestitures3M >= 50 ? rawDivestitures3M : 0),
    currentDivestituresYtd: rawDivestituresYtd == null ? null : (rawDivestituresYtd >= 50 ? rawDivestituresYtd : 0),
    currentAcquisitions3M: rawAcquisitions3M == null ? null : (Math.abs(rawAcquisitions3M) >= 50 ? -Math.abs(rawAcquisitions3M) : 0),
    currentAcquisitionsYtd: rawAcquisitionsYtd == null ? null : (Math.abs(rawAcquisitionsYtd) >= 50 ? -Math.abs(rawAcquisitionsYtd) : 0),
    assetSales3M: toMillions(currentValues?.salePPE),
    assetSalesYtd: toMillions(currentRow?.ytdValues?.salePPE ?? currentValues?.salePPE),
    currentBuybacks3M: toMillions(currentValues?.buybacks),
    currentBuybacksYtd: toMillions(currentRow?.ytdValues?.buybacks ?? currentValues?.buybacks),
    fiscalYearStartRestrictedCash: toMillions(fiscalYearStartValues?.restrictedCash),
  };
}

function buildDebtDetails(previousDebt, currentDebt, previousNetDebt, currentNetDebt) {
  if (previousDebt == null || currentDebt == null) return null;
  const debtDiff = Math.round((currentDebt - previousDebt) * 10) / 10;
  const netDebtDetail = (previousNetDebt != null && currentNetDebt != null)
    ? `. Deuda neta: ${previousNetDebt}M -> ${currentNetDebt}M (${currentNetDebt - previousNetDebt > 0 ? '+' : ''}${Math.round((currentNetDebt - previousNetDebt) * 10) / 10}M)`
    : '';
  return `Deuda balance: ${previousDebt}M -> ${currentDebt}M (${debtDiff > 0 ? '+' : ''}${debtDiff}M)${netDebtDetail}`;
}

function buildCashDetails(startCash, currentCash) {
  if (!startCash || !currentCash) return null;
  const cashDiff = Math.round((currentCash - startCash) * 10) / 10;
  return `Caja balance: ${startCash}M -> ${currentCash}M (${currentCash - startCash > 0 ? '+' : ''}${cashDiff}M)`;
}

function buildCapitalAllocation(metrics) {
  const shortTermDiff3M = (metrics.currentShortTerm != null && metrics.previousShortTerm != null)
    ? metrics.currentShortTerm - metrics.previousShortTerm
    : 0;
  const shortTermDiffYtd = metrics.currentShortTerm != null
    ? metrics.currentShortTerm - (metrics.fiscalYearStartShortTerm ?? 0)
    : 0;

  const currentNetDebt3M = (metrics.currentDebt != null && metrics.currentCash != null)
    ? Math.round((metrics.currentDebt - metrics.currentCash) * 10) / 10
    : null;
  const previousNetDebt3M = (metrics.previousDebt != null && metrics.previousCash != null)
    ? Math.round((metrics.previousDebt - metrics.previousCash) * 10) / 10
    : null;
  const fiscalYearStartNetDebt = (metrics.fiscalYearStartDebt != null && metrics.fiscalYearStartCash != null)
    ? Math.round((metrics.fiscalYearStartDebt - metrics.fiscalYearStartCash) * 10) / 10
    : null;

  return {
    threeMonths: {
      deuda: (metrics.currentDebt != null && metrics.previousDebt != null)
        ? Math.round((metrics.currentDebt - metrics.previousDebt) * 10) / 10
        : null,
      caja: (metrics.currentCash != null && metrics.previousCash != null)
        ? Math.round((-(metrics.currentCash - metrics.previousCash)) * 10) / 10
        : null,
      inversionesCortoPlazo: Math.abs(shortTermDiff3M) >= 50 ? Math.round(-shortTermDiff3M * 10) / 10 : 0,
      divestitures: metrics.currentDivestitures3M,
      buybacks: metrics.currentBuybacks3M != null ? -Math.abs(metrics.currentBuybacks3M) : null,
      acquisitions: metrics.currentAcquisitions3M,
      assetSales: metrics.assetSales3M,
      debtDetails: buildDebtDetails(metrics.previousDebt, metrics.currentDebt, previousNetDebt3M, currentNetDebt3M),
      cashDetails: buildCashDetails(metrics.previousCash, metrics.currentCash),
    },
    ytd: {
      deuda: (metrics.currentDebt != null && metrics.fiscalYearStartDebt != null)
        ? Math.round((metrics.currentDebt - metrics.fiscalYearStartDebt) * 10) / 10
        : null,
      caja: (metrics.currentCash != null && metrics.fiscalYearStartCash != null)
        ? Math.round((-(metrics.currentCash - metrics.fiscalYearStartCash)) * 10) / 10
        : null,
      inversionesCortoPlazo: Math.abs(shortTermDiffYtd) >= 50 ? Math.round(-shortTermDiffYtd * 10) / 10 : 0,
      divestitures: metrics.currentDivestituresYtd,
      buybacks: metrics.currentBuybacksYtd != null ? -Math.abs(metrics.currentBuybacksYtd) : null,
      acquisitions: metrics.currentAcquisitionsYtd,
      assetSales: metrics.assetSalesYtd,
      debtDetails: buildDebtDetails(metrics.fiscalYearStartDebt, metrics.currentDebt, fiscalYearStartNetDebt, currentNetDebt3M),
      cashDetails: buildCashDetails(metrics.fiscalYearStartCash, metrics.currentCash),
    },
  };
}

function buildPreviousQuarterResult({ currentRow, prevRow, metrics }) {
  const pickPreviousValue = buildValuePicker(prevRow);
  const pickCapex = pickPreviousValue('capex');
  const pickDividends = pickPreviousValue('dividendsCommon');
  const pickBuybacks = pickPreviousValue('buybacks');
  const pickDebtPaid = pickPreviousValue('debtPaid');
  const pickAcquisitions = pickPreviousValue('acquisitions');
  const pickDebtIssued = pickPreviousValue('debtIssued');
  const hasDebtMovement = pickDebtIssued !== undefined || pickDebtPaid !== undefined;

  return {
    period: prevRow.period,
    periodEnd: prevRow.periodEnd,
    cfoYtd: toMillions(pickPreviousValue('cfo')),
    capexYtd: toMillions(pickCapex !== undefined ? Math.abs(pickCapex) : null),
    dividendsYtd: toMillions(pickDividends !== undefined ? Math.abs(pickDividends) : null),
    buybacksYtd: toMillions(pickBuybacks !== undefined ? Math.abs(pickBuybacks) : null),
    debtIssuedYtd: toMillions(pickDebtIssued),
    debtPaidYtd: toMillions(pickDebtPaid !== undefined ? Math.abs(pickDebtPaid) : null),
    hasDebtMovement,
    netDebtChangeYtd: toMillions(hasDebtMovement
      ? (Number(pickDebtIssued) || 0) + (Number(pickDebtPaid) || 0)
      : null),
    netChangeInCashYtd: toMillions(pickPreviousValue('netChangeInCash')),
    cash: metrics.previousCash,
    restrictedCash: toMillions(currentRow?.values?.restrictedCash),
    previousRestrictedCash: toMillions(prevRow?.values?.restrictedCash),
    fyStartRestrictedCash: metrics.fiscalYearStartRestrictedCash,
    totalDebt: metrics.previousDebt,
    balanceSheetDebt: balanceSheetDebt(prevRow) ?? metrics.previousDebt,
    balanceSheetDebtWithoutCurrentPortion: balanceSheetDebtWithoutCurrentPortion(prevRow),
    currentBalanceSheetDebt: balanceSheetDebt(currentRow) ?? toMillions(currentRow?.values?.totalDebt),
    currentBalanceSheetDebtWithoutCurrentPortion: balanceSheetDebtWithoutCurrentPortion(currentRow),
    shortTermInvestments: metrics.previousShortTerm,
    fyStartCash: metrics.fiscalYearStartCash,
    fyStartDebt: metrics.fiscalYearStartDebt,
    fyStartShortTerm: metrics.fiscalYearStartShortTerm,
    changeReceivablesYtd: toMillions(pickPreviousValue('changeAccountsReceivable')),
    changeInventoryYtd: toMillions(pickPreviousValue('changeInventory')),
    changePayablesYtd: toMillions(pickPreviousValue('changeAccountsPayable')),
    workingCapitalChangeYtd: toMillions(pickPreviousValue('workingCapitalChange')),
    divestituresYtd: toMillions(pickPreviousValue('divestitures')),
    acquisitionsYtd: toMillions(pickAcquisitions !== undefined ? Math.abs(pickAcquisitions) : null),
    capitalAllocation: buildCapitalAllocation(metrics),
  };
}

function buildCurrentQuarterData({ currentRow, prevRow, metrics }) {
  const values = currentRow.values;
  const ytdValues = currentRow.ytdValues ?? {};
  const debtCashFlow = (source) => {
    const issued = toMillions(source?.debtIssued);
    const paid = toMillions(source?.debtPaid);
    if (issued == null && paid == null) return null;
    return Math.round(((issued ?? 0) + (paid ?? 0)) * 10) / 10;
  };
  return {
    period: currentRow.period,
    periodEnd: currentRow.periodEnd,
    cfo3M: toMillions(values?.cfo),
    capex3M: toMillions(values?.capex !== undefined ? Math.abs(values.capex) : null),
    dividends3M: toMillions(values?.dividendsCommon !== undefined ? Math.abs(values.dividendsCommon) : null),
    fcf3M: toMillions(values?.freeCashFlow),
    inventory: toMillions(values?.inventory),
    payables: toMillions(values?.payables),
    receivables: toMillions(values?.receivables ?? values?.totalReceivables),
    workingCapitalChange3M: toMillions(values?.workingCapitalChange),
    shares: toMillions(values?.weightedSharesDiluted || values?.sharesOutstanding || values?.weightedSharesBasic),
    totalDebt: metrics.currentDebt,
    cash: metrics.currentCash,
    restrictedCash: toMillions(currentRow?.values?.restrictedCash),
    previousRestrictedCash: toMillions(prevRow?.values?.restrictedCash),
    divestitures3M: metrics.currentDivestitures3M,
    divestituresYtd: metrics.currentDivestituresYtd,
    acquisitions3M: metrics.currentAcquisitions3M != null ? Math.abs(metrics.currentAcquisitions3M) : null,
    acquisitionsYtd: metrics.currentAcquisitionsYtd != null ? Math.abs(metrics.currentAcquisitionsYtd) : null,
    buybacks3M: metrics.currentBuybacks3M ? -Math.abs(metrics.currentBuybacks3M) : 0,
    buybacksYtd: metrics.currentBuybacksYtd ? -Math.abs(metrics.currentBuybacksYtd) : 0,
    debtCashFlow3M: debtCashFlow(values),
    debtCashFlowYtd: debtCashFlow(ytdValues.debtIssued !== undefined || ytdValues.debtPaid !== undefined ? ytdValues : values),
  };
}

/**
 * Obtiene el flujo de caja del trimestre precedente para conciliación y asignación de capital.
 * @param {string} ticker - Ticker.
 * @param {number|string} fiscalYear - Año fiscal.
 * @param {number|string} fiscalQuarter - Trimestre fiscal (Q1..Q4).
 * @param {string} [reportingPeriod] - Fecha de corte del informe analizado.
 * @returns {Promise<object|null>} Conciliación del flujo previo o null.
 */
export async function getPreviousQuarterCashFlow(ticker, fiscalYear, fiscalQuarter, reportingPeriod) {
  if (!ticker) return null;
  const year = Number(fiscalYear);
  const quarter = Number(fiscalQuarter);
  if (!Number.isFinite(quarter) || quarter <= 1) return null;

  try {
    const results = await getCompanyResults(ticker);
    const sortedRows = sortQuarterlyRows(results.quarterly);
    if (!sortedRows.length) return null;

    const targetDate = parseReportingPeriod(reportingPeriod);
    const { currentRow, prevRow } = selectQuarterRows(sortedRows, { quarter, year, targetDate });
    if (!prevRow) return null;

    const fiscalYearStartRow = findFiscalYearStartRow({
      sortedRows,
      currentRow,
      quarter,
      year,
      annualRows: results.annual,
    });

    const metrics = collectCashFlowMetrics({ currentRow, prevRow, fiscalYearStartRow });
    const result = buildPreviousQuarterResult({ currentRow, prevRow, metrics });
    if (currentRow) result.currentQuarterData = buildCurrentQuarterData({ currentRow, prevRow, metrics });

    return result;
  } catch (err) {
    console.warn(`[edgar] Error fetching previous quarter cash flow for ${ticker}:`, err.message);
    return null;
  }
}
