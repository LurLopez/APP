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
  isFilingDocumentCached,
  isFilingPreviewCached,
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
} from './edgar/companyResults.js';

export {
  getPreviousQuarterCashFlow,
} from './edgar/previousQuarterCashFlow.js';

export {
  getValuationSeries,
} from './edgar/valuationSeries.js';
