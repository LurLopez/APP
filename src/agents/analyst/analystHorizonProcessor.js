/**
 * @fileoverview Procesamiento defensivo de horizontes financieros (Ventas, Cash Flow y Asignación de Capital).
 * @module agents/analyst/analystHorizonProcessor
 */

export { normalizeSalesBlock } from './analystSalesProcessor.js';
export { normalizeCashFlowBlock, normalizeCapitalBlock } from './analystCashCapitalProcessor.js';

import {
  parseFinancialValue,
  formatFinancialValue,
  parseLooseReportNumber,
  formatCellNumber,
  normalizeNumericCell,
  cleanAssetDescription,
} from './financialParsers.js';
import { getTaxNormalizationData } from './historyBuilders.js';

/**
 * Normaliza y verifica el bloque de ventas y cuenta de resultados de un horizonte.
 * @param {object} horizon - Bloque de horizonte temporal.
 * @param {object} extracted - Datos extraídos por el modelo.
 */

/**
 * Normaliza el bloque de flujos de caja y sus notas de capital circulante e impuestos.
 * @param {object} horizon - Bloque de horizonte.
 * @param {object} extracted - Datos globales extraídos.
 */

/**
 * Normaliza el bloque de asignación de capital (Libre, Deuda, Caja, Recompras, Desinversiones).
 * @param {object} horizon - Bloque de horizonte.
 * @param {object} extracted - Datos extraídos.
 */
