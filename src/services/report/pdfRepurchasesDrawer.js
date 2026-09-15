/**
 * @fileoverview Módulo extraído de pdfConclusionDrawer.js.
 */

import { sanitize, drawSectionTitle, drawHorizontalRule, drawHighlightedText } from './pdfStyles.js';
import { drawPdfSecSnippet } from './pdfSnippetDrawer.js';
import { drawSharesChart } from './pdfEquityCharts.js';
import { withAveragePriceRow, buildSharesChartModel } from '../reportExport.service.js';

export function drawRepurchases(doc, rep, margin, y) {
  let curY = drawSectionTitle(doc, rep.title || '1: RECOMPRAS', y);
  if (rep.text) {
    curY = drawHighlightedText(doc, sanitize(rep.text), margin, curY, { width: doc.page.width - margin * 2, baseSize: 8.5, baseColor: '#374151', boldColor: '#0f172a' }) + 8;
  }
  const repExpiry = (rep.authorizationExpiry && !/no indicad|not disclosed|not stated|no consta|no especificad/i.test(String(rep.authorizationExpiry)))
    ? rep.authorizationExpiry : null;
  const buybackPctLabel = (rep.buybackPctOfShares != null)
    ? `Peso en el capital: ${rep.buybackPctOfSharesEstimated ? '≈' : ''}${String(rep.buybackPctOfShares).replace('.', ',')} % de las acciones en el año`
    : null;
  const badges = [
    (rep.authorizationRemaining || rep.programRemaining) ? `Autorización restante: ${rep.authorizationRemaining || rep.programRemaining}` : null,
    repExpiry ? `Vigencia: ${repExpiry}` : null,
    rep.shareCountEvolution ? `Evolución acciones: ${rep.shareCountEvolution}` : null,
    buybackPctLabel,
    rep.bpaImpact ? `Impacto BPA: ${rep.bpaImpact}` : null,
    rep.programChanges ? `Programa: ${rep.programChanges}` : null,
    rep.futureProjection ? `Proyección 5 años: ${rep.futureProjection}` : null,
  ].filter(Boolean);
  if (badges.length) {
    badges.forEach((b) => {
      if (curY > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        curY = doc.page.margins.top;
      }
      curY = drawHighlightedText(doc, `• ${sanitize(b)}`, margin + 6, curY, { width: doc.page.width - margin * 2 - 12, baseSize: 8, baseFont: 'Helvetica-Bold', baseColor: '#854d0e', boldFont: 'Helvetica-Bold', boldColor: '#7c2d12' }) + 3;
    });
    curY += 5;
  }
  const repChart = buildSharesChartModel(rep.sharesHistory);
  if (repChart) curY = drawSharesChart(doc, repChart, curY) + 4;
  if (rep.secSnippet) curY = drawPdfSecSnippet(doc, withAveragePriceRow(rep.secSnippet), curY);
  return drawHorizontalRule(doc, curY);
}

function drawExecutivePersonBlock(doc, label, person, margin, y) {
  if (!person) return y;
  let curY = y;
  const width = doc.page.width - margin * 2 - 20;
  if (curY > doc.page.height - doc.page.margins.bottom - 30) {
    doc.addPage();
    curY = doc.page.margins.top;
  }
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#4f46e5').text(label, margin + 6, curY);
  curY = doc.y + 2;
  const heading = person.name ? `${person.name}${person.role ? ` — ${person.role}` : ''}` : null;
  if (heading) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(sanitize(heading), margin + 12, curY, { width });
    curY = doc.y + 2;
  }
  const fields = [
    ['Inicio en el cargo', person.tenureStart],
    ['Ventas durante su mandato', person.salesDuringTenure],
    ['A dónde pasa', person.whereTheyGo],
    ['Políticas de su etapa', person.policies],
    ['De dónde viene', person.origin],
    ['Trayectoria previa', person.trackRecord],
    ['Qué ha anunciado', person.commitments],
  ].filter(([, value]) => value);
  fields.forEach(([fieldLabel, value]) => {
    if (curY > doc.page.height - doc.page.margins.bottom - 16) {
      doc.addPage();
      curY = doc.page.margins.top;
    }
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155').text(`${fieldLabel}: `, margin + 12, curY, { continued: true });
    doc.font('Helvetica').fontSize(8).fillColor('#374151').text(sanitize(String(value)), { width });
    curY = doc.y + 2;
  });
  return curY + 4;
}

export function drawExecutiveChanges(doc, section, margin, y) {
  const changes = Array.isArray(section?.changes) ? section.changes : [];
  let curY = drawSectionTitle(doc, section?.title || '2: CAMBIOS EN LA DIRECCIÓN', y);

  changes.forEach((change, index) => {
    const roleLabel = sanitize(String(change.role || 'Directivo').toUpperCase());
    if (changes.length > 1) {
      if (curY > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        curY = doc.page.margins.top;
      }
      curY = drawHighlightedText(doc, roleLabel, margin + 6, curY, { width: doc.page.width - margin * 2 - 12, baseSize: 8, baseFont: 'Helvetica-Bold', baseColor: '#4f46e5', boldFont: 'Helvetica-Bold', boldColor: '#4338ca' }) + 4;
    }
    if (change.text) {
      curY = drawHighlightedText(doc, sanitize(change.text), margin, curY, { width: doc.page.width - margin * 2, baseSize: 8.5, baseColor: '#374151', boldColor: '#0f172a' }) + 8;
    }
    const meta = [
      change.announcementDate ? `Anuncio: ${change.announcementDate}` : null,
      change.effectiveDate ? `Efectivo: ${change.effectiveDate}` : null,
      change.reason ? `Motivo: ${change.reason}` : null,
    ].filter(Boolean);
    if (meta.length) {
      curY = drawHighlightedText(doc, `• ${sanitize(meta.join('  ·  '))}`, margin + 6, curY, { width: doc.page.width - margin * 2 - 12, baseSize: 8, baseFont: 'Helvetica-Bold', baseColor: '#854d0e', boldFont: 'Helvetica-Bold', boldColor: '#7c2d12' }) + 5;
    }
    curY = drawExecutivePersonBlock(doc, `ANTIGUO ${roleLabel}`, change.oldExecutive, margin, curY);
    curY = drawExecutivePersonBlock(doc, `NUEVO ${roleLabel}`, change.newExecutive, margin, curY);
    if (index < changes.length - 1) curY += 6;
  });

  if (section?.disclaimer) {
    if (curY > doc.page.height - doc.page.margins.bottom - 14) {
      doc.addPage();
      curY = doc.page.margins.top;
    }
    doc.font('Helvetica-Oblique').fontSize(7).fillColor('#94a3b8').text(sanitize(section.disclaimer), margin + 6, curY, { width: doc.page.width - margin * 2 - 12, lineBreak: true });
    curY = doc.y + 4;
  }
  return drawHorizontalRule(doc, curY);
}
