/**
 * @fileoverview Servicio orquestador del pipeline de análisis de informes financieros con agentes IA (Origen -> Sector -> Analista -> Auditor).
 * @module services/analysis
 */

import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extractTextFromPdf, isReadablePdfText } from './pdf.service.js';
import { aiContext } from './ai/modelProvider.js';
import { getSessionUsage } from './ai/usageTracker.js';
import { getAgent } from '../agents/agentRegistry.js';
import { AgentError } from '../agents/baseAgent.js';
import { runDeterministicChecks } from '../agents/auditor/deterministicChecks.js';
import { auditSourceLimit, capAuditSource, collectFixableErrors, diffReports, isEnabledFlag, validateCorrectedReport } from '../agents/auditor/auditPolicy.js';
import { loadKnowledgeRules } from '../agents/analyst/filingExtractor.js';
import { generateReportPdf, GENERATED_DIR } from './report.service.js';
import { buildReportHtml } from './reportExport.service.js';
import { createAnalysis, updateAnalysis } from '../../db/repositories/analysisRepository.js';
import { safeLogAnalysis } from './analysis/analysisLogger.service.js';
import { buildPresentationText, htmlToText } from './analysis/presentationExtractor.service.js';
import { normalizeLanguage } from '../utils/i18n.js';

export { buildPresentationText, htmlToText };

const PERIOD_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Indica si la auditoría automática del informe está activada (activa por defecto).
 * `AI_AUDIT_ENABLED=false` (o 0/no/off/disabled) la desactiva.
 * @returns {boolean} Verdadero si el auditor debe ejecutarse tras el analista.
 */
function isAuditEnabled() {
  return isEnabledFlag(process.env.AI_AUDIT_ENABLED, true);
}

/**
 * Indica si el auditor debe corregir los errores que encuentre (activo por defecto).
 * `AI_AUDIT_FIX_ENABLED=false` audita sin corregir.
 * @returns {boolean} Verdadero si se aplican correcciones al informe.
 */
function isAuditFixEnabled() {
  return isEnabledFlag(process.env.AI_AUDIT_FIX_ENABLED, true);
}

/**
 * Instantánea del consumo de IA acumulado en la sesión del análisis.
 * @returns {Object} Llamadas, tokens y coste acumulados.
 */
function usageSnapshot() {
  const usage = getSessionUsage();
  return {
    llamadas: usage.llamadas,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    reasoningTokens: usage.reasoningTokens,
    cacheHitTokens: usage.cacheHitTokens,
    cacheMissTokens: usage.cacheMissTokens,
    totalTokens: usage.totalTokens,
    costeUsd: usage.costeUsd,
    costeConocido: usage.costeConocido,
  };
}

/**
 * Diferencia entre dos instantáneas de consumo (para medir una fase concreta).
 * @param {Object} before - Instantánea anterior.
 * @param {Object} after - Instantánea posterior.
 * @returns {Object} Consumo de la fase.
 */
function usageDelta(before, after) {
  const delta = { costeConocido: Boolean(before.costeConocido && after.costeConocido) };
  for (const key of ['llamadas', 'promptTokens', 'completionTokens', 'reasoningTokens', 'cacheHitTokens', 'cacheMissTokens', 'totalTokens']) {
    delta[key] = (after[key] ?? 0) - (before[key] ?? 0);
  }
  delta.costeUsd = Number(((after.costeUsd ?? 0) - (before.costeUsd ?? 0)).toFixed(6));
  return delta;
}

/**
 * Audita el informe con el texto completo del filing y, si hay errores graves o menores,
 * pide al auditor una versión corregida. Si la corrección no supera las validaciones
 * (estructura, horizontes o comprobaciones deterministas), se conserva el informe original.
 * El auditor recibe las mismas reglas `.md` que el analista (generales, sector, subsector
 * y empresa) para juzgar contra ellas, y el texto fuente se ajusta a ese presupuesto.
 * @private
 * @param {Object} params - Informe, texto fuente, reglas de análisis y metadatos del filing.
 * @returns {Promise<{report: Object, audit: Object|null}>} Informe final y resumen de la auditoría.
 */
async function auditAndFixReport({ report, sourceText, rules = '', filingMeta }) {
  const auditorAgent = getAgent('auditor');
  if (!auditorAgent) return { report, audit: null, changes: [] };

  const rulesText = String(rules ?? '').trim();
  const capped = capAuditSource(sourceText, auditSourceLimit(rulesText.length));
  const { audit, deterministic } = await auditorAgent.run({
    report,
    sourceText: capped.text,
    filingMeta,
    rules: rulesText,
  });

  const fixable = collectFixableErrors(audit);
  const info = {
    nota: Number.isFinite(Number(audit?.score)) ? Number(audit.score) : null,
    veredicto: audit?.veredicto ?? null,
    errores: Array.isArray(audit?.errores) ? audit.errores.length : 0,
    corregibles: fixable.length,
    corregido: false,
    revertido: false,
    fuenteRecortada: capped.truncated,
  };
  console.log(`[analysis:audit] nota ${info.nota ?? '—'}/10 · ${info.errores} errores (${info.corregibles} corregibles)`);

  if (!fixable.length || !isAuditFixEnabled()) return { report, audit: info, changes: [] };

  const candidate = await auditorAgent.fix({
    report,
    audit,
    deterministic,
    filingMeta,
    rules: rulesText,
  });

  const validated = validateCorrectedReport(candidate, report);
  if (!validated.ok) {
    info.revertido = true;
    info.motivo = validated.reason;
    console.warn(`[analysis:audit] corrección descartada: ${validated.reason}`);
    return { report, audit: info, changes: [] };
  }
  if (JSON.stringify(validated.report) === JSON.stringify(report)) {
    info.motivo = 'sin_cambios';
    return { report, audit: info, changes: [] };
  }

  const failsBefore = deterministic?.counts?.fail ?? runDeterministicChecks(report).counts.fail ?? 0;
  const failsAfter = runDeterministicChecks(validated.report).counts.fail ?? 0;
  if (failsAfter > failsBefore) {
    info.revertido = true;
    info.motivo = 'deterministas';
    console.warn(`[analysis:audit] corrección descartada: fallos deterministas ${failsBefore} -> ${failsAfter}`);
    return { report, audit: info, changes: [] };
  }

  const changes = diffReports(report, validated.report);
  info.corregido = true;
  info.cambios = changes.length;
  info.fallosDeterministas = { antes: failsBefore, despues: failsAfter };
  console.log(`[analysis:audit] informe corregido (${changes.length} cambios · fallos deterministas ${failsBefore} -> ${failsAfter})`);
  return { report: validated.report, audit: info, changes };
}

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
    audit: result.audit ?? null,
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
  const usageStart = usageSnapshot();
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
    const analystReport = await analystAgent.run({
      text,
      presentationText: options.presentationText ?? null,
      sector: sectorResult.sector,
      subsector: sectorResult.subsector,
      formType: effectiveFormType,
      ticker: options.ticker ?? null,
      accession: options.accession ?? null,
      language,
    });

    const analysisMs = Date.now() - startedAt;
    const usageAfterAnalysis = usageSnapshot();

    let report = analystReport;
    let audit = null;
    let auditChanges = null;
    let auditMs = 0;
    let usageAfterAudit = usageAfterAnalysis;
    if (isAuditEnabled()) {
      const auditStartedAt = Date.now();
      try {
        const analysisRules = await loadKnowledgeRules(
          sectorResult.sector,
          sectorResult.subsector ?? null,
          effectiveFormType,
          options.ticker ?? null,
        );
        const outcome = await auditAndFixReport({
          report: analystReport,
          sourceText: text,
          rules: analysisRules,
          filingMeta: {
            ticker: options.ticker ?? analystReport.ticker ?? null,
            formType: effectiveFormType,
            period: analystReport.reportingPeriod ?? null,
            periodLabel: analystReport.periodLabel ?? null,
          },
        });
        report = outcome.report;
        audit = outcome.audit;
        auditChanges = outcome.changes?.length ? outcome.changes : null;
      } catch (auditError) {
        console.error('[analysis:audit]', auditError.message);
        report = analystReport;
        audit = { error: auditError.code || auditError.message };
      }
      auditMs = Date.now() - auditStartedAt;
      usageAfterAudit = usageSnapshot();
    }

    let pdfResult;
    const pdfStartedAt = Date.now();
    try {
      pdfResult = await generateReportPdf(report);
    } catch (pdfError) {
      console.error('[analysis:pdf]', pdfError.message);
      throw new AgentError(
        'Se completó el análisis pero no se pudo generar el PDF del informe. Inténtalo de nuevo; si persiste, contacta con el administrador.',
        'REPORT_PDF_FAILED',
      );
    }
    const pdfMs = Date.now() - pdfStartedAt;

    // HTML previo a los ajustes del auditor: se guarda junto al informe final con el sufijo
    // `-antes` para poder comparar qué cambió la revisión (mismo UUID base).
    if (isAuditEnabled() && audit && !audit.error) {
      try {
        const beforeHtml = await buildReportHtml(analystReport);
        await writeFile(path.join(GENERATED_DIR, `${pdfResult.id}-antes.html`), beforeHtml);
        audit.htmlAntes = `/api/reports/${pdfResult.id}-antes.html`;
        audit.htmlDespues = pdfResult.htmlUrl ?? `/api/reports/${pdfResult.id}.html`;
      } catch (beforeError) {
        console.warn('[analysis:audit-html]', beforeError.message);
      }
    }

    const phases = {
      analisis: { segundos: Number((analysisMs / 1000).toFixed(1)), ...usageDelta(usageStart, usageAfterAnalysis) },
      revision: isAuditEnabled()
        ? {
          segundos: Number((auditMs / 1000).toFixed(1)),
          ...usageDelta(usageAfterAnalysis, usageAfterAudit),
          nota: audit?.nota ?? null,
          veredicto: audit?.veredicto ?? null,
          errores: audit?.errores ?? null,
          corregido: Boolean(audit?.corregido),
          cambios: auditChanges?.length ?? 0,
        }
        : null,
      pdf: { segundos: Number((pdfMs / 1000).toFixed(1)) },
    };

    const result = {
      text,
      origin: originResult.origin,
      formType: effectiveFormType,
      sector: sectorResult.sector,
      subsector: sectorResult.subsector ?? null,
      version: sectorResult.version,
      sectorVersion: sectorResult.sectorVersion ?? null,
      report,
      audit,
      auditChanges,
      phases,
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
