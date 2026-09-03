import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import * as priceAlertRepository from '../../../db/repositories/priceAlertRepository.js';
import { getCompanyByTicker } from '../../services/edgar.service.js';
import { getMarketQuote } from '../../services/market.service.js';

const router = Router();
const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const alerts = await priceAlertRepository.listPriceAlerts(req.user.id);
    
    // Adjuntar cotizaciones actuales de mercado en paralelo
    const uniqueTickers = [...new Set(alerts.map((a) => a.ticker))];
    const quotes = new Map();
    await Promise.all(
      uniqueTickers.map(async (t) => {
        try {
          const q = await getMarketQuote(t);
          if (q) quotes.set(t, q);
        } catch {
          // Ignorar error individual de cotización
        }
      }),
    );

    const enrichedAlerts = alerts.map((alert) => {
      const quote = quotes.get(alert.ticker);
      return {
        ...alert,
        currentPrice: quote?.price ?? null,
        currency: quote?.currency ?? 'USD',
        changePercent: quote?.changePercent ?? null,
      };
    });

    res.json({ ok: true, alerts: enrichedAlerts });
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

    const targetPrice = Number(req.body?.targetPrice);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      res.status(400).json({ error: 'El precio objetivo debe ser un número positivo.' });
      return;
    }

    const condition = String(req.body?.condition ?? '').toLowerCase();
    if (!['gte', 'lte'].includes(condition)) {
      res.status(400).json({ error: 'La condición debe ser "gte" (igual o superior) o "lte" (igual o menor).' });
      return;
    }

    let company;
    try {
      company = await getCompanyByTicker(ticker);
    } catch {
      res.status(404).json({ error: `La empresa "${ticker}" no existe en el registro oficial de la SEC (EDGAR). Elige una empresa de la lista.` });
      return;
    }

    const companyName = company?.name || String(req.body?.companyName ?? '').trim() || ticker;

    const alert = await priceAlertRepository.createPriceAlert(req.user.id, {
      ticker,
      companyName,
      targetPrice,
      condition,
    });

    res.status(201).json({ ok: true, alert });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const alertId = Number(req.params.id);
    if (!Number.isInteger(alertId)) {
      res.status(400).json({ error: 'Identificador de alerta no válido.' });
      return;
    }

    const deleted = await priceAlertRepository.deletePriceAlert(req.user.id, alertId);
    if (!deleted) {
      res.status(404).json({ error: 'La alerta no existe o no pertenece a tu usuario.' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
