/**
 * @fileoverview Controlador para la recepción, consulta y resolución de reportes generales de usuarios.
 * @module api/controllers/generalReports
 */

import { resolveUser } from '../../middleware/auth.middleware.js';
import {
  parseIdParam,
  pickCategory,
  isValidEmail,
  normalizeEmail,
  sanitizeReportImages,
} from '../../utils/validate.js';
import {
  createGeneralReport,
  listGeneralReports,
  updateGeneralReport,
  deleteGeneralReport,
} from '../../../db/repositories/generalReportsRepository.js';

const GENERAL_REPORT_CATEGORIES = [
  'bug',
  'market_data',
  'screener',
  'portfolio',
  'suggestion',
  'account',
  'other',
];

const ERROR_REPORT_STATUS = ['pending', 'reviewed', 'resolved', 'dismissed'];

/**
 * Consulta la lista filtrada de reportes generales de la plataforma (solo administradores).
 * @param {import('express').Request} req - Petición con filtros (status, category, search, limit).
 * @param {import('express').Response} res - Lista de reportes.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function listGeneralReportsHandler(req, res, next) {
  try {
    const { status, category, search } = req.query;
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 200);
    const reports = await listGeneralReports({
      status: String(status ?? '').trim() || null,
      category: String(category ?? '').trim() || null,
      search: String(search ?? '').trim() || null,
      limit,
    });
    res.json({ ok: true, reports });
  } catch (error) {
    next(error);
  }
}

/**
 * Modifica el estado o notas de un reporte general (solo administradores).
 * @param {import('express').Request} req - Petición con params.id y body (status, adminNotes).
 * @param {import('express').Response} res - Reporte general actualizado.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function updateGeneralReportHandler(req, res, next) {
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
    const updated = await updateGeneralReport(id, { status, adminNotes });
    if (!updated) {
      res.status(404).json({ error: 'Reporte general no encontrado.' });
      return;
    }
    res.json({ ok: true, report: updated, message: 'Reporte general actualizado.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Elimina un reporte general del sistema (solo administradores).
 * @param {import('express').Request} req - Petición con params.id.
 * @param {import('express').Response} res - Confirmación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function deleteGeneralReportHandler(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Identificador no válido.' });
      return;
    }
    const deleted = await deleteGeneralReport(id);
    if (!deleted) {
      res.status(404).json({ error: 'Reporte general no encontrado.' });
      return;
    }
    res.json({ ok: true, message: 'Reporte general eliminado.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Registra un nuevo reporte o sugerencia general enviado por un usuario o visitante.
 * @param {import('express').Request} req - Petición con body (title, description, category, userEmail, images).
 * @param {import('express').Response} res - Reporte creado.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function createGeneralReportHandler(req, res, next) {
  try {
    const user = await resolveUser(req);
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const title = String(body.title || '').trim().slice(0, 255);
    const description = String(body.description || '').trim().slice(0, 4000);
    const category = pickCategory(body.category, GENERAL_REPORT_CATEGORIES, 'other');
    const images = sanitizeReportImages(body.images);
    const rawEmail = String(body.userEmail || user?.email || '').trim().slice(0, 255);
    const userEmail = rawEmail && isValidEmail(rawEmail) ? normalizeEmail(rawEmail) : null;

    if (!title || !description) {
      res.status(400).json({ error: 'Por favor, introduce un título y una descripción detallada del problema.' });
      return;
    }

    const report = await createGeneralReport({
      userId: user?.id ?? null,
      userEmail,
      category,
      title,
      description,
      images,
    });

    res.status(201).json({
      ok: true,
      report,
      reportId: report.id,
      message: 'Reporte enviado correctamente. El equipo de administración lo revisará pronto.',
    });
  } catch (error) {
    next(error);
  }
}
