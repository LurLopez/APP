/**
 * @fileoverview Carga, enrutamiento por slug, caché y ensamblado de páginas públicas de informes.
 * @module services/seo/reportSeo.service
 */

export { buildReportSlug, loadPublicReportRow, loadPublicReportBySlug, getReportSlugById, getPublicReportHtmlBySlug, getPublicReportHtml } from './reportSeo.build.service.js';
export { invalidateReportCache, loadPublicReportsForSitemap } from './reportSeo.cache.service.js';

import config from '../../../config/index.js';
import { query } from '../../../db/pool.js';
import { resolveAnalysisVersion, isAnalysisOutdated } from '../../agents/sectorAgent.js';
import {
  SITE_NAME,
  reportCache,
  sitemapCache,
  REPORT_TTL,
  titleCaseName,
  escapeHtml,
  safeHttpUrl,
  readTemplate,
  replaceTokens,
  setMetaTag,
} from './seoConstants.js';
import { buildReportJsonLd, safeJsonForScript } from './jsonLd.service.js';
import { renderReportSsrHtml } from './reportSsrHtml.js';

/**
 * Genera el slug canónico para un informe a partir de sus metadatos (ej. 2025-10K, 2025-Q3).
 * @param {object} row - Fila de la base de datos o metadatos de análisis.
 * @returns {string} Slug del informe.
 */

/**
 * Carga un análisis público por su identificador numérico.
 * @param {number} id - ID del análisis.
 * @returns {Promise<object|null>} Fila del análisis o null.
 */

/**
 * Busca y carga un informe público por ticker y slug.
 * @param {string} ticker - Símbolo de cotización.
 * @param {string} rawSlug - Slug solicitado.
 * @returns {Promise<object|null>} Fila encontrada o null.
 */

/**
 * Obtiene el slug de un informe a partir de su ID.
 * @param {number|string} id - ID del informe.
 * @returns {Promise<{ticker: string, slug: string, row: object}|null>} Información de resolución o null.
 */

/**
 * Construye la página HTML SSR completa para un informe público.
 * @param {object} row - Fila del informe en BD.
 * @returns {Promise<string>} Contenido HTML completo.
 */

/**
 * Invalida la caché de informes y del sitemap.
 */

/**
 * Obtiene el HTML renderizado de un informe por ticker y slug (con soporte para caché en memoria).
 * @param {string} ticker - Ticker de la compañía.
 * @param {string} rawSlug - Slug del periodo del informe.
 * @returns {Promise<{html: string, canonicalSlug: string, ticker: string}|null>} Objeto con HTML y datos canónicos, o null.
 */

/**
 * Obtiene el HTML de un informe por su ID numérico.
 * @param {number|string} id - ID del análisis.
 * @returns {Promise<string|null>} HTML renderizado o null.
 */

/**
 * Carga la lista de informes públicos para el generador de sitemap XML.
 * @returns {Promise<Array<object>>} Lista de análisis públicos.
 */
