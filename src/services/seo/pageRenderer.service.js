/**
 * @fileoverview Servidores de respuestas HTTP para páginas HTML estáticas, guías educativas y páginas legales.
 * @module services/seo/pageRenderer.service
 */

import config from '../../../config/index.js';
import {
  SITE_NAME,
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

export function serveHtml(res, fileName, { pathname = null, noIndex = false, companyMeta = null, botContent = null, headExtras = null, cacheControl = 'public, max-age=300', lang = 'es' } = {}) {
  const isEn = (lang === 'en') || pathname === '/en' || pathname?.startsWith('/en/');
  let html = replaceTokens(readTemplate(fileName, isEn ? 'en' : 'es'));

  let esPath = '/';
  let enPath = '/en';
  if (companyMeta) {
    esPath = `/empresa/${encodeURIComponent(companyMeta.ticker)}`;
    enPath = `/en/empresa/${encodeURIComponent(companyMeta.ticker)}`;
  } else if (pathname && pathname !== '/') {
    const raw = pathname.replace(/^\/en(?:\/|$)/, '/');
    esPath = raw === '' ? '/' : raw;
    enPath = raw === '/' ? '/en' : `/en${raw}`;
  }

  const canonicalUrl = isEn ? `${config.siteUrl}${enPath}` : `${config.siteUrl}${esPath}`;
  const esUrl = `${config.siteUrl}${esPath}`;
  const enUrl = `${config.siteUrl}${enPath}`;
  const xDefaultUrl = esUrl;

  if (isEn) {
    html = html.replace('<html lang="es">', '<html lang="en">');
  }

  html = setMetaTag(html, /<link rel="canonical" href="[\s\S]*?">/, `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`);
  html = setMetaTag(html, /<meta property="og:url" content="[\s\S]*?">/, `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`);
  html = setMetaTag(html, /<meta property="og:locale" content="[\s\S]*?">/, `<meta property="og:locale" content="${isEn ? 'en_US' : 'es_ES'}">`);

  const hreflangEs = `<link rel="alternate" hreflang="es" href="${escapeHtml(esUrl)}">`;
  const hreflangEn = `<link rel="alternate" hreflang="en" href="${escapeHtml(enUrl)}">`;
  const hreflangXDefault = `<link rel="alternate" hreflang="x-default" href="${escapeHtml(xDefaultUrl)}">`;
  const ogLocaleAlt = `<meta property="og:locale:alternate" content="${isEn ? 'es_ES' : 'en_US'}">`;

  html = html.replace(/<link rel="alternate" hreflang="es"[^>]*>/g, hreflangEs);
  html = html.replace(/<link rel="alternate" hreflang="en"[^>]*>/g, hreflangEn);
  html = html.replace(/<link rel="alternate" hreflang="x-default"[^>]*>/g, hreflangXDefault);

  if (!html.includes('hreflang="es"')) {
    html = html.replace(/<link rel="canonical"[^>]*>/, `$&\n  ${hreflangEs}\n  ${hreflangEn}\n  ${hreflangXDefault}`);
  } else if (!html.includes('hreflang="en"')) {
    html = html.replace(hreflangEs, `${hreflangEs}\n  ${hreflangEn}`);
  }

  if (!html.includes('og:locale:alternate')) {
    html = html.replace(/<meta property="og:locale"[^>]*>/, `$&\n  ${ogLocaleAlt}`);
  }

  if (isEn && !html.includes('__CIFRA_LANGUAGE__')) {
    const langScript = '<script>window.__CIFRA_LANGUAGE__ = "en";</script>';
    html = html.replace('</head>', `  ${langScript}\n</head>`);
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

export function serveStandalone(res, html, { cacheControl = 'public, max-age=1800', lang = 'es', pathname = null, isLegal = false, slug = null, title = null, description = null } = {}) {
  let out = replaceTokens(html);
  const isEn = (lang === 'en') || pathname === '/en' || pathname?.startsWith('/en/');

  let esPath = '/';
  let enPath = '/en';
  if (pathname && pathname !== '/') {
    const raw = pathname.replace(/^\/en(?:\/|$)/, '/');
    esPath = raw === '' ? '/' : raw;
    enPath = raw === '/' ? '/en' : `/en${raw}`;
  } else {
    const canonicalMatch = out.match(/<link rel="canonical" href="([^"]*)"/);
    if (canonicalMatch) {
      try {
        const u = new URL(canonicalMatch[1]);
        const raw = u.pathname.replace(/^\/en(?:\/|$)/, '/');
        esPath = raw === '' ? '/' : raw;
        enPath = raw === '/' ? '/en' : `/en${raw}`;
      } catch {
        // Ignorar
      }
    }
  }

  const canonicalUrl = isEn ? `${config.siteUrl}${enPath}` : `${config.siteUrl}${esPath}`;
  const esUrl = `${config.siteUrl}${esPath}`;
  const enUrl = `${config.siteUrl}${enPath}`;
  const xDefaultUrl = esUrl;

  if (isEn) {
    out = out.replace('<html lang="es">', '<html lang="en">');
  }

  if (title) {
    const fullTitle = `${title} | ${SITE_NAME}`;
    out = setMetaTag(out, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(fullTitle)}</title>`);
    out = setMetaTag(out, /<meta property="og:title" content="[\s\S]*?">/, `<meta property="og:title" content="${escapeHtml(fullTitle)}">`);
    out = setMetaTag(out, /<meta name="twitter:title" content="[\s\S]*?">/, `<meta name="twitter:title" content="${escapeHtml(fullTitle)}">`);
  }
  if (description) {
    out = setMetaTag(out, /<meta name="description" content="[\s\S]*?">/, `<meta name="description" content="${escapeHtml(description)}">`);
    out = setMetaTag(out, /<meta property="og:description" content="[\s\S]*?">/, `<meta property="og:description" content="${escapeHtml(description)}">`);
    out = setMetaTag(out, /<meta name="twitter:description" content="[\s\S]*?">/, `<meta name="twitter:description" content="${escapeHtml(description)}">`);
  }

  out = setMetaTag(out, /<link rel="canonical" href="[\s\S]*?">/, `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`);
  out = setMetaTag(out, /<meta property="og:url" content="[\s\S]*?">/, `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`);
  out = setMetaTag(out, /<meta property="og:locale" content="[\s\S]*?">/, `<meta property="og:locale" content="${isEn ? 'en_US' : 'es_ES'}">`);

  const hreflangEs = `<link rel="alternate" hreflang="es" href="${escapeHtml(esUrl)}">`;
  const hreflangEn = `<link rel="alternate" hreflang="en" href="${escapeHtml(enUrl)}">`;
  const hreflangXDefault = `<link rel="alternate" hreflang="x-default" href="${escapeHtml(xDefaultUrl)}">`;

  out = out.replace(/<link rel="alternate" hreflang="es"[^>]*>/g, hreflangEs);
  out = out.replace(/<link rel="alternate" hreflang="en"[^>]*>/g, hreflangEn);
  out = out.replace(/<link rel="alternate" hreflang="x-default"[^>]*>/g, hreflangXDefault);

  if (!out.includes('hreflang="es"')) {
    out = out.replace(/<link rel="canonical"[^>]*>/, `$&\n  ${hreflangEs}\n  ${hreflangEn}\n  ${hreflangXDefault}`);
  } else if (!out.includes('hreflang="en"')) {
    out = out.replace(hreflangEs, `${hreflangEs}\n  ${hreflangEn}`);
  }

  if (isEn && isLegal && slug) {
    const notice = [
      '<div class="legal-notice-convenience" style="background:#1e293b;border-left:4px solid #38bdf8;padding:12px 16px;margin:16px 0 24px;border-radius:6px;font-size:0.9rem;color:#cbd5e1;line-height:1.5;">',
      '  <strong>Note:</strong> This English translation is provided for informational and convenience purposes only. The legally binding version is the original in Spanish (<a href="/legal/' + escapeHtml(slug) + '" style="color:#34d399;text-decoration:underline;">Spanish version</a>). In case of any discrepancy or conflict, the Spanish version shall prevail.',
      '</div>',
    ].join('\n');
    out = out.replace(/<main([^>]*)>/, `<main$1>\n${notice}`);
  }

  if (!out.includes('js/shared/i18n.js')) {
    const i18nScript = '<script src="/js/shared/i18n.js?v=2"></script>';
    out = out.includes('</body>')
      ? out.replace('</body>', `  ${i18nScript}\n</body>`)
      : `${out}\n${i18nScript}\n`;
  }

  if (isEn && !out.includes('__CIFRA_LANGUAGE__')) {
    const langScript = '<script>window.__CIFRA_LANGUAGE__ = "en";</script>';
    out = out.replace('</head>', `  ${langScript}\n</head>`);
  }

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', cacheControl);
  res.send(withCompliance(out));
}

export function serveGuide(res, slug, { lang = 'es' } = {}) {
  const guide = GUIDES.find((entry) => entry.slug === slug);
  if (!guide) return false;
  try {
    const isEn = lang === 'en';
    const pathname = isEn ? `/en/guias/${slug}` : `/guias/${slug}`;
    const title = isEn && guide.titleEn ? guide.titleEn : guide.title;
    const description = isEn && guide.descriptionEn ? guide.descriptionEn : guide.description;
    serveStandalone(res, readGuide(`${slug}.html`), { lang, pathname, title, description, slug });
    return true;
  } catch {
    return false;
  }
}

export function serveGuideHub(res, { lang = 'es' } = {}) {
  try {
    const isEn = lang === 'en';
    const pathname = isEn ? '/en/guias' : '/guias';
    const title = isEn ? 'Financial Guides & SEC Filings (10-Q, 10-K)' : 'Guías Financieras y Filings SEC (10-Q, 10-K)';
    const description = isEn
      ? 'Practical guides to analyzing Form 10-Q and 10-K SEC filings: sales, operating margins, free cash flow and capital allocation.'
      : 'Guías prácticas para analizar informes 10-Q y 10-K de la SEC: ventas, margen operativo, flujo de caja libre y asignación de capital.';
    serveStandalone(res, readGuide('hub.html'), { lang, pathname, title, description });
    return true;
  } catch {
    return false;
  }
}

export function serveLegal(res, slug, { lang = 'es' } = {}) {
  const page = LEGAL_PAGES.find((entry) => entry.slug === slug);
  if (!page) return false;
  try {
    const isEn = lang === 'en';
    const pathname = isEn ? `/en/legal/${slug}` : `/legal/${slug}`;
    const title = isEn && page.titleEn ? page.titleEn : page.title;
    const description = isEn && page.descriptionEn ? page.descriptionEn : page.description;
    serveStandalone(res, readLegal(`${slug}.html`), { lang, pathname, isLegal: true, slug, title, description });
    return true;
  } catch {
    return false;
  }
}

export function serve404Page(res, { lang = 'es' } = {}) {
  const isEn = lang === 'en';
  const title = isEn ? 'Page not found | Cifra' : 'Página no encontrada | Cifra';
  const h1 = isEn ? 'Page not found' : 'Página no encontrada';
  const desc = isEn
    ? 'The content you are looking for does not exist or is no longer available.'
    : 'El contenido que buscas no existe o ya no está disponible.';
  const homeText = isEn ? 'Return to home' : 'Volver al inicio';
  const homeHref = isEn ? '/en' : '/';
  const html = `<!doctype html><html lang="${isEn ? 'en' : 'es'}"><head><meta charset="UTF-8"><title>${title}</title><meta name="robots" content="noindex, follow"><link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif}a{color:#34d399}</style></head><body><div><h1>${h1}</h1><p>${desc}</p><p><a href="${homeHref}">${homeText}</a></p></div></body></html>`;
  res.status(404);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');
  res.send(html);
}
