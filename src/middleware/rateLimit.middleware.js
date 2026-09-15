/**
 * @fileoverview Middleware de limitación de tasa (Rate Limiting) en memoria con soporte de ventanas deslizantes y scopes.
 * Protege contra abusos en subidas, valoraciones y consultas automáticas de bots.
 * @module middleware/rateLimit
 */

import { resolveClientIp } from '../utils/clientIp.js';

const buckets = new Map();
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

/**
 * Obtiene el identificador del cliente aplicando proxies de confianza (ver clientIp.js).
 * Las cabeceras solo se usan si el salto previo es un proxy/Cloudflare verificado,
 * de modo que no se puede evadir el límite falsificando cabeceras contra el origen.
 * @private
 * @param {import('express').Request} req - Petición HTTP.
 * @returns {string} Identificador único del cliente.
 */
function clientKey(req) {
  return resolveClientIp(req);
}

/**
 * Limpia cubetas de peticiones expiradas periódicamente para evitar fugas de memoria.
 * @private
 * @param {number} now - Timestamp actual.
 */
function cleanup(now) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Genera un middleware de Express para limitar la frecuencia de peticiones por IP y ámbito.
 * @param {Object} [options] - Opciones de configuración.
 * @param {number} [options.windowMs=900000] - Ventana temporal en milisegundos (por defecto 15 min).
 * @param {number} [options.max=10] - Número máximo de peticiones permitidas por ventana.
 * @param {string} [options.message='Demasiadas solicitudes. Inténtalo de nuevo más tarde.'] - Mensaje de error 429.
 * @param {string} [options.scope='global'] - Identificador del ámbito de limitación.
 * @returns {import('express').RequestHandler} Middleware configurado.
 */
export function rateLimit({
  windowMs = 15 * 60 * 1000,
  max = 10,
  message = 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.',
  scope = 'global',
} = {}) {
  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    cleanup(now);

    const key = `${scope}|${clientKey(req)}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(remaining));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}
