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
  batchUpdateGeneralReports,
  batchDeleteGeneralReports,
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
 * @param {import('express').Request} req - Petición con filtros (status, category, search, limit, offset).
 * @param {import('express').Response} res - Lista de reportes y conteo total.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function listGeneralReportsHandler(req, res, next) {
  try {
    const { status, category, search } = req.query;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 250) || 250, 1), 1000);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
    const { reports, total } = await listGeneralReports({
      status: String(status ?? '').trim() || null,
      category: String(category ?? '').trim() || null,
      search: String(search ?? '').trim() || null,
      limit,
      offset,
    });
    res.json({ ok: true, reports, total });
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
 * Actualiza en lote el estado o notas de múltiples reportes generales.
 * @param {import('express').Request} req - Petición con body ({ ids, status, adminNotes }).
 * @param {import('express').Response} res - Conteo de reportes actualizados.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function batchUpdateGeneralReportsHandler(req, res, next) {
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
    const updatedCount = await batchUpdateGeneralReports(ids, { status, adminNotes });
    res.json({ ok: true, count: updatedCount, message: `${updatedCount} reportes actualizados.` });
  } catch (error) {
    next(error);
  }
}

/**
 * Elimina en lote múltiples reportes generales.
 * @param {import('express').Request} req - Petición con body ({ ids }).
 * @param {import('express').Response} res - Conteo de reportes eliminados.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function batchDeleteGeneralReportsHandler(req, res, next) {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const rawIds = Array.isArray(body.ids) ? body.ids : [];
    const ids = rawIds.map((x) => parseIdParam(x)).filter(Boolean).slice(0, 100);
    if (!ids.length) {
      res.status(400).json({ error: 'Debes proporcionar al menos un ID válido.' });
      return;
    }
    const deletedCount = await batchDeleteGeneralReports(ids);
    res.json({ ok: true, count: deletedCount, message: `${deletedCount} reportes eliminados.` });
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
