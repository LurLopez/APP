/**
 * @fileoverview Controlador para el feedback, valoraciones y reporte de errores en análisis.
 * @module api/controllers/analysisFeedback
 */

import {
  saveAnalysisRating,
  getAnalysisRatingSummary,
  createAnalysisErrorReport,
  setAnalysisReviewed,
  getAnalysisById,
} from '../../../db/repositories/analysisRepository.js';
import { resolveUser } from '../../middleware/auth.middleware.js';
import {
  parseIdParam,
  pickCategory,
  sanitizeReportImages,
  normalizeIpAddress,
  getJsonObjectBody,
  isAnalysisVisible,
} from '../../utils/validate.js';

const ERROR_REPORT_CATEGORIES = [
  'incorrect_numbers',
  'wrong_period',
  'missing_data',
  'wrong_classification',
  'bad_formatting',
  'other',
];

/**
 * Registra o actualiza la valoración con estrellas y comentario opcional sobre un análisis.
 * @param {import('express').Request} req - Petición HTTP con params.id y body { rating, feedback }.
 * @param {import('express').Response} res - Respuesta HTTP con el resumen actualizado de ratings.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */
export async function rateAnalysis(req, res, next) {
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
}

/**
 * Obtiene el resumen de valoraciones (media, total de votos y voto del usuario si existe) para un análisis.
 * @param {import('express').Request} req - Petición HTTP con params.id.
 * @param {import('express').Response} res - Respuesta HTTP con el resumen de valoraciones.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */
export async function getAnalysisRating(req, res, next) {
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
}

/**
 * Registra un reporte de discrepancia o error detectado por el usuario en el análisis de un informe.
 * @param {import('express').Request} req - Petición HTTP con params.id y body { category, description, images }.
 * @param {import('express').Response} res - Respuesta de confirmación.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */
export async function reportAnalysisError(req, res, next) {
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
}

/**
 * Marca o desmarca un análisis como verificado por el equipo administrador.
 * @param {import('express').Request} req - Petición HTTP de un administrador con params.id y body { isReviewed }.
 * @param {import('express').Response} res - Estado actualizado de revisión.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */
export async function reviewAnalysis(req, res, next) {
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
}
