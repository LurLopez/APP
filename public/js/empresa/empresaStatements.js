/**
 * @file empresaStatements.js
 * @description Renderizado y cálculo de estados financieros (Income, Balance, Cashflow),
 * ratios derivados y desplazamiento suave por arrastre (drag-to-scroll).
 */

(function (window) {
  const ES = window.EmpresaStatementsState;
  'use strict';

  /* ── Renderizado de la tabla de estados financieros ────────── */

  /**
   * Resuelve o genera la clave única para una métrica del estado financiero.
   * @param {Object} item
   * @param {number} index
   * @returns {string}
   */

  /**
   * Genera el HTML de las celdas de datos para un ítem a través de los periodos visibles.
   * @param {Object} item
   * @param {Array<Object>} rows
   * @param {Array<number>} visibleIndexes
   * @returns {string}
   */

  /**
   * Determina las clases CSS para una fila del estado financiero.
   * @param {Object} item
   * @param {boolean} isSelected
   * @returns {string}
   */

  /**
   * Construye el HTML de una fila de la tabla de estados financieros.
   * @param {Object} item
   * @param {number} index
   * @param {Array<Object>} rows
   * @param {Array<number>} visibleIndexes
   * @param {number} colspan
   * @param {Map} chartMetrics
   * @returns {string}
   */

  /**
   * Configura las columnas y los anchos dinámicos de la tabla de estados financieros.
   * @param {HTMLTableElement} table
   * @param {Array<number>} visibleIndexes
   */

  /**
   * Obtiene la etiqueta de cabecera formateada para un periodo.
   * @param {Object} row
   * @returns {string}
   */

  /**
   * Renderiza la cabecera (thead) de la tabla de estados.
   * @param {HTMLTableSectionElement} thead
   * @param {string} title
   * @param {Array<Object>} rows
   * @param {Array<number>} visibleIndexes
   */

  /**
   * Registra los manejadores de clic en cada fila para activar/desactivar la métrica en el gráfico.
   * @param {HTMLTableElement} table
   * @param {Array<Object>} items
   */

  /**
   * Sincroniza selectores e indicadores del gráfico de métricas.
   */

  /**
   * Renderiza la tabla completa de estados financieros (Income, Balance, Cashflow).
   * @param {Array<Object>} rows
   * @param {Array<number>} visibleIndexes
   * @param {Array<Object>} items
   */

  /* ── Drag to scroll en la tabla de estados ─────────────────── */

  const EmpresaStatements = {
    getRowPrice,
    getRowMarketCap,
    derivedScreenerValue,
    formatScreenerValue,
    isLockedPeriod,
    renderProCell,
    shouldRenderScreenerValueRed,
    rowYear,
    screenerVisibleIndexes,
    itemHasVisibleValues,
    filterEmptyStatementItems,
    renderStatementTable,
    initScreenerTableDrag,
    updateScreenerTableScroll,
    getDragController: () => ES.screenerTableDragController
  };

  window.EmpresaStatements = EmpresaStatements;
  window.getRowPrice = getRowPrice;
  window.getRowMarketCap = getRowMarketCap;
  window.derivedScreenerValue = derivedScreenerValue;
  window.formatScreenerValue = formatScreenerValue;
  window.isLockedPeriod = isLockedPeriod;
  window.renderProCell = renderProCell;
  window.shouldRenderScreenerValueRed = shouldRenderScreenerValueRed;
  window.rowYear = rowYear;
  window.screenerVisibleIndexes = screenerVisibleIndexes;
  window.itemHasVisibleValues = itemHasVisibleValues;
  window.filterEmptyStatementItems = filterEmptyStatementItems;
  window.renderStatementTable = renderStatementTable;
  window.updateScreenerTableScroll = updateScreenerTableScroll;
})(window);
