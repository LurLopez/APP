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

// Endpoints que consultan EDGAR/Yahoo, lanzan Chrome headless o renderizan páginas.
// Se limitan por IP para evitar agotamiento de recursos y scraping masivo.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  scope: 'screener:search',
  message: 'Demasiadas búsquedas seguidas. Espera unos segundos antes de volver a buscar.',
});

const companyDataLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  scope: 'screener:company-data',
  message: 'Demasiadas consultas seguidas. Espera unos segundos antes de volver a intentarlo.',
});

const filingsLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  scope: 'screener:filings',
  message: 'Demasiadas consultas de filings. Espera un poco antes de volver a intentarlo.',
});

const heavyCrawlerLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  scope: 'screener:crawler',
  message: 'Demasiadas generaciones de documentos seguidas. Espera un poco antes de volver a intentarlo.',
});

// Búsqueda y detalles de empresa
router.get('/search', searchLimiter, searchCompaniesHandler);
router.get('/company/:ticker', companyDataLimiter, getCompanyDetailsHandler);
router.get('/company/:ticker/chart', companyDataLimiter, getCompanyChartHandler);
router.get('/company/:ticker/valuation', companyDataLimiter, getCompanyValuationHandler);
router.get('/company/:ticker/holders', companyDataLimiter, getCompanyHoldersHandler);

// Filings y presentaciones de la SEC
router.get('/company/:ticker/filings', filingsLimiter, getCompanyFilingsHandler);
router.get('/company/:ticker/filings/presentations', heavyCrawlerLimiter, getCompanyPresentationsHandler);
router.get('/company/:ticker/filings/:accession/document', heavyCrawlerLimiter, getFilingDocumentHandler);

// Versiones, análisis y regeneración con IA
router.get('/company/:ticker/filings/:accession/versions', filingsLimiter, getFilingVersionsHandler);
router.post('/company/:ticker/filings/:accession/analyze', analyzeLimiter, analyzeFilingHandler);
router.post('/company/:ticker/filings/:accession/regenerate', analyzeLimiter, regenerateFilingHandler);

// Previsualización de páginas
router.get('/company/:ticker/filings/:accession/preview', heavyCrawlerLimiter, getFilingPreviewHandler);
router.get('/company/:ticker/filings/:accession/preview/pages/:page', heavyCrawlerLimiter, getFilingPreviewPageHandler);

export default router;
