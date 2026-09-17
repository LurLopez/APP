/**
 * @fileoverview Núcleo del Agente Analista (AnalystAgentCore) para Cifra.
 * Coordina la extracción con LLM, enriquecimiento con XBRL de SEC Edgar y estructuración de estados financieros.
 * @module agents/analyst/analystAgentCore
 */

import { BaseAgent, AgentError } from '../baseAgent.js';
import { chatJson, AiProviderError } from '../../services/ai/modelProvider.js';
import { getPreviousQuarterCashFlow, getCompanyResults, getHistoricalUnderlyingEps } from '../../services/edgar.service.js';
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
  isPlaceholderText,
  formatFinancialValue,
  parseLooseAmount,
} from './financialParsers.js';
import {
  selectAnnualRows,
  buildSharesHistoryFromEdgar,
  buildRepurchaseHistoryFromEdgar,
  buildRepurchaseSharesHistoryFromEdgar,
  buildDividendHistoryFromEdgar,
} from './historyBuilders.js';
import {
  buildCapitalAllocationFromBalance,
  buildWorkingCapitalDataFallback,
} from './capitalAllocationHelpers.js';
import { buildMaturityScheduleFromDebtTable, normalizeMaturityPayload, maturityItemsLookBucketed, shouldRecoverMaturitySchedule } from './debtMaturityFallback.js';
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
import { getLanguageDirective } from './languageDirective.js';
import { normalizeLanguage, t } from '../../utils/i18n.js';

async function recoverDebtMaturitiesFromText(rawText, fiscalYear) {
  const debtText = extractDebtFilingText(rawText);
  if (!debtText) return null;
  try {
    const payload = await chatJson([
      { role: 'system', content: buildDebtMaturityPrompt(fiscalYear) },
      { role: 'user', content: debtText.slice(0, 32000) },
    ]);
    const recovered = normalizeMaturityPayload(payload, fiscalYear);
    if (recovered) console.info('[analyst] Calendario de vencimientos recuperado con pasada focalizada.');
    return recovered;
  } catch (error) {
    console.warn('[analyst] No se pudo recuperar el calendario de vencimientos:', error.message);
    return null;
  }
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

export class AnalystAgent extends BaseAgent {
  constructor() {
    super({
      name: 'analyst',
      description: 'Analiza el informe financiero y genera la estructura de Ventas, Cash Flow y Asignación de Capital.',
    });
  }

  /**
   * Ejecuta el análisis integral del informe financiero (10-Q o 10-K).
   * @param {object} input - Parámetros de entrada (texto, presentación, sector, ticker, formType).
   * @returns {Promise<object>} Reporte de análisis financiero estructurado.
   */
  async run(input) {
    if (!input?.text?.trim()) {
      throw new AgentError('No se pudo leer el contenido del documento.', 'EMPTY_DOCUMENT');
    }

    const sector = input.sector ?? 'defensive_consumer';
    const subsector = input.subsector ?? null;
    const formType = input.formType ?? '10-Q';
    const language = normalizeLanguage(input.language);
    const languageDirective = getLanguageDirective(language);
    const isAnnual = String(formType || '').toUpperCase().includes('10-K')
      || String(formType || '').toLowerCase().includes('anual');

    let rules;
    try {
      rules = await loadKnowledgeRules(sector, subsector, formType, input.ticker ?? null);
    } catch {
      throw new AgentError(`No hay reglas de análisis definidas para el sector ${sector}.`, 'NO_SECTOR_RULES');
    }

    const extractionPrompt = `${EXTRACTION_PROMPT.replace('{SCHEMA}', EXTRACTION_SCHEMA.trim())}\n\n${languageDirective}`;
    let extracted;
    try {
      extracted = await chatJson([
        { role: 'system', content: extractionPrompt },
        { role: 'user', content: buildAnalysisText(input.text, input.presentationText) },
      ]);
    } catch (error) {
      console.error('[analyst:extraction]', error.message);
      if (error instanceof AiProviderError) throw error;
      throw new AgentError('No se pudieron extraer los datos del informe.', 'INVALID_MODEL_RESPONSE');
    }

    const ticker = input.ticker || extracted.ticker;
    const reportingPeriod = extracted.reportingPeriod || null;
    const fiscalQuarter = isAnnual ? 4 : (extracted.fiscalQuarter || (extracted.ytd?.months ? Math.round(extracted.ytd.months / 3) : null));
    const fiscalYear = extracted.fiscalYear || (reportingPeriod ? Number(reportingPeriod.slice(0, 4)) : null);

    extracted._rawText = input.text;

    // Fallbacks de extracción directa por expresiones regulares sobre el texto del filing
    extracted.facts = extracted.facts || {};
    const textCapitalFacts = extractCapitalCashFlowFacts(input.text);
    if (extracted.facts.shareBuybacks == null && textCapitalFacts.shareBuybacks != null) {
      extracted.facts.shareBuybacks = textCapitalFacts.shareBuybacks;
    }
    if (extracted.facts.purchasesOfMarketableSecuritiesYtd == null && textCapitalFacts.purchasesOfMarketableSecurities != null) {
      extracted.facts.purchasesOfMarketableSecuritiesYtd = textCapitalFacts.purchasesOfMarketableSecurities;
    }
    if (extracted.facts.proceedsFromSaleOfMarketableSecuritiesYtd == null && textCapitalFacts.proceedsFromSaleOfMarketableSecurities != null) {
      extracted.facts.proceedsFromSaleOfMarketableSecuritiesYtd = textCapitalFacts.proceedsFromSaleOfMarketableSecurities;
    }
    if (extracted.facts.acquisitionsYtd == null && textCapitalFacts.acquisitionsOfBusiness != null) {
      extracted.facts.acquisitionsYtd = textCapitalFacts.acquisitionsOfBusiness;
    }
    if (extracted.facts.assetSalesYtd == null && textCapitalFacts.proceedsFromAssetSales != null) {
      extracted.facts.assetSalesYtd = textCapitalFacts.proceedsFromAssetSales;
    }
    const textEquityFacts = extractEquityIssuance(input.text);
    if (extracted.facts.preferredIssuanceYtd == null && textEquityFacts.preferred != null) {
      extracted.facts.preferredIssuanceYtd = textEquityFacts.preferred;
    }
    if (extracted.facts.nonControllingSaleYtd == null && textEquityFacts.nonControlling != null) {
      extracted.facts.nonControllingSaleYtd = textEquityFacts.nonControlling;
    }
    const textDebtCash = extractDebtCashFlow(input.text);
    if (extracted.facts.debtCashFlowYtd == null && textDebtCash != null) {
      extracted.facts.debtCashFlowYtd = textDebtCash;
    }
    const textTaxesPaid = extractIncomeTaxesPaid(input.text);
    if (extracted.facts.cashTaxesPaid == null && textTaxesPaid != null) {
      extracted.facts.cashTaxesPaid = textTaxesPaid;
    }
    const textTaxAdj = extractTaxCashFlowAdjustment(input.text);
    if (extracted.facts.taxCashFlowAdjustment == null && textTaxAdj != null) {
      extracted.facts.taxCashFlowAdjustment = textTaxAdj;
    }
    const textAuthRemaining = extractRemainingAuthorization(input.text);
    if (textAuthRemaining != null) {
      extracted.annualDetails = extracted.annualDetails || {};
      extracted.annualDetails.repurchases = extracted.annualDetails.repurchases || {};
      if (extracted.annualDetails.repurchases.remainingAuthorization == null) {
        extracted.annualDetails.repurchases.remainingAuthorization = textAuthRemaining;
      }
    }
    const textRepurchaseTerms = extractRepurchaseProgramTerms(input.text);
    if (textRepurchaseTerms && Object.keys(textRepurchaseTerms).length > 0) {
      extracted.annualDetails = extracted.annualDetails || {};
      extracted.annualDetails.repurchases = extracted.annualDetails.repurchases || {};
      for (const [k, v] of Object.entries(textRepurchaseTerms)) {
        if (extracted.annualDetails.repurchases[k] == null) {
          extracted.annualDetails.repurchases[k] = v;
        }
      }
    }
    const textRepurchaseFacts = extractRepurchaseFactsFromText(input.text);
    if (textRepurchaseFacts && Object.keys(textRepurchaseFacts).length > 0) {
      extracted.annualDetails = extracted.annualDetails || {};
      extracted.annualDetails.repurchases = extracted.annualDetails.repurchases || {};
      for (const [k, v] of Object.entries(textRepurchaseFacts)) {
        if (extracted.annualDetails.repurchases[k] == null) {
          extracted.annualDetails.repurchases[k] = v;
        }
      }
    }

    if (isAnnual) {
      extracted.annualDetails = extracted.annualDetails || {};
      const existingChanges = extracted.annualDetails.executiveChanges;
      if (!Array.isArray(existingChanges) || existingChanges.length === 0) {
        const textExecutiveChanges = extractExecutiveChangesFromText(input.text);
        if (textExecutiveChanges.length > 0) {
          extracted.annualDetails.executiveChanges = textExecutiveChanges;
        }
      }
    }

    // Fallbacks de datos XBRL oficiales de SEC EDGAR si faltan datos en la extracción
    let edgarResults = null;
    if (ticker) {
      try {
        edgarResults = await getCompanyResults(ticker);
        const reportYear = Number(fiscalYear) || (reportingPeriod ? Number(String(reportingPeriod).slice(0, 4)) : null);
        const annualSeries = edgarResults?.annual || [];
        const targetRow = (reportYear ? annualSeries.find((r) => {
          const yr = Number(r.period || (r.periodEnd ? String(r.periodEnd).slice(0, 4) : null));
          return yr === reportYear;
        }) : null) || (isAnnual ? annualSeries[0] : (edgarResults?.quarterly?.[0] || annualSeries[0]));

        if (targetRow?.values) {
          const toM = (v) => (v != null && Number.isFinite(Number(v))) ? (Math.abs(Number(v)) > 1e5 ? Math.round(Number(v) / 1e6 * 10) / 10 : Math.round(Number(v) * 10) / 10) : null;
          const eVals = targetRow.values;

          extracted.cashFlow = extracted.cashFlow || {};
          if (extracted.cashFlow.operating == null && eVals.cfo != null) extracted.cashFlow.operating = toM(eVals.cfo);
          if (extracted.cashFlow.capex == null && eVals.capex != null) extracted.cashFlow.capex = toM(Math.abs(Number(eVals.capex)));
          if (extracted.cashFlow.dividends == null && eVals.dividendsCommon != null) extracted.cashFlow.dividends = toM(Math.abs(Number(eVals.dividendsCommon)));

          const periodTarget = isAnnual ? (extracted.ytd = extracted.ytd || {}) : (extracted.quarter = extracted.quarter || {});
          if (periodTarget.sales == null && eVals.revenue != null) periodTarget.sales = toM(eVals.revenue);
          if (periodTarget.grossProfit == null && eVals.grossProfit != null) periodTarget.grossProfit = toM(eVals.grossProfit);
          if (periodTarget.operatingIncome == null && eVals.operatingIncome != null) periodTarget.operatingIncome = toM(eVals.operatingIncome);
          if (periodTarget.ebt == null && (eVals.ebtIncludingUnusual != null || eVals.pretaxIncome != null)) periodTarget.ebt = toM(eVals.ebtIncludingUnusual ?? eVals.pretaxIncome);
          if (periodTarget.netIncome == null && eVals.netIncome != null) periodTarget.netIncome = toM(eVals.netIncome);

          extracted.balance = extracted.balance || {};
          if (extracted.balance.cash == null && eVals.cash != null) extracted.balance.cash = toM(eVals.cash);
          if (extracted.balance.totalDebt == null && eVals.totalDebt != null) extracted.balance.totalDebt = toM(eVals.totalDebt);
          if (extracted.balance.shortTermInvestments == null && eVals.shortTermInvestments != null) extracted.balance.shortTermInvestments = toM(eVals.shortTermInvestments);
          if (extracted.balance.inventories == null && eVals.inventory != null) extracted.balance.inventories = toM(eVals.inventory);
          if (extracted.balance.accountsPayable == null && eVals.payables != null) extracted.balance.accountsPayable = toM(eVals.payables);
          if (extracted.balance.accountsReceivable == null && eVals.receivables != null) extracted.balance.accountsReceivable = toM(eVals.receivables);
        }
      } catch (err) {
        console.warn('[analyst] No se pudo obtener datos EDGAR para respaldo de métricas:', err.message);
      }
    }

    normalizeExtractedUnits(extracted);

    if (!isAnnual && ticker && Number(fiscalQuarter) > 1) {
      try {
        const prevFlow = await getPreviousQuarterCashFlow(ticker, fiscalYear, fiscalQuarter, reportingPeriod);
        if (prevFlow) {
          const round1 = (value) => Math.round(value * 10) / 10;
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

          extracted.previousQuarterCashFlow = {
            period: prevFlow.period,
            periodEnd: prevFlow.periodEnd,
            cfoYtd: prevFlow.cfoYtd,
            capexYtd: prevFlow.capexYtd,
            dividendsYtd: prevFlow.dividendsYtd,
            buybacksYtd: prevFlow.buybacksYtd,
            workingCapitalChangeYtd: prevFlow.workingCapitalChangeYtd,
          };
          if (Object.keys(deduced).length > 0) extracted.deducedQuarterCashFlow = deduced;

          extracted.balance = extracted.balance || {};
          const previousBalances = {
            cashPreviousQuarter: prevFlow.cash,
            shortTermInvestmentsPreviousQuarter: prevFlow.shortTermInvestments,
            totalDebtPreviousQuarter: prevFlow.balanceSheetDebt,
            restrictedCashPreviousQuarter: prevFlow.previousRestrictedCash,
          };
          for (const [key, value] of Object.entries(previousBalances)) {
            if (extracted.balance[key] == null && value != null) extracted.balance[key] = value;
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
      } catch (error) {
        console.warn('[analyst] No se pudo obtener el flujo del trimestre previo:', error.message);
      }
    }

    extracted.capitalAllocationData = buildCapitalAllocationFromBalance(extracted, language);

    if (!extracted.workingCapitalData) {
      const fallbackWc = buildWorkingCapitalDataFallback(extracted, language);
      if (fallbackWc) extracted.workingCapitalData = fallbackWc;
    }

    // Datos suplementarios anuales
    const edgarData = { edgarDebtHistory: null, edgarDebtMaturities: null, edgarDividendHistory: null };
    if (isAnnual && ticker) {
      try {
        const edgarAnnual = edgarResults || await getCompanyResults(ticker);
        const annualSeries = edgarAnnual?.annual || [];
        const reportYear = Number(fiscalYear) || (reportingPeriod ? Number(String(reportingPeriod).slice(0, 4)) : null);
        edgarData.edgarDividendHistory = buildDividendHistoryFromEdgar(annualSeries, reportYear);
        if (annualSeries.length >= 2) {
          edgarData.edgarDebtHistory = annualSeries
            .map((row) => {
              const yr = Number(row.period || (row.periodEnd ? String(row.periodEnd).slice(0, 4) : null));
              const tDebt = Number(row.values?.totalDebt);
              const nDebt = Number(row.values?.netDebt);
              return {
                year: yr,
                totalDebt: Number.isFinite(tDebt) ? (tDebt > 1e6 ? Math.round(tDebt / 1e6) : Math.round(tDebt)) : null,
                netDebt: Number.isFinite(nDebt) ? (nDebt > 1e6 ? Math.round(nDebt / 1e6) : Math.round(nDebt)) : null,
              };
            })
            .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.totalDebt))
            .filter((p) => !Number.isFinite(reportYear) || p.year <= reportYear)
            .sort((a, b) => a.year - b.year)
            .slice(-10);
        }
        if (Array.isArray(edgarAnnual?.debtMaturities?.years) && edgarAnnual.debtMaturities.years.length) {
          if (!reportYear || Math.abs(Number(edgarAnnual.debtMaturities.baseYear) - reportYear) <= 1) {
            edgarData.edgarDebtMaturities = edgarAnnual.debtMaturities;
          }
        }
      } catch (err) {
        console.warn('[analyst] No se pudo obtener el historial de deuda desde EDGAR:', err.message);
      }
    }

    // Calendario de vencimientos: si la IA no lo extrajo —o lo trajo agregado en rangos
    // ("1-3 years", "2020-2021", "2024 and beyond")— se reconstruye año a año desde la nota
    // de deuda antes de redactar, para que la narrativa y el gráfico no aplasten los tramos.
    if (isAnnual) {
      const debtDetails = extracted.annualDetails?.debt;
      const maturityItems = Array.isArray(debtDetails?.maturityItems) ? debtDetails.maturityItems : [];
      const maturitySchedule = Array.isArray(debtDetails?.maturitySchedule) ? debtDetails.maturitySchedule : [];
      const bucketedMaturity = maturityItemsLookBucketed(maturityItems, fiscalYear)
        || maturityItemsLookBucketed(maturitySchedule, fiscalYear);
      if (debtDetails && shouldRecoverMaturitySchedule(maturityItems, maturitySchedule, fiscalYear)) {
        const fromTable = buildMaturityScheduleFromDebtTable(debtDetails.secTable, fiscalYear);
        const fromEdgar = (!fromTable && edgarData.edgarDebtMaturities)
          ? {
            items: edgarData.edgarDebtMaturities.years.map((y) => ({
              year: y.year,
              label: 'Vencimientos contractuales de deuda',
              amount: y.amount,
              type: 'Deuda total',
              rate: edgarData.edgarDebtMaturities.weightedAverageRate ?? null,
              estimated: edgarData.edgarDebtMaturities.weightedAverageRate != null,
            })),
            afterYearFive: edgarData.edgarDebtMaturities.afterYearFive ?? null,
          }
          : null;
        const recoveredMaturity = fromTable || fromEdgar || await recoverDebtMaturitiesFromText(input.text, fiscalYear);
        if (recoveredMaturity) {
          debtDetails.maturityItems = recoveredMaturity.items;
          if (maturityItemsLookBucketed(maturitySchedule, fiscalYear)) delete debtDetails.maturitySchedule;
          if (recoveredMaturity.afterYearFive != null) {
            debtDetails.maturityAfterFive = recoveredMaturity.afterYearFive;
          }
          if (debtDetails.allDebtAverageRate == null && edgarData.edgarDebtMaturities?.weightedAverageRate != null) {
            debtDetails.allDebtAverageRate = edgarData.edgarDebtMaturities.weightedAverageRate;
            debtDetails.allDebtAverageRateEstimated = true;
          }
          if (bucketedMaturity) {
            console.info(`[analyst] Calendario de vencimientos reconstruido año a año: ${recoveredMaturity.items.length} tramos.`);
          }
        }
      }

      if (debtDetails && debtDetails.refinancing?.occurred !== true) {
        const recoveredRefinancing = await recoverDebtRefinancingFromText(input.text);
        if (recoveredRefinancing) debtDetails.refinancing = recoveredRefinancing;
      }
    }

    // Fase 2: estructuración y redacción analítica
    const basePrompt = isAnnual ? ANNUAL_SYSTEM_PROMPT : SYSTEM_PROMPT;
    const schema = isAnnual ? ANNUAL_OUTPUT_SCHEMA : OUTPUT_SCHEMA;
    const systemPrompt = `${basePrompt
      .replace('{REGLAS}', rules.trim())
      .replace('{SCHEMA}', schema.trim())}\n\n${languageDirective}`;

    const { _rawText, ...extractedForModel } = extracted;
    let result;
    try {
      result = await chatJson([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(extractedForModel, null, 2) },
      ]);
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AgentError('El modelo no devolvió un análisis válido.', 'INVALID_MODEL_RESPONSE');
    }

    if (!result || !Array.isArray(result.horizons) || result.horizons.length === 0) {
      throw new AgentError('El análisis no contiene bloques válidos de datos.', 'INVALID_REPORT_STRUCTURE');
    }

    if (isAnnual) {
      const annualHorizon = result.horizons.find((h) =>
        String(h.label || '').toUpperCase().includes('12') ||
        String(h.label || '').toUpperCase().includes('AÑO') ||
        String(h.label || '').toUpperCase().includes('YEAR')
      ) || result.horizons[result.horizons.length - 1];
      annualHorizon.label = t('EN TODO EL AÑO (12 MESES)', null, language);
      result.horizons = [annualHorizon];
    }

    // Normalización defensiva de horizontes
    result.horizons.forEach((horizon) => {
      normalizeSalesBlock(horizon, extracted, language);
      normalizeCashFlowBlock(horizon, extracted, language);
      normalizeCapitalBlock(horizon, extracted, language);
    });

    // Conclusión anual
    if (isAnnual) {
      result.conclusion = result.conclusion || {};
      const rawAnn = extracted.annualDetails || {};
      processRepurchasesSection(result.conclusion, rawAnn, extracted, language);
      processExecutiveChangesSection(result.conclusion, rawAnn, language);
      processOutlookSection(result.conclusion, rawAnn, result, language);
      processDebtSection(result.conclusion, rawAnn, edgarData, fiscalYear, language);
      processAcquisitionsDividendsAndWatchlist(result.conclusion, rawAnn, extracted, edgarData, fiscalYear, language);
      renumberConclusionSections(result.conclusion, language);

      result.rating = result.rating || {};
      let scoreNum = Number(result.rating.score);
      if (!Number.isFinite(scoreNum) || scoreNum < 1 || scoreNum > 10) {
        const labelMatch = String(result.rating.label || '').match(/\d+(?:[.,]\d+)?/);
        scoreNum = labelMatch ? parseFloat(labelMatch[0].replace(',', '.')) : 5;
      }
      result.rating.score = Math.min(10, Math.max(1, Math.round(scoreNum * 10) / 10));
      result.rating.label = t('NOTA DE RESULTADOS: {score}', { score: result.rating.score }, language);
      result.rating.rationale = result.rating.rationale || t('Calificación puramente financiera sin especulación sobre cumplimiento futuro.', null, language);
      result.isAnnual = true;
      result.formType = '10-K';
    } else {
      result.isAnnual = false;
      result.formType = input.formType ?? '10-Q';
    }

    result.language = language;
    result.fiscalQuarter = extracted.fiscalQuarter ?? fiscalQuarter ?? null;
    result.fiscalYear = extracted.fiscalYear ?? fiscalYear ?? null;

    return result;
  }
}
