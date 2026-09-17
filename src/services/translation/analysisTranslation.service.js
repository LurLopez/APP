/**
 * @fileoverview Traduce un análisis ya guardado al otro idioma, genera sus PDF/DOCX/ODT
 * y lo persiste como una nueva variante (mismos datos, narrativa traducida).
 * @module services/translation/analysisTranslation
 */

import { randomUUID } from 'node:crypto';
import { generateReportPdf } from '../report.service.js';
import { buildDownloadBase } from '../analysis.service.js';
import { safeLogAnalysis } from '../analysis/analysisLogger.service.js';
import { createAnalysis, updateAnalysis } from '../../../db/repositories/analysisRepository.js';
import { aiContext } from '../ai/modelProvider.js';
import { normalizeLanguage } from '../../utils/i18n.js';
import { translateReport } from './reportTranslator.service.js';

async function buildTranslatedPdf(report) {
  try {
    return await generateReportPdf(report);
  } catch (error) {
    console.warn('[translation:pdf]', error.message);
    return null;
  }
}

function resolveModelLabel(source) {
  const base = source.model_used || process.env.AI_PROVIDER || 'ia';
  return `${base} · traducción`;
}

async function saveTranslatedVariant({ source, report, targetLanguage, userId, isPublic, pdfResult }) {
  const created = await createAnalysis({
    userId: userId ?? null,
    isPublic: isPublic ?? Boolean(source.is_public),
    filename: source.filename,
    status: 'done',
    ticker: source.ticker ?? report.ticker ?? null,
    companyName: source.company_name ?? report.company ?? null,
    periodEnd: source.period_end ?? null,
    pdfUrl: pdfResult?.url ?? null,
    sourceUrl: source.source_url ?? null,
    accession: source.accession ?? null,
    version: source.version ?? null,
    subsector: source.subsector ?? null,
    sectorVersion: source.sector_version ?? null,
    language: targetLanguage,
  });

  return updateAnalysis(created.id, {
    origin: source.origin ?? null,
    sector: source.sector ?? null,
    report,
    model_used: resolveModelLabel(source),
  });
}

/**
 * Traduce una variante existente del informe y la guarda como análisis nuevo.
 * @param {{ source: object, targetLanguage: string, userId?: number|null, actor?: string|null, isPublic?: boolean|null }} params
 * @returns {Promise<object>} Resultado con el informe traducido y sus descargas.
 */
export async function translateAnalysisVariant({ source, targetLanguage, userId = null, actor = null, isPublic = null }) {
  const sessionId = randomUUID();
  const startedAt = Date.now();
  const target = normalizeLanguage(targetLanguage);
  const sourceLanguage = normalizeLanguage(source.language || source.report?.language);
  const options = {
    userId,
    actor,
    filename: source.filename,
    ticker: source.ticker ?? source.report?.ticker ?? null,
    accession: source.accession ?? null,
  };

  return aiContext.run({ sessionId }, async () => {
    try {
      const report = await translateReport(source.report, target, { sourceLanguage });
      const pdfResult = await buildTranslatedPdf(report);
      const saved = await saveTranslatedVariant({
        source,
        report,
        targetLanguage: target,
        userId,
        isPublic,
        pdfResult,
      });

      const result = {
        analysisId: saved?.id ?? null,
        origin: source.origin ?? report.origin ?? 'US',
        formType: report.formType ?? null,
        sector: source.sector ?? null,
        subsector: source.subsector ?? null,
        version: source.version ?? null,
        sectorVersion: source.sector_version ?? null,
        report,
        pdfUrl: pdfResult?.url ?? null,
        docxUrl: pdfResult?.docxUrl ?? null,
        odtUrl: pdfResult?.odtUrl ?? null,
        downloadBase: buildDownloadBase(report, report.formType ?? null),
        language: target,
        translatedFrom: sourceLanguage,
      };

      await safeLogAnalysis({ options, result, startedAt });
      return result;
    } catch (error) {
      await safeLogAnalysis({ options, error, startedAt });
      throw error;
    }
  });
}
