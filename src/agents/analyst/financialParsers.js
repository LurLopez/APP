/**
 * @fileoverview Funciones de extracción textual, formateo numérico y parseo de magnitudes financieras de filings SEC.
 * @module agents/analyst/financialParsers
 */

export { parseFinancialValue, extractTaxCashFlowAdjustment, extractIncomeTaxesPaid, extractStockCompensation, extractCapitalCashFlowFacts, extractAnnualWorkingCapitalChange, extractEquityIssuance, extractDebtCashFlow, parseLooseReportNumber, normalizeNumericCell, parseDollarAmount, extractRemainingAuthorization, extractRepurchaseProgramTerms, extractRepurchaseFactsFromText, extractExecutiveChangesFromText, isStaleExecutiveChange, isPlaceholderText, cleanAssetDescription } from './financialParsersExtract.js';
export { parseLooseAmount, computeAllDebtAverageRate, computeEstimatedDebtRateFromIncome, formatFinancialValue, formatCellNumber, normalizeExtractedUnits, formatFiscalEndLabel } from './financialParsersFormat.js';

/**
 * Interpreta cifras del informe con separador de miles de la SEC ("(16,615)" -> -16615) o con coma decimal ("1784,4" -> 1784.4).
 * @param {string|number} val - Entrada a parsear.
 * @returns {number} Valor numérico o NaN.
 */

