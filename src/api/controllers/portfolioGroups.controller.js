/**
 * @fileoverview Controlador para la gestión de pestañas organizativas, grupos y miembros de la cartera.
 * @module api/controllers/portfolioGroups
 */

import * as portfolioService from '../../services/portfolio.service.js';
import { handlePortfolioError } from './portfolio.controller.js';

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;
const NAME_PATTERN = /^[A-Za-z0-9áéíóúüñÁÉÍÓÚÜÑ _\-\u00e0-\u00ff]{1,40}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Valida y limpia el nombre de una pestaña o grupo.
 * @private
 * @param {unknown} value - Nombre en bruto.
 * @returns {string|null} Nombre limpio o null si es inválido.
 */
function cleanName(value) {
  const name = String(value ?? '').trim();
  return name.length >= 1 && name.length <= 40 && NAME_PATTERN.test(name) ? name : null;
}

/**
 * Valida un código de color hexadecimal #RRGGBB.
 * @private
 * @param {unknown} value - Color en bruto.
 * @returns {string|null} Color limpio o null si es inválido.
 */
function cleanColor(value) {
  const color = String(value ?? '').trim();
  return COLOR_PATTERN.test(color) ? color : null;
}

/**
 * Extrae y valida los parámetros de miembro (ticker o lote).
 * @private
 * @param {import('express').Request} req - Petición HTTP.
 * @param {import('express').Response} res - Respuesta HTTP para devolver 400 si falta.
 * @returns {{ ticker: string|null, transactionId: number|null }|null}
 */
function extractMemberParams(req, res) {
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

/**
 * Crea una nueva pestaña de agrupación en la cartera.
 * @param {import('express').Request} req - Petición con body.name y body.color opcional.
 * @param {import('express').Response} res - Pestaña creada.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function createTabHandler(req, res, next) {
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
}

/**
 * Actualiza el nombre o color de una pestaña de cartera existente.
 * @param {import('express').Request} req - Petición con params.id y body (name, color).
 * @param {import('express').Response} res - Pestaña actualizada.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function updateTabHandler(req, res, next) {
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
}

/**
 * Elimina una pestaña de cartera y desvincula sus grupos.
 * @param {import('express').Request} req - Petición con params.id.
 * @param {import('express').Response} res - Confirmación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function deleteTabHandler(req, res, next) {
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
}

/**
 * Crea un grupo de posiciones dentro de una pestaña.
 * @param {import('express').Request} req - Petición con body (tabId, name, color, tickers, lotTransactionIds).
 * @param {import('express').Response} res - Grupo creado.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function createGroupHandler(req, res, next) {
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
      .map((t) => String(t ?? '').trim().toUpperCase())
      .filter((t) => TICKER_PATTERN.test(t));
    for (const ticker of new Set(tickers)) {
      await portfolioService.addGroupTicker(req.user.id, group.id, ticker);
    }
    const lotIds = (Array.isArray(req.body?.lotTransactionIds) ? req.body.lotTransactionIds : [])
      .map((val) => Number(val))
      .filter((val) => Number.isInteger(val));
    for (const transactionId of new Set(lotIds)) {
      await portfolioService.addGroupLot(req.user.id, group.id, transactionId);
    }

    res.status(201).json({ ok: true, group });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
}

/**
 * Modifica el nombre o color de un grupo de posiciones.
 * @param {import('express').Request} req - Petición con params.id y body (name, color).
 * @param {import('express').Response} res - Grupo actualizado.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function updateGroupHandler(req, res, next) {
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
}

/**
 * Elimina un grupo de posiciones de cartera.
 * @param {import('express').Request} req - Petición con params.id.
 * @param {import('express').Response} res - Confirmación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function deleteGroupHandler(req, res, next) {
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
}

/**
 * Asocia un ticker completo o lote específico a un grupo de cartera.
 * @param {import('express').Request} req - Petición con params.id y body (ticker o transactionId).
 * @param {import('express').Response} res - Confirmación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function addGroupMemberHandler(req, res, next) {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) {
      res.status(400).json({ error: 'Grupo no válido.' });
      return;
    }
    const params = extractMemberParams(req, res);
    if (!params) return;
    if (params.ticker) await portfolioService.addGroupTicker(req.user.id, groupId, params.ticker);
    else await portfolioService.addGroupLot(req.user.id, groupId, params.transactionId);
    res.status(201).json({ ok: true });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
}

/**
 * Desvincula un ticker o lote de un grupo de cartera.
 * @param {import('express').Request} req - Petición con params.id y body (ticker o transactionId).
 * @param {import('express').Response} res - Confirmación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function removeGroupMemberHandler(req, res, next) {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) {
      res.status(400).json({ error: 'Grupo no válido.' });
      return;
    }
    const params = extractMemberParams(req, res);
    if (!params) return;
    if (params.ticker) await portfolioService.removeGroupTicker(req.user.id, groupId, params.ticker);
    else await portfolioService.removeGroupLot(req.user.id, groupId, params.transactionId);
    res.json({ ok: true });
  } catch (error) {
    handlePortfolioError(error, res, next);
  }
}
