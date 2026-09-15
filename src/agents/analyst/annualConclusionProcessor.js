/**
 * @fileoverview Procesamiento y enriquecimiento defensivo de la conclusión del informe anual (Form 10-K).
 * Incluye recompras, perspectivas (outlook), deuda, adquisiciones, dividendos y watchlist.
 * @module agents/analyst/annualConclusionProcessor
 */

export { processCeoChangeSection, processRepurchasesSection } from './annualConclusionCeoRepurchases.js';
export { fetchCeoMarketReaction, processOutlookSection, processDebtSection, processAcquisitionsDividendsAndWatchlist, renumberConclusionSections } from './annualConclusionSections.js';

import {
  isPlaceholderText,
  cleanAssetDescription,
  parseLooseReportNumber,
} from './financialParsers.js';
import {
  buildFutureProjectionText,
  buildShareCountEvolutionText,
  buildRepurchaseSecTable,
  enrichRepurchaseSnippet,
  mergeHistoryByYear,
  mergeDividendHistory,
} from './historyBuilders.js';
import {
  withOutlookComparison,
  completeOutlookPriorColumn,
  mergeOutlookRows,
} from './outlookHelpers.js';
import { getHistoricalPrices } from '../../services/market.service.js';

/**
 * Consulta la reacción real de la cotización en torno a la fecha de anuncio del cambio de CEO.
 * @param {string} announcementDate - Fecha de anuncio (ISO o texto que la contenga).
 * @param {string} ticker - Ticker bursátil de la compañía.
 * @returns {Promise<object|null>} Datos de variación de precio o null si no se pueden obtener.
 */

/**
 * Normaliza la sección de cambio de CEO (solo se incluye si hubo relevo en el periodo).
 * @param {object} conclusion - Objeto de conclusión del reporte.
 * @param {object} rawAnn - Detalles anuales extraídos.
 */

/**
 * Normaliza la sección de recompras de acciones en el informe anual.
 * @param {object} conclusion - Objeto de conclusión del reporte.
 * @param {object} rawAnn - Detalles anuales extraídos.
 * @param {object} extracted - Datos globales extraídos.
 */

/**
 * Normaliza la sección de perspectivas oficiales (outlook/guidance).
 */

/**
 * Normaliza la sección de deuda y vencimientos contractuales.
 */

/**
 * Normaliza las secciones de adquisiciones, dividendos, watchlist y rating.
 */

/**
 * Numera correlativamente las secciones de conclusión presentes.
 * @param {object} conclusion - Objeto de conclusión del informe.
 */
