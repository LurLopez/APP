/**
 * @fileoverview Renderizado de conclusiones (Recompras, Outlook, Deuda, Dividendos, Rating) en PDFKit.
 * @module services/report/pdfConclusionDrawer
 */

import {
  sanitize,
  drawSectionTitle,
  drawHorizontalRule,
  drawHighlightedText,
  drawPdfFormattedText,
} from './pdfStyles.js';
import { drawPdfSecSnippet } from './pdfSnippetDrawer.js';
import { drawSharesChart, drawDividendChart } from './pdfEquityCharts.js';
import {
  drawDebtMaturityChart,
  drawDebtHistoryChart,
  drawDebtRefinancingBox,
} from './pdfDebtCharts.js';
import {
  withAveragePriceRow,
  withOutlookComparison,
  buildSharesChartModel,
  buildDebtMaturityModel,
  buildDebtHistoryModel,
  buildDebtRefinancingModel,
  buildAcquisitionsModel,
  buildDividendModel,
} from '../reportExport.service.js';

function drawRepurchases(doc, rep, margin, y) {
  let curY = drawSectionTitle(doc, rep.title || '1: RECOMPRAS', y);
  if (rep.text) {
    curY = drawHighlightedText(doc, sanitize(rep.text), margin, curY, { width: doc.page.width - margin * 2, baseSize: 8.5, baseColor: '#374151', boldColor: '#0f172a' }) + 8;
  }
  const repExpiry = (rep.authorizationExpiry && !/no indicad|not disclosed|not stated|no consta|no especificad/i.test(String(rep.authorizationExpiry)))
    ? rep.authorizationExpiry : null;
  const badges = [
    (rep.authorizationRemaining || rep.programRemaining) ? `Autorización restante: ${rep.authorizationRemaining || rep.programRemaining}` : null,
    repExpiry ? `Vigencia: ${repExpiry}` : null,
    rep.shareCountEvolution ? `Evolución acciones: ${rep.shareCountEvolution}` : null,
    rep.bpaImpact ? `Impacto BPA: ${rep.bpaImpact}` : null,
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

function drawOutlook(doc, out, report, margin, y) {
  let curY = drawSectionTitle(doc, out.title || '2: OUTLOOK', y);
  if (out.text) {
    curY = drawPdfFormattedText(doc, out.text, margin, curY, doc.page.width - margin * 2, 'Helvetica', 'Helvetica-Bold', 8.5, '#374151') + 8;
  }
  const outDetails = [
    out.fcfAnalysis ? `Análisis FCF: ${out.fcfAnalysis}` : null,
    out.riskFactors ? `Riesgos y Sensibilidad: ${out.riskFactors}` : null,
    out.efficiencyPlans ? `Programas de ahorro / eficiencia: ${out.efficiencyPlans}` : null,
  ].filter(Boolean);
  if (outDetails.length) {
    outDetails.forEach((d) => {
      if (curY > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        curY = doc.page.margins.top;
      }
      curY = drawPdfFormattedText(doc, `• ${d}`, margin + 6, curY, doc.page.width - margin * 2 - 12, 'Helvetica', 'Helvetica-Bold', 8, '#4b5563') + 3;
    });
    curY += 5;
  }
  const outSnippet = out.secSnippet || out.secTable;
  if (outSnippet) curY = drawPdfSecSnippet(doc, withOutlookComparison(outSnippet, report), curY);
  return drawHorizontalRule(doc, curY);
}

function drawDebtSection(doc, debt, report, margin, y) {
  let curY = drawSectionTitle(doc, debt.title || '3: DEUDA', y);
  if (debt.text) {
    curY = drawPdfFormattedText(doc, debt.text, margin, curY, doc.page.width - margin * 2, 'Helvetica', 'Helvetica-Bold', 8.5, '#374151') + 8;
  }
  const maturityChart = buildDebtMaturityModel(debt, report?.fiscalYear);
  if (maturityChart) curY = drawDebtMaturityChart(doc, maturityChart, curY);
  const historyChart = buildDebtHistoryModel(debt, report);
  if (historyChart) curY = drawDebtHistoryChart(doc, historyChart, curY);
  const refinancing = buildDebtRefinancingModel(debt, report);
  if (refinancing) {
    curY = drawDebtRefinancingBox(doc, refinancing, curY);
  }
  if (debt.secSnippet && !maturityChart) {
    curY = drawPdfSecSnippet(doc, debt.secSnippet, curY);
  }
  return drawHorizontalRule(doc, curY);
}

function drawRatingBanner(doc, rating, margin, y) {
  const score = Number(rating.score);
  const bannerWidth = doc.page.width - margin * 2;
  const bannerBg = score >= 7 ? '#dcfce7' : (score >= 4 ? '#fef9c3' : '#fee2e2');
  const bannerBorder = score >= 7 ? '#16a34a' : (score >= 4 ? '#ca8a04' : '#dc2626');
  const bannerText = score >= 7 ? '#14532d' : (score >= 4 ? '#713f12' : '#7f1d1d');
  const labelText = sanitize(rating.label || `NOTA DE RESULTADOS: ${score}`);
  const rationaleText = rating.rationale ? sanitize(rating.rationale) : null;
  const disclaimerText = 'Nota puramente financiera basada exclusivamente en cuentas del año, outlook oficial y asignación de capital. Sin especulación futura.';

  doc.font('Helvetica-Bold').fontSize(12);
  const labelH = doc.heightOfString(labelText, { width: bannerWidth - 24 - 92 });
  doc.font('Helvetica').fontSize(8);
  const rationaleH = rationaleText ? doc.heightOfString(rationaleText, { width: bannerWidth - 24, lineBreak: true }) : 0;
  doc.font('Helvetica-Oblique').fontSize(6.5);
  const disclaimerH = doc.heightOfString(disclaimerText, { width: bannerWidth - 24, lineBreak: true });
  const bannerHeight = 16 + Math.max(labelH, 20) + (rationaleText ? 4 + rationaleH : 0) + 4 + disclaimerH + 8;

  let curY = y;
  if (curY + bannerHeight + 20 > doc.page.height - doc.page.margins.bottom - 20 && curY > doc.page.margins.top + 10) {
    doc.addPage();
    curY = doc.page.margins.top;
  }

  doc.rect(margin, curY, bannerWidth, bannerHeight).fill(bannerBg);
  doc.rect(margin, curY, bannerWidth, bannerHeight).lineWidth(1.5).strokeColor(bannerBorder).stroke();

  let innerY = curY + 8;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(bannerText).text(labelText, margin + 12, innerY, { width: bannerWidth - 24 - 92 });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(bannerText).text(`${score} / 10`, margin + bannerWidth - 80, innerY - 1, { width: 70, align: 'right' });
  innerY += Math.max(labelH, 20);

  if (rationaleText) {
    innerY += 4;
    doc.font('Helvetica').fontSize(8).fillColor('#1e293b').text(rationaleText, margin + 12, innerY, { width: bannerWidth - 24, lineBreak: true });
    innerY += rationaleH;
  }
  innerY += 4;
  doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#64748b').text(disclaimerText, margin + 12, innerY, { width: bannerWidth - 24, lineBreak: true });
  return curY + bannerHeight + 14;
}

export function drawConclusion(doc, report, startY) {
  const margin = doc.page.margins.left;
  let y = startY;

  if (report.conclusion || report.rating) {
    if (y > doc.page.margins.top + 10) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    const conc = report.conclusion || {};
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text('PARTE II: INDAGACIÓN A FONDO Y CONCLUSIÓN', margin, y);
    y += 18;
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('Análisis detallado de recompras, outlook oficial, deuda y asignación de capital', margin, y);
    y += 18;
    y = drawHorizontalRule(doc, y);

    let isFirst = true;
    const startPage = () => {
      if (isFirst) { isFirst = false; return; }
      if (y > doc.page.margins.top + 30) {
        doc.addPage();
        y = doc.page.margins.top;
      }
    };

    if (conc.repurchases) { startPage(); y = drawRepurchases(doc, conc.repurchases, margin, y); }
    if (conc.outlook) { startPage(); y = drawOutlook(doc, conc.outlook, report, margin, y); }
    if (conc.debt) { startPage(); y = drawDebtSection(doc, conc.debt, report, margin, y); }

    if (conc.acquisitions && buildAcquisitionsModel(report).material) {
      startPage();
      y = drawSectionTitle(doc, conc.acquisitions.title || '4: ADQUISICIONES', y);
      doc.font('Helvetica').fontSize(8.5).fillColor('#374151').text(sanitize(conc.acquisitions.text || 'No se realizaron adquisiciones materiales durante el ejercicio.'), margin, y, { width: doc.page.width - margin * 2, lineBreak: true });
      y = drawHorizontalRule(doc, doc.y + 8);
    }

    const dividendChart = buildDividendModel(report);
    if (dividendChart) {
      startPage();
      y = drawSectionTitle(doc, dividendChart.title || '5: DIVIDENDOS', y);
      if (dividendChart.text) y = drawPdfFormattedText(doc, dividendChart.text, margin, y, doc.page.width - margin * 2, 'Helvetica', 'Helvetica-Bold', 8.5, '#374151') + 8;
      y = drawHorizontalRule(doc, drawDividendChart(doc, dividendChart, y));
    }

    if (conc.watchlist && Array.isArray(conc.watchlist.items) && conc.watchlist.items.length) {
      startPage();
      y = drawSectionTitle(doc, conc.watchlist.title || 'COSAS A TENER EN CUENTA', y);
      conc.watchlist.items.forEach((item) => {
        if (y > doc.page.height - doc.page.margins.bottom - 20) { doc.addPage(); y = doc.page.margins.top; }
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#16a34a').text('OK', margin + 6, y, { continued: true });
        doc.font('Helvetica').fontSize(8).fillColor('#374151').text(`  ${sanitize(item)}`, { width: doc.page.width - margin * 2 - 20, lineBreak: true });
        y = doc.y + 4;
      });
      y = drawHorizontalRule(doc, y + 6);
    }

    if (report.rating && report.rating.score != null) {
      if (y > doc.page.margins.top + 30) startPage();
      y = drawRatingBanner(doc, report.rating, margin, y);
    }
  }

  return y;
}
