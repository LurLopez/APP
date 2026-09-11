import { Router } from 'express';
import jwt from 'jsonwebtoken';
import config from '../../../config/index.js';
import { findUserById } from '../../../db/repositories/userRepository.js';
import { createGeneralReport } from '../../../db/repositories/generalReportsRepository.js';

const router = Router();

async function resolveUser(req) {
  try {
    const token = req.cookies?.token;
    if (!token) return null;
    const decoded = jwt.verify(token, config.jwtSecret);
    return await findUserById(decoded.id);
  } catch {
    return null;
  }
}

router.post('/', async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim().slice(0, 255);
    const category = String(req.body.category || 'bug').trim();
    const description = String(req.body.description || '').trim().slice(0, 5000);

    if (!title) {
      res.status(400).json({ error: 'Por favor, introduce un título para el reporte.' });
      return;
    }

    if (!description) {
      res.status(400).json({ error: 'Por favor, describe con detalle la incidencia o sugerencia.' });
      return;
    }

    const rawImages = Array.isArray(req.body.images) ? req.body.images : [];
    const images = rawImages
      .filter((img) => typeof img === 'string' && (img.startsWith('data:image/') || img.startsWith('http://') || img.startsWith('https://')))
      .slice(0, 5);

    const user = await resolveUser(req);
    const report = await createGeneralReport({
      userId: user?.id ?? null,
      userEmail: user?.email ?? req.body.email ?? null,
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
