/**
 * @fileoverview Módulo extraído de companyProfile.js.
 */

import { SUBMISSIONS_URL_TEMPLATE, FILINGS_TTL } from './statementConcepts.js';
import { fetchSecJson, getTickerMap, notFound } from './secClient.js';
import { normalizeRecentFilings, getFiscalPeriodInfo } from './filingPeriods.js';

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

export const WELL_KNOWN_ORIGINS = {
  AAPL: { sector: 'Maquinaria', country: 'Estados Unidos', cik: 320193, name: 'Apple Inc.' },
  MSFT: { sector: 'Servicios informáticos', country: 'Estados Unidos', cik: 789019, name: 'MICROSOFT CORP' },
  GOOGL: { sector: 'Servicios informáticos', country: 'Estados Unidos', cik: 1652044, name: 'Alphabet Inc.' },
  GOOG: { sector: 'Servicios informáticos', country: 'Estados Unidos', cik: 1652044, name: 'Alphabet Inc.' },
  NVDA: { sector: 'Electrónica', country: 'Estados Unidos', cik: 1045810, name: 'NVIDIA CORP' },
  META: { sector: 'Servicios informáticos', country: 'Estados Unidos', cik: 1326801, name: 'Meta Platforms, Inc.' },
  AMZN: { sector: 'Comercio minorista', country: 'Estados Unidos', cik: 1018724, name: 'AMAZON COM INC' },
  KO: { sector: 'Consumo defensivo', country: 'Estados Unidos', cik: 21344, name: 'COCA COLA CO' },
  PEP: { sector: 'Consumo defensivo', country: 'Estados Unidos', cik: 77476, name: 'PEPSICO INC' },
  PG: { sector: 'Consumo defensivo', country: 'Estados Unidos', cik: 80424, name: 'PROCTER & GAMBLE Co' },
  CAG: { sector: 'Consumo defensivo', country: 'Estados Unidos', cik: 23217, name: 'CONAGRA BRANDS INC.' },
  GIS: { sector: 'Consumo defensivo', country: 'Estados Unidos', cik: 40704, name: 'GENERAL MILLS INC' },
  JNJ: { sector: 'Consumo defensivo', country: 'Estados Unidos', cik: 200406, name: 'JOHNSON & JOHNSON' },
  PFE: { sector: 'Consumo defensivo', country: 'Estados Unidos', cik: 78003, name: 'PFIZER INC' },
  ABBV: { sector: 'Consumo defensivo', country: 'Estados Unidos', cik: 1551152, name: 'AbbVie Inc.' },
  UNH: { sector: 'Seguros', country: 'Estados Unidos', cik: 731766, name: 'UNITEDHEALTH GROUP INC' },
  JPM: { sector: 'Bancos', country: 'Estados Unidos', cik: 19617, name: 'JPMORGAN CHASE & CO' },
  BAC: { sector: 'Bancos', country: 'Estados Unidos', cik: 70858, name: 'BANK OF AMERICA CORP /DE/' },
  V: { sector: 'Servicios informáticos', country: 'Estados Unidos', cik: 1403161, name: 'VISA INC.' },
  HD: { sector: 'Comercio minorista', country: 'Estados Unidos', cik: 354950, name: 'HOME DEPOT, INC.' },
  MCD: { sector: 'Restauración', country: 'Estados Unidos', cik: 63908, name: 'MCDONALDS CORP' },
  WMT: { sector: 'Comercio minorista', country: 'Estados Unidos', cik: 104169, name: 'Walmart Inc.' },
  COST: { sector: 'Comercio minorista', country: 'Estados Unidos', cik: 909832, name: 'COSTCO WHOLESALE CORP /NEW' },
  CAT: { sector: 'Maquinaria', country: 'Estados Unidos', cik: 18230, name: 'CATERPILLAR INC' },
  HON: { sector: 'Vehículos', country: 'Estados Unidos', cik: 773840, name: 'HONEYWELL INTERNATIONAL INC' },
  XOM: { sector: 'Petróleo y gas', country: 'Estados Unidos', cik: 34088, name: 'EXXON MOBIL CORP' },
  CVX: { sector: 'Petróleo y gas', country: 'Estados Unidos', cik: 93410, name: 'CHEVRON CORP' },
  DIS: { sector: 'Entretenimiento', country: 'Estados Unidos', cik: 1744489, name: 'Walt Disney Co' },
  NKE: { sector: 'Plásticos y caucho', country: 'Estados Unidos', cik: 320187, name: 'NIKE, Inc.' },
};

export async function getCompanyByTicker(ticker) {
  const up = ticker.toUpperCase();
  const normalized = up.replace(/\./g, '-');
  try {
    const map = await getTickerMap();
    const company = map.get(up) ?? map.get(normalized);
    if (company) return company;
  } catch {
    // Si EDGAR falla por rate limiting o caída, intentamos resolver con los conocidos
  }
  const fallback = WELL_KNOWN_ORIGINS[up] ?? WELL_KNOWN_ORIGINS[normalized];
  if (fallback) {
    return { cik: fallback.cik, ticker: up, name: fallback.name };
  }
  throw notFound(`No se encontró la empresa "${ticker}" en EDGAR.`);
}

const pendingSubmissions = new Map();

export async function getCompanySubmissions(company) {
  const cached = filingsCache.get(company.ticker);
  if (cached && Date.now() - cached.at < FILINGS_TTL) {
    return cached.data;
  }
  if (pendingSubmissions.has(company.ticker)) {
    return pendingSubmissions.get(company.ticker);
  }
  const promise = (async () => {
    try {
      const url = SUBMISSIONS_URL_TEMPLATE.replace('{CIK}', String(company.cik).padStart(10, '0'));
      const data = await fetchSecJson(url);
      filingsCache.set(company.ticker, { data, at: Date.now() });
      return data;
    } finally {
      pendingSubmissions.delete(company.ticker);
    }
  })();
  pendingSubmissions.set(company.ticker, promise);
  return promise;
}

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

export function profileAddress(submissions) {
  const address = submissions?.addresses?.business ?? submissions?.addresses?.mailing;
  if (!address) return null;
  return [address.street1, address.street2, address.city, address.stateOrCountryDescription, address.zipCode]
    .filter(Boolean)
    .join(', ')
    .replaceAll(' ,', ',');
}

export function profileCountry(submissions) {
  const address = submissions?.addresses?.business ?? submissions?.addresses?.mailing;
  if (!address) return null;
  if (address?.isForeignLocation === 1 || address?.countryCode) return address.countryCode ?? address.stateOrCountryDescription ?? '—';
  return 'Estados Unidos';
}

export function profileExchange(company, submissions) {
  const tickerIndex = Array.isArray(submissions?.tickers)
    ? submissions.tickers.findIndex((ticker) => ticker === company.ticker)
    : -1;
  return submissions?.exchanges?.[tickerIndex] ?? submissions?.exchanges?.[0] ?? null;
}

export async function getCompanyOrigin(ticker) {
  const up = String(ticker ?? '').toUpperCase();
  const normalized = up.replace(/\./g, '-');
  try {
    const company = await getCompanyByTicker(ticker);
    const submissions = await getCompanySubmissions(company);
    return {
      sector: profileSector(submissions?.sic) ?? WELL_KNOWN_ORIGINS[up]?.sector ?? '—',
      country: profileCountry(submissions) ?? WELL_KNOWN_ORIGINS[up]?.country ?? '—',
    };
  } catch (error) {
    const fallback = WELL_KNOWN_ORIGINS[up] ?? WELL_KNOWN_ORIGINS[normalized];
    if (fallback) {
      return { sector: fallback.sector, country: fallback.country };
    }
    throw error;
  }
}

export async function getCompanySector(ticker) {
  const origin = await getCompanyOrigin(ticker);
  return origin.sector;
}

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

export function buildCompanyProfile(company, facts, submissions, annual, quarterly, market, { lang = 'es' } = {}) {
  const isEn = lang === 'en';
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
    exchange
      ? (isEn ? `${company.name} is listed on ${exchange}.` : `${company.name} cotiza en ${exchange}.`)
      : (isEn ? `${company.name} is a publicly traded company.` : `${company.name} es una empresa cotizada.`),
    industry
      ? (isEn ? `The SEC classifies it under ${industry.toLowerCase()}.` : `La SEC la clasifica en ${industry.toLowerCase()}.`)
      : null,
    address
      ? (isEn ? `Registered address: ${address}.` : `Domicilio registrado: ${address}.`)
      : null,
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
