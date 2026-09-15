/**
 * @fileoverview Módulo extraído de companyProfile.js.
 */

import { FACTS_URL_TEMPLATE, FACTS_TTL } from './statementConcepts.js';
import { fetchSecJson } from './secClient.js';

const factsCache = new Map();

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
