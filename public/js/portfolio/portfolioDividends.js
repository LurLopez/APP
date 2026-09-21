/**
 * @file portfolioDividends.js
 * @description Renderizado del panel de dividendos, distribución en anillo, gráfico mensual apilado y matriz.
 */

(function (window) {
  const DS = window.PortfolioDividendsState;
  'use strict';

  const PortfolioDividends = {
    dividendDistributionHtml,
    dividendStackedChartHtml,
    dividendMatrixHtml,
    dividendSummaryCardsHtml,
    exportDividendsCsv,
    dividendPanelHtml,
    wireDividendDashboard,
    get timelineYear() { return DS.dividendDistTimelineYear; },
    set timelineYear(v) { DS.dividendDistTimelineYear = v; },
    get mode() { return DS.dividendDistMode; },
    set mode(v) { DS.dividendDistMode = v; },
    get period() { return DS.dividendDistPeriod; },
    set period(v) { DS.dividendDistPeriod = v; },
    get metric() { return DS.dividendDistMetric; },
    set metric(v) { DS.dividendDistMetric = v; }
  };

  window.PortfolioDividends = PortfolioDividends;
})(window);
