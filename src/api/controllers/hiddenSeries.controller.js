/**
 * @fileoverview Controladores de las series ocultas del gráfico de datos financieros.
 * @module api/controllers/hiddenSeries
 */

import {
  listHiddenSeries,
  replaceHiddenSeries,
} from '../../../db/repositories/hiddenSeriesRepository.js';

// Identificador de serie: `<claveMétrica>__<ticker>` (ej. buybacks__KHC).
const SERIES_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,79}__[A-Za-z0-9.-]{1,10}$/;

const MAX_HIDDEN_SERIES = 500;

/**
 * Valida y deduplica la lista de series ocultas recibida.
 * @param {unknown} value - Valor recibido en el cuerpo de la petición.
 * @returns {string[]|null} Lista válida o null si hay algún elemento incorrecto.
 */
export function normalizeSeriesIds(value) {
  if (!Array.isArray(value)) return null;
  const unique = [];
  const seen = new Set();
  for (const raw of value) {
    if (typeof raw !== 'string') return null;
    const id = raw.trim();
    if (!SERIES_ID_PATTERN.test(id)) return null;
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(id);
    }
  }
  if (unique.length > MAX_HIDDEN_SERIES) return null;
  return unique;
}

/**
 * Devuelve las series ocultas del gráfico del usuario autenticado.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
export async function listHiddenSeriesHandler(req, res, next) {
  try {
    const seriesIds = await listHiddenSeries(req.user.id);
    res.json({ ok: true, seriesIds });
  } catch (error) {
    next(error);
  }
}

/**
 * Reemplaza las series ocultas del gráfico del usuario autenticado.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
export async function replaceHiddenSeriesHandler(req, res, next) {
  try {
    const seriesIds = normalizeSeriesIds(req.body?.seriesIds ?? []);
    if (!seriesIds) {
      res.status(400).json({ error: 'Lista de series ocultas no válida.' });
      return;
    }
    const saved = await replaceHiddenSeries(req.user.id, seriesIds);
    res.json({ ok: true, seriesIds: saved });
  } catch (error) {
    next(error);
  }
}
