/**
 * @fileoverview Constantes, rutas de plantillas, paletas y funciones utilitarias base de SEO y cumplimiento legal.
 * @module services/seo/seoConstants
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../../../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = path.join(__dirname, '..', '..', '..', 'public');
export const GUIDES_DIR = path.join(__dirname, '..', '..', 'content', 'guias');
export const LEGAL_DIR = path.join(__dirname, '..', '..', 'content', 'legal');

export const SITE_NAME = 'Cifra';
export const GA_MEASUREMENT_ID = 'G-7PSC9M3B1H';
export const DEFAULT_OG_IMAGE = `${config.siteUrl}/og-cifra.png`;

export const templatesCache = new Map();
export const guidesCache = new Map();
export const legalCache = new Map();
export const companyMetaCache = new Map();
export const companyContentCache = new Map();
export const reportCache = new Map();
export const sitemapCache = { xml: null, at: 0 };

export const COMPANY_META_TTL = 6 * 60 * 60 * 1000;
export const COMPANY_CONTENT_TTL = 12 * 60 * 60 * 1000;
export const REPORT_TTL = 10 * 60 * 1000;
export const SITEMAP_TTL = 30 * 60 * 1000;

export const PRIVATE_PATHS = new Set([
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
    titleEn: 'What is a 10-Q filing and how to read it?',
    description: 'El 10-Q es el informe trimestral que las empresas de EE. UU. presentan ante la SEC: qué contiene, cuándo se publica y cómo leerlo paso a paso.',
    descriptionEn: 'The 10-Q is the quarterly report U.S. companies file with the SEC: what it contains, when it is filed, and how to read it step by step.',
  },
  {
    slug: 'que-es-un-informe-10-k',
    title: '¿Qué es un informe 10-K? El informe anual de la SEC',
    titleEn: 'What is a 10-K filing? The SEC annual report',
    description: 'El 10-K es el informe anual auditado de las empresas de EE. UU.: secciones, plazos de presentación y qué mirar para analizar una empresa.',
    descriptionEn: 'The 10-K is the audited annual report of U.S. companies: sections, filing deadlines, and what to look for when analyzing a company.',
  },
  {
    slug: 'que-es-un-informe-8-k',
    title: '¿Qué es un informe 8-K y por qué es clave en los resultados trimestrales?',
    titleEn: 'What is an 8-K report and why is it key in quarterly earnings?',
    description: 'El 8-K es el informe de hechos relevantes de la SEC: qué contiene el Item 2.02, por qué incluye la presentación de resultados y cómo interpretarlo.',
    descriptionEn: 'The 8-K reports material corporate events to the SEC: what Item 2.02 contains, why it includes earnings presentations, and how to interpret it.',
  },
  {
    slug: 'diferencias-entre-10-k-y-10-q',
    title: 'Diferencias entre el 10-K y el 10-Q',
    titleEn: 'Differences between Form 10-K and Form 10-Q',
    description: 'Comparativa completa entre el 10-K (anual, auditado) y el 10-Q (trimestral, sin auditar): frecuencia, contenido, plazos y cuándo leer cada uno.',
    descriptionEn: 'Complete comparison between the 10-K (annual, audited) and 10-Q (quarterly, unaudited): frequency, contents, deadlines, and when to read each.',
  },
  {
    slug: 'que-es-el-flujo-de-caja-libre',
    title: '¿Qué es el flujo de caja libre (FCF)?',
    titleEn: 'What is Free Cash Flow (FCF)?',
    description: 'El flujo de caja libre es el dinero que una empresa genera tras invertir en su negocio: fórmula, por qué importa más que el beneficio y cómo usarlo.',
    descriptionEn: 'Free cash flow is the cash a company generates after investing in its business: formula, why it matters more than net income, and how to use it.',
  },
  {
    slug: 'que-es-la-asignacion-de-capital',
    title: '¿Qué es la asignación de capital?',
    titleEn: 'What is Capital Allocation?',
    description: 'La asignación de capital es lo que una empresa hace con el dinero que genera: dividendos, recompras, deuda, adquisiciones e inversión. Claves para el inversor.',
    descriptionEn: 'Capital allocation is what a company does with the cash it generates: dividends, buybacks, debt, acquisitions, and reinvestment.',
  },
  {
    slug: 'como-analiza-la-ia-por-sectores',
    title: 'Cómo analiza la IA de Cifra según cada sector',
    titleEn: 'How Cifra AI analyzes by sector',
    description: 'Descubre la metodología multi-agente de Cifra: dos horizontes temporales y adaptación a consumo defensivo, software, industriales y retail.',
    descriptionEn: 'Discover Cifra multi-agent methodology: two time horizons and adaptation to consumer staples, software, industrials, and retail.',
  },
  {
    slug: 'que-es-el-bpa-ajustado',
    title: '¿Qué es el BPA Ajustado (Non-GAAP EPS) y cómo interpretarlo?',
    titleEn: 'What is Adjusted EPS (Non-GAAP EPS) and how to interpret it?',
    description: 'El BPA ajustado en los resultados trimestrales: diferencias con el BPA GAAP, partidas excluidas, trampas de maquillaje y cómo lo normaliza Cifra.',
    descriptionEn: 'Adjusted EPS in quarterly earnings: differences with GAAP EPS, excluded items, accounting gimmicks, and how Cifra normalizes it.',
  },
  {
    slug: 'como-analizar-una-empresa-de-consumo-defensivo',
    title: 'Cómo analizar una empresa de consumo defensivo',
    titleEn: 'How to analyze a consumer staples company',
    description: 'Guía para analizar empresas de consumo defensivo (alimentos, bebidas, tabaco, hogar): ingresos, márgenes, flujo de caja, dividendos y deuda.',
    descriptionEn: 'Guide to analyzing consumer staples companies (food, beverages, tobacco, household): sales, margins, cash flow, dividends, and debt.',
  },
];

export const LEGAL_PAGES = [
  {
    slug: 'aviso-legal',
    title: 'Aviso legal',
    titleEn: 'Legal notice',
    description: 'Identificación del titular, condiciones de uso y responsabilidad del sitio web de Cifra.',
    descriptionEn: 'Owner identification, terms of access and use of the website, intellectual property, and liability.',
  },
  {
    slug: 'privacidad',
    title: 'Política de privacidad',
    titleEn: 'Privacy policy',
    description: 'Qué datos personales recoge Cifra, con qué finalidad, durante cuánto tiempo y cómo ejercer tus derechos.',
    descriptionEn: 'What personal data Cifra collects, for what purpose, retention periods, and how to exercise your rights.',
  },
  {
    slug: 'cookies',
    title: 'Política de cookies',
    titleEn: 'Cookie policy',
    description: 'Qué cookies y almacenamiento local usa Cifra, para qué sirven y cómo aceptarlas o rechazarlas.',
    descriptionEn: 'What cookies and local storage Cifra uses, their purpose, and how to accept or reject them.',
  },
  {
    slug: 'terminos',
    title: 'Términos de uso',
    titleEn: 'Terms of service',
    description: 'Condiciones de uso del servicio Cifra: cuenta, límites de uso, propiedad intelectual y responsabilidad.',
    descriptionEn: 'Terms and conditions of Cifra services: account, usage limits, intellectual property, and liability.',
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

export const LOWER_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'y', 'of', 'the', 'and']);

export function titleCaseName(name) {
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

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function safeHttpUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

const esNumber = new Intl.NumberFormat('es-ES');

export function formatUsdMillions(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return `${esNumber.format(Math.round(num / 1e6))} M$`;
}

export function formatUsdShare(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)} $`;
}

let enDictionaryCache = null;

export function getEnDictionary() {
  if (enDictionaryCache) return enDictionaryCache;
  try {
    const raw = fs.readFileSync(path.join(PUBLIC_DIR, 'locales', 'en.json'), 'utf8');
    enDictionaryCache = JSON.parse(raw);
    return enDictionaryCache;
  } catch {
    return {};
  }
}

export function translateHtmlToEnglish(sourceHtml) {
  const dict = getEnDictionary();
  if (!dict || !Object.keys(dict).length) return sourceHtml;

  const scripts = [];
  let stashed = sourceHtml.replace(/<script[\s\S]*?<\/script>/gi, (m) => {
    scripts.push(m);
    return `__SCRIPT_TOKEN_${scripts.length - 1}__`;
  });
  const styles = [];
  stashed = stashed.replace(/<style[\s\S]*?<\/style>/gi, (m) => {
    styles.push(m);
    return `__STYLE_TOKEN_${styles.length - 1}__`;
  });

  stashed = stashed.replace('<html lang="es">', '<html lang="en">');

  // Nodos de texto entre etiquetas >...<
  stashed = stashed.replace(/>([^<]+)</g, (match, inner) => {
    const trimmed = inner.trim();
    if (!trimmed || trimmed.toLowerCase() === 'cifra') return match;
    const translated = dict[trimmed] || dict[trimmed.replace(/\s+/g, ' ')];
    if (translated && translated !== trimmed) {
      return `>${inner.replace(trimmed, translated)}<`;
    }
    return match;
  });

  // Atributos traducibles
  stashed = stashed.replace(/(placeholder|title|aria-label)="([^"]+)"/g, (match, attr, val) => {
    const trimmed = val.trim();
    if (!trimmed || trimmed.toLowerCase() === 'cifra') return match;
    const translated = dict[trimmed] || dict[trimmed.replace(/\s+/g, ' ')];
    if (translated && translated !== trimmed) {
      return `${attr}="${translated.replace(/"/g, '&quot;')}"`;
    }
    return match;
  });

  // Reescribir enlaces legales y guías hacia /en/...
  stashed = stashed.replace(/href="\/legal\//g, 'href="/en/legal/');
  stashed = stashed.replace(/href="\/guias\//g, 'href="/en/guias/');
  stashed = stashed.replace(/href="\/guias"/g, 'href="/en/guias"');

  // Restaurar scripts y estilos
  stashed = stashed.replace(/__STYLE_TOKEN_(\d+)__/g, (_, idx) => styles[Number(idx)]);
  stashed = stashed.replace(/__SCRIPT_TOKEN_(\d+)__/g, (_, idx) => scripts[Number(idx)]);

  return stashed;
}

export function readTemplate(fileName, lang = 'es') {
  const cacheKey = `${fileName}:${lang}`;
  if (config.production) {
    const cached = templatesCache.get(cacheKey);
    if (cached) return cached;
  }
  let html = fs.readFileSync(path.join(PUBLIC_DIR, fileName), 'utf8');
  if (lang === 'en') {
    html = translateHtmlToEnglish(html);
  }
  if (config.production) templatesCache.set(cacheKey, html);
  return html;
}

export function readGuide(fileName) {
  if (config.production) {
    const cached = guidesCache.get(fileName);
    if (cached) return cached;
  }
  const html = fs.readFileSync(path.join(GUIDES_DIR, fileName), 'utf8');
  if (config.production) guidesCache.set(fileName, html);
  return html;
}

export function readLegal(fileName) {
  if (config.production) {
    const cached = legalCache.get(fileName);
    if (cached) return cached;
  }
  const html = fs.readFileSync(path.join(LEGAL_DIR, fileName), 'utf8');
  if (config.production) legalCache.set(fileName, html);
  return html;
}

export function replaceTokens(html) {
  return html.replaceAll('{{SITE_URL}}', config.siteUrl);
}

export function setMetaTag(html, pattern, replacement) {
  if (!pattern.test(html)) return html;
  return html.replace(pattern, replacement);
}

export function withAnalytics(html) {
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

export function withCompliance(html) {
  let out = html;
  if (!out.includes('/cookies.js')) {
    out = out.replace('</body>', '  <script src="/cookies.js?v=1" defer></script>\n</body>');
  }
  return withAnalytics(out);
}
