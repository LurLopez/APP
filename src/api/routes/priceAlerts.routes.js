/**
 * @fileoverview Definición de rutas HTTP para la gestión de alertas de precios.
 * @module api/routes/priceAlerts
 */

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  listPriceAlertsHandler,
  createPriceAlertHandler,
  deletePriceAlertHandler,
} from '../controllers/priceAlerts.controller.js';

const router = Router();

router.get('/', requireAuth, listPriceAlertsHandler);
router.post('/', requireAuth, createPriceAlertHandler);
router.delete('/:id', requireAuth, deletePriceAlertHandler);

export default router;
