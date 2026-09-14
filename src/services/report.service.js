/**
 * @fileoverview Fachada del servicio de generación de informes en disco y PDFKit.
 * Gestiona el almacenamiento temporal y coordina la generación en PDF, HTML, DOCX y ODT.
 * @module services/report.service
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReportPdf } from './report/pdfReportBuilder.js';
import {
  buildReportHtml,
  buildReportDocx,
  buildReportOdt,
} from './reportExport.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GENERATED_DIR = path.join(__dirname, '..', '..', 'uploads', 'generated');

/**
 * Elimina los archivos generados (.pdf, .docx, .odt, .html) asociados a una URL.
 * @param {string} pdfUrl - URL del informe generado a limpiar.
 * @returns {Promise<void>}
 */
export async function cleanupGeneratedReports(pdfUrl) {
  if (!pdfUrl) return;
  const baseName = path.basename(pdfUrl).replace(/\.[^.]+$/, '');
  if (!baseName) return;
  const extensions = ['.pdf', '.docx', '.odt', '.html'];
  for (const ext of extensions) {
    const file = path.join(GENERATED_DIR, `${baseName}${ext}`);
    try {
      if (fs.existsSync(file)) {
        await unlink(file);
      }
    } catch (e) {
      console.warn('[cleanupGeneratedReports]', e.message);
    }
  }
}

export { buildReportPdf };

/**
 * Genera todos los formatos descargables del informe (PDF, HTML, DOCX, ODT) y los persiste en disco.
 * @param {object} report - Objeto completo del informe financiero.
 * @returns {Promise<{filename: string, url: string, docxUrl: string, odtUrl: string}>} URLs de acceso público.
 */
export async function generateReportPdf(report) {
  const [pdf, html, docx, odt] = await Promise.all([
    buildReportPdf(report),
    buildReportHtml(report),
    buildReportDocx(report),
    buildReportOdt(report),
  ]);

  const id = randomUUID();
  await mkdir(GENERATED_DIR, { recursive: true });
  await Promise.all([
    writeFile(path.join(GENERATED_DIR, `${id}.pdf`), pdf),
    writeFile(path.join(GENERATED_DIR, `${id}.html`), html),
    writeFile(path.join(GENERATED_DIR, `${id}.docx`), docx),
    writeFile(path.join(GENERATED_DIR, `${id}.odt`), odt),
  ]);

  return {
    filename: `${id}.pdf`,
    url: `/api/reports/${id}.pdf`,
    docxUrl: `/api/reports/${id}.docx`,
    odtUrl: `/api/reports/${id}.odt`,
  };
}
