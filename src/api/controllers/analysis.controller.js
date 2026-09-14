/**
 * @fileoverview Controlador principal para la gestión y ejecución de análisis de informes financieros.
 * @module api/controllers/analysis
 */

import multer from 'multer';
import { analyzePdf, buildDownloadBase, buildPresentationText } from '../../services/analysis.service.js';
import { AgentError } from '../../agents/baseAgent.js';
import { AiProviderError } from '../../services/ai/modelProvider.js';
import {
  listAnalyses,
  getAnalysisById,
  updateAnalysis,
  listAnalysisCompanies,
} from '../../../db/repositories/analysisRepository.js';
import { getCompanyFilings } from '../../services/edgar.service.js';
import { resolveAnalysisVersion, isAnalysisOutdated } from '../../agents/sectorAgent.js';
import { resolveUser } from '../../middleware/auth.middleware.js';
import { getAiQuota, reserveAiQuota, refundAiQuota } from '../../services/aiQuota.service.js';
import {
  parseIdParam,
  parseDateFilter,
  isRealPdf,
  escapeHtml,
  isAnalysisVisible,
} from '../../utils/validate.js';

const TICKER_PATTERN = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

/**
 * Middleware para gestionar errores generados por la carga de archivos vía Multer.
 * @param {Error} error - Error capturado.
 * @param {import('express').Request} _req - Petición HTTP.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {void}
 */
export function uploadErrorHandler(error, _req, res, next) {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'El archivo supera el límite de 25 MB.'
      : error.code === 'LIMIT_UNEXPECTED_FILE'
        ? 'Archivo inesperado. Usa los campos "file" y "presentation".'
        : 'Error al recibir el archivo.';
    res.status(400).json({ error: message });
    return;
  }
  if (error instanceof AgentError) {
    res.status(422).json({ error: error.message, code: error.code });
    return;
  }
  next(error);
}

/**
 * Renderiza una página HTML informativa cuando no se puede localizar el documento original.
 * @private
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {string} message - Mensaje amigable descriptivo.
 * @param {number} [status=404] - Código de estado HTTP.
 */
function sendSourceError(res, message, status = 404) {
  res.status(status).type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Informe original</title></head>
<body style="font-family:system-ui,sans-serif;padding:48px 24px;text-align:center;color:#333">
<h1 style="font-size:18px;margin-bottom:8px">No se pudo abrir el informe original</h1>
<p style="font-size:14px;color:#666">${escapeHtml(message)}</p></body></html>`);
}

/**
 * Convierte un valor de fecha a formato ISO AAAA-MM-DD.
 * @private
 * @param {unknown} value - Fecha candidata.
 * @returns {string|null} Fecha formateada o null.
 */
function toIsoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * Procesa la subida y análisis de un informe financiero en PDF mediante los agentes de IA.
 * @param {import('express').Request} req - Petición HTTP con archivos en req.files y usuario autenticado.
 * @param {import('express').Response} res - Respuesta HTTP con el informe estructurado.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */
export async function uploadAndAnalyzePdf(req, res, next) {
  let usageId = null;
  try {
    const mainFile = req.files?.file?.[0];
    const presentationFile = req.files?.presentation?.[0];

    if (!mainFile) {
      res.status(400).json({ error: 'No se recibió ningún archivo. Selecciona o arrastra un PDF válido.' });
      return;
    }
    if (!isRealPdf(mainFile.buffer) || mainFile.size === 0) {
      res.status(422).json({ error: 'Solo se admiten archivos PDF.', code: 'NOT_PDF' });
      return;
    }
    if (mainFile.size > MAX_PDF_BYTES) {
      res.status(400).json({ error: 'El archivo supera el límite de 25 MB.' });
      return;
    }

    let presentationText = null;
    if (presentationFile && isRealPdf(presentationFile.buffer)) {
      try {
        presentationText = await buildPresentationText([
          { name: presentationFile.originalname, buffer: presentationFile.buffer, kind: 'pdf' },
        ]);
      } catch (presentationError) {
        console.warn('[analysis:presentation-upload]', presentationError.message);
      }
    }

    usageId = await reserveAiQuota(req.user);

    const result = await analyzePdf(mainFile.buffer, {
      userId: req.user.id,
      actor: req.user.username || req.user.email,
      filename: mainFile.originalname,
      presentationText,
    });

    const quota = await getAiQuota(req.user);
    res.json({
      ok: true,
      origin: result.origin,
      formType: result.formType,
      sector: result.sector,
      report: result.report,
      pdfUrl: result.pdfUrl,
      saved: true,
      quota,
    });
  } catch (error) {
    await refundAiQuota(usageId);
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
 * Consulta la lista paginada y filtrada de análisis ejecutados por el usuario autenticado.
 * @param {import('express').Request} req - Petición con query params (filtros de fecha, ticker, tipo).
 * @param {import('express').Response} res - Lista de análisis procesados.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */
export async function listUserAnalyses(req, res, next) {
  try {
    const periodFrom = parseDateFilter(req.query.periodFrom);
    const periodTo = parseDateFilter(req.query.periodTo);
    const createdFrom = parseDateFilter(req.query.createdFrom);
    const createdTo = parseDateFilter(req.query.createdTo);

    if ([periodFrom, periodTo, createdFrom, createdTo].some((item) => !item.ok)) {
      res.status(400).json({ error: 'Los filtros de fecha deben tener formato AAAA-MM-DD.' });
      return;
    }

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : 100;
    const reportType = req.query.reportType === 'annual' ? 'annual' : (req.query.reportType === 'quarterly' ? 'quarterly' : null);

    const analyses = await listAnalyses({
      userId: req.user.id,
      limit,
      ticker: String(req.query.ticker ?? '').trim().slice(0, 64) || null,
      periodFrom: periodFrom.value,
      periodTo: periodTo.value,
      createdFrom: createdFrom.value,
      createdTo: createdTo.value,
      reportType,
    });

    res.json({
      ok: true,
      analyses: analyses.map(({ report, ...analysis }) => {
        const isAnnual =
          report?.isAnnual === true ||
          report?.isAnnual === 'true' ||
          report?.formType === '10-K' ||
          /annual|full year|10-?k/i.test(String(report?.periodTitle || '')) ||
          /10-?k/i.test(String(analysis.filename || ''));

        return {
          ...analysis,
          ticker: analysis.ticker ?? report?.ticker ?? null,
          company_name: analysis.company_name ?? report?.company ?? null,
          periodTitle: report?.periodTitle ?? report?.period ?? null,
          isAnnual,
          formType: report?.formType ?? (isAnnual ? '10-K' : '10-Q'),
          downloadBase: buildDownloadBase(report, report?.formType ?? null),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retorna las empresas únicas analizadas por el usuario autenticado para autocompletar filtros.
 * @param {import('express').Request} req - Petición con query param opcional `q`.
 * @param {import('express').Response} res - Lista de empresas encontradas.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */
export async function listUserAnalysisCompanies(req, res, next) {
  try {
    const companies = await listAnalysisCompanies({
      userId: req.user.id,
      search: String(req.query.q ?? '').trim().slice(0, 64) || null,
    });
    res.json({ ok: true, companies });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtiene el detalle completo de un análisis existente junto con el estado de su versión analítica.
 * @param {import('express').Request} req - Petición HTTP con params.id.
 * @param {import('express').Response} res - Detalle estructurado del análisis.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */
export async function getAnalysisDetail(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Identificador no válido.' });
      return;
    }

    const user = await resolveUser(req);
    const analysis = await getAnalysisById(id);

    if (!isAnalysisVisible(analysis, user)) {
      res.status(404).json({ error: 'El análisis solicitado no existe.' });
      return;
    }

    const { report } = analysis;
    const versionOptions = {
      sector: analysis.sector ?? 'defensive_consumer',
      subsector: analysis.subsector ?? null,
      ticker: analysis.ticker ?? report?.ticker ?? null,
      formType: report?.formType ?? null,
    };

    res.json({
      ok: true,
      analysis: {
        ...analysis,
        isReviewed: Boolean(analysis.is_reviewed),
        formType: report?.formType ?? null,
        ticker: analysis.ticker ?? report?.ticker ?? null,
        company_name: analysis.company_name ?? report?.company ?? null,
        periodTitle: report?.periodTitle ?? report?.period ?? null,
        downloadBase: buildDownloadBase(report, report?.formType ?? null),
        currentVersion: await resolveAnalysisVersion(versionOptions),
        versionOutdated: await isAnalysisOutdated({
          version: analysis.version,
          ...versionOptions,
        }),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Redirige al documento oficial original en SEC EDGAR asociado al análisis solicitado.
 * @param {import('express').Request} req - Petición con params.id del análisis.
 * @param {import('express').Response} res - Redirección 302 hacia SEC EDGAR o error HTML.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */
export async function redirectToOriginalSource(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      sendSourceError(res, 'Identificador no válido.');
      return;
    }

    const analysis = await getAnalysisById(id);
    if (!analysis || analysis.user_id !== req.user.id) {
      sendSourceError(res, 'El análisis solicitado no existe.');
      return;
    }

    if (analysis.source_url) {
      res.redirect(302, analysis.source_url);
      return;
    }

    const ticker = String(analysis.ticker ?? analysis.report?.ticker ?? '').trim().toUpperCase();
    if (!ticker || !TICKER_PATTERN.test(ticker)) {
      sendSourceError(res, 'Este análisis no tiene asociada una empresa de la SEC. Sube el PDF original desde SEC EDGAR para consultarlo.');
      return;
    }

    const period = toIsoDate(analysis.period_end) ?? toIsoDate(analysis.report?.reportingPeriod);
    const formType = analysis.report?.formType ?? null;

    const { filings } = await getCompanyFilings(ticker);

    let match = null;
    if (period) {
      const samePeriod = filings.filter((filing) => filing.period === period);
      match = (formType ? samePeriod.find((filing) => filing.formType === formType) : null) ?? samePeriod[0] ?? null;
    }
    if (!match) {
      const year = period ? period.slice(0, 4) : null;
      const sameYear = filings.filter((filing) => year && String(filing.period ?? '').startsWith(year));
      match = (formType ? sameYear.find((filing) => filing.formType === formType) : null) ?? null;
    }

    if (!match?.documentUrl) {
      sendSourceError(res, `No se encontró el informe original (${period ?? 'periodo desconocido'}) de ${ticker} en SEC EDGAR.`);
      return;
    }

    try {
      await updateAnalysis(id, { source_url: match.documentUrl });
    } catch (error) {
      console.error('[analysis:source-url]', error.message);
    }

    res.redirect(302, match.documentUrl);
  } catch (error) {
    next(error);
  }
}
