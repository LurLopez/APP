/**
 * @fileoverview Resolución del idioma de los análisis.
 * Prioridad: idioma explícito en la petición → preferencia de la cuenta → español.
 * @module utils/analysisLanguage
 */

import { normalizeLanguage, SUPPORTED_LANGUAGES } from './i18n.js';
import { getUserPreferences } from '../../db/repositories/watchlistRepositoryPrefs.js';

/**
 * Obtiene el idioma pedido en el cuerpo o la query de la petición.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function readRequestedLanguage(req) {
  const raw = req?.body?.language ?? req?.query?.language;
  if (raw == null || String(raw).trim() === '') return null;
  return normalizeLanguage(raw);
}

/**
 * Resuelve el idioma del análisis para una petición (explícito o preferencia de la cuenta).
 * @param {import('express').Request} req
 * @param {object|null} [user]
 * @returns {Promise<string>}
 */
export async function resolveAnalysisLanguage(req, user = null) {
  const requested = readRequestedLanguage(req);
  if (requested) return requested;
  const userId = user?.id ?? req?.user?.id ?? null;
  if (userId) {
    try {
      const prefs = await getUserPreferences(userId);
      if (prefs?.analysisLanguage) return normalizeLanguage(prefs.analysisLanguage);
    } catch {
      // Sin preferencia disponible: español
    }
  }
  return 'es';
}

export { SUPPORTED_LANGUAGES };
