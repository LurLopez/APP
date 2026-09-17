/**
 * @fileoverview Núcleo del Agente Analista (AnalystAgentCore) para Cifra.
 * Coordina la extracción con LLM, enriquecimiento con XBRL de SEC Edgar y estructuración de estados financieros.
 * @module agents/analyst/analystAgentCore
 */

import { BaseAgent, AgentError } from '../baseAgent.js';
import { normalizeExtractedUnits } from './financialParsers.js';
import { buildCapitalAllocationFromBalance, buildWorkingCapitalDataFallback } from './capitalAllocationHelpers.js';
import { getLanguageDirective } from './languageDirective.js';
import {
  resolveAnalysisInput,
  loadSectorRules,
  runExtraction,
  applyTextFallbacks,
  applyExecutiveChangesFallback,
  applyEdgarBackup,
  applyPreviousQuarterCashFlow,
  loadAnnualEdgarData,
  recoverAnnualMaturities,
  recoverAnnualRefinancing,
  structureReport,
  validateReportStructure,
  selectAnnualHorizon,
  normalizeHorizons,
  applyAnnualConclusion,
  normalizeAnnualRating,
} from './analystRunSteps.js';

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

    const { sector, subsector, formType, language, isAnnual } = resolveAnalysisInput(input);
    const languageDirective = getLanguageDirective(language);
    const rules = await loadSectorRules({ sector, subsector, formType, ticker: input.ticker ?? null });

    const extracted = await runExtraction({
      text: input.text,
      presentationText: input.presentationText,
      languageDirective,
    });

    const ticker = input.ticker || extracted.ticker;
    const reportingPeriod = extracted.reportingPeriod || null;
    const fiscalQuarter = isAnnual
      ? 4
      : (extracted.fiscalQuarter || (extracted.ytd?.months ? Math.round(extracted.ytd.months / 3) : null));
    const fiscalYear = extracted.fiscalYear || (reportingPeriod ? Number(reportingPeriod.slice(0, 4)) : null);

    extracted._rawText = input.text;
    applyTextFallbacks(extracted, input.text);
    if (isAnnual) applyExecutiveChangesFallback(extracted, input.text);

    const edgarResults = await applyEdgarBackup(extracted, { ticker, isAnnual, fiscalYear, reportingPeriod });
    normalizeExtractedUnits(extracted);

    await applyPreviousQuarterCashFlow(extracted, { ticker, isAnnual, fiscalQuarter, fiscalYear, reportingPeriod });

    extracted.capitalAllocationData = buildCapitalAllocationFromBalance(extracted, language);
    if (!extracted.workingCapitalData) {
      const workingCapitalFallback = buildWorkingCapitalDataFallback(extracted, language);
      if (workingCapitalFallback) extracted.workingCapitalData = workingCapitalFallback;
    }

    const edgarData = await loadAnnualEdgarData({ edgarResults, ticker, isAnnual, fiscalYear, reportingPeriod });

    if (isAnnual) {
      const debtDetails = extracted.annualDetails?.debt;
      await recoverAnnualMaturities(debtDetails, {
        rawText: input.text,
        fiscalYear,
        edgarDebtMaturities: edgarData.edgarDebtMaturities,
      });
      await recoverAnnualRefinancing(debtDetails, input.text);
    }

    const { _rawText, ...extractedForModel } = extracted;
    const result = await structureReport(extractedForModel, { isAnnual, rules, languageDirective });
    validateReportStructure(result);

    if (isAnnual) selectAnnualHorizon(result, language);
    normalizeHorizons(result, extracted, language);

    if (isAnnual) {
      applyAnnualConclusion(result, extracted, edgarData, fiscalYear, language);
      normalizeAnnualRating(result, language);
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
