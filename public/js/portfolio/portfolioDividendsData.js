/**
 * @file portfolioDividendsData.js
 * @description Conjunto de datos y cálculos para dividendos de cartera (fallback benchmark, computación cliente y distribución).
 */

(function (window) {
  'use strict';

  const PortfolioDividendsData = {
    BENCHMARK_DIVIDEND_DATA,
    computeClientDividendData,
    getDividendData,
    calcNiceYAxis,
    calcDistributionData
  };

  window.PortfolioDividendsData = PortfolioDividendsData;
})(window);
