/**
 * @fileoverview Controlador para la gestión de listas de seguimiento (watchlists), elementos y preferencias.
 * @module api/controllers/watchlists
 */

import * as watchlistRepository from '../../../db/repositories/watchlistRepository.js';
import { getCompanyByTicker } from '../../services/edgar.service.js';
import { getMarketQuote } from '../../services/market.service.js';

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;
const NAME_PATTERN = /^.{1,40}$/s;

/**
 * Normaliza nombres de listas de seguimiento eliminando espacios duplicados.
 * @param {unknown} value - Nombre en bruto.
 * @returns {string} Nombre limpio.
 */
export function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Manejador centralizado de errores para operaciones sobre watchlists.
 * @param {Error & { code?: string }} error - Error detectado.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Siguiente middleware.
 */
export function handleWatchlistError(error, res, next) {
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

/**
 * Obtiene todas las listas del usuario junto con alertas y tickers en calendario.
 * @param {import('express').Request} req - Petición con usuario autenticado.
 * @param {import('express').Response} res - Listas formateadas.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function listWatchlistsHandler(req, res, next) {
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
}

/**
 * Crea una nueva lista de seguimiento personalizada para el usuario.
 * @param {import('express').Request} req - Petición con req.body.name.
 * @param {import('express').Response} res - Lista creada.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function createWatchlistHandler(req, res, next) {
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
}

/**
 * Consulta las preferencias de visualización y configuración de seguimiento del usuario.
 * @param {import('express').Request} req - Petición HTTP.
 * @param {import('express').Response} res - Preferencias guardadas.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function getUserPreferencesHandler(req, res, next) {
  try {
    const preferences = await watchlistRepository.getUserPreferences(req.user.id);
    res.json({ ok: true, preferences });
  } catch (error) {
    next(error);
  }
}

/**
 * Actualiza las preferencias de visualización y configuración de seguimiento del usuario.
 * @param {import('express').Request} req - Petición con cuerpo de preferencias.
 * @param {import('express').Response} res - Preferencias actualizadas.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function updateUserPreferencesHandler(req, res, next) {
  try {
    const preferences = await watchlistRepository.updateUserPreferences(req.user.id, req.body ?? {});
    res.json({ ok: true, preferences });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtiene el detalle de una lista de seguimiento con cotizaciones de mercado en tiempo real.
 * @param {import('express').Request} req - Petición con params.id.
 * @param {import('express').Response} res - Detalle de la lista y cotizaciones.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function getWatchlistDetailHandler(req, res, next) {
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
}

/**
 * Modifica el nombre de una lista de seguimiento personalizada existente.
 * @param {import('express').Request} req - Petición con params.id y body.name.
 * @param {import('express').Response} res - Lista renombrada.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function renameWatchlistHandler(req, res, next) {
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
}

/**
 * Elimina permanentemente una lista de seguimiento personalizada no por defecto.
 * @param {import('express').Request} req - Petición con params.id.
 * @param {import('express').Response} res - Confirmación de eliminación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function deleteWatchlistHandler(req, res, next) {
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
}

/**
 * Añade una empresa por ticker a una lista de seguimiento y aplica reglas por defecto.
 * @param {import('express').Request} req - Petición con params.id y body.ticker.
 * @param {import('express').Response} res - Elemento añadido.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function addWatchlistItemHandler(req, res, next) {
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
    await watchlistRepository.applyWatchlistAddDefaults(req.user.id, ticker, companyName);
    res.status(201).json({ ok: true, item });
  } catch (error) {
    handleWatchlistError(error, res, next);
  }
}

/**
 * Elimina una empresa de una lista de seguimiento.
 * @param {import('express').Request} req - Petición con params.id y params.ticker.
 * @param {import('express').Response} res - Confirmación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function removeWatchlistItemHandler(req, res, next) {
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
}
