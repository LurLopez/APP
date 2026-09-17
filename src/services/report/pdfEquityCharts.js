/**
 * @fileoverview Renderizado de gráficos de acciones en circulación y dividendos/payout en PDFKit.
 * @module services/report/pdfEquityCharts
 */

import { sanitize } from './pdfStyles.js';
import { t, normalizeLanguage, formatFixed } from '../../utils/i18n.js';

export function drawSharesChart(doc, chart, y) {
  if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return y;
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin * 2;
  const padL = 46;
  const padR = 6;
  const plotH = 130;
  const boxH = 22 + plotH + 22;

  if (y + boxH > doc.page.height - doc.page.margins.bottom - 20 && y > doc.page.margins.top + 10) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  doc.rect(margin, y, pageWidth, boxH).fill('#f8fafc');
  doc.rect(margin, y, pageWidth, boxH).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text(sanitize(chart.title), margin + 8, y + 5, { width: pageWidth - 16 });

  const plotX = margin + padL;
  const plotW = pageWidth - padL - padR;
  const plotTop = y + 22;
  const n = chart.points.length;
  const max = chart.max;
  const step = max > 500 ? 100 : (max > 100 ? 50 : 10);
  const niceMax = Math.ceil(max / step) * step || max;
  const yFor = (v) => plotTop + plotH * (1 - v / niceMax);

  for (let g = 0; g <= 3; g += 1) {
    const v = (niceMax * (3 - g)) / 3;
    const gy = yFor(v);
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).lineWidth(0.5).strokeColor(g === 3 ? '#cbd5e1' : '#e2e8f0').stroke();
    doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(`${Math.round(v)}M`, margin + 2, gy - 3.5, { width: padL - 8, align: 'right', lineBreak: false });
  }

  const slotW = plotW / n;
  const barW = Math.min(44, slotW * 0.6);
  chart.points.forEach((p, i) => {
    const cx = plotX + slotW * (i + 0.5);
    const top = yFor(p.shares);
    doc.rect(cx - barW / 2, top, barW, plotTop + plotH - top).fill('#f59e0b');
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#334155').text(String(p.year), cx - slotW / 2, plotTop + plotH + 5, { width: slotW, align: 'center', lineBreak: false });
  });

  const eqLang = normalizeLanguage(chart.language);
  const fmtP = (v) => `${v < 0 ? '' : '-'}${formatFixed(v, 1, eqLang)} %`;
  const fmtB = (v) => `+${formatFixed(v, 1, eqLang)} %`;
  const mets = Array.isArray(chart.metrics) ? chart.metrics : [];
  const drawDashed = (x1, y1, x2, y2, color) => {
    doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(1.2).dash(5, 4).strokeColor(color).stroke();
    doc.undash();
  };
  const drawLabelBox = (label, cx, boxY, bg) => {
    doc.font('Helvetica-Bold').fontSize(6.5);
    const w = doc.widthOfString(label) + 10;
    const x = Math.max(plotX + 2, Math.min(cx - w / 2, plotX + plotW - w - 2));
    const yy = Math.max(y + 18, boxY);
    doc.roundedRect(x, yy, w, 13, 3).fill(bg);
    doc.fillColor('#ffffff').text(label, x + 5, yy + 3.5, { width: w - 10, align: 'center', lineBreak: false });
  };

  if (mets.length) {
    const x0 = plotX + slotW * 0.5;
    const xN = plotX + slotW * (n - 0.5);
    const y0 = yFor(chart.points[0].shares);
    const yN = yFor(chart.points[n - 1].shares);
    drawDashed(x0, y0, xN, yN, '#1f2937');
    drawLabelBox(`CAGR: ${fmtP(mets[0].pct)} · ${eqLang === 'en' ? 'EPS' : 'BPA'} ${fmtB(mets[0].bpa)}`, (x0 + xN) / 2, (y0 + yN) / 2 - 20, '#1f2937');
    if (mets[1]) {
      const xPrev = plotX + slotW * (n - 1.5);
      const yPrev = yFor(chart.points[n - 2].shares);
      drawDashed(xPrev, yPrev, xN, yN, '#dc2626');
      drawLabelBox(t('Últ. año: {pct} · BPA {bpa}', { pct: fmtP(mets[1].pct), bpa: fmtB(mets[1].bpa) }, normalizeLanguage(chart.language)), (xPrev + xN) / 2, (yPrev + yN) / 2 - 34, '#dc2626');
    }
  }
  return y + boxH + 6;
}

export function drawDividendChart(doc, chart, y) {
  if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return y;
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin * 2;
  const padL = 46;
  const padR = 46;
  const plotH = 110;
  const headerH = 30;
  const footH = chart.hasReportedFallback ? 12 : 0;
  const boxH = headerH + plotH + 26 + footH;

  if (y + boxH > doc.page.height - doc.page.margins.bottom - 20 && y > doc.page.margins.top + 10) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  doc.rect(margin, y, pageWidth, boxH).fill('#f8fafc');
  doc.rect(margin, y, pageWidth, boxH).lineWidth(0.5).strokeColor('#e2e8f0').stroke();

  const eqLang = normalizeLanguage(chart.language);
  const chartTitle = t('EVOLUCIÓN DEL DIVIDENDO Y PAYOUT ({from}–{to})', { from: chart.points[0].year, to: chart.points[chart.points.length - 1].year }, eqLang);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text(sanitize(chartTitle), margin + 8, y + 6, { width: 320 });
  const cagrParts = [];
  if (chart.totalCagr != null) cagrParts.push(`${eqLang === 'en' ? 'amount' : 'importe'} ${chart.totalCagr >= 0 ? '+' : ''}${formatFixed(chart.totalCagr, 1, eqLang)} %`);
  if (chart.dpsCagr != null) cagrParts.push(`${eqLang === 'en' ? 'per share' : 'por acción'} ${chart.dpsCagr >= 0 ? '+' : ''}${formatFixed(chart.dpsCagr, 1, eqLang)} %`);
  if (cagrParts.length) {
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#64748b').text(sanitize(`CAGR ${chart.points[0].year}–${chart.points[chart.points.length - 1].year}: ${cagrParts.join(' · ')}`), margin + 8, y + 17, { width: 320 });
  }

  const legX = margin + pageWidth - 200;
  doc.rect(legX, y + 6, 8, 8).fill('#f59e0b');
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#334155').text(t('Dividendo por acción', null, eqLang), legX + 11, y + 6.5);
  doc.moveTo(legX + 84, y + 10).lineTo(legX + 98, y + 10).lineWidth(1.6).strokeColor('#0f766e').stroke();
  doc.circle(legX + 91, y + 10, 2.2).fill('#0f766e');
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#0f766e').text(t('Payout s/ BPA ajustado', null, eqLang), legX + 102, y + 6.5);

  const plotX = margin + padL;
  const plotW = pageWidth - padL - padR;
  const plotTop = y + headerH;
  const maxDps = Math.max(...chart.points.map((p) => (Number.isFinite(p.dps) ? p.dps : 0)), 0.5);
  const dpsStep = maxDps > 5 ? 2 : (maxDps > 2 ? 1 : (maxDps > 1 ? 0.5 : 0.25));
  const niceDps = Math.ceil(maxDps / dpsStep) * dpsStep || maxDps;
  const maxPayout = Math.max(...chart.points.map((p) => (Number.isFinite(p.payoutPct) ? p.payoutPct : 0)), 25);
  const nicePayout = Math.ceil(maxPayout / 25) * 25 || 25;
  const yDps = (v) => plotTop + plotH * (1 - Math.max(0, v) / niceDps);
  const yPayout = (v) => plotTop + plotH * (1 - Math.max(0, v) / nicePayout);

  for (let g = 0; g <= 3; g += 1) {
    const v = (niceDps * (3 - g)) / 3;
    const gy = yDps(v);
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).lineWidth(0.5).strokeColor(g === 3 ? '#cbd5e1' : '#e2e8f0').stroke();
    doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(`$${formatFixed(v, 1, eqLang)}`, margin + 2, gy - 3.5, { width: padL - 8, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(6.5).fillColor('#0f766e').text(`${Math.round((nicePayout * (3 - g)) / 3)}%`, margin + pageWidth - padR + 4, gy - 3.5, { width: padR - 4, align: 'left', lineBreak: false });
  }

  const n = chart.points.length;
  const slotW = plotW / n;
  const barW = Math.min(40, slotW * 0.45);
  const linePts = [];

  chart.points.forEach((p, i) => {
    const cx = plotX + slotW * (i + 0.5);
    if (Number.isFinite(p.dps)) {
      const top = yDps(p.dps);
      doc.rect(cx - barW / 2, top, barW, plotTop + plotH - top).fill('#f59e0b');
      doc.font('Helvetica-Bold').fontSize(6).fillColor('#b45309').text(`${formatFixed(p.dps, 2, eqLang)} $`, cx - slotW / 2, top - 7, { width: slotW, align: 'center', lineBreak: false });
    }
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#334155').text(String(p.year), cx - slotW / 2, plotTop + plotH + 5, { width: slotW, align: 'center', lineBreak: false });
    if (Number.isFinite(p.payoutPct)) linePts.push({ x: cx, y: yPayout(p.payoutPct), pct: p.payoutPct, barTop: Number.isFinite(p.dps) ? yDps(p.dps) : null });
  });

  if (linePts.length >= 2) {
    linePts.forEach((point, index) => {
      if (index === 0) return;
      const prev = linePts[index - 1];
      doc.moveTo(prev.x, prev.y).lineTo(point.x, point.y).lineWidth(1.6).strokeColor('#0f766e').stroke();
    });
  }
  linePts.forEach((point) => {
    doc.circle(point.x, point.y, 2.4).fill('#0f766e');
    const pctLabel = `${formatFixed(point.pct, 1, eqLang)}%`;
    const overlaps = point.barTop != null && Math.abs(point.barTop - point.y) < 18;
    if (overlaps) {
      doc.font('Helvetica-Bold').fontSize(6).fillColor('#0f766e').text(pctLabel, point.x + 5, point.y - 4, { width: 40, align: 'left', lineBreak: false });
    } else {
      doc.font('Helvetica-Bold').fontSize(6).fillColor('#0f766e').text(pctLabel, point.x - 20, point.y - 12, { width: 40, align: 'center', lineBreak: false });
    }
  });

  if (chart.hasReportedFallback) {
    doc.font('Helvetica').fontSize(5.5).fillColor('#94a3b8').text(t('* Años con BPA reportado (sin ajustado disponible).', null, normalizeLanguage(chart.language)), margin + 8, y + boxH - 10, { width: pageWidth - 16 });
  }

  return y + boxH + 8;
}
