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
  isPlaceholderText,
  formatFinancialValue,
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
import { loadKnowledgeRules, buildAnalysisText } from './filingExtractor.js';
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
  processOutlookSection,
  processDebtSection,
  processAcquisitionsDividendsAndWatchlist,
  renumberConclusionSections,
} from './annualConclusionProcessor.js';

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
    const isAnnual = String(formType || '').toUpperCase().includes('10-K')
      || String(formType || '').toLowerCase().includes('anual');

    let rules;
    try {
      rules = await loadKnowledgeRules(sector, subsector, formType, input.ticker ?? null);
    } catch {
      throw new AgentError(`No hay reglas de análisis definidas para el sector ${sector}.`, 'NO_SECTOR_RULES');
    }

    const extractionPrompt = EXTRACTION_PROMPT.replace('{SCHEMA}', EXTRACTION_SCHEMA.trim());
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
    normalizeExtractedUnits(extracted);
    extracted.capitalAllocationData = buildCapitalAllocationFromBalance(extracted);

    if (!extracted.workingCapitalData) {
      const fallbackWc = buildWorkingCapitalDataFallback(extracted);
      if (fallbackWc) extracted.workingCapitalData = fallbackWc;
    }

    // Datos suplementarios anuales
    const edgarData = { edgarDebtHistory: null, edgarDebtMaturities: null, edgarDividendHistory: null };
    if (isAnnual && ticker) {
      try {
        const edgarResults = await getCompanyResults(ticker);
        const annualSeries = edgarResults?.annual || [];
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
        if (Array.isArray(edgarResults?.debtMaturities?.years) && edgarResults.debtMaturities.years.length) {
          if (!reportYear || Number(edgarResults.debtMaturities.baseYear) === reportYear) {
            edgarData.edgarDebtMaturities = edgarResults.debtMaturities;
          }
        }
      } catch (err) {
        console.warn('[analyst] No se pudo obtener el historial de deuda desde EDGAR:', err.message);
      }
    }

    // Fase 2: estructuración y redacción analítica
    const basePrompt = isAnnual ? ANNUAL_SYSTEM_PROMPT : SYSTEM_PROMPT;
    const schema = isAnnual ? ANNUAL_OUTPUT_SCHEMA : OUTPUT_SCHEMA;
    const systemPrompt = basePrompt
      .replace('{REGLAS}', rules.trim())
      .replace('{SCHEMA}', schema.trim());

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
        String(h.label || '').toUpperCase().includes('AÑO')
      ) || result.horizons[result.horizons.length - 1];
      annualHorizon.label = 'EN TODO EL AÑO (12 MESES)';
      result.horizons = [annualHorizon];
    }

    // Normalización defensiva de horizontes
    result.horizons.forEach((horizon) => {
      normalizeSalesBlock(horizon, extracted);
      normalizeCashFlowBlock(horizon, extracted);
      normalizeCapitalBlock(horizon, extracted);
    });

    // Conclusión anual
    if (isAnnual) {
      result.conclusion = result.conclusion || {};
      const rawAnn = extracted.annualDetails || {};
      processRepurchasesSection(result.conclusion, rawAnn, extracted);
      processOutlookSection(result.conclusion, rawAnn, result);
      processDebtSection(result.conclusion, rawAnn, edgarData, fiscalYear);
      processAcquisitionsDividendsAndWatchlist(result.conclusion, rawAnn, extracted, edgarData, fiscalYear);
      renumberConclusionSections(result.conclusion);

      result.rating = result.rating || {};
      let scoreNum = Number(result.rating.score);
      if (!Number.isFinite(scoreNum) || scoreNum < 1 || scoreNum > 10) {
        const labelMatch = String(result.rating.label || '').match(/\d+(?:[.,]\d+)?/);
        scoreNum = labelMatch ? parseFloat(labelMatch[0].replace(',', '.')) : 5;
      }
      result.rating.score = Math.min(10, Math.max(1, Math.round(scoreNum * 10) / 10));
      result.rating.label = `NOTA DE RESULTADOS: ${result.rating.score}`;
      result.rating.rationale = result.rating.rationale || 'Calificación puramente financiera sin especulación sobre cumplimiento futuro.';
      result.isAnnual = true;
      result.formType = '10-K';
    } else {
      result.isAnnual = false;
      result.formType = input.formType ?? '10-Q';
    }

    result.fiscalQuarter = extracted.fiscalQuarter ?? fiscalQuarter ?? null;
    result.fiscalYear = extracted.fiscalYear ?? fiscalYear ?? null;

    return result;
  }
}
