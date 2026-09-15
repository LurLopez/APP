/**
 * @fileoverview Estado compartido de las interacciones del módulo PortfolioChartInteractionState.
 */

(function (window) {

window.PortfolioChartInteractionState = {
  isPanning: false,
  panStartX: 0,
  panInitStart: 0,
  panInitEnd: 0,
  panMoved: false,
  zoomAccumulator: 0,
  zoomResetTimer: null,
  isMeasureToolActive: false,
  isMeasuring: false,
  measureStartButton: 2,
  measureStartSvgX: 0,
  measureStartSvgY: 0,
  measureCurrentSvgX: 0,
  measureCurrentSvgY: 0,
  isComparing: false,
  compareStartIdx: 0,
  compareCurrentIdx: 0,
};

})(window);
