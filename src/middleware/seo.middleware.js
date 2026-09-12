import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import config from '../../config/index.js';
import {
  serveHtml,
  serveStandalone,
  serveGuide,
  serveGuideHub,
  serveLegal,
  serve404Page,
  getPublicReportHtml,
  getPublicReportMarkdown,
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

const TEXT_FILES = {
  '/robots.txt': { file: 'robots.txt', type: 'text/plain; charset=utf-8' },
};

const HTML_FILE = 'empresa.html';
const INDEX_FILE = 'index.html';
const REPORT_PATH = /^\/informe\/(\d{1,7})$/;

function parseUrl(req) {
  try {
    return new URL(req.originalUrl, config.siteUrl);
  } catch {
    return null;
  }
}

function sendTextFile(res, spec) {
  const raw = fs.readFileSync(path.join(PUBLIC_DIR, spec.file), 'utf8');
  res.set('Content-Type', spec.type);
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(raw.replaceAll('{{SITE_URL}}', config.siteUrl));
}

export function seoHtmlMiddleware(req, res, next) {
  const parsed = parseUrl(req);
  if (!parsed) {
    next();
    return;
  }
  const pathname = parsed.pathname.replace(/\/{2,}/g, '/');
  if (pathname.endsWith('/') && pathname !== '/') {
    res.redirect(301, pathname.slice(0, -1) + (parsed.search || ''));
    return;
  }

  if (pathname === '/index.html' || pathname === '/empresa.html') {
    const target = pathname === '/index.html' ? '/' : '/empresa';
    res.redirect(301, target + (parsed.search || ''));
    return;
  }

  if (TEXT_FILES[pathname]) {
    try {
      sendTextFile(res, TEXT_FILES[pathname]);
    } catch {
      res.status(404).send('Not found');
    }
    return;
  }

  if (pathname === '/llms.txt') {
    getLlmsTxt()
      .then((txt) => {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=1800');
        res.send(txt);
      })
      .catch(() => {
        try {
          sendTextFile(res, { file: 'llms.txt', type: 'text/plain; charset=utf-8' });
        } catch {
          res.status(404).send('Not found');
        }
      });
    return;
  }

  if (pathname === '/llms-full.txt') {
    getLlmsFullTxt()
      .then((txt) => {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=1800');
        res.send(txt);
      })
      .catch(() => {
        res.status(500).send('Error generando llms-full.txt');
      });
    return;
  }

  if (pathname === '/sitemap.xml') {
    getSitemapXml()
      .then((xml) => {
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=1800');
        res.send(xml);
      })
      .catch(() => {
        res.status(500).send('Sitemap no disponible');
      });
    return;
  }

  if (pathname === '/') {
    Promise.all([getHomeBotContent(), getHomeJsonLd()])
      .then(([botContent, jsonLd]) => serveHtml(res, INDEX_FILE, { pathname: '/', botContent, headExtras: jsonLdScript(jsonLd) }))
      .catch(() => serveHtml(res, INDEX_FILE, { pathname: '/' }));
    return;
  }

  if (pathname === '/empresa') {
    if (parsed.searchParams.has('ticker')) {
      resolveCompanyMeta(pathname, parsed.searchParams)
        .then((companyMeta) => {
          if (!companyMeta) {
            serve404Page(res);
            return;
          }
          const companyPath = `/empresa/${encodeURIComponent(companyMeta.ticker)}`;
          const queryKeys = [...parsed.searchParams.keys()];
          if (queryKeys.length === 1) {
            res.redirect(301, companyPath);
            return;
          }
          getCompanyBotContent(companyMeta)
            .then((botContent) => serveHtml(res, HTML_FILE, { pathname: companyPath, companyMeta, botContent }))
            .catch(() => serveHtml(res, HTML_FILE, { pathname: companyPath, companyMeta }));
        })
        .catch((error) => {
          if (error.code === 'EDGAR_UNAVAILABLE') {
            res.status(503).set('Retry-After', '60').send('Servicio de datos temporalmente no disponible');
            return;
          }
          serve404Page(res);
        });
      return;
    }
    Promise.all([getCompaniesBotContent(), getCompaniesJsonLd()])
      .then(([botContent, jsonLd]) => serveHtml(res, HTML_FILE, { pathname, botContent, headExtras: jsonLdScript(jsonLd) }))
      .catch(() => serveHtml(res, HTML_FILE, { pathname }));
    return;
  }

  if (pathname === '/guias') {
    if (serveGuideHub(res)) return;
    next();
    return;
  }

  if (pathname.startsWith('/guias/')) {
    if (serveGuide(res, decodeURIComponent(pathname.slice('/guias/'.length)))) return;
    serve404Page(res);
    return;
  }

  if (pathname === '/legal') {
    res.redirect(301, '/legal/aviso-legal');
    return;
  }

  if (pathname.startsWith('/legal/')) {
    if (serveLegal(res, decodeURIComponent(pathname.slice('/legal/'.length)))) return;
    serve404Page(res);
    return;
  }

  const reportMatch = pathname.match(REPORT_PATH);
  const reportMdMatch = pathname.match(/^\/informe\/(\d{1,7})\.md$/);
  if (reportMdMatch || (reportMatch && req.headers.accept?.includes('text/markdown'))) {
    const reportId = reportMdMatch ? reportMdMatch[1] : reportMatch[1];
    getPublicReportMarkdown(reportId)
      .then((md) => {
        if (md) {
          res.set('Content-Type', 'text/markdown; charset=utf-8');
          res.set('Cache-Control', 'public, max-age=1800');
          res.send(md);
        } else {
          serve404Page(res);
        }
      })
      .catch(() => serve404Page(res));
    return;
  }

  if (reportMatch) {
    getPublicReportHtml(reportMatch[1])
      .then((html) => {
        if (html) {
          serveStandalone(res, html);
        } else {
          serve404Page(res);
        }
      })
      .catch(() => serve404Page(res));
    return;
  }

  const companyMdMatch = pathname.match(/^\/empresa\/([A-Za-z0-9.-]{1,10})\.md$/);
  if (companyMdMatch || (pathname.startsWith('/empresa/') && req.headers.accept?.includes('text/markdown'))) {
    const rawTicker = companyMdMatch ? companyMdMatch[1] : decodeURIComponent(pathname.slice('/empresa/'.length));
    getCompanyMarkdown(rawTicker)
      .then((md) => {
        if (md) {
          res.set('Content-Type', 'text/markdown; charset=utf-8');
          res.set('Cache-Control', 'public, max-age=1800');
          res.send(md);
        } else {
          serve404Page(res);
        }
      })
      .catch(() => serve404Page(res));
    return;
  }

  const companyTarget = pathname.startsWith('/empresa/');
  const isPrivate = isPrivatePath(pathname);
  const isKnownPath = companyTarget || isPrivate;

  if (!isKnownPath) {
    next();
    return;
  }

  resolveCompanyMeta(pathname, parsed.searchParams)
    .then(async (companyMeta) => {
      if (companyTarget && !companyMeta) {
        serve404Page(res);
        return;
      }
      let botContent = null;
      if (companyMeta && !isPrivate) {
        try {
          botContent = await getCompanyBotContent(companyMeta);
        } catch {
          botContent = null;
        }
      }
      serveHtml(res, HTML_FILE, { pathname, noIndex: isPrivate, companyMeta, botContent });
    })
    .catch((error) => {
      if (error.code === 'EDGAR_UNAVAILABLE') {
        res.status(503).set('Retry-After', '60').send('Servicio de datos temporalmente no disponible');
        return;
      }
      if (companyTarget) {
        serve404Page(res);
        return;
      }
      serveHtml(res, HTML_FILE, { pathname, noIndex: isPrivate });
    });
}
