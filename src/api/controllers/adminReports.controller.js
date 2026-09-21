/**
 * @fileoverview Controlador para la administración de reportes e incidencias sobre análisis generados con IA.
 * @module api/controllers/adminReports
 */

import path from 'node:path';
import { parseIdParam, getJsonObjectBody } from '../../utils/validate.js';
import { query } from '../../../db/pool.js';
import {
  listAnalysesForAdminReports,
  updateAnalysisErrorReport,
  deleteAnalysisErrorReport,
  batchUpdateAnalysisErrorReports,
  batchDeleteAnalysisErrorReports,
  deleteAnalysisById,
  getAnalysisById,
} from '../../../db/repositories/analysisRepository.js';
import { getReportsStats } from '../../../db/repositories/generalReportsRepository.js';
import { cleanupGeneratedReports } from '../../services/report.service.js';
import { getFilingContentBuffer, getPresentationBuffers } from '../../services/edgar.service.js';
import { analyzePdf, analyzeText, htmlToText, buildPresentationText } from '../../services/analysis.service.js';
import { AgentError } from '../../agents/baseAgent.js';
import { AiProviderError, chatJson } from '../../services/ai/modelProvider.js';
import { invalidateReportCache } from '../../services/seo.service.js';
import { scheduleLanguageVariants } from '../../services/translation/autoTranslate.service.js';
import { regenerateAllReportFormats } from './reportDownload.controller.js';

const ERROR_REPORT_STATUS = ['pending', 'reviewed', 'resolved', 'dismissed'];

/**
 * Obtiene métricas y resumen global de incidencias para el panel de administración.
 * @param {import('express').Request} _req - Petición HTTP.
 * @param {import('express').Response} res - Estadísticas globales.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function getReportsStatsHandler(_req, res, next) {
  try {
    const stats = await getReportsStats();
    res.json({ ok: true, stats });
  } catch (error) {
    next(error);
  }
}

/**
 * Lista los análisis agrupados por empresa priorizando aquellos con incidencias de error reportadas.
 * @param {import('express').Request} req - Petición con query.ticker opcional.
 * @param {import('express').Response} res - Lista de empresas y análisis asociados.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function listAiAnalysisReportsHandler(req, res, next) {
  try {
    const ticker = String(req.query.ticker ?? '').trim() || null;
    const items = await listAnalysesForAdminReports({ ticker });

    const companyMap = new Map();
    for (const item of items) {
      const compKey = String(item.ticker || 'OTRO').toUpperCase();
      if (!companyMap.has(compKey)) {
        companyMap.set(compKey, {
          ticker: item.ticker || (compKey === 'OTRO' ? 'DEMO' : compKey),
          companyName: item.company_name || item.ticker || (compKey === 'OTRO' ? 'Informes de Demostración' : compKey),
          totalAnalyses: 0,
          totalErrors: 0,
          results: [],
        });
      }
      const comp = companyMap.get(compKey);
      comp.totalAnalyses += 1;
      comp.totalErrors += Number(item.error_reports_count || 0);
      comp.results.push(item);
    }

    const companies = Array.from(companyMap.values()).sort((a, b) => {
      if (b.totalErrors !== a.totalErrors) return b.totalErrors - a.totalErrors;
      return String(a.ticker || '').localeCompare(String(b.ticker || ''));
    });

    res.json({
      ok: true,
      totalAnalyses: items.length,
      totalCompanies: companies.length,
      companies,
      rawList: items,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Actualiza el estado o notas de moderación de una incidencia de análisis de IA.
 * @param {import('express').Request} req - Petición con params.id y body (status, adminNotes).
 * @param {import('express').Response} res - Incidencia actualizada.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function updateAiAnalysisReportHandler(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Identificador no válido.' });
      return;
    }
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { status, adminNotes } = body;
    if (status !== undefined && !ERROR_REPORT_STATUS.includes(status)) {
      res.status(400).json({ error: 'Estado no válido. Usa: pending, reviewed, resolved o dismissed.' });
      return;
    }
    const updated = await updateAnalysisErrorReport(id, { status, adminNotes });
    if (!updated) {
      res.status(404).json({ error: 'Reporte de incidencia no encontrado.' });
      return;
    }
    res.json({ ok: true, report: updated, message: 'Incidencia actualizada con éxito.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Elimina una incidencia reportada sobre un análisis de IA.
 * @param {import('express').Request} req - Petición con params.id.
 * @param {import('express').Response} res - Confirmación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function deleteAiAnalysisReportHandler(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Identificador no válido.' });
      return;
    }
    const deleted = await deleteAnalysisErrorReport(id);
    if (!deleted) {
      res.status(404).json({ error: 'Reporte de incidencia no encontrado.' });
      return;
    }
    res.json({ ok: true, message: 'Incidencia eliminada con éxito.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Actualiza en lote el estado o notas de múltiples incidencias de análisis de IA.
 * @param {import('express').Request} req - Petición con body ({ ids, status, adminNotes }).
 * @param {import('express').Response} res - Conteo de incidencias actualizadas.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function batchUpdateAiAnalysisReportsHandler(req, res, next) {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const rawIds = Array.isArray(body.ids) ? body.ids : [];
    const ids = rawIds.map((x) => parseIdParam(x)).filter(Boolean).slice(0, 100);
    if (!ids.length) {
      res.status(400).json({ error: 'Debes proporcionar al menos un ID válido.' });
      return;
    }
    const { status, adminNotes } = body;
    if (status !== undefined && !ERROR_REPORT_STATUS.includes(status)) {
      res.status(400).json({ error: 'Estado no válido. Usa: pending, reviewed, resolved o dismissed.' });
      return;
    }
    const updatedCount = await batchUpdateAnalysisErrorReports(ids, { status, adminNotes });
    res.json({ ok: true, count: updatedCount, message: `${updatedCount} incidencias actualizadas.` });
  } catch (error) {
    next(error);
  }
}

/**
 * Elimina en lote múltiples incidencias de análisis de IA.
 * @param {import('express').Request} req - Petición con body ({ ids }).
 * @param {import('express').Response} res - Conteo de incidencias eliminadas.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function batchDeleteAiAnalysisReportsHandler(req, res, next) {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const rawIds = Array.isArray(body.ids) ? body.ids : [];
    const ids = rawIds.map((x) => parseIdParam(x)).filter(Boolean).slice(0, 100);
    if (!ids.length) {
      res.status(400).json({ error: 'Debes proporcionar al menos un ID válido.' });
      return;
    }
    const deletedCount = await batchDeleteAnalysisErrorReports(ids);
    res.json({ ok: true, count: deletedCount, message: `${deletedCount} incidencias eliminadas.` });
  } catch (error) {
    next(error);
  }
}

/**
 * Elimina un informe de análisis y limpia sus archivos generados en disco.
 * @param {import('express').Request} req - Petición con params.id del análisis.
 * @param {import('express').Response} res - Confirmación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function deleteAiAnalysisHandler(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Identificador no válido.' });
      return;
    }
    const analysis = await getAnalysisById(id);
    if (!analysis) {
      res.status(404).json({ error: 'El análisis no existe.' });
      return;
    }
    await deleteAnalysisById(id);
    if (analysis.pdf_url) {
      await cleanupGeneratedReports(analysis.pdf_url);
    }
    res.json({ ok: true, message: 'Informe de análisis eliminado con éxito.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Fuerza la regeneración administrativa de un análisis desde SEC EDGAR guardando nueva versión.
 * @param {import('express').Request} req - Petición con params.id.
 * @param {import('express').Response} res - Resultado de la regeneración.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function regenerateAiAnalysisHandler(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Identificador no válido.' });
      return;
    }
    const existing = await getAnalysisById(id);
    if (!existing) {
      res.status(404).json({ error: 'El análisis no existe.' });
      return;
    }

    const { ticker, accession } = existing;
    if (!ticker || !accession) {
      res.status(400).json({ error: 'El análisis no cuenta con ticker o accession para consultar SEC EDGAR.' });
      return;
    }

    const content = await getFilingContentBuffer(ticker, accession);
    if (!content) {
      res.status(404).json({ error: 'Informe no encontrado en SEC EDGAR.', code: 'FILING_NOT_FOUND' });
      return;
    }

    let presentationText = null;
    try {
      const presentations = await getPresentationBuffers(ticker, accession);
      if (presentations.length) presentationText = await buildPresentationText(presentations);
    } catch (presentationError) {
      console.warn('[analysis:presentation]', presentationError.message);
    }

    const options = {
      userId: existing.is_public ? null : req.user.id,
      actor: req.user.username || req.user.email,
      isPublic: existing.is_public === true,
      filename: `${ticker}-${accession}.pdf`,
      ticker,
      accession,
      sourceUrl: content.filing?.documentUrl ?? null,
      formType: content.filing?.formType ?? null,
      presentationText,
    };

    const result = content.kind === 'pdf'
      ? await analyzePdf(content.buffer, options)
      : await analyzeText(htmlToText(content.buffer.toString('utf8')), options);

    invalidateReportCache(id);

    scheduleLanguageVariants({
      ticker,
      accession,
      filename: options.filename,
      language: result.language ?? existing.language,
      isPublic: options.isPublic,
      userId: options.userId,
    });

    res.json({
      ok: true,
      analysisId: result.analysisId ?? null,
      origin: result.origin,
      formType: result.formType,
      sector: result.sector,
      subsector: result.subsector ?? null,
      version: result.version ?? null,
      sectorVersion: result.sectorVersion ?? null,
      report: result.report,
      pdfUrl: result.pdfUrl,
      downloadBase: result.downloadBase,
      regenerated: true,
      message: 'Nueva versión generada con éxito. Se conservan las anteriores.',
    });
  } catch (error) {
    if (error instanceof AgentError) {
      res.status(422).json({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof AiProviderError) {
      res.status(error.status || 503).json({ error: error.message, code: error.code });
      return;
    }
    next(error);
  }
}

/**
 * Permite al administrador iterar y corregir datos sobre un informe específico mediante un mini-chat con DeepSeek.
 * @param {import('express').Request} req - Petición HTTP con params.id y body { message, history }.
 * @param {import('express').Response} res - Respuesta HTTP con { ok, message, hasModifications, report }.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function chatAiAnalysisHandler(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Identificador de análisis no válido.' });
      return;
    }

    const existing = await getAnalysisById(id);
    if (!existing) {
      res.status(404).json({ error: 'El análisis no existe.' });
      return;
    }

    const body = getJsonObjectBody(req);
    const userMessage = typeof body.message === 'string' ? body.message.trim() : '';
    if (!userMessage) {
      res.status(400).json({ error: 'Debes proporcionar un mensaje o instrucción.' });
      return;
    }

    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const sanitizedHistory = rawHistory
      .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
      .slice(-10)
      .map((m) => ({
        role: m.role,
        content: String(m.content).trim(),
      }));

    const currentReport = existing.report;
    if (!currentReport || typeof currentReport !== 'object') {
      res.status(400).json({ error: 'El análisis no cuenta con datos de informe estructurados.' });
      return;
    }

    const systemPrompt = `Eres un analista financiero experto y asistente especializado de la plataforma Cifra.
Tu misión es asistir de forma interactiva al administrador en la revisión, auditoría, corrección de cifras e iteración de este informe financiero específico (SEC filing 10-K o 10-Q).

INFORME ACTUAL EN FORMATO JSON:
${JSON.stringify(currentReport, null, 2)}

INSTRUCCIONES PARA LA RESPUESTA:
1. Si el administrador solicita correcciones de datos, cambios de números, ajustes en capital allocation, notas a pie, o redacciones:
   - Aplica los cambios requeridos en el objeto JSON del informe.
   - Si se modifica una cifra clave (por ejemplo ventas, beneficios, EBIT, deuda, caja, deuda neta, FCF, working capital, dividendos, recompras, etc.), actualiza y recalcula coherentemente los totales, porcentajes o textos relacionados dentro del JSON.
   - Asegúrate de devolver la estructura completa del JSON del informe en la propiedad "report".
   - Devuelve SIEMPRE y ÚNICAMENTE un objeto JSON válido con este formato:
   {
     "message": "Explicación clara, concisa y profesional en español de qué cambios se aplicaron y por qué.",
     "hasModifications": true,
     "report": { ...el objeto report completo actualizado... }
   }

2. Si el administrador solo hace una pregunta, pide una explicación o consulta algo sin solicitar cambios al informe:
   {
     "message": "Tu respuesta detallada y profesional en español.",
     "hasModifications": false,
     "report": null
   }

3. No agregues texto markdown antes ni después del bloque JSON.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...sanitizedHistory,
      { role: 'user', content: userMessage },
    ];

    const aiResult = await chatJson(messages, 2, { provider: 'deepseek' });

    const hasModifications = Boolean(aiResult?.hasModifications && aiResult?.report && typeof aiResult.report === 'object');
    let updatedReport = currentReport;

    if (hasModifications) {
      const candidate = aiResult.report;
      if (candidate.horizons && Array.isArray(candidate.horizons)) {
        updatedReport = candidate;
        if (!updatedReport.ticker && currentReport.ticker) updatedReport.ticker = currentReport.ticker;
        if (!updatedReport.formType && currentReport.formType) updatedReport.formType = currentReport.formType;

        await query('UPDATE analyses SET report = $1 WHERE id = $2', [updatedReport, id]);
        invalidateReportCache(id);

        if (existing.pdf_url) {
          const storedBase = path.basename(String(existing.pdf_url), path.extname(String(existing.pdf_url)));
          if (storedBase) {
            regenerateAllReportFormats(storedBase, updatedReport).catch((err) => {
              console.warn('[chatAiAnalysis:regenerateFormats]', err.message);
            });
          }
        }
      }
    }

    res.json({
      ok: true,
      message: aiResult?.message || (hasModifications ? 'Informe actualizado con éxito.' : 'Respuesta generada.'),
      hasModifications,
      report: updatedReport,
    });
  } catch (error) {
    if (error instanceof AiProviderError) {
      res.status(error.status || 503).json({ error: error.message, code: error.code });
      return;
    }
    next(error);
  }
}

