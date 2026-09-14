import { Router } from 'express';
import { resolveUser } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rateLimit.middleware.js';
import { pickCategory, sanitizeReportImages, normalizeEmail, isValidEmail } from '../../utils/validate.js';
import { createGeneralReport } from '../../../db/repositories/generalReportsRepository.js';

const router = Router();

const GENERAL_REPORT_CATEGORIES = ['general', 'bug', 'screener', 'market_data', 'portfolio', 'account', 'suggestion', 'other'];

const reportLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 10,
  scope: 'reports:general',
  message: 'Has enviado demasiados reportes. Espera un poco antes de volver a intentarlo.',
});

router.post('/', reportLimiter, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const title = String(body.title || '').trim().slice(0, 255);
    const category = pickCategory(body.category, GENERAL_REPORT_CATEGORIES, 'bug');
    const description = String(body.description || '').trim().slice(0, 5000);
    const images = sanitizeReportImages(body.images);

    if (!title) {
      res.status(400).json({ error: 'Por favor, introduce un título para el reporte.' });
      return;
    }

    if (!description) {
      res.status(400).json({ error: 'Por favor, describe con detalle la incidencia o sugerencia.' });
      return;
    }

    const user = await resolveUser(req);
    const rawEmail = String(body.email || user?.email || '').trim().slice(0, 255);
    const userEmail = rawEmail && isValidEmail(rawEmail) ? normalizeEmail(rawEmail) : null;

    const report = await createGeneralReport({
      userId: user?.id ?? null,
      userEmail,
      category,
      title,
      description,
      images,
    });

    res.json({
      ok: true,
      reportId: report.id,
      message: 'Tu reporte ha sido enviado con éxito. ¡Muchas gracias por ayudarnos a mejorar Cifra!',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
