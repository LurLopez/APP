/**
 * @fileoverview Servicio orquestador del pipeline de análisis de informes financieros con agentes IA (Origen -> Sector -> Analista).
 * @module services/analysis
 */

import { randomUUID } from 'node:crypto';
import { extractTextFromPdf, isReadablePdfText } from './pdf.service.js';
import { aiContext } from './ai/modelProvider.js';
import { getAgent } from '../agents/agentRegistry.js';
import { AgentError } from '../agents/baseAgent.js';
import { generateReportPdf } from './report.service.js';
import { createAnalysis, updateAnalysis } from '../../db/repositories/analysisRepository.js';
import { safeLogAnalysis } from './analysis/analysisLogger.service.js';
import { buildPresentationText, htmlToText } from './analysis/presentationExtractor.service.js';
import { normalizeLanguage } from '../utils/i18n.js';

export { buildPresentationText, htmlToText };

const PERIOD_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Construye el prefijo base del nombre de archivo exportable (ej. KO-2025-Q3 o KO-2025-K).
 * @param {Object} report - Informe financiero analizado.
 * @param {string|null} formType - Tipo de formulario (10-Q o 10-K).
 * @returns {string} Nombre base para descargas.
 */
export function buildDownloadBase(report, formType) {
  const ticker = String(report?.ticker ?? '').replace(/[^\w.-]/g, '').toUpperCase() || 'INFORME';
  const year = Number(report?.fiscalYear)
    || (PERIOD_DATE_PATTERN.test(report?.reportingPeriod ?? '') ? Number(report.reportingPeriod.slice(0, 4)) : null)
    || new Date().getFullYear();
  const suffix = String(formType ?? '').includes('10-K')
    ? 'K'
    : report?.fiscalQuarter ? `Q${Number(report.fiscalQuarter)}` : 'FY';
  return `${ticker}-${year}-${suffix}`;
}

/**
 * Guarda en base de datos el resultado completado del análisis y asocia metadatos y versiones.
 * @private
 */
async function saveAnalysis({ userId, isPublic, filename, result, sourceUrl, accession, modelUsed, version = null, subsector = null, sectorVersion = null, language = 'es' }) {
  const report = result.report ?? {};
  const periodEnd = PERIOD_DATE_PATTERN.test(report.reportingPeriod ?? '') ? report.reportingPeriod : null;
  const parsedAccession = accession || (filename?.match(/[0-9]{10}-[0-9]{2}-[0-9]{6}/)?.[0] ?? null);

  const created = await createAnalysis({
    userId: userId ?? null,
    isPublic: Boolean(isPublic),
    filename,
    status: 'done',
    ticker: report.ticker ?? null,
    companyName: report.company ?? null,
    periodEnd,
    pdfUrl: result.pdfUrl ?? null,
    sourceUrl: sourceUrl ?? null,
    accession: parsedAccession,
    version,
    subsector,
    sectorVersion,
    language,
  });

  return updateAnalysis(created.id, {
    origin: result.origin ?? null,
    sector: result.sector ?? null,
    report,
    model_used: modelUsed || process.env.AI_PROVIDER || null,
    accession: parsedAccession,
  });
}

/**
 * Ejecuta el pipeline secuencial de agentes de IA sobre el texto del informe.
 * @private
 */
async function runAnalysis(text, options, sessionId) {
  const startedAt = Date.now();
  const language = normalizeLanguage(options.language);
  console.log(`[analysis] sesión IA ${sessionId.slice(0, 8)} · ${options.filename ?? 'informe'} · ${language}`);

  try {
    const originAgent = getAgent('origin');
    const originResult = await originAgent.run({
      text,
      formType: options.formType ?? null,
      ticker: options.ticker ?? null,
      accession: options.accession ?? null,
    });

    const effectiveFormType = options.formType || originResult.formType;

    const sectorAgent = getAgent('sector');
    const sectorResult = await sectorAgent.run({
      text,
      subsector: options.subsector ?? null,
      formType: effectiveFormType,
      ticker: options.ticker ?? null,
    });

    const analystAgent = getAgent('analyst');
    const report = await analystAgent.run({
      text,
      presentationText: options.presentationText ?? null,
      sector: sectorResult.sector,
      subsector: sectorResult.subsector,
      formType: effectiveFormType,
      ticker: options.ticker ?? null,
      language,
    });

    let pdfResult;
    try {
      pdfResult = await generateReportPdf(report);
    } catch (pdfError) {
      console.error('[analysis:pdf]', pdfError.message);
      throw new AgentError(
        'Se completó el análisis pero no se pudo generar el PDF del informe. Inténtalo de nuevo; si persiste, contacta con el administrador.',
        'REPORT_PDF_FAILED',
      );
    }

    const result = {
      text,
      origin: originResult.origin,
      formType: effectiveFormType,
      sector: sectorResult.sector,
      subsector: sectorResult.subsector ?? null,
      version: sectorResult.version,
      sectorVersion: sectorResult.sectorVersion ?? null,
      report,
      pdfUrl: pdfResult.url,
      docxUrl: pdfResult.docxUrl,
      odtUrl: pdfResult.odtUrl,
      downloadBase: buildDownloadBase(report, effectiveFormType),
      language,
    };

    let saved = null;
    try {
      saved = await saveAnalysis({
        userId: options.userId ?? null,
        isPublic: options.isPublic === true,
        filename: options.filename ?? 'informe.pdf',
        sourceUrl: options.sourceUrl ?? null,
        accession: options.accession ?? null,
        modelUsed: options.modelUsed ?? null,
        version: sectorResult.version,
        subsector: sectorResult.subsector ?? null,
        sectorVersion: sectorResult.sectorVersion ?? null,
        language,
        result,
      });
    } catch (error) {
      console.error('[analysis:save]', error.message);
    }

    result.analysisId = saved?.id ?? null;
    await safeLogAnalysis({ options, result, startedAt });
    return result;
  } catch (error) {
    await safeLogAnalysis({ options, error, startedAt });
    throw error;
  }
}

/**
 * Ejecuta el análisis sobre un texto plano utilizando un contexto asíncrono aislado por sesión.
 * @param {string} text - Contenido del informe financiero.
 * @param {Object} [options] - Parámetros de ejecución y metadatos.
 * @returns {Promise<Object>} Resultado consolidado del análisis.
 */
export async function analyzeText(text, options = {}) {
  const sessionId = options.sessionId || randomUUID();
  return aiContext.run({ sessionId }, () => runAnalysis(text, options, sessionId));
}

/**
 * Extrae el texto legible de un PDF y ejecuta el pipeline de análisis financiero.
 * @param {Buffer} buffer - Buffer con los datos binarios del PDF.
 * @param {Object} [options] - Metadatos de la petición.
 * @returns {Promise<Object>} Resultado del análisis.
 */
export async function analyzePdf(buffer, options = {}) {
  const text = await extractTextFromPdf(buffer);
  if (!text || text.trim().length < 100 || !isReadablePdfText(text)) {
    throw new AgentError(
      'El PDF no contiene texto legible (parece un escaneo, tiene fuentes corruptas o está compuesto por imágenes). Usa el PDF oficial descargado de SEC EDGAR.',
      'PDF_NOT_READABLE',
    );
  }
  return analyzeText(text, options);
}
