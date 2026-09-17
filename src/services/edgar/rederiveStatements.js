/**
 * @fileoverview Rederivación y cálculo de partidas agregadas (EBITDA, Deuda Neta, FCF, BPA ajustado, capital circulante).
 * @module services/edgar/rederiveStatements
 */

/**
 * Calcula el total neto de partidas extraordinarias o inusuales.
 * @param {object} values - Mapa de valores contables del periodo.
 * @returns {number} Suma neta de partidas inusuales.
 */
export function calculateUnusualTotal(values) {
  const gw = -Math.abs(Number(values.goodwillImpairment) || 0);
  const as = -Math.abs(Number(values.assetImpairment) || 0);
  const rawMr = -Math.abs(Number(values.mergerRestructuringCharges) || 0);
  const imp = Math.abs(gw) + Math.abs(as);
  const mr = Math.abs(rawMr) > imp ? -(Math.abs(rawMr) - imp) : (imp > 0 ? 0 : rawMr);
  const ls = -Math.abs(Number(values.legalSettlements) || 0);
  const otherUnusual = (Number(values.gainLossOnInvestments) || 0)
    + (Number(values.gainLossOnAssets) || 0)
    + (Number(values.insuranceSettlements) || 0)
    + (Number(values.otherUnusualItems) || 0);
  return gw + as + mr + ls + otherUnusual;
}

/**
 * Calcula el beneficio neto normalizado y el BPA ajustado excluyendo efectos atípicos y amortización de intangibles.
 * @param {object} values - Partidas del periodo.
 * @returns {{unusualTotal: number, amortIntangibles: number, effectiveTax: number, netIncomeAdjusted?: number, epsNormalized?: number}} Métricas normalizadas.
 */
export function calculateNormalizedNetIncomeAndEps(values) {
  const op = values.operatingIncome;
  const unusualNet = calculateUnusualTotal(values);

  const amortIntangibles = Math.abs(Number(values.amortizationGoodwillIntangibles) || 0)
    || Math.abs(Number(values.cashflowAmortizationGoodwillIntangibles) || 0);

  const nonOp = (Number(values.interestExpense) || 0) + (Number(values.interestIncome) || 0)
    + (Number(values.otherNonoperatingIncome) || 0) + (Number(values.equityMethodIncome) || 0);

  const pretaxRaw = Number(values.ebtIncludingUnusual ?? values.pretaxIncome ?? (Number(op) + nonOp));
  const normPretax = pretaxRaw - unusualNet;

  const effTax = (Number(values.incomeTax) && Math.abs(pretaxRaw) > 0)
    ? Math.min(0.30, Math.max(0.12, Math.abs(Number(values.incomeTax)) / Math.abs(pretaxRaw)))
    : 0.21;

  const minority = Number(values.minorityInterestIncome) || 0;
  const pref = Number(values.preferredDividendsOtherAdjustments) || 0;

  const baseNet = Number.isFinite(Number(values.netIncomeToCommonIncludingUnusual))
    ? Number(values.netIncomeToCommonIncludingUnusual)
    : (Number.isFinite(Number(values.netIncome)) ? Number(values.netIncome) + minority + pref : null);

  let netIncomeAdjusted;
  if (Math.abs(unusualNet) > 0) {
    const normNet = Math.round(normPretax * (1 - effTax) + minority + pref);
    netIncomeAdjusted = Math.round(normNet + amortIntangibles * (1 - effTax));
  } else if (amortIntangibles > 0 && baseNet !== null) {
    netIncomeAdjusted = Math.round(baseNet + amortIntangibles * (1 - effTax));
  } else {
    netIncomeAdjusted = baseNet;
  }

  const shares = Number(values.weightedSharesDiluted) || Number(values.weightedSharesBasic) || Number(values.sharesOutstanding);
  let epsNormalized = null;
  if (Number.isFinite(netIncomeAdjusted) && Number.isFinite(shares) && shares > 0) {
    epsNormalized = Math.round((netIncomeAdjusted / shares) * 100) / 100;
  } else if (Number.isFinite(Number(values.epsDiluted))) {
    epsNormalized = Number(values.epsDiluted);
  }

  return {
    unusualTotal: Math.abs(unusualNet),
    amortIntangibles,
    effectiveTax: effTax,
    netIncomeAdjusted: Number.isFinite(netIncomeAdjusted) ? netIncomeAdjusted : undefined,
    epsNormalized: Number.isFinite(epsNormalized) ? epsNormalized : undefined,
  };
}

/**
 * Rederiva y reconcilia valores del estado de flujo de caja (FCF, Deuda Neta, Saldo Inicial/Final de Caja).
 * @param {Array<object>} annual - Periodos anuales.
 * @param {Array<object>} quarterly - Periodos trimestrales.
 */
export function rederiveCashValues(annual, quarterly) {
  for (const rows of [annual, quarterly]) {
    for (const row of rows) {
      const values = row.values;
      const cash = Number(values.cash);
      if (values.cashEnding === undefined && Number.isFinite(cash)) values.cashEnding = cash;
      if (values.cashBeginning === undefined
        && Number.isFinite(Number(values.cashEnding)) && Number.isFinite(Number(values.netChangeInCash))) {
        values.cashBeginning = Math.round((Number(values.cashEnding) - Number(values.netChangeInCash)) * 1e6) / 1e6;
      }
      const shortTerm = Number(values.shortTermInvestments);
      const cashTotal = Number.isFinite(cash) ? cash + (Number.isFinite(shortTerm) ? shortTerm : 0) : (Number.isFinite(shortTerm) ? shortTerm : undefined);
      if (cashTotal !== undefined) {
        values.cashAndShortTermInvestments = cashTotal;
      }
      const stl = Number(values.shortTermLoans);
      const ltd = Number(values.longTermDebt);
      const ltdc = Number(values.longTermDebtCurrent);
      const parts = [ltd, stl, ltdc].filter((v) => Number.isFinite(v));
      if (parts.length) {
        values.totalDebt = parts.reduce((a, b) => a + b, 0);
        const cashForNet = Number(values.cashAndShortTermInvestments ?? values.cash) || 0;
        values.netDebt = Number(values.totalDebt) - cashForNet;
      }

      if (values.workingCapitalChange === undefined) {
        const partsWc = [values.changeAccountsReceivable, values.changeInventory, values.changeAccountsPayable, values.changeOtherOperatingAssets];
        if (partsWc.some((v) => v !== undefined && Number.isFinite(Number(v)))) {
          values.workingCapitalChange = Math.round(partsWc.reduce((sum, v) => sum + (Number.isFinite(Number(v)) ? Number(v) : 0), 0) * 1e6) / 1e6;
        }
      }

      if (values.freeCashFlow === undefined && Number.isFinite(Number(values.cfo)) && Number.isFinite(Number(values.capex))) {
        const capex = Number(values.capex);
        values.freeCashFlow = Math.round((Number(values.cfo) + (capex < 0 ? capex : -capex)) * 1e6) / 1e6;
      }
      if (Number.isFinite(Number(values.freeCashFlow))) {
        const sh = Number(values.weightedSharesDiluted || values.sharesOutstanding);
        if (sh > 0) {
          values.cashFlowPerShare = Math.round((Number(values.freeCashFlow) / sh) * 1000) / 1000;
        }
      }
    }
    const ascending = [...rows].reverse();
    for (let index = 1; index < ascending.length; index += 1) {
      const row = ascending[index];
      if (row.values.cashBeginning !== undefined) continue;
      const previous = ascending[index - 1]?.values?.cashEnding;
      if (Number.isFinite(Number(previous))) row.values.cashBeginning = Number(previous);
    }
  }
}

/**
 * Rederiva partidas del balance general (Inmovilizado Neto/Bruto, Fondos Propios, Valor Contable).
 * @param {Array<object>} annual - Periodos anuales.
 * @param {Array<object>} quarterly - Periodos trimestrales.
 */
export function rederiveBalanceValues(annual, quarterly) {
  for (const rows of [annual, quarterly]) {
    for (const row of rows) {
      const values = row.values;

      const gross = Number(values.propertyPlantEquipmentGross);
      const dep = values.accumulatedDepreciation !== undefined ? Math.abs(Number(values.accumulatedDepreciation)) : undefined;
      const net = Number(values.propertyPlantEquipment);

      if (values.propertyPlantEquipment === undefined && Number.isFinite(gross) && Number.isFinite(dep)) {
        values.propertyPlantEquipment = gross - dep;
      }
      if (values.propertyPlantEquipmentGross === undefined && Number.isFinite(net) && Number.isFinite(dep)) {
        values.propertyPlantEquipmentGross = net + dep;
      }
      if (values.accumulatedDepreciation === undefined && Number.isFinite(gross) && Number.isFinite(net) && gross >= net) {
        values.accumulatedDepreciation = -(gross - net);
      }

      if (values.commonStock === undefined && Number.isFinite(Number(values.commonEquity))) {
        const apic = Number(values.additionalPaidInCapital) || 0;
        const re = Number(values.retainedEarnings) || 0;
        const ts = Number(values.treasuryStock) || 0;
        const aoci = Number(values.accumulatedOtherComprehensiveIncome) || 0;
        const diff = Number(values.commonEquity) - (apic + re + ts + aoci);
        if (Number.isFinite(diff) && diff > 0) {
          values.commonStock = Math.round(diff * 1e6) / 1e6;
        }
      }

      if (Number.isFinite(Number(values.commonEquity))) {
        values.equity = Number(values.commonEquity) + (Number(values.minorityInterest) || 0);
      }

      if (values.tangibleBookValue === undefined && Number.isFinite(Number(values.commonEquity))) {
        const gw = Math.abs(Number(values.goodwill) || 0);
        const intangibles = Math.abs(Number(values.otherIntangibleAssets) || 0);
        values.tangibleBookValue = Number(values.commonEquity) - gw - intangibles;
      }

      if (values.sharesOutstanding === undefined || !Number(values.sharesOutstanding)) {
        const fallback = Number(values.weightedSharesDiluted) || Number(values.weightedSharesBasic);
        if (Number.isFinite(fallback) && fallback > 0) {
          values.sharesOutstanding = fallback;
        }
      }
      const shares = Number(values.sharesOutstanding);
      if (Number.isFinite(shares) && shares > 0) {
        if (values.commonEquity !== undefined && Number.isFinite(Number(values.commonEquity))) {
          values.bookValuePerShare = Math.round((Number(values.commonEquity) / shares) * 100) / 100;
        }
        if (values.tangibleBookValue !== undefined && Number.isFinite(Number(values.tangibleBookValue))) {
          values.tangibleBookValuePerShare = Math.round((Number(values.tangibleBookValue) / shares) * 100) / 100;
        }
        const divCommon = Math.abs(Number(values.dividendsCommon));
        if (rows === quarterly && Number(values.dividendPerShare) > 2.0 && Number.isFinite(divCommon) && shares > 0) {
          values.dividendPerShare = Math.round((divCommon / shares) * 10000) / 10000;
        } else if ((values.dividendPerShare === undefined || values.dividendPerShare === null) && Number.isFinite(divCommon) && shares > 0) {
          values.dividendPerShare = Math.round((divCommon / shares) * 10000) / 10000;
        }
      }
    }
  }
}

/**
 * Rederiva partidas de la cuenta de resultados (EBITDA, Margen Operativo, BPA y Pretax).
 * @param {Array<object>} annual - Periodos anuales.
 * @param {Array<object>} quarterly - Periodos trimestrales.
 */
export function rederiveIncomeValues(annual, quarterly) {
  const nonOpKeys = ['interestExpense', 'interestIncome', 'equityMethodIncome', 'foreignCurrencyGainLoss', 'otherNonoperatingIncome'];

  for (const rows of [annual, quarterly]) {
    for (const row of rows) {
      const values = row.values;
      if (values.ebtIncludingUnusual === undefined && values.pretaxIncome === undefined && values.operatingIncome === undefined) continue;

      const unusualNet = calculateUnusualTotal(values);
      const nonOpTotal = nonOpKeys.reduce((s, k) => s + (Number(values[k]) || 0), 0);

      if (values.pretaxIncome === undefined && values.ebtIncludingUnusual !== undefined) {
        values.pretaxIncome = values.ebtIncludingUnusual - unusualNet;
      }
      if (values.operatingIncome === undefined) {
        if (values.pretaxIncome !== undefined) {
          values.operatingIncome = values.pretaxIncome - nonOpTotal;
        } else if (values.grossProfit !== undefined && values.operatingExpenses !== undefined) {
          values.operatingIncome = values.grossProfit - values.operatingExpenses;
        }
      }
      if (values.operatingExpenses === undefined && values.grossProfit !== undefined && values.operatingIncome !== undefined) {
        values.operatingExpenses = values.operatingIncome - values.grossProfit;
      }
      if (values.sellingGeneralAdmin === undefined && values.operatingExpenses !== undefined) {
        values.sellingGeneralAdmin = values.operatingExpenses - (Number(values.researchDevelopment) || 0) - (Number(values.amortizationGoodwillIntangibles) || 0) - (Number(values.otherOperatingExpenses) || 0);
      }
      const dep = Number.isFinite(Number(values.depreciationAmortizationTotal))
        ? Number(values.depreciationAmortizationTotal)
        : ((Number(values.depreciation) || 0) + Math.abs(Number(values.cashflowAmortizationGoodwillIntangibles) || 0));
      const opInc = Number(values.operatingIncome);
      const nonCashOperatingCharges = Math.abs(Number(values.goodwillImpairment) || 0)
        + Math.abs(Number(values.assetImpairment) || 0);

      if (Number.isFinite(opInc)) {
        values.ebitda = opInc + dep + nonCashOperatingCharges;
        const rawMr = Math.abs(Number(values.mergerRestructuringCharges) || 0);
        const pureMr = rawMr > nonCashOperatingCharges ? (rawMr - nonCashOperatingCharges) : (nonCashOperatingCharges > 0 ? 0 : rawMr);
        values.ebitdaNormalized = values.ebitda + pureMr;
      }

      if (values.incomeFromContinuingOps === undefined && values.ebtIncludingUnusual !== undefined && values.incomeTax !== undefined) {
        values.incomeFromContinuingOps = Number(values.ebtIncludingUnusual) + Number(values.incomeTax);
      }
      if (values.netIncome === undefined && values.incomeFromContinuingOps !== undefined) {
        values.netIncome = Number(values.incomeFromContinuingOps) + (Number(values.discontinuedOperations) || 0);
      }
      if (values.netIncomeToCommonIncludingUnusual === undefined && values.netIncome !== undefined) {
        const netInc = Number(values.netIncome);
        const min = Number(values.minorityInterestIncome) || 0;
        const pref = Number(values.preferredDividendsOtherAdjustments) || 0;
        values.netIncomeToCommonIncludingUnusual = netInc + min + pref;
      }

      const normRes = calculateNormalizedNetIncomeAndEps(values);
      if (normRes.netIncomeAdjusted !== undefined) {
        values.netIncomeToCommonExcludingUnusual = normRes.netIncomeAdjusted;
      }
      if (normRes.epsNormalized !== undefined) {
        values.epsDilutedNormalized = normRes.epsNormalized;
      }

      const shares = Number(values.weightedSharesDiluted) || Number(values.weightedSharesBasic) || Number(values.sharesOutstanding);
      const netIncomeBase = Number.isFinite(Number(values.netIncomeToCommonIncludingUnusual))
        ? Number(values.netIncomeToCommonIncludingUnusual)
        : (Number.isFinite(Number(values.netIncome)) ? Number(values.netIncome) + (Number(values.minorityInterestIncome) || 0) : null);
      if (!Number.isFinite(Number(values.epsDiluted)) && netIncomeBase !== null && Number.isFinite(shares) && shares > 0) {
        values.epsDiluted = Math.round((netIncomeBase / shares) * 100) / 100;
      }
    }
  }
}
