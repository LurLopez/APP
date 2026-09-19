/**
 * @fileoverview Orquestador de ensamblado de documentos PDFKit para informes financieros.
 * @module services/report/pdfReportBuilder
 */

import PDFDocument from 'pdfkit';
import { sanitize, drawHorizontalRule } from './pdfStyles.js';
import { drawHorizons } from './pdfHorizonsDrawer.js';
import { drawConclusion } from './pdfConclusionDrawer.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';
import { BRAND_URL, BRAND_LABEL, BRAND_LOGO_PATH, BRAND_LOGO_RATIO, hasBrandLogo } from '../reportExport/reportBranding.js';

const FOOTER_LOGO_HEIGHT = 9;
const FOOTER_GAP = 3;
const FOOTER_FONT_SIZE = 7;
const FOOTER_TOP_OFFSET = 28;
const HAS_BRAND_LOGO = hasBrandLogo();

/**
 * Dibuja el pie discreto de cada página: nota de generación a la izquierda y logotipo con enlace a la derecha.
 * @param {PDFKit.PDFDocument} doc - Documento PDFKit activo.
 * @param {string} lang - Idioma normalizado del informe.
 * @returns {void}
 */
function drawPageFooter(doc, lang) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.left;
  const top = doc.page.height - FOOTER_TOP_OFFSET;
  const logoWidth = HAS_BRAND_LOGO ? FOOTER_LOGO_HEIGHT * BRAND_LOGO_RATIO : 0;
  const gap = HAS_BRAND_LOGO ? FOOTER_GAP : 0;

  doc.font('Helvetica').fontSize(FOOTER_FONT_SIZE).fillColor('#9ca3af');
  doc.text(t('Generado por Cifra · beta 0.1 · La IA ordena la información. Tú decides qué significa.', null, lang), left, top + 2, { lineBreak: false });

  const linkWidth = doc.widthOfString(BRAND_LABEL);
  const groupWidth = logoWidth + gap + linkWidth;
  const groupX = right - groupWidth;

  if (HAS_BRAND_LOGO) doc.image(BRAND_LOGO_PATH, groupX, top, { height: FOOTER_LOGO_HEIGHT });
  doc.fillColor('#94a3b8').text(BRAND_LABEL, groupX + logoWidth + gap, top + 2, { lineBreak: false });
  doc.link(groupX - 2, top - 2, groupWidth + 4, FOOTER_LOGO_HEIGHT + 4, BRAND_URL);
}

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
    doc.on('pageAdded', () => drawPageFooter(doc, lang));
    drawPageFooter(doc, lang);

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

    doc.end();
  });
}
