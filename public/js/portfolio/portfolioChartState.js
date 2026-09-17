/**
 * @fileoverview Estado compartido del módulo PortfolioChartState.
 */

(function (window) {

window.PortfolioChartState = {
  metric: 'gainPct',
  includeDividends: false,
  range: '1y',
  selectedIds: [],
  requestId: 0,
  open: true,
  sliceStart: 0,
  sliceEnd: null,
  cachedData: null,
  redrawRaf: null,
  dataGetter: null,
  apiFetcher: null,
  sectionRenderer: null,
  closeCallback: null,
  selectedIdsCallback: null,
  rangeCallback: null,
  metricCallback: null,
};

})(window);
