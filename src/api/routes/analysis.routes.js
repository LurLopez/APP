import multer from 'multer';
import express from 'express';
import path from 'node:path';
import { analyzePdf } from '../../services/analysis.service.js';
import { AgentError } from '../../agents/baseAgent.js';
import { GENERATED_DIR } from '../../services/report.service.js';

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

    const result = await analyzePdf(req.file.buffer);
    res.json({
      ok: true,
      origin: result.origin,
      formType: result.formType,
      sector: result.sector,
      report: result.report,
      pdfUrl: result.pdfUrl,
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
