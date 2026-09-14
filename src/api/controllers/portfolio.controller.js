/**
 * @fileoverview Controlador para la gestión de cartera, operaciones de compra/venta y gráfico de rentabilidad.
 * @module api/controllers/portfolio
 */

import * as portfolioService from '../../services/portfolio.service.js';
import { getCompanyByTicker } from '../../services/edgar.service.js';
import { applyPortfolioAddDefaults } from '../../../db/repositories/watchlistRepository.js';

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Manejador centralizado de errores para el módulo de cartera de inversión.
 * @param {Error & { code?: string }} error - Error detectado.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Siguiente middleware.
 */
export function handlePortfolioError(error, res, next) {
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
  if (error?.code === 'DUPLICATE' || error?.code === 'INVALID_LOT' || error?.code === 'INVALID_CHART') {
    res.status(400).json({ error: error.message, code: error.code });
    return;
  }
  next(error);
}

/**
 * Obtiene el estado consolidado de la cartera del usuario (posiciones, rentabilidad, dividendos).
 * @param {import('express').Request} req - Petición con usuario autenticado.
 * @param {import('express').Response} res - Estado consolidado de la cartera.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function getPortfolioHandler(req, res, next) {
  try {
    const portfolio = await portfolioService.getPortfolio(req.user.id);
    res.json({ ok: true, portfolio });
  } catch (error) {
    next(error);
  }
}

/**
 * Genera la serie de datos para el gráfico de evolución temporal de la cartera.
 * @param {import('express').Request} req - Petición con query params (ids, metric, range).
 * @param {import('express').Response} res - Serie temporal calculada.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function getPortfolioChartHandler(req, res, next) {
  try {
    const rawIds = String(req.query.ids ?? '').split(',').map((id) => id.trim()).filter(Boolean);
    const metric = String(req.query.metric ?? 'gainPct');
    const range = String(req.query.range ?? '1y');
    const chart = await portfolioService.getPortfolioChart(req.user.id, { ids: rawIds, metric, range });
    res.json({ ok: true, chart });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
}

/**
 * Registra una operación de compra o venta de acciones con validación de lotes FIFO.
 * @param {import('express').Request} req - Petición con body (ticker, type, shares, price, date).
 * @param {import('express').Response} res - Transacción registrada.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function addTransactionHandler(req, res, next) {
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
}

/**
 * Elimina una transacción de la cartera recalculando las posiciones y ganancias FIFO.
 * @param {import('express').Request} req - Petición con params.id.
 * @param {import('express').Response} res - Confirmación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function removeTransactionHandler(req, res, next) {
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
}
