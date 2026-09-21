/**
 * @fileoverview Controlador para la descarga, visualización y regeneración bajo demanda de informes compilados.
 * @module api/controllers/reportDownload
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from '../../../config/index.js';
import { pool } from '../../../db/pool.js';
import { GENERATED_DIR } from '../../services/report.service.js';
import { resolveUser } from '../../middleware/auth.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// El nombre del archivo solo puede contener letras, números y guiones (UUID de informe).
// Prohibido "_" para que no pueda actuar como comodín en el LIKE de PostgreSQL.
const FILE_NAME_PATTERN = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)\.(pdf|docx|odt|html)$/;

/**
 * Localiza el análisis propietario del informe solicitado por igualdad exacta de `pdf_url`
 * resolviendo el identificador base del archivo (UUID con sufijo .pdf), nunca mediante comodines.
 * Devuelve también la visibilidad para autorizar la descarga.
 * @private
 * @param {string} file - Nombre de archivo solicitado (ej. "uuid.pdf", "uuid.docx", "uuid.odt", "uuid.html").
 * @returns {Promise<{ id: number, user_id: number|null, is_public: boolean, report: object, created_at: Date, pdf_url: string }|null>}
 */
async function findAnalysisByReportFile(file) {
  const baseName = path.basename(file, path.extname(file));
  const relativePath = `/api/reports/${baseName}.pdf`;
  const absolutePath = `${config.siteUrl}/api/reports/${baseName}.pdf`;
  const { rows } = await pool.query(
    `SELECT id, user_id, is_public, report, created_at, pdf_url
       FROM analyses
      WHERE (pdf_url = $1 OR pdf_url = $2)
        AND report IS NOT NULL
      ORDER BY id DESC
      LIMIT 1`,
    [relativePath, absolutePath],
  );
  return rows[0] ?? null;
}

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
export async function regenerateAllReportFormats(baseId, reportData) {
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
    const match = FILE_NAME_PATTERN.exec(file);
    if (!match) {
      res.status(404).json({ error: 'El informe solicitado no existe.' });
      return;
    }

    const [, requestedBase, ext] = match;
    const analysis = await findAnalysisByReportFile(file);

    if (!analysis) {
      res.status(404).json({ error: 'El informe solicitado no existe.' });
      return;
    }

    const user = await resolveUser(req);
    const isOwner = Boolean(user && analysis.user_id === user.id);
    const isAdmin = Boolean(user?.isAdmin);
    const canAccess = analysis.is_public === true || isOwner || isAdmin;

    if (!canAccess) {
      // 404 en lugar de 403 para no revelar la existencia del informe.
      res.status(404).json({ error: 'El informe solicitado no existe.' });
      return;
    }

    // El identificador interno del fichero SIEMPRE procede de la base de datos,
    // nunca del nombre recibido por URL: así no se pueden escribir ficheros
    // arbitrarios ni reutilizar comodines.
    const storedBase = path.basename(String(analysis.pdf_url), path.extname(String(analysis.pdf_url)));
    if (storedBase !== requestedBase) {
      res.status(404).json({ error: 'El informe solicitado no existe.' });
      return;
    }

    const filePath = path.join(GENERATED_DIR, `${storedBase}.${ext}`);
    const forceRefresh = (req.query.refresh === '1' || req.query.force === '1') && (isOwner || isAdmin);

    const needsRegen = checkIfRegenerationRequired(filePath, analysis.created_at, forceRefresh);
    if (needsRegen) {
      await regenerateAllReportFormats(storedBase, analysis.report);
      if (!fs.existsSync(filePath)) {
        res.status(500).json({ error: 'Error al generar el formato solicitado del informe.' });
        return;
      }
    }

    const customName = req.query.name
      ? `${String(req.query.name).slice(0, 120).replace(/[^\w.-]/g, '_')}.${ext}`
      : file;
    const isDownload = req.query.download === '1' || (ext !== 'pdf' && ext !== 'html');

    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('X-Content-Type-Options', 'nosniff');
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
