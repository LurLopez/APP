/**
 * @fileoverview Controladores auxiliares para el renderizado SSR, metatags SEO y endpoints para agentes LLM.
 * @module middleware/seoHandlers
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import config from '../../config/index.js';
import {
  serveHtml,
  serveStandalone,
  serveGuide,
  serveLegal,
  serve404Page,
  getReportSlugById,
  getPublicReportHtmlBySlug,
  getPublicReportMarkdownBySlug,
  isPrivatePath,
  resolveCompanyMeta,
  getSitemapXml,
  getCompanyBotContent,
  getCompanyMarkdown,
  getHomeBotContent,
  getCompaniesBotContent,
  getHomeJsonLd,
  getCompaniesJsonLd,
  getLlmsTxt,
  getLlmsFullTxt,
  jsonLdScript,
} from '../services/seo.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const HTML_FILE = 'empresa.html';
const INDEX_FILE = 'index.html';

const REPORT_ID_PATH = /^\/informe\/(\d{1,7})$/;
const REPORT_ID_MD_PATH = /^\/informe\/(\d{1,7})\.md$/;
const REPORT_SLUG_PATH = /^\/informe\/([A-Za-z0-9.-]{1,10})\/([A-Za-z0-9.-]{2,15})$/;
const REPORT_SLUG_MD_PATH = /^\/informe\/([A-Za-z0-9.-]{1,10})\/([A-Za-z0-9.-]{2,15})\.md$/;

/**
 * Sirve un archivo de texto estático reemplazando variables de plantilla.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {string} fileName - Nombre del archivo en public/.
 * @param {string} contentType - Tipo MIME.
 */
export function sendTextFile(res, fileName, contentType) {
  const raw = fs.readFileSync(path.join(PUBLIC_DIR, fileName), 'utf8');
  res.set('Content-Type', contentType);
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(raw.replaceAll('{{SITE_URL}}', config.siteUrl));
}

/**
 * Gestiona rutas de recursos informativos para bots y motores de búsqueda (llms.txt, sitemap.xml, etc.).
 * @param {string} pathname - Ruta normalizada de la petición.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @returns {Promise<boolean>} Verdadero si la petición fue resuelta.
 */
export async function handleSpecialTextRoutes(pathname, res) {
  if (pathname === '/robots.txt') {
    try {
      sendTextFile(res, 'robots.txt', 'text/plain; charset=utf-8');
    } catch {
      res.status(404).send('Not found');
    }
    return true;
  }

  if (pathname === '/llms.txt') {
    try {
      const txt = await getLlmsTxt();
      res.set('Content-Type', 'text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=1800').send(txt);
    } catch {
      try {
        sendTextFile(res, 'llms.txt', 'text/plain; charset=utf-8');
      } catch {
        res.status(404).send('Not found');
      }
    }
    return true;
  }

  if (pathname === '/llms-full.txt') {
    try {
      const txt = await getLlmsFullTxt();
      res.set('Content-Type', 'text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=1800').send(txt);
    } catch {
      res.status(500).send('Error generando llms-full.txt');
    }
    return true;
  }

  if (pathname === '/sitemap.xml') {
    try {
      const xml = await getSitemapXml();
      res.set('Content-Type', 'application/xml; charset=utf-8').set('Cache-Control', 'public, max-age=1800').send(xml);
    } catch {
      res.status(500).send('Sitemap no disponible');
    }
    return true;
  }

  return false;
}

/**
 * Gestiona la entrega de páginas legales y guías financieras educativas.
 * @param {string} pathname - Ruta de la petición.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @returns {boolean} Verdadero si fue resuelta.
 */
export function handleGuideAndLegalRoutes(pathname, res) {
  if (pathname === '/guias') {
    serveHtml(res, HTML_FILE, { pathname: '/guias', noIndex: false });
    return true;
  }
  if (pathname === '/guías') {
    res.redirect(301, '/guias');
    return true;
  }
  if (pathname.startsWith('/guías/')) {
    res.redirect(301, '/guias/' + pathname.slice('/guías/'.length));
    return true;
  }
  if (pathname.startsWith('/guias/')) {
    if (serveGuide(res, decodeURIComponent(pathname.slice('/guias/'.length)))) return true;
    serve404Page(res);
    return true;
  }
  if (pathname === '/legal') {
    res.redirect(301, '/legal/aviso-legal');
    return true;
  }
  if (pathname.startsWith('/legal/')) {
    if (serveLegal(res, decodeURIComponent(pathname.slice('/legal/'.length)))) return true;
    serve404Page(res);
    return true;
  }
  return false;
}

/**
 * Procesa rutas canónicas semánticas y markdown para informes financieros.
 * @param {string} pathname - Ruta HTTP.
 * @param {import('express').Request} req - Petición HTTP.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @returns {Promise<boolean>} Verdadero si la ruta correspondía a un informe y fue atendida.
 */
export async function handlePublicReportRoutes(pathname, req, res) {
  const reportIdMatch = pathname.match(REPORT_ID_PATH);
  const reportIdMdMatch = pathname.match(REPORT_ID_MD_PATH);
  const reportSlugMatch = pathname.match(REPORT_SLUG_PATH);
  const reportSlugMdMatch = pathname.match(REPORT_SLUG_MD_PATH);

  if (reportIdMdMatch || (reportIdMatch && req.headers.accept?.includes('text/markdown'))) {
    const reportId = reportIdMdMatch ? reportIdMdMatch[1] : reportIdMatch[1];
    const info = await getReportSlugById(reportId).catch(() => null);
    if (info) res.redirect(301, `/informe/${encodeURIComponent(info.ticker)}/${info.slug}.md`);
    else serve404Page(res);
    return true;
  }

  if (reportIdMatch) {
    const info = await getReportSlugById(reportIdMatch[1]).catch(() => null);
    if (info) res.redirect(301, `/informe/${encodeURIComponent(info.ticker)}/${info.slug}`);
    else serve404Page(res);
    return true;
  }

  if (reportSlugMdMatch || (reportSlugMatch && req.headers.accept?.includes('text/markdown'))) {
    const rawTicker = reportSlugMdMatch ? reportSlugMdMatch[1] : reportSlugMatch[1];
    const rawSlug = reportSlugMdMatch ? reportSlugMdMatch[2] : reportSlugMatch[2];
    const resObj = await getPublicReportMarkdownBySlug(rawTicker, rawSlug).catch(() => null);
    if (resObj) {
      if (resObj.canonicalSlug && resObj.canonicalSlug !== rawSlug.toUpperCase()) {
        res.redirect(301, `/informe/${encodeURIComponent(resObj.ticker)}/${resObj.canonicalSlug}.md`);
        return true;
      }
      res.set('Content-Type', 'text/markdown; charset=utf-8').set('Cache-Control', 'public, max-age=1800').send(resObj.markdown);
    } else {
      serve404Page(res);
    }
    return true;
  }

  if (reportSlugMatch) {
    const rawTicker = reportSlugMatch[1];
    const rawSlug = reportSlugMatch[2];
    const resObj = await getPublicReportHtmlBySlug(rawTicker, rawSlug).catch(() => null);
    if (resObj) {
      if (resObj.canonicalSlug && resObj.canonicalSlug !== rawSlug.toUpperCase()) {
        res.redirect(301, `/informe/${encodeURIComponent(resObj.ticker)}/${resObj.canonicalSlug}`);
        return true;
      }
      serveStandalone(res, resObj.html);
    } else {
      serve404Page(res);
    }
    return true;
  }

  return false;
}

/**
 * Procesa las vistas SSR para páginas de empresa tanto en versión HTML enriquecida como Markdown.
 * @param {string} pathname - Ruta normalizada.
 * @param {URL} parsed - Objeto URL parseado.
 * @param {import('express').Request} req - Petición HTTP.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Siguiente middleware.
 * @returns {Promise<boolean>}
 */
export async function handleCompanyRoutes(pathname, parsed, req, res, next) {
  const companyMdMatch = pathname.match(/^\/empresa\/([A-Za-z0-9.-]{1,10})\.md$/);
  if (companyMdMatch || (pathname.startsWith('/empresa/') && req.headers.accept?.includes('text/markdown'))) {
    const rawTicker = companyMdMatch ? companyMdMatch[1] : decodeURIComponent(pathname.slice('/empresa/'.length));
    const md = await getCompanyMarkdown(rawTicker).catch(() => null);
    if (md) res.set('Content-Type', 'text/markdown; charset=utf-8').set('Cache-Control', 'public, max-age=1800').send(md);
    else serve404Page(res);
    return true;
  }

  const companyTarget = pathname.startsWith('/empresa/');
  const isPrivate = isPrivatePath(pathname);
  if (!companyTarget && !isPrivate) {
    next();
    return true;
  }

  try {
    const companyMeta = await resolveCompanyMeta(pathname, parsed.searchParams);
    if (companyTarget && !companyMeta) {
      serve404Page(res);
      return true;
    }
    let botContent = null;
    if (companyMeta && !isPrivate) {
      botContent = await getCompanyBotContent(companyMeta).catch(() => null);
    }
    serveHtml(res, HTML_FILE, { pathname, noIndex: isPrivate, companyMeta, botContent });
    return true;
  } catch (error) {
    if (error.code === 'EDGAR_UNAVAILABLE') {
      res.status(503).set('Retry-After', '60').send('Servicio de datos temporalmente no disponible');
      return true;
    }
    if (companyTarget) {
      serve404Page(res);
      return true;
    }
    serveHtml(res, HTML_FILE, { pathname, noIndex: isPrivate });
    return true;
  }
}

/**
 * Renderiza la página de inicio o el catálogo general de empresas con datos JSON-LD estructurados.
 * @param {string} pathname - Ruta.
 * @param {URL} parsed - URL parseada.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @returns {Promise<boolean>}
 */
export async function handleHomeAndIndexRoutes(pathname, parsed, res) {
  if (pathname === '/') {
    try {
      const [botContent, jsonLd] = await Promise.all([getHomeBotContent(), getHomeJsonLd()]);
      serveHtml(res, INDEX_FILE, { pathname: '/', botContent, headExtras: jsonLdScript(jsonLd) });
    } catch {
      serveHtml(res, INDEX_FILE, { pathname: '/' });
    }
    return true;
  }

  if (pathname === '/empresa' && !parsed.searchParams.has('ticker')) {
    try {
      const [botContent, jsonLd] = await Promise.all([getCompaniesBotContent(), getCompaniesJsonLd()]);
      serveHtml(res, HTML_FILE, { pathname, botContent, headExtras: jsonLdScript(jsonLd) });
    } catch {
      serveHtml(res, HTML_FILE, { pathname });
    }
    return true;
  }

  return false;
}
