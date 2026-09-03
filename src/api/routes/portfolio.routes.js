import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import * as portfolioService from '../../services/portfolio.service.js';
import { getCompanyByTicker } from '../../services/edgar.service.js';
import { applyPortfolioAddDefaults } from '../../../db/repositories/watchlistRepository.js';

const router = Router();

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function handlePortfolioError(error, res, next) {
  if (error?.code === 'NOT_FOUND') {
    res.status(404).json({ error: error.message, code: error.code });
    return;
  }
  if (error?.code === 'NOT_ENOUGH_SHARES' || error?.code === 'INVALID_STATE') {
    res.status(400).json({ error: error.message, code: error.code });
    return;
  }
  if (error?.code === 'COMPANY_NOT_FOUND') {
    res.status(400).json({ error: error.message, code: 'COMPANY_NOT_FOUND' });
    return;
  }
  if (error?.code === 'DUPLICATE' || error?.code === 'INVALID_LOT') {
    res.status(400).json({ error: error.message, code: error.code });
    return;
  }
  if (error?.code === 'INVALID_CHART') {
    res.status(400).json({ error: error.message, code: error.code });
    return;
  }
  next(error);
}

const NAME_PATTERN = /^[A-Za-z0-9áéíóúüñÁÉÍÓÚÜÑ _\-\u00e0-\u00ff]{1,40}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function cleanName(value) {
  const name = String(value ?? '').trim();
  return name.length >= 1 && name.length <= 40 && NAME_PATTERN.test(name) ? name : null;
}

function cleanColor(value) {
  const color = String(value ?? '').trim();
  return COLOR_PATTERN.test(color) ? color : null;
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const portfolio = await portfolioService.getPortfolio(req.user.id);
    res.json({ ok: true, portfolio });
  } catch (error) {
    next(error);
  }
});

router.get('/chart', requireAuth, async (req, res, next) => {
  try {
    const rawIds = String(req.query.ids ?? '').split(',').map((id) => id.trim()).filter(Boolean);
    const metric = String(req.query.metric ?? 'gainPct');
    const range = String(req.query.range ?? '1y');
    const chart = await portfolioService.getPortfolioChart(req.user.id, { ids: rawIds, metric, range });
    res.json({ ok: true, chart });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
});

router.post('/transactions', requireAuth, async (req, res, next) => {
  try {
    const ticker = String(req.body?.ticker ?? '').trim().toUpperCase();
    const type = String(req.body?.type ?? '').trim().toLowerCase();
    const shares = Number(req.body?.shares);
    const price = Number(req.body?.price);
    const tradeDate = String(req.body?.date ?? '').trim();

    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    if (type !== 'buy' && type !== 'sell') {
      res.status(400).json({ error: 'El tipo de operación debe ser "buy" o "sell".' });
      return;
    }
    if (!Number.isFinite(shares) || shares <= 0) {
      res.status(400).json({ error: 'La cantidad debe ser un número mayor que 0.' });
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      res.status(400).json({ error: 'El precio debe ser un número mayor o igual que 0.' });
      return;
    }
    if (!DATE_PATTERN.test(tradeDate) || Number.isNaN(Date.parse(tradeDate))) {
      res.status(400).json({ error: 'La fecha debe tener formato AAAA-MM-DD.' });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (tradeDate > today) {
      res.status(400).json({ error: 'La fecha no puede ser futura.' });
      return;
    }

    const company = await getCompanyByTicker(ticker);
    const companyName = String(req.body?.companyName ?? '').trim() || company.name;

    const transaction = type === 'buy'
      ? await portfolioService.addBuy(req.user.id, { ticker, companyName, shares, price, tradeDate })
      : await portfolioService.addSell(req.user.id, { ticker, companyName, shares, price, tradeDate });

    if (type === 'buy') {
      try {
        await applyPortfolioAddDefaults(req.user.id, ticker, companyName);
      } catch (err) {
        console.warn('Could not apply portfolio add defaults:', err.message);
      }
    }

    res.status(201).json({ ok: true, transaction });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
});

router.delete('/transactions/:id', requireAuth, async (req, res, next) => {
  try {
    const transactionId = Number(req.params.id);
    if (!Number.isInteger(transactionId)) {
      res.status(400).json({ error: 'Transacción no válida.' });
      return;
    }
    await portfolioService.removeTransaction(req.user.id, transactionId);
    res.json({ ok: true });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
});

/* ── Pestañas ──────────────────────────────────────────────── */

router.post('/tabs', requireAuth, async (req, res, next) => {
  try {
    const name = cleanName(req.body?.name);
    if (!name) {
      res.status(400).json({ error: 'El nombre de la pestaña debe tener entre 1 y 40 caracteres.' });
      return;
    }
    const color = cleanColor(req.body?.color) ?? '#2563eb';
    const tab = await portfolioService.createTab(req.user.id, { name, color });
    res.status(201).json({ ok: true, tab });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
});

router.patch('/tabs/:id', requireAuth, async (req, res, next) => {
  try {
    const tabId = Number(req.params.id);
    if (!Number.isInteger(tabId)) {
      res.status(400).json({ error: 'Pestaña no válida.' });
      return;
    }
    const name = cleanName(req.body?.name);
    const color = cleanColor(req.body?.color);
    if (!name && !color) {
      res.status(400).json({ error: 'Indica un nombre o un color para actualizar.' });
      return;
    }
    const tab = await portfolioService.updateTab(req.user.id, tabId, { name, color });
    res.json({ ok: true, tab });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
});

router.delete('/tabs/:id', requireAuth, async (req, res, next) => {
  try {
    const tabId = Number(req.params.id);
    if (!Number.isInteger(tabId)) {
      res.status(400).json({ error: 'Pestaña no válida.' });
      return;
    }
    await portfolioService.deleteTab(req.user.id, tabId);
    res.json({ ok: true });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
});

/* ── Grupos ────────────────────────────────────────────────── */

router.post('/groups', requireAuth, async (req, res, next) => {
  try {
    const tabId = Number(req.body?.tabId);
    const name = cleanName(req.body?.name);
    if (!Number.isInteger(tabId)) {
      res.status(400).json({ error: 'Indica la pestaña del grupo.' });
      return;
    }
    if (!name) {
      res.status(400).json({ error: 'El nombre del grupo debe tener entre 1 y 40 caracteres.' });
      return;
    }
    const color = cleanColor(req.body?.color) ?? '#2563eb';
    const group = await portfolioService.createGroup(req.user.id, { tabId, name, color });

    const tickers = (Array.isArray(req.body?.tickers) ? req.body.tickers : [])
      .map((ticker) => String(ticker ?? '').trim().toUpperCase())
      .filter((ticker) => TICKER_PATTERN.test(ticker));
    for (const ticker of new Set(tickers)) {
      await portfolioService.addGroupTicker(req.user.id, group.id, ticker);
    }
    const lotIds = (Array.isArray(req.body?.lotTransactionIds) ? req.body.lotTransactionIds : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));
    for (const transactionId of new Set(lotIds)) {
      await portfolioService.addGroupLot(req.user.id, group.id, transactionId);
    }

    res.status(201).json({ ok: true, group });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
});

router.patch('/groups/:id', requireAuth, async (req, res, next) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) {
      res.status(400).json({ error: 'Grupo no válido.' });
      return;
    }
    const name = cleanName(req.body?.name);
    const color = cleanColor(req.body?.color);
    if (!name && !color) {
      res.status(400).json({ error: 'Indica un nombre o un color para actualizar.' });
      return;
    }
    const group = await portfolioService.updateGroup(req.user.id, groupId, { name, color });
    res.json({ ok: true, group });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
});

router.delete('/groups/:id', requireAuth, async (req, res, next) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) {
      res.status(400).json({ error: 'Grupo no válido.' });
      return;
    }
    await portfolioService.deleteGroup(req.user.id, groupId);
    res.json({ ok: true });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
});

/* ── Miembros de grupo ─────────────────────────────────────── */

function memberParams(req, res) {
  const ticker = String(req.body?.ticker ?? '').trim().toUpperCase();
  const transactionId = Number(req.body?.transactionId);
  const hasTicker = Boolean(ticker) && TICKER_PATTERN.test(ticker);
  const hasLot = Number.isInteger(transactionId);
  if (!hasTicker && !hasLot) {
    res.status(400).json({ error: 'Indica un ticker (acción) o un transactionId (sublínea).' });
    return null;
  }
  return { ticker: hasTicker ? ticker : null, transactionId: hasLot ? transactionId : null };
}

router.post('/groups/:id/members', requireAuth, async (req, res, next) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) {
      res.status(400).json({ error: 'Grupo no válido.' });
      return;
    }
    const params = memberParams(req, res);
    if (!params) return;
    if (params.ticker) await portfolioService.addGroupTicker(req.user.id, groupId, params.ticker);
    else await portfolioService.addGroupLot(req.user.id, groupId, params.transactionId);
    res.status(201).json({ ok: true });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
});

router.delete('/groups/:id/members', requireAuth, async (req, res, next) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) {
      res.status(400).json({ error: 'Grupo no válido.' });
      return;
    }
    const params = memberParams(req, res);
    if (!params) return;
    if (params.ticker) await portfolioService.removeGroupTicker(req.user.id, groupId, params.ticker);
    else await portfolioService.removeGroupLot(req.user.id, groupId, params.transactionId);
    res.json({ ok: true });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
});

export default router;
