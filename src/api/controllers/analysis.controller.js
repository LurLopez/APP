/**
 * @fileoverview Controlador principal para la gestión y ejecución de análisis de informes financieros.
 * @module api/controllers/analysis
 */

export { redirectToOriginalSource, uploadAndAnalyzePdf, uploadErrorHandler, listUserAnalyses, listUserAnalysisCompanies } from './analysis.upload.controller.js';
export { getAnalysisDetail } from './analysis.detail.controller.js';

import multer from 'multer';
import { analyzePdf, buildDownloadBase, buildPresentationText } from '../../services/analysis.service.js';
import { AgentError } from '../../agents/baseAgent.js';
import { AiProviderError } from '../../services/ai/modelProvider.js';
import {
  listAnalyses,
  getAnalysisById,
  updateAnalysis,
  listAnalysisCompanies,
} from '../../../db/repositories/analysisRepository.js';
import { getCompanyFilings } from '../../services/edgar.service.js';
import { resolveAnalysisVersion, isAnalysisOutdated } from '../../agents/sectorAgent.js';
import { resolveUser } from '../../middleware/auth.middleware.js';
import { getAiQuota, reserveAiQuota, refundAiQuota } from '../../services/aiQuota.service.js';
import {
  parseIdParam,
  parseDateFilter,
  isRealPdf,
  escapeHtml,
  isAnalysisVisible,
} from '../../utils/validate.js';

/**
 * Middleware para gestionar errores generados por la carga de archivos vía Multer.
 * @param {Error} error - Error capturado.
 * @param {import('express').Request} _req - Petición HTTP.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {void}
 */

/**
 * Renderiza una página HTML informativa cuando no se puede localizar el documento original.
 * @private
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {string} message - Mensaje amigable descriptivo.
 * @param {number} [status=404] - Código de estado HTTP.
 */

/**
 * Convierte un valor de fecha a formato ISO AAAA-MM-DD.
 * @private
 * @param {unknown} value - Fecha candidata.
 * @returns {string|null} Fecha formateada o null.
 */

/**
 * Procesa la subida y análisis de un informe financiero en PDF mediante los agentes de IA.
 * @param {import('express').Request} req - Petición HTTP con archivos en req.files y usuario autenticado.
 * @param {import('express').Response} res - Respuesta HTTP con el informe estructurado.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */

/**
 * Consulta la lista paginada y filtrada de análisis ejecutados por el usuario autenticado.
 * @param {import('express').Request} req - Petición con query params (filtros de fecha, ticker, tipo).
 * @param {import('express').Response} res - Lista de análisis procesados.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */

/**
 * Retorna las empresas únicas analizadas por el usuario autenticado para autocompletar filtros.
 * @param {import('express').Request} req - Petición con query param opcional `q`.
 * @param {import('express').Response} res - Lista de empresas encontradas.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */

/**
 * Obtiene el detalle completo de un análisis existente junto con el estado de su versión analítica.
 * @param {import('express').Request} req - Petición HTTP con params.id.
 * @param {import('express').Response} res - Detalle estructurado del análisis.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */

/**
 * Redirige al documento oficial original en SEC EDGAR asociado al análisis solicitado.
 * @param {import('express').Request} req - Petición con params.id del análisis.
 * @param {import('express').Response} res - Redirección 302 hacia SEC EDGAR o error HTML.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */
