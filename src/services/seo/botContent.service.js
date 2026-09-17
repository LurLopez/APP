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

export function botContentWrap(inner, lang = 'es') {
  const isEn = lang === 'en';
  const summary = isEn ? 'Public summary and sources from Cifra' : 'Resumen público y fuentes de Cifra';
  return `<style>${BOT_CONTENT_STYLE}</style>\n<details id="seo-contenido">\n<summary>${summary}</summary>\n<div class="seo-content-body">\n${inner}\n</div>\n</details>`;
}

export function guideListLinks(lang = 'es') {
  const isEn = lang === 'en';
  const prefix = isEn ? `${config.siteUrl}/en/guias` : `${config.siteUrl}/guias`;
  return GUIDES.map((guide) => {
    const title = isEn && guide.titleEn ? guide.titleEn : guide.title;
    const desc = isEn && guide.descriptionEn ? guide.descriptionEn : guide.description;
    return `<li><a href="${prefix}/${guide.slug}">${escapeHtml(title)}</a> — ${escapeHtml(desc)}</li>`;
  }).join('\n');
}

export async function getCompanyBotContent(meta, lang = 'es') {
  const isEn = (lang === 'en') || (meta?.lang === 'en');
  const content = await getCompanySeoContent(meta.ticker);
  const site = isEn ? `${config.siteUrl}/en` : config.siteUrl;
  const parts = [];

  const mainTitle = isEn
    ? `${escapeHtml(meta.name)} (${escapeHtml(meta.ticker)}) — 10-Q and 10-K SEC results`
    : `${escapeHtml(meta.name)} (${escapeHtml(meta.ticker)}) — resultados 10-Q y 10-K`;
  parts.push(`<h1>${mainTitle}</h1>`);
  parts.push(`<p>${escapeHtml(meta.description)}</p>`);

  if (content.annual.length) {
    const latest = content.annual[0];
    const rev = formatUsdMillions(latest.revenue);
    const net = formatUsdMillions(latest.netIncome);
    const fcf = formatUsdMillions(latest.freeCashFlow);
    const eps = formatUsdShare(latest.epsDiluted);
    const fcfMargin = latest.revenue && latest.freeCashFlow ? Math.round((Number(latest.freeCashFlow) / Number(latest.revenue)) * 100) : null;
    if (isEn) {
      parts.push('<h2>Executive Financial Summary</h2>');
      parts.push(`<p>In its most recent fiscal year (<strong>${escapeHtml(latest.year)}</strong>), <strong>${escapeHtml(meta.name)}</strong> reported net sales of <strong>${escapeHtml(rev ?? '—')}</strong>${net ? `, net income of <strong>${escapeHtml(net)}</strong>` : ''}${fcf ? ` and free cash flow (FCF) of <strong>${escapeHtml(fcf)}</strong>${fcfMargin !== null ? ` (FCF margin of <strong>${fcfMargin}%</strong>)` : ''}` : ''}${eps ? `, reaching diluted earnings per share (EPS) of <strong>${escapeHtml(eps)}</strong>` : ''}.</p>`);
    } else {
      parts.push('<h2>Resumen financiero ejecutivo</h2>');
      parts.push(`<p>En su ejercicio fiscal más reciente (<strong>${escapeHtml(latest.year)}</strong>), <strong>${escapeHtml(meta.name)}</strong> registró unas ventas netas de <strong>${escapeHtml(rev ?? '—')}</strong>${net ? `, un beneficio neto de <strong>${escapeHtml(net)}</strong>` : ''}${fcf ? ` y un flujo de caja libre (FCF) de <strong>${escapeHtml(fcf)}</strong>${fcfMargin !== null ? ` (margen FCF del <strong>${fcfMargin}%</strong>)` : ''}` : ''}${eps ? `, alcanzando un beneficio por acción diluido (BPA) de <strong>${escapeHtml(eps)}</strong>` : ''}.</p>`);
    }
  }

  const facts = [];
  if (isEn) {
    let sec = meta.sector;
    if (sec && sec.toLowerCase().includes('consumo defensivo')) sec = 'Consumer Defensive';
    let ctry = meta.country;
    if (ctry && ctry.toLowerCase().includes('estados unidos')) ctry = 'United States';
    if (sec && sec !== '—') facts.push(`<li>Sector (SEC classification): ${escapeHtml(sec)}</li>`);
    if (meta.industry) facts.push(`<li>Industry: ${escapeHtml(meta.industry)}</li>`);
    if (meta.exchange) facts.push(`<li>Stock exchange: ${escapeHtml(meta.exchange)}</li>`);
    if (ctry) facts.push(`<li>Country: ${escapeHtml(ctry)}</li>`);
    if (meta.cik) facts.push(`<li>SEC identifier (CIK): ${escapeHtml(meta.cik)}</li>`);
    if (content.profile?.lastFiling?.form && content.profile.lastFiling.filedAt) {
      facts.push(`<li>Latest filing submitted: Form ${escapeHtml(content.profile.lastFiling.form)} on ${escapeHtml(content.profile.lastFiling.filedAt)}</li>`);
    }
  } else {
    if (meta.sector && meta.sector !== '—') facts.push(`<li>Sector (clasificación SEC): ${escapeHtml(meta.sector)}</li>`);
    if (meta.industry) facts.push(`<li>Industria: ${escapeHtml(meta.industry)}</li>`);
    if (meta.exchange) facts.push(`<li>Bolsa de cotización: ${escapeHtml(meta.exchange)}</li>`);
    if (meta.country) facts.push(`<li>País: ${escapeHtml(meta.country)}</li>`);
    if (meta.cik) facts.push(`<li>Identificador SEC (CIK): ${escapeHtml(meta.cik)}</li>`);
    if (content.profile?.lastFiling?.form && content.profile.lastFiling.filedAt) {
      facts.push(`<li>Último informe presentado: ${escapeHtml(content.profile.lastFiling.form)} el ${escapeHtml(content.profile.lastFiling.filedAt)}</li>`);
    }
  }
  if (facts.length) {
    parts.push(isEn ? `<h2>Company Profile: ${escapeHtml(meta.name)}</h2>` : `<h2>Ficha de ${escapeHtml(meta.name)}</h2>`);
    parts.push(`<ul>${facts.join('')}</ul>`);
  }

  if (content.annual.length) {
    parts.push(isEn ? `<h2>Annual results for ${escapeHtml(meta.name)}</h2>` : `<h2>Resultados anuales de ${escapeHtml(meta.name)}</h2>`);
    const thCols = isEn
      ? '<th scope="col">Fiscal Year</th><th scope="col">Revenue</th><th scope="col">Net income</th><th scope="col">Free cash flow</th><th scope="col">EPS</th>'
      : '<th scope="col">Ejercicio</th><th scope="col">Ventas</th><th scope="col">Beneficio neto</th><th scope="col">Flujo de caja libre</th><th scope="col">EPS</th>';
    parts.push(`<table><thead><tr>${thCols}</tr></thead><tbody>`);
    for (const row of content.annual) {
      parts.push(`<tr><td>${escapeHtml(row.year)}</td><td>${escapeHtml(formatUsdMillions(row.revenue) ?? '—')}</td><td>${escapeHtml(formatUsdMillions(row.netIncome) ?? '—')}</td><td>${escapeHtml(formatUsdMillions(row.freeCashFlow) ?? '—')}</td><td>${escapeHtml(formatUsdShare(row.epsDiluted) ?? '—')}</td></tr>`);
    }
    parts.push('</tbody></table>');
    const note = isEn
      ? 'Figures according to annual reports filed with the SEC (data from SEC EDGAR). EPS: diluted earnings per share.'
      : 'Cifras según los informes anuales presentados ante la SEC (datos de SEC EDGAR). EPS: beneficio por acción diluido.';
    parts.push(`<p class="seo-note">${note}</p>`);
  }

  if (content.filings.length) {
    parts.push(isEn ? `<h2>SEC Form 10-Q and 10-K filings for ${escapeHtml(meta.ticker)}</h2>` : `<h2>Informes 10-Q y 10-K de ${escapeHtml(meta.ticker)} ante la SEC</h2>`);
    parts.push('<ul>');
    for (const filing of content.filings) {
      const label = isEn
        ? `${filing.form} — filed on ${filing.filedAt ?? '—'}${filing.period ? ` (period ${filingPeriodLabel(filing.form, filing.period)})` : ''}`
        : `${filing.form} — presentado el ${filing.filedAt ?? '—'}${filing.period ? ` (periodo ${filingPeriodLabel(filing.form, filing.period)})` : ''}`;
      parts.push(`<li>${filing.documentUrl ? `<a href="${escapeHtml(filing.documentUrl)}" rel="noopener">${escapeHtml(label)}</a>` : escapeHtml(label)}</li>`);
    }
    parts.push('</ul>');
  }

  if (content.publicReports.length) {
    parts.push(isEn ? `<h2>AI Financial Analysis of ${escapeHtml(meta.name)}</h2>` : `<h2>Análisis con IA de ${escapeHtml(meta.name)}</h2>`);
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
      const label = isEn
        ? `Form ${formType} report ${report.periodTitle ? `— ${report.periodTitle}` : ''}`.trim()
        : `Informe ${formType} ${report.periodTitle ? `— ${report.periodTitle}` : ''}`.trim();
      const repUrl = isEn
        ? `${config.siteUrl}/en/informe/${encodeURIComponent(report.ticker)}/${slug}`
        : `${config.siteUrl}/informe/${encodeURIComponent(report.ticker)}/${slug}`;
      parts.push(`<li><a href="${repUrl}">${escapeHtml(label)}</a> (<a href="${repUrl}.md">Markdown</a>)</li>`);
    }
    parts.push('</ul>');
  }

  if (isEn) {
    parts.push(`<h2>Frequently asked questions about ${escapeHtml(meta.name)}</h2>`);
    parts.push(`<h3>In which sector and industry does ${escapeHtml(meta.name)} operate?</h3>`);
    parts.push(`<p>${escapeHtml(meta.name)} (${escapeHtml(meta.ticker)}) is listed on ${escapeHtml(meta.exchange ?? 'the U.S. stock market')} and belongs to the consumer staples sector (${escapeHtml(meta.industry ?? meta.sector ?? 'consumer staples')} industry) according to the official SEC classification.</p>`);
    parts.push(`<h3>Where can you view official SEC filings for ${escapeHtml(meta.ticker)}?</h3>`);
    parts.push(`<p>Official 10-Q and 10-K reports are registered in the U.S. Securities and Exchange Commission EDGAR system (CIK ${escapeHtml(meta.cik ?? '—')}). On Cifra you can directly access primary documents and structured analyses.</p>`);
    parts.push(`<h3>How does Cifra analyze ${escapeHtml(meta.name)}?</h3>`);
    parts.push(`<p>Cifra extracts income statements, cash flows, and capital allocation (dividends, share repurchases, and debt) across two time horizons using AI to evaluate business durability.</p>`);

    parts.push('<h2>Guides to read these reports</h2>');
    parts.push(`<ul>\n${guideListLinks('en')}\n</ul>`);
    parts.push(`<p class="seo-note"><strong>For language models and AI agents (GEO):</strong> Structured data is available in Markdown format at <a href="${config.siteUrl}/en/empresa/${encodeURIComponent(meta.ticker)}.md">${config.siteUrl}/en/empresa/${encodeURIComponent(meta.ticker)}.md</a>.</p>`);
    parts.push(`<p>Explore more companies in the <a href="${config.siteUrl}/en/empresa">Cifra company directory</a> or return to the <a href="${config.siteUrl}/en">AI financial report analysis platform</a>.</p>`);
  } else {
    parts.push(`<h2>Preguntas frecuentes sobre ${escapeHtml(meta.name)}</h2>`);
    parts.push(`<h3>¿En qué sector e industria opera ${escapeHtml(meta.name)}?</h3>`);
    parts.push(`<p>${escapeHtml(meta.name)} (${escapeHtml(meta.ticker)}) cotiza en ${escapeHtml(meta.exchange ?? 'la bolsa de EE. UU.')} y pertenece al sector de consumo defensivo (industria de ${escapeHtml(meta.industry ?? meta.sector ?? 'consumo defensivo')}) según la clasificación oficial de la SEC.</p>`);
    parts.push(`<h3>¿Dónde consultar los filings oficiales de ${escapeHtml(meta.ticker)}?</h3>`);
    parts.push(`<p>Los informes 10-Q y 10-K oficiales están registrados en el sistema EDGAR de la Comisión de Bolsa y Valores de EE. UU. (CIK ${escapeHtml(meta.cik ?? '—')}). En Cifra puedes acceder directamente a los documentos primarios y a análisis estructurados.</p>`);
    parts.push(`<h3>¿Cómo analiza Cifra a ${escapeHtml(meta.name)}?</h3>`);
    parts.push(`<p>Cifra extrae mediante IA las cuentas de resultados, flujos de caja y asignación de capital (dividendos, recompras de acciones y deuda) en dos horizontes temporales para evaluar la solidez del negocio.</p>`);

    parts.push('<h2>Guías para leer estos informes</h2>');
    parts.push(`<ul>\n${guideListLinks('es')}\n</ul>`);
    parts.push(`<p class="seo-note"><strong>Para modelos de lenguaje y agentes de IA (GEO):</strong> Puedes consultar los datos estructurados en formato Markdown en <a href="${config.siteUrl}/empresa/${encodeURIComponent(meta.ticker)}.md">${config.siteUrl}/empresa/${encodeURIComponent(meta.ticker)}.md</a>.</p>`);
    parts.push(`<p>Explora más empresas en el <a href="${config.siteUrl}/empresa">buscador de empresas de Cifra</a> o vuelve a la <a href="${config.siteUrl}/">plataforma de análisis de informes financieros con IA</a>.</p>`);
  }

  return botContentWrap(parts.join('\n'), isEn ? 'en' : 'es');
}

export async function getHomeBotContent(lang = 'es') {
  const isEn = lang === 'en';
  const site = isEn ? `${config.siteUrl}/en` : config.siteUrl;
  let companies = [];
  try {
    companies = await getFeaturedCompanies(8);
  } catch {
    companies = [];
  }
  const parts = [];

  if (isEn) {
    parts.push('<h1>Cifra — SEC 10-Q and 10-K Financial Report Analysis with AI</h1>');
    parts.push('<p>Cifra uses artificial intelligence to analyze quarterly (10-Q) and annual (10-K) reports filed by U.S. companies with the SEC, integrating earnings presentations and press releases (Form 8-K) to generate a structured analysis in seconds: two time horizons with sales, free cash flow, and capital allocation. AI organizes and explains the data; deep fundamental analysis belongs to the investor.</p>');
    parts.push('<h2>How does Cifra work?</h2>');
    parts.push('<ol><li>Upload the PDF of the 10-Q or 10-K report, or search for a company by ticker.</li><li>The AI verifies that the report belongs to a U.S. company in the consumer staples sector.</li><li>It extracts key financial data: sales, margins, operating income, cash flow, CAPEX, dividends, buybacks, and debt, incorporating guidance from the 8-K.</li><li>It drafts the analysis across two time horizons and generates a downloadable PDF report.</li></ol>');
    parts.push('<h2>Frequently asked questions</h2>');
    parts.push(`<h3>What is a 10-Q report?</h3><p>The 10-Q is the quarterly financial report that U.S. listed companies file with the SEC, featuring the income statement, balance sheet, and cash flow for the quarter. Read more in our guide <a href="${config.siteUrl}/en/guias/que-es-un-informe-10-q">what is a 10-Q report and how to read it</a>.</p>`);
    parts.push(`<h3>What is a 10-K report?</h3><p>The 10-K is the audited annual report of U.S. public companies, the primary source for fundamental analysis. Details in the guide <a href="${config.siteUrl}/en/guias/que-es-un-informe-10-k">what is a 10-K report</a>.</p>`);
    parts.push(`<h3>What is an 8-K report and why is it key?</h3><p>The 8-K reports material corporate events where companies disclose press releases and investor presentations with management guidance. Details in the guide <a href="${config.siteUrl}/en/guias/que-es-un-informe-8-k">what is an 8-K report</a>.</p>`);
    parts.push('<h3>How does Cifra analyze a financial report?</h3><p>In three steps: verification of origin and sector, extraction of key financial figures with earnings presentations, and drafting of a structured analysis across two time horizons with sales, cash flow, and capital allocation blocks.</p>');
    parts.push('<h3>Which companies can I analyze?</h3><p>During the beta, U.S. companies in the consumer staples sector: food and beverage, household products, tobacco, supermarkets, and distribution.</p>');
    parts.push('<h3>Where does the data come from?</h3><p>Directly from SEC EDGAR, complemented by market data. Cifra is not a financial advisor: it structures information for investors.</p>');
    parts.push('<h2>Educational guides</h2>');
    parts.push(`<ul>\n${guideListLinks('en')}\n</ul>`);
    if (companies.length) {
      parts.push('<h2>Featured consumer staples companies</h2>');
      parts.push('<ul>');
      for (const company of companies) {
        parts.push(`<li><a href="${config.siteUrl}/en/empresa/${encodeURIComponent(company.ticker)}">${escapeHtml(company.name ?? company.ticker)} (${escapeHtml(company.ticker)})</a> (<a href="${config.siteUrl}/en/empresa/${encodeURIComponent(company.ticker)}.md">Markdown</a>)</li>`);
      }
      parts.push('</ul>');
    }
    parts.push(`<p>Cifra is in beta focused on U.S. consumer staples companies. Explore the <a href="${config.siteUrl}/en/empresa">full company directory</a> and <a href="${config.siteUrl}/en/guias">guides to reading SEC reports</a>.</p>`);
  } else {
    parts.push('<h1>Cifra — análisis de informes financieros 10-Q y 10-K con IA</h1>');
    parts.push('<p>Cifra analiza con inteligencia artificial los informes trimestrales (10-Q) y anuales (10-K) que las empresas de Estados Unidos presentan ante la SEC, integrando las presentaciones y comunicados de resultados (8-K) para generar en segundos un análisis estructurado: dos horizontes temporales con ventas, flujo de caja libre y asignación de capital. La IA criba y organiza la información; el análisis profundo y el juicio final son del inversor.</p>');
    parts.push('<h2>¿Cómo funciona Cifra?</h2>');
    parts.push('<ol><li>Sube el PDF del informe 10-Q o 10-K, o elige una empresa por su ticker en el buscador.</li><li>La IA verifica que el informe sea de una empresa de EE. UU. del sector consumo defensivo.</li><li>Extrae los datos clave: ventas, márgenes, beneficio operativo, cash flow, CAPEX, dividendos, recompras y deuda, integrando el guidance de la presentación del 8-K.</li><li>Redacta el análisis en dos horizontes (trimestre y año, o últimos 12 meses) y genera un informe estructurado en PDF.</li></ol>');
    parts.push('<h2>Preguntas frecuentes</h2>');
    parts.push(`<h3>¿Qué es un informe 10-Q?</h3><p>El 10-Q es el informe financiero trimestral que las empresas cotizadas de Estados Unidos presentan ante la SEC, con la cuenta de resultados, el balance y el flujo de caja del trimestre. Puedes ampliarlo en la guía <a href="${config.siteUrl}/guias/que-es-un-informe-10-q">qué es un informe 10-Q y cómo leerlo</a>.</p>`);
    parts.push(`<h3>¿Qué es un informe 10-K?</h3><p>El 10-K es el informe anual auditado de las empresas de Estados Unidos, la fuente primaria del análisis fundamental. Detalles en la guía <a href="${config.siteUrl}/guias/que-es-un-informe-10-k">qué es un informe 10-K</a>.</p>`);
    parts.push(`<h3>¿Qué es un informe 8-K y por qué es clave?</h3><p>El 8-K es el informe de hechos relevantes de la SEC donde las empresas registran sus notas de prensa y presentaciones a inversores con el guidance anual. Detalles en la guía <a href="${config.siteUrl}/guias/que-es-un-informe-8-k">qué es un informe 8-K</a>.</p>`);
    parts.push('<h3>¿Cómo analiza Cifra un informe financiero?</h3><p>En tres pasos: verificación de origen y sector, extracción de datos clave e integración de presentaciones de resultados, y redacción de un análisis estructurado en dos horizontes con bloques de ventas, cash flow y asignación de capital, con PDF descargable.</p>');
    parts.push('<h3>¿Qué empresas puedo analizar?</h3><p>Durante la beta, empresas de Estados Unidos del sector consumo defensivo: alimentos y bebidas, productos de consumo cotidiano, tabaco, supermercados y distribución.</p>');
    parts.push('<h3>¿De dónde salen los datos?</h3><p>De SEC EDGAR, el sistema oficial de la SEC, complementado con datos de mercado. Cifra no es asesor financiero: organiza y explica la información para que el inversor decida.</p>');
    parts.push('<h2>Guías educativas</h2>');
    parts.push(`<ul>\n${guideListLinks('es')}\n</ul>`);
    if (companies.length) {
      parts.push('<h2>Empresas destacadas de consumo defensivo</h2>');
      parts.push('<ul>');
      for (const company of companies) {
        parts.push(`<li><a href="${config.siteUrl}/empresa/${encodeURIComponent(company.ticker)}">${escapeHtml(company.name ?? company.ticker)} (${escapeHtml(company.ticker)})</a> (<a href="${config.siteUrl}/empresa/${encodeURIComponent(company.ticker)}.md">Markdown</a>)</li>`);
      }
      parts.push('</ul>');
    }
    parts.push(`<p>Cifra está en fase beta centrada en empresas de EE. UU. del sector consumo defensivo. Consulta el <a href="${config.siteUrl}/empresa">directorio completo de empresas</a> y las <a href="${config.siteUrl}/guias">guías para leer informes de la SEC</a>.</p>`);
  }

  return botContentWrap(parts.join('\n'), isEn ? 'en' : 'es');
}

export async function getCompaniesBotContent(lang = 'es') {
  const isEn = lang === 'en';
  let companies = [];
  try {
    companies = await getFeaturedCompanies(30);
  } catch {
    companies = [];
  }
  const parts = [];

  if (isEn) {
    parts.push('<h1>U.S. Consumer Staples Companies: 10-Q and 10-K Results</h1>');
    parts.push('<p>Every company on Cifra features its profile, market price, SEC filing history, and AI analysis of sales, margins, free cash flow, and capital allocation. Access key companies in the U.S. stock market:</p>');
    if (companies.length) {
      parts.push('<ul>');
      for (const company of companies) {
        parts.push(`<li><a href="${config.siteUrl}/en/empresa/${encodeURIComponent(company.ticker)}">${escapeHtml(company.name ?? company.ticker)} (${escapeHtml(company.ticker)})</a> — <a href="${config.siteUrl}/en/empresa/${encodeURIComponent(company.ticker)}.md">Markdown Version</a></li>`);
      }
      parts.push('</ul>');
    }
    parts.push('<h2>Guides to read SEC reports</h2>');
    parts.push(`<ul>\n${guideListLinks('en')}\n</ul>`);
    parts.push(`<p>Return to the <a href="${config.siteUrl}/en">AI financial report analysis platform</a>.</p>`);
  } else {
    parts.push('<h1>Empresas de EE. UU. de consumo defensivo: resultados 10-Q y 10-K</h1>');
    parts.push('<p>Cada empresa en Cifra cuenta con su perfil, cotización, histórico de filings ante la SEC y análisis con IA de ventas, márgenes, flujo de caja libre y asignación de capital. Accede a las principales compañías de la bolsa estadounidense:</p>');
    if (companies.length) {
      parts.push('<ul>');
      for (const company of companies) {
        parts.push(`<li><a href="${config.siteUrl}/empresa/${encodeURIComponent(company.ticker)}">${escapeHtml(company.name ?? company.ticker)} (${escapeHtml(company.ticker)})</a> — <a href="${config.siteUrl}/empresa/${encodeURIComponent(company.ticker)}.md">Versión Markdown</a></li>`);
      }
      parts.push('</ul>');
    }
    parts.push('<h2>Guías para leer informes de la SEC</h2>');
    parts.push(`<ul>\n${guideListLinks('es')}\n</ul>`);
    parts.push(`<p>Vuelve al <a href="${config.siteUrl}/">analizador de informes financieros con IA</a>.</p>`);
  }

  return botContentWrap(parts.join('\n'), isEn ? 'en' : 'es');
}
