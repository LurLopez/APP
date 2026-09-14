/**
 * @fileoverview Definición de rutas HTTP para el foro de debate por ticker.
 * @module api/routes/forum
 */

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rateLimit.middleware.js';
import {
  getTickerForumMessagesHandler,
  postTickerForumMessageHandler,
  deleteForumMessageHandler,
} from '../controllers/forum.controller.js';

const router = Router();

const forumPostLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  scope: 'forum:post',
  message: 'Has publicado demasiados mensajes seguidos. Espera unos minutos antes de volver a escribir.',
});

router.get('/:ticker', getTickerForumMessagesHandler);
router.post('/:ticker', forumPostLimiter, requireAuth, postTickerForumMessageHandler);
router.delete('/message/:id', requireAuth, deleteForumMessageHandler);

export default router;
