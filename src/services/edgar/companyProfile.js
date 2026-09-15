/**
 * @fileoverview Perfiles empresariales, búsqueda de cotizadas en la SEC y extracción de metadatos corporativos.
 * @module services/edgar/companyProfile
 */

export { getCompanyFacts } from './companyProfileFacts.js';
export { getCompanyByTicker, getCompanySubmissions, latestFactValue, profileSector, profileIndustry, profileAddress, profileCountry, profileExchange, getCompanyOrigin, getCompanySector, getCompanySeoProfile, buildCompanyProfile } from './companyProfileData.js';
export { searchCompanies } from './companyProfileSearch.js';

import {
  FACTS_URL_TEMPLATE,
  SUBMISSIONS_URL_TEMPLATE,
  FACTS_TTL,
  FILINGS_TTL,
} from './statementConcepts.js';
import { fetchSecJson, getTickerMap, notFound } from './secClient.js';
import { normalizeRecentFilings, getFiscalPeriodInfo } from './filingPeriods.js';

/**
 * Busca empresas en la base de datos de la SEC por ticker o nombre.
 * @param {string} query - Término de búsqueda.
 * @param {number} [limit=8] - Número máximo de resultados.
 * @returns {Promise<Array<{cik: number|string, ticker: string, name: string}>>} Resultados.
 */

/**
 * Obtiene los datos básicos (CIK, ticker, nombre) de una empresa por su símbolo de cotización.
 * @param {string} ticker - Símbolo bursátil.
 * @returns {Promise<{cik: number|string, ticker: string, name: string}>} Objeto empresa.
 */

/**
 * Descarga los XBRL Company Facts con caché en memoria.
 * @param {object} company - Objeto empresa con ticker y CIK.
 * @returns {Promise<object>} Hechos XBRL.
 */

/**
 * Descarga las presentaciones (submissions) de la empresa ante la SEC con caché en memoria.
 * @param {object} company - Objeto empresa.
 * @returns {Promise<object>} Submissions de la SEC.
 */

/**
 * Extrae el valor numérico más reciente de un concepto contable en los hechos XBRL.
 * @param {object} facts - Hechos contables de la empresa.
 * @param {string} namespace - Espacio de nombres ('us-gaap', 'dei').
 * @param {string[]} tags - Lista priorizada de etiquetas XBRL.
 * @param {string} unit - Unidad de medida ('USD', 'shares').
 * @param {Function} [predicate=() => true] - Filtro de validación opcional.
 * @returns {number|null} Último valor encontrado o null.
 */

/**
 * Traduce el código SIC en el nombre del sector económico.
 * @param {number|string} sic - Código SIC de la empresa.
 * @returns {string|null} Sector traducido.
 */

/**
 * Traduce y normaliza la descripción de la industria.
 * @param {string} description - Descripción original en inglés.
 * @returns {string|null} Nombre de la industria en español.
 */

/**
 * Extrae y formatea la dirección de la sede corporativa.
 * @param {object} submissions - Submissions de la SEC.
 * @returns {string|null} Dirección física o null.
 */

/**
 * Identifica el país de origen de la empresa.
 * @param {object} submissions - Submissions de la SEC.
 * @returns {string|null} País o 'Estados Unidos'.
 */

/**
 * Obtiene la bolsa o mercado donde cotiza la compañía.
 * @param {object} company - Objeto empresa.
 * @param {object} submissions - Submissions de la SEC.
 * @returns {string|null} Nombre del mercado (ej. NYSE, NASDAQ).
 */

/**
 * Obtiene el país y sector de procedencia de la empresa.
 * @param {string} ticker - Ticker de la compañía.
 * @returns {Promise<{sector: string, country: string}>} Sector y país.
 */

/**
 * Retorna el sector económico asignado a una cotizada.
 * @param {string} ticker - Ticker de la compañía.
 * @returns {Promise<string>} Sector económico.
 */

/**
 * Genera el perfil corporativo enriquecido para vistas y metadatos SEO.
 * @param {string} ticker - Ticker del activo.
 * @returns {Promise<object>} Perfil SEO completo con presentaciones recientes.
 */

/**
 * Construye el objeto integral de perfil empresarial y métricas clave de valoración.
 * @param {object} company - Información base de la compañía.
 * @param {object} facts - Hechos contables XBRL.
 * @param {object} submissions - Submissions de la SEC.
 * @param {Array<object>} annual - Periodos anuales calculados.
 * @param {Array<object>} quarterly - Periodos trimestrales calculados.
 * @param {object} market - Cotización y datos de mercado.
 * @returns {object} Perfil completo para la interfaz.
 */
