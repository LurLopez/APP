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

export function buildCompanyDescription(profile, name) {
  const sectorPart = profile.sector && profile.sector !== '—' ? ` del sector ${profile.sector.toLowerCase()}` : '';
  const exchangePart = profile.exchange ? ` Cotiza en ${profile.exchange}.` : '';
  const filingPart = profile.lastFiling?.form ? ` Consulta sus informes ${profile.lastFiling.form} presentados ante la SEC.` : '';
  return `Perfil y análisis de ${name}${sectorPart}: resultados de sus informes 10-Q y 10-K ante la SEC, con análisis con IA de ventas, flujo de caja libre y asignación de capital.${exchangePart}${filingPart}`;
}

export async function buildCompanyMeta(ticker) {
  const cleanTicker = String(ticker ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,10}$/.test(cleanTicker)) return null;

  const cached = companyMetaCache.get(cleanTicker);
  if (cached && Date.now() - cached.at < COMPANY_META_TTL) return cached.data;

  let profile = null;
  try {
    profile = await getCompanySeoProfile(cleanTicker);
  } catch (error) {
    if (error.code !== 'COMPANY_NOT_FOUND') throw error;
    companyMetaCache.set(cleanTicker, { data: null, at: Date.now() });
    return null;
  }
  if (!profile) {
    companyMetaCache.set(cleanTicker, { data: null, at: Date.now() });
    return null;
  }

  const name = titleCaseName(profile.name);
  const url = `${config.siteUrl}/empresa/${encodeURIComponent(cleanTicker)}`;
  const meta = {
    ticker: cleanTicker,
    name,
    cik: profile.cik,
    exchange: profile.exchange ?? null,
    sector: profile.sector ?? null,
    industry: profile.industry ?? null,
    country: profile.country ?? null,
    title: `${cleanTicker} (${name}) — resultados 10-Q y 10-K | ${SITE_NAME}`,
    description: buildCompanyDescription(profile, name),
    url,
  };
  meta.jsonLd = buildCompanyJsonLd(meta, profile);

  companyMetaCache.set(cleanTicker, { data: meta, at: Date.now() });
  return meta;
}

export async function resolveCompanyMeta(pathname, searchParams) {
  let ticker = null;
  if (pathname === '/empresa' || pathname.startsWith('/empresa/')) {
    const fromPath = pathname.startsWith('/empresa/') ? decodeURIComponent(pathname.slice('/empresa/'.length)) : null;
    ticker = fromPath || searchParams.get('ticker');
  }
  if (!ticker) return null;
  return buildCompanyMeta(ticker);
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
