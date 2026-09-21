/**
 * @fileoverview Derivación de métricas financieras por fila (extraído de factsSeries.js).
 */

import { calculateUnusualTotal, calculateNormalizedNetIncomeAndEps } from './rederiveStatements.js';

const NON_OPERATING_KEYS = ['interestExpense', 'interestIncome', 'equityMethodIncome', 'foreignCurrencyGainLoss', 'otherNonoperatingIncome'];

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function sumValues(values, keys) {
  const available = keys
    .map((key) => Number(values[key]))
    .filter((value) => Number.isFinite(value));
  return available.length ? available.reduce((sum, value) => sum + value, 0) : undefined;
}

function setDerived(values, key, calculate) {
  if (values[key] !== undefined) return;
  const result = calculate(values);
  if (Number.isFinite(result)) values[key] = round6(result);
}

/** Reconstruye ventas, coste de ventas y beneficio bruto a partir de los dos disponibles. */
function deriveRevenueAndGrossProfit(values) {
  if (values.revenue === undefined && values.grossProfit !== undefined && values.costOfRevenue !== undefined) {
    values.revenue = round6(Number(values.grossProfit) - Number(values.costOfRevenue));
  } else if (values.costOfRevenue === undefined && values.revenue !== undefined && values.grossProfit !== undefined) {
    values.costOfRevenue = round6(Number(values.grossProfit) - Number(values.revenue));
  } else if (values.revenue === undefined && values.grossProfit !== undefined) {
    values.revenue = round6(Number(values.grossProfit));
  }

  setDerived(values, 'grossProfit', (data) => {
    const sum = sumValues(data, ['revenue', 'costOfRevenue']);
    if (sum !== undefined) return sum;
    if (data.revenue !== undefined) return Number(data.revenue);
    if (data.operatingIncome !== undefined && data.operatingExpenses !== undefined) {
      const opExp = Number(data.operatingExpenses);
      const opInc = Number(data.operatingIncome);
      return opExp < 0 ? opInc - opExp : opInc + opExp;
    }
    return undefined;
  });
}

/** Deriva resultado operativo, gastos operativos y SG&A. */
function deriveOperatingResult(values) {
  const unusualNet = calculateUnusualTotal(values);
  const nonOpTotal = sumValues(values, NON_OPERATING_KEYS) || 0;

  if (values.pretaxIncome === undefined && values.ebtIncludingUnusual !== undefined) {
    values.pretaxIncome = values.ebtIncludingUnusual - unusualNet;
  }
  if (values.operatingIncome === undefined) {
    if (values.pretaxIncome !== undefined) {
      values.operatingIncome = values.pretaxIncome - nonOpTotal;
    } else if (values.ebtIncludingUnusual !== undefined) {
      values.operatingIncome = (values.ebtIncludingUnusual - unusualNet) - nonOpTotal;
    } else if (values.grossProfit !== undefined && values.operatingExpenses !== undefined) {
      const opExp = Number(values.operatingExpenses);
      const gp = Number(values.grossProfit);
      values.operatingIncome = opExp < 0 ? gp + opExp : gp - opExp;
    }
  }
  if (values.operatingExpenses === undefined && values.grossProfit !== undefined && values.operatingIncome !== undefined) {
    values.operatingExpenses = values.operatingIncome - values.grossProfit;
  }
  if (values.sellingGeneralAdmin === undefined && values.operatingExpenses !== undefined) {
    values.sellingGeneralAdmin = values.operatingExpenses
      - (Number(values.researchDevelopment) || 0)
      - (Number(values.amortizationGoodwillIntangibles) || 0)
      - (Number(values.otherOperatingExpenses) || 0);
  }
}

function setAdjustedOperatingIncome(values) {
  setDerived(values, 'operatingIncomeAdjusted', (data) => {
    const expense = data.interestExpense !== undefined && Number.isFinite(Number(data.interestExpense))
      ? Math.abs(Number(data.interestExpense))
      : 0;
    const income = data.interestIncome !== undefined && Number.isFinite(Number(data.interestIncome))
      ? Math.abs(Number(data.interestIncome))
      : 0;
    const netInterest = expense - income;

    if (data.pretaxIncome !== undefined && Number.isFinite(Number(data.pretaxIncome))) {
      return Number(data.pretaxIncome) + netInterest;
    }
    if (data.ebtIncludingUnusual !== undefined && Number.isFinite(Number(data.ebtIncludingUnusual))) {
      return (Number(data.ebtIncludingUnusual) - calculateUnusualTotal(data)) + netInterest;
    }
    if (data.operatingIncome !== undefined && Number.isFinite(Number(data.operatingIncome))) {
      return Number(data.operatingIncome) - calculateUnusualTotal(data);
    }
    return undefined;
  });
}

function setEbtIncludingUnusual(values) {
  setDerived(values, 'ebtIncludingUnusual', (data) => {
    // Muchas empresas (p. ej. MCD) no etiquetan el EBT: se reconstruye desde el beneficio neto
    // y el impuesto (guardado con signo negativo), porque netIncome = EBT + incomeTax.
    const netIncome = Number(data.netIncome);
    const incomeTax = Number(data.incomeTax);
    if (Number.isFinite(netIncome) && Number.isFinite(incomeTax)) return netIncome - incomeTax;
    return sumValues(data, ['pretaxIncome', 'mergerRestructuringCharges', 'goodwillImpairment', 'gainLossOnInvestments', 'gainLossOnAssets', 'assetImpairment', 'insuranceSettlements', 'legalSettlements', 'otherUnusualItems']);
  });
}

function deriveNetIncome(values) {
  const unusualNet = calculateUnusualTotal(values);

  if (values.pretaxIncome === undefined && values.ebtIncludingUnusual !== undefined) {
    values.pretaxIncome = values.ebtIncludingUnusual - unusualNet;
  }

  setDerived(values, 'incomeFromContinuingOps', (data) => sumValues(data, ['ebtIncludingUnusual', 'incomeTax']));
  setDerived(values, 'netIncome', (data) => {
    const standard = sumValues(data, ['incomeFromContinuingOps', 'discontinuedOperations']);
    if (standard !== undefined) return standard;
    if (data.incomeFromContinuingOps !== undefined) return Number(data.incomeFromContinuingOps);
    if (data.ebtIncludingUnusual !== undefined && data.incomeTax !== undefined) {
      return Number(data.ebtIncludingUnusual) + Number(data.incomeTax);
    }
    if (data.pretaxIncome !== undefined && data.incomeTax !== undefined) {
      return Number(data.pretaxIncome) + (unusualNet || 0) + Number(data.incomeTax);
    }
    return undefined;
  });
  setDerived(values, 'netIncomeToCommonIncludingUnusual', (data) => {
    const netIncome = Number(data.netIncome);
    const minority = Number(data.minorityInterestIncome) || 0;
    const preferred = Number(data.preferredDividendsOtherAdjustments) || 0;
    return Number.isFinite(netIncome) ? netIncome + minority + preferred : undefined;
  });
  setDerived(values, 'netIncomeToCommonExcludingUnusual', (data) => calculateNormalizedNetIncomeAndEps(data).netIncomeAdjusted);
  setDerived(values, 'epsDilutedNormalized', (data) => calculateNormalizedNetIncomeAndEps(data).epsNormalized);
}

function deriveEbitdaMetrics(values) {
  setDerived(values, 'ebitda', (data) => {
    const dep = Number.isFinite(Number(data.depreciationAmortizationTotal))
      ? Number(data.depreciationAmortizationTotal)
      : ((Number(data.depreciation) || 0) + Math.abs(Number(data.cashflowAmortizationGoodwillIntangibles) || 0));
    const opInc = Number(data.operatingIncome);
    const nonCashOperatingCharges = Math.abs(Number(data.goodwillImpairment) || 0)
      + Math.abs(Number(data.assetImpairment) || 0);
    return Number.isFinite(opInc) ? opInc + dep + nonCashOperatingCharges : undefined;
  });
  setDerived(values, 'ebitdaNormalized', (data) => {
    const ebitda = Number(data.ebitda);
    if (!Number.isFinite(ebitda)) return undefined;
    const rawMr = Math.abs(Number(data.mergerRestructuringCharges) || 0);
    const impairments = Math.abs(Number(data.goodwillImpairment) || 0) + Math.abs(Number(data.assetImpairment) || 0);
    const pureMr = rawMr > impairments ? (rawMr - impairments) : (impairments > 0 ? 0 : rawMr);
    return ebitda + pureMr;
  });
  setDerived(values, 'ebitdar', (data) => Number.isFinite(Number(data.ebitda)) && Number.isFinite(Number(data.rentExpense))
    ? Number(data.ebitda) - Number(data.rentExpense)
    : undefined);
}

/** Deriva las partidas del bloque de resultados (ingresos, EBITDA, beneficio por acción). */
function deriveIncomeMetrics(values) {
  deriveRevenueAndGrossProfit(values);
  deriveOperatingResult(values);
  setAdjustedOperatingIncome(values);
  setEbtIncludingUnusual(values);
  deriveNetIncome(values);
  deriveEbitdaMetrics(values);
}

function deriveBalanceSheetMetrics(values) {
  setDerived(values, 'cashAndShortTermInvestments', (data) => sumValues(data, ['cash', 'shortTermInvestments']));
  setDerived(values, 'totalReceivables', (data) => sumValues(data, ['receivables', 'otherReceivables']));
  setDerived(values, 'propertyPlantEquipment', (data) => {
    const gross = Number(data.propertyPlantEquipmentGross);
    const dep = data.accumulatedDepreciation !== undefined ? Math.abs(Number(data.accumulatedDepreciation)) : undefined;
    return Number.isFinite(gross) && Number.isFinite(dep) ? gross - dep : undefined;
  });
  setDerived(values, 'propertyPlantEquipmentGross', (data) => {
    const net = Number(data.propertyPlantEquipment);
    const dep = data.accumulatedDepreciation !== undefined ? Math.abs(Number(data.accumulatedDepreciation)) : undefined;
    return Number.isFinite(net) && Number.isFinite(dep) ? net + dep : undefined;
  });
  setDerived(values, 'accumulatedDepreciation', (data) => {
    const gross = Number(data.propertyPlantEquipmentGross);
    const net = Number(data.propertyPlantEquipment);
    return Number.isFinite(gross) && Number.isFinite(net) && gross >= net ? -(gross - net) : undefined;
  });
  setDerived(values, 'assetsNoncurrent', (data) => Number.isFinite(Number(data.assets)) && Number.isFinite(Number(data.currentAssets))
    ? Number(data.assets) - Number(data.currentAssets)
    : undefined);
  setDerived(values, 'commonStock', (data) => {
    if (!Number.isFinite(Number(data.commonEquity))) return undefined;
    const apic = Number(data.additionalPaidInCapital) || 0;
    const retainedEarnings = Number(data.retainedEarnings) || 0;
    const treasuryStock = Number(data.treasuryStock) || 0;
    const aoci = Number(data.accumulatedOtherComprehensiveIncome) || 0;
    const diff = Number(data.commonEquity) - (apic + retainedEarnings + treasuryStock + aoci);
    return Number.isFinite(diff) && diff > 0 ? diff : undefined;
  });
  setDerived(values, 'commonEquity', (data) => Number.isFinite(Number(data.equity))
    ? Number(data.equity) - (Number.isFinite(Number(data.minorityInterest)) ? Number(data.minorityInterest) : 0)
    : undefined);
  setDerived(values, 'equity', (data) => sumValues(data, ['commonEquity', 'minorityInterest']));
  setDerived(values, 'liabilities', (data) => Number.isFinite(Number(data.assets)) && Number.isFinite(Number(data.equity))
    ? Number(data.assets) - Number(data.equity)
    : undefined);
  setDerived(values, 'liabilitiesNoncurrent', (data) => Number.isFinite(Number(data.liabilities)) && Number.isFinite(Number(data.currentLiabilities))
    ? Number(data.liabilities) - Number(data.currentLiabilities)
    : undefined);
  setDerived(values, 'liabilitiesAndEquity', (data) => sumValues(data, ['liabilities', 'equity']) ?? data.assets);
  setDerived(values, 'tangibleBookValue', (data) => {
    const commonEquity = Number(data.commonEquity);
    if (!Number.isFinite(commonEquity)) return undefined;
    return commonEquity - (Number(data.goodwill) || 0) - (Number(data.otherIntangibleAssets) || 0);
  });
  setDerived(values, 'totalDebt', (data) => {
    const toNum = (value) => (value === undefined || value === null) ? null : Number(value);
    const parts = [toNum(data.longTermDebt), toNum(data.shortTermLoans), toNum(data.longTermDebtCurrent)]
      .filter((value) => value !== null && Number.isFinite(value));
    return parts.length ? parts.reduce((sum, value) => sum + value, 0) : undefined;
  });
  setDerived(values, 'netDebt', (data) => Number.isFinite(Number(data.totalDebt)) && Number.isFinite(Number(data.cashAndShortTermInvestments ?? data.cash))
    ? Number(data.totalDebt) - Number(data.cashAndShortTermInvestments ?? data.cash)
    : undefined);

  if (values.sharesOutstanding === undefined || !Number(values.sharesOutstanding)) {
    values.sharesOutstanding = values.weightedSharesDiluted ?? values.weightedSharesBasic;
  }
  setDerived(values, 'bookValuePerShare', (data) => Number.isFinite(Number(data.commonEquity)) && Number(data.sharesOutstanding) > 0
    ? Number(data.commonEquity) / Number(data.sharesOutstanding)
    : undefined);
  setDerived(values, 'tangibleBookValuePerShare', (data) => Number.isFinite(Number(data.tangibleBookValue)) && Number(data.sharesOutstanding) > 0
    ? Number(data.tangibleBookValue) / Number(data.sharesOutstanding)
    : undefined);
  setDerived(values, 'dividendPerShare', (data) => {
    if (data.dividendsCommon === undefined) return undefined;
    const divCommon = Math.abs(Number(data.dividendsCommon));
    const shares = Number(data.sharesOutstanding || data.weightedSharesDiluted || data.weightedSharesBasic);
    if (shares > 0 && Number.isFinite(divCommon)) {
      return Math.round((divCommon / shares) * 10000) / 10000;
    }
    return undefined;
  });
}

function deriveCashFlowMetrics(values) {
  setDerived(values, 'workingCapitalChange', (data) => {
    const parts = [data.changeAccountsReceivable, data.changeInventory, data.changeAccountsPayable, data.changeOtherOperatingAssets];
    if (parts.some((value) => value !== undefined && Number.isFinite(Number(value)))) {
      return round6(parts.reduce((sum, value) => sum + (Number.isFinite(Number(value)) ? Number(value) : 0), 0));
    }
    return undefined;
  });
  setDerived(values, 'cfi', (data) => sumValues(data, ['capex', 'salePPE', 'acquisitions', 'divestitures', 'securitiesInvesting', 'loansInvesting', 'otherInvestingActivities']));
  setDerived(values, 'cff', (data) => sumValues(data, ['debtIssued', 'debtPaid', 'commonStockIssued', 'buybacks', 'dividendsCommon', 'dividendsPreferred', 'otherFinancingActivities']));
  setDerived(values, 'netChangeInCash', (data) => sumValues(data, ['cfo', 'cfi', 'cff', 'fx']));
  setDerived(values, 'freeCashFlow', (data) => {
    const fcf = sumValues(data, ['cfo', 'capex']);
    if (fcf !== undefined) return fcf;
    if (data.cfo !== undefined) return Number(data.cfo);
    return undefined;
  });
  setDerived(values, 'cashEnding', (data) => data.cash);
  setDerived(values, 'cashBeginning', (data) => Number.isFinite(Number(data.cashEnding)) && Number.isFinite(Number(data.netChangeInCash))
    ? Number(data.cashEnding) - Number(data.netChangeInCash)
    : undefined);
  setDerived(values, 'cashFlowPerShare', (data) => Number.isFinite(Number(data.freeCashFlow)) && Number(data.weightedSharesDiluted) > 0
    ? Number(data.freeCashFlow) / Number(data.weightedSharesDiluted)
    : undefined);
}

export function deriveRowMetrics(all) {
  all.forEach((row) => {
    const values = row.values;
    deriveIncomeMetrics(values);
    deriveBalanceSheetMetrics(values);
    deriveCashFlowMetrics(values);
  });
}
