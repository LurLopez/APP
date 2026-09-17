/**
 * @file portfolioChart.js
 * @description Módulo de gráfico interactivo y comparativo de cartera con escala temporal estilo TradingView.
 */

(function (window) {
  'use strict';

  const PCS = window.PortfolioChartState;














  const PortfolioChart = {
    CHART_METRICS,
    CHART_RANGES,
    CHART_PALETTE,
    RANGE_DAYS,
    SPANISH_MONTHS,
    PREDEFINED_TABS,
    tabForPosition,
    chartChoices,
    chartButtonHtml,
    syncChartTriggerButtons,
    chartPanelHtml,
    computeNiceStep,
    computeChartScale,
    getActiveChartGeometry,
    chartFormat,
    chartAxisFormat,
    formatTradingViewHoverDate,
    fmtDateDisplay,
    getTradingViewDateTicks,
    computeSliceIndicesForRange,
    renderTimelineSparkline,
    renderChartMainSvg,
    zoomChartByStep,
    drawPortfolioChart,
    syncPickerChecked,
    loadPortfolioChart,
    wirePortfolioChart,
    reset() {
      PCS.selectedIds = [];
      PCS.open = true;
      PCS.metric = 'gainPct';
      PCS.includeDividends = false;
      PCS.range = '1y';
      PCS.requestId = 0;
      PCS.sliceStart = 0;
      PCS.sliceEnd = null;
      PCS.cachedData = null;
      PCS.redrawRaf = null;
      if (typeof window.syncChartTriggerButtons === 'function') {
        window.syncChartTriggerButtons(document);
      }
    },
    get selectedIds() { return PCS.selectedIds; },
    set selectedIds(ids) {
      PCS.selectedIds = Array.isArray(ids) ? ids : [];
      if (typeof window.syncChartTriggerButtons === 'function') {
        window.syncChartTriggerButtons(document);
      }
    },
    get open() { return PCS.open; },
    set open(v) { PCS.open = Boolean(v); },
    get metric() { return PCS.metric; },
    set metric(v) { PCS.metric = v; },
    get includeDividends() { return PCS.includeDividends; },
    set includeDividends(v) { PCS.includeDividends = Boolean(v); },
    get range() { return PCS.range; },
    set range(v) { PCS.range = v; },
    get cachedData() { return PCS.cachedData; },
    set cachedData(v) { PCS.cachedData = v; }
  };

  window.PortfolioChart = PortfolioChart;
})(window);
