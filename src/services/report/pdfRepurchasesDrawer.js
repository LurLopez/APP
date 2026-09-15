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

function drawCeoPersonBlock(doc, label, person, margin, y) {
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

function ceoMarketDataText(marketData) {
  if (!marketData || !Number.isFinite(Number(marketData.changeFirstSessionPct))) return null;
  const fmt = (value) => `${Number(value) > 0 ? '+' : ''}${String(value).replace('.', ',')} %`;
  const third = Number.isFinite(Number(marketData.changeThreeSessionsPct))
    ? ` y ${fmt(marketData.changeThreeSessionsPct)} a 3 sesiones`
    : '';
  const source = marketData.source ? ` Fuente: ${sanitize(String(marketData.source))}.` : '';
  const date = marketData.announcementDate ? ` (${sanitize(String(marketData.announcementDate))})` : '';
  return `Cotización en torno al anuncio${date}: ${fmt(marketData.changeFirstSessionPct)} en la primera sesión${third}.${source}`;
}

function drawCeoMarketBox(doc, ceo, margin, y) {
  const reaction = ceo.marketReaction || {};
  const dataLine = ceoMarketDataText(ceo.marketData);
  const summary = reaction.summary ? sanitize(reaction.summary) : null;
  if (!summary && !dataLine) return y;

  const sentiment = String(reaction.sentiment || '').toLowerCase();
  const bg = sentiment === 'positiva' ? '#ecfdf5' : (sentiment === 'negativa' ? '#fef2f2' : '#fffbeb');
  const border = sentiment === 'positiva' ? '#bbf7d0' : (sentiment === 'negativa' ? '#fecaca' : '#fde68a');
  const labelColor = sentiment === 'positiva' ? '#15803d' : (sentiment === 'negativa' ? '#dc2626' : '#b45309');
  const width = doc.page.width - margin * 2;

  doc.font('Helvetica-Bold').fontSize(9);
  const labelH = doc.heightOfString('Reacción del mercado', { width: width - 24 });
  doc.font('Helvetica').fontSize(8);
  const summaryH = summary ? doc.heightOfString(summary, { width: width - 24, lineBreak: true }) : 0;
  doc.font('Helvetica-Oblique').fontSize(7.5);
  const dataH = dataLine ? doc.heightOfString(dataLine, { width: width - 24, lineBreak: true }) : 0;
  const boxHeight = 12 + labelH + (summary ? summaryH + 3 : 0) + (dataLine ? dataH + 3 : 0) + 4;

  let curY = y;
  if (curY + boxHeight > doc.page.height - doc.page.margins.bottom - 10) {
    doc.addPage();
    curY = doc.page.margins.top;
  }
  doc.rect(margin, curY, width, boxHeight).fill(bg);
  doc.rect(margin, curY, width, boxHeight).lineWidth(1).strokeColor(border).stroke();

  let innerY = curY + 6;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(labelColor).text('Reacción del mercado', margin + 10, innerY, { width: width - 20 });
  innerY = doc.y + 2;
  if (summary) {
    doc.font('Helvetica').fontSize(8).fillColor('#374151').text(summary, margin + 10, innerY, { width: width - 20, lineBreak: true });
    innerY = doc.y + 2;
  }
  if (dataLine) {
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#64748b').text(dataLine, margin + 10, innerY, { width: width - 20, lineBreak: true });
  }
  return curY + boxHeight + 8;
}

export function drawCeoChange(doc, ceo, margin, y) {
  let curY = drawSectionTitle(doc, ceo.title || '2: CAMBIO DE CEO', y);
  if (ceo.text) {
    curY = drawHighlightedText(doc, sanitize(ceo.text), margin, curY, { width: doc.page.width - margin * 2, baseSize: 8.5, baseColor: '#374151', boldColor: '#0f172a' }) + 8;
  }
  const meta = [
    ceo.announcementDate ? `Anuncio: ${ceo.announcementDate}` : null,
    ceo.effectiveDate ? `Efectivo: ${ceo.effectiveDate}` : null,
    ceo.reason ? `Motivo: ${ceo.reason}` : null,
  ].filter(Boolean);
  if (meta.length) {
    curY = drawHighlightedText(doc, `• ${sanitize(meta.join('  ·  '))}`, margin + 6, curY, { width: doc.page.width - margin * 2 - 12, baseSize: 8, baseFont: 'Helvetica-Bold', baseColor: '#854d0e', boldFont: 'Helvetica-Bold', boldColor: '#7c2d12' }) + 5;
  }
  curY = drawCeoPersonBlock(doc, 'ANTIGUO CEO', ceo.oldCeo, margin, curY);
  curY = drawCeoPersonBlock(doc, 'NUEVO CEO', ceo.newCeo, margin, curY);
  curY = drawCeoMarketBox(doc, ceo, margin, curY);
  if (ceo.disclaimer) {
    if (curY > doc.page.height - doc.page.margins.bottom - 14) {
      doc.addPage();
      curY = doc.page.margins.top;
    }
    doc.font('Helvetica-Oblique').fontSize(7).fillColor('#94a3b8').text(sanitize(ceo.disclaimer), margin + 6, curY, { width: doc.page.width - margin * 2 - 12, lineBreak: true });
    curY = doc.y + 4;
  }
  return drawHorizontalRule(doc, curY);
}
