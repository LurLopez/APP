/**
 * @fileoverview Servidores de respuestas HTTP para páginas HTML estáticas, guías educativas y páginas legales.
 * @module services/seo/pageRenderer.service
 */

import config from '../../../config/index.js';
import {
  PRIVATE_PATHS,
  GUIDES,
  LEGAL_PAGES,
  readTemplate,
  readGuide,
  readLegal,
  replaceTokens,
  setMetaTag,
  escapeHtml,
  withCompliance,
} from './seoConstants.js';
import { injectCompanyMeta, applyNoIndex } from './companyMeta.service.js';

export function isPrivatePath(pathname) {
  for (const privatePath of PRIVATE_PATHS) {
    if (pathname === privatePath || pathname.startsWith(`${privatePath}/`)) return true;
  }
  return false;
}

export function serveHtml(res, fileName, { pathname = null, noIndex = false, companyMeta = null, botContent = null, headExtras = null, cacheControl = 'public, max-age=300' } = {}) {
  let html = replaceTokens(readTemplate(fileName));
  const canonicalUrl = companyMeta?.url ?? (pathname && pathname !== '/' ? `${config.siteUrl}${pathname}` : `${config.siteUrl}/`);
  html = setMetaTag(html, /<link rel="canonical" href="[\s\S]*?">/, `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`);
  html = setMetaTag(html, /<meta property="og:url" content="[\s\S]*?">/, `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`);
  const hreflangEs = `<link rel="alternate" hreflang="es" href="${escapeHtml(canonicalUrl)}">`;
  const hreflangXDefault = `<link rel="alternate" hreflang="x-default" href="${escapeHtml(canonicalUrl)}">`;
  html = html.replace(/<link rel="alternate" hreflang="es"[^>]*>/g, hreflangEs);
  html = html.replace(/<link rel="alternate" hreflang="x-default"[^>]*>/g, hreflangXDefault);
  if (!html.includes('hreflang="es"')) {
    html = html.replace(/<link rel="canonical"[^>]*>/, `$&\n  ${hreflangEs}\n  ${hreflangXDefault}`);
  } else if (!html.includes('hreflang="x-default"')) {
    const hreflangIndex = html.indexOf(hreflangEs);
    if (hreflangIndex !== -1) {
      html = html.slice(0, hreflangIndex + hreflangEs.length) + `\n  ${hreflangXDefault}` + html.slice(hreflangIndex + hreflangEs.length);
    }
  }
  if (noIndex) html = applyNoIndex(html);
  if (companyMeta) html = injectCompanyMeta(html, companyMeta);
  if (headExtras) html = html.replace('</head>', `${headExtras}\n</head>`);
  html = withCompliance(html);
  if (botContent) {
    html = html.replace(/<body([^>]*)>/, `<body$1>\n${botContent}`);
  }
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', cacheControl);
  if (noIndex) res.set('X-Robots-Tag', 'noindex, follow');
  res.send(html);
}

export function serveStandalone(res, html, { cacheControl = 'public, max-age=1800' } = {}) {
  let out = replaceTokens(html);
  if (!out.includes('hreflang="es"')) {
    const canonical = out.match(/<link rel="canonical" href="([^"]*)"/);
    if (canonical) {
      out = out.replace(/<link rel="canonical"[^>]*>/, `$&\n  <link rel="alternate" hreflang="es" href="${escapeHtml(canonical[1])}">`);
    }
  }
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', cacheControl);
  res.send(withCompliance(out));
}

export function serveGuide(res, slug) {
  const guide = GUIDES.find((entry) => entry.slug === slug);
  if (!guide) return false;
  try {
    serveStandalone(res, readGuide(`${slug}.html`));
    return true;
  } catch {
    return false;
  }
}

export function serveGuideHub(res) {
  try {
    serveStandalone(res, readGuide('hub.html'));
    return true;
  } catch {
    return false;
  }
}

export function serveLegal(res, slug) {
  const page = LEGAL_PAGES.find((entry) => entry.slug === slug);
  if (!page) return false;
  try {
    serveStandalone(res, readLegal(`${slug}.html`));
    return true;
  } catch {
    return false;
  }
}

export function serve404Page(res) {
  const html = '<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Página no encontrada | Cifra</title><meta name="robots" content="noindex, follow"><link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif}a{color:#34d399}</style></head><body><div><h1>Página no encontrada</h1><p>El contenido que buscas no existe o ya no está disponible.</p><p><a href="/">Volver al inicio</a></p></div></body></html>';
  res.status(404);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');
  res.send(html);
}
