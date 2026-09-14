/**
 * @fileoverview Utilidades de validación, saneamiento y normalización de entradas.
 * @module utils/validate
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

/**
 * Normaliza una dirección de correo electrónico a minúsculas y sin espacios.
 * @param {unknown} email - Cadena de correo electrónico.
 * @returns {string} Correo normalizado o cadena vacía si es inválido.
 */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * Verifica si un correo electrónico cumple con el formato estándar.
 * @param {unknown} email - Cadena a comprobar.
 * @returns {boolean} Verdadero si es un correo válido.
 */
export function isValidEmail(email) {
  return EMAIL_PATTERN.test(String(email ?? ''));
}

/**
 * Valida si una contraseña cumple con los requisitos mínimos de seguridad (mínimo 8 caracteres).
 * @param {unknown} password - Contraseña en texto plano.
 * @returns {boolean} Verdadero si cumple los requisitos.
 */
export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

/**
 * Parsea y valida un parámetro de ruta para asegurar que sea un entero positivo seguro.
 * Rechaza notaciones exponenciales, números negativos o caracteres adicionales.
 * @param {unknown} value - Valor recibido en req.params.
 * @returns {number|null} ID numérico positivo o null si no es válido.
 */
export function parseIdParam(value) {
  if (typeof value !== 'string' || !/^\d{1,12}$/.test(value.trim())) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Valida un valor contra una lista blanca de categorías permitidas.
 * @param {unknown} raw - Valor candidato.
 * @param {string[]} allowed - Lista blanca de opciones permitidas.
 * @param {string} fallback - Valor por defecto si el candidato no es válido.
 * @returns {string} Categoría segura y normalizada.
 */
export function pickCategory(raw, allowed, fallback) {
  const candidate = String(raw ?? '').trim().toLowerCase();
  return allowed.includes(candidate) ? candidate : fallback;
}

/**
 * Sanea un array de imágenes adjuntas en base64 o URL.
 * @param {unknown} raw - Array candidato.
 * @param {Object} [options] - Opciones de límite.
 * @param {number} [options.max=5] - Número máximo de imágenes.
 * @param {number} [options.maxChars=7340032] - Tamaño máximo de caracteres por imagen (~7 MB).
 * @returns {string[]} Lista de URLs o representaciones seguras.
 */
export function sanitizeReportImages(raw, { max = 5, maxChars = 7 * 1024 * 1024 } = {}) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((img) => typeof img === 'string'
      && img.length > 0
      && img.length <= maxChars
      && (img.startsWith('data:image/') || img.startsWith('https://')))
    .slice(0, max);
}

/**
 * Escapa caracteres especiales de HTML para prevenir ataques XSS al renderizar texto en vistas.
 * @param {unknown} value - Texto sin sanear.
 * @returns {string} Texto seguro con entidades HTML escapadas.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Extrae de forma segura el cuerpo JSON de una petición Express asegurando que sea un objeto llano.
 * @param {import('express').Request} req - Petición HTTP.
 * @returns {Record<string, any>} Objeto del body o un objeto vacío si no es válido.
 */
export function getJsonObjectBody(req) {
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) return {};
  return req.body;
}

/**
 * Valida y extrae una fecha en formato ISO AAAA-MM-DD para filtros de consulta.
 * @param {unknown} value - Fecha en formato string.
 * @returns {{ ok: boolean, value: string|null }} Objeto con indicador de validez y fecha normalizada.
 */
export function parseDateFilter(value) {
  const str = String(value ?? '').trim();
  if (!str) return { ok: true, value: null };
  if (!DATE_PATTERN.test(str)) return { ok: false, value: null };
  const date = new Date(`${str}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== str) {
    return { ok: false, value: null };
  }
  return { ok: true, value: str };
}

/**
 * Comprueba si un buffer binario comienza con la firma canónica de un archivo PDF (%PDF-).
 * @param {Buffer} buffer - Buffer de datos del archivo.
 * @returns {boolean} Verdadero si es un PDF legítimo.
 */
export function isRealPdf(buffer) {
  return Boolean(buffer
    && typeof buffer.length === 'number'
    && buffer.length >= 5
    && buffer.subarray(0, 1024).toString('latin1').startsWith('%PDF-'));
}

/**
 * Normaliza la dirección IP del cliente a partir de headers de proxies o conexión directa.
 * @param {import('express').Request} req - Petición HTTP.
 * @returns {string|null} IP limpia de hasta 64 caracteres.
 */
export function normalizeIpAddress(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim().slice(0, 64) || null;
  }
  return (req.ip || req.socket?.remoteAddress || null) ?? null;
}

/**
 * Comprueba si un análisis es accesible para un usuario dado (público o perteneciente al usuario).
 * @param {Object} [analysis] - Registro del análisis.
 * @param {Object} [user] - Usuario autenticado o null.
 * @returns {boolean} Verdadero si el usuario tiene permiso de visualización.
 */
export function isAnalysisVisible(analysis, user) {
  if (!analysis) return false;
  if (analysis.is_public) return true;
  return Boolean(user && analysis.user_id === user.id);
}
