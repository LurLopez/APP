/**
 * @fileoverview Fachada centralizada para integración con la SEC (EDGAR), XBRL y métricas de valoración.
 * @module services/edgar.service
 */

export {
  searchCompanies,
  getCompanyByTicker,
  getCompanyOrigin,
  getCompanySector,
  getCompanySeoProfile,
} from './edgar/companyProfile.js';

export {
  getFiscalPeriodInfo,
  filingPeriodLabel,
  getCompanyFilings,
} from './edgar/filingPeriods.js';

export {
  getHistoricalUnderlyingEps,
} from './edgar/historicalEps.js';

export {
  getFilingDocumentStream,
  getFilingContentBuffer,
  getFilingPreview,
} from './edgar/filingDocuments.js';

export {
  getCachedFilingPresentations,
  getFilingsPresentationsMap,
  getFilingsWithPresentations,
  getFilingPresentations,
  getPresentationBuffers,
} from './edgar/filingPresentations.js';

export {
  buildDebtMaturitiesFromFacts,
} from './edgar/debtMaturities.js';

export {
  getCompanyResults,
  getPreviousQuarterCashFlow,
} from './edgar/companyResults.js';

export {
  getValuationSeries,
} from './edgar/valuationSeries.js';
