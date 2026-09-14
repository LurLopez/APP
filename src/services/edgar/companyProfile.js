/**
 * @fileoverview Perfiles empresariales, búsqueda de cotizadas en la SEC y extracción de metadatos corporativos.
 * @module services/edgar/companyProfile
 */

import {
  FACTS_URL_TEMPLATE,
  SUBMISSIONS_URL_TEMPLATE,
  FACTS_TTL,
  FILINGS_TTL,
} from './statementConcepts.js';
import { fetchSecJson, getTickerMap, notFound } from './secClient.js';
import { normalizeRecentFilings, getFiscalPeriodInfo } from './filingPeriods.js';

const factsCache = new Map();
const filingsCache = new Map();

const SIC_SECTORS = {
  1: 'Agricultura', 2: 'Agricultura', 7: 'Agricultura', 8: 'Agricultura', 9: 'Agricultura',
  10: 'Minería y extracción', 12: 'Minería y extracción', 13: 'Minería y extracción', 14: 'Minería y extracción',
  15: 'Construcción', 16: 'Construcción', 17: 'Construcción',
  22: 'Textil', 23: 'Ropa y accesorios', 24: 'Madera y papel', 25: 'Madera y papel', 26: 'Madera y papel',
  27: 'Publicaciones y medios', 29: 'Petróleo y gas', 30: 'Plásticos y caucho', 31: 'Cuero',
  32: 'Vidrio y cerámica', 33: 'Metales', 34: 'Metales fabricados', 35: 'Maquinaria', 36: 'Electrónica',
  37: 'Vehículos', 38: 'Instrumentos', 39: 'Manufactura diversa',
  40: 'Transporte', 41: 'Transporte', 42: 'Transporte', 43: 'Correos y mensajería', 44: 'Transporte marítimo',
  45: 'Transporte aéreo', 46: 'Transporte de mercancías', 47: 'Transporte y servicios relacionados',
  48: 'Comunicaciones', 49: 'Electricidad, gas y agua',
  50: 'Comercio mayorista', 51: 'Comercio mayorista',
  52: 'Comercio minorista', 53: 'Comercio minorista', 55: 'Comercio minorista', 56: 'Comercio minorista',
  57: 'Comercio minorista', 59: 'Comercio minorista', 58: 'Restauración',
  60: 'Bancos', 61: 'Bancos', 62: 'Intermediación bursátil', 63: 'Seguros', 64: 'Seguros',
  65: 'Finanzas e inmobiliario', 66: 'Finanzas e inmobiliario', 67: 'Finanzas e inmobiliario',
  70: 'Hostelería y turismo', 72: 'Servicios personales', 73: 'Servicios informáticos',
  75: 'Reparación y mantenimiento', 76: 'Reparación y mantenimiento', 78: 'Entretenimiento',
  79: 'Entretenimiento', 80: 'Sanidad', 81: 'Servicios jurídicos', 82: 'Educación', 83: 'Servicios sociales',
  84: 'Museos y exposiciones', 86: 'Organizaciones y asociaciones', 87: 'Servicios de ingeniería',
  89: 'Servicios profesionales', 91: 'Administración pública', 92: 'Administración pública',
  93: 'Administración pública', 94: 'Administración pública', 95: 'Administración pública',
  96: 'Administración pública', 97: 'Administración pública', 99: 'Otros',
};

/**
 * Busca empresas en la base de datos de la SEC por ticker o nombre.
 * @param {string} query - Término de búsqueda.
 * @param {number} [limit=8] - Número máximo de resultados.
 * @returns {Promise<Array<{cik: number|string, ticker: string, name: string}>>} Resultados.
 */
export async function searchCompanies(query, limit = 8) {
  const map = await getTickerMap();
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const all = [...map.values()];
  const exact = all.find((company) => company.ticker === q);
  const byTicker = all
    .filter((company) => company.ticker !== q && company.ticker.startsWith(q))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
  const byName = all
    .filter((company) => company.ticker !== q && !company.ticker.startsWith(q) && company.name.toUpperCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...(exact ? [exact] : []), ...byTicker, ...byName].slice(0, limit);
}

/**
 * Obtiene los datos básicos (CIK, ticker, nombre) de una empresa por su símbolo de cotización.
 * @param {string} ticker - Símbolo bursátil.
 * @returns {Promise<{cik: number|string, ticker: string, name: string}>} Objeto empresa.
 */
export async function getCompanyByTicker(ticker) {
  const map = await getTickerMap();
  const up = ticker.toUpperCase();
  const normalized = up.replace(/\./g, '-');
  const company = map.get(up) ?? map.get(normalized);
  if (!company) {
    throw notFound(`No se encontró la empresa "${ticker}" en EDGAR.`);
  }
  return company;
}

/**
 * Descarga los XBRL Company Facts con caché en memoria.
 * @param {object} company - Objeto empresa con ticker y CIK.
 * @returns {Promise<object>} Hechos XBRL.
 */
export async function getCompanyFacts(company) {
  const cached = factsCache.get(company.ticker);
  if (cached && Date.now() - cached.at < FACTS_TTL) {
    return cached.data;
  }
  const url = FACTS_URL_TEMPLATE.replace('{CIK}', String(company.cik).padStart(10, '0'));
  const data = await fetchSecJson(url);
  factsCache.set(company.ticker, { data, at: Date.now() });
  return data;
}

/**
 * Descarga las presentaciones (submissions) de la empresa ante la SEC con caché en memoria.
 * @param {object} company - Objeto empresa.
 * @returns {Promise<object>} Submissions de la SEC.
 */
export async function getCompanySubmissions(company) {
  const cached = filingsCache.get(company.ticker);
  if (cached && Date.now() - cached.at < FILINGS_TTL) {
    return cached.data;
  }
  const url = SUBMISSIONS_URL_TEMPLATE.replace('{CIK}', String(company.cik).padStart(10, '0'));
  const data = await fetchSecJson(url);
  filingsCache.set(company.ticker, { data, at: Date.now() });
  return data;
}

/**
 * Extrae el valor numérico más reciente de un concepto contable en los hechos XBRL.
 * @param {object} facts - Hechos contables de la empresa.
 * @param {string} namespace - Espacio de nombres ('us-gaap', 'dei').
 * @param {string[]} tags - Lista priorizada de etiquetas XBRL.
 * @param {string} unit - Unidad de medida ('USD', 'shares').
 * @param {Function} [predicate=() => true] - Filtro de validación opcional.
 * @returns {number|null} Último valor encontrado o null.
 */
export function latestFactValue(facts, namespace, tags, unit, predicate = () => true) {
  const candidates = [];
  for (const tag of tags) {
    const unitData = facts?.facts?.[namespace]?.[tag]?.units?.[unit];
    if (!Array.isArray(unitData)) continue;
    candidates.push(...unitData.filter((entry) => Number.isFinite(Number(entry.val)) && predicate(Number(entry.val), entry)));
  }
  candidates.sort((a, b) => {
    const end = String(b.end ?? '').localeCompare(String(a.end ?? ''));
    if (end !== 0) return end;
    const start = String(b.start ?? '').localeCompare(String(a.start ?? ''));
    if (start !== 0) return start;
    return String(b.filed ?? '').localeCompare(String(a.filed ?? ''));
  });
  return candidates[0]?.val ?? null;
}

/**
 * Traduce el código SIC en el nombre del sector económico.
 * @param {number|string} sic - Código SIC de la empresa.
 * @returns {string|null} Sector traducido.
 */
export function profileSector(sic) {
  const code = Number(sic);
  if (!Number.isFinite(code)) return null;
  if ((code >= 2000 && code <= 2199) || (code >= 2830 && code <= 2836) || (code >= 2840 && code <= 2844)) {
    return 'Consumo defensivo';
  }
  if (code >= 2000 && code <= 2099) return 'Alimentación y bebidas';
  if (code >= 2100 && code <= 2199) return 'Tabaco';
  if (code >= 2800 && code <= 2899) return 'Química y farmacéutica';
  return SIC_SECTORS[Math.floor(code / 100)] ?? '—';
}

/**
 * Traduce y normaliza la descripción de la industria.
 * @param {string} description - Descripción original en inglés.
 * @returns {string|null} Nombre de la industria en español.
 */
export function profileIndustry(description) {
  const translations = {
    'Malt Beverages': 'Bebidas malteadas',
    'Bottled and Canned Soft Drinks and Carbonated Waters': 'Bebidas refrescantes',
    Cigarettes: 'Cigarrillos',
    'Tobacco Products': 'Productos de tabaco',
    'Grocery Stores': 'Supermercados',
  };
  return translations[description] ?? description ?? null;
}

/**
 * Extrae y formatea la dirección de la sede corporativa.
 * @param {object} submissions - Submissions de la SEC.
 * @returns {string|null} Dirección física o null.
 */
export function profileAddress(submissions) {
  const address = submissions?.addresses?.business ?? submissions?.addresses?.mailing;
  if (!address) return null;
  return [address.street1, address.street2, address.city, address.stateOrCountryDescription, address.zipCode]
    .filter(Boolean)
    .join(', ')
    .replaceAll(' ,', ',');
}

/**
 * Identifica el país de origen de la empresa.
 * @param {object} submissions - Submissions de la SEC.
 * @returns {string|null} País o 'Estados Unidos'.
 */
export function profileCountry(submissions) {
  const address = submissions?.addresses?.business ?? submissions?.addresses?.mailing;
  if (!address) return null;
  if (address?.isForeignLocation === 1 || address?.countryCode) return address.countryCode ?? address.stateOrCountryDescription ?? '—';
  return 'Estados Unidos';
}

/**
 * Obtiene la bolsa o mercado donde cotiza la compañía.
 * @param {object} company - Objeto empresa.
 * @param {object} submissions - Submissions de la SEC.
 * @returns {string|null} Nombre del mercado (ej. NYSE, NASDAQ).
 */
export function profileExchange(company, submissions) {
  const tickerIndex = Array.isArray(submissions?.tickers)
    ? submissions.tickers.findIndex((ticker) => ticker === company.ticker)
    : -1;
  return submissions?.exchanges?.[tickerIndex] ?? submissions?.exchanges?.[0] ?? null;
}

/**
 * Obtiene el país y sector de procedencia de la empresa.
 * @param {string} ticker - Ticker de la compañía.
 * @returns {Promise<{sector: string, country: string}>} Sector y país.
 */
export async function getCompanyOrigin(ticker) {
  const company = await getCompanyByTicker(ticker);
  const submissions = await getCompanySubmissions(company);
  return {
    sector: profileSector(submissions?.sic) ?? '—',
    country: profileCountry(submissions),
  };
}

/**
 * Retorna el sector económico asignado a una cotizada.
 * @param {string} ticker - Ticker de la compañía.
 * @returns {Promise<string>} Sector económico.
 */
export async function getCompanySector(ticker) {
  const origin = await getCompanyOrigin(ticker);
  return origin.sector;
}

/**
 * Genera el perfil corporativo enriquecido para vistas y metadatos SEO.
 * @param {string} ticker - Ticker del activo.
 * @returns {Promise<object>} Perfil SEO completo con presentaciones recientes.
 */
export async function getCompanySeoProfile(ticker) {
  const company = await getCompanyByTicker(ticker);
  const submissions = await getCompanySubmissions(company);
  const recent = normalizeRecentFilings(submissions?.filings?.recent);
  const lastFiling = recent.find((entry) => entry.form === '10-K' || entry.form === '10-Q');
  const recentFilings = recent
    .filter((entry) => entry.form === '10-Q' || entry.form === '10-K')
    .slice(0, 8)
    .map((entry) => {
      const periodInfo = getFiscalPeriodInfo(entry.form, entry.reportDate, submissions?.fiscalYearEnd);
      return {
        form: entry.form,
        filedAt: entry.filingDate ?? null,
        period: entry.reportDate ?? null,
        periodLabel: periodInfo.label,
        quarter: periodInfo.quarter,
        fiscalYear: periodInfo.fiscalYear,
        accession: entry.accessionNumber ?? null,
        primaryDocument: entry.primaryDocument ?? null,
      };
    });
  return {
    ticker: company.ticker,
    name: company.name,
    cik: company.cik,
    exchange: profileExchange(company, submissions),
    sector: profileSector(submissions?.sic),
    industry: profileIndustry(submissions?.sicDescription),
    country: profileCountry(submissions),
    lastFiling: lastFiling
      ? { form: lastFiling.form, filedAt: lastFiling.filingDate ?? null, period: lastFiling.reportDate ?? null }
      : null,
    recentFilings,
  };
}

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
export function buildCompanyProfile(company, facts, submissions, annual, quarterly, market) {
  const latestStatement = annual[0] ?? quarterly[0] ?? { values: {} };
  const values = latestStatement.values ?? {};
  const latestShares = quarterly[0]?.values?.weightedSharesDiluted
    ?? annual[0]?.values?.weightedSharesDiluted
    ?? quarterly[0]?.values?.sharesOutstanding
    ?? annual[0]?.values?.sharesOutstanding
    ?? quarterly[0]?.values?.weightedSharesBasic
    ?? annual[0]?.values?.weightedSharesBasic
    ?? latestFactValue(facts, 'dei', ['EntityCommonStockSharesOutstanding'], 'shares', (value) => value > 0)
    ?? latestFactValue(facts, 'us-gaap', ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'], 'shares', (value) => value > 0);
  const exchange = profileExchange(company, submissions);
  const industry = profileIndustry(submissions?.sicDescription);
  const address = profileAddress(submissions);
  const shares = latestShares ?? null;
  const marketCap = market?.price && shares ? market.price * shares : null;
  const recentFiling = normalizeRecentFilings(submissions?.filings?.recent)
    .find((entry) => entry.form === '10-Q' || entry.form === '10-K');
  const descriptionParts = [
    exchange ? `${company.name} cotiza en ${exchange}.` : `${company.name} es una empresa cotizada.`,
    industry ? `La SEC la clasifica en ${industry.toLowerCase()}.` : null,
    address ? `Domicilio registrado: ${address}.` : null,
  ].filter(Boolean);

  const recent4Quarters = quarterly.slice(0, 4);
  let ebitdaVal = null;
  if (recent4Quarters.length === 4) {
    const sumNorm = recent4Quarters.reduce((acc, q) => acc + (Number(q.values?.ebitdaNormalized ?? q.values?.ebitda) || 0), 0);
    const sumRaw = recent4Quarters.reduce((acc, q) => acc + (Number(q.values?.ebitda) || 0), 0);
    ebitdaVal = sumNorm > 0 ? sumNorm : (sumRaw > 0 ? sumRaw : null);
  }
  if (!ebitdaVal) {
    ebitdaVal = Number(annual[0]?.values?.ebitdaNormalized ?? annual[0]?.values?.ebitda) || null;
  }
  const totalDebtVal = quarterly[0]?.values?.totalDebt ?? annual[0]?.values?.totalDebt ?? values.totalDebt ?? null;
  const cashVal = quarterly[0]?.values?.cashAndShortTermInvestments ?? quarterly[0]?.values?.cash ?? annual[0]?.values?.cashAndShortTermInvestments ?? annual[0]?.values?.cash ?? values.cashAndShortTermInvestments ?? values.cash ?? null;
  const netDebtVal = quarterly[0]?.values?.netDebt ?? annual[0]?.values?.netDebt ?? (Number.isFinite(Number(totalDebtVal)) && Number.isFinite(Number(cashVal)) ? Number(totalDebtVal) - Number(cashVal) : values.netDebt ?? null);
  const enterpriseValueVal = Number.isFinite(Number(marketCap))
    ? (Number.isFinite(Number(netDebtVal)) ? marketCap + Number(netDebtVal) : marketCap)
    : null;
  const evToEbitdaVal = Number.isFinite(Number(enterpriseValueVal)) && Number(enterpriseValueVal) > 0 && Number.isFinite(Number(ebitdaVal)) && Number(ebitdaVal) > 0
    ? Math.round((Number(enterpriseValueVal) / Number(ebitdaVal)) * 100) / 100
    : null;
  const netDebtToEbitdaVal = Number.isFinite(Number(netDebtVal)) && Number(ebitdaVal) > 0
    ? Math.round((Number(netDebtVal) / Number(ebitdaVal)) * 100) / 100
    : null;

  return {
    market: market ?? {
      currency: 'USD',
      source: 'Yahoo Finance',
      sparkline: [],
    },
    metrics: {
      marketCap,
      week52Low: market?.week52Low ?? null,
      week52High: market?.week52High ?? null,
      beta: market?.beta ?? null,
      dividendPerShare: market?.dividendPerShare ?? annual[0]?.values?.dividendPerShare ?? null,
      dividendYield: market?.dividendYield ?? (market?.price && annual[0]?.values?.dividendPerShare ? Math.round(((Number(annual[0].values.dividendPerShare) / Number(market.price)) * 100) * 100) / 100 : null),
      volume: market?.volume ?? null,
      revenue: values.revenue ?? null,
      eps: values.epsDiluted ?? null,
      peRatio: market?.price && values.epsDiluted > 0 ? market.price / values.epsDiluted : null,
      shares,
      yearChangePercent: market?.yearChangePercent ?? null,
      dayLow: market?.dayLow ?? null,
      dayHigh: market?.dayHigh ?? null,
      previousClose: market?.previousClose ?? null,
      ipoDate: market?.ipoDate ?? null,
      ebitda: ebitdaVal,
      totalDebt: totalDebtVal,
      cash: cashVal,
      netDebt: netDebtVal,
      enterpriseValue: enterpriseValueVal,
      evToEbitda: evToEbitdaVal,
      netDebtToEbitda: netDebtToEbitdaVal,
      freeCashFlow: values.freeCashFlow ?? null,
      cashFlowPerShare: values.cashFlowPerShare ?? null,
      priceToFcf: market?.price && values.cashFlowPerShare > 0 ? market.price / values.cashFlowPerShare : (marketCap && values.freeCashFlow > 0 ? marketCap / values.freeCashFlow : null),
    },
    info: {
      country: profileCountry(submissions),
      sector: profileSector(submissions?.sic),
      industry,
      exchange,
      fiscalYearEnd: submissions?.fiscalYearEnd ?? null,
      address,
      latestFiling: recentFiling
        ? { formType: recentFiling.form, period: recentFiling.reportDate ?? null, filedAt: recentFiling.filingDate ?? null }
        : null,
    },
    description: descriptionParts.join(' '),
    sources: {
      financial: 'SEC EDGAR',
      market: market?.source ?? 'Yahoo Finance',
    },
  };
}
