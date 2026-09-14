/**
 * @fileoverview Definición de rutas HTTP públicas para el envío de reportes generales de usuarios.
 * @module api/routes/reports
 */

import { Router } from 'express';
import { rateLimit } from '../../middleware/rateLimit.middleware.js';
import { createGeneralReportHandler } from '../controllers/generalReports.controller.js';

const router = Router();

const reportLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 10,
  scope: 'reports:general',
  message: 'Has enviado demasiados reportes. Espera un poco antes de volver a intentarlo.',
});

router.post('/', reportLimiter, createGeneralReportHandler);

export default router;
