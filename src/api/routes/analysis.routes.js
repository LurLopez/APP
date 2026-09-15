/**
 * @fileoverview Definición de rutas HTTP para el pipeline de análisis de informes financieros.
 * @module api/routes/analysis
 */

import express from 'express';
import multer from 'multer';
import { requireAuth, requireAdmin } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rateLimit.middleware.js';
import {
  uploadErrorHandler,
  uploadAndAnalyzePdf,
  listUserAnalyses,
  listUserAnalysisCompanies,
  getAnalysisDetail,
  redirectToOriginalSource,
} from '../controllers/analysis.controller.js';
import {
  rateAnalysis,
  getAnalysisRating,
  reportAnalysisError,
  reviewAnalysis,
} from '../controllers/analysisFeedback.controller.js';
import { downloadReportFile } from '../controllers/reportDownload.controller.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 2, fields: 5, parts: 6 },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  scope: 'analysis:upload',
  message: 'Has subido demasiados informes en la última hora. Espera un poco antes de volver a intentarlo.',
});

const ratingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  scope: 'analysis:rating',
  message: 'Has registrado demasiadas valoraciones. Espera unos minutos antes de volver a intentarlo.',
});

const errorReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  scope: 'analysis:error-report',
  message: 'Has enviado demasiados reportes de error. Espera un poco antes de volver a intentarlo.',
});

const reportDownloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  scope: 'analysis:report-download',
  message: 'Demasiadas descargas desde tu conexión. Espera unos segundos antes de volver a intentarlo.',
});

// Pipeline de subida y análisis
router.post(
  '/upload',
  uploadLimiter,
  requireAuth,
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'presentation', maxCount: 1 },
  ]),
  uploadErrorHandler,
  uploadAndAnalyzePdf,
);

// Consultas de análisis del usuario
router.get('/analyses', requireAuth, listUserAnalyses);
router.get('/analyses/companies', requireAuth, listUserAnalysisCompanies);
router.get('/analyses/:id/source', requireAuth, redirectToOriginalSource);
router.get('/analyses/:id', getAnalysisDetail);

// Moderación y revisión (Administrador)
router.post('/analyses/:id/review', requireAdmin, reviewAnalysis);
router.patch('/analyses/:id/review', requireAdmin, reviewAnalysis);

// Feedback, valoraciones y reporte de errores
router.post('/analyses/:id/rating', ratingLimiter, rateAnalysis);
router.get('/analyses/:id/rating', getAnalysisRating);
router.post('/analyses/:id/report-error', errorReportLimiter, reportAnalysisError);

// Descarga de informes compilados (PDF, HTML, DOCX, ODT)
router.get('/reports/:file', reportDownloadLimiter, downloadReportFile);

export default router;
