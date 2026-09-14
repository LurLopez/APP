/**
 * @fileoverview Definición de rutas HTTP para la administración de incidencias, errores de IA y reportes generales.
 * @module api/routes/adminReports
 */

import express from 'express';
import { requireAdmin } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rateLimit.middleware.js';
import {
  getReportsStatsHandler,
  listAiAnalysisReportsHandler,
  updateAiAnalysisReportHandler,
  deleteAiAnalysisReportHandler,
  deleteAiAnalysisHandler,
  regenerateAiAnalysisHandler,
} from '../controllers/adminReports.controller.js';
import {
  listGeneralReportsHandler,
  updateGeneralReportHandler,
  deleteGeneralReportHandler,
  createGeneralReportHandler,
} from '../controllers/generalReports.controller.js';

const router = express.Router();

const generalReportLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 10,
  scope: 'reports:general',
  message: 'Has enviado demasiados reportes. Espera un poco antes de volver a intentarlo.',
});

// Estadísticas de administración
router.get('/admin/reports/stats', requireAdmin, getReportsStatsHandler);

// Incidencias y gestión de análisis de IA
router.get('/admin/reports/ai', requireAdmin, listAiAnalysisReportsHandler);
router.patch('/admin/reports/ai/:id', requireAdmin, updateAiAnalysisReportHandler);
router.delete('/admin/reports/ai/:id', requireAdmin, deleteAiAnalysisReportHandler);
router.delete('/admin/reports/ai-analysis/:id', requireAdmin, deleteAiAnalysisHandler);
router.post('/admin/reports/ai-analysis/:id/regenerate', requireAdmin, regenerateAiAnalysisHandler);

// Reportes generales de la plataforma (bugs, sugerencias)
router.get('/admin/reports/general', requireAdmin, listGeneralReportsHandler);
router.patch('/admin/reports/general/:id', requireAdmin, updateGeneralReportHandler);
router.delete('/admin/reports/general/:id', requireAdmin, deleteGeneralReportHandler);
router.post('/reports/general', generalReportLimiter, createGeneralReportHandler);

export default router;
