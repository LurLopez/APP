/**
 * @fileoverview Cálculo de métricas de valoración de empresa (extraído de ValuationMetrics.js).
 */

(function (window) {


  function formatPrice(val) {
    return window.formatProfilePrice ? window.formatProfilePrice(val) : `${val} $`;
  }

  function formatCompact(val) {
    return window.formatProfileCompactUsd ? window.formatProfileCompactUsd(val) : `${val}`;
  }

  function formatMult(val, digits = 2) {
    return window.formatMultiple ? window.formatMultiple(val, digits) : `${val}x`;
  }

  function formatPct(val) {
    return window.formatProfilePercent ? window.formatProfilePercent(val) : `${val} %`;
  }

  function calculateValuationMetrics(data) {
    if (!data) return null;
    const profile = data.profile ?? {};
    const metrics = profile.metrics ?? {};
    const market = profile.market ?? {};
    const annual = data.annual ?? [];
    const quarterly = data.quarterly ?? [];

    const price = Number.isFinite(Number(market.price)) ? Number(market.price) : null;
    const shares = Number.isFinite(Number(metrics.shares)) ? Number(metrics.shares) : null;
    const marketCap = Number.isFinite(Number(metrics.marketCap))
      ? Number(metrics.marketCap)
      : (price !== null && shares !== null ? price * shares : null);

    // Calcular TTM sumando los últimos 4 trimestres reportados
    const latestAnnual = annual[0]?.values ?? {};
    const latestQuarter = quarterly[0]?.values ?? {};
    const latestBalance = latestQuarter.totalDebt !== undefined ? latestQuarter : latestAnnual;
    const hasQuarters = quarterly.length >= 4;
    const q4 = hasQuarters ? quarterly.slice(0, 4) : [];

    // EBITDA TTM
    let ebitda = null;
    if (hasQuarters) {
      const sumNorm = q4.reduce((acc, q) => {
        const v = Number(q.values?.ebitdaNormalized ?? q.values?.ebitda ?? (Number(q.values?.operatingIncome) + (Number(q.values?.depreciationAmortizationTotal) || Number(q.values?.depreciation) || 0)));
        return Number.isFinite(v) ? acc + v : acc;
      }, 0);
      const sumRaw = q4.reduce((acc, q) => {
        const v = Number(q.values?.ebitda ?? (Number(q.values?.operatingIncome) + (Number(q.values?.depreciationAmortizationTotal) || Number(q.values?.depreciation) || 0)));
        return Number.isFinite(v) ? acc + v : acc;
      }, 0);
      if (sumNorm > 0) ebitda = sumNorm;
      else if (sumRaw > 0) ebitda = sumRaw;
    }
    if (!ebitda) {
      ebitda = Number.isFinite(Number(latestAnnual.ebitdaNormalized ?? latestAnnual.ebitda)) && Number(latestAnnual.ebitdaNormalized ?? latestAnnual.ebitda) > 0
        ? Number(latestAnnual.ebitdaNormalized ?? latestAnnual.ebitda)
        : (Number.isFinite(Number(metrics.ebitda)) ? Number(metrics.ebitda) : null);
    }

    // Deuda y Caja
    const totalDebt = Number.isFinite(Number(latestBalance.totalDebt))
      ? Number(latestBalance.totalDebt)
      : (Number.isFinite(Number(latestAnnual.totalDebt)) ? Number(latestAnnual.totalDebt) : (Number.isFinite(Number(metrics.totalDebt)) ? Number(metrics.totalDebt) : null));

    const cash = Number.isFinite(Number(latestBalance.cashAndShortTermInvestments ?? latestBalance.cash))
      ? Number(latestBalance.cashAndShortTermInvestments ?? latestBalance.cash)
      : (Number.isFinite(Number(latestAnnual.cashAndShortTermInvestments ?? latestAnnual.cash))
        ? Number(latestAnnual.cashAndShortTermInvestments ?? latestAnnual.cash)
        : (Number.isFinite(Number(metrics.cash)) ? Number(metrics.cash) : null));

    const netDebt = (totalDebt !== null && cash !== null)
      ? totalDebt - cash
      : (Number.isFinite(Number(latestBalance.netDebt))
        ? Number(latestBalance.netDebt)
        : (Number.isFinite(Number(latestAnnual.netDebt)) ? Number(latestAnnual.netDebt) : (Number.isFinite(Number(metrics.netDebt)) ? Number(metrics.netDebt) : null)));

    const enterpriseValue = (marketCap !== null && netDebt !== null)
      ? marketCap + netDebt
      : (Number.isFinite(Number(metrics.enterpriseValue)) ? Number(metrics.enterpriseValue) : marketCap);

    const evToEbitda = (enterpriseValue !== null && enterpriseValue > 0 && ebitda && ebitda > 0)
      ? enterpriseValue / ebitda
      : (Number.isFinite(Number(metrics.evToEbitda)) && Number(metrics.evToEbitda) > 0 ? Number(metrics.evToEbitda) : null);

    // BPA GAAP TTM
    let eps = null;
    if (hasQuarters) {
      const epsVals = q4.map((q) => Number(q.values?.epsDiluted));
      if (epsVals.every((v) => Number.isFinite(v))) {
        eps = epsVals.reduce((acc, v) => acc + v, 0);
      }
    }
    if (eps === null) {
      eps = Number.isFinite(Number(latestAnnual.epsDiluted))
        ? Number(latestAnnual.epsDiluted)
        : (Number.isFinite(Number(metrics.eps)) ? Number(metrics.eps) : null);
    }

    // BPA diluido ajustado TTM
    let epsNormalized = null;
    if (hasQuarters) {
      const epsNormVals = q4.map((q) => Number(q.values?.epsDilutedNormalized ?? q.values?.epsDiluted));
      if (epsNormVals.every((v) => Number.isFinite(v))) {
        epsNormalized = epsNormVals.reduce((acc, v) => acc + v, 0);
      }
    }
    if (epsNormalized === null) {
      epsNormalized = Number.isFinite(Number(latestAnnual.epsDilutedNormalized))
        ? Number(latestAnnual.epsDilutedNormalized)
        : (eps !== null ? eps : null);
    }

    const peRatio = (price !== null && eps !== null && eps > 0)
      ? price / eps
      : (Number.isFinite(Number(metrics.peRatio)) && Number(metrics.peRatio) > 0 ? Number(metrics.peRatio) : null);

    const peRatioNormalized = (price !== null && epsNormalized !== null && epsNormalized > 0)
      ? price / epsNormalized
      : null;

    const netDebtToEbitda = (netDebt !== null && ebitda && ebitda > 0)
      ? netDebt / ebitda
      : (Number.isFinite(Number(metrics.netDebtToEbitda)) ? Number(metrics.netDebtToEbitda) : null);

    // Dividendo por acción TTM
    let dividendPerShare = null;
    if (hasQuarters) {
      const dpsVals = q4.map((q) => {
        let d = Number(q.values?.dividendPerShare);
        if (d > 2.0 && q.values?.dividendsCommon) {
          const sh = Number(q.values?.weightedSharesDiluted || q.values?.sharesOutstanding);
          if (sh > 0) d = Math.abs(Number(q.values.dividendsCommon)) / sh;
        }
        return d;
      });
      if (dpsVals.every((v) => Number.isFinite(v) && v > 0)) {
        dividendPerShare = Math.round(dpsVals.reduce((acc, v) => acc + v, 0) * 100) / 100;
      }
    }
    if (dividendPerShare === null) {
      const annDps = Number(latestAnnual.dividendPerShare);
      const metDps = Number(metrics.dividendPerShare);
      dividendPerShare = Number.isFinite(annDps) && annDps > 0
        ? annDps
        : (Number.isFinite(metDps) && metDps > 0 ? metDps : null);
    }
    if (dividendPerShare !== null && dividendPerShare <= 0) {
      dividendPerShare = null;
    }

    const dividendYield = (dividendPerShare !== null && dividendPerShare > 0 && price && price > 0)
      ? (dividendPerShare / price) * 100
      : (metrics.dividendYield !== null && metrics.dividendYield !== undefined && Number.isFinite(Number(metrics.dividendYield)) && Number(metrics.dividendYield) > 0
        ? Number(metrics.dividendYield)
        : null);

    const payoutRatio = (dividendPerShare !== null && dividendPerShare > 0 && eps !== null && eps > 0)
      ? (dividendPerShare / eps) * 100
      : null;

    const payoutRatioNormalized = (dividendPerShare !== null && dividendPerShare > 0 && epsNormalized !== null && epsNormalized > 0)
      ? (dividendPerShare / epsNormalized) * 100
      : null;

    // Flujo de caja libre (FCF) TTM
    let freeCashFlow = null;
    if (hasQuarters) {
      const fcfVals = q4.map((q) => Number(q.values?.freeCashFlow));
      if (fcfVals.every((v) => Number.isFinite(v))) {
        freeCashFlow = fcfVals.reduce((acc, v) => acc + v, 0);
      }
    }
    if (freeCashFlow === null) {
      freeCashFlow = Number.isFinite(Number(latestAnnual.freeCashFlow))
        ? Number(latestAnnual.freeCashFlow)
        : (Number.isFinite(Number(metrics.freeCashFlow)) ? Number(metrics.freeCashFlow) : null);
    }

    // FCF por acción TTM
    let fcfPerShare = null;
    if (freeCashFlow !== null && shares && shares > 0) {
      fcfPerShare = freeCashFlow / shares;
    } else if (hasQuarters) {
      const fcfpsVals = q4.map((q) => Number(q.values?.cashFlowPerShare));
      if (fcfpsVals.every((v) => Number.isFinite(v))) {
        fcfPerShare = fcfpsVals.reduce((acc, v) => acc + v, 0);
      }
    }
    if (fcfPerShare === null && Number.isFinite(Number(latestAnnual.cashFlowPerShare))) {
      fcfPerShare = Number(latestAnnual.cashFlowPerShare);
    } else if (fcfPerShare === null && Number.isFinite(Number(metrics.cashFlowPerShare))) {
      fcfPerShare = Number(metrics.cashFlowPerShare);
    }

    // P / FCF
    const priceToFcf = (price !== null && fcfPerShare !== null && fcfPerShare > 0)
      ? price / fcfPerShare
      : (marketCap !== null && freeCashFlow !== null && freeCashFlow > 0
        ? marketCap / freeCashFlow
        : (Number.isFinite(Number(metrics.priceToFcf)) && Number(metrics.priceToFcf) > 0 ? Number(metrics.priceToFcf) : null));

    return {
      price,
      shares,
      marketCap,
      totalDebt,
      cash,
      netDebt,
      enterpriseValue,
      ebitda,
      evToEbitda,
      eps,
      epsNormalized,
      peRatio,
      peRatioNormalized,
      freeCashFlow,
      fcfPerShare,
      priceToFcf,
      netDebtToEbitda,
      dividendPerShare,
      dividendYield,
      payoutRatio,
      payoutRatioNormalized,
      currency: data.currency || market.currency || 'USD',
    };
  }

window.formatPrice = formatPrice;
window.formatCompact = formatCompact;
window.formatMult = formatMult;
window.formatPct = formatPct;
window.calculateValuationMetrics = calculateValuationMetrics;

})(window);
