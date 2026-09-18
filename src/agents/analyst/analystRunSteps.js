/**
 * @fileoverview Pasos del pipeline del Agente Analista: fallbacks de regex sobre
 * el texto del filing, respaldo XBRL de EDGAR, trimestre previo, recuperación
 * anual de vencimientos/refinanciación y estructuración final del informe.
 * @module agents/analyst/analystRunSteps
 */

import { AgentError } from '../baseAgent.js';
import { chatJson, AiProviderError } from '../../services/ai/modelProvider.js';
import { getPreviousQuarterCashFlow, getCompanyResults } from '../../services/edgar.service.js';
import {
  normalizeExtractedUnits,
  extractTaxCashFlowAdjustment,
  extractIncomeTaxesPaid,
  extractCapitalCashFlowFacts,
  extractEquityIssuance,
  extractDebtCashFlow,
  extractRemainingAuthorization,
  extractRepurchaseProgramTerms,
  extractRepurchaseFactsFromText,
  extractExecutiveChangesFromText,
  parseLooseAmount,
} from './financialParsers.js';
import { buildDividendHistoryFromEdgar } from './historyBuilders.js';
import { buildMaturityScheduleFromDebtTable, buildMaturityScheduleFromFilingText, normalizeMaturityPayload, maturityItemsLookBucketed, maturityTableLooksIncomplete, pickCoveringMaturitySchedule, weightedAverageRateFromItems } from './debtMaturityFallback.js';
import { buildDebtMaturityPrompt } from './debtMaturityPrompt.js';
import { buildDebtRefinancingPrompt } from './debtRefinancingPrompt.js';
import { loadKnowledgeRules, buildAnalysisText, extractDebtFilingText, extractRefinancingFilingText } from './filingExtractor.js';
import {
  EXTRACTION_SCHEMA,
  EXTRACTION_PROMPT,
  OUTPUT_SCHEMA,
  ANNUAL_OUTPUT_SCHEMA,
  SYSTEM_PROMPT,
  ANNUAL_SYSTEM_PROMPT,
} from './analystPrompts.js';
import {
  normalizeSalesBlock,
  normalizeCashFlowBlock,
  normalizeCapitalBlock,
} from './analystHorizonProcessor.js';
import {
  processRepurchasesSection,
  processExecutiveChangesSection,
  processOutlookSection,
  processDebtSection,
  processAcquisitionsDividendsAndWatchlist,
  renumberConclusionSections,
} from './annualConclusionProcessor.js';
import { normalizeLanguage, t } from '../../utils/i18n.js';

export function resolveAnalysisInput(input) {
  const formType = input.formType ?? '10-Q';
  return {
    sector: input.sector ?? 'defensive_consumer',
    subsector: input.subsector ?? null,
    formType,
    language: normalizeLanguage(input.language),
    isAnnual: String(formType).toUpperCase().includes('10-K') || String(formType).toLowerCase().includes('anual'),
  };
}

export async function loadSectorRules({ sector, subsector, formType, ticker }) {
  try {
    return await loadKnowledgeRules(sector, subsector, formType, ticker ?? null);
  } catch {
    throw new AgentError(`No hay reglas de análisis definidas para el sector ${sector}.`, 'NO_SECTOR_RULES');
  }
}

export async function runExtraction({ text, presentationText, languageDirective }) {
  const extractionPrompt = `${EXTRACTION_PROMPT.replace('{SCHEMA}', EXTRACTION_SCHEMA.trim())}\n\n${languageDirective}`;
  try {
    return await chatJson([
      { role: 'system', content: extractionPrompt },
      { role: 'user', content: buildAnalysisText(text, presentationText) },
    ]);
  } catch (error) {
    console.error('[analyst:extraction]', error.message);
    if (error instanceof AiProviderError) throw error;
    throw new AgentError('No se pudieron extraer los datos del informe.', 'INVALID_MODEL_RESPONSE');
  }
}

function assignIfMissing(target, key, value) {
  if (target[key] == null) target[key] = value;
}

function applyCapitalCashFlowFallbacks(extracted, rawText) {
  const facts = extractCapitalCashFlowFacts(rawText);
  if (facts.shareBuybacks != null) assignIfMissing(extracted.facts, 'shareBuybacks', facts.shareBuybacks);
  if (facts.purchasesOfMarketableSecurities != null) {
    assignIfMissing(extracted.facts, 'purchasesOfMarketableSecuritiesYtd', facts.purchasesOfMarketableSecurities);
  }
  if (facts.proceedsFromSaleOfMarketableSecurities != null) {
    assignIfMissing(extracted.facts, 'proceedsFromSaleOfMarketableSecuritiesYtd', facts.proceedsFromSaleOfMarketableSecurities);
  }
  if (facts.acquisitionsOfBusiness != null) assignIfMissing(extracted.facts, 'acquisitionsYtd', facts.acquisitionsOfBusiness);
  if (facts.proceedsFromAssetSales != null) assignIfMissing(extracted.facts, 'assetSalesYtd', facts.proceedsFromAssetSales);
}

function applyEquityFallbacks(extracted, rawText) {
  const equity = extractEquityIssuance(rawText);
  if (equity.preferred != null) assignIfMissing(extracted.facts, 'preferredIssuanceYtd', equity.preferred);
  if (equity.nonControlling != null) assignIfMissing(extracted.facts, 'nonControllingSaleYtd', equity.nonControlling);
}

function applyDebtAndTaxFallbacks(extracted, rawText) {
  const debtCashFlow = extractDebtCashFlow(rawText);
  if (debtCashFlow != null) assignIfMissing(extracted.facts, 'debtCashFlowYtd', debtCashFlow);

  const taxesPaid = extractIncomeTaxesPaid(rawText);
  if (taxesPaid != null) assignIfMissing(extracted.facts, 'cashTaxesPaid', taxesPaid);

  const taxAdjustment = extractTaxCashFlowAdjustment(rawText);
  if (taxAdjustment != null) assignIfMissing(extracted.facts, 'taxCashFlowAdjustment', taxAdjustment);
}

function ensureAnnualRepurchases(extracted) {
  extracted.annualDetails = extracted.annualDetails || {};
  extracted.annualDetails.repurchases = extracted.annualDetails.repurchases || {};
  return extracted.annualDetails.repurchases;
}

function applyRepurchaseDetails(extracted, details) {
  if (!details || Object.keys(details).length === 0) return;
  const repurchases = ensureAnnualRepurchases(extracted);
  for (const [key, value] of Object.entries(details)) {
    if (repurchases[key] == null) repurchases[key] = value;
  }
}

function applyRepurchaseFallbacks(extracted, rawText) {
  const remainingAuthorization = extractRemainingAuthorization(rawText);
  if (remainingAuthorization != null) {
    const repurchases = ensureAnnualRepurchases(extracted);
    if (repurchases.remainingAuthorization == null) repurchases.remainingAuthorization = remainingAuthorization;
  }
  applyRepurchaseDetails(extracted, extractRepurchaseProgramTerms(rawText));
  applyRepurchaseDetails(extracted, extractRepurchaseFactsFromText(rawText));
}

/**
 * Fallbacks de extracción directa por expresiones regulares sobre el texto del filing.
 */
export function applyTextFallbacks(extracted, rawText) {
  extracted.facts = extracted.facts || {};
  applyCapitalCashFlowFallbacks(extracted, rawText);
  applyEquityFallbacks(extracted, rawText);
  applyDebtAndTaxFallbacks(extracted, rawText);
  applyRepurchaseFallbacks(extracted, rawText);
}

export function applyExecutiveChangesFallback(extracted, rawText) {
  extracted.annualDetails = extracted.annualDetails || {};
  const existing = extracted.annualDetails.executiveChanges;
  if (Array.isArray(existing) && existing.length > 0) return;
  const changes = extractExecutiveChangesFromText(rawText);
  if (changes.length > 0) extracted.annualDetails.executiveChanges = changes;
}

function toMillions(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.abs(num) > 1e5 ? Math.round(num / 1e6 * 10) / 10 : Math.round(num * 10) / 10;
}

function findTargetAnnualRow(edgarResults, { reportYear, isAnnual }) {
  const annualSeries = edgarResults?.annual || [];
  const byYear = reportYear
    ? annualSeries.find((row) => {
      const year = Number(row.period || (row.periodEnd ? String(row.periodEnd).slice(0, 4) : null));
      return year === reportYear;
    })
    : null;
  return byYear || (isAnnual ? annualSeries[0] : (edgarResults?.quarterly?.[0] || annualSeries[0]));
}

function applyEdgarCashFlowFallbacks(extracted, values) {
  extracted.cashFlow = extracted.cashFlow || {};
  if (values.cfo != null) assignIfMissing(extracted.cashFlow, 'operating', toMillions(values.cfo));
  if (values.capex != null) assignIfMissing(extracted.cashFlow, 'capex', toMillions(Math.abs(Number(values.capex))));
  if (values.dividendsCommon != null) {
    assignIfMissing(extracted.cashFlow, 'dividends', toMillions(Math.abs(Number(values.dividendsCommon))));
  }
}

function applyEdgarPeriodFallbacks(extracted, values, isAnnual) {
  const periodTarget = isAnnual ? (extracted.ytd = extracted.ytd || {}) : (extracted.quarter = extracted.quarter || {});
  if (values.revenue != null) assignIfMissing(periodTarget, 'sales', toMillions(values.revenue));
  if (values.grossProfit != null) assignIfMissing(periodTarget, 'grossProfit', toMillions(values.grossProfit));
  if (values.operatingIncome != null) assignIfMissing(periodTarget, 'operatingIncome', toMillions(values.operatingIncome));

  const ebt = values.ebtIncludingUnusual ?? values.pretaxIncome;
  if (ebt != null) assignIfMissing(periodTarget, 'ebt', toMillions(ebt));
  if (values.netIncome != null) assignIfMissing(periodTarget, 'netIncome', toMillions(values.netIncome));
}

export function applyEdgarBalanceFallbacks(extracted, values) {
  extracted.balance = extracted.balance || {};
  if (values.cash != null) assignIfMissing(extracted.balance, 'cash', toMillions(values.cash));
  const edgarDebt = values.totalDebt != null ? toMillions(values.totalDebt) : null;
  if (edgarDebt != null) {
    const aiDebt = extracted.balance.totalDebt != null ? Number(extracted.balance.totalDebt) : null;
    const shortTerm = values.shortTermLoans != null ? toMillions(values.shortTermLoans) : null;
    // La IA a veces suma dos veces los préstamos a corto plazo cuando el balance los presenta
    // en una línea combinada con la porción corriente y la nota los desglosa aparte.
    const duplicatedShortTerm = Number.isFinite(aiDebt) && shortTerm != null
      && Math.abs(aiDebt - edgarDebt - shortTerm) < 0.1;
    if (!Number.isFinite(aiDebt) || duplicatedShortTerm) extracted.balance.totalDebt = edgarDebt;
  }
  if (values.shortTermInvestments != null) {
    assignIfMissing(extracted.balance, 'shortTermInvestments', toMillions(values.shortTermInvestments));
  }
  if (values.inventory != null) assignIfMissing(extracted.balance, 'inventories', toMillions(values.inventory));
  if (values.payables != null) assignIfMissing(extracted.balance, 'accountsPayable', toMillions(values.payables));
  if (values.receivables != null) assignIfMissing(extracted.balance, 'accountsReceivable', toMillions(values.receivables));
}

function applyEdgarMetricFallbacks(extracted, { edgarResults, isAnnual, fiscalYear, reportingPeriod }) {
  if (!edgarResults) return;
  const reportYear = Number(fiscalYear) || (reportingPeriod ? Number(String(reportingPeriod).slice(0, 4)) : null);
  const values = findTargetAnnualRow(edgarResults, { reportYear, isAnnual })?.values;
  if (!values) return;
  applyEdgarCashFlowFallbacks(extracted, values);
  applyEdgarPeriodFallbacks(extracted, values, isAnnual);
  applyEdgarBalanceFallbacks(extracted, values);
}

/**
 * Respaldo de datos XBRL oficiales de SEC EDGAR si faltan datos en la extracción.
 * @returns {Promise<Object|null>} Resultados de EDGAR para reutilizarlos en fases anuales.
 */
export async function applyEdgarBackup(extracted, { ticker, isAnnual, fiscalYear, reportingPeriod }) {
  if (!ticker) return null;
  try {
    const edgarResults = await getCompanyResults(ticker);
    applyEdgarMetricFallbacks(extracted, { edgarResults, isAnnual, fiscalYear, reportingPeriod });
    return edgarResults;
  } catch (err) {
    console.warn('[analyst] No se pudo obtener datos EDGAR para respaldo de métricas:', err.message);
    return null;
  }
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function deduceQuarterCashFlow(extracted, prevFlow) {
  const currentCfo = toOptionalNumber(extracted.cashFlow?.operating);
  const currentCapex = toOptionalNumber(extracted.cashFlow?.capex);
  const currentDividends = toOptionalNumber(extracted.cashFlow?.dividends);
  const currentBuybacks = toOptionalNumber(extracted.facts?.shareBuybacks);
  const currentWcChange = toOptionalNumber(extracted.workingCapital?.reportedChangeYtd);
  const deduced = {};

  if (currentCfo != null && prevFlow.cfoYtd != null) deduced.cfo = round1(currentCfo - prevFlow.cfoYtd);
  if (currentCapex != null && prevFlow.capexYtd != null) deduced.capex = round1(Math.abs(currentCapex) - prevFlow.capexYtd);
  if (currentDividends != null && prevFlow.dividendsYtd != null) deduced.dividends = round1(Math.abs(currentDividends) - prevFlow.dividendsYtd);
  if (currentBuybacks != null && prevFlow.buybacksYtd != null) deduced.buybacks = round1(Math.abs(currentBuybacks) - prevFlow.buybacksYtd);
  if (currentWcChange != null && prevFlow.workingCapitalChangeYtd != null) {
    deduced.workingCapitalChange = round1(currentWcChange - prevFlow.workingCapitalChangeYtd);
  }
  if (deduced.cfo != null && deduced.capex != null) deduced.fcf = round1(deduced.cfo - deduced.capex);
  return deduced;
}

/**
 * Elige la deuda del trimestre previo entre la versión con y sin porción corriente de largo plazo.
 * Cuando `longTermDebtCurrent` es una etiqueta narrativa ya incluida en `shortTermLoans`
 * (p. ej. PepsiCo), la composición sin porción corriente es la que reproduce la deuda que la IA
 * leyó del balance del trimestre actual; en ese caso se usa también para el trimestre previo.
 */
export function pickPreviousQuarterDebt(prevFlow, currentDebt) {
  const withCurrentPortion = prevFlow?.balanceSheetDebt ?? null;
  const withoutCurrentPortion = prevFlow?.balanceSheetDebtWithoutCurrentPortion ?? null;
  if (withCurrentPortion == null || withoutCurrentPortion == null) return withCurrentPortion;
  const current = toOptionalNumber(currentDebt);
  if (current == null) return withCurrentPortion;
  const matches = (candidate) => candidate != null && Math.abs(current - candidate) < 0.5;
  if (matches(prevFlow.currentBalanceSheetDebtWithoutCurrentPortion) && !matches(prevFlow.currentBalanceSheetDebt)) {
    return withoutCurrentPortion;
  }
  return withCurrentPortion;
}

function storePreviousQuarterCashFlow(extracted, prevFlow, deduced) {
  extracted.previousQuarterCashFlow = {
    period: prevFlow.period,
    periodEnd: prevFlow.periodEnd,
    cfoYtd: prevFlow.cfoYtd,
    capexYtd: prevFlow.capexYtd,
    dividendsYtd: prevFlow.dividendsYtd,
    buybacksYtd: prevFlow.buybacksYtd,
    workingCapitalChangeYtd: prevFlow.workingCapitalChangeYtd,
    netDebtChangeYtd: prevFlow.netDebtChangeYtd,
    hasDebtMovement: prevFlow.hasDebtMovement === true,
  };
  if (Object.keys(deduced).length > 0) extracted.deducedQuarterCashFlow = deduced;

  extracted.balance = extracted.balance || {};
  const previousBalances = {
    cashPreviousQuarter: prevFlow.cash,
    shortTermInvestmentsPreviousQuarter: prevFlow.shortTermInvestments,
    totalDebtPreviousQuarter: pickPreviousQuarterDebt(prevFlow, extracted.balance?.totalDebt),
    restrictedCashPreviousQuarter: prevFlow.previousRestrictedCash,
  };
  for (const [key, value] of Object.entries(previousBalances)) {
    if (extracted.balance[key] == null && value != null) extracted.balance[key] = value;
  }

  const currentQuarter = prevFlow.currentQuarterData;
  if (currentQuarter) {
    const ytd = toOptionalNumber(currentQuarter.debtCashFlowYtd);
    const quarter = toOptionalNumber(currentQuarter.debtCashFlow3M);
    if (ytd != null || quarter != null) extracted.systemDebtCash = { ytd, quarter };
  }

  extracted.workingCapital = extracted.workingCapital || {};
  if (extracted.workingCapital.reportedChangeQuarter == null && deduced.workingCapitalChange != null) {
    extracted.workingCapital.reportedChangeQuarter = deduced.workingCapitalChange;
  }

  extracted.facts = extracted.facts || {};
  if (extracted.facts.shareBuybacksQuarter == null && deduced.buybacks != null) {
    extracted.facts.shareBuybacksQuarter = deduced.buybacks;
  }
}

export async function applyPreviousQuarterCashFlow(extracted, { ticker, isAnnual, fiscalQuarter, fiscalYear, reportingPeriod }) {
  if (isAnnual || !ticker || !(Number(fiscalQuarter) > 1)) return;
  try {
    const prevFlow = await getPreviousQuarterCashFlow(ticker, fiscalYear, fiscalQuarter, reportingPeriod);
    if (!prevFlow) return;
    const deduced = deduceQuarterCashFlow(extracted, prevFlow);
    storePreviousQuarterCashFlow(extracted, prevFlow, deduced);
  } catch (error) {
    console.warn('[analyst] No se pudo obtener el flujo del trimestre previo:', error.message);
  }
}

function buildEdgarDebtHistory(annualSeries, reportYear) {
  if (annualSeries.length < 2) return null;
  return annualSeries
    .map((row) => {
      const year = Number(row.period || (row.periodEnd ? String(row.periodEnd).slice(0, 4) : null));
      const totalDebt = Number(row.values?.totalDebt);
      const netDebt = Number(row.values?.netDebt);
      return {
        year,
        totalDebt: Number.isFinite(totalDebt) ? (totalDebt > 1e6 ? Math.round(totalDebt / 1e6) : Math.round(totalDebt)) : null,
        netDebt: Number.isFinite(netDebt) ? (netDebt > 1e6 ? Math.round(netDebt / 1e6) : Math.round(netDebt)) : null,
      };
    })
    .filter((point) => Number.isFinite(point.year) && Number.isFinite(point.totalDebt))
    .filter((point) => !Number.isFinite(reportYear) || point.year <= reportYear)
    .sort((a, b) => a.year - b.year)
    .slice(-10);
}

function buildAnnualEdgarData(edgarAnnual, reportYear) {
  const annualSeries = edgarAnnual?.annual || [];
  const data = {
    edgarDebtHistory: buildEdgarDebtHistory(annualSeries, reportYear),
    edgarDebtMaturities: null,
    edgarDividendHistory: buildDividendHistoryFromEdgar(annualSeries, reportYear),
  };

  const maturities = edgarAnnual?.debtMaturities;
  if (Array.isArray(maturities?.years) && maturities.years.length) {
    if (!reportYear || Math.abs(Number(maturities.baseYear) - reportYear) <= 1) {
      data.edgarDebtMaturities = maturities;
    }
  }
  return data;
}

/** Datos suplementarios anuales (historial de deuda, vencimientos y dividendos). */
export async function loadAnnualEdgarData({ edgarResults, ticker, isAnnual, fiscalYear, reportingPeriod }) {
  const empty = { edgarDebtHistory: null, edgarDebtMaturities: null, edgarDividendHistory: null };
  if (!isAnnual || !ticker) return empty;
  try {
    const edgarAnnual = edgarResults || await getCompanyResults(ticker);
    const reportYear = Number(fiscalYear) || (reportingPeriod ? Number(String(reportingPeriod).slice(0, 4)) : null);
    return buildAnnualEdgarData(edgarAnnual, reportYear);
  } catch (err) {
    console.warn('[analyst] No se pudo obtener el historial de deuda desde EDGAR:', err.message);
    return empty;
  }
}

async function recoverDebtMaturitiesFromText(rawText, fiscalYear, reportingPeriod) {
  const debtText = extractDebtFilingText(rawText);
  if (!debtText) return null;
  try {
    const payload = await chatJson([
      { role: 'system', content: buildDebtMaturityPrompt(fiscalYear, reportingPeriod) },
      { role: 'user', content: debtText.slice(0, 32000) },
    ]);
    const recovered = normalizeMaturityPayload(payload, fiscalYear, reportingPeriod);
    if (recovered) console.info('[analyst] Calendario de vencimientos recuperado con pasada focalizada.');
    return recovered;
  } catch (error) {
    console.warn('[analyst] No se pudo recuperar el calendario de vencimientos:', error.message);
    return null;
  }
}

function buildEdgarMaturitySchedule(edgarDebtMaturities) {
  if (!edgarDebtMaturities) return null;
  return {
    items: edgarDebtMaturities.years.map((year) => ({
      year: year.year,
      label: 'Vencimientos contractuales de deuda',
      amount: year.amount,
      type: 'Deuda total',
      rate: edgarDebtMaturities.weightedAverageRate ?? null,
      estimated: edgarDebtMaturities.weightedAverageRate != null,
    })),
    afterYearFive: edgarDebtMaturities.afterYearFive ?? null,
  };
}

/**
 * Reconstruye el calendario de vencimientos año a año cuando la IA lo trajo agregado
 * en rangos ("1-3 years", "2024 and beyond"), directamente no lo extrajo, o la tabla
 * de la nota llegó resumida con importes materiales sin año de vencimiento.
 */
export async function recoverAnnualMaturities(debtDetails, { rawText, fiscalYear, reportingPeriod, totalDebt, edgarDebtMaturities }) {
  const maturityItems = Array.isArray(debtDetails?.maturityItems) ? debtDetails.maturityItems : [];
  const maturitySchedule = Array.isArray(debtDetails?.maturitySchedule) ? debtDetails.maturitySchedule : [];
  if (!debtDetails) return;

  const currentItems = maturityItems.length ? maturityItems : maturitySchedule;
  const wasBucketed = maturityItemsLookBucketed(maturityItems, fiscalYear, reportingPeriod)
    || maturityItemsLookBucketed(maturitySchedule, fiscalYear, reportingPeriod);
  const totalDebtNum = Number(totalDebt);
  const debtText = extractDebtFilingText(rawText);
  const tableSchedule = buildMaturityScheduleFromDebtTable(debtDetails.secTable, fiscalYear, reportingPeriod);
  const tableLooksIncomplete = maturityTableLooksIncomplete(debtDetails.secTable);
  const textSchedule = buildMaturityScheduleFromFilingText(debtText, fiscalYear, reportingPeriod);
  const edgarSchedule = buildEdgarMaturitySchedule(edgarDebtMaturities);
  const ordered = (tableLooksIncomplete || !tableSchedule)
    ? [textSchedule, tableSchedule, edgarSchedule]
    : [tableSchedule, textSchedule, edgarSchedule];

  // 1) La nota de deuda manda: si una fuente determinista (texto de la nota o tabla SEC) cubre la
  //    deuda total, sustituye al calendario de la IA (que no debe inventarse los vencimientos).
  let recovered = pickCoveringMaturitySchedule(ordered, totalDebtNum);
  // 2) Sin fuente determinista suficiente: se conserva el calendario de la IA si no viene agregado;
  //    si viene agregado o no existe, se intenta la pasada focalizada de IA y, como último recurso, el XBRL.
  if (!recovered && !(currentItems.length && !wasBucketed)) {
    recovered = await recoverDebtMaturitiesFromText(rawText, fiscalYear, reportingPeriod) ?? ordered.find(Boolean);
  }

  const shouldOverrideRate = debtDetails.allDebtAverageRate == null
    || edgarDebtMaturities?.weightedAverageRateSource === 'instrument';
  if (!recovered) {
    if (shouldOverrideRate) {
      const currentRate = weightedAverageRateFromItems(currentItems);
      if (currentRate) {
        debtDetails.allDebtAverageRate = currentRate.rate;
        debtDetails.allDebtAverageRateEstimated = true;
        debtDetails.allDebtAverageRateSource = 'cupones de la nota ponderados por saldo';
      }
    }
    return;
  }

  debtDetails.maturityItems = recovered.items;
  if (maturityItemsLookBucketed(maturitySchedule, fiscalYear, reportingPeriod)) delete debtDetails.maturitySchedule;
  if (recovered.afterYearFive != null) debtDetails.maturityAfterFive = recovered.afterYearFive;
  // Tipo medio: se prefiere el de los cupones reales de la nota cuando el XBRL solo aporta
  // el cupón de una emisión concreta (no representa la deuda total).
  if (shouldOverrideRate) {
    const itemsRate = recovered.weightedAverageRate ?? weightedAverageRateFromItems(recovered.items);
    if (itemsRate) {
      debtDetails.allDebtAverageRate = itemsRate.rate;
      debtDetails.allDebtAverageRateEstimated = true;
      debtDetails.allDebtAverageRateSource = 'cupones de la nota ponderados por saldo';
    } else if (edgarDebtMaturities?.weightedAverageRate != null && edgarDebtMaturities.weightedAverageRateSource !== 'instrument') {
      debtDetails.allDebtAverageRate = edgarDebtMaturities.weightedAverageRate;
      debtDetails.allDebtAverageRateEstimated = true;
      debtDetails.allDebtAverageRateSource = 'SEC XBRL (tipo medio ponderado)';
    }
  }
  console.info(`[analyst] Calendario de vencimientos reconstruido año a año: ${recovered.items.length} tramos${wasBucketed ? ' (venía agregado)' : ''}.`);
}

function toOptionalNumber(value) {
  if (value == null || value === '') return null;
  const num = parseLooseAmount(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeRecoveredRefinancing(payload) {
  if (!payload || payload.occurred !== true) return null;
  const description = typeof payload.description === 'string' && payload.description.trim() ? payload.description.trim() : null;
  const refinancing = {
    occurred: true,
    description,
    oldDebtRate: toOptionalNumber(payload.oldDebtRate),
    newDebtRate: toOptionalNumber(payload.newDebtRate),
    amountRefinanced: toOptionalNumber(payload.amountRefinanced),
    annualInterestImpact: toOptionalNumber(payload.annualInterestImpact),
    epsImpact: toOptionalNumber(payload.epsImpact),
  };
  const hasData = description
    || refinancing.amountRefinanced != null
    || refinancing.epsImpact != null
    || refinancing.oldDebtRate != null
    || refinancing.newDebtRate != null;
  return hasData ? refinancing : null;
}

async function recoverDebtRefinancingFromText(rawText) {
  const refinancingText = extractRefinancingFilingText(rawText);
  if (!refinancingText) return null;
  try {
    const payload = await chatJson([
      { role: 'system', content: buildDebtRefinancingPrompt() },
      { role: 'user', content: refinancingText },
    ]);
    const recovered = normalizeRecoveredRefinancing(payload);
    if (recovered) console.info('[analyst] Refinanciación recuperada con pasada focalizada.');
    return recovered;
  } catch (error) {
    console.warn('[analyst] No se pudo recuperar la refinanciación:', error.message);
    return null;
  }
}

export async function recoverAnnualRefinancing(debtDetails, rawText) {
  if (!debtDetails || debtDetails.refinancing?.occurred === true) return;
  const recovered = await recoverDebtRefinancingFromText(rawText);
  if (recovered) debtDetails.refinancing = recovered;
}

export async function structureReport(extractedForModel, { isAnnual, rules, languageDirective }) {
  const basePrompt = isAnnual ? ANNUAL_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const schema = isAnnual ? ANNUAL_OUTPUT_SCHEMA : OUTPUT_SCHEMA;
  const systemPrompt = `${basePrompt
    .replace('{REGLAS}', rules.trim())
    .replace('{SCHEMA}', schema.trim())}\n\n${languageDirective}`;

  try {
    return await chatJson([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(extractedForModel, null, 2) },
    ]);
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    throw new AgentError('El modelo no devolvió un análisis válido.', 'INVALID_MODEL_RESPONSE');
  }
}

export function validateReportStructure(result) {
  if (!result || !Array.isArray(result.horizons) || result.horizons.length === 0) {
    throw new AgentError('El análisis no contiene bloques válidos de datos.', 'INVALID_REPORT_STRUCTURE');
  }
}

export function selectAnnualHorizon(result, language) {
  const isAnnualLabel = (horizon) => {
    const label = String(horizon.label || '').toUpperCase();
    return label.includes('12') || label.includes('AÑO') || label.includes('YEAR');
  };
  const horizon = result.horizons.find(isAnnualLabel) || result.horizons[result.horizons.length - 1];
  horizon.label = t('EN TODO EL AÑO (12 MESES)', null, language);
  result.horizons = [horizon];
}

export function normalizeHorizons(result, extracted, language) {
  for (const horizon of result.horizons) {
    normalizeSalesBlock(horizon, extracted, language);
    normalizeCashFlowBlock(horizon, extracted, language);
    normalizeCapitalBlock(horizon, extracted, language);
  }
}

export function applyAnnualConclusion(result, extracted, edgarData, fiscalYear, language) {
  result.conclusion = result.conclusion || {};
  const rawAnnual = extracted.annualDetails || {};
  processRepurchasesSection(result.conclusion, rawAnnual, extracted, language);
  processExecutiveChangesSection(result.conclusion, rawAnnual, language);
  processOutlookSection(result.conclusion, rawAnnual, result, language);
  processDebtSection(result.conclusion, rawAnnual, edgarData, fiscalYear, language, extracted.reportingPeriod ?? null);
  processAcquisitionsDividendsAndWatchlist(result.conclusion, rawAnnual, extracted, edgarData, fiscalYear, language);
  renumberConclusionSections(result.conclusion, language);
}

export function normalizeAnnualRating(result, language) {
  result.rating = result.rating || {};
  let scoreNum = Number(result.rating.score);
  if (!Number.isFinite(scoreNum) || scoreNum < 1 || scoreNum > 10) {
    const labelMatch = String(result.rating.label || '').match(/\d+(?:[.,]\d+)?/);
    scoreNum = labelMatch ? parseFloat(labelMatch[0].replace(',', '.')) : 5;
  }
  result.rating.score = Math.min(10, Math.max(1, Math.round(scoreNum * 10) / 10));
  result.rating.label = t('NOTA DE RESULTADOS: {score}', { score: result.rating.score }, language);
  result.rating.rationale = result.rating.rationale || t('Calificación puramente financiera sin especulación sobre cumplimiento futuro.', null, language);
}
