/**
 * @fileoverview Metadatos SEO (title y description) de las páginas institucionales
 * de Cifra en español e inglés, para que cada ruta tenga su propio título y
 * descripción (portada, directorio de empresas y hub de guías).
 * @module services/seo/pageMeta
 */

const PAGE_META = {
  es: {
    home: {
      title: 'Cifra | Análisis de informes 10-Q y 10-K con IA',
      description: 'Cifra convierte los informes 10-Q y 10-K de la SEC en un análisis claro con IA: ventas, flujo de caja libre y asignación de capital. Pruébala gratis.',
    },
    companies: {
      title: 'Cifra | Empresas de EE. UU. de consumo defensivo',
      description: 'Directorio de empresas estadounidenses de consumo defensivo: perfil, cotización, informes 10-Q y 10-K y análisis con IA de ventas, FCF y capital.',
    },
    guides: {
      title: 'Guías para leer informes 10-Q y 10-K de la SEC | Cifra',
      description: 'Guías educativas para inversores: qué son el 10-Q y el 10-K, flujo de caja libre, asignación de capital y cómo analizar empresas de consumo defensivo con los informes de la SEC.',
    },
  },
  en: {
    home: {
      title: 'Cifra | AI analysis of 10-Q and 10-K reports',
      description: 'Cifra turns SEC 10-Q and 10-K filings into a clear AI analysis: sales, free cash flow and capital allocation. Try it free.',
    },
    companies: {
      title: 'Cifra | U.S. Consumer Staples Companies: Results and Analysis',
      description: 'Directory of U.S. consumer staples companies: profile, quote, 10-Q and 10-K filings and AI analysis of sales, free cash flow and capital allocation.',
    },
    guides: {
      title: 'Guides to read 10-Q and 10-K SEC filings | Cifra',
      description: 'Educational guides for investors: what 10-Q and 10-K filings are, free cash flow, capital allocation and how to analyze consumer staples companies using SEC filings.',
    },
  },
};

/**
 * Devuelve el título y la descripción de una página institucional.
 * @param {'home'|'companies'|'guides'} page - Página solicitada.
 * @param {string} [lang] - Idioma ('es' | 'en').
 * @returns {{ title: string, description: string }|null}
 */
export function getPageMeta(page, lang = 'es') {
  return PAGE_META[lang === 'en' ? 'en' : 'es'][page] ?? null;
}
