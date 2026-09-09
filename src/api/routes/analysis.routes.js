import multer from 'multer';
import express from 'express';
import path from 'node:path';
import { analyzePdf, buildDownloadBase } from '../../services/analysis.service.js';
import { AgentError } from '../../agents/baseAgent.js';
import { GENERATED_DIR } from '../../services/report.service.js';
import { listAnalyses, getAnalysisById, updateAnalysis, listAnalysisCompanies } from '../../../db/repositories/analysisRepository.js';
import { getCompanyFilings } from '../../services/edgar.service.js';
import { requireAuth, resolveUser } from '../../middleware/auth.middleware.js';

const TICKER_PATTERN = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function sendSourceError(res, message, status = 404) {
  res.status(status).type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Informe original</title></head>
<body style="font-family:system-ui,sans-serif;padding:48px 24px;text-align:center;color:#333">
<h1 style="font-size:18px;margin-bottom:8px">No se pudo abrir el informe original</h1>
<p style="font-size:14px;color:#666">${message}</p></body></html>`);
}

function toIsoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No se recibió ningún archivo. Selecciona o arrastra un PDF válido.' });
      return;
    }

    const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      throw new AgentError('Solo se admiten archivos PDF.', 'NOT_PDF');
    }

    const user = await resolveUser(req);
    const result = await analyzePdf(req.file.buffer, {
      userId: user?.id ?? null,
      filename: req.file.originalname,
    });
    res.json({
      ok: true,
      origin: result.origin,
      formType: result.formType,
      sector: result.sector,
      report: result.report,
      pdfUrl: result.pdfUrl,
      saved: Boolean(user),
    });
  } catch (error) {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el límite de 25 MB.'
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
});

router.get('/analyses', requireAuth, async (req, res, next) => {
  try {
    const { ticker, periodFrom, periodTo, createdFrom, createdTo } = req.query;
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);

    const analyses = await listAnalyses({
      userId: req.user.id,
      limit,
      ticker: String(ticker ?? '').trim() || null,
      periodFrom: String(periodFrom ?? '').trim() || null,
      periodTo: String(periodTo ?? '').trim() || null,
      createdFrom: String(createdFrom ?? '').trim() || null,
      createdTo: String(createdTo ?? '').trim() || null,
    });

    res.json({
      ok: true,
      analyses: analyses.map(({ report, ...analysis }) => ({
        ...analysis,
        ticker: analysis.ticker ?? report?.ticker ?? null,
        company_name: analysis.company_name ?? report?.company ?? null,
        periodTitle: report?.periodTitle ?? report?.period ?? null,
        downloadBase: buildDownloadBase(report, report?.formType ?? null),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/analyses/companies', requireAuth, async (req, res, next) => {
  try {
    const companies = await listAnalysisCompanies({
      userId: req.user.id,
      search: String(req.query.q ?? '').trim() || null,
    });
    res.json({ ok: true, companies });
  } catch (error) {
    next(error);
  }
});

router.get('/analyses/:id/source', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
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

    if (!match) {
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

router.get('/analyses/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Identificador no válido.' });
      return;
    }
    const analysis = await getAnalysisById(id);
    if (!analysis || analysis.user_id !== req.user.id) {
      res.status(404).json({ error: 'El análisis solicitado no existe.' });
      return;
    }
    const { report } = analysis;
    res.json({
      ok: true,
      analysis: {
        ...analysis,
        formType: report?.formType ?? null,
        ticker: analysis.ticker ?? report?.ticker ?? null,
        company_name: analysis.company_name ?? report?.company ?? null,
        periodTitle: report?.periodTitle ?? report?.period ?? null,
        downloadBase: buildDownloadBase(report, report?.formType ?? null),
      },
    });
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

router.get('/reports/:file', (req, res, next) => {
  try {
    const { file } = req.params;
    const match = file.match(/^[\w-]+\.(pdf|docx|odt|html)$/);
    if (!match) {
      res.status(400).json({ error: 'Nombre de archivo no válido.' });
      return;
    }
    const ext = match[1];
    res.setHeader('Content-Type', REPORT_CONTENT_TYPES[ext]);
    res.setHeader('Content-Disposition', ext === 'pdf' || ext === 'html' ? 'inline' : 'attachment');
    res.sendFile(path.join(GENERATED_DIR, file), (error) => {
      if (error) {
        res.status(404).json({ error: 'El informe solicitado no existe.' });
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
