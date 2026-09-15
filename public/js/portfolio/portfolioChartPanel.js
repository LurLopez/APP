/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;

  function chartChoices() {
    return chartMod().chartChoices ? chartMod().chartChoices(PS.data) : [];
  }

  function chartButtonHtml(id) {
    return chartMod().chartButtonHtml ? chartMod().chartButtonHtml(id, PS.data) : '';
  }

  function chartPanelHtml() {
    return chartMod().chartPanelHtml ? chartMod().chartPanelHtml(PS.data) : '';
  }

  function wirePortfolioChart(scope) {
    if (window.PortfolioChart) {
      window.PortfolioChart.selectedIds = PS.chartSelectedIds;
      window.PortfolioChart.open = PS.chartOpen;
      window.PortfolioChart.metric = PS.chartMetric;
      window.PortfolioChart.range = PS.chartRange;
    }
    return chartMod().wirePortfolioChart?.(scope, {
      getData: () => PS.data,
      api,
      renderSection,
      onClose: () => {
        PS.chartOpen = false;
        if (window.PortfolioChart) window.PortfolioChart.open = false;
        renderSection();
      },
      onSelectedIdsChange: (ids) => {
        PS.chartSelectedIds = ids;
      },
      onRangeChange: (r) => {
        PS.chartRange = r;
      },
      onMetricChange: (m) => {
        PS.chartMetric = m;
      }
    });
  }

  const chartMod = () => window.PortfolioChart || {};
window.chartChoices = chartChoices;
window.chartButtonHtml = chartButtonHtml;
window.chartPanelHtml = chartPanelHtml;
window.wirePortfolioChart = wirePortfolioChart;

})(window);
