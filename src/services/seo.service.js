import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../../config/index.js';
import { query } from '../../db/pool.js';
import { getCompanySeoProfile, getCompanyResults, filingPeriodLabel } from './edgar.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const GUIDES_DIR = path.join(__dirname, '..', 'content', 'guias');
const LEGAL_DIR = path.join(__dirname, '..', 'content', 'legal');

const SITE_NAME = 'Cifra';
const GA_MEASUREMENT_ID = 'G-7PSC9M3B1H';

function withAnalytics(html) {
  if (config.siteUrl !== 'https://cifraresearch.com') return html;
  const snippet = `  <!-- Google tag (gtag.js) con Consent Mode v2 -->
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      wait_for_update: 500
    });
    try {
      if (window.localStorage.getItem('cifra_cookie_consent_v1') === 'granted') {
        gtag('consent', 'update', { analytics_storage: 'granted' });
      }
    } catch (error) { /* almacenamiento no disponible */ }
  </script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
  <script>
    gtag('js', new Date());
    gtag('config', '${GA_MEASUREMENT_ID}');
  </script>
`;
  return html.replace('</head>', `${snippet}</head>`);
}

function withCompliance(html) {
  let out = html;
  if (!out.includes('/cookies.js')) {
    out = out.replace('</body>', '  <script src="/cookies.js?v=1" defer></script>\n</body>');
  }
  return withAnalytics(out);
}
const DEFAULT_OG_IMAGE = `${config.siteUrl}/og-cifra.png`;

const templatesCache = new Map();
const guidesCache = new Map();
const legalCache = new Map();
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

export const LEGAL_PAGES = [
  { slug: 'aviso-legal', title: 'Aviso legal', description: 'Identificación del titular, condiciones de uso y responsabilidad del sitio web de Cifra.' },
  { slug: 'privacidad', title: 'Política de privacidad', description: 'Qué datos personales recoge Cifra, con qué finalidad, durante cuánto tiempo y cómo ejercer tus derechos.' },
  { slug: 'cookies', title: 'Política de cookies', description: 'Qué cookies y almacenamiento local usa Cifra, para qué sirven y cómo aceptarlas o rechazarlas.' },
  { slug: 'terminos', title: 'Términos de uso', description: 'Condiciones de uso del servicio Cifra: cuenta, límites de uso, propiedad intelectual y responsabilidad.' },
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

function readLegal(fileName) {
  const cached = legalCache.get(fileName);
  if (cached) return cached;
  const html = fs.readFileSync(path.join(LEGAL_DIR, fileName), 'utf8');
  legalCache.set(fileName, html);
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
  const secEdgarUrl = profile.cik
    ? `https://www.sec.gov/edgar/browse/?CIK=${profile.cik}`
    : 'https://www.sec.gov/edgar';

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
    isBasedOn: secEdgarUrl,
    citation: secEdgarUrl,
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
        isBasedOn: {
          '@type': 'DataFeed',
          name: 'SEC EDGAR (Electronic Data Gathering, Analysis, and Retrieval system)',
          url: secEdgarUrl,
          provider: {
            '@type': 'GovernmentOrganization',
            name: 'U.S. Securities and Exchange Commission',
            alternateName: 'SEC',
            url: 'https://www.sec.gov',
          },
        },
        citation: secEdgarUrl,
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
    slug: buildReportSlug(row),
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
  html = withCompliance(html);
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
  if (!year && (row?.period_end || row?.periodEnd)) {
    year = new Date(row.period_end || row.periodEnd).getUTCFullYear();
  }
  if (!year && (row?.created_at || row?.createdAt)) {
    year = new Date(row.created_at || row.createdAt).getUTCFullYear();
  }
  if (!year) year = new Date().getUTCFullYear();

  if (isAnnual) {
    return `${year}-10K`;
  }

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
    `SELECT id, ticker, company_name, period_end, pdf_url, source_url, accession, created_at, report
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
    `SELECT id, ticker, company_name, period_end, pdf_url, source_url, accession, created_at, report
       FROM analyses
       WHERE is_public = true AND status = 'done' AND UPPER(ticker) = $1
       ORDER BY created_at DESC, id DESC`,
    [cleanTicker],
  );
  if (!rows.rows.length) return null;

  // 1. Coincidencia exacta de slug generado
  for (const r of rows.rows) {
    if (buildReportSlug(r) === normSlug) {
      return r;
    }
  }

  // 2. Coincidencia de atajo sin año (ej. "Q3" o "10K" o "FY")
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

function getHighlightClassSsr(noteNumber) {
  const num = parseInt(noteNumber, 10);
  if (isNaN(num)) return 'highlight-c1';
  const palette = ['highlight-c1', 'highlight-c2', 'highlight-c3', 'highlight-c4', 'highlight-c5', 'highlight-c6'];
  return palette[(num - 1) % palette.length];
}

function renderNotesSsr(notes) {
  const list = (Array.isArray(notes) ? notes : []).filter(Boolean);
  if (!list.length) return '';
  return `<ul class="report-notes">${list.map((note) => {
    const raw = String(note ?? '');
    const match = raw.match(/^\*(\d+):?\s*([\s\S]*)$/);
    if (match) {
      const num = match[1];
      const cls = getHighlightClassSsr(num);
      return `<li><mark class="highlight-note ${cls}">*${escapeHtml(num)}:</mark> ${escapeHtml(match[2]).replaceAll('\n', '<br>')}</li>`;
    }
    return `<li>${escapeHtml(raw)}</li>`;
  }).join('')}</ul>`;
}

function renderTableSsr(headers, rows, metaRows = [], options = {}) {
  const thead = headers.map((header) => {
    const isBoldCol = header === 'Ajustado' || header === 'Normal' || header.startsWith('Ajustado') || header.startsWith('Normal');
    let content = escapeHtml(header);
    const noteMatch = String(header).match(/\*(\d+)/);
    if (noteMatch) {
      const noteNum = parseInt(noteMatch[1], 10);
      const colorCls = getHighlightClassSsr(noteNum);
      content = `<mark class="highlight-adjust ${colorCls}">${content}</mark>`;
    }
    const cls = isBoldCol ? ' class="cell-bold"' : '';
    return `<th${cls}>${content}</th>`;
  }).join('');

  const isSalesTable = headers.length === 7 && headers[1] === 'Ajustado' && headers[4] === 'Normal';
  const isCashFlowTable = headers.length === 3 && headers[0] === 'Métrica';
  const isCapitalTable = options.isCapital || (headers.length === 2 && headers[0] === 'Métrica' && headers[1] === 'Valor');

  const tbody = rows
    .map((row, rowIdx) => {
      const meta = metaRows[rowIdx] || {};
      const isRowAdjusted = isSalesTable && meta.isAdjusted === true;
      let noteNum = 1;
      const noteMatch = String(meta.adjustedNote || '').match(/\*?(\d+)/);
      if (noteMatch) noteNum = parseInt(noteMatch[1], 10);
      const colorCls = getHighlightClassSsr(noteNum);

      const cells = row.map((cell, colIdx) => {
        const header = headers[colIdx];
        const isBoldCol = header === 'Ajustado' || header === 'Normal' || header.startsWith('Ajustado') || header.startsWith('Normal');
        const isPctCol = header === '% Aj.' || header === '% N.' || header === '%';
        const isAdjustedCell = isSalesTable && colIdx === 1 && isRowAdjusted;
        const isTaxAdjustedCell = isCashFlowTable && colIdx === 2 && meta.cashFlowAdjustedNote;
        const isCapitalValCell = isCapitalTable && colIdx === 1;

        let classes = [];
        if (isBoldCol) classes.push('cell-bold');
        if (isPctCol && cell) {
          const str = String(cell).trim();
          if (str.startsWith('-')) classes.push('pct-negative');
          else if (str.startsWith('+') || /^[0-9]/.test(str)) classes.push('pct-positive');
        } else if (isCapitalValCell && cell) {
          const str = String(cell).trim();
          if (str.startsWith('-')) classes.push('pct-negative', 'cell-bold');
          else if (str.startsWith('+') || (/^[0-9]/.test(str) && str !== '0' && str !== '0,0' && str !== '0.0' && str !== '—')) {
            classes.push('pct-positive', 'cell-bold');
          }
        }

        let content = escapeHtml(cell ?? '—');
        if (isAdjustedCell) {
          content = `<mark class="highlight-adjust ${colorCls}">${content}</mark>`;
        } else if (isTaxAdjustedCell) {
          const taxNoteNum = String(meta.cashFlowAdjustedNote).replace(/\D/g, '') || '2';
          content = `<mark class="highlight-adjust ${getHighlightClassSsr(taxNoteNum)}">${content}</mark>`;
        } else if (colIdx === 0 && cell) {
          const cellNoteMatch = String(cell).match(/\*(\d+)/);
          if (cellNoteMatch) {
            const cellNoteNum = parseInt(cellNoteMatch[1], 10);
            content = `<mark class="highlight-adjust ${getHighlightClassSsr(cellNoteNum)}">${content}</mark>`;
          }
        }

        const clsAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
        return `<td${clsAttr}>${content}</td>`;
      }).join('');

      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

function renderHorizonSsr(horizon) {
  const label = escapeHtml(horizon.label ?? 'Periodo');
  let html = `<div class="report-block"><h5>${label}</h5>`;

  const sales = horizon.sales ?? {};
  if (Array.isArray(sales.rows) && sales.rows.length) {
    html += `<p class="report-extras">1. VENTAS</p>`;
    html += renderTableSsr(
      ['Métrica', 'Ajustado', 'Anterior Aj.', '% Aj.', 'Normal', 'Anterior N.', '% N.'],
      sales.rows.map((row) => [row.name, row.adjusted, row.prevAdjusted, row.pctAdjusted, row.normal, row.prevNormal, row.pctNormal]),
      sales.rows
    );
    const extras = [];
    if (sales.shares) extras.push(`ACCIONES: ${escapeHtml(sales.shares)}`);
    if (sales.eps) extras.push(`BPA: ${escapeHtml(sales.eps)}`);
    if (extras.length) html += `<p class="report-extras">${extras.join(' · ')}</p>`;
    html += renderNotesSsr(sales.notes);
  }

  const cashFlow = horizon.cashFlow ?? {};
  if (Array.isArray(cashFlow.rows) && cashFlow.rows.length) {
    html += `<p class="report-extras">2. CASH FLOW</p>`;
    let scenarios = Array.isArray(cashFlow.scenarios) && cashFlow.scenarios.length ? [...cashFlow.scenarios] : ['Normal', 'Ajustado'];
    if (scenarios.length === 1) scenarios = [scenarios[0], 'Ajustado'];
    html += renderTableSsr(
      ['Métrica', ...scenarios],
      cashFlow.rows.map((row) => {
        let vals = Array.isArray(row.values) && row.values.length ? [...row.values] : [row.value];
        if (vals.length === 1 && scenarios.length === 2) vals.push(vals[0]);
        return [row.name, ...vals];
      }),
      cashFlow.rows
    );
    const cfNotes = (Array.isArray(cashFlow.notes) ? cashFlow.notes : []).filter((n) => {
      const lower = String(n || '').toLowerCase();
      return !lower.includes('deducido del acumulado') && !lower.includes('flujo trimestral deducido');
    });
    html += renderNotesSsr(cfNotes);
  }

  const capital = horizon.capital ?? {};
  if (Array.isArray(capital.rows) && capital.rows.length) {
    html += `<p class="report-extras">3. ASIGNACIÓN DE CAPITAL</p>`;
    html += renderTableSsr(
      ['Métrica', 'Valor'],
      capital.rows.map((row) => [row.name, row.value]),
      [],
      { isCapital: true }
    );
    if (capital.verification) html += `<p class="report-extras">${escapeHtml(capital.verification)}</p>`;
    html += renderNotesSsr(capital.notes);
  }

  html += '</div>';
  return html;
}

function renderConclusionSsr(conclusion) {
  if (!conclusion || typeof conclusion !== 'object') return '';
  let html = `<div class="report-block"><h5>CONCLUSIONES Y OUTLOOK</h5>`;
  const sectionTitles = {
    debt: 'Deuda y vencimientos',
    outlook: 'Perspectivas (Outlook)',
    repurchases: 'Recompras de acciones',
    acquisitions: 'Adquisiciones y desinversiones',
  };
  for (const [key, title] of Object.entries(sectionTitles)) {
    const item = conclusion[key];
    if (item?.text) {
      html += `<p class="report-extras">${escapeHtml(title)}</p><p style="font-size:12px;line-height:1.5;color:var(--ink-secondary);">${escapeHtml(item.text)}</p>`;
    }
  }
  if (conclusion.watchlist?.items?.length) {
    html += `<p class="report-extras">Puntos clave en seguimiento</p><ul class="report-notes">`;
    for (const item of conclusion.watchlist.items) {
      html += `<li>${escapeHtml(String(item).replace(/^\d+:\s*/, ''))}</li>`;
    }
    html += `</ul>`;
  }
  html += '</div>';
  return html;
}

function renderReportSsrHtml(report) {
  const horizons = Array.isArray(report.horizons) ? report.horizons : [];
  let html = horizons.map(renderHorizonSsr).join('');
  if (report.conclusion) {
    html += renderConclusionSsr(report.conclusion);
  }
  if (report.rating?.label) {
    html += `<div class="report-block"><h5>VALORACIÓN GENERAL</h5><p><strong>${escapeHtml(report.rating.label)}</strong>${report.rating.rationale ? ` — ${escapeHtml(report.rating.rationale)}` : ''}</p></div>`;
  }
  const hintText = report.conclusion
    ? 'El informe anual 10-K incluye resumen de cuentas a 12 meses, indagación a fondo con extractos SEC, watchlist y nota de resultados.'
    : 'El informe descargable incluye los bloques completos en los dos horizontes.';
  html += `<p class="report-hint">${hintText} Disponible en PDF, Word (.docx), ODT (.odt) y web (.html).</p>`;
  return html;
}

function buildReportJsonLd(meta, row) {
  const publishedAt = new Date(row.created_at).toISOString();
  const sourceUrl = safeHttpUrl(row.source_url) || 'https://www.sec.gov/edgar';
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
        isBasedOn: {
          '@type': 'DigitalDocument',
          name: `Informe oficial ${meta.formType} de ${meta.name} presentado ante la SEC`,
          url: sourceUrl,
          provider: {
            '@type': 'GovernmentOrganization',
            name: 'U.S. Securities and Exchange Commission',
            alternateName: 'SEC',
            url: 'https://www.sec.gov',
          },
        },
        citation: sourceUrl,
        about: {
          '@type': 'Corporation',
          name: meta.company,
          tickerSymbol: meta.ticker,
          url: `${config.siteUrl}/empresa/${encodeURIComponent(meta.ticker)}`,
          sameAs: `https://www.sec.gov/edgar/browse/?CIK=${encodeURIComponent(meta.ticker)}`,
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
    `SELECT id, ticker, period_end, created_at, report FROM analyses
      WHERE is_public = true AND status = 'done'
      ORDER BY ticker, created_at DESC, id DESC`,
  );
  return rows.rows;
}

function buildReportPage(row) {
  const report = row.report ?? {};
  const ticker = String(row.ticker ?? report.ticker ?? '').toUpperCase();
  const company = report.company ?? row.company_name ?? ticker;
  const name = titleCaseName(company);
  let formType = report.formType ?? '';
  if (!formType) {
    if (report.periodTitle?.includes('10-K') || report.isAnnual === true) {
      formType = '10-K';
    } else {
      formType = '10-Q';
    }
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
  out = setMetaTag(out, /<meta property="og:type" content="[\s\S]*?">/, `<meta property="og:type" content="article">`);
  out = setMetaTag(out, /<meta name="twitter:title" content="[\s\S]*?">/, `<meta name="twitter:title" content="${escapeHtml(title)}">`);
  out = setMetaTag(out, /<meta name="twitter:description" content="[\s\S]*?">/, `<meta name="twitter:description" content="${escapeHtml(description)}">`);

  const hreflangs = [
    `<link rel="alternate" hreflang="es" href="${escapeHtml(url)}">`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(url)}">`,
    `<link rel="alternate" type="text/markdown" href="${escapeHtml(url)}.md" title="Versión Markdown para IA">`,
  ].join('\n  ');
  out = out.replace(/<link rel="alternate" hreflang="es"[^>]*>/, hreflangs);

  const jsonLdScript = `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;
  if (/<script type="application\/ld\+json">[\s\S]*?<\/script>/.test(out)) {
    out = out.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, jsonLdScript);
  }

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
    report,
  };
  const initialScript = `<script id="cifra-initial-report" type="application/json">${JSON.stringify(initialPayload).replaceAll('<', '\\u003c')}</script>`;
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

export function invalidateReportCache() {
  reportCache.clear();
  sitemapCache.xml = null;
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
  const html = buildReportPage(row);
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

  const html = buildReportPage(row);
  reportCache.set(cleanId, { data: html, at: Date.now() });
  return html;
}

export function serve404Page(res) {
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Página no encontrada | Cifra</title><meta name="robots" content="noindex, follow"><link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif}a{color:#34d399}</style></head><body><div><h1>Página no encontrada</h1><p>El contenido que buscas no existe o ya no está disponible.</p><p><a href="/">Volver al inicio</a></p></div></body></html>`;
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

function getLegalLastmod(slug) {
  try {
    const stats = fs.statSync(path.join(LEGAL_DIR, `${slug}.html`));
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
    const seenSlugs = new Set();
    for (const r of content.publicReports) {
      const slug = r.slug || buildReportSlug(r);
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
      let formType = r.formType;
      if (!formType) {
        formType = /annual|full year|10-?k/i.test(r.periodTitle || '') ? '10-K' : '10-Q';
      }
      const repUrl = `${site}/informe/${encodeURIComponent(r.ticker)}/${slug}`;
      lines.push(`- [Informe ${formType} ${r.periodTitle ?? ''}](${repUrl}) ([Markdown](${repUrl}.md))`);
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

export function buildReportMarkdown(row) {
  if (!row) return null;
  const report = row.report ?? {};
  const ticker = String(row.ticker ?? report.ticker ?? '').toUpperCase();
  const company = report.company ?? row.company_name ?? ticker;
  const name = titleCaseName(company);
  let formType = report.formType ?? '';
  if (!formType) {
    if (report.periodTitle?.includes('10-K') || report.isAnnual === true) {
      formType = '10-K';
    } else {
      formType = '10-Q';
    }
  }
  const isAnnual = report.isAnnual === true || formType === '10-K';
  const fyLabel = report.periodTitle
    ? report.periodTitle
    : (isAnnual ? `FY ${report.fiscalYear ?? ''}` : `Q${report.fiscalQuarter ?? ''} ${report.fiscalYear ?? ''}`);
  const site = config.siteUrl;
  const slug = buildReportSlug(row);
  const canonicalUrl = `${site}/informe/${encodeURIComponent(ticker)}/${slug}`;

  const lines = [];
  lines.push(`# Informe ${formType} de ${name} (${ticker}) — ${fyLabel}`);
  lines.push('');
  lines.push(`> Empresa: ${name} (${ticker})`);
  lines.push(`> Formulario: ${formType} · Periodo: ${fyLabel.trim()}`);
  lines.push(`> Fecha de publicación: ${new Date(row.created_at).toISOString().slice(0, 10)}`);
  if (row.source_url) lines.push(`> Fuente oficial: [SEC EDGAR Filing](${row.source_url})`);
  if (row.pdf_url) lines.push(`> Descargar PDF: ${site}${row.pdf_url}`);
  lines.push(`> URL Canónica: ${canonicalUrl}`);
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
  return buildReportMarkdown(row);
}

export async function getPublicReportMarkdownBySlug(ticker, rawSlug) {
  const cleanTicker = String(ticker || '').trim().toUpperCase();
  const normSlug = String(rawSlug || '').trim().toUpperCase().replace(/10-K/, '10K');

  let row = null;
  try {
    row = await loadPublicReportBySlug(cleanTicker, normSlug);
  } catch {
    row = null;
  }
  if (!row) return null;

  const canonicalSlug = buildReportSlug(row);
  const markdown = buildReportMarkdown(row);
  return { markdown, canonicalSlug, ticker: String(row.ticker ?? cleanTicker).toUpperCase() };
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
