/**
 * @fileoverview Definición de rutas HTTP para las métricas favoritas de los estados financieros.
 * @module api/routes/metricFavorites
 */

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  listMetricFavoritesHandler,
  addMetricFavoriteHandler,
  removeMetricFavoriteHandler,
} from '../controllers/metricFavorites.controller.js';

const router = Router();

router.get('/', requireAuth, listMetricFavoritesHandler);
router.put('/:statement/:key', requireAuth, addMetricFavoriteHandler);
router.delete('/:statement/:key', requireAuth, removeMetricFavoriteHandler);

export default router;
