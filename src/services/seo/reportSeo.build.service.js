/**
 * @fileoverview Módulo extraído de reportSeo.service.js.
 */

import config from '../../../config/index.js';
import { query } from '../../../db/pool.js';
import { resolveAnalysisVersion, isAnalysisOutdated } from '../../agents/sectorAgent.js';
import { SITE_NAME, reportCache, REPORT_TTL, titleCaseName, escapeHtml, safeHttpUrl, readTemplate, replaceTokens, setMetaTag } from './seoConstants.js';
import { buildReportJsonLd, safeJsonForScript } from './jsonLd.service.js';
import { renderReportSsrHtml } from './reportSsrHtml.js';

export function buildReportSlug(row) {
  const report = row?.report ?? {};
  const title = String(report.periodTitle || row?.period_title || row?.periodTitle || '');
  const formType = String(report.formType || row?.form_type || row?.formType || '');
  const isAnnual = report.isAnnual === true || formType === '10-K' || /annual|full year|10-?k/i.test(title);

  let year = report.fiscalYear || row?.fiscal_year || row?.fiscalYear;
  if (!year) {
    const yearMatch = title.match(/\b(20\d\d)\b/);
    if (yearMatch) year = yearMatch[1];
  }
  if (!year && (row?.period_end || row?.periodEnd)) year = new Date(row.period_end || row.periodEnd).getUTCFullYear();
  if (!year && (row?.created_at || row?.createdAt)) year = new Date(row.created_at || row.createdAt).getUTCFullYear();
  if (!year) year = new Date().getUTCFullYear();

  if (isAnnual) return `${year}-10K`;

  let quarter = report.fiscalQuarter || row?.fiscal_quarter || row?.fiscalQuarter;
  if (!quarter) {
    const qMatch = title.match(/Q([1-4])/i);
    if (qMatch) quarter = qMatch[1];
  }
  if (!quarter && (row?.period_end || row?.periodEnd)) {
    const m = new Date(row.period_end || row.periodEnd).getUTCMonth();
    quarter = Math.floor(m / 3) + 1;
  }
  if (!quarter) quarter = '1';
  return `${year}-Q${quarter}`;
}

export async function loadPublicReportRow(id) {
  const rows = await query(
    `SELECT id, ticker, company_name, period_end, pdf_url, source_url, accession, created_at, sector, version, subsector, sector_version, report
       FROM analyses
       WHERE id = $1 AND is_public = true AND status = 'done'
      LIMIT 1`,
    [id],
  );
  return rows.rows[0] ?? null;
}

export async function loadPublicReportBySlug(ticker, rawSlug) {
  const cleanTicker = String(ticker || '').trim().toUpperCase();
  if (!cleanTicker || !/^[A-Z0-9.-]{1,10}$/.test(cleanTicker)) return null;

  let normSlug = String(rawSlug || '').trim().toUpperCase().replace(/10-K/, '10K');
  const rows = await query(
    `SELECT id, ticker, company_name, period_end, pdf_url, source_url, accession, created_at, sector, version, subsector, sector_version, report
       FROM analyses
       WHERE is_public = true AND status = 'done' AND UPPER(ticker) = $1
       ORDER BY created_at DESC, id DESC`,
    [cleanTicker],
  );
  if (!rows.rows.length) return null;

  for (const r of rows.rows) {
    if (buildReportSlug(r) === normSlug) return r;
  }
  if (/^(Q[1-4]|10K|FY|ANNUAL)$/.test(normSlug)) {
    const isTargetAnnual = /^(10K|FY|ANNUAL)$/.test(normSlug);
    const targetQ = normSlug.startsWith('Q') ? normSlug.slice(1) : null;
    for (const r of rows.rows) {
      const s = buildReportSlug(r);
      if (isTargetAnnual && s.endsWith('-10K')) return r;
      if (targetQ && s.endsWith(`-Q${targetQ}`)) return r;
    }
  }
  return null;
}

export async function getReportSlugById(id) {
  const cleanId = Number(id);
  if (!Number.isInteger(cleanId) || cleanId <= 0) return null;
  const row = await loadPublicReportRow(cleanId);
  if (!row) return null;
  const ticker = String(row.ticker ?? row.report?.ticker ?? '').toUpperCase();
  const slug = buildReportSlug(row);
  return { ticker, slug, row };
}

async function buildReportPage(row) {
  const report = row.report ?? {};
  const ticker = String(row.ticker ?? report.ticker ?? '').toUpperCase();
  const company = report.company ?? row.company_name ?? ticker;
  const name = titleCaseName(company);
  let formType = report.formType ?? '';
  if (!formType) {
    formType = (report.periodTitle?.includes('10-K') || report.isAnnual === true) ? '10-K' : '10-Q';
  }
  const isAnnual = report.isAnnual === true || formType === '10-K';
  const fyLabel = report.periodTitle
    ? report.periodTitle
    : (isAnnual ? `FY ${report.fiscalYear ?? ''}` : `Q${report.fiscalQuarter ?? ''} ${report.fiscalYear ?? ''}`);
  const slug = buildReportSlug(row);
  const url = `${config.siteUrl}/informe/${encodeURIComponent(ticker)}/${slug}`;
  const title = `Informe ${formType} de ${name} (${ticker}) — ${fyLabel} | ${SITE_NAME}`;
  const description = `Resultados de ${name} (${ticker}) en su informe ${formType} ${fyLabel.trim()}: ventas, beneficio operativo, flujo de caja libre, dividendos, recompras y deuda, con el análisis financiero de Cifra.`;
  const reportHeadingTitle = `${ticker} — ${fyLabel}`;

  const meta = {
    id: row.id,
    ticker,
    company,
    name,
    formType,
    slug,
    cik: null,
    url,
    title,
    description,
    sourceUrl: safeHttpUrl(row.source_url),
    publishedAt: new Date(row.created_at).toISOString(),
  };
  const jsonLd = buildReportJsonLd(meta, row);

  let out = replaceTokens(readTemplate('index.html'));
  out = setMetaTag(out, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  out = setMetaTag(out, /<meta name="description" content="[\s\S]*?">/, `<meta name="description" content="${escapeHtml(description)}">`);
  out = setMetaTag(out, /<link rel="canonical" href="[\s\S]*?">/, `<link rel="canonical" href="${escapeHtml(url)}">`);
  out = setMetaTag(out, /<meta property="og:title" content="[\s\S]*?">/, `<meta property="og:title" content="${escapeHtml(title)}">`);
  out = setMetaTag(out, /<meta property="og:description" content="[\s\S]*?">/, `<meta property="og:description" content="${escapeHtml(description)}">`);
  out = setMetaTag(out, /<meta property="og:url" content="[\s\S]*?">/, `<meta property="og:url" content="${escapeHtml(url)}">`);
  out = setMetaTag(out, /<meta property="og:type" content="[\s\S]*?">/, '<meta property="og:type" content="article">');
  out = setMetaTag(out, /<meta name="twitter:title" content="[\s\S]*?">/, `<meta name="twitter:title" content="${escapeHtml(title)}">`);
  out = setMetaTag(out, /<meta name="twitter:description" content="[\s\S]*?">/, `<meta name="twitter:description" content="${escapeHtml(description)}">`);

  const hreflangs = [
    `<link rel="alternate" hreflang="es" href="${escapeHtml(url)}">`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(url)}">`,
    `<link rel="alternate" type="text/markdown" href="${escapeHtml(url)}.md" title="Versión Markdown para IA">`,
  ].join('\n  ');
  out = out.replace(/<link rel="alternate" hreflang="es"[^>]*>/, hreflangs);

  const jsonLdScriptTag = `<script type="application/ld+json">\n${safeJsonForScript(jsonLd)}\n</script>`;
  if (/<script type="application\/ld\+json">[\s\S]*?<\/script>/.test(out)) {
    out = out.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, jsonLdScriptTag);
  }

  const versionOptions = {
    sector: row.sector ?? 'defensive_consumer',
    subsector: row.subsector ?? null,
    ticker,
    formType,
  };

  const initialPayload = {
    id: row.id,
    ticker,
    slug,
    company_name: company,
    period_end: row.period_end,
    pdf_url: row.pdf_url,
    source_url: row.source_url,
    accession: row.accession,
    periodTitle: fyLabel,
    formType,
    downloadBase: row.pdf_url ? row.pdf_url.replace(/\.pdf$/, '') : null,
    version: row.version ?? null,
    subsector: row.subsector ?? null,
    sectorVersion: row.sector_version ?? null,
    currentVersion: await resolveAnalysisVersion(versionOptions),
    versionOutdated: await isAnalysisOutdated({ version: row.version, ...versionOptions }),
    report,
  };
  const initialScript = `<script id="cifra-initial-report" type="application/json">${safeJsonForScript(initialPayload, 0)}</script>`;
  out = out.replace('</head>', `  ${initialScript}\n</head>`);
  out = out.replace('<div class="company-loading" id="company-loading">Consultando EDGAR…</div>', '<div class="company-loading" id="company-loading" hidden>Consultando EDGAR…</div>');
  out = out.replace('<div id="company-body" hidden>', '<div id="company-body">');
  out = out.replace('<section class="company-head-row">', '<section class="company-head-row" hidden>');
  out = out.replace('<a class="nav-link active" href="#" data-section="perfil">', '<a class="nav-link" href="#" data-section="perfil">');
  out = out.replace('<a class="nav-link" href="#" data-section="analisis">', '<a class="nav-link active" href="#" data-section="analisis">');
  out = out.replace('<section class="company-section home-analisis-section" id="section-analisis" hidden', '<section class="company-section home-analisis-section" id="section-analisis"');
  out = out.replace('<div class="sec-analysis-entry" id="sec-analysis-entry">', '<div class="sec-analysis-entry" id="sec-analysis-entry" hidden>');
  out = out.replace('<div class="result-preview" id="result-preview" hidden>', '<div class="result-preview" id="result-preview">');
  out = out.replace('<h3 id="result-title">Informe generado</h3>', `<h3 id="result-title">${escapeHtml(reportHeadingTitle)}</h3>`);
  out = out.replace('<div class="result-report" id="report-body"></div>', `<div class="result-report" id="report-body">${renderReportSsrHtml(report)}</div>`);

  return out;
}

export async function getPublicReportHtmlBySlug(ticker, rawSlug) {
  const cleanTicker = String(ticker || '').trim().toUpperCase();
  const normSlug = String(rawSlug || '').trim().toUpperCase().replace(/10-K/, '10K');
  const cacheKey = `${cleanTicker}:${normSlug}`;

  const cached = reportCache.get(cacheKey);
  if (cached && Date.now() - cached.at < REPORT_TTL) return cached.data;

  let row = null;
  try {
    row = await loadPublicReportBySlug(cleanTicker, normSlug);
  } catch {
    row = null;
  }
  if (!row) {
    reportCache.set(cacheKey, { data: null, at: Date.now() });
    return null;
  }

  const canonicalSlug = buildReportSlug(row);
  const html = await buildReportPage(row);
  const result = { html, canonicalSlug, ticker: String(row.ticker ?? cleanTicker).toUpperCase() };

  reportCache.set(cacheKey, { data: result, at: Date.now() });
  reportCache.set(`${result.ticker}:${canonicalSlug}`, { data: result, at: Date.now() });
  if (row.id) reportCache.set(Number(row.id), { data: html, at: Date.now() });
  return result;
}

export async function getPublicReportHtml(id) {
  const cleanId = Number(id);
  if (!Number.isInteger(cleanId) || cleanId <= 0) return null;

  const cached = reportCache.get(cleanId);
  if (cached && Date.now() - cached.at < REPORT_TTL) return cached.data;

  let row = null;
  try {
    row = await loadPublicReportRow(cleanId);
  } catch {
    row = null;
  }
  if (!row) {
    reportCache.set(cleanId, { data: null, at: Date.now() });
    return null;
  }

  const html = await buildReportPage(row);
  reportCache.set(cleanId, { data: html, at: Date.now() });
  return html;
}
