/**
 * @fileoverview Controlador para la descarga, visualización y regeneración bajo demanda de informes compilados.
 * @module api/controllers/reportDownload
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../../../db/pool.js';
import { GENERATED_DIR } from '../../services/report.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORT_CONTENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  html: 'text/html; charset=utf-8',
};

/**
 * Determina si el archivo en disco está ausente o desactualizado respecto a la BD o código fuente.
 * @private
 * @param {string} filePath - Ruta absoluta del archivo compilado.
 * @param {Date|string|null} dbCreatedAt - Fecha de creación del informe en la base de datos.
 * @param {boolean} forceRefresh - Si la petición exige refresco forzado.
 * @returns {boolean} Verdadero si requiere regeneración.
 */
function checkIfRegenerationRequired(filePath, dbCreatedAt, forceRefresh) {
  if (forceRefresh || !fs.existsSync(filePath)) return true;

  try {
    const stats = fs.statSync(filePath);
    const reportServicePath = path.join(__dirname, '../../services/report.service.js');
    const exportServicePath = path.join(__dirname, '../../services/reportExport.service.js');

    const codeMtime = Math.max(
      fs.existsSync(reportServicePath) ? fs.statSync(reportServicePath).mtimeMs : 0,
      fs.existsSync(exportServicePath) ? fs.statSync(exportServicePath).mtimeMs : 0,
    );
    const dbTime = dbCreatedAt ? new Date(dbCreatedAt).getTime() : 0;
    return stats.mtimeMs < codeMtime || stats.mtimeMs < dbTime;
  } catch {
    return true;
  }
}

/**
 * Regenera en paralelo los 4 formatos (PDF, HTML, DOCX, ODT) y los persiste en disco.
 * @private
 * @param {string} baseId - Identificador único base del informe.
 * @param {Object} reportData - Objeto con los datos estructurados del informe.
 * @returns {Promise<void>}
 */
async function regenerateAllReportFormats(baseId, reportData) {
  try {
    const { buildReportPdf } = await import('../../services/report.service.js');
    const { buildReportHtml, buildReportDocx, buildReportOdt } = await import('../../services/reportExport.service.js');

    const [pdf, html, docx, odt] = await Promise.all([
      buildReportPdf(reportData),
      buildReportHtml(reportData),
      buildReportDocx(reportData),
      buildReportOdt(reportData),
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

/**
 * Entrega un archivo de informe generado (PDF, DOCX, ODT o HTML) para visualización o descarga.
 * @param {import('express').Request} req - Petición HTTP con params.file y query params opcionales.
 * @param {import('express').Response} res - Respuesta HTTP enviando el archivo binario o texto.
 * @param {import('express').NextFunction} next - Función para delegar errores.
 * @returns {Promise<void>}
 */
export async function downloadReportFile(req, res, next) {
  try {
    const { file } = req.params;
    const match = file.match(/^([\w-]+)\.(pdf|docx|odt|html)$/);
    if (!match) {
      res.status(400).json({ error: 'Nombre de archivo no válido.' });
      return;
    }

    const [, baseId, ext] = match;
    const filePath = path.join(GENERATED_DIR, file);
    const forceRefresh = req.query.refresh === '1' || req.query.force === '1';

    const { rows } = await pool.query(
      'SELECT report, created_at FROM analyses WHERE pdf_url LIKE $1 AND report IS NOT NULL ORDER BY id DESC LIMIT 1',
      [`%${baseId}%`],
    );

    if (rows.length && rows[0].report) {
      const needsRegen = checkIfRegenerationRequired(filePath, rows[0].created_at, forceRefresh);
      if (needsRegen) {
        await regenerateAllReportFormats(baseId, rows[0].report);
      }
    }

    const customName = req.query.name
      ? `${String(req.query.name).slice(0, 120).replace(/[^\w.-]/g, '_')}.${ext}`
      : file;
    const isDownload = req.query.download === '1' || (ext !== 'pdf' && ext !== 'html');

    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Content-Type', REPORT_CONTENT_TYPES[ext]);

    if (isDownload) {
      res.download(filePath, customName, (error) => {
        if (error && !res.headersSent) {
          res.status(404).json({ error: 'El informe solicitado no existe.' });
        }
      });
      return;
    }

    res.setHeader('Content-Disposition', `inline; filename="${customName}"`);
    res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ error: 'El informe solicitado no existe.' });
      }
    });
  } catch (error) {
    next(error);
  }
}
