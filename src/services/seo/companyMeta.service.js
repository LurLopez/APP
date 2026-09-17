/**
 * @fileoverview Extracción, caché y resolución de metadatos SEO para páginas de empresa.
 * @module services/seo/companyMeta.service
 */

import config from '../../../config/index.js';
import { getCompanySeoProfile } from '../edgar.service.js';
import {
  SITE_NAME,
  companyMetaCache,
  COMPANY_META_TTL,
  titleCaseName,
  escapeHtml,
  setMetaTag,
} from './seoConstants.js';
import { buildCompanyJsonLd } from './jsonLd.service.js';

export function buildCompanyDescription(profile, name, lang = 'es') {
  const isEn = lang === 'en';
  let sector = profile.sector && profile.sector !== '—' ? profile.sector.toLowerCase() : null;
  if (isEn && sector) {
    if (sector.includes('consumo defensivo')) sector = 'consumer defensive';
    else if (sector.includes('alimentación')) sector = 'food and beverage';
    else if (sector.includes('tabaco')) sector = 'tobacco';
    else if (sector.includes('química') || sector.includes('farmacéutica')) sector = 'chemicals and pharmaceuticals';
  }
  const sectorPart = sector
    ? (isEn ? ` in the ${sector} sector` : ` del sector ${sector}`)
    : '';
  const exchangePart = profile.exchange
    ? (isEn ? ` Listed on ${profile.exchange}.` : ` Cotiza en ${profile.exchange}.`)
    : '';
  const filingPart = profile.lastFiling?.form
    ? (isEn ? ` View its ${profile.lastFiling.form} filings submitted to the SEC.` : ` Consulta sus informes ${profile.lastFiling.form} presentados ante la SEC.`)
    : '';
  return isEn
    ? `Profile and analysis of ${name}${sectorPart}: results from its 10-Q and 10-K SEC filings, featuring AI analysis of sales, free cash flow, and capital allocation.${exchangePart}${filingPart}`
    : `Perfil y análisis de ${name}${sectorPart}: resultados de sus informes 10-Q y 10-K ante la SEC, con análisis con IA de ventas, flujo de caja libre y asignación de capital.${exchangePart}${filingPart}`;
}

export async function buildCompanyMeta(ticker, lang = 'es') {
  const cleanTicker = String(ticker ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,10}$/.test(cleanTicker)) return null;

  const isEn = lang === 'en';
  const cacheKey = `${cleanTicker}_${isEn ? 'en' : 'es'}`;
  const cached = companyMetaCache.get(cacheKey);
  if (cached && Date.now() - cached.at < COMPANY_META_TTL) return cached.data;

  let profile = null;
  try {
    profile = await getCompanySeoProfile(cleanTicker);
  } catch (error) {
    if (error.code !== 'COMPANY_NOT_FOUND') throw error;
    companyMetaCache.set(cacheKey, { data: null, at: Date.now() });
    return null;
  }
  if (!profile) {
    companyMetaCache.set(cacheKey, { data: null, at: Date.now() });
    return null;
  }

  const name = titleCaseName(profile.name);
  const url = isEn
    ? `${config.siteUrl}/en/empresa/${encodeURIComponent(cleanTicker)}`
    : `${config.siteUrl}/empresa/${encodeURIComponent(cleanTicker)}`;
  const title = isEn
    ? `${cleanTicker} (${name}) — 10-Q and 10-K results | ${SITE_NAME}`
    : `${cleanTicker} (${name}) — resultados 10-Q y 10-K | ${SITE_NAME}`;
  const meta = {
    ticker: cleanTicker,
    name,
    lang: isEn ? 'en' : 'es',
    cik: profile.cik,
    exchange: profile.exchange ?? null,
    sector: profile.sector ?? null,
    industry: profile.industry ?? null,
    country: profile.country ?? null,
    title,
    description: buildCompanyDescription(profile, name, isEn ? 'en' : 'es'),
    url,
  };
  meta.jsonLd = buildCompanyJsonLd(meta, profile, isEn ? 'en' : 'es');

  companyMetaCache.set(cacheKey, { data: meta, at: Date.now() });
  return meta;
}

export async function resolveCompanyMeta(pathname, searchParams, lang = null) {
  let ticker = null;
  const isEn = lang === 'en' || pathname === '/en' || pathname.startsWith('/en/');
  const cleanPath = isEn ? (pathname === '/en' ? '/' : pathname.replace(/^\/en/, '')) : pathname;
  if (cleanPath === '/empresa' || cleanPath.startsWith('/empresa/')) {
    const fromPath = cleanPath.startsWith('/empresa/') ? decodeURIComponent(cleanPath.slice('/empresa/'.length)) : null;
    ticker = fromPath || searchParams?.get('ticker');
  }
  if (!ticker) return null;
  return buildCompanyMeta(ticker, isEn ? 'en' : 'es');
}

export function injectCompanyMeta(html, meta) {
  let out = html;
  out = setMetaTag(out, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);
  out = setMetaTag(out, /<meta name="description" content="[\s\S]*?">/, `<meta name="description" content="${escapeHtml(meta.description)}">`);
  out = setMetaTag(out, /<link rel="canonical" href="[\s\S]*?">/, `<link rel="canonical" href="${escapeHtml(meta.url)}">`);
  out = setMetaTag(out, /<meta property="og:title" content="[\s\S]*?">/, `<meta property="og:title" content="${escapeHtml(meta.title)}">`);
  out = setMetaTag(out, /<meta property="og:description" content="[\s\S]*?">/, `<meta property="og:description" content="${escapeHtml(meta.description)}">`);
  out = setMetaTag(out, /<meta property="og:url" content="[\s\S]*?">/, `<meta property="og:url" content="${escapeHtml(meta.url)}">`);
  out = setMetaTag(out, /<meta name="twitter:title" content="[\s\S]*?">/, `<meta name="twitter:title" content="${escapeHtml(meta.title)}">`);
  out = setMetaTag(out, /<meta name="twitter:description" content="[\s\S]*?">/, `<meta name="twitter:description" content="${escapeHtml(meta.description)}">`);

  const jsonLdScripts = `<script type="application/ld+json">\n${JSON.stringify(meta.jsonLd, null, 2)}\n</script>`;
  if (/<script type="application\/ld\+json">[\s\S]*?<\/script>/.test(out)) {
    out = out.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, jsonLdScripts);
  } else {
    out = out.replace('</head>', `${jsonLdScripts}\n</head>`);
  }
  return out;
}

export function applyNoIndex(html) {
  let out = setMetaTag(
    html,
    /<meta name="robots" content="[\s\S]*?">/,
    '<meta name="robots" content="noindex, follow, max-image-preview:large">',
  );
  if (!out.includes('"noindex')) {
    out = out.replace('</head>', '<meta name="robots" content="noindex, follow">\n</head>');
  }
  return out;
}
