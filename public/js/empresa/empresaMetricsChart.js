/**
 * @file empresaMetricsChart.js
 * @description Gráfico interactivo multi-métrica y multi-empresa para datos financieros (barras, líneas, CAGR y comparación).
 */

(function (window) {
  const EMS = window.EmpresaMetricsState;
  'use strict';

  const chartMetrics = new Map();

  /* Multi-company comparison state */
  const comparisonCompanies = new Map(); // ticker -> { ticker, name, data }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMetricsChartListeners);
  } else {
    initMetricsChartListeners();
  }

  const EmpresaMetricsChart = {
    renderMetricsChart,
    toggleChartMetric,
    removeChartMetric,
    syncMarginSelector,
    syncChartRowSelection,
    metricsChartRows,
    renderComparisonChips,
    addComparisonCompany,
    removeComparisonCompany,
    resetComparison,
    chartMetrics,
    comparisonCompanies
  };

  window.EmpresaMetricsChart = EmpresaMetricsChart;
  window.renderMetricsChart = renderMetricsChart;
  window.toggleChartMetric = toggleChartMetric;
  window.removeChartMetric = removeChartMetric;
  window.syncMarginSelector = syncMarginSelector;
  window.metricsChartRows = metricsChartRows;
  window.chartMetrics = chartMetrics;
  window.resetComparison = resetComparison;
  window.chartMetrics = chartMetrics;
  window.comparisonCompanies = comparisonCompanies;
})(window);
