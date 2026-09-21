/**
 * @fileoverview Construcción de series históricas continuas de múltiplos de valoración (EV/EBITDA, PER, P/FCF, etc.).
 * @module services/edgar/valuationSeries
 */

export { VALUATION_RANGES, sanitizeValuationSeries, getValuationSeries } from './valuationSeries.core.js';
export { pointInTimeSnapshot } from './valuationPointInTime.js';

import { getHistoricalPrices } from '../market.service.js';
import {
  getCompanyByTicker,
  getCompanyFacts,
  getCompanySubmissions,
} from './companyProfile.js';
import { buildSeries } from './factsSeries.js';
import { getExtensionFacts, mergeInstanceFacts } from './instanceFacts.js';
import {
  propagateMissingShares,
  harmonizeSeriesSplits,
} from './sharesHarmonizer.js';
import {
  rederiveCashValues,
  rederiveIncomeValues,
  rederiveBalanceValues,
} from './rederiveStatements.js';

