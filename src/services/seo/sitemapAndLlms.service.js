/**
 * @fileoverview Generadores de mapas de sitio XML (sitemap.xml) y feeds para modelos de lenguaje (llms.txt, llms-full.txt).
 * @module services/seo/sitemapAndLlms.service
 */

import fs from 'node:fs';
import path from 'node:path';
import config from '../../../config/index.js';
import { query } from '../../../db/pool.js';
import {
  PUBLIC_DIR,
  GUIDES_DIR,
  LEGAL_DIR,
  GUIDES,
  LEGAL_PAGES,
  BENCHMARK_CONSUMER_DEFENSIVE,
  sitemapCache,
  SITEMAP_TTL,
  readGuide,
  escapeXml,
} from './seoConstants.js';
import { getFeaturedCompanies } from './featuredCompanies.service.js';
import { buildReportSlug, loadPublicReportsForSitemap } from './reportSeo.service.js';

let llmsFullCache = { text: null, at: 0 };
const LLMS_FULL_TTL = 30 * 60 * 1000;

export function getGuideLastmod(slug) {
  try {
    const stats = fs.statSync(path.join(GUIDES_DIR, `${slug}.html`));
    return stats.mtime.toISOString();
  } catch {
    return null;
  }
}

export function getLegalLastmod(slug) {
  try {
    const stats = fs.statSync(path.join(LEGAL_DIR, `${slug}.html`));
    return stats.mtime.toISOString();
  } catch {
    return null;
  }
}

export async function getLlmsTxt() {
  const raw = fs.readFileSync(path.join(PUBLIC_DIR, 'llms.txt'), 'utf8');
  const base = raw.replaceAll('{{SITE_URL}}', config.siteUrl);
  let companies = [];
  try {
    companies = await getFeaturedCompanies(null);
  } catch {
    companies = [];
  }
  if (!companies.length) return base;
  const lines = [
    '',
    '## Directorio de empresas (fichas HTML y Markdown)',
    '',
    ...companies.map(
      (company) => `- [${company.name ?? company.ticker} (${company.ticker})](${config.siteUrl}/empresa/${encodeURIComponent(company.ticker)}) — [Markdown](${config.siteUrl}/empresa/${encodeURIComponent(company.ticker)}.md)`,
    ),
    '',
  ];
  return `${base}\n${lines.join('\n')}`;
}

export async function getLlmsFullTxt() {
  if (llmsFullCache.text && Date.now() - llmsFullCache.at < LLMS_FULL_TTL) {
    return llmsFullCache.text;
  }
  const baseLlms = await getLlmsTxt();
  const site = config.siteUrl;

  const lines = [baseLlms, '', '---', '', '# Documentación Completa y Guías Integradas de Cifra', ''];
  lines.push('## Metodología de Análisis Financiero de Cifra');
  lines.push('');
  lines.push('Cifra estructura el análisis de cualquier informe 10-Q o 10-K en dos horizontes temporales y tres pilares fundamentales:');
  lines.push('1. **Ventas y Márgenes:** evolución interanual de ingresos netos, beneficio bruto, beneficio operativo y beneficio neto, con cálculo de variación porcentual y análisis de drivers (volumen vs precio).');
  lines.push('2. **Flujo de Caja Libre (FCF):** reconciliación desde el flujo de caja operativo restando los gastos de capital (CAPEX). Desglose entre FCF normal y FCF ajustado eliminando partidas no recurrentes.');
  lines.push('3. **Asignación de Capital:** auditoría exhaustiva del destino del dinero generado: dividendos pagados, recompra de acciones propias (número de títulos e impacto en BPA), endeudamiento neto y operaciones corporativas (M&A).');
  lines.push('4. **Integración de Presentaciones 8-K:** complementa el 10-Q/10-K con las presentaciones a inversores del Formulario 8-K para extraer el guidance oficial del equipo gestor.');
  lines.push('');

  lines.push('## Guías Educativas (Texto Íntegro)');
  lines.push('');

  for (const guide of GUIDES) {
    lines.push(`### Guía: ${guide.title}`);
    lines.push(`URL: ${site}/guias/${guide.slug}`);
    lines.push(`Descripción: ${guide.description}`);
    lines.push('');
    try {
      const rawHtml = readGuide(`${guide.slug}.html`);
      const bodyMatch = rawHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
      if (bodyMatch) {
        const cleanText = bodyMatch[1]
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n#### $1\n')
          .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n##### $1\n')
          .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n###### $1\n')
          .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
          .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        lines.push(cleanText);
      }
    } catch {
      lines.push(guide.description);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## Directorio Completo de Empresas Cubiertas (Consumo Defensivo)');
  lines.push('');
  const allCompanies = await getFeaturedCompanies(null);
  for (const comp of allCompanies) {
    lines.push(`- **${comp.name ?? comp.ticker} (${comp.ticker})**: Ficha web [${site}/empresa/${encodeURIComponent(comp.ticker)}](${site}/empresa/${encodeURIComponent(comp.ticker)}) | Versión Markdown [${site}/empresa/${encodeURIComponent(comp.ticker)}.md](${site}/empresa/${encodeURIComponent(comp.ticker)}.md)`);
  }
  lines.push('');

  const fullText = lines.join('\n');
  llmsFullCache = { text: fullText, at: Date.now() };
  return fullText;
}

export async function getSitemapXml() {
  if (sitemapCache.xml && Date.now() - sitemapCache.at < SITEMAP_TTL) {
    return sitemapCache.xml;
  }

  const rows = await query(`
    SELECT ticker, MAX(lastmod) AS lastmod
    FROM (
       SELECT ticker, created_at AS lastmod
       FROM analyses
       WHERE is_public = true AND status = 'done' AND ticker IS NOT NULL
      UNION ALL
      SELECT ticker, created_at AS lastmod
      FROM analyses
      WHERE ticker IS NOT NULL
      UNION ALL
      SELECT ticker, COALESCE(created_at, filed_at::timestamptz, now()) AS lastmod
      FROM filings
    ) t
     WHERE ticker ~ '^[A-Za-z0-9.-]{1,10}$'
     GROUP BY ticker
     ORDER BY lastmod DESC
  `);

  const publicReports = await loadPublicReportsForSitemap();
  const dbTickersMap = new Map();
  for (const row of rows.rows) {
    const t = String(row.ticker ?? '').toUpperCase();
    if (t) dbTickersMap.set(t, row.lastmod ? new Date(row.lastmod).toISOString() : null);
  }

  let newestGuideLastmod = null;
  for (const guide of GUIDES) {
    const lm = getGuideLastmod(guide.slug);
    if (lm && (!newestGuideLastmod || lm > newestGuideLastmod)) {
      newestGuideLastmod = lm;
    }
  }

  const nowIso = new Date().toISOString();
  const urls = [
    { loc: `${config.siteUrl}/`, priority: '1.0', changefreq: 'daily', lastmod: nowIso },
    { loc: `${config.siteUrl}/empresa`, priority: '0.8', changefreq: 'weekly', lastmod: nowIso },
    { loc: `${config.siteUrl}/guias`, priority: '0.8', changefreq: 'weekly', lastmod: newestGuideLastmod || nowIso },
  ];

  for (const guide of GUIDES) {
    urls.push({
      loc: `${config.siteUrl}/guias/${guide.slug}`,
      priority: '0.7',
      changefreq: 'monthly',
      lastmod: getGuideLastmod(guide.slug) || nowIso,
    });
  }

  for (const page of LEGAL_PAGES) {
    urls.push({
      loc: `${config.siteUrl}/legal/${page.slug}`,
      priority: '0.3',
      changefreq: 'yearly',
      lastmod: getLegalLastmod(page.slug) || nowIso,
    });
  }

  const seen = new Set();
  for (const [ticker, lastmod] of dbTickersMap.entries()) {
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    urls.push({
      loc: `${config.siteUrl}/empresa/${encodeURIComponent(ticker)}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: lastmod || nowIso,
    });
  }

  for (const comp of BENCHMARK_CONSUMER_DEFENSIVE) {
    const ticker = comp.ticker.toUpperCase();
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    urls.push({
      loc: `${config.siteUrl}/empresa/${encodeURIComponent(ticker)}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: nowIso,
    });
  }

  const seenReportSlugs = new Set();
  for (const report of publicReports) {
    const ticker = String(report.ticker ?? report.report?.ticker ?? '').toUpperCase();
    if (!ticker) continue;
    const slug = buildReportSlug(report);
    const key = `${ticker}/${slug}`;
    if (seenReportSlugs.has(key)) continue;
    seenReportSlugs.add(key);

    urls.push({
      loc: `${config.siteUrl}/informe/${encodeURIComponent(ticker)}/${slug}`,
      priority: '0.7',
      changefreq: 'monthly',
      lastmod: report.created_at ? new Date(report.created_at).toISOString() : null,
    });
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls.map((url) => [
      '  <url>',
      `    <loc>${escapeXml(url.loc)}</loc>`,
      url.lastmod ? `    <lastmod>${url.lastmod}</lastmod>` : null,
      `    <changefreq>${url.changefreq}</changefreq>`,
      `    <priority>${url.priority}</priority>`,
      `    <xhtml:link rel="alternate" hreflang="es" href="${escapeXml(url.loc)}" />`,
      '  </url>',
    ].filter(Boolean).join('\n')),
    '</urlset>',
    '',
  ].join('\n');

  sitemapCache.xml = xml;
  sitemapCache.at = Date.now();
  return xml;
}
