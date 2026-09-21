/**
 * @fileoverview Internacionalización de servidor (correos, PDF, exportadores y
 * textos generados por código). Comparte los diccionarios de la interfaz:
 * la clave es el texto fuente en español y cada idioma añade
 * `public/locales/<codigo>.json` con el mapa español → idioma.
 * @module utils/i18n
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_LANGUAGE = 'es';
export const SUPPORTED_LANGUAGES = ['es', 'en'];

export const SPANISH_OFFICIAL_COUNTRIES = [
  'ES', 'MX', 'CO', 'AR', 'PE', 'VE', 'CL', 'GT', 'EC', 'BO',
  'CU', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'GQ', 'PR',
];

export const SPANISH_OFFICIAL_TIMEZONES = new Set([
  'Europe/Madrid', 'Atlantic/Canary', 'Africa/Ceuta',
  'America/Mexico_City', 'America/Cancun', 'America/Merida', 'America/Monterrey',
  'America/Mazatlan', 'America/Chihuahua', 'America/Hermosillo', 'America/Tijuana',
  'America/Bahia_Banderas', 'America/Matamoros', 'America/Ojinaga',
  'America/Bogota',
  'America/Buenos_Aires', 'America/Argentina/Buenos_Aires', 'America/Argentina/Cordoba',
  'America/Argentina/Salta', 'America/Argentina/Jujuy', 'America/Argentina/Tucuman',
  'America/Argentina/Catamarca', 'America/Argentina/La_Rioja', 'America/Argentina/San_Juan',
  'America/Argentina/Mendoza', 'America/Argentina/San_Luis', 'America/Argentina/Rio_Gallegos',
  'America/Argentina/Ushuaia', 'America/Rosario', 'America/Cordoba',
  'America/Lima',
  'America/Caracas',
  'America/Santiago', 'America/Punta_Arenas', 'Pacific/Easter',
  'America/Guatemala',
  'America/Guayaquil', 'Pacific/Galapagos',
  'America/La_Paz',
  'America/Havana',
  'America/Santo_Domingo',
  'America/Tegucigalpa',
  'America/Asuncion',
  'America/El_Salvador',
  'America/Managua',
  'America/Costa_Rica',
  'America/Panama',
  'America/Montevideo',
  'Africa/Malabo',
  'America/Puerto_Rico',
]);

/**
 * Determina si un país tiene el español como idioma oficial.
 * @param {string} countryCode
 * @returns {boolean}
 */
export function isSpanishOfficialCountry(countryCode) {
  if (!countryCode) return false;
  return SPANISH_OFFICIAL_COUNTRIES.includes(String(countryCode).trim().toUpperCase());
}

/**
 * Determina si una zona horaria corresponde a un país con español oficial.
 * @param {string} tz
 * @returns {boolean}
 */
export function isSpanishOfficialTimezone(tz) {
  if (!tz) return false;
  return SPANISH_OFFICIAL_TIMEZONES.has(String(tz).trim());
}

/**
 * Parsea la cabecera Accept-Language respetando el factor de calidad q.
 * @param {string} header
 * @returns {Array<{ code: string, q: number }>}
 */
export function parseAcceptLanguage(header) {
  if (!header) return [];
  return String(header)
    .split(',')
    .map((entry) => {
      const [code, qPart] = entry.trim().split(';');
      const q = qPart ? parseFloat(qPart.replace(/^q=/, '')) : 1.0;
      return { code: code.trim(), q: Number.isFinite(q) ? q : 1.0 };
    })
    .filter((item) => item.code)
    .sort((a, b) => b.q - a.q);
}

/**
 * Detecta el idioma prioritario. Si el usuario procede de un país donde el español
 * NO es idioma oficial, prioriza el inglés (con descripción y textos en inglés).
 * @param {{ country?: string, acceptLanguage?: string, urlPath?: string, timezone?: string }} [options]
 * @returns {string} 'es' | 'en'
 */
export function detectPriorityLanguage(options = {}) {
  const { country, acceptLanguage, urlPath, timezone } = options;

  if (urlPath && (urlPath === '/en' || urlPath.startsWith('/en/'))) {
    return 'en';
  }

  if (country) {
    if (!isSpanishOfficialCountry(country)) return 'en';
  }

  if (timezone) {
    if (!isSpanishOfficialTimezone(timezone)) return 'en';
  }

  if (acceptLanguage) {
    const parsed = parseAcceptLanguage(acceptLanguage);
    for (const item of parsed) {
      const parts = item.code.split(/[-_]/);
      const lang = parts[0].toLowerCase();
      const region = parts[1] ? parts[1].toUpperCase() : null;

      if (lang === 'en') return 'en';
      if (region && !isSpanishOfficialCountry(region)) return 'en';
      if (lang === 'es' && (!region || isSpanishOfficialCountry(region))) return 'es';
      if (lang !== 'es') return 'en';
    }
  }

  return DEFAULT_LANGUAGE;
}

const LOCALES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/locales');
const dictionaries = new Map();

/**
 * Normaliza un código de idioma al conjunto soportado (es-ES → es).
 * @param {string} [code]
 * @returns {string}
 */
export function normalizeLanguage(code) {
  const clean = String(code || '').trim().toLowerCase();
  if (!clean) return DEFAULT_LANGUAGE;
  if (SUPPORTED_LANGUAGES.includes(clean)) return clean;
  const base = clean.split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : DEFAULT_LANGUAGE;
}

/**
 * Carga (y cachea) el diccionario de un idioma.
 * @param {string} lang
 * @returns {Object<string,string>}
 */
export function getDictionary(lang) {
  const normalized = normalizeLanguage(lang);
  if (normalized === DEFAULT_LANGUAGE) return {};
  if (dictionaries.has(normalized)) return dictionaries.get(normalized);
  let dict = {};
  try {
    const raw = fs.readFileSync(path.join(LOCALES_DIR, `${normalized}.json`), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== 'string') continue;
        dict[String(key).trim()] = value.trim();
      }
    }
  } catch {
    dict = {};
  }
  dictionaries.set(normalized, dict);
  return dict;
}

/**
 * Interpola parámetros `{clave}` en un texto.
 * @param {string} text
 * @param {Object} [params]
 * @returns {string}
 */
export function interpolate(text, params) {
  if (!params || text == null) return text;
  return String(text).replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  ));
}

/**
 * Traduce un texto fuente en español al idioma indicado.
 * @param {string} text - Texto fuente (clave del diccionario).
 * @param {Object} [params] - Parámetros de interpolación `{clave}`.
 * @param {string} [lang] - Idioma de destino.
 * @returns {string}
 */
export function t(text, params, lang) {
  if (text == null) return text;
  const key = String(text);
  if (key.trim().toLowerCase() === 'cifra') return key;
  const normalized = normalizeLanguage(lang);
  if (normalized === DEFAULT_LANGUAGE) return interpolate(key, params);
  const translated = getDictionary(normalized)[key];
  return interpolate(translated != null ? translated : key, params);
}

/**
 * Devuelve una función de traducción fijada a un idioma.
 * @param {string} [lang]
 * @returns {(text: string, params?: Object) => string}
 */
export function translatorFor(lang) {
  const normalized = normalizeLanguage(lang);
  return (text, params) => t(text, params, normalized);
}

/**
 * Configuración regional para `Intl` según el idioma.
 * @param {string} [lang]
 * @returns {string}
 */
export function localeFor(lang) {
  return normalizeLanguage(lang) === 'en' ? 'en-US' : 'es-ES';
}

/**
 * Formatea un número con la configuración regional del idioma.
 * @param {number} value
 * @param {Intl.NumberFormatOptions} [options]
 * @param {string} [lang]
 * @returns {string}
 */
export function formatNumber(value, options, lang) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat(localeFor(lang), options).format(number);
}

/**
 * Formatea un número con decimales fijos y los separadores del idioma
 * (millares y decimal: «2.364,3» en español, «2,364.3» en inglés).
 * @param {number|string} value
 * @param {number} [decimals]
 * @param {string} [lang]
 * @returns {string}
 */
export function formatFixed(value, decimals = 0, lang) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat(localeFor(lang), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(number);
}

/**
 * Formatea un porcentaje con signo (15.5 → "+15,5 %" en español, "+15.5%" en inglés).
 * @param {number} value
 * @param {{ digits?: number, signed?: boolean, lang?: string }} [options]
 * @returns {string}
 */
export function formatPercent(value, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const digits = Number.isInteger(options.digits) ? options.digits : 2;
  const formatted = new Intl.NumberFormat(localeFor(options.lang), {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(number);
  const sign = options.signed !== false && number > 0 ? '+' : '';
  return `${sign}${formatted} %`;
}
