import multer from 'multer';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { pool } from '../../../db/pool.js';
import { analyzePdf, buildDownloadBase, buildPresentationText } from '../../services/analysis.service.js';
import { AgentError } from '../../agents/baseAgent.js';
import { AiProviderError } from '../../services/ai/modelProvider.js';
import { GENERATED_DIR } from '../../services/report.service.js';
import {
  listAnalyses,
  getAnalysisById,
  updateAnalysis,
  listAnalysisCompanies,
  saveAnalysisRating,
  getAnalysisRatingSummary,
  createAnalysisErrorReport,
  setAnalysisReviewed,
} from '../../../db/repositories/analysisRepository.js';
import { getCompanyFilings } from '../../services/edgar.service.js';
import { resolveAnalysisVersion, isAnalysisOutdated } from '../../agents/sectorAgent.js';
import { requireAuth, requireAdmin, resolveUser } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rateLimit.middleware.js';
import {
  getAiQuota,
  reserveAiQuota,
  refundAiQuota,
} from '../../services/aiQuota.service.js';
import { parseIdParam, pickCategory, sanitizeReportImages } from '../../utils/validate.js';

const TICKER_PATTERN = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const ERROR_REPORT_CATEGORIES = [
  'incorrect_numbers',
  'wrong_period',
  'missing_data',
  'wrong_classification',
  'bad_formatting',
  'other',
];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendSourceError(res, message, status = 404) {
  res.status(status).type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Informe original</title></head>
<body style="font-family:system-ui,sans-serif;padding:48px 24px;text-align:center;color:#333">
<h1 style="font-size:18px;margin-bottom:8px">No se pudo abrir el informe original</h1>
<p style="font-size:14px;color:#666">${escapeHtml(message)}</p></body></html>`);
}

// ID estricto: solo enteros positivos (rechaza "1e3", "12abc", " 5 ", "0", negativos...)
// parseIdParam se importa desde src/utils/validate.js

// Solo permite body JSON de tipo objeto (Express 5 deja req.body undefined si no hay parser)
function getJsonObjectBody(req) {
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) return {};
  return req.body;
}

function toIsoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

// Valida los filtros de fecha; devuelve { ok, value } para distinguir "ausente" de "inválido"
function parseDateFilter(value) {
  const str = String(value ?? '').trim();
  if (!str) return { ok: true, value: null };
  if (!DATE_PATTERN.test(str)) return { ok: false, value: null };
  const date = new Date(`${str}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== str) {
    return { ok: false, value: null };
  }
  return { ok: true, value: str };
}

// Un PDF válido real empieza por la firma "%PDF-": evita aceptar archivos renombrados
// con extensión .pdf o Content-Type suplantado (pdf-parse también lo exigiría).
function isRealPdf(buffer) {
  return Boolean(buffer
    && typeof buffer.length === 'number'
    && buffer.length >= 5
    && buffer.subarray(0, 1024).toString('latin1').startsWith('%PDF-'));
}

function isPdfUpload(file) {
  return Boolean(
    file
    && file.size > 0
    && file.size <= MAX_PDF_BYTES
    && isRealPdf(file.buffer),
  );
}

// Normaliza la IP: evita listas "a, b, c" de X-Forwarded-For y arrays
function normalizeIpAddress(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim().slice(0, 64) || null;
  }
  return (req.ip || req.socket?.remoteAddress || null) ?? null;
}

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 2 },
});

// Captura los errores de multer ANTES del handler async (si no, MulterError se
// escapa al errorHandler global sin los mensajes amables).
function uploadErrorHandler(error, _req, res, next) {
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

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  scope: 'analysis:upload',
  message: 'Has subido demasiados informes en la última hora. Espera un poco antes de volver a intentarlo.',
});

const ratingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  scope: 'analysis:rating',
  message: 'Has registrado demasiadas valoraciones. Espera unos minutos antes de volver a intentarlo.',
});

const errorReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  scope: 'analysis:error-report',
  message: 'Has enviado demasiados reportes de error. Espera un poco antes de volver a intentarlo.',
});

const reportDownloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  scope: 'analysis:report-download',
  message: 'Demasiadas descargas desde tu conexión. Espera unos segundos antes de volver a intentarlo.',
});

// Comprueba que el análisis es visible para el usuario (público o suyo);
// responde 404 genérico (sin filtrar la existencia) y devuelve el análisis o null.
function isAnalysisVisible(analysis, user) {
  if (!analysis) return false;
  if (analysis.is_public) return true;
  return Boolean(user && analysis.user_id === user.id);
}

router.post('/upload', uploadLimiter, requireAuth, upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'presentation', maxCount: 1 },
]), uploadErrorHandler, async (req, res, next) => {
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
    if (presentationFile) {
      if (isRealPdf(presentationFile.buffer)) {
        try {
          presentationText = await buildPresentationText([
            { name: presentationFile.originalname, buffer: presentationFile.buffer, kind: 'pdf' },
          ]);
        } catch (presentationError) {
          console.warn('[analysis:presentation-upload]', presentationError.message);
        }
      } else {
        console.warn('[analysis:presentation-upload] La presentación no es un PDF válido; se ignora.');
      }
    }

    // Reserva atómica: inserta y comprueba en una sola operación para que dos
    // peticiones paralelas del mismo usuario no superen el límite diario.
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
});

router.get('/analyses', requireAuth, async (req, res, next) => {
  try {
    const periodFrom = parseDateFilter(req.query.periodFrom);
    const periodTo = parseDateFilter(req.query.periodTo);
    const createdFrom = parseDateFilter(req.query.createdFrom);
    const createdTo = parseDateFilter(req.query.createdTo);
    const invalid = [periodFrom, periodTo, createdFrom, createdTo].some((parsed) => !parsed.ok);
    if (invalid) {
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
});

router.get('/analyses/companies', requireAuth, async (req, res, next) => {
  try {
    const companies = await listAnalysisCompanies({
      userId: req.user.id,
      search: String(req.query.q ?? '').trim().slice(0, 64) || null,
    });
    res.json({ ok: true, companies });
  } catch (error) {
    next(error);
  }
});

router.get('/analyses/:id/source', requireAuth, async (req, res, next) => {
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
});

router.get('/analyses/:id', async (req, res, next) => {
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
});

const handleAnalysisReview = async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Identificador no válido.' });
      return;
    }
    const body = getJsonObjectBody(req);
    const isReviewed = body.isReviewed !== false && body.is_reviewed !== false && body.reviewed !== false;
    const updated = await setAnalysisReviewed(id, { isReviewed, userId: req.user.id });
    if (!updated) {
      res.status(404).json({ error: 'El análisis no existe.' });
      return;
    }
    res.json({
      ok: true,
      id: updated.id,
      isReviewed: Boolean(updated.is_reviewed),
      reviewedAt: updated.reviewed_at,
      reviewedBy: updated.reviewed_by,
    });
  } catch (error) {
    next(error);
  }
};

router.post('/analyses/:id/review', requireAdmin, handleAnalysisReview);
router.patch('/analyses/:id/review', requireAdmin, handleAnalysisReview);

router.post('/analyses/:id/rating', ratingLimiter, async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Identificador no válido.' });
      return;
    }
    const user = await resolveUser(req);
    const analysis = await getAnalysisById(id);
    // Solo se puede valorar un análisis visible (público o propio)
    if (!isAnalysisVisible(analysis, user)) {
      res.status(404).json({ error: 'El análisis no existe.' });
      return;
    }
    const body = getJsonObjectBody(req);
    const ratingValue = Number(body.rating);
    const rating = Number.isFinite(ratingValue) ? Math.max(1, Math.min(5, Math.round(ratingValue))) : 5;
    const feedback = typeof body.feedback === 'string' ? body.feedback.trim().slice(0, 1000) || null : null;


    await saveAnalysisRating({
      analysisId: id,
      userId: user?.id ?? null,
      rating,
      feedback,
      ipAddress: normalizeIpAddress(req),
    });

    const summary = await getAnalysisRatingSummary(id, user?.id ?? null);
    res.json({ ok: true, message: 'Valoración registrada.', ...summary });
  } catch (error) {
    next(error);
  }
});

router.get('/analyses/:id/rating', async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Identificador no válido.' });
      return;
    }
    const user = await resolveUser(req);
    const summary = await getAnalysisRatingSummary(id, user?.id ?? null);
    res.json({ ok: true, ...summary });
  } catch (error) {
    next(error);
  }
});

router.post('/analyses/:id/report-error', errorReportLimiter, async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Identificador no válido.' });
      return;
    }
    const user = await resolveUser(req);
    const analysis = await getAnalysisById(id);
    if (!isAnalysisVisible(analysis, user)) {
      res.status(404).json({ error: 'El análisis no existe.' });
      return;
    }
    const body = getJsonObjectBody(req);
    const category = pickCategory(body.category, ERROR_REPORT_CATEGORIES, 'other');
    const description = String(body.description || '').trim().slice(0, 2000);
    const images = sanitizeReportImages(body.images);
    if (!description) {
      res.status(400).json({ error: 'Por favor, describe brevemente el error detectado.' });
      return;
    }
    await createAnalysisErrorReport({
      analysisId: id,
      userId: user?.id ?? null,
      category,
      description,
      images,
    });
    res.json({ ok: true, message: 'Reporte de error enviado correctamente. Nuestro equipo lo revisará.' });
  } catch (error) {
    next(error);
  }
});

const REPORT_CONTENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  html: 'text/html; charset=utf-8',
};

router.get('/reports/:file', reportDownloadLimiter, async (req, res, next) => {
  try {
    const { file } = req.params;
    const match = file.match(/^([\w-]+)\.(pdf|docx|odt|html)$/);
    if (!match) {
      res.status(400).json({ error: 'Nombre de archivo no válido.' });
      return;
    }
    const [_, baseId, ext] = match;
    const filePath = path.join(GENERATED_DIR, file);

    // Si el archivo no existe o si está desactualizado respecto a la BD o al código de generación, regenerar al vuelo
    let needsRegeneration = !fs.existsSync(filePath) || req.query.refresh === '1' || req.query.force === '1';

    const { rows } = await pool.query(
      "SELECT report, created_at FROM analyses WHERE pdf_url LIKE $1 AND report IS NOT NULL ORDER BY id DESC LIMIT 1",
      [`%${baseId}%`]
    );

    if (rows.length && rows[0].report) {
      if (!needsRegeneration) {
        try {
          const stats = fs.statSync(filePath);
          const reportServicePath = path.join(__dirname, '../../services/report.service.js');
          const exportServicePath = path.join(__dirname, '../../services/reportExport.service.js');
          const codeMtime = Math.max(
            fs.existsSync(reportServicePath) ? fs.statSync(reportServicePath).mtimeMs : 0,
            fs.existsSync(exportServicePath) ? fs.statSync(exportServicePath).mtimeMs : 0
          );
          const dbTime = rows[0].created_at ? new Date(rows[0].created_at).getTime() : 0;
          if (stats.mtimeMs < codeMtime || stats.mtimeMs < dbTime) {
            needsRegeneration = true;
          }
        } catch {
          needsRegeneration = true;
        }
      }

      if (needsRegeneration) {
        try {
          const { buildReportPdf } = await import('../../services/report.service.js');
          const { buildReportHtml, buildReportDocx, buildReportOdt } = await import('../../services/reportExport.service.js');
          const [pdf, html, docx, odt] = await Promise.all([
            buildReportPdf(rows[0].report),
            buildReportHtml(rows[0].report),
            buildReportDocx(rows[0].report),
            buildReportOdt(rows[0].report),
          ]);
          await fs.promises.mkdir(GENERATED_DIR, { recursive: true });
          await Promise.all([
            fs.promises.writeFile(path.join(GENERATED_DIR, `${baseId}.pdf`), pdf),
            fs.promises.writeFile(path.join(GENERATED_DIR, `${baseId}.html`), html),
            fs.promises.writeFile(path.join(GENERATED_DIR, `${baseId}.docx`), docx),
            fs.promises.writeFile(path.join(GENERATED_DIR, `${baseId}.odt`), odt),
          ]);
        } catch (regenErr) {
          console.warn('[reports:on-demand-regen]', regenErr.message);
        }
      }
    }

    const customName = req.query.name
      ? `${String(req.query.name).slice(0, 120).replace(/[^\w.-]/g, '_')}.${ext}`
      : file;
    const isDownload = req.query.download === '1' || (ext !== 'pdf' && ext !== 'html');

    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

    if (isDownload) {
      res.setHeader('Content-Type', REPORT_CONTENT_TYPES[ext]);
      res.download(filePath, customName, (error) => {
        if (error && !res.headersSent) {
          res.status(404).json({ error: 'El informe solicitado no existe.' });
        }
      });
      return;
    }

    res.setHeader('Content-Type', REPORT_CONTENT_TYPES[ext]);
    res.setHeader('Content-Disposition', `inline; filename="${customName}"`);
    res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ error: 'El informe solicitado no existe.' });
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
