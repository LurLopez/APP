/**
 * @fileoverview Controlador para la búsqueda de empresas, cotizaciones, gráficos y filings de la SEC.
 * @module api/controllers/screener
 */

export { handleEdgarError, getCompanyDetailsHandler, getCompanyChartHandler, getCompanyValuationHandler, getCompanyFilingsHandler, getCompanyPresentationsHandler, getCompanyHoldersHandler, getFilingDocumentHandler } from './screener.company.controller.js';
export { searchCompaniesHandler } from './screener.search.controller.js';

import { Readable } from 'node:stream';
import {
  searchCompanies,
  getCompanyResults,
  getCompanyFilings,
  getValuationSeries,
  getFilingsWithPresentations,
  getCachedFilingPresentations,
  getFilingsPresentationsMap,
  getFilingPresentations,
  getFilingDocumentStream,
} from '../../services/edgar.service.js';
import { getAnalyzedAccessionsWithRatings } from '../../../db/repositories/analysisRepository.js';
import { resolveAnalysisVersion, isAnalysisOutdated } from '../../agents/sectorAgent.js';
import { getChartSeries, getCompanyHolders } from '../../services/market.service.js';
import { resolveUser } from '../../middleware/auth.middleware.js';

/**
 * Manejador centralizado de errores de la integración con SEC EDGAR.
 * @param {Error & { code?: string }} error - Error devuelto por el servicio EDGAR.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Función para propagar el error.
 */

/**
 * Busca empresas en la base de datos de SEC EDGAR por nombre o ticker.
 * @param {import('express').Request} req - Petición con query param `q`.
 * @param {import('express').Response} res - Lista de empresas que coinciden.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */

/**
 * Obtiene el perfil financiero y resultados clave de una empresa cotizada.
 * @param {import('express').Request} req - Petición con params.ticker.
 * @param {import('express').Response} res - Datos financieros consolidados.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */

/**
 * Obtiene la serie temporal de precios y medias móviles para el gráfico interactivo.
 * @param {import('express').Request} req - Petición con params.ticker y query params (range, ma).
 * @param {import('express').Response} res - Serie de velas/cierres y medias.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */

/**
 * Obtiene múltiplos y ratios de valoración histórica (P/E, EV/FCF, etc.).
 * @param {import('express').Request} req - Petición con params.ticker y query.range.
 * @param {import('express').Response} res - Serie histórica de valoración.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */

/**
 * Consulta la lista de filings presentados ante la SEC junto con su estado analítico.
 * @param {import('express').Request} req - Petición con params.ticker y opciones de presentaciones.
 * @param {import('express').Response} res - Lista de filings con metadatos de análisis y versiones.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */

/**
 * Consulta presentaciones de resultados asociadas a un informe o empresa.
 * @param {import('express').Request} req - Petición con params.ticker y query.accession opcional.
 * @param {import('express').Response} res - Mapa de presentaciones por accession.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */

/**
 * Obtiene los principales accionistas institucionales y fondos de una empresa.
 * @param {import('express').Request} req - Petición con params.ticker.
 * @param {import('express').Response} res - Lista de accionistas institucionales.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */

/**
 * Transmite el documento oficial de la SEC en streaming directo al cliente.
 * @param {import('express').Request} req - Petición con ticker y accession.
 * @param {import('express').Response} res - Stream del documento binario o HTML.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
