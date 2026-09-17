/**
 * @fileoverview Carga orquestada de resultados financieros, estados contables y conciliación trimestral de flujo de caja.
 * @module services/edgar/companyResults
 */

import { getMarketProfile } from '../market.service.js';
import {
  getCompanyByTicker,
  getCompanyFacts,
  getCompanySubmissions,
  buildCompanyProfile,
} from './companyProfile.js';
import { buildSeries } from './factsSeries.js';
import { buildDebtMaturitiesFromFacts } from './debtMaturities.js';
import { getExtensionFacts, mergeInstanceFacts } from './instanceFacts.js';
import {
  rederiveCashValues,
  rederiveIncomeValues,
  rederiveBalanceValues,
} from './rederiveStatements.js';
import {
  propagateMissingShares,
  harmonizeSeriesSplits,
} from './sharesHarmonizer.js';
import { publicStatements } from './statementDisplay.js';

/**
 * Obtiene el conjunto completo de estados financieros anuales y trimestrales armonizados, perfil y deuda.
 * @param {string} ticker - Símbolo bursátil.
 * @param {object} [options={}] - Opciones adicionales (ej. autenticado).
 * @returns {Promise<object>} Resultados financieros integrales.
 */
export async function getCompanyResults(ticker, options = {}) {
  const company = await getCompanyByTicker(ticker);
  const [facts, submissions, market] = await Promise.all([
    getCompanyFacts(company),
    getCompanySubmissions(company).catch(() => null),
    getMarketProfile(company.ticker).catch(() => null),
  ]);
  const { annual, quarterly } = buildSeries(facts);
  const debtMaturities = buildDebtMaturitiesFromFacts(facts);
  try {
    const extensionFacts = await getExtensionFacts(company);
    mergeInstanceFacts(annual, quarterly, extensionFacts, company.ticker);
  } catch {
    // Si falla el rescate desde instancias XBRL, se continúa con los datos estándar.
  }
  propagateMissingShares(annual, quarterly);
  rederiveCashValues(annual, quarterly);
  rederiveIncomeValues(annual, quarterly);
  rederiveBalanceValues(annual, quarterly);
  harmonizeSeriesSplits(annual, quarterly);
  const authenticated = options.authenticated === true;
  return {
    company: { ticker: company.ticker, name: company.name, cik: company.cik },
    currency: 'USD',
    authenticated,
    profile: buildCompanyProfile(company, facts, submissions ?? {}, annual, quarterly, market, { lang: options.lang }),
    statements: publicStatements(),
    annual,
    quarterly,
    debtMaturities,
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
    const quarterly = results.quarterly || [];
    if (!quarterly.length) return null;

    const sorted = [...quarterly]
      .filter((q) => q.periodEnd)
      .sort((a, b) => String(b.periodEnd).localeCompare(String(a.periodEnd)));
    if (!sorted.length) return null;

    let currentRow = null;
    let prevRow = null;

    const targetDate = reportingPeriod && /^\d{4}-\d{2}-\d{2}$/.test(String(reportingPeriod).trim())
      ? String(reportingPeriod).trim()
      : null;

    if (targetDate) {
      const targetTime = new Date(targetDate).getTime();
      const currentIdx = sorted.findIndex((q) => {
        if (q.periodEnd === targetDate) return true;
        const qTime = new Date(q.periodEnd).getTime();
        return Math.abs(qTime - targetTime) <= 15 * 86400000;
      });

      if (currentIdx !== -1) {
        currentRow = sorted[currentIdx];
        if (currentIdx + 1 < sorted.length) {
          prevRow = sorted[currentIdx + 1];
        }
      } else {
        prevRow = sorted.find((q) => q.periodEnd < targetDate);
      }
    }

    if (!prevRow) {
      const prevQuarterNum = quarter - 1;
      const prevKey = year ? `${year}-Q${prevQuarterNum}` : null;
      const targetSortKey = year ? year * 10 + prevQuarterNum : null;

      const candidates = sorted.filter((q) => !targetDate || q.periodEnd < targetDate);
      prevRow = candidates.find((q) => (prevKey && q.period === prevKey) || (targetSortKey && q.sortKey === targetSortKey));
      if (!prevRow && year) {
        const yearRows = candidates.filter((q) => q.sortKey && Math.floor(q.sortKey / 10) === year && (q.sortKey % 10) <= prevQuarterNum);
        if (yearRows.length) prevRow = yearRows[0];
      }
      if (!prevRow && candidates.length) {
        prevRow = candidates[0];
      }
    }

    if (!prevRow) return null;

    if (targetDate && prevRow.periodEnd && prevRow.periodEnd >= targetDate) {
      const strictlyEarlier = sorted.filter((q) => q.periodEnd < targetDate);
      if (strictlyEarlier.length) {
        prevRow = strictlyEarlier[0];
      } else {
        return null;
      }
    }

    const pickVal = (key) => {
      if (prevRow.ytdValues && prevRow.ytdValues[key] !== undefined) {
        return prevRow.ytdValues[key];
      }
      return prevRow.values?.[key];
    };

    const toMillions = (val) => {
      if (val === undefined || val === null || !Number.isFinite(Number(val))) return null;
      return Math.round((Number(val) / 1e5)) / 10;
    };

    const balanceSheetDebt = (row) => {
      const shortTerm = toMillions(row?.values?.shortTermLoans);
      const longTerm = toMillions(row?.values?.longTermDebt);
      if (shortTerm == null || longTerm == null) return null;
      return Math.round((shortTerm + longTerm) * 10) / 10;
    };

    let fyStartRow = null;
    if (currentRow && Number.isFinite(quarter) && quarter >= 1) {
      const currIdx = sorted.indexOf(currentRow);
      if (currIdx !== -1 && currIdx + quarter < sorted.length) {
        fyStartRow = sorted[currIdx + quarter];
      }
    }
    if (!fyStartRow && year) {
      fyStartRow = results.annual?.find((a) => a.period === String(year - 1) || (a.sortKey && a.sortKey === (year - 1)));
    }

    const currCash = toMillions(currentRow?.values?.cash);
    const prevCash = toMillions(prevRow.values?.cash);
    const fyStartCash = toMillions(fyStartRow?.values?.cash);

    const currShortTerm = toMillions(currentRow?.values?.shortTermInvestments);
    const prevShortTerm = toMillions(prevRow?.values?.shortTermInvestments);
    const fyStartShortTerm = toMillions(fyStartRow?.values?.shortTermInvestments ?? 0);

    const diffST3M = (currShortTerm != null && prevShortTerm != null) ? currShortTerm - prevShortTerm : 0;
    const invCortoPlazo3M = (Math.abs(diffST3M) >= 50) ? Math.round(-diffST3M * 10) / 10 : 0;

    const diffSTYtd = (currShortTerm != null) ? currShortTerm - (fyStartShortTerm ?? 0) : 0;
    const invCortoPlazoYtd = (Math.abs(diffSTYtd) >= 50) ? Math.round(-diffSTYtd * 10) / 10 : 0;

    const currDebt = toMillions(currentRow?.values?.totalDebt);
    const prevDebt = toMillions(prevRow.values?.totalDebt);
    const fyStartDebt = toMillions(fyStartRow?.values?.totalDebt);

    const rawDiv3M = toMillions(currentRow?.values?.divestitures);
    const currDivestitures3M = rawDiv3M == null ? null : (rawDiv3M >= 50 ? rawDiv3M : 0);

    const rawDivYtd = toMillions(currentRow?.ytdValues?.divestitures ?? currentRow?.values?.divestitures);
    const currDivestituresYtd = rawDivYtd == null ? null : (rawDivYtd >= 50 ? rawDivYtd : 0);

    const rawAcq3M = toMillions(currentRow?.values?.acquisitions);
    const currAcquisitions3M = rawAcq3M == null ? null : (Math.abs(rawAcq3M) >= 50 ? -Math.abs(rawAcq3M) : 0);

    const rawAcqYtd = toMillions(currentRow?.ytdValues?.acquisitions ?? currentRow?.values?.acquisitions);
    const currAcquisitionsYtd = rawAcqYtd == null ? null : (Math.abs(rawAcqYtd) >= 50 ? -Math.abs(rawAcqYtd) : 0);

    const assetSales3M = toMillions(currentRow?.values?.salePPE);
    const assetSalesYtd = toMillions(currentRow?.ytdValues?.salePPE ?? currentRow?.values?.salePPE);

    const currBuybacks3M = toMillions(currentRow?.values?.buybacks);
    const currBuybacksYtd = toMillions(currentRow?.ytdValues?.buybacks ?? currentRow?.values?.buybacks);

    const diffDebt3M = (currDebt != null && prevDebt != null) ? Math.round((currDebt - prevDebt) * 10) / 10 : null;
    const prevNetDebt3M = (prevDebt != null && prevCash != null) ? Math.round((prevDebt - prevCash) * 10) / 10 : null;
    const currNetDebt3M = (currDebt != null && currCash != null) ? Math.round((currDebt - currCash) * 10) / 10 : null;
    const diffNetDebt3M = (currNetDebt3M != null && prevNetDebt3M != null) ? Math.round((currNetDebt3M - prevNetDebt3M) * 10) / 10 : null;
    const debtDetails3M = (prevDebt != null && currDebt != null)
      ? `Deuda balance: ${prevDebt}M -> ${currDebt}M (${diffDebt3M > 0 ? '+' : ''}${diffDebt3M}M)${prevNetDebt3M != null && currNetDebt3M != null ? `. Deuda neta: ${prevNetDebt3M}M -> ${currNetDebt3M}M (${diffNetDebt3M > 0 ? '+' : ''}${diffNetDebt3M}M)` : ''}`
      : null;

    const diffDebtYtd = (currDebt != null && fyStartDebt != null) ? Math.round((currDebt - fyStartDebt) * 10) / 10 : null;
    const fyStartNetDebtYtd = (fyStartDebt != null && fyStartCash != null) ? Math.round((fyStartDebt - fyStartCash) * 10) / 10 : null;
    const diffNetDebtYtd = (currNetDebt3M != null && fyStartNetDebtYtd != null) ? Math.round((currNetDebt3M - fyStartNetDebtYtd) * 10) / 10 : null;
    const debtDetailsYtd = (fyStartDebt != null && currDebt != null)
      ? `Deuda balance: ${fyStartDebt}M -> ${currDebt}M (${diffDebtYtd > 0 ? '+' : ''}${diffDebtYtd}M)${fyStartNetDebtYtd != null && currNetDebt3M != null ? `. Deuda neta: ${fyStartNetDebtYtd}M -> ${currNetDebt3M}M (${diffNetDebtYtd > 0 ? '+' : ''}${diffNetDebtYtd}M)` : ''}`
      : null;

    const result = {
      period: prevRow.period,
      periodEnd: prevRow.periodEnd,
      cfoYtd: toMillions(pickVal('cfo')),
      capexYtd: toMillions(pickVal('capex') !== undefined ? Math.abs(pickVal('capex')) : null),
      dividendsYtd: toMillions(pickVal('dividendsCommon') !== undefined ? Math.abs(pickVal('dividendsCommon')) : null),
      buybacksYtd: toMillions(pickVal('buybacks') !== undefined ? Math.abs(pickVal('buybacks')) : null),
      debtIssuedYtd: toMillions(pickVal('debtIssued')),
      debtPaidYtd: toMillions(pickVal('debtPaid') !== undefined ? Math.abs(pickVal('debtPaid')) : null),
      netDebtChangeYtd: toMillions((pickVal('debtIssued') !== undefined || pickVal('debtPaid') !== undefined)
        ? (Number(pickVal('debtIssued')) || 0) + (Number(pickVal('debtPaid')) || 0)
        : null),
      netChangeInCashYtd: toMillions(pickVal('netChangeInCash')),
      cash: prevCash,
      restrictedCash: toMillions(currentRow?.values?.restrictedCash),
      previousRestrictedCash: toMillions(prevRow?.values?.restrictedCash),
      fyStartRestrictedCash: toMillions(fyStartRow?.values?.restrictedCash),
      totalDebt: prevDebt,
      balanceSheetDebt: balanceSheetDebt(prevRow) ?? prevDebt,
      currentBalanceSheetDebt: balanceSheetDebt(currentRow) ?? toMillions(currentRow?.values?.totalDebt),
      shortTermInvestments: prevShortTerm,
      fyStartCash,
      fyStartDebt,
      fyStartShortTerm,
      changeReceivablesYtd: toMillions(pickVal('changeAccountsReceivable')),
      changeInventoryYtd: toMillions(pickVal('changeInventory')),
      changePayablesYtd: toMillions(pickVal('changeAccountsPayable')),
      workingCapitalChangeYtd: toMillions(pickVal('workingCapitalChange')),
      divestituresYtd: toMillions(pickVal('divestitures')),
      acquisitionsYtd: toMillions(pickVal('acquisitions') !== undefined ? Math.abs(pickVal('acquisitions')) : null),
      capitalAllocation: {
        threeMonths: {
          deuda: diffDebt3M,
          caja: (currCash != null && prevCash != null) ? Math.round((-(currCash - prevCash)) * 10) / 10 : null,
          inversionesCortoPlazo: invCortoPlazo3M,
          divestitures: currDivestitures3M,
          buybacks: currBuybacks3M != null ? -Math.abs(currBuybacks3M) : null,
          acquisitions: currAcquisitions3M,
          assetSales: assetSales3M,
          debtDetails: debtDetails3M,
          cashDetails: prevCash && currCash ? `Caja balance: ${prevCash}M -> ${currCash}M (${currCash - prevCash > 0 ? '+' : ''}${Math.round((currCash - prevCash) * 10) / 10}M)` : null,
        },
        ytd: {
          deuda: diffDebtYtd,
          caja: (currCash != null && fyStartCash != null) ? Math.round((-(currCash - fyStartCash)) * 10) / 10 : null,
          inversionesCortoPlazo: invCortoPlazoYtd,
          divestitures: currDivestituresYtd,
          buybacks: currBuybacksYtd != null ? -Math.abs(currBuybacksYtd) : null,
          acquisitions: currAcquisitionsYtd,
          assetSales: assetSalesYtd,
          debtDetails: debtDetailsYtd,
          cashDetails: fyStartCash && currCash ? `Caja balance: ${fyStartCash}M -> ${currCash}M (${currCash - fyStartCash > 0 ? '+' : ''}${Math.round((currCash - fyStartCash) * 10) / 10}M)` : null,
        },
      },
    };

    if (currentRow) {
      result.currentQuarterData = {
        period: currentRow.period,
        periodEnd: currentRow.periodEnd,
        cfo3M: toMillions(currentRow.values?.cfo),
        capex3M: toMillions(currentRow.values?.capex !== undefined ? Math.abs(currentRow.values.capex) : null),
        dividends3M: toMillions(currentRow.values?.dividendsCommon !== undefined ? Math.abs(currentRow.values.dividendsCommon) : null),
        fcf3M: toMillions(currentRow.values?.freeCashFlow),
        inventory: toMillions(currentRow.values?.inventory),
        payables: toMillions(currentRow.values?.payables),
        receivables: toMillions(currentRow.values?.receivables ?? currentRow.values?.totalReceivables),
        workingCapitalChange3M: toMillions(currentRow.values?.workingCapitalChange),
        shares: toMillions(currentRow.values?.weightedSharesDiluted || currentRow.values?.sharesOutstanding || currentRow.values?.weightedSharesBasic),
        totalDebt: currDebt,
        cash: currCash,
        restrictedCash: toMillions(currentRow?.values?.restrictedCash),
        previousRestrictedCash: toMillions(prevRow?.values?.restrictedCash),
        divestitures3M: currDivestitures3M,
        divestituresYtd: currDivestituresYtd,
        buybacks3M: currBuybacks3M ? -Math.abs(currBuybacks3M) : 0,
        buybacksYtd: currBuybacksYtd ? -Math.abs(currBuybacksYtd) : 0,
      };
    }

    return result;
  } catch (err) {
    console.warn(`[edgar] Error fetching previous quarter cash flow for ${ticker}:`, err.message);
    return null;
  }
}
