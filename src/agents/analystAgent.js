/**
 * @fileoverview Fachada pública (Facade) del Agente Analista de Cifra.
 * Re-exporta la clase orquestadora y las funciones públicas manteniendo compatibilidad estricta.
 * @module agents/analystAgent
 */

export { AnalystAgent } from './analyst/analystAgentCore.js';
export {
  completeOutlookPriorColumn,
  mergeOutlookRows,
  withOutlookComparison,
} from './analyst/outlookHelpers.js';
export { selectAnnualRows } from './analyst/historyBuilders.js';
