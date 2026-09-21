/**
 * @fileoverview Traducción automática de un análisis recién generado a los idiomas
 * soportados que aún no tienen variante. Un único proceso en vuelo por análisis;
 * el resto de peticiones esperan al mismo resultado (join).
 * @module services/translation/autoTranslate
 */

import { findDoneAnalysisByFilename } from '../../../db/repositories/analysisRepository.js';
import { SUPPORTED_LANGUAGES, normalizeLanguage } from '../../utils/i18n.js';
import { translateAnalysisVariant } from './analysisTranslation.service.js';

const inFlight = new Map();

/**
 * Clave estable de una variante en curso (ticker+accession o nombre de archivo).
 * @param {{ ticker?: string|null, accession?: string|null, filename?: string|null, targetLanguage: string }} params
 * @returns {string}
 */
export function translationKey({ ticker = null, accession = null, filename = null, targetLanguage }) {
  return `${ticker ?? filename ?? ''}:${accession ?? ''}:${targetLanguage}`;
}

/**
 * Idiomas soportados distintos del idioma de origen.
 * @param {string} sourceLanguage
 * @returns {string[]}
 */
export function missingLanguagesFor(sourceLanguage) {
  const source = normalizeLanguage(sourceLanguage);
  return SUPPORTED_LANGUAGES.filter((candidate) => candidate !== source);
}

/**
 * Traduce y guarda las variantes que falten para un análisis ya guardado.
 * No consume cupo del usuario: la variante queda cacheada con la misma
 * visibilidad que el análisis original.
 * @param {{ ticker?: string|null, accession?: string|null, filename?: string|null, language?: string|null, isPublic?: boolean|null, userId?: number|null }} params
 * @param {{ findDoneAnalysisByFilename?: Function, translateAnalysisVariant?: Function }} [deps] - Inyección para tests.
 * @returns {Promise<object[]>} Variantes traducidas (vacío si no había nada que hacer).
 */
export async function ensureLanguageVariants({ ticker = null, accession = null, filename = null, language = null, isPublic = null, userId = null }, deps = {}) {
  const findAnalysis = deps.findDoneAnalysisByFilename ?? findDoneAnalysisByFilename;
  const translate = deps.translateAnalysisVariant ?? translateAnalysisVariant;
  const resolvedFilename = filename ?? (ticker && accession ? `${ticker}-${accession}.pdf` : null);
  if (!resolvedFilename) return [];

  const source = await findAnalysis({ filename: resolvedFilename, language: normalizeLanguage(language), userId });
  if (!source?.report) return [];
  const pending = missingLanguagesFor(source.language);

  const results = [];
  for (const targetLanguage of pending) {
    const already = await findAnalysis({ filename: resolvedFilename, language: targetLanguage, userId });
    if (already?.report) continue;
    results.push(await translateVariantOnce({ source, targetLanguage, userId, isPublic, translate }));
  }
  return results.filter(Boolean);
}

/**
 * Si hay una traducción automática en curso hacia ese idioma, espera a que
 * termine y devuelve la variante guardada; si no, devuelve null al momento.
 * @param {{ ticker?: string|null, accession?: string|null, filename?: string|null, targetLanguage: string, userId?: number|null }} params
 * @param {{ findDoneAnalysisByFilename?: Function }} [deps]
 * @returns {Promise<object|null>}
 */
export async function joinAutoTranslation({ ticker = null, accession = null, filename = null, targetLanguage, userId = null }, deps = {}) {
  const findAnalysis = deps.findDoneAnalysisByFilename ?? findDoneAnalysisByFilename;
  const key = translationKey({ ticker, accession, filename, targetLanguage });
  const running = inFlight.get(key);
  if (running) await running;
  const resolvedFilename = filename ?? (ticker && accession ? `${ticker}-${accession}.pdf` : null);
  if (!resolvedFilename) return null;
  return findAnalysis({ filename: resolvedFilename, language: targetLanguage, userId });
}

function translateVariantOnce({ source, targetLanguage, userId, isPublic, translate = translateAnalysisVariant }) {
  const key = translationKey({ ticker: source.ticker, accession: source.accession, filename: source.filename, targetLanguage });
  const running = inFlight.get(key);
  if (running) return running;

  const task = translate({
    source,
    targetLanguage,
    userId,
    actor: 'auto',
    isPublic: isPublic ?? Boolean(source.is_public),
  })
    .catch((error) => {
      console.warn('[translation:auto]', `${key}: ${error.message}`);
      return null;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, task);
  return task;
}

/**
 * Espera a que terminen las traducciones automáticas en vuelo (uso en tests y
 * en apagados ordenados). Sin argumentos espera todas.
 * @param {string} [keyPrefix]
 * @returns {Promise<void>}
 */
export async function waitForAutoTranslations(keyPrefix = null) {
  const tasks = [...inFlight.entries()]
    .filter(([key]) => !keyPrefix || key.startsWith(keyPrefix))
    .map(([, task]) => task);
  await Promise.allSettled(tasks);
}

/**
 * Dispara la traducción de las variantes que falten sin bloquear la respuesta.
 * @param {object} params
 * @returns {void}
 */
export function scheduleLanguageVariants(params) {
  ensureLanguageVariants(params).catch((error) => {
    console.warn('[translation:auto]', error.message);
  });
}
