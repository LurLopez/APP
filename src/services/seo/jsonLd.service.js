/**
 * @fileoverview Generadores de metadatos estructurados Schema.org en formato JSON-LD.
 * @module services/seo/jsonLd.service
 */

import config from '../../../config/index.js';
import { SITE_NAME, safeHttpUrl } from './seoConstants.js';
import { getFeaturedCompanies } from './featuredCompanies.service.js';

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
export async function buildFeaturedItemList(name, url, limit) {
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

export function buildCompanyJsonLd(meta, profile) {
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
    knowsAbout: ['Análisis fundamental', 'Informes 10-Q y 10-K', 'SEC EDGAR', 'Flujo de caja libre', 'Asignación de capital'],
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

export function buildReportJsonLd(meta, row) {
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
