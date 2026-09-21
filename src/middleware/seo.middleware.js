/**
 * @fileoverview Middleware principal de optimización para motores de búsqueda (SEO) y LLMs.
 * Orquesta redirecciones canónicas, renderizado SSR de metatags e integración de contenidos para IA.
 * @module middleware/seo
 */

import config from '../../config/index.js';
import {
  handleSpecialTextRoutes,
  handleGuideAndLegalRoutes,
  handlePublicReportRoutes,
  handleCompanyRoutes,
  handleHomeAndIndexRoutes,
} from './seoHandlers.js';

/**
 * Parsea y normaliza la URL de una petición entrante.
 * @private
 * @param {import('express').Request} req - Petición HTTP.
 * @returns {URL|null} Objeto URL parseado o null si es inválida.
 */
function parseUrl(req) {
  try {
    return new URL(req.originalUrl, config.siteUrl);
  } catch {
    return null;
  }
}

/**
 * Aplica redirecciones canónicas para barras finales superfluas y alias de archivos estáticos.
 * @private
 * @param {string} pathname - Ruta limpia.
 * @param {URL} parsed - Objeto URL.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @returns {boolean} Verdadero si se ejecutó una redirección.
 */
function applyCanonicalRedirects(pathname, parsed, res) {
  if (pathname.endsWith('/') && pathname !== '/') {
    res.redirect(301, pathname.slice(0, -1) + (parsed.search || ''));
    return true;
  }

  if (pathname === '/index.html' || pathname === '/empresa.html') {
    const target = pathname === '/index.html' ? '/' : '/empresa';
    res.redirect(301, target + (parsed.search || ''));
    return true;
  }

  if (pathname === '/en/index.html' || pathname === '/en/empresa.html') {
    const target = pathname === '/en/index.html' ? '/en' : '/en/empresa';
    res.redirect(301, target + (parsed.search || ''));
    return true;
  }

  if (pathname === '/informe') {
    res.redirect(301, '/analisis');
    return true;
  }

  if (pathname === '/en/informe') {
    res.redirect(301, '/en/analisis');
    return true;
  }

  return false;
}

/**
 * Middleware Express para la resolución de rutas SEO, SSR de empresa, informes y archivos llms.txt.
 * @param {import('express').Request} req - Petición HTTP.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Siguiente middleware.
 * @returns {Promise<void>}
 */
export async function seoHtmlMiddleware(req, res, next) {
  const parsed = parseUrl(req);
  if (!parsed) {
    next();
    return;
  }

  const pathname = parsed.pathname.replace(/\/{2,}/g, '/');

  if (applyCanonicalRedirects(pathname, parsed, res)) return;
  if (await handleSpecialTextRoutes(pathname, res)) return;
  if (handleGuideAndLegalRoutes(pathname, res)) return;
  if (await handleHomeAndIndexRoutes(pathname, parsed, res)) return;
  if (await handlePublicReportRoutes(pathname, req, res)) return;

  await handleCompanyRoutes(pathname, parsed, req, res, next);
}
