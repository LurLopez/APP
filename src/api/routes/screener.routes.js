/**
 * @fileoverview Definición de rutas HTTP para el screener, búsqueda de empresas y análisis de filings.
 * @module api/routes/screener
 */

import express from 'express';
import { rateLimit } from '../../middleware/rateLimit.middleware.js';
import {
  searchCompaniesHandler,
  getCompanyDetailsHandler,
  getCompanyChartHandler,
  getCompanyValuationHandler,
  getCompanyFilingsHandler,
  getCompanyPresentationsHandler,
  getCompanyHoldersHandler,
  getFilingDocumentHandler,
} from '../controllers/screener.controller.js';
import {
  getFilingVersionsHandler,
  analyzeFilingHandler,
  regenerateFilingHandler,
  getFilingPreviewHandler,
  getFilingPreviewPageHandler,
} from '../controllers/filingAnalysis.controller.js';

const router = express.Router();

const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  scope: 'screener:analyze',
  message: 'Demasiadas solicitudes de análisis desde tu conexión. Espera unos minutos antes de volver a intentarlo.',
});

// Búsqueda y detalles de empresa
router.get('/search', searchCompaniesHandler);
router.get('/company/:ticker', getCompanyDetailsHandler);
router.get('/company/:ticker/chart', getCompanyChartHandler);
router.get('/company/:ticker/valuation', getCompanyValuationHandler);
router.get('/company/:ticker/holders', getCompanyHoldersHandler);

// Filings y presentaciones de la SEC
router.get('/company/:ticker/filings', getCompanyFilingsHandler);
router.get('/company/:ticker/filings/presentations', getCompanyPresentationsHandler);
router.get('/company/:ticker/filings/:accession/document', getFilingDocumentHandler);

// Versiones, análisis y regeneración con IA
router.get('/company/:ticker/filings/:accession/versions', getFilingVersionsHandler);
router.post('/company/:ticker/filings/:accession/analyze', analyzeLimiter, analyzeFilingHandler);
router.post('/company/:ticker/filings/:accession/regenerate', regenerateFilingHandler);

// Previsualización de páginas
router.get('/company/:ticker/filings/:accession/preview', getFilingPreviewHandler);
router.get('/company/:ticker/filings/:accession/preview/pages/:page', getFilingPreviewPageHandler);

export default router;
