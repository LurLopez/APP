/**
 * @fileoverview Definición de rutas HTTP para listas de seguimiento, preferencias y alertas.
 * @module api/routes/watchlists
 */

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rateLimit.middleware.js';
import {
  listWatchlistsHandler,
  createWatchlistHandler,
  getUserPreferencesHandler,
  updateUserPreferencesHandler,
  getWatchlistDetailHandler,
  renameWatchlistHandler,
  deleteWatchlistHandler,
  addWatchlistItemHandler,
  removeWatchlistItemHandler,
} from '../controllers/watchlists.controller.js';
import {
  listCalendarTickersHandler,
  addCalendarItemHandler,
  removeCalendarItemHandler,
  listNotificationsHandler,
  upsertNotificationHandler,
  deleteNotificationHandler,
  checkNotificationsNowHandler,
} from '../controllers/watchlistCalendar.controller.js';

const router = Router();

// El escaneo de alertas es global (recorre TODOS los usuarios y envía correos):
// queda reservado a administradores para impedir abusos de envío masivo.
const scanNowLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  scope: 'watchlists:scan-now',
  message: 'El escaneo global se ha ejecutado demasiadas veces. Espera unos minutos.',
});

// Gestión global de listas
router.get('/', requireAuth, listWatchlistsHandler);
router.post('/', requireAuth, createWatchlistHandler);
router.get('/preferences', requireAuth, getUserPreferencesHandler);
router.put('/preferences', requireAuth, updateUserPreferencesHandler);

// Calendario financiero de seguimiento
router.get('/calendar/tickers', requireAuth, listCalendarTickersHandler);
router.post('/calendar/items', requireAuth, addCalendarItemHandler);
router.delete('/calendar/items/:ticker', requireAuth, removeCalendarItemHandler);

// Alertas por email
router.get('/notifications', requireAuth, listNotificationsHandler);
router.post('/notifications', requireAuth, upsertNotificationHandler);
router.delete('/notifications/:ticker', requireAuth, deleteNotificationHandler);
router.post('/notifications/check-now', requireAdmin, scanNowLimiter, checkNotificationsNowHandler);

// Gestión de lista individual
router.get('/:id', requireAuth, getWatchlistDetailHandler);
router.patch('/:id', requireAuth, renameWatchlistHandler);
router.delete('/:id', requireAuth, deleteWatchlistHandler);
router.post('/:id/items', requireAuth, addWatchlistItemHandler);
router.delete('/:id/items/:ticker', requireAuth, removeWatchlistItemHandler);

export default router;
