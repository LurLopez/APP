import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import * as favoriteRepository from '../../../db/repositories/favoriteRepository.js';
import { getCompanyByTicker } from '../../services/edgar.service.js';
import { getMarketQuote } from '../../services/market.service.js';

const router = Router();

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;

function handleFavoritesError(error, res, next) {
  if (error.code === 'COMPANY_NOT_FOUND') {
    res.status(404).json({ error: error.message, code: 'COMPANY_NOT_FOUND' });
    return;
  }
  next(error);
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const storedFavorites = await favoriteRepository.listFavorites(req.user.id);
    const favorites = await Promise.all(storedFavorites.map(async (favorite) => ({
      id: favorite.id,
      ticker: favorite.ticker,
      companyName: favorite.company_name,
      createdAt: favorite.created_at,
      quote: await getMarketQuote(favorite.ticker).catch(() => null),
    })));
    res.json({
      ok: true,
      favorites,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
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
    const favorite = await favoriteRepository.addFavorite({
      userId: req.user.id,
      ticker,
      companyName,
    });
    res.status(201).json({
      ok: true,
      favorite: {
        id: favorite.id,
        ticker: favorite.ticker,
        companyName: favorite.company_name,
        createdAt: favorite.created_at,
      },
    });
  } catch (error) {
    handleFavoritesError(error, res, next);
  }
});

router.delete('/:ticker', requireAuth, async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    await favoriteRepository.removeFavorite(req.user.id, ticker);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
