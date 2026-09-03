import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import * as watchlistRepository from '../../../db/repositories/watchlistRepository.js';
import { getCompanyByTicker } from '../../services/edgar.service.js';
import { getMarketQuote } from '../../services/market.service.js';
import { checkAndDispatchAlerts } from '../../services/alertScanner.service.js';

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
    const [watchlists, calendarList, emailAlertsList] = await Promise.all([
      watchlistRepository.listWatchlists(req.user.id),
      watchlistRepository.listCalendarTickers(req.user.id),
      watchlistRepository.listEmailAlerts(req.user.id),
    ]);
    const emailAlerts = {};
    for (const alert of emailAlertsList) {
      emailAlerts[alert.ticker] = {
        enabled: alert.enabled,
        notifyEarnings: alert.notifyEarnings,
        notifyExdiv: alert.notifyExdiv,
        notifyPayout: alert.notifyPayout,
      };
    }
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
      calendarTickers: calendarList.map((c) => c.ticker),
      emailAlerts,
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

router.get('/preferences', requireAuth, async (req, res, next) => {
  try {
    const preferences = await watchlistRepository.getUserPreferences(req.user.id);
    res.json({ ok: true, preferences });
  } catch (error) {
    next(error);
  }
});

router.put('/preferences', requireAuth, async (req, res, next) => {
  try {
    const preferences = await watchlistRepository.updateUserPreferences(req.user.id, req.body ?? {});
    res.json({ ok: true, preferences });
  } catch (error) {
    next(error);
  }
});

router.get('/calendar/tickers', requireAuth, async (req, res, next) => {
  try {
    const list = await watchlistRepository.listCalendarTickers(req.user.id);
    res.json({ ok: true, tickers: list.map((c) => c.ticker) });
  } catch (error) {
    next(error);
  }
});

router.post('/calendar/items', requireAuth, async (req, res, next) => {
  try {
    const ticker = String(req.body?.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    let companyName = String(req.body?.companyName ?? '').trim();
    if (!companyName) {
      try {
        const company = await getCompanyByTicker(ticker);
        companyName = company?.name || ticker;
      } catch {
        companyName = ticker;
      }
    }
    const item = await watchlistRepository.addCalendarTicker(req.user.id, ticker, companyName);
    res.status(201).json({ ok: true, item });
  } catch (error) {
    next(error);
  }
});

router.delete('/calendar/items/:ticker', requireAuth, async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    await watchlistRepository.removeCalendarTicker(req.user.id, ticker);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/notifications', requireAuth, async (req, res, next) => {
  try {
    const list = await watchlistRepository.listEmailAlerts(req.user.id);
    res.json({ ok: true, alerts: list });
  } catch (error) {
    next(error);
  }
});

router.post('/notifications', requireAuth, async (req, res, next) => {
  try {
    const ticker = String(req.body?.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    let companyName = String(req.body?.companyName ?? '').trim();
    if (!companyName) {
      try {
        const company = await getCompanyByTicker(ticker);
        companyName = company?.name || ticker;
      } catch {
        companyName = ticker;
      }
    }
    const enabled = req.body?.enabled !== undefined ? Boolean(req.body.enabled) : true;
    const notifyEarnings = req.body?.notifyEarnings !== undefined ? Boolean(req.body.notifyEarnings) : true;
    const notifyExdiv = req.body?.notifyExdiv !== undefined ? Boolean(req.body.notifyExdiv) : true;
    const notifyPayout = req.body?.notifyPayout !== undefined ? Boolean(req.body.notifyPayout) : true;

    const alert = await watchlistRepository.upsertEmailAlert(req.user.id, ticker, {
      companyName,
      enabled,
      notifyEarnings,
      notifyExdiv,
      notifyPayout,
    });
    res.json({ ok: true, alert });
  } catch (error) {
    next(error);
  }
});

router.delete('/notifications/:ticker', requireAuth, async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    await watchlistRepository.deleteEmailAlert(req.user.id, ticker);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/notifications/check-now', requireAuth, async (req, res, next) => {
  try {
    const result = await checkAndDispatchAlerts();
    res.json({ ok: true, result });
  } catch (error) {
    next(error);
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

    // Al añadir a cualquier lista, se aplican las reglas por defecto (calendario y unión OR de notificaciones)
    await watchlistRepository.applyWatchlistAddDefaults(req.user.id, ticker, companyName);

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
