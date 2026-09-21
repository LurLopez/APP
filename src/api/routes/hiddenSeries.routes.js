/**
 * @fileoverview Definición de rutas HTTP para las series ocultas del gráfico de métricas.
 * @module api/routes/hiddenSeries
 */

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  listHiddenSeriesHandler,
  replaceHiddenSeriesHandler,
} from '../controllers/hiddenSeries.controller.js';

const router = Router();

router.get('/', requireAuth, listHiddenSeriesHandler);
router.put('/', requireAuth, replaceHiddenSeriesHandler);

export default router;
