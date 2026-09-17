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
  getHomeFaqJsonLd,
  getCompaniesJsonLd,
  getGuidesJsonLd,
  getLlmsTxt,
  getLlmsFullTxt,
  jsonLdScript,
} from '../services/seo.service.js';
import { getGuidesSeoContent, getGuidesSeoMeta } from '../services/seo/guidesSeo.service.js';
import { getPageMeta } from '../services/seo/pageMeta.service.js';

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
  const isEn = pathname === '/en' || pathname.startsWith('/en/');
  const cleanPathname = isEn ? (pathname.replace(/^\/en/, '') || '/') : pathname;
  const lang = isEn ? 'en' : 'es';
  const prefix = isEn ? '/en' : '';
  let decodedPathname = cleanPathname;
  if (cleanPathname.includes('%')) {
    try {
      decodedPathname = decodeURIComponent(cleanPathname);
    } catch {
      decodedPathname = cleanPathname;
    }
  }

  if (cleanPathname === '/guias') {
    const meta = getGuidesSeoMeta(lang);
    serveHtml(res, HTML_FILE, {
      pathname,
      lang,
      noIndex: false,
      title: meta.title,
      description: meta.description,
      botContent: getGuidesSeoContent(lang),
      headExtras: jsonLdScript(getGuidesJsonLd(lang)),
    });
    return true;
  }
  if (decodedPathname === '/guías') {
    res.redirect(301, `${prefix}/guias`);
    return true;
  }
  if (decodedPathname.startsWith('/guías/')) {
    res.redirect(301, `${prefix}/guias/${decodedPathname.slice('/guías/'.length)}`);
    return true;
  }
  if (cleanPathname.startsWith('/guias/')) {
    const slug = decodeURIComponent(cleanPathname.slice('/guias/'.length));
    if (serveGuide(res, slug, { lang })) return true;
    serve404Page(res, { lang });
    return true;
  }
  if (cleanPathname === '/legal') {
    res.redirect(301, `${prefix}/legal/aviso-legal`);
    return true;
  }
  if (cleanPathname.startsWith('/legal/')) {
    const slug = decodeURIComponent(cleanPathname.slice('/legal/'.length));
    if (serveLegal(res, slug, { lang })) return true;
    serve404Page(res, { lang });
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
  const isEn = pathname === '/en' || pathname.startsWith('/en/');
  const cleanPathname = isEn ? (pathname.replace(/^\/en/, '') || '/') : pathname;
  const lang = isEn ? 'en' : 'es';
  const prefix = isEn ? '/en' : '';

  const reportIdMatch = cleanPathname.match(REPORT_ID_PATH);
  const reportIdMdMatch = cleanPathname.match(REPORT_ID_MD_PATH);
  const reportSlugMatch = cleanPathname.match(REPORT_SLUG_PATH);
  const reportSlugMdMatch = cleanPathname.match(REPORT_SLUG_MD_PATH);

  if (reportIdMdMatch || (reportIdMatch && req.headers.accept?.includes('text/markdown'))) {
    const reportId = reportIdMdMatch ? reportIdMdMatch[1] : reportIdMatch[1];
    const info = await getReportSlugById(reportId).catch(() => null);
    if (info) res.redirect(301, `${prefix}/informe/${encodeURIComponent(info.ticker)}/${info.slug}.md`);
    else serve404Page(res, { lang });
    return true;
  }

  if (reportIdMatch) {
    const info = await getReportSlugById(reportIdMatch[1]).catch(() => null);
    if (info) res.redirect(301, `${prefix}/informe/${encodeURIComponent(info.ticker)}/${info.slug}`);
    else serve404Page(res, { lang });
    return true;
  }

  if (reportSlugMdMatch || (reportSlugMatch && req.headers.accept?.includes('text/markdown'))) {
    const rawTicker = reportSlugMdMatch ? reportSlugMdMatch[1] : reportSlugMatch[1];
    const rawSlug = reportSlugMdMatch ? reportSlugMdMatch[2] : reportSlugMatch[2];
    const resObj = await getPublicReportMarkdownBySlug(rawTicker, rawSlug).catch(() => null);
    if (resObj) {
      if (resObj.canonicalSlug && resObj.canonicalSlug !== rawSlug.toUpperCase()) {
        const mdPrefix = resObj.language === 'en' ? '/en' : '';
        res.redirect(301, `${mdPrefix}/informe/${encodeURIComponent(resObj.ticker)}/${resObj.canonicalSlug}.md`);
        return true;
      }
      res.set('Content-Type', 'text/markdown; charset=utf-8').set('Cache-Control', 'public, max-age=1800').send(resObj.markdown);
    } else {
      serve404Page(res, { lang });
    }
    return true;
  }

  if (reportSlugMatch) {
    const rawTicker = reportSlugMatch[1];
    const rawSlug = reportSlugMatch[2];
    const resObj = await getPublicReportHtmlBySlug(rawTicker, rawSlug, lang).catch(() => null);
    if (resObj) {
      if (resObj.canonicalSlug && resObj.canonicalSlug !== rawSlug.toUpperCase()) {
        const htmlPrefix = resObj.language === 'en' ? '/en' : '';
        res.redirect(301, `${htmlPrefix}/informe/${encodeURIComponent(resObj.ticker)}/${resObj.canonicalSlug}`);
        return true;
      }
      const contentLang = resObj.language === 'en' ? 'en' : 'es';
      serveStandalone(res, resObj.html, {
        lang,
        pathname,
        contentLang,
        hreflangLangs: [contentLang],
        xDefaultContent: true,
      });
    } else {
      serve404Page(res, { lang });
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
  const isEn = pathname === '/en' || pathname.startsWith('/en/');
  const cleanPathname = isEn ? (pathname.replace(/^\/en/, '') || '/') : pathname;
  const lang = isEn ? 'en' : 'es';

  const companyMdMatch = cleanPathname.match(/^\/empresa\/([A-Za-z0-9.-]{1,10})\.md$/);
  if (companyMdMatch || (cleanPathname.startsWith('/empresa/') && req.headers.accept?.includes('text/markdown'))) {
    const rawTicker = companyMdMatch ? companyMdMatch[1] : decodeURIComponent(cleanPathname.slice('/empresa/'.length));
    const md = await getCompanyMarkdown(rawTicker, lang).catch(() => null);
    if (md) res.set('Content-Type', 'text/markdown; charset=utf-8').set('Cache-Control', 'public, max-age=1800').send(md);
    else serve404Page(res, { lang });
    return true;
  }

  const companyTarget = cleanPathname.startsWith('/empresa/');
  const isPrivate = isPrivatePath(cleanPathname);
  if (!companyTarget && !isPrivate) {
    next();
    return true;
  }

  try {
    const companyMeta = await resolveCompanyMeta(cleanPathname, parsed.searchParams, lang);
    if (companyTarget && !companyMeta) {
      serve404Page(res, { lang });
      return true;
    }
    let botContent = null;
    if (companyMeta && !isPrivate) {
      botContent = await getCompanyBotContent(companyMeta, lang).catch(() => null);
    }
    serveHtml(res, HTML_FILE, { pathname, noIndex: isPrivate, companyMeta, botContent, lang });
    return true;
  } catch (error) {
    if (error.code === 'EDGAR_UNAVAILABLE') {
      res.status(503).set('Retry-After', '60').send(lang === 'en' ? 'Data service temporarily unavailable' : 'Servicio de datos temporalmente no disponible');
      return true;
    }
    if (companyTarget) {
      serve404Page(res, { lang });
      return true;
    }
    serveHtml(res, HTML_FILE, { pathname, noIndex: isPrivate, lang });
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
  const isEn = pathname === '/en' || pathname.startsWith('/en/');
  const cleanPathname = isEn ? (pathname.replace(/^\/en/, '') || '/') : pathname;
  const lang = isEn ? 'en' : 'es';

  if (cleanPathname === '/') {
    const meta = getPageMeta('home', lang);
    const faqJsonLd = jsonLdScript(getHomeFaqJsonLd(lang));
    try {
      const [botContent, homeJsonLd] = await Promise.all([getHomeBotContent(lang), getHomeJsonLd(lang)]);
      serveHtml(res, INDEX_FILE, { pathname, lang, botContent, headExtras: `${jsonLdScript(homeJsonLd)}\n${faqJsonLd}`, title: meta.title, description: meta.description });
    } catch {
      serveHtml(res, INDEX_FILE, { pathname, lang, headExtras: faqJsonLd, title: meta.title, description: meta.description });
    }
    return true;
  }

  if (cleanPathname === '/empresa' && !parsed.searchParams.has('ticker')) {
    const meta = getPageMeta('companies', lang);
    try {
      const [botContent, jsonLd] = await Promise.all([getCompaniesBotContent(lang), getCompaniesJsonLd(lang)]);
      serveHtml(res, HTML_FILE, { pathname, lang, botContent, headExtras: jsonLdScript(jsonLd), title: meta.title, description: meta.description });
    } catch {
      serveHtml(res, HTML_FILE, { pathname, lang, title: meta.title, description: meta.description });
    }
    return true;
  }

  return false;
}
