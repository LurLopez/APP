/**
 * @fileoverview Controlador para la gestión de alertas de precios sobre acciones.
 * @module api/controllers/priceAlerts
 */

import * as priceAlertRepository from '../../../db/repositories/priceAlertRepository.js';
import { getCompanyByTicker } from '../../services/edgar.service.js';
import { getMarketQuote } from '../../services/market.service.js';

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;

/**
 * Consulta todas las alertas de precio del usuario enriquecidas con cotización actual en vivo.
 * @param {import('express').Request} req - Petición con usuario autenticado.
 * @param {import('express').Response} res - Lista de alertas con precio y variación de mercado.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function listPriceAlertsHandler(req, res, next) {
  try {
    const alerts = await priceAlertRepository.listPriceAlerts(req.user.id);
    const uniqueTickers = [...new Set(alerts.map((a) => a.ticker))];
    const quotes = new Map();

    await Promise.all(
      uniqueTickers.map(async (t) => {
        try {
          const q = await getMarketQuote(t);
          if (q) quotes.set(t, q);
        } catch {
          // Si falla una cotización específica, se omite de forma silenciosa
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
}

/**
 * Crea una nueva alerta de precio (superior o inferior) para un ticker.
 * @param {import('express').Request} req - Petición con body (ticker, targetPrice, condition, companyName).
 * @param {import('express').Response} res - Alerta creada.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function createPriceAlertHandler(req, res, next) {
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
}

/**
 * Elimina una alerta de precio existente del usuario.
 * @param {import('express').Request} req - Petición con params.id de la alerta.
 * @param {import('express').Response} res - Confirmación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function deletePriceAlertHandler(req, res, next) {
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
}
