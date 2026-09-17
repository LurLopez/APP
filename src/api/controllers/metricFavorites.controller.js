/**
 * @fileoverview Controladores de métricas favoritas de los estados financieros.
 * @module api/controllers/metricFavorites
 */

import {
  listMetricFavorites,
  addMetricFavorite,
  removeMetricFavorite,
} from '../../../db/repositories/metricFavoriteRepository.js';

const VALID_STATEMENTS = new Set(['income', 'balance', 'cashflow', 'ratios']);

// Las claves de métrica son identificadores camelCase generados por el servidor.
const METRIC_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,79}$/;

const LABEL_MAX_LENGTH = 160;

/**
 * Normaliza y valida los datos de una métrica favorita.
 * @param {object} raw - Datos de entrada.
 * @param {string} fallbackStatement - Estado recibido por parámetro de ruta.
 * @param {string} fallbackKey - Clave recibida por parámetro de ruta.
 * @returns {{statement: string, key: string, label: string}|null} Datos válidos o null.
 */
export function normalizeFavoritePayload(raw, fallbackStatement = '', fallbackKey = '') {
  const statement = String(raw?.statement ?? fallbackStatement ?? '').trim();
  const key = String(raw?.key ?? fallbackKey ?? '').trim();
  if (!VALID_STATEMENTS.has(statement) || !METRIC_KEY_PATTERN.test(key)) return null;
  const label = String(raw?.label ?? '').trim().slice(0, LABEL_MAX_LENGTH) || key;
  return { statement, key, label };
}

/**
 * Devuelve las métricas favoritas del usuario autenticado.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
export async function listMetricFavoritesHandler(req, res, next) {
  try {
    const favorites = await listMetricFavorites(req.user.id);
    res.json({ ok: true, favorites });
  } catch (error) {
    next(error);
  }
}

/**
 * Marca una métrica como favorita para el usuario autenticado.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
export async function addMetricFavoriteHandler(req, res, next) {
  try {
    const payload = normalizeFavoritePayload(req.body, req.params.statement, req.params.key);
    if (!payload) {
      res.status(400).json({ error: 'Métrica favorita no válida.' });
      return;
    }
    const favorite = await addMetricFavorite(req.user.id, payload.statement, payload.key, payload.label);
    res.json({ ok: true, favorite });
  } catch (error) {
    next(error);
  }
}

/**
 * Quita una métrica de favoritos para el usuario autenticado.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
export async function removeMetricFavoriteHandler(req, res, next) {
  try {
    const payload = normalizeFavoritePayload(null, req.params.statement, req.params.key);
    if (!payload) {
      res.status(400).json({ error: 'Métrica favorita no válida.' });
      return;
    }
    await removeMetricFavorite(req.user.id, payload.statement, payload.key);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}
