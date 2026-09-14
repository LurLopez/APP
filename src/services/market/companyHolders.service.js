/**
 * @fileoverview Consulta del accionariado institucional, fondos e insiders de empresas a partir de modelos 13F.
 * @module services/market/companyHolders
 */

import { getYahooSession, MARKET_TIMEOUT } from './yahooClient.service.js';

const HOLDERS_TTL = 12 * 60 * 60 * 1000;
const holdersCache = new Map();

const COUNTRY_RULES = [
  { pattern: /\b(australia|dfa australia|macquarie)\b/i, code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { pattern: /\b(u\.?k\.?|british|baillie gifford|schroders|legal & general|barclays|hsbc|abrdn|man group)\b/i, code: 'GB', flag: '🇬🇧', name: 'Reino Unido' },
  { pattern: /\b(norges|norway)\b/i, code: 'NO', flag: '🇳🇴', name: 'Noruega' },
  { pattern: /\b(ubs|credit suisse|pictet|vontobel|swiss|switzerland)\b/i, code: 'CH', flag: '🇨🇭', name: 'Suiza' },
  { pattern: /\b(rbc|royal bank of canada|td asset|toronto dominion|bmo|scotiabank|brookfield|canada)\b/i, code: 'CA', flag: '🇨🇦', name: 'Canadá' },
  { pattern: /\b(amundi|bnp paribas|societe generale|crédit agricole|natixis|carmignac|france)\b/i, code: 'FR', flag: '🇫🇷', name: 'Francia' },
  { pattern: /\b(allianz|dws|deutsche|flossbach|germany)\b/i, code: 'DE', flag: '🇩🇪', name: 'Alemania' },
  { pattern: /\b(nomura|sumitomo|mizuho|mitsubishi|daiwa|japan)\b/i, code: 'JP', flag: '🇯🇵', name: 'Japón' },
  { pattern: /\b(temasek|gic|singapore)\b/i, code: 'SG', flag: '🇸🇬', name: 'Singapur' },
  { pattern: /\b(blackrock|vanguard|state street|dodge & cox|aqr|fidelity|geode|jpmorgan|morgan stanley|capital world|capital research|t\.? rowe|invesco|franklin|wellington|lsv|northern trust|bank of america|goldman sachs|wells fargo|berkshire)\b/i, code: 'US', flag: '🇺🇸', name: 'Estados Unidos' },
];

/**
 * Identifica el país de procedencia de una institución financiera a partir de su razón social.
 * @param {string} name - Nombre de la entidad.
 * @returns {{ code: string, flag: string, name: string }}
 */
export function detectHolderCountry(name) {
  if (!name) return { code: 'US', flag: '🇺🇸', name: 'Estados Unidos' };
  for (const rule of COUNTRY_RULES) {
    if (rule.pattern.test(name)) return { code: rule.code, flag: rule.flag, name: rule.name };
  }
  return { code: 'US', flag: '🇺🇸', name: 'Estados Unidos' };
}

/**
 * Consulta la estructura accionarial completa (desglose general, instituciones, fondos e insiders).
 * @param {string} ticker - Ticker bursátil.
 * @returns {Promise<Object>}
 */
export async function getCompanyHolders(ticker) {
  const normalizedTicker = String(ticker).trim().toUpperCase();
  const cached = holdersCache.get(normalizedTicker);
  if (cached && Date.now() - cached.at < HOLDERS_TTL) {
    return cached.data;
  }

  let session = await getYahooSession();
  const modules = 'institutionOwnership,fundOwnership,majorHoldersBreakdown,insiderHolders';
  let url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(normalizedTicker)}?crumb=${encodeURIComponent(session.crumb)}&modules=${modules}`;

  let res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Cookie: session.cookie,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(MARKET_TIMEOUT),
  });

  if (res.status === 401 || res.status === 403) {
    session = await getYahooSession(true);
    url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(normalizedTicker)}?crumb=${encodeURIComponent(session.crumb)}&modules=${modules}`;
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Cookie: session.cookie,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(MARKET_TIMEOUT),
    });
  }

  if (!res.ok) {
    throw new Error(`Yahoo Finance respondió ${res.status} al consultar accionariado`);
  }

  const json = await res.json();
  const summary = json?.quoteSummary?.result?.[0];
  if (!summary) {
    throw new Error('No se encontraron datos de accionariado');
  }

  const breakdownRaw = summary.majorHoldersBreakdown ?? {};
  const breakdown = {
    insidersPercent: breakdownRaw.insidersPercentHeld?.raw ?? null,
    institutionsPercent: breakdownRaw.institutionsPercentHeld?.raw ?? null,
    institutionsFloatPercent: breakdownRaw.institutionsFloatPercentHeld?.raw ?? null,
    institutionsCount: breakdownRaw.institutionsCount?.raw ?? null,
  };

  const institutions = (summary.institutionOwnership?.ownershipList ?? []).map((item) => ({
    name: item.organization,
    country: detectHolderCountry(item.organization),
    shares: item.position?.raw ?? null,
    sharesFormatted: item.position?.fmt ?? null,
    percentage: item.pctHeld?.raw ?? null,
    percentageFormatted: item.pctHeld?.fmt ?? null,
    value: item.value?.raw ?? null,
    valueFormatted: item.value?.fmt ?? null,
    changePercent: item.pctChange?.raw ?? null,
    changePercentFormatted: item.pctChange?.fmt ?? null,
    reportDate: item.reportDate?.fmt ?? null,
  }));

  const funds = (summary.fundOwnership?.ownershipList ?? []).map((item) => ({
    name: item.organization,
    country: detectHolderCountry(item.organization),
    shares: item.position?.raw ?? null,
    sharesFormatted: item.position?.fmt ?? null,
    percentage: item.pctHeld?.raw ?? null,
    percentageFormatted: item.pctHeld?.fmt ?? null,
    value: item.value?.raw ?? null,
    valueFormatted: item.value?.fmt ?? null,
    changePercent: item.pctChange?.raw ?? null,
    changePercentFormatted: item.pctChange?.fmt ?? null,
    reportDate: item.reportDate?.fmt ?? null,
  }));

  const insiders = (summary.insiderHolders?.holders ?? []).map((item) => ({
    name: item.name,
    relation: item.relation,
    position: item.positionDirect?.raw ?? null,
    positionFormatted: item.positionDirect?.fmt ?? null,
    transactionDescription: item.transactionDescription ?? null,
    reportDate: item.latestTransDate?.fmt ?? null,
  }));

  const data = {
    ticker: normalizedTicker,
    breakdown,
    institutions,
    funds,
    insiders,
    source: 'SEC Form 13F / Yahoo Finance',
    updatedAt: new Date().toISOString(),
  };

  holdersCache.set(normalizedTicker, { data, at: Date.now() });
  return data;
}
