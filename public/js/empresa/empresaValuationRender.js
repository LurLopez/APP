/**
 * @fileoverview Render de tarjetas de valoración de empresa (extraído de ValuationRender.js).
 */

(function (window) {


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
    if (epsLabelEl) epsLabelEl.textContent = window.I18n?.t?.(valPeAdjusted ? 'BPA ajustado' : 'BPA normal') ?? (valPeAdjusted ? 'BPA ajustado' : 'BPA normal');

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
    if (payoutEpsLabelEl) payoutEpsLabelEl.textContent = window.I18n?.t?.(valPeAdjusted ? 'BPA ajustado' : 'BPA normal') ?? (valPeAdjusted ? 'BPA ajustado' : 'BPA normal');

    // Tarjeta 6: P / FCF
    const pfcfEl = document.querySelector('#val-pfcf');
    const pfcfPriceEl = document.querySelector('#val-pfcf-price');
    const fcfShareEl = document.querySelector('#val-fcf-share');

    if (pfcfEl) pfcfEl.textContent = v.priceToFcf !== null && v.priceToFcf > 0 ? formatMult(v.priceToFcf) : '—';
    if (pfcfPriceEl) pfcfPriceEl.textContent = formatPrice(v.price);
    if (fcfShareEl) fcfShareEl.textContent = v.fcfPerShare !== null ? formatPrice(v.fcfPerShare) : '—';
  }

window.renderValuation = renderValuation;

})(window);
