/**
 * @fileoverview Agregador financiero y consolidador del estado global de la cartera (posiciones, rentabilidad, dividendos y asignaciones).
 * @module services/portfolio/portfolioAggregator
 */

export { regionForCountry, instrumentTypeLabel } from './portfolioAggregator.helpers.js';
export { getPortfolio } from './portfolioAggregator.build.service.js';

import * as portfolioRepository from '../../../db/repositories/portfolioRepository.js';
import { listCalendarTickers, getUserPreferences } from '../../../db/repositories/watchlistRepository.js';
import { getMarketQuote, getDividendHistory } from '../market.service.js';
import { getCompanyOrigin, getCompanyFilings } from '../edgar.service.js';
import { buildState, round } from './portfolioFifo.service.js';
import { buildPortfolioDividends } from './portfolioDividends.service.js';
import { buildPortfolioCalendarEvents } from './portfolioCalendarEvents.service.js';

/**
 * Consulta y calcula el estado consolidado de la cartera completa del usuario.
 * @param {number} userId - ID del usuario autenticado.
 * @returns {Promise<Object>} Resumen, posiciones detalladas, dividendos, eventos y asignaciones.
 */
