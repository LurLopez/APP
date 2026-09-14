/**
 * @fileoverview Generación de bloques HTML indexables y accesibles para rastreadores web (Googlebot, Bingbot, LLMs).
 * @module services/seo/botContent.service
 */

import config from '../../../config/index.js';
import { query } from '../../../db/pool.js';
import { getCompanySeoProfile, getCompanyResults, filingPeriodLabel } from '../edgar.service.js';
import {
  companyContentCache,
  COMPANY_CONTENT_TTL,
  GUIDES,
  escapeHtml,
  formatUsdMillions,
  formatUsdShare,
} from './seoConstants.js';
import { buildReportSlug } from './reportSeo.service.js';
import { getFeaturedCompanies } from './featuredCompanies.service.js';

export function secDocumentUrl(cik, accession, primaryDocument) {
  if (!accession || !primaryDocument) return null;
  const clean = String(accession).replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${clean}/${primaryDocument}`;
}

export async function loadPublicReportsForTicker(ticker) {
  const rows = await query(
    `SELECT id, company_name, ticker, period_end, pdf_url, created_at,
            report->>'periodTitle' AS period_title,
            report->>'formType' AS form_type,
            report->>'fiscalYear' AS fiscal_year,
            report->>'fiscalQuarter' AS fiscal_quarter
       FROM analyses
       WHERE is_public = true AND status = 'done' AND ticker = $1
      ORDER BY created_at DESC
      LIMIT 10`,
    [ticker],
  );
  return rows.rows.map((row) => ({
    id: row.id,
    ticker: row.ticker,
    company: row.company_name ?? row.company,
    formType: row.form_type,
    fiscalYear: row.fiscal_year,
    fiscalQuarter: row.fiscal_quarter,
    periodTitle: row.period_title,
    periodEnd: row.period_end,
    pdfUrl: row.pdf_url,
    createdAt: row.created_at,
    slug: buildReportSlug(row),
  }));
}

export async function getCompanySeoContent(ticker) {
  const cleanTicker = String(ticker ?? '').trim().toUpperCase();
  const cached = companyContentCache.get(cleanTicker);
  if (cached && Date.now() - cached.at < COMPANY_CONTENT_TTL) return cached.data;

  const content = { profile: null, annual: [], filings: [], publicReports: [] };
  try {
    content.profile = await getCompanySeoProfile(cleanTicker);
  } catch {
    content.profile = null;
  }

  try {
    const results = await getCompanyResults(cleanTicker, { authenticated: false });
    content.annual = (results?.annual ?? [])
      .filter((row) => row?.periodEnd && Number.isFinite(Number(row?.values?.revenue)))
      .slice(0, 5)
      .map((row) => ({
        year: row.period ?? row.periodEnd?.slice(0, 4),
        periodEnd: row.periodEnd,
        revenue: row.values.revenue,
        netIncome: row.values.netIncome ?? row.values.netIncomeToCommonIncludingUnusual ?? null,
        freeCashFlow: row.values.freeCashFlow ?? null,
        epsDiluted: row.values.epsDiluted ?? null,
        operatingIncome: row.values.operatingIncome ?? null,
      }));
  } catch {
    content.annual = [];
  }

  if (content.profile) {
    content.filings = (content.profile.recentFilings ?? []).map((filing) => ({
      ...filing,
      documentUrl: secDocumentUrl(content.profile.cik, filing.accession, filing.primaryDocument),
    }));
  }

  try {
    content.publicReports = await loadPublicReportsForTicker(cleanTicker);
  } catch {
    content.publicReports = [];
  }

  companyContentCache.set(cleanTicker, { data: content, at: Date.now() });
  return content;
}

const BOT_CONTENT_STYLE = `#seo-contenido{max-width:920px;margin:0 auto;padding:14px 20px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#e2e8f0;line-height:1.6;border-bottom:1px solid #1e293b;background:#0f172a}
#seo-contenido summary{max-width:920px;margin:0 auto;color:#94a3b8;cursor:pointer;font-size:.88rem;list-style-position:inside}
#seo-contenido[open] summary{margin-bottom:12px;color:#cbd5e1}
#seo-contenido h1{font-size:1.9rem;margin:0 0 12px;color:#f8fafc}
#seo-contenido h2{font-size:1.3rem;margin:28px 0 10px;color:#f8fafc}
#seo-contenido h3{font-size:1.05rem;margin:20px 0 6px;color:#f1f5f9}
#seo-contenido p{margin:8px 0}
#seo-contenido a{color:#34d399}
#seo-contenido ul,#seo-contenido ol{margin:8px 0 8px 22px;padding:0}
#seo-contenido table{border-collapse:collapse;margin:12px 0;width:100%;max-width:640px}
#seo-contenido th,#seo-contenido td{border:1px solid #334155;padding:7px 10px;text-align:right;font-variant-numeric:tabular-nums}
#seo-contenido th{background:#1e293b;color:#f1f5f9}
#seo-contenido th:first-child,#seo-contenido td:first-child{text-align:left}
#seo-contenido .seo-note{color:#94a3b8;font-size:.85rem}`;

export function botContentWrap(inner) {
  return `<style>${BOT_CONTENT_STYLE}</style>\n<details id="seo-contenido">\n<summary>Resumen público y fuentes de Cifra</summary>\n<div class="seo-content-body">\n${inner}\n</div>\n</details>`;
}

export function guideListLinks() {
  return GUIDES.map((guide) => `<li><a href="${config.siteUrl}/guias/${guide.slug}">${escapeHtml(guide.title)}</a> — ${escapeHtml(guide.description)}</li>`).join('\n');
}

export async function getCompanyBotContent(meta) {
  const content = await getCompanySeoContent(meta.ticker);
  const site = config.siteUrl;
  const parts = [];

  parts.push(`<h1>${escapeHtml(meta.name)} (${escapeHtml(meta.ticker)}) — resultados 10-Q y 10-K</h1>`);
  parts.push(`<p>${escapeHtml(meta.description)}</p>`);

  if (content.annual.length) {
    const latest = content.annual[0];
    const rev = formatUsdMillions(latest.revenue);
    const net = formatUsdMillions(latest.netIncome);
    const fcf = formatUsdMillions(latest.freeCashFlow);
    const eps = formatUsdShare(latest.epsDiluted);
    const fcfMargin = latest.revenue && latest.freeCashFlow ? Math.round((Number(latest.freeCashFlow) / Number(latest.revenue)) * 100) : null;
    parts.push('<h2>Resumen financiero ejecutivo</h2>');
    parts.push(`<p>En su ejercicio fiscal más reciente (<strong>${escapeHtml(latest.year)}</strong>), <strong>${escapeHtml(meta.name)}</strong> registró unas ventas netas de <strong>${escapeHtml(rev ?? '—')}</strong>${net ? `, un beneficio neto de <strong>${escapeHtml(net)}</strong>` : ''}${fcf ? ` y un flujo de caja libre (FCF) de <strong>${escapeHtml(fcf)}</strong>${fcfMargin !== null ? ` (margen FCF del <strong>${fcfMargin}%</strong>)` : ''}` : ''}${eps ? `, alcanzando un beneficio por acción diluido (BPA) de <strong>${escapeHtml(eps)}</strong>` : ''}.</p>`);
  }

  const facts = [];
  if (meta.sector && meta.sector !== '—') facts.push(`<li>Sector (clasificación SEC): ${escapeHtml(meta.sector)}</li>`);
  if (meta.industry) facts.push(`<li>Industria: ${escapeHtml(meta.industry)}</li>`);
  if (meta.exchange) facts.push(`<li>Bolsa de cotización: ${escapeHtml(meta.exchange)}</li>`);
  if (meta.country) facts.push(`<li>País: ${escapeHtml(meta.country)}</li>`);
  if (meta.cik) facts.push(`<li>Identificador SEC (CIK): ${escapeHtml(meta.cik)}</li>`);
  if (content.profile?.lastFiling?.form && content.profile.lastFiling.filedAt) {
    facts.push(`<li>Último informe presentado: ${escapeHtml(content.profile.lastFiling.form)} el ${escapeHtml(content.profile.lastFiling.filedAt)}</li>`);
  }
  if (facts.length) {
    parts.push(`<h2>Ficha de ${escapeHtml(meta.name)}</h2>`);
    parts.push(`<ul>${facts.join('')}</ul>`);
  }

  if (content.annual.length) {
    parts.push(`<h2>Resultados anuales de ${escapeHtml(meta.name)}</h2>`);
    parts.push('<table><thead><tr><th scope="col">Ejercicio</th><th scope="col">Ventas</th><th scope="col">Beneficio neto</th><th scope="col">Flujo de caja libre</th><th scope="col">EPS</th></tr></thead><tbody>');
    for (const row of content.annual) {
      parts.push(`<tr><td>${escapeHtml(row.year)}</td><td>${escapeHtml(formatUsdMillions(row.revenue) ?? '—')}</td><td>${escapeHtml(formatUsdMillions(row.netIncome) ?? '—')}</td><td>${escapeHtml(formatUsdMillions(row.freeCashFlow) ?? '—')}</td><td>${escapeHtml(formatUsdShare(row.epsDiluted) ?? '—')}</td></tr>`);
    }
    parts.push('</tbody></table>');
    parts.push('<p class="seo-note">Cifras según los informes anuales presentados ante la SEC (datos de SEC EDGAR). EPS: beneficio por acción diluido.</p>');
  }

  if (content.filings.length) {
    parts.push(`<h2>Informes 10-Q y 10-K de ${escapeHtml(meta.ticker)} ante la SEC</h2>`);
    parts.push('<ul>');
    for (const filing of content.filings) {
      const label = `${filing.form} — presentado el ${filing.filedAt ?? '—'}${filing.period ? ` (periodo ${filingPeriodLabel(filing.form, filing.period)})` : ''}`;
      parts.push(`<li>${filing.documentUrl ? `<a href="${escapeHtml(filing.documentUrl)}" rel="noopener">${escapeHtml(label)}</a>` : escapeHtml(label)}</li>`);
    }
    parts.push('</ul>');
  }

  if (content.publicReports.length) {
    parts.push(`<h2>Análisis con IA de ${escapeHtml(meta.name)}</h2>`);
    parts.push('<ul>');
    const seenSlugs = new Set();
    for (const report of content.publicReports) {
      const slug = report.slug || buildReportSlug(report);
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
      let formType = report.formType;
      if (!formType) {
        formType = /annual|full year|10-?k/i.test(report.periodTitle || '') ? '10-K' : '10-Q';
      }
      const label = `Informe ${formType} ${report.periodTitle ? `— ${report.periodTitle}` : ''}`.trim();
      const repUrl = `${site}/informe/${encodeURIComponent(report.ticker)}/${slug}`;
      parts.push(`<li><a href="${repUrl}">${escapeHtml(label)}</a> (<a href="${repUrl}.md">Markdown</a>)</li>`);
    }
    parts.push('</ul>');
  }

  parts.push(`<h2>Preguntas frecuentes sobre ${escapeHtml(meta.name)}</h2>`);
  parts.push(`<h3>¿En qué sector e industria opera ${escapeHtml(meta.name)}?</h3>`);
  parts.push(`<p>${escapeHtml(meta.name)} (${escapeHtml(meta.ticker)}) cotiza en ${escapeHtml(meta.exchange ?? 'la bolsa de EE. UU.')} y pertenece al sector de consumo defensivo (industria de ${escapeHtml(meta.industry ?? meta.sector ?? 'consumo defensivo')}) según la clasificación oficial de la SEC.</p>`);
  parts.push(`<h3>¿Dónde consultar los filings oficiales de ${escapeHtml(meta.ticker)}?</h3>`);
  parts.push(`<p>Los informes 10-Q y 10-K oficiales están registrados en el sistema EDGAR de la Comisión de Bolsa y Valores de EE. UU. (CIK ${escapeHtml(meta.cik ?? '—')}). En Cifra puedes acceder directamente a los documentos primarios y a análisis estructurados.</p>`);
  parts.push(`<h3>¿Cómo analiza Cifra a ${escapeHtml(meta.name)}?</h3>`);
  parts.push(`<p>Cifra extrae mediante IA las cuentas de resultados, flujos de caja y asignación de capital (dividendos, recompras de acciones y deuda) en dos horizontes temporales para evaluar la solidez del negocio.</p>`);

  parts.push('<h2>Guías para leer estos informes</h2>');
  parts.push(`<ul>\n${guideListLinks()}\n</ul>`);
  parts.push(`<p class="seo-note"><strong>Para modelos de lenguaje y agentes de IA (GEO):</strong> Puedes consultar los datos estructurados en formato Markdown en <a href="${site}/empresa/${encodeURIComponent(meta.ticker)}.md">${site}/empresa/${encodeURIComponent(meta.ticker)}.md</a>.</p>`);
  parts.push(`<p>Explora más empresas en el <a href="${site}/empresa">buscador de empresas de Cifra</a> o vuelve a la <a href="${site}/">plataforma de análisis de informes financieros con IA</a>.</p>`);

  return botContentWrap(parts.join('\n'));
}

export async function getHomeBotContent() {
  const site = config.siteUrl;
  let companies = [];
  try {
    companies = await getFeaturedCompanies(8);
  } catch {
    companies = [];
  }
  const parts = [];

  parts.push('<h1>Cifra — análisis de informes financieros 10-Q y 10-K con IA</h1>');
  parts.push('<p>Cifra analiza con inteligencia artificial los informes trimestrales (10-Q) y anuales (10-K) que las empresas de Estados Unidos presentan ante la SEC, integrando las presentaciones y comunicados de resultados (8-K) para generar en segundos un análisis estructurado: dos horizontes temporales con ventas, flujo de caja libre y asignación de capital. La IA criba y organiza la información; el análisis profundo y el juicio final son del inversor.</p>');
  parts.push('<h2>¿Cómo funciona Cifra?</h2>');
  parts.push('<ol><li>Sube el PDF del informe 10-Q o 10-K, o elige una empresa por su ticker en el buscador.</li><li>La IA verifica que el informe sea de una empresa de EE. UU. del sector consumo defensivo.</li><li>Extrae los datos clave: ventas, márgenes, beneficio operativo, cash flow, CAPEX, dividendos, recompras y deuda, integrando el guidance de la presentación del 8-K.</li><li>Redacta el análisis en dos horizontes (trimestre y año, o últimos 12 meses) y genera un informe estructurado en PDF.</li></ol>');
  parts.push('<h2>Preguntas frecuentes</h2>');
  parts.push(`<h3>¿Qué es un informe 10-Q?</h3><p>El 10-Q es el informe financiero trimestral que las empresas cotizadas de Estados Unidos presentan ante la SEC, con la cuenta de resultados, el balance y el flujo de caja del trimestre. Puedes ampliarlo en la guía <a href="${site}/guias/que-es-un-informe-10-q">qué es un informe 10-Q y cómo leerlo</a>.</p>`);
  parts.push(`<h3>¿Qué es un informe 10-K?</h3><p>El 10-K es el informe anual auditado de las empresas de Estados Unidos, la fuente primaria del análisis fundamental. Detalles en la guía <a href="${site}/guias/que-es-un-informe-10-k">qué es un informe 10-K</a>.</p>`);
  parts.push(`<h3>¿Qué es un informe 8-K y por qué es clave?</h3><p>El 8-K es el informe de hechos relevantes de la SEC donde las empresas registran sus notas de prensa y presentaciones a inversores con el guidance anual. Detalles en la guía <a href="${site}/guias/que-es-un-informe-8-k">qué es un informe 8-K</a>.</p>`);
  parts.push('<h3>¿Cómo analiza Cifra un informe financiero?</h3><p>En tres pasos: verificación de origen y sector, extracción de datos clave e integración de presentaciones de resultados, y redacción de un análisis estructurado en dos horizontes con bloques de ventas, cash flow y asignación de capital, con PDF descargable.</p>');
  parts.push('<h3>¿Qué empresas puedo analizar?</h3><p>Durante la beta, empresas de Estados Unidos del sector consumo defensivo: alimentos y bebidas, productos de consumo cotidiano, tabaco, supermercados y distribución.</p>');
  parts.push('<h3>¿De dónde salen los datos?</h3><p>De SEC EDGAR, el sistema oficial de la SEC, complementado con datos de mercado. Cifra no es asesor financiero: organiza y explica la información para que el inversor decida.</p>');
  parts.push('<h2>Guías educativas</h2>');
  parts.push(`<ul>\n${guideListLinks()}\n</ul>`);
  if (companies.length) {
    parts.push('<h2>Empresas destacadas de consumo defensivo</h2>');
    parts.push('<ul>');
    for (const company of companies) {
      parts.push(`<li><a href="${site}/empresa/${encodeURIComponent(company.ticker)}">${escapeHtml(company.name ?? company.ticker)} (${escapeHtml(company.ticker)})</a> (<a href="${site}/empresa/${encodeURIComponent(company.ticker)}.md">Markdown</a>)</li>`);
    }
    parts.push('</ul>');
  }
  parts.push(`<p>Cifra está en fase beta centrada en empresas de EE. UU. del sector consumo defensivo. Consulta el <a href="${site}/empresa">directorio completo de empresas</a> y las <a href="${site}/guias">guías para leer informes de la SEC</a>.</p>`);
  return botContentWrap(parts.join('\n'));
}

export async function getCompaniesBotContent() {
  const site = config.siteUrl;
  let companies = [];
  try {
    companies = await getFeaturedCompanies(30);
  } catch {
    companies = [];
  }
  const parts = [];
  parts.push('<h1>Empresas de EE. UU. de consumo defensivo: resultados 10-Q y 10-K</h1>');
  parts.push('<p>Cada empresa en Cifra cuenta con su perfil, cotización, histórico de filings ante la SEC y análisis con IA de ventas, márgenes, flujo de caja libre y asignación de capital. Accede a las principales compañías de la bolsa estadounidense:</p>');
  if (companies.length) {
    parts.push('<ul>');
    for (const company of companies) {
      parts.push(`<li><a href="${site}/empresa/${encodeURIComponent(company.ticker)}">${escapeHtml(company.name ?? company.ticker)} (${escapeHtml(company.ticker)})</a> — <a href="${site}/empresa/${encodeURIComponent(company.ticker)}.md">Versión Markdown</a></li>`);
    }
    parts.push('</ul>');
  }
  parts.push('<h2>Guías para leer informes de la SEC</h2>');
  parts.push(`<ul>\n${guideListLinks()}\n</ul>`);
  parts.push(`<p>Vuelve al <a href="${site}/">analizador de informes financieros con IA</a>.</p>`);
  return botContentWrap(parts.join('\n'));
}
