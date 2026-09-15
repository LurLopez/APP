/**
 * @file empresaValuationCards.js
 * @description Cálculo y renderizado de tarjetas resumen y ratios clave de valoración (EV/EBITDA, PER, P/FCF, Deuda Neta/EBITDA, Payout, Dividend Yield).
 */

(function (window) {
  'use strict';

  /**
   * Calcula métricas y múltiplos de valoración TTM y normalizados a partir del dataset de la empresa.
   * @param {Object} data
   * @returns {Object|null}
   */

  /**
   * Renderiza el bloque de tarjetas de resumen de valoración.
   * @param {Object} data
   */

  const EmpresaValuationCards = {
    calculateValuationMetrics,
    renderValuation,
  };

  window.EmpresaValuationCards = EmpresaValuationCards;
  window.calculateValuationMetrics = calculateValuationMetrics;
  window.renderValuation = renderValuation;
})(window);
