import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import * as watchlistRepository from '../../../db/repositories/watchlistRepository.js';
import { getCompanyByTicker } from '../../services/edgar.service.js';
import { getMarketQuote } from '../../services/market.service.js';

const router = Router();

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;
const NAME_PATTERN = /^.{1,40}$/s;

function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function handleWatchlistError(error, res, next) {
  if (error?.code === '23505') {
    res.status(409).json({ error: 'Ya existe una lista con ese nombre.' });
    return;
  }
  if (error?.code === 'COMPANY_NOT_FOUND') {
    res.status(404).json({ error: error.message, code: 'COMPANY_NOT_FOUND' });
    return;
  }
  next(error);
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const watchlists = await watchlistRepository.listWatchlists(req.user.id);
    res.json({
      ok: true,
      watchlists: watchlists.map((watchlist) => ({
        id: watchlist.id,
        name: watchlist.name,
        isDefault: watchlist.isDefault,
        createdAt: watchlist.createdAt,
        count: watchlist.items.length,
        tickers: watchlist.items.map((item) => ({
          ticker: item.ticker,
          companyName: item.companyName,
        })),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const name = normalizeName(req.body?.name);
    if (!NAME_PATTERN.test(name)) {
      res.status(400).json({ error: 'El nombre debe tener entre 1 y 40 caracteres.' });
      return;
    }
    const watchlist = await watchlistRepository.createWatchlist(req.user.id, name);
    res.status(201).json({
      ok: true,
      watchlist: {
        id: watchlist.id,
        name: watchlist.name,
        isDefault: watchlist.is_default,
        createdAt: watchlist.created_at,
        count: 0,
        tickers: [],
      },
    });
  } catch (error) {
    handleWatchlistError(error, res, next);
  }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const watchlistId = Number(req.params.id);
    if (!Number.isInteger(watchlistId)) {
      res.status(400).json({ error: 'Lista no válida.' });
      return;
    }
    const name = normalizeName(req.body?.name);
    if (!NAME_PATTERN.test(name)) {
      res.status(400).json({ error: 'El nombre debe tener entre 1 y 40 caracteres.' });
      return;
    }
    const current = await watchlistRepository.getWatchlist(req.user.id, watchlistId);
    if (!current) {
      res.status(404).json({ error: 'La lista no existe.' });
      return;
    }
    if (current.is_default) {
      res.status(400).json({ error: 'La lista de favoritos no se puede renombrar.' });
      return;
    }
    const watchlist = await watchlistRepository.renameWatchlist(req.user.id, watchlistId, name);
    res.json({
      ok: true,
      watchlist: {
        id: watchlist.id,
        name: watchlist.name,
        isDefault: watchlist.is_default,
        createdAt: watchlist.created_at,
      },
    });
  } catch (error) {
    handleWatchlistError(error, res, next);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const watchlistId = Number(req.params.id);
    if (!Number.isInteger(watchlistId)) {
      res.status(400).json({ error: 'Lista no válida.' });
      return;
    }
    const current = await watchlistRepository.getWatchlist(req.user.id, watchlistId);
    if (!current) {
      res.status(404).json({ error: 'La lista no existe.' });
      return;
    }
    if (current.is_default) {
      res.status(400).json({ error: 'La lista de favoritos no se puede eliminar.' });
      return;
    }
    await watchlistRepository.deleteWatchlist(req.user.id, watchlistId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const watchlistId = Number(req.params.id);
    if (!Number.isInteger(watchlistId)) {
      res.status(400).json({ error: 'Lista no válida.' });
      return;
    }
    const watchlist = await watchlistRepository.getWatchlist(req.user.id, watchlistId);
    if (!watchlist) {
      res.status(404).json({ error: 'La lista no existe.' });
      return;
    }
    const storedItems = await watchlistRepository.listWatchlistItems(req.user.id, watchlistId);
    const items = await Promise.all(storedItems.map(async (item) => ({
      id: item.id,
      ticker: item.ticker,
      companyName: item.companyName,
      createdAt: item.createdAt,
      quote: await getMarketQuote(item.ticker).catch(() => null),
    })));
    res.json({
      ok: true,
      watchlist: {
        id: watchlist.id,
        name: watchlist.name,
        isDefault: watchlist.is_default,
        createdAt: watchlist.created_at,
        items,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/items', requireAuth, async (req, res, next) => {
  try {
    const watchlistId = Number(req.params.id);
    if (!Number.isInteger(watchlistId)) {
      res.status(400).json({ error: 'Lista no válida.' });
      return;
    }
    const ticker = String(req.body?.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    let companyName = String(req.body?.companyName ?? '').trim();
    if (!companyName) {
      const company = await getCompanyByTicker(ticker);
      companyName = company.name;
    }
    const item = await watchlistRepository.addItem(req.user.id, watchlistId, ticker, companyName);
    if (!item) {
      res.status(404).json({ error: 'La lista no existe.' });
      return;
    }
    res.status(201).json({ ok: true, item });
  } catch (error) {
    handleWatchlistError(error, res, next);
  }
});

router.delete('/:id/items/:ticker', requireAuth, async (req, res, next) => {
  try {
    const watchlistId = Number(req.params.id);
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!Number.isInteger(watchlistId) || !TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Solicitud no válida.' });
      return;
    }
    await watchlistRepository.removeItem(req.user.id, watchlistId, ticker);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
