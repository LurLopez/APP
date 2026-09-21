/**
 * @fileoverview Construcción y desacumulación de series temporales trimestrales y anuales a partir de Company Facts.
 * @module services/edgar/factsSeries
 */

export { combineConceptData, pickConceptData, buildSeries } from './factsSeries.core.js';

import {
  CONCEPTS,
  FLOW_KEYS,
  INSTANT_KEYS,
  NON_ADDITIVE_KEYS,
  normalizeConceptValue,
  classifyFrame,
} from './statementConcepts.js';
import {
  calculateUnusualTotal,
  calculateNormalizedNetIncomeAndEps,
} from './rederiveStatements.js';

