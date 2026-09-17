/**
 * @fileoverview Orquestador de ensamblado de documentos PDFKit para informes financieros.
 * @module services/report/pdfReportBuilder
 */

import PDFDocument from 'pdfkit';
import { sanitize, drawHorizontalRule } from './pdfStyles.js';
import { drawHorizons } from './pdfHorizonsDrawer.js';
import { drawConclusion } from './pdfConclusionDrawer.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';

/**
 * Ensambla y renderiza un informe financiero completo en formato PDF utilizando PDFKit.
 * @param {object} report - Objeto consolidado del informe de resultados.
 * @returns {Promise<Buffer>} Buffer binario del documento PDF generado.
 */
export function buildReportPdf(report) {
  const lang = normalizeLanguage(report?.language);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, left: 40, right: 40, bottom: 40 } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = doc.page.margins.left;
    let y = doc.page.margins.top;

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827').text(sanitize(report.company ?? ''), margin, y);
    y += 22;
    if (report.ticker) {
      doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text(`${t('Ticker', null, lang)}: ${sanitize(report.ticker)}`, margin, y);
      y += 14;
    }
    if (report.periodTitle) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#374151').text(sanitize(report.periodTitle), margin, y + 2);
      y += 22;
    }

    y = drawHorizontalRule(doc, y);
    y = drawHorizons(doc, report.horizons, y, lang);
    y = drawConclusion(doc, report, y);

    doc.font('Helvetica').fontSize(8).fillColor('#9ca3af').text(t('Generado por Cifra · beta 0.1 · La IA ordena la información. Tú decides qué significa.', null, lang), margin, doc.page.height - doc.page.margins.bottom - 14);

    doc.end();
  });
}
