/**
 * @fileoverview Controlador para la gestión del calendario de eventos y alertas por email de empresas en seguimiento.
 * @module api/controllers/watchlistCalendar
 */

import * as watchlistRepository from '../../../db/repositories/watchlistRepository.js';
import { getCompanyByTicker } from '../../services/edgar.service.js';
import { checkAndDispatchAlerts } from '../../services/alertScanner.service.js';
import * as portfolioService from '../../services/portfolio.service.js';

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;

/**
 * Consulta la lista de tickers añadidos al calendario financiero del usuario.
 * @param {import('express').Request} req - Petición con usuario autenticado.
 * @param {import('express').Response} res - Lista de tickers.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function listCalendarTickersHandler(req, res, next) {
  try {
    const list = await watchlistRepository.listCalendarTickers(req.user.id);
    res.json({ ok: true, tickers: list.map((c) => c.ticker) });
  } catch (error) {
    next(error);
  }
}

/**
 * Añade una empresa al calendario del usuario.
 * @param {import('express').Request} req - Petición con body.ticker y body.companyName opcional.
 * @param {import('express').Response} res - Elemento añadido.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function addCalendarItemHandler(req, res, next) {
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
}

/**
 * Elimina una empresa del calendario financiero, verificando que no posea acciones en cartera.
 * @param {import('express').Request} req - Petición con params.ticker.
 * @param {import('express').Response} res - Confirmación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function removeCalendarItemHandler(req, res, next) {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }
    const portfolio = await portfolioService.getPortfolio(req.user.id);
    const inPortfolio = (portfolio?.positions || []).some((p) => p.ticker === ticker && Number(p.shares) > 0);
    if (inPortfolio) {
      res.status(400).json({ error: 'No se pueden eliminar del calendario las empresas con posición en tu cartera.' });
      return;
    }
    await watchlistRepository.removeCalendarTicker(req.user.id, ticker);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

/**
 * Consulta las preferencias de notificaciones por email para empresas en seguimiento.
 * @param {import('express').Request} req - Petición con usuario autenticado.
 * @param {import('express').Response} res - Lista de alertas configuradas.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function listNotificationsHandler(req, res, next) {
  try {
    const list = await watchlistRepository.listEmailAlerts(req.user.id);
    res.json({ ok: true, alerts: list });
  } catch (error) {
    next(error);
  }
}

/**
 * Crea o actualiza la configuración de alertas por correo electrónico para una empresa.
 * @param {import('express').Request} req - Petición con body (ticker, enabled, notifyEarnings, etc.).
 * @param {import('express').Response} res - Alerta actualizada.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function upsertNotificationHandler(req, res, next) {
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
}

/**
 * Elimina la suscripción de alertas por correo electrónico para un ticker específico.
 * @param {import('express').Request} req - Petición con params.ticker.
 * @param {import('express').Response} res - Confirmación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function deleteNotificationHandler(req, res, next) {
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
}

/**
 * Fuerza el escaneo inmediato y envío de alertas programadas sin esperar al cron job.
 * @param {import('express').Request} _req - Petición HTTP.
 * @param {import('express').Response} res - Resultado del escaneo y envío.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function checkNotificationsNowHandler(_req, res, next) {
  try {
    const result = await checkAndDispatchAlerts();
    res.json({ ok: true, result });
  } catch (error) {
    next(error);
  }
}
