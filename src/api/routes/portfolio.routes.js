/**
 * @fileoverview Definición de rutas HTTP para la gestión de cartera de inversión y agrupaciones.
 * @module api/routes/portfolio
 */

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  getPortfolioHandler,
  getPortfolioChartHandler,
  addTransactionHandler,
  removeTransactionHandler,
} from '../controllers/portfolio.controller.js';
import {
  createTabHandler,
  updateTabHandler,
  deleteTabHandler,
  createGroupHandler,
  updateGroupHandler,
  deleteGroupHandler,
  addGroupMemberHandler,
  removeGroupMemberHandler,
} from '../controllers/portfolioGroups.controller.js';

const router = Router();

// Cartera y transacciones
router.get('/', requireAuth, getPortfolioHandler);
router.get('/chart', requireAuth, getPortfolioChartHandler);
router.post('/transactions', requireAuth, addTransactionHandler);
router.delete('/transactions/:id', requireAuth, removeTransactionHandler);

// Pestañas organizativas
router.post('/tabs', requireAuth, createTabHandler);
router.patch('/tabs/:id', requireAuth, updateTabHandler);
router.delete('/tabs/:id', requireAuth, deleteTabHandler);

// Grupos de posiciones
router.post('/groups', requireAuth, createGroupHandler);
router.patch('/groups/:id', requireAuth, updateGroupHandler);
router.delete('/groups/:id', requireAuth, deleteGroupHandler);

// Miembros de grupos (tickers o sublíneas)
router.post('/groups/:id/members', requireAuth, addGroupMemberHandler);
router.delete('/groups/:id/members', requireAuth, removeGroupMemberHandler);

export default router;
