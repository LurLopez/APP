/**
 * @fileoverview Controlador para el análisis, regeneración, previsualización y control de versiones de filings de la SEC.
 * @module api/controllers/filingAnalysis
 */

export { normalizeAccession, analyzeFilingHandler, regenerateFilingHandler } from './filing.analysis.controller.js';
export { getFilingVersionsHandler, getFilingPreviewHandler, getFilingPreviewPageHandler } from './filing.versions.controller.js';

import fs from 'node:fs';
import path from 'node:path';
import {
  getFilingContentBuffer,
  getPresentationBuffers,
  getFilingPreview,
} from '../../services/edgar.service.js';
import {
  analyzePdf,
  analyzeText,
  htmlToText,
  buildPresentationText,
  buildDownloadBase,
} from '../../services/analysis.service.js';
import { generateReportPdf, GENERATED_DIR } from '../../services/report.service.js';
import {
  findLatestDoneAnalysis,
  getAnalysisVersions,
  findUserAnalysis,
  createAnalysis,
  updateAnalysis,
} from '../../../db/repositories/analysisRepository.js';
import { resolveAnalysisVersion, isAnalysisOutdated } from '../../agents/sectorAgent.js';
import { AgentError } from '../../agents/baseAgent.js';
import { AiProviderError } from '../../services/ai/modelProvider.js';
import { resolveUser } from '../../middleware/auth.middleware.js';
import { getAiQuota, reserveAiQuota, refundAiQuota } from '../../services/aiQuota.service.js';
import { handleEdgarError } from './screener.controller.js';

/**
 * Normaliza un número de acceso de la SEC al formato estándar con guiones (XXXXXXXXXX-YY-ZZZZZZ).
 * @param {unknown} acc - Número de acceso sin guiones o con formato parcial.
 * @returns {string} Accession normalizado.
 */

/**
 * Consulta el historial de versiones guardadas de análisis para un mismo filing de la SEC.
 * @param {import('express').Request} req - Petición con ticker y accession.
 * @param {import('express').Response} res - Lista de versiones históricas.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */

/**
 * Sirve un análisis existente en caché, regenerando el PDF en disco si hiciera falta y vinculando al usuario.
 * @private
 */

/**
 * Analiza un filing oficial de la SEC con IA o devuelve la versión almacenada en caché.
 * @param {import('express').Request} req - Petición con ticker, accession y opciones de regeneración.
 * @param {import('express').Response} res - Resultado del análisis estructurado.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */

/**
 * Fuerza la regeneración de un análisis de informe delegando al manejador principal de análisis.
 * @param {import('express').Request} req - Petición HTTP.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */

/**
 * Consulta la previsualización de páginas generadas de un filing de la SEC.
 * @param {import('express').Request} req - Petición con ticker y accession.
 * @param {import('express').Response} res - Metadatos de páginas disponibles.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */

/**
 * Transmite la imagen PNG renderizada de una página específica del filing.
 * @param {import('express').Request} req - Petición con ticker, accession y page.
 * @param {import('express').Response} res - Imagen PNG.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
