/**
 * @fileoverview Renderizado de las notas del trimestre e información relevante (10-Q) en PDFKit.
 * @module services/report/pdfQuarterNotesDrawer
 */

import { sanitize, drawSectionTitle, drawHorizontalRule, drawPdfFormattedText } from './pdfStyles.js';
import { drawPdfSecSnippet } from './pdfSnippetDrawer.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';

const GUIDANCE_STATUS_LABELS = {
  raised: 'Guidance revisado al alza',
  lowered: 'Guidance revisado a la baja',
  maintained: 'Guidance mantenido',
  reaffirmed: 'Guidance reiterado',
  new: 'Guidance nuevo',
  withdrawn: 'Guidance retirado',
};

function guidanceStatusLabel(status, lang) {
  const key = String(status || '').trim().toLowerCase();
  return t(GUIDANCE_STATUS_LABELS[key] || 'Guidance', null, lang);
}

/**
 * Dibuja la sección de notas del trimestre (guidance y hechos relevantes de los últimos 3 meses).
 * @param {PDFKit.PDFDocument} doc - Documento PDFKit activo.
 * @param {object} report - Informe completo del análisis.
 * @param {number} startY - Coordenada vertical de inicio.
 * @returns {number} Coordenada vertical tras el bloque.
 */
export function drawQuarterNotes(doc, report, startY) {
  const section = report?.quarterNotes;
  if (!section || typeof section !== 'object') return startY;
  const lang = normalizeLanguage(report?.language);
  const margin = doc.page.margins.left;
  const width = doc.page.width - margin * 2;
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const guidance = section.guidance && typeof section.guidance === 'object' ? section.guidance : null;
  const notes = Array.isArray(section.notes)
    ? section.notes.filter((note) => note && (note.text || note.title))
    : [];
  if (!guidance && !notes.length) return startY;

  let y = startY;
  if (y > doc.page.margins.top + 10) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  y = drawSectionTitle(doc, sanitize(section.title || t('NOTAS DEL TRIMESTRE E INFORMACIÓN RELEVANTE', null, lang)), y);
  doc.font('Helvetica').fontSize(7.5).fillColor('#6b7280').text(
    sanitize(t('Información relevante de los últimos 3 meses extraída de las notas y del MD&A del 10-Q', null, lang)),
    margin,
    y,
    { width },
  );
  y = doc.y + 8;

  const guidanceSnippet = guidance?.secSnippet;
  const hasGuidanceSnippet = guidanceSnippet && Array.isArray(guidanceSnippet.rows) && guidanceSnippet.rows.length;
  if (guidance && (guidance.text || hasGuidanceSnippet)) {
    if (y > pageBottom - 24) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    const label = `${t('Guidance', null, lang)} · ${guidanceStatusLabel(guidance.status, lang)}`;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text(sanitize(label), margin, y);
    y = doc.y + 4;
    if (guidance.text) {
      y = drawPdfFormattedText(doc, guidance.text, margin, y, width, 'Helvetica', 'Helvetica-Bold', 8.5, '#374151') + 8;
    }
    if (hasGuidanceSnippet) y = drawPdfSecSnippet(doc, guidanceSnippet, y);
    y = drawHorizontalRule(doc, y);
  }

  notes.forEach((note) => {
    if (y > pageBottom - 30) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    if (note.title) {
      y = drawPdfFormattedText(doc, note.title, margin, y, width, 'Helvetica-Bold', 'Helvetica-Bold', 9, '#111827') + 3;
    }
    if (note.text) {
      y = drawPdfFormattedText(doc, note.text, margin, y, width, 'Helvetica', 'Helvetica-Bold', 8.5, '#374151') + 10;
    }
  });

  return drawHorizontalRule(doc, y);
}
