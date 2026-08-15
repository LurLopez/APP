import multer from 'multer';
import express from 'express';
import path from 'node:path';
import { analyzePdf } from '../../services/analysis.service.js';
import { AgentError } from '../../agents/baseAgent.js';
import { GENERATED_DIR } from '../../services/report.service.js';
import { listAnalyses } from '../../../db/repositories/analysisRepository.js';
import { requireAuth, resolveUser } from '../../middleware/auth.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No se recibió ningún archivo.' });
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
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/reports/:file', (req, res, next) => {
  try {
    const { file } = req.params;
    if (!/^[\w-]+\.pdf$/.test(file)) {
      res.status(400).json({ error: 'Nombre de archivo no válido.' });
      return;
    }
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
