/**
 * @fileoverview Construcción de históricos multianuales (acciones, dividendos, recompras de acciones y normalización fiscal).
 * @module agents/analyst/historyBuilders
 */

export { formatRepurchaseShares, repurchaseAveragePrice, buildRepurchaseSecTable, enrichRepurchaseSnippet, selectAnnualRows, buildSharesHistoryFromEdgar, buildRepurchaseHistoryFromEdgar, buildRepurchaseSharesHistoryFromEdgar, mergeRepurchaseShares } from './repurchaseHistoryBuilders.js';
export { buildDividendHistoryFromEdgar, mergeDividendHistory, mergeHistoryByYear, buildFutureProjectionText, buildShareCountEvolutionText, getTaxNormalizationData } from './dividendHistoryBuilders.js';

import {
  formatFiscalEndLabel,
  parseFinancialValue,
  parseLooseAmount,
  formatFinancialValue,
  extractIncomeTaxesPaid,
} from './financialParsers.js';

/**
 * Selecciona las filas anuales del ejercicio actual y del inmediatamente anterior por fecha exacta de corte.
 * @param {Array<object>} annualSeries - Series anuales de EDGAR.
 * @param {object} [options={}] - Opciones de filtrado.
 * @returns {{currentAnnualRow: object|null, previousAnnualRow: object|null}} Filas identificadas.
 */

