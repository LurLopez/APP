import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../../config/index.js';
import { query } from '../../db/pool.js';
import { getCompanySeoProfile, getCompanyResults, filingPeriodLabel } from './edgar.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const GUIDES_DIR = path.join(__dirname, '..', 'content', 'guias');

const SITE_NAME = 'Cifra';
const GA_MEASUREMENT_ID = 'G-7PSC9M3B1H';

function withAnalytics(html) {
  if (config.siteUrl !== 'https://cifraresearch.com') return html;
  const snippet = `  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA_MEASUREMENT_ID}');
  </script>
`;
  return html.replace('</head>', `${snippet}</head>`);
}
const DEFAULT_OG_IMAGE = `${config.siteUrl}/og-cifra.png`;

const templatesCache = new Map();
const guidesCache = new Map();
const companyMetaCache = new Map();
const companyContentCache = new Map();
const reportCache = new Map();
const sitemapCache = { xml: null, at: 0 };
const COMPANY_META_TTL = 6 * 60 * 60 * 1000;
const COMPANY_CONTENT_TTL = 12 * 60 * 60 * 1000;
const REPORT_TTL = 10 * 60 * 1000;
const SITEMAP_TTL = 30 * 60 * 1000;

const PRIVATE_PATHS = new Set([
  '/seguimiento',
  '/cartera',
  '/calendario',
  '/analisis',
  '/análisis',
  '/alertas',
  '/alertas-precio',
  '/novedades',
  '/reportes',
  '/admin/reportes',
]);

export const GUIDES = [
  {
    slug: 'que-es-un-informe-10-q',
    title: '¿Qué es un informe 10-Q y cómo leerlo?',
    description: 'El 10-Q es el informe trimestral que las empresas de EE. UU. presentan ante la SEC: qué contiene, cuándo se publica y cómo leerlo paso a paso.',
  },
  {
    slug: 'que-es-un-informe-10-k',
    title: '¿Qué es un informe 10-K? El informe anual de la SEC',
    description: 'El 10-K es el informe anual auditado de las empresas de EE. UU.: secciones, plazos de presentación y qué mirar para analizar una empresa.',
  },
  {
    slug: 'que-es-un-informe-8-k',
    title: '¿Qué es un informe 8-K y por qué es clave en los resultados trimestrales?',
    description: 'El 8-K es el informe de hechos relevantes de la SEC: qué contiene el Item 2.02, por qué incluye la presentación de resultados y cómo interpretarlo.',
  },
  {
    slug: 'diferencias-entre-10-k-y-10-q',
    title: 'Diferencias entre el 10-K y el 10-Q',
    description: 'Comparativa completa entre el 10-K (anual, auditado) y el 10-Q (trimestral, sin auditar): frecuencia, contenido, plazos y cuándo leer cada uno.',
  },
  {
    slug: 'que-es-el-flujo-de-caja-libre',
    title: '¿Qué es el flujo de caja libre (FCF)?',
    description: 'El flujo de caja libre es el dinero que una empresa genera tras invertir en su negocio: fórmula, por qué importa más que el beneficio y cómo usarlo.',
  },
  {
    slug: 'que-es-la-asignacion-de-capital',
    title: '¿Qué es la asignación de capital?',
    description: 'La asignación de capital es lo que una empresa hace con el dinero que genera: dividendos, recompras, deuda, adquisiciones e inversión. Claves para el inversor.',
  },
  {
    slug: 'como-analizar-una-empresa-de-consumo-defensivo',
    title: 'Cómo analizar una empresa de consumo defensivo',
    description: 'Guía para analizar empresas de consumo defensivo (alimentos, bebidas, tabaco, hogar): ingresos, márgenes, flujo de caja, dividendos y deuda.',
  },
];

export const BENCHMARK_CONSUMER_DEFENSIVE = [
  { ticker: 'KO', name: 'The Coca-Cola Company' },
  { ticker: 'PEP', name: 'PepsiCo, Inc.' },
  { ticker: 'PG', name: 'The Procter & Gamble Company' },
  { ticker: 'COST', name: 'Costco Wholesale Corporation' },
  { ticker: 'WMT', name: 'Walmart Inc.' },
  { ticker: 'MDLZ', name: 'Mondelez International, Inc.' },
  { ticker: 'PM', name: 'Philip Morris International Inc.' },
  { ticker: 'MO', name: 'Altria Group, Inc.' },
  { ticker: 'CL', name: 'Colgate-Palmolive Company' },
  { ticker: 'KHC', name: 'The Kraft Heinz Company' },
  { ticker: 'GIS', name: 'General Mills, Inc.' },
  { ticker: 'STZ', name: 'Constellation Brands, Inc.' },
  { ticker: 'HSY', name: 'The Hershey Company' },
  { ticker: 'KR', name: 'The Kroger Co.' },
  { ticker: 'ADM', name: 'Archer-Daniels-Midland Company' },
  { ticker: 'EL', name: 'The Estee Lauder Companies Inc.' },
  { ticker: 'TAP', name: 'Molson Coors Beverage Company' },
  { ticker: 'CAG', name: 'Conagra Brands, Inc.' },
  { ticker: 'TSN', name: 'Tyson Foods, Inc.' },
  { ticker: 'CLX', name: 'The Clorox Company' },
  { ticker: 'CHD', name: 'Church & Dwight Co., Inc.' },
  { ticker: 'SJM', name: 'The J. M. Smucker Company' },
  { ticker: 'MKC', name: 'McCormick & Company, Incorporated' },
  { ticker: 'CPB', name: 'Campbell Soup Company' },
  { ticker: 'HRL', name: 'Hormel Foods Corporation' },
  { ticker: 'KVUE', name: 'Kenvue Inc.' },
  { ticker: 'DG', name: 'Dollar General Corporation' },
  { ticker: 'DLTR', name: 'Dollar Tree, Inc.' },
];

const LOWER_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'y', 'of', 'the', 'and']);

function titleCaseName(name) {
  const words = String(name ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return words
    .map((word, index) => {
      if (index > 0 && LOWER_WORDS.has(word)) return word;
      return word
        .split(/(-)/)
        .map((part) => (part === '-' ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join('');
    })
    .join(' ');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

const esNumber = new Intl.NumberFormat('es-ES');

function formatUsdMillions(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return `${esNumber.format(Math.round(num / 1e6))} M$`;
}

function formatUsdShare(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)} $`;
}

function readTemplate(fileName) {
  const cached = templatesCache.get(fileName);
  if (cached) return cached;
  const html = fs.readFileSync(path.join(PUBLIC_DIR, fileName), 'utf8');
  templatesCache.set(fileName, html);
  return html;
}

function readGuide(fileName) {
  const cached = guidesCache.get(fileName);
  if (cached) return cached;
  const html = fs.readFileSync(path.join(GUIDES_DIR, fileName), 'utf8');
  guidesCache.set(fileName, html);
  return html;
}

function replaceTokens(html) {
  return html.replaceAll('{{SITE_URL}}', config.siteUrl);
}

function setMetaTag(html, pattern, replacement) {
  if (!pattern.test(html)) return html;
  return html.replace(pattern, replacement);
}

function buildCompanyDescription(profile, name) {
  const sectorPart = profile.sector && profile.sector !== '—' ? ` del sector ${profile.sector.toLowerCase()}` : '';
  const exchangePart = profile.exchange ? ` Cotiza en ${profile.exchange}.` : '';
  const filingPart = profile.lastFiling?.form
    ? ` Consulta sus informes ${profile.lastFiling.form} presentados ante la SEC.`
    : '';
  return `Perfil y análisis de ${name}${sectorPart}: resultados de sus informes 10-Q y 10-K ante la SEC, con análisis con IA de ventas, flujo de caja libre y asignación de capital.${exchangePart}${filingPart}`;
}

function buildCompanyJsonLd(meta, profile) {
  const corporationId = `${meta.url}/#corporation`;
  const breadcrumbId = `${meta.url}/#breadcrumb`;
  const faqId = `${meta.url}/#faq`;
  const corporation = {
    '@type': 'Corporation',
    '@id': corporationId,
    name: meta.name,
    alternateName: meta.ticker,
    description: meta.description,
    url: meta.url,
    tickerSymbol: meta.ticker,
    logo: `${config.siteUrl}/logo-cifra.png`,
    identifier: {
      '@type': 'PropertyValue',
      name: 'Ticker',
      value: meta.ticker,
    },
    knowsAbout: [
      'Análisis fundamental',
      'Informes 10-Q y 10-K',
      'SEC EDGAR',
      'Flujo de caja libre',
      'Asignación de capital',
    ],
  };
  if (profile.sector && profile.sector !== '—') corporation.sector = profile.sector;
  if (profile.industry) corporation.industry = profile.industry;
  if (profile.country && profile.country !== '—') corporation.countryOfOrigin = profile.country;
  if (profile.cik) {
    corporation.sameAs = [
      `https://www.sec.gov/edgar/browse/?CIK=${profile.cik}`,
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${Number(profile.cik)}`,
    ];
  }
  if (profile.lastFiling?.form) {
    corporation.subjectOf = {
      '@type': 'CreativeWork',
      name: `${profile.lastFiling.form} de ${meta.name}`,
      datePublished: profile.lastFiling.filedAt ?? undefined,
    };
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      corporation,
      {
        '@type': 'WebPage',
        '@id': `${meta.url}/#webpage`,
        url: meta.url,
        name: meta.title,
        description: meta.description,
        inLanguage: 'es',
        isPartOf: { '@id': `${config.siteUrl}/#website` },
        mainEntity: { '@id': corporationId },
        breadcrumb: { '@id': breadcrumbId },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': breadcrumbId,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Cifra', item: `${config.siteUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Empresas', item: `${config.siteUrl}/empresa` },
          { '@type': 'ListItem', position: 3, name: `${meta.ticker} · ${meta.name}`, item: meta.url },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': faqId,
        mainEntity: [
          {
            '@type': 'Question',
            name: `¿Qué actividad tiene ${meta.name} y en qué sector cotiza?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `${meta.name} (${meta.ticker}) cotiza en ${profile.exchange || 'la bolsa de EE. UU.'} y opera en la industria de ${profile.industry || profile.sector || 'consumo defensivo'} del sector de consumo defensivo según la clasificación oficial de SEC EDGAR.`,
            },
          },
          {
            '@type': 'Question',
            name: `¿Dónde consultar los informes 10-Q y 10-K oficiales de ${meta.ticker}?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Los informes 10-Q (trimestrales) y 10-K (anuales) de ${meta.name} se presentan ante la SEC bajo el CIK ${profile.cik}. En Cifra puedes consultar el histórico directo de filings oficiales de EDGAR y análisis financieros estructurados con IA.`,
            },
          },
          {
            '@type': 'Question',
            name: `¿Cómo analiza Cifra los resultados financieros de ${meta.name}?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Cifra examina los informes oficiales de ${meta.name} (${meta.ticker}) extrayendo ingresos, beneficio operativo, beneficio neto, flujo de caja libre (FCF), dividendos, recompras de acciones y deuda en dos horizontes temporales para ayudar a los inversores en su toma de decisiones.`,
            },
          },
        ],
      },
    ],
  };
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

function secDocumentUrl(cik, accession, primaryDocument) {
  if (!accession || !primaryDocument) return null;
  const clean = String(accession).replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${clean}/${primaryDocument}`;
}

async function loadPublicReportsForTicker(ticker) {
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
  }));
}

async function getCompanySeoContent(ticker) {
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

function botContentWrap(inner) {
  return `<style>${BOT_CONTENT_STYLE}</style>\n<details id="seo-contenido">\n<summary>Resumen público y fuentes de Cifra</summary>\n<div class="seo-content-body">\n${inner}\n</div>\n</details>`;
}

function guideListLinks() {
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
    for (const report of content.publicReports) {
      const label = `Informe ${report.formType ?? ''} ${report.periodTitle ? `— ${report.periodTitle}` : ''}`.trim();
      parts.push(`<li><a href="${site}/informe/${report.id}">${escapeHtml(label)}</a> (<a href="${site}/informe/${report.id}.md">Markdown</a>)</li>`);
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

async function getFeaturedCompanies(limit = 8) {
  const hasLimit = Number.isInteger(limit) && limit > 0;
  let dbCompanies = [];
  try {
    const rows = await query(
      `SELECT ticker, MAX(company_name) AS company_name, MAX(lastmod) AS lastmod
         FROM (
            SELECT ticker, company_name, created_at AS lastmod FROM analyses WHERE is_public = true AND status = 'done' AND ticker IS NOT NULL
            UNION ALL
            SELECT ticker, company_name, created_at AS lastmod FROM analyses WHERE ticker IS NOT NULL
            UNION ALL
            SELECT ticker, company_name, COALESCE(created_at, filed_at::timestamptz, now()) AS lastmod FROM filings
          ) t
         WHERE ticker ~ '^[A-Za-z0-9.-]{1,10}$'
         GROUP BY ticker
         ORDER BY lastmod DESC`,
    );
    dbCompanies = rows.rows.map((row) => ({
      ticker: String(row.ticker).toUpperCase(),
      name: titleCaseName(row.company_name),
    }));
  } catch {
    dbCompanies = [];
  }

  const seen = new Set();
  const merged = [];
  for (const c of dbCompanies) {
    if (!seen.has(c.ticker)) {
      seen.add(c.ticker);
      merged.push(c);
    }
  }
  for (const c of BENCHMARK_CONSUMER_DEFENSIVE) {
    if (!seen.has(c.ticker)) {
      seen.add(c.ticker);
      merged.push({ ticker: c.ticker, name: titleCaseName(c.name) });
    }
  }

  return hasLimit ? merged.slice(0, limit) : merged;
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
  parts.push('<h3>¿Qué es un informe 10-Q?</h3><p>El 10-Q es el informe financiero trimestral que las empresas cotizadas de Estados Unidos presentan ante la SEC, con la cuenta de resultados, el balance y el flujo de caja del trimestre. Puedes ampliarlo en la guía <a href="' + site + '/guias/que-es-un-informe-10-q">qué es un informe 10-Q y cómo leerlo</a>.</p>');
  parts.push('<h3>¿Qué es un informe 10-K?</h3><p>El 10-K es el informe anual auditado de las empresas de Estados Unidos, la fuente primaria del análisis fundamental. Detalles en la guía <a href="' + site + '/guias/que-es-un-informe-10-k">qué es un informe 10-K</a>.</p>');
  parts.push('<h3>¿Qué es un informe 8-K y por qué es clave?</h3><p>El 8-K es el informe de hechos relevantes de la SEC donde las empresas registran sus notas de prensa y presentaciones a inversores con el guidance anual. Detalles en la guía <a href="' + site + '/guias/que-es-un-informe-8-k">qué es un informe 8-K</a>.</p>');
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

async function buildFeaturedItemList(name, url, limit) {
  let companies = [];
  try {
    companies = await getFeaturedCompanies(limit);
  } catch {
    companies = [];
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url,
    numberOfItems: companies.length,
    itemListElement: companies.map((company, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Corporation',
        name: company.name ?? company.ticker,
        tickerSymbol: company.ticker,
        url: `${config.siteUrl}/empresa/${encodeURIComponent(company.ticker)}`,
      },
    })),
  };
}

export async function getHomeJsonLd() {
  return buildFeaturedItemList('Empresas analizadas en Cifra', `${config.siteUrl}/`, 8);
}

export async function getCompaniesJsonLd() {
  return buildFeaturedItemList('Empresas de consumo defensivo de EE. UU. en Cifra', `${config.siteUrl}/empresa`, 28);
}

export function jsonLdScript(obj) {
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}

function injectCompanyMeta(html, meta) {
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

function applyNoIndex(html) {
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
  html = withAnalytics(html);
  if (botContent) {
    html = html.replace(/<body([^>]*)>/, `<body$1>\n${botContent}`);
  }
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', cacheControl);
  if (noIndex) res.set('X-Robots-Tag', 'noindex, follow');
  res.send(html);
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
  res.send(withAnalytics(out));
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

async function loadPublicReportRow(id) {
  const rows = await query(
    `SELECT id, ticker, company_name, period_end, pdf_url, source_url, accession, created_at, report
       FROM analyses
       WHERE id = $1 AND is_public = true AND status = 'done'
      LIMIT 1`,
    [id],
  );
  return rows.rows[0] ?? null;
}

function reportSalesRow(row) {
  const actual = row.isAdjusted ? (row.adjusted ?? row.normal) : row.normal;
  const previous = row.isAdjusted ? (row.prevAdjusted ?? row.prevNormal) : row.prevNormal;
  const variation = row.isAdjusted ? (row.pctAdjusted ?? row.pctNormal) : (row.pctNormal ?? null);
  return `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(actual ?? '—')}${row.isAdjusted && row.adjustedNote ? ` ${escapeHtml(row.adjustedNote)}` : ''}</td><td>${escapeHtml(previous ?? '—')}</td><td>${escapeHtml(variation ?? '—')}</td></tr>`;
}

function horizonsHtml(report) {
  const sections = [];
  for (const horizon of report.horizons ?? []) {
    const blocks = [];
    blocks.push(`<h2>${escapeHtml(horizon.label ?? 'Análisis')}</h2>`);

    if (horizon.sales?.rows?.length) {
      blocks.push(`<h3>Ventas y cuenta de resultados</h3>`);
      if (horizon.sales.eps) blocks.push(`<p><strong>Beneficio por acción (EPS):</strong> ${escapeHtml(horizon.sales.eps)}</p>`);
      blocks.push('<table><thead><tr><th scope="col">Concepto</th><th scope="col">Actual</th><th scope="col">Anterior</th><th scope="col">Variación</th></tr></thead><tbody>');
      blocks.push(horizon.sales.rows.map(reportSalesRow).join('\n'));
      blocks.push('</tbody></table>');
      if (horizon.sales.shares) blocks.push(`<p><strong>Acciones:</strong> ${escapeHtml(horizon.sales.shares)}</p>`);
      if (horizon.sales.notes?.length) {
        blocks.push(`<ul class="seo-notes">${horizon.sales.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`);
      }
    }

    if (horizon.cashFlow?.rows?.length) {
      blocks.push('<h3>Flujo de caja</h3>');
      blocks.push('<table><thead><tr><th scope="col">Concepto</th><th scope="col">Normal</th><th scope="col">Ajustado</th></tr></thead><tbody>');
      blocks.push(horizon.cashFlow.rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.values?.[0] ?? '—')}</td><td>${escapeHtml(row.values?.[1] ?? '—')}</td></tr>`).join('\n'));
      blocks.push('</tbody></table>');
      if (horizon.cashFlow.scenarios?.length) {
        blocks.push(`<p><strong>Escenarios:</strong> ${escapeHtml(horizon.cashFlow.scenarios.join(' · '))}</p>`);
      }
      if (horizon.cashFlow.notes?.length) {
        blocks.push(`<ul class="seo-notes">${horizon.cashFlow.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`);
      }
    }

    if (horizon.capital?.rows?.length) {
      blocks.push('<h3>Asignación de capital</h3>');
      blocks.push('<table><thead><tr><th scope="col">Concepto</th><th scope="col">Importe</th></tr></thead><tbody>');
      blocks.push(horizon.capital.rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.value ?? '—')}</td></tr>`).join('\n'));
      blocks.push('</tbody></table>');
      if (horizon.capital.verification) blocks.push(`<p><strong>Verificación:</strong> ${escapeHtml(horizon.capital.verification)}</p>`);
      if (horizon.capital.notes?.length) {
        blocks.push(`<ul class="seo-notes">${horizon.capital.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`);
      }
    }
    sections.push(blocks.join('\n'));
  }
  return sections.join('\n');
}

function conclusionHtml(report) {
  const conclusion = report.conclusion;
  if (!conclusion || typeof conclusion !== 'object') return '';
  const blocks = [];
  blocks.push('<h2>Conclusiones</h2>');
  const sectionTitles = {
    debt: 'Deuda',
    outlook: 'Perspectivas de la dirección',
    repurchases: 'Recompras de acciones',
    acquisitions: 'Adquisiciones',
  };
  for (const [key, title] of Object.entries(sectionTitles)) {
    const item = conclusion[key];
    if (item?.text) {
      blocks.push(`<h3>${escapeHtml(title)}</h3><p>${escapeHtml(item.text)}</p>`);
    }
  }
  if (conclusion.watchlist?.items?.length) {
    blocks.push('<h3>Lista de seguimiento</h3><ul>');
    for (const item of conclusion.watchlist.items) {
      blocks.push(`<li>${escapeHtml(String(item).replace(/^\d+:\s*/, ''))}</li>`);
    }
    blocks.push('</ul>');
  }
  return blocks.join('\n');
}

function buildReportJsonLd(meta, row) {
  const publishedAt = new Date(row.created_at).toISOString();
  const sourceUrl = safeHttpUrl(row.source_url);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${meta.url}/#article`,
        headline: meta.title.split(' | ')[0],
        description: meta.description,
        datePublished: publishedAt,
        dateModified: publishedAt,
        inLanguage: 'es',
        author: { '@type': 'Organization', name: 'Cifra', url: `${config.siteUrl}/` },
        publisher: {
          '@type': 'Organization',
          name: SITE_NAME,
          alternateName: 'Cifra Research',
          url: `${config.siteUrl}/`,
          logo: { '@type': 'ImageObject', url: `${config.siteUrl}/logo-cifra.png`, width: 512, height: 512 },
        },
        image: `${config.siteUrl}/og-cifra.png`,
        mainEntityOfPage: meta.url,
        ...(sourceUrl ? {
          isBasedOn: {
            '@type': 'DigitalDocument',
            name: `Informe ${meta.formType} de ${meta.name}`,
            url: sourceUrl,
            publisher: { '@type': 'Organization', name: 'SEC' },
          },
          citation: sourceUrl,
        } : {}),
        about: {
          '@type': 'Corporation',
          name: meta.company,
          tickerSymbol: meta.ticker,
          url: `${config.siteUrl}/empresa/${encodeURIComponent(meta.ticker)}`,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Cifra', item: `${config.siteUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Empresas', item: `${config.siteUrl}/empresa` },
          { '@type': 'ListItem', position: 3, name: `${meta.ticker}`, item: `${config.siteUrl}/empresa/${encodeURIComponent(meta.ticker)}` },
          { '@type': 'ListItem', position: 4, name: `Informe ${meta.formType}`, item: meta.url },
        ],
      },
    ],
  };
}

async function loadPublicReportsForSitemap() {
  const rows = await query(
    `SELECT id, created_at FROM analyses
      WHERE is_public = true AND status = 'done'
      ORDER BY created_at DESC`,
  );
  return rows.rows;
}

function buildReportPage(row) {
  const report = row.report ?? {};
  const ticker = String(row.ticker ?? report.ticker ?? '').toUpperCase();
  const company = report.company ?? row.company_name ?? ticker;
  const name = titleCaseName(company);
  const formType = report.formType ?? '';
  const isAnnual = report.isAnnual === true || formType === '10-K';
  const fyLabel = isAnnual ? `FY ${report.fiscalYear ?? ''}` : `Q${report.fiscalQuarter ?? ''} ${report.fiscalYear ?? ''}`;
  const url = `${config.siteUrl}/informe/${row.id}`;
  const title = `Informe ${formType} de ${name} (${ticker}) — ${fyLabel} | ${SITE_NAME}`;
  const description = `Resultados de ${name} (${ticker}) en su informe ${formType} ${fyLabel.trim()}: ventas, beneficio operativo, flujo de caja libre, dividendos, recompras y deuda, con el análisis financiero de Cifra.`;

  const meta = {
    id: row.id,
    ticker,
    company,
    name,
    formType,
    cik: null,
    url,
    title,
    description,
    sourceUrl: safeHttpUrl(row.source_url),
    publishedAt: new Date(row.created_at).toISOString(),
  };
  const jsonLd = buildReportJsonLd(meta, row);

  const blocks = [];
  blocks.push(`<p class="guia-meta">Informe ${escapeHtml(formType)} · ${escapeHtml(fyLabel.trim())} · ${escapeHtml(company)} (${escapeHtml(ticker)}) · publicado el ${escapeHtml(meta.publishedAt.slice(0, 10))}</p>`);
  blocks.push(`<h1>Resultados ${escapeHtml(formType)} de ${escapeHtml(name)} (${escapeHtml(ticker)})</h1>`);
  blocks.push(`<p>${escapeHtml(description)}</p>`);
  blocks.push(meta.sourceUrl
    ? `<p class="guia-source">Fuente primaria: <a href="${escapeHtml(meta.sourceUrl)}" rel="noopener">filing oficial en SEC EDGAR</a>. El análisis de Cifra organiza los datos y no sustituye la revisión del documento original.</p>`
    : '<p class="guia-source">Fuente primaria: SEC EDGAR. Revisa siempre el filing oficial antes de tomar una decisión.</p>');

  if (report.rating?.label) {
    blocks.push(`<p class="guia-rating"><strong>${escapeHtml(report.rating.label)}</strong>${report.rating.rationale ? ` — ${escapeHtml(report.rating.rationale)}` : ''}</p>`);
  }

  const horizons = horizonsHtml(report);
  if (horizons) blocks.push(horizons);
  const conclusion = conclusionHtml(report);
  if (conclusion) blocks.push(conclusion);

  if (row.pdf_url) {
    blocks.push(`<p><a class="guia-cta" href="${escapeHtml(config.siteUrl + row.pdf_url)}">Descargar el informe completo en PDF</a> <a class="guia-cta" style="background:#334155;margin-left:8px;" href="${escapeHtml(url)}.md">Versión Markdown (GEO)</a></p>`);
  } else {
    blocks.push(`<p><a class="guia-cta" style="background:#334155;" href="${escapeHtml(url)}.md">Consultar informe en formato Markdown (GEO)</a></p>`);
  }

  blocks.push('<h2>Seguir leyendo</h2>');
  blocks.push(`<ul><li><a href="${config.siteUrl}/empresa/${encodeURIComponent(ticker)}">Ficha de ${escapeHtml(name)} (${escapeHtml(ticker)})</a></li><li><a href="${config.siteUrl}/guias/que-es-un-informe-${formType === '10-K' ? '10-k' : '10-q'}">¿Qué es un informe ${formType}?</a></li><li><a href="${config.siteUrl}/guias/que-es-el-flujo-de-caja-libre">¿Qué es el flujo de caja libre?</a></li><li><a href="${config.siteUrl}/guias">Todas las guías</a></li></ul>`);

  blocks.push('<p class="guia-disclaimer">Análisis generado con IA a partir del informe oficial presentado ante la SEC. Con fines informativos: no constituye asesoramiento financiero ni recomendación de inversión. Verifica siempre los datos en las fuentes oficiales.</p>');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#1e293b">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="alternate" type="text/markdown" href="${escapeHtml(url)}.md" title="Versión Markdown para IA">
  <link rel="alternate" type="text/plain" href="{{SITE_URL}}/llms.txt" title="Resumen para modelos de lenguaje (LLMs)">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="es_ES">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(DEFAULT_OG_IMAGE)}">
  <meta property="og:image:alt" content="Cifra — análisis de resultados financieros con IA">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(DEFAULT_OG_IMAGE)}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>
  <link rel="stylesheet" href="/guia.css">
</head>
<body>
  <div class="guia-wrap">
    <header class="guia-header">
      <a class="guia-brand" href="{{SITE_URL}}/"><span class="guia-brand-mark" aria-hidden="true">▲</span> Cifra</a>
      <nav class="guia-nav"><a href="{{SITE_URL}}/guias">Guías</a><a href="{{SITE_URL}}/empresa">Empresas</a></nav>
    </header>
    <main class="guia-main guia-article">
${blocks.join('\n')}
    </main>
    <footer class="guia-footer"><a href="{{SITE_URL}}/">Cifra — análisis de informes 10-Q y 10-K con IA</a></footer>
  </div>
</body>
</html>`;
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

  const html = buildReportPage(row);
  reportCache.set(cleanId, { data: html, at: Date.now() });
  return html;
}

export function serve404Page(res) {
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Página no encontrada | Cifra</title><meta name="robots" content="noindex, follow"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif}a{color:#34d399}</style></head><body><div><h1>Página no encontrada</h1><p>El contenido que buscas no existe o ya no está disponible.</p><p><a href="/">Volver al inicio</a></p></div></body></html>`;
  res.status(404);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('X-Robots-Tag', 'noindex, follow');
  res.send(replaceTokens(html));
}

function getGuideLastmod(slug) {
  try {
    const stats = fs.statSync(path.join(GUIDES_DIR, `${slug}.html`));
    return stats.mtime.toISOString();
  } catch {
    return null;
  }
}

export async function getCompanyMarkdown(ticker) {
  const meta = await buildCompanyMeta(ticker);
  if (!meta) return null;
  const content = await getCompanySeoContent(meta.ticker);
  const site = config.siteUrl;
  const lines = [];

  lines.push(`# ${meta.name} (${meta.ticker}) — Análisis Financiero y Resultados SEC`);
  lines.push('');
  lines.push(`> Fuente oficial primaria: SEC EDGAR (CIK: ${meta.cik ?? 'n/d'}). Cotiza en ${meta.exchange ?? 'Bolsa de EE. UU.'}.`);
  if (meta.sector) lines.push(`> Sector: ${meta.sector}${meta.industry ? ` · Industria: ${meta.industry}` : ''}`);
  lines.push(`> URL Canónica: ${meta.url}`);
  lines.push('');
  lines.push('## Perfil del Negocio');
  lines.push('');
  lines.push(meta.description);
  lines.push('');

  if (content.annual.length) {
    const latest = content.annual[0];
    const rev = formatUsdMillions(latest.revenue);
    const net = formatUsdMillions(latest.netIncome);
    const fcf = formatUsdMillions(latest.freeCashFlow);
    const eps = formatUsdShare(latest.epsDiluted);
    const fcfMargin = latest.revenue && latest.freeCashFlow ? Math.round((Number(latest.freeCashFlow) / Number(latest.revenue)) * 100) : null;
    lines.push('## Resumen Financiero Ejecutivo');
    lines.push('');
    lines.push(`En su ejercicio fiscal más reciente (${latest.year}), ${meta.name} reportó ventas de ${rev ?? '—'}${net ? `, beneficio neto de ${net}` : ''}${fcf ? ` y un flujo de caja libre (FCF) de ${fcf}` : ''}${fcfMargin !== null ? ` (margen FCF del ${fcfMargin}%)` : ''}${eps ? ` (beneficio por acción diluido de ${eps})` : ''}.`);
    lines.push('');
    lines.push('## Resultados Financieros Anuales (Últimos Ejercicios)');
    lines.push('');
    lines.push('| Ejercicio | Ventas (Revenue) | Beneficio Neto | Flujo de Caja Libre (FCF) | EPS Diluido |');
    lines.push('|---|---|---|---|---|');
    for (const row of content.annual) {
      lines.push(`| ${row.year} | ${formatUsdMillions(row.revenue) ?? '—'} | ${formatUsdMillions(row.netIncome) ?? '—'} | ${formatUsdMillions(row.freeCashFlow) ?? '—'} | ${formatUsdShare(row.epsDiluted) ?? '—'} |`);
    }
    lines.push('');
  }

  if (content.filings.length) {
    lines.push('## Informes 10-Q y 10-K Presentados ante la SEC');
    lines.push('');
    for (const f of content.filings) {
      const period = filingPeriodLabel(f.form, f.period);
      const url = f.documentUrl ?? `https://www.sec.gov/edgar/browse/?CIK=${meta.cik}`;
      lines.push(`- [${f.form} (${period || f.filedAt})](${url}) — Presentado el ${f.filedAt}`);
    }
    lines.push('');
  }

  if (content.publicReports.length) {
    lines.push('## Informes Analizados con IA en Cifra');
    lines.push('');
    for (const r of content.publicReports) {
      lines.push(`- [Informe ${r.formType} ${r.periodTitle ?? ''}](${site}/informe/${r.id}) ([Markdown](${site}/informe/${r.id}.md))`);
    }
    lines.push('');
  }

  lines.push('## Preguntas Frecuentes');
  lines.push('');
  lines.push(`### ¿En qué sector e industria opera ${meta.name}?`);
  lines.push(`${meta.name} (${meta.ticker}) cotiza en ${meta.exchange ?? 'la bolsa de EE. UU.'} y opera en la industria de ${meta.industry ?? meta.sector ?? 'consumo defensivo'} (sector consumo defensivo en SEC EDGAR).`);
  lines.push('');
  lines.push(`### ¿Dónde consultar los filings oficiales de ${meta.ticker}?`);
  lines.push(`En el sistema oficial SEC EDGAR bajo el CIK ${meta.cik} (https://www.sec.gov/edgar) o en la ficha interactiva de Cifra (${meta.url}).`);
  lines.push('');

  lines.push('## Cita y Atribución');
  lines.push('');
  lines.push(`Datos extraídos de SEC EDGAR. Análisis estructurado por Cifra (${site}). Con fines exclusivamente informativos.`);

  return lines.join('\n');
}

export async function getPublicReportMarkdown(id) {
  const cleanId = Number(id);
  if (!Number.isInteger(cleanId) || cleanId <= 0) return null;
  let row = null;
  try {
    row = await loadPublicReportRow(cleanId);
  } catch {
    row = null;
  }
  if (!row) return null;

  const report = row.report ?? {};
  const ticker = String(row.ticker ?? report.ticker ?? '').toUpperCase();
  const company = report.company ?? row.company_name ?? ticker;
  const name = titleCaseName(company);
  const formType = report.formType ?? '';
  const isAnnual = report.isAnnual === true || formType === '10-K';
  const fyLabel = isAnnual ? `FY ${report.fiscalYear ?? ''}` : `Q${report.fiscalQuarter ?? ''} ${report.fiscalYear ?? ''}`;
  const site = config.siteUrl;

  const lines = [];
  lines.push(`# Informe ${formType} de ${name} (${ticker}) — ${fyLabel}`);
  lines.push('');
  lines.push(`> Empresa: ${name} (${ticker})`);
  lines.push(`> Formulario: ${formType} · Periodo: ${fyLabel.trim()}`);
  lines.push(`> Fecha de publicación: ${new Date(row.created_at).toISOString().slice(0, 10)}`);
  if (row.source_url) lines.push(`> Fuente oficial: [SEC EDGAR Filing](${row.source_url})`);
  if (row.pdf_url) lines.push(`> Descargar PDF: ${site}${row.pdf_url}`);
  lines.push(`> URL Canónica: ${site}/informe/${row.id}`);
  lines.push('');

  if (report.rating?.label) {
    lines.push(`**Calificación Cifra:** ${report.rating.label}${report.rating.rationale ? ` — ${report.rating.rationale}` : ''}`);
    lines.push('');
  }

  for (const horizon of report.horizons ?? []) {
    lines.push(`## ${horizon.label ?? 'Análisis'}`);
    lines.push('');
    if (horizon.sales?.rows?.length) {
      lines.push('### Ventas y Cuenta de Resultados');
      if (horizon.sales.eps) lines.push(`- **BPA / EPS:** ${horizon.sales.eps}`);
      if (horizon.sales.shares) lines.push(`- **Acciones en circulación:** ${horizon.sales.shares}`);
      lines.push('');
      lines.push('| Concepto | Actual | Anterior | Variación |');
      lines.push('|---|---|---|---|');
      for (const r of horizon.sales.rows) {
        const act = r.isAdjusted ? (r.adjusted ?? r.normal) : r.normal;
        const prev = r.isAdjusted ? (r.prevAdjusted ?? r.prevNormal) : r.prevNormal;
        const varPct = r.isAdjusted ? (r.pctAdjusted ?? r.pctNormal) : (r.pctNormal ?? '—');
        lines.push(`| ${r.name} | ${act ?? '—'} | ${prev ?? '—'} | ${varPct ?? '—'} |`);
      }
      lines.push('');
    }
    if (horizon.cashFlow?.rows?.length) {
      lines.push('### Flujo de Caja');
      lines.push('');
      lines.push('| Concepto | Normal | Ajustado |');
      lines.push('|---|---|---|');
      for (const r of horizon.cashFlow.rows) {
        lines.push(`| ${r.name} | ${r.values?.[0] ?? '—'} | ${r.values?.[1] ?? '—'} |`);
      }
      lines.push('');
      if (horizon.cashFlow.scenarios?.length) {
        lines.push(`**Escenarios:** ${horizon.cashFlow.scenarios.join(' · ')}`);
        lines.push('');
      }
    }
    if (horizon.capital?.rows?.length) {
      lines.push('### Asignación de Capital');
      lines.push('');
      lines.push('| Concepto | Importe |');
      lines.push('|---|---|');
      for (const r of horizon.capital.rows) {
        lines.push(`| ${r.name} | ${r.value ?? '—'} |`);
      }
      lines.push('');
      if (horizon.capital.verification) {
        lines.push(`**Verificación:** ${horizon.capital.verification}`);
        lines.push('');
      }
    }
  }

  if (report.conclusion && typeof report.conclusion === 'object') {
    lines.push('## Conclusiones');
    lines.push('');
    const c = report.conclusion;
    if (c.debt?.text) lines.push(`### Deuda\n${c.debt.text}\n`);
    if (c.outlook?.text) lines.push(`### Perspectivas de la Dirección\n${c.outlook.text}\n`);
    if (c.repurchases?.text) lines.push(`### Recompras de Acciones\n${c.repurchases.text}\n`);
    if (c.acquisitions?.text) lines.push(`### Adquisiciones\n${c.acquisitions.text}\n`);
    if (c.watchlist?.items?.length) {
      lines.push('### Lista de Seguimiento (Watchlist)');
      for (const item of c.watchlist.items) {
        lines.push(`- ${String(item).replace(/^\d+:\s*/, '')}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(`*Análisis generado con IA por Cifra (${site}) a partir de la fuente primaria en SEC EDGAR. Fines informativos, no constituye recomendación de inversión.*`);

  return lines.join('\n');
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

let llmsFullCache = { text: null, at: 0 };
const LLMS_FULL_TTL = 30 * 60 * 1000;

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

  for (const report of publicReports) {
    urls.push({
      loc: `${config.siteUrl}/informe/${report.id}`,
      priority: '0.6',
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
