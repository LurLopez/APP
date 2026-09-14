/**
 * @file empresaValuationCards.js
 * @description Cálculo y renderizado de tarjetas resumen y ratios clave de valoración (EV/EBITDA, PER, P/FCF, Deuda Neta/EBITDA, Payout, Dividend Yield).
 */

(function (window) {
  'use strict';

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

  /**
   * Calcula métricas y múltiplos de valoración TTM y normalizados a partir del dataset de la empresa.
   * @param {Object} data
   * @returns {Object|null}
   */
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
      dividendPerShare = Number.isFinite(Number(latestAnnual.dividendPerShare)) && Number(latestAnnual.dividendPerShare) > 0
        ? Number(latestAnnual.dividendPerShare)
        : (Number.isFinite(Number(metrics.dividendPerShare)) ? Number(metrics.dividendPerShare) : null);
    }

    const dividendYield = (dividendPerShare !== null && price && price > 0)
      ? (dividendPerShare / price) * 100
      : (Number.isFinite(Number(metrics.dividendYield)) ? Number(metrics.dividendYield) : null);

    const payoutRatio = (dividendPerShare !== null && eps !== null && eps > 0)
      ? (dividendPerShare / eps) * 100
      : null;

    const payoutRatioNormalized = (dividendPerShare !== null && epsNormalized !== null && epsNormalized > 0)
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

  /**
   * Renderiza el bloque de tarjetas de resumen de valoración.
   * @param {Object} data
   */
  function renderValuation(data) {
    const container = document.querySelector('#val-summary-block');
    if (!container || !data) return;

    const v = calculateValuationMetrics(data);
    if (!v) return;

    const valCurrencyEl = document.querySelector('#val-currency');
    const valPriceEl = document.querySelector('#val-price');
    const valMarketCapEl = document.querySelector('#val-market-cap');
    if (valCurrencyEl) valCurrencyEl.textContent = v.currency;
    if (valPriceEl) valPriceEl.textContent = formatPrice(v.price);
    if (valMarketCapEl) valMarketCapEl.textContent = formatCompact(v.marketCap);

    // Tarjeta 1: EV / EBITDA
    const evEbitdaEl = document.querySelector('#val-ev-ebitda');
    const evValEl = document.querySelector('#val-ev');
    const ebitdaValEl = document.querySelector('#val-ebitda');
    if (evEbitdaEl) evEbitdaEl.textContent = v.evToEbitda !== null && v.evToEbitda > 0 ? formatMult(v.evToEbitda) : '—';
    if (evValEl) evValEl.textContent = formatCompact(v.enterpriseValue);
    if (ebitdaValEl) ebitdaValEl.textContent = formatCompact(v.ebitda);

    // Tarjeta 2: PER
    const valPeAdjusted = Boolean(window.valPeAdjusted ?? true);
    const peEl = document.querySelector('#val-pe');
    const pePriceEl = document.querySelector('#val-pe-price');
    const epsEl = document.querySelector('#val-eps');
    const epsLabelEl = document.querySelector('#val-eps-label');
    const peToggleEl = document.querySelector('#val-pe-adjusted-toggle');
    const chartPeToggleEl = document.querySelector('#val-chart-adjusted-checkbox');
    const payoutToggleEl = document.querySelector('#val-payout-adjusted-toggle');

    if (peToggleEl) peToggleEl.checked = valPeAdjusted;
    if (chartPeToggleEl) chartPeToggleEl.checked = valPeAdjusted;
    if (payoutToggleEl) payoutToggleEl.checked = valPeAdjusted;

    const activePe = valPeAdjusted ? v.peRatioNormalized : v.peRatio;
    const activeEps = valPeAdjusted ? v.epsNormalized : v.eps;

    if (peEl) peEl.textContent = activePe !== null && activePe > 0 ? formatMult(activePe) : '—';
    if (pePriceEl) pePriceEl.textContent = formatPrice(v.price);
    if (epsEl) epsEl.textContent = activeEps !== null ? formatPrice(activeEps) : '—';
    if (epsLabelEl) epsLabelEl.textContent = valPeAdjusted ? 'BPA ajustado' : 'BPA normal';

    // Tarjeta 3: Deuda Neta / EBITDA
    const ndEbitdaEl = document.querySelector('#val-netdebt-ebitda');
    const ndValEl = document.querySelector('#val-netdebt');
    const ebitdaNdEl = document.querySelector('#val-ebitda-nd');
    if (ndEbitdaEl) {
      if (v.netDebtToEbitda !== null && v.netDebtToEbitda !== undefined) {
        if (v.netDebt < 0) {
          ndEbitdaEl.innerHTML = `${formatMult(v.netDebtToEbitda)} <small style="font-size:12px;color:#16a34a;font-weight:700;font-family:Arial,sans-serif;">(Caja neta)</small>`;
        } else {
          ndEbitdaEl.textContent = formatMult(v.netDebtToEbitda);
        }
      } else {
        ndEbitdaEl.textContent = '—';
      }
    }
    if (ndValEl) ndValEl.textContent = formatCompact(v.netDebt);
    if (ebitdaNdEl) ebitdaNdEl.textContent = formatCompact(v.ebitda);

    // Tarjeta 4: Yield del dividendo
    const yieldEl = document.querySelector('#val-dividend-yield');
    const dpsEl = document.querySelector('#val-dps');
    const yieldPriceEl = document.querySelector('#val-yield-price');
    if (yieldEl) yieldEl.textContent = formatPct(v.dividendYield);
    if (dpsEl) dpsEl.textContent = formatPrice(v.dividendPerShare);
    if (yieldPriceEl) yieldPriceEl.textContent = formatPrice(v.price);

    // Tarjeta 5: Payout del dividendo
    const payoutEl = document.querySelector('#val-payout-ratio');
    const payoutDpsEl = document.querySelector('#val-payout-dps');
    const payoutEpsEl = document.querySelector('#val-payout-eps');
    const payoutEpsLabelEl = document.querySelector('#val-payout-eps-label');

    const activePayout = valPeAdjusted ? v.payoutRatioNormalized : v.payoutRatio;

    if (payoutEl) payoutEl.textContent = activePayout !== null && activePayout >= 0 ? formatPct(activePayout) : '—';
    if (payoutDpsEl) payoutDpsEl.textContent = formatPrice(v.dividendPerShare);
    if (payoutEpsEl) payoutEpsEl.textContent = activeEps !== null ? formatPrice(activeEps) : '—';
    if (payoutEpsLabelEl) payoutEpsLabelEl.textContent = valPeAdjusted ? 'BPA ajustado' : 'BPA normal';

    // Tarjeta 6: P / FCF
    const pfcfEl = document.querySelector('#val-pfcf');
    const pfcfPriceEl = document.querySelector('#val-pfcf-price');
    const fcfShareEl = document.querySelector('#val-fcf-share');

    if (pfcfEl) pfcfEl.textContent = v.priceToFcf !== null && v.priceToFcf > 0 ? formatMult(v.priceToFcf) : '—';
    if (pfcfPriceEl) pfcfPriceEl.textContent = formatPrice(v.price);
    if (fcfShareEl) fcfShareEl.textContent = v.fcfPerShare !== null ? formatPrice(v.fcfPerShare) : '—';
  }

  const EmpresaValuationCards = {
    calculateValuationMetrics,
    renderValuation,
  };

  window.EmpresaValuationCards = EmpresaValuationCards;
  window.calculateValuationMetrics = calculateValuationMetrics;
  window.renderValuation = renderValuation;
})(window);
