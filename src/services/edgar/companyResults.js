/**
 * @fileoverview Carga orquestada de resultados financieros, estados contables y conciliación trimestral de flujo de caja.
 * @module services/edgar/companyResults
 */

import { getMarketProfile } from '../market.service.js';
import {
  getCompanyByTicker,
  getCompanyFacts,
  getCompanySubmissions,
  buildCompanyProfile,
} from './companyProfile.js';
import { buildSeries } from './factsSeries.js';
import { buildDebtMaturitiesFromFacts } from './debtMaturities.js';
import { getExtensionFacts, mergeInstanceFacts } from './instanceFacts.js';
import {
  rederiveCashValues,
  rederiveIncomeValues,
  rederiveBalanceValues,
} from './rederiveStatements.js';
import {
  normalizeShareUnits,
  propagateMissingShares,
  harmonizeSeriesSplits,
} from './sharesHarmonizer.js';
import { publicStatements } from './statementDisplay.js';

/**
 * Obtiene el conjunto completo de estados financieros anuales y trimestrales armonizados, perfil y deuda.
 * @param {string} ticker - Símbolo bursátil.
 * @param {object} [options={}] - Opciones adicionales (ej. autenticado).
 * @returns {Promise<object>} Resultados financieros integrales.
 */
export async function getCompanyResults(ticker, options = {}) {
  const company = await getCompanyByTicker(ticker);
  const [facts, submissions, market] = await Promise.all([
    getCompanyFacts(company),
    getCompanySubmissions(company).catch(() => null),
    getMarketProfile(company.ticker).catch(() => null),
  ]);
  const { annual, quarterly } = buildSeries(facts);
  const debtMaturities = buildDebtMaturitiesFromFacts(facts);
  try {
    const extensionFacts = await getExtensionFacts(company);
    mergeInstanceFacts(annual, quarterly, extensionFacts, company.ticker);
  } catch {
    // Si falla el rescate desde instancias XBRL, se continúa con los datos estándar.
  }
  normalizeShareUnits(annual, quarterly);
  propagateMissingShares(annual, quarterly);
  rederiveCashValues(annual, quarterly);
  rederiveIncomeValues(annual, quarterly);
  rederiveBalanceValues(annual, quarterly);
  harmonizeSeriesSplits(annual, quarterly);
  const authenticated = options.authenticated === true;
  return {
    company: { ticker: company.ticker, name: company.name, cik: company.cik },
    currency: 'USD',
    authenticated,
    profile: buildCompanyProfile(company, facts, submissions ?? {}, annual, quarterly, market, { lang: options.lang }),
    statements: publicStatements(),
    annual,
    quarterly,
    debtMaturities,
  };
}
