/**
 * @fileoverview Generadores de metadatos estructurados Schema.org en formato JSON-LD.
 * @module services/seo/jsonLd.service
 */

import config from '../../../config/index.js';
import { SITE_NAME, safeHttpUrl, GUIDES } from './seoConstants.js';
import { t } from '../../utils/i18n.js';
import { getFeaturedCompanies } from './featuredCompanies.service.js';
import { HOME_FAQS } from './botContent.service.js';

/**
 * Serializa un objeto para incrustarlo en un <script>. Neutraliza los caracteres
 * que permitirían cerrar la etiqueta (</script>) o inyectar HTML/JS, así como los
 * separadores de línea Unicode. Apto para JSON-LD y payloads iniciales.
 * @param {object} obj - Objeto a serializar.
 * @param {number} [spacing=2] - Indentación de JSON.stringify (0 = compacto).
 * @returns {string} JSON seguro para HTML.
 */
export function safeJsonForScript(obj, spacing = 2) {
  return JSON.stringify(obj, null, spacing)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Envuelve un objeto en una etiqueta script de tipo application/ld+json.
 * @param {object} obj - Objeto estructurado Schema.org.
 * @returns {string} Fragmento HTML con el script JSON-LD formateado.
 */
export function jsonLdScript(obj) {
  return `<script type="application/ld+json">\n${safeJsonForScript(obj)}\n</script>`;
}

/**
 * Genera un ItemList de Schema.org a partir de empresas destacadas.
 * @param {string} name - Nombre descriptivo de la lista.
 * @param {string} url - URL canónica de la página contenedora.
 * @param {number} limit - Número de elementos.
 * @returns {Promise<object>} Objeto Schema.org de tipo ItemList.
 */
export async function buildFeaturedItemList(name, url, limit, lang = 'es') {
  const isEn = lang === 'en';
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
        url: isEn
          ? `${config.siteUrl}/en/empresa/${encodeURIComponent(company.ticker)}`
          : `${config.siteUrl}/empresa/${encodeURIComponent(company.ticker)}`,
      },
    })),
  };
}

/**
 * Construye el grafo base del sitio (WebSite, Organization y WebApplication)
 * localizado según el idioma de la página.
 * @param {string} [lang] - Idioma ('es' | 'en').
 * @returns {object[]} Nodos Schema.org.
 */
export function buildSiteGraph(lang = 'es') {
  const isEn = lang === 'en';
  const siteUrl = `${config.siteUrl}/`;
  const organizationId = `${config.siteUrl}/#organization`;

  const webSite = {
    '@type': 'WebSite',
    '@id': `${config.siteUrl}/#website`,
    name: 'Cifra',
    alternateName: 'Cifra Research',
    url: siteUrl,
    inLanguage: isEn ? 'en' : 'es',
    description: t('Análisis de informes financieros 10-Q y 10-K de empresas estadounidenses con IA.', null, lang),
    publisher: { '@id': organizationId },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${config.siteUrl}${isEn ? '/en' : ''}/empresa?ticker={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  const organization = {
    '@type': 'Organization',
    '@id': organizationId,
    name: 'Cifra',
    alternateName: 'Cifra Research',
    url: siteUrl,
    logo: {
      '@type': 'ImageObject',
      url: `${config.siteUrl}/logo-cifra.png`,
      width: 512,
      height: 512,
    },
  };

  const webApplication = {
    '@type': 'WebApplication',
    '@id': `${config.siteUrl}/#application`,
    name: 'Cifra',
    url: siteUrl,
    inLanguage: isEn ? 'en' : 'es',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    description: t('Herramienta para analizar informes financieros 10-Q y 10-K de empresas estadounidenses con datos de SEC EDGAR.', null, lang),
    publisher: { '@id': organizationId },
    featureList: [
      'Análisis automatizado de informes 10-Q y 10-K con IA',
      'Extracción de ventas, margen operativo, beneficio neto y flujo de caja libre',
      'Evaluación de la asignación de capital: deuda, recompras de acciones y dividendos',
      'Integración con presentaciones y comunicados de resultados del Formulario 8-K',
      'Generación de informes estructurados en PDF',
    ].map((feature) => t(feature, null, lang)),
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return [webSite, organization, webApplication];
}

/**
 * Genera el JSON-LD de la portada: grafo del sitio + listado de empresas destacadas.
 * @param {string} [lang] - Idioma ('es' | 'en').
 * @returns {Promise<object>} Objeto Schema.org.
 */
export async function getHomeJsonLd(lang = 'es') {
  const itemList = await (lang === 'en'
    ? buildFeaturedItemList('Companies analyzed on Cifra', `${config.siteUrl}/en`, 8, 'en')
    : buildFeaturedItemList('Empresas analizadas en Cifra', `${config.siteUrl}/`, 8, 'es'));
  const { '@context': _context, ...itemListNode } = itemList;
  return { '@context': 'https://schema.org', '@graph': [...buildSiteGraph(lang), itemListNode] };
}

/**
 * Genera el JSON-LD de la FAQ de la portada. Usa exactamente las mismas
 * preguntas y respuestas que el bloque SSR visible (HOME_FAQS).
 * @param {string} [lang] - Idioma ('es' | 'en').
 * @returns {object} Objeto FAQPage de Schema.org.
 */
export function getHomeFaqJsonLd(lang = 'es') {
  const isEn = lang === 'en';
  const base = isEn ? `${config.siteUrl}/en/guias` : `${config.siteUrl}/guias`;
  const faqs = HOME_FAQS[isEn ? 'en' : 'es'];
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a, guide }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: guide ? `${a} ${base}/${guide.slug}` : a,
      },
    })),
  };
}

export async function getCompaniesJsonLd(lang = 'es') {
  const isEn = lang === 'en';
  const itemList = await (isEn
    ? buildFeaturedItemList('U.S. Consumer Staples Companies on Cifra', `${config.siteUrl}/en/empresa`, 28, 'en')
    : buildFeaturedItemList('Empresas de consumo defensivo de EE. UU. en Cifra', `${config.siteUrl}/empresa`, 28, 'es'));
  const { '@context': _context, ...itemListNode } = itemList;
  const [webSite, organization] = buildSiteGraph(lang);
  const collectionPage = {
    '@type': 'CollectionPage',
    '@id': `${config.siteUrl}${isEn ? '/en' : ''}/empresa#collection`,
    url: `${config.siteUrl}${isEn ? '/en' : ''}/empresa`,
    name: isEn ? 'U.S. Consumer Staples Companies' : 'Empresas de consumo defensivo de EE. UU.',
    description: isEn
      ? 'Directory of U.S. consumer staples companies with profile, quote, 10-Q and 10-K filings and AI analysis.'
      : 'Directorio de empresas estadounidenses de consumo defensivo con perfil, cotización, informes 10-Q y 10-K y análisis con IA.',
    inLanguage: isEn ? 'en' : 'es',
    isPartOf: { '@id': `${config.siteUrl}/#website` },
    publisher: { '@id': `${config.siteUrl}/#organization` },
    mainEntity: { '@type': 'ItemList', '@id': `${config.siteUrl}${isEn ? '/en' : ''}/empresa#list` },
  };
  return { '@context': 'https://schema.org', '@graph': [webSite, organization, collectionPage, itemListNode] };
}

/**
 * Genera el JSON-LD del hub de guías: WebPage + BreadcrumbList + listado de guías.
 * @param {string} [lang] - Idioma ('es' | 'en').
 * @returns {object} Objeto Schema.org.
 */
export function getGuidesJsonLd(lang = 'es') {
  const isEn = lang === 'en';
  const base = `${config.siteUrl}${isEn ? '/en' : ''}/guias`;
  const [, organization] = buildSiteGraph(lang);
  const webPage = {
    '@type': 'WebPage',
    '@id': `${base}#webpage`,
    url: base,
    name: isEn ? 'Guides to read 10-Q and 10-K SEC filings' : 'Guías para leer informes 10-Q y 10-K de la SEC',
    description: isEn
      ? 'Educational guides for investors: what 10-Q and 10-K filings are, free cash flow, capital allocation and how to analyze consumer staples companies using SEC filings.'
      : 'Guías educativas para inversores: qué son el 10-Q y el 10-K, flujo de caja libre, asignación de capital y cómo analizar empresas de consumo defensivo con los informes de la SEC.',
    inLanguage: isEn ? 'en' : 'es',
    isPartOf: { '@id': `${config.siteUrl}/#website` },
    publisher: { '@id': `${config.siteUrl}/#organization` },
    mainEntity: { '@id': `${base}#list` },
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${base}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Cifra', item: `${config.siteUrl}${isEn ? '/en' : ''}` },
      { '@type': 'ListItem', position: 2, name: isEn ? 'Guides' : 'Guías', item: base },
    ],
  };
  const itemList = {
    '@type': 'ItemList',
    '@id': `${base}#list`,
    name: isEn ? 'SEC filing guides' : 'Guías de informes de la SEC',
    numberOfItems: GUIDES.length,
    itemListElement: GUIDES.map((guide, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Article',
        headline: isEn && guide.titleEn ? guide.titleEn : guide.title,
        description: isEn && guide.descriptionEn ? guide.descriptionEn : guide.description,
        url: `${base}/${guide.slug}`,
      },
    })),
  };
  return { '@context': 'https://schema.org', '@graph': [webPage, breadcrumb, organization, itemList] };
}

export function buildCompanyJsonLd(meta, profile, lang = 'es') {
  const isEn = lang === 'en';
  const corporationId = `${meta.url}/#corporation`;
  const breadcrumbId = `${meta.url}/#breadcrumb`;
  const faqId = `${meta.url}/#faq`;
  const secEdgarUrl = profile.cik ? `https://www.sec.gov/edgar/browse/?CIK=${profile.cik}` : 'https://www.sec.gov/edgar';

  const corporation = {
    '@type': 'Corporation',
    '@id': corporationId,
    name: meta.name,
    alternateName: meta.ticker,
    description: meta.description,
    url: meta.url,
    tickerSymbol: meta.ticker,
    logo: `${config.siteUrl}/logo-cifra.png`,
    identifier: { '@type': 'PropertyValue', name: 'Ticker', value: meta.ticker },
    isBasedOn: secEdgarUrl,
    citation: secEdgarUrl,
    knowsAbout: isEn
      ? ['Fundamental analysis', '10-Q and 10-K filings', 'SEC EDGAR', 'Free cash flow', 'Capital allocation']
      : ['Análisis fundamental', 'Informes 10-Q y 10-K', 'SEC EDGAR', 'Flujo de caja libre', 'Asignación de capital'],
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
      name: isEn ? `${meta.name} Form ${profile.lastFiling.form}` : `${profile.lastFiling.form} de ${meta.name}`,
      datePublished: profile.lastFiling.filedAt ?? undefined,
    };
  }

  const breadcrumbs = isEn
    ? [
        { '@type': 'ListItem', position: 1, name: 'Cifra', item: `${config.siteUrl}/en` },
        { '@type': 'ListItem', position: 2, name: 'Companies', item: `${config.siteUrl}/en/empresa` },
        { '@type': 'ListItem', position: 3, name: `${meta.ticker} · ${meta.name}`, item: meta.url },
      ]
    : [
        { '@type': 'ListItem', position: 1, name: 'Cifra', item: `${config.siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Empresas', item: `${config.siteUrl}/empresa` },
        { '@type': 'ListItem', position: 3, name: `${meta.ticker} · ${meta.name}`, item: meta.url },
      ];

  const faqItems = isEn
    ? [
        {
          '@type': 'Question',
          name: `What business does ${meta.name} operate in and where is it listed?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `${meta.name} (${meta.ticker}) is listed on ${profile.exchange || 'the U.S. stock market'} and operates in the ${profile.industry || profile.sector || 'consumer staples'} industry according to official SEC EDGAR classification.`,
          },
        },
        {
          '@type': 'Question',
          name: `Where can you view official SEC 10-Q and 10-K filings for ${meta.ticker}?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Official 10-Q (quarterly) and 10-K (annual) filings for ${meta.name} are registered with the SEC under CIK ${profile.cik}. On Cifra you can access primary EDGAR documents and AI-assisted financial analyses.`,
          },
        },
        {
          '@type': 'Question',
          name: `How does Cifra analyze financial results for ${meta.name}?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Cifra examines official filings of ${meta.name} (${meta.ticker}), extracting revenue, operating income, net income, free cash flow (FCF), dividends, share buybacks, and debt across two time horizons.`,
          },
        },
      ]
    : [
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
      ];

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
        inLanguage: isEn ? 'en' : 'es',
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
        itemListElement: breadcrumbs,
      },
      {
        '@type': 'FAQPage',
        '@id': faqId,
        mainEntity: faqItems,
      },
    ],
  };
}

export function buildReportJsonLd(meta, row) {
  const publishedAt = new Date(row.created_at).toISOString();
  const sourceUrl = safeHttpUrl(row.source_url) || 'https://www.sec.gov/edgar';
  const isEn = (meta.language ?? 'es') === 'en';
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
        inLanguage: isEn ? 'en' : 'es',
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
          name: isEn
            ? `Official Form ${meta.formType} report filed by ${meta.name} with the SEC`
            : `Informe oficial ${meta.formType} de ${meta.name} presentado ante la SEC`,
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
