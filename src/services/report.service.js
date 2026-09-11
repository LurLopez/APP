import PDFDocument from 'pdfkit';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReportHtml,
  buildReportDocx,
  buildReportOdt,
  withAveragePriceRow,
  withOutlookComparison,
  buildSharesChartModel,
  buildDebtMaturityModel,
  buildDebtHistoryModel,
  buildDebtRefinancingModel,
} from './reportExport.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GENERATED_DIR = path.join(__dirname, '..', '..', 'uploads', 'generated');

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

const PDF_SAFE_CHARS = [
  ['−', '-'],       // Signo menos unicode
  ['Δ', 'Delta'],   // Delta griego (no soportado por la fuente Helvetica estándar)
  ['×', 'x'],       // Signo de multiplicación
  ['→', '->'],      // Flecha
  ['✓', 'OK'],      // Marca de verificación
  ['±', '+/-'],     // Más-menos
  ['≤', '<='],      // Menor o igual
  ['≥', '>='],      // Mayor o igual
  ['≈', '~'],       // Aproximado
];

function sanitize(value) {
  if (value === null || value === undefined) return '—';
  let str = String(value);
  for (const [from, to] of PDF_SAFE_CHARS) str = str.replaceAll(from, to);
  return str;
}

const PDF_HIGHLIGHT_PALETTE = [
  { bg: '#fef08a', text: '#854d0e' }, // 1: Amarillo
  { bg: '#fed7aa', text: '#c2410c' }, // 2: Naranja
  { bg: '#bbf7d0', text: '#15803d' }, // 3: Verde lima
  { bg: '#e9d5ff', text: '#7e22ce' }, // 4: Morado / Malva
  { bg: '#bae6fd', text: '#0369a1' }, // 5: Celeste pastel
  { bg: '#fbcfe8', text: '#be185d' }, // 6: Rosa pastel
];

function getPdfHighlightColor(noteNumber) {
  const num = parseInt(noteNumber, 10);
  if (isNaN(num) || num < 1) return PDF_HIGHLIGHT_PALETTE[0];
  return PDF_HIGHLIGHT_PALETTE[(num - 1) % PDF_HIGHLIGHT_PALETTE.length];
}

function drawTable(doc, columns, rows, options = {}) {
  const { startY, colWidths, nameColWidth = 140, headerBg = '#1f2937', headerColor = '#ffffff', metaRows = [], isCapital = false, isCashFlow = false } = options;
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin * 2;
  const nameWidth = colWidths ? colWidths[0] : nameColWidth;
  const valueWidths = colWidths ? colWidths.slice(1) : Array(columns.length - 1).fill((pageWidth - nameWidth) / Math.max(1, columns.length - 1));
  const tableWidth = nameWidth + valueWidths.reduce((a, b) => a + b, 0);
  const rowHeight = options.rowHeight ?? 18;
  let y = startY;

  // Asegurar espacio para cabecera y al menos 2 filas antes de pintar
  if (y + rowHeight * 3 > doc.page.height - doc.page.margins.bottom - 10) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  const ensureSpace = (needed) => {
    if (y + needed > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeaderRow();
    }
  };

  const drawHeaderRow = () => {
    doc.rect(margin, y, tableWidth, rowHeight).fill(headerBg);
    doc.fillColor(headerColor).fontSize(7.5).font('Helvetica-Bold');
    let x = margin;
    doc.text(columns[0], x + 4, y + 5, { width: nameWidth - 8, height: rowHeight - 4 });
    x += nameWidth;
    columns.slice(1).forEach((col, i) => {
      const noteMatch = String(col).match(/\*(\d+)/);
      if (noteMatch) {
        const noteNum = parseInt(noteMatch[1], 10);
        const colorScheme = getPdfHighlightColor(noteNum);
        doc.rect(x + 1, y + 1, valueWidths[i] - 2, rowHeight - 2).fill(colorScheme.bg);
        doc.fillColor(colorScheme.text).font('Helvetica-Bold');
      } else {
        doc.fillColor(headerColor).font('Helvetica-Bold');
      }
      doc.text(col, x + 4, y + 5, { width: valueWidths[i] - 8, height: rowHeight - 4 });
      x += valueWidths[i];
    });
    y += rowHeight;
  };

  drawHeaderRow();

  const isSalesTable = columns.length === 7 && columns[1] === 'Ajustado' && columns[4] === 'Normal';
  const isCapitalTable = isCapital || (columns.length === 2 && columns[0] === 'Métrica' && columns[1] === 'Valor');

  rows.forEach((row, index) => {
    ensureSpace(rowHeight);
    if (index % 2 === 0) {
      doc.rect(margin, y, tableWidth, rowHeight).fill('#f3f4f6');
    }
    let x = margin;
    const nameText = sanitize(row[0]);
    const nameNoteMatch = nameText.match(/\*(\d+)/);
    if (nameNoteMatch) {
      const noteNum = parseInt(nameNoteMatch[1], 10);
      const colorScheme = getPdfHighlightColor(noteNum);
      doc.font('Helvetica-Bold').fontSize(7.5);
      const textWidth = doc.widthOfString(nameText) + 8;
      const lineCount = Math.max(1, Math.ceil(doc.heightOfString(nameText, { width: nameWidth - 8 }) / 9.6));
      const rectHeight = lineCount * (rowHeight - 4);
      doc.rect(x + 2, y + 2, Math.min(nameWidth - 4, textWidth), rectHeight).fill(colorScheme.bg);
      doc.fillColor(colorScheme.text).font('Helvetica-Bold').fontSize(7.5);
    } else {
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(7.5);
    }
    doc.text(nameText, x + 4, y + 5, { width: nameWidth - 8, height: rowHeight - 4 });
    x += nameWidth;

    const meta = metaRows[index] || {};
    const isRowAdjusted = isSalesTable && meta.isAdjusted === true;

    let noteNum = 1;
    const noteMatch = String(meta.adjustedNote || '').match(/\*?(\d+)/);
    if (noteMatch) {
      noteNum = parseInt(noteMatch[1], 10);
    }
    const colorScheme = getPdfHighlightColor(noteNum);

    row.slice(1).forEach((cell, i) => {
      const colHeader = columns[i + 1];
      const isBoldCol = colHeader === 'Ajustado' || colHeader === 'Normal';
      const isPctCol = colHeader === '% Aj.' || colHeader === '% N.' || colHeader === '% Ajustado' || colHeader === '% Normal';
      const isAdjustedCell = isSalesTable && i === 0 && isRowAdjusted;
      const isTaxAdjustedCell = isCashFlow && i === 1 && meta.cashFlowAdjustedNote;
      const isCapitalCell = isCapitalTable && i === 0;

      if (isAdjustedCell) {
        doc.rect(x + 1, y + 1, valueWidths[i] - 2, rowHeight - 2).fill(colorScheme.bg);
      }
      if (isTaxAdjustedCell) {
        const taxNoteNum = String(meta.cashFlowAdjustedNote).replace(/\D/g, '') || '2';
        doc.rect(x + 1, y + 1, valueWidths[i] - 2, rowHeight - 2).fill(getPdfHighlightColor(taxNoteNum).bg);
      }

      let fontName = isBoldCol ? 'Helvetica-Bold' : 'Helvetica';
      let textColor = '#111827';

      if (isAdjustedCell) {
        textColor = colorScheme.text;
        fontName = 'Helvetica-Bold';
      } else if (isTaxAdjustedCell) {
        const taxNoteNum = String(meta.cashFlowAdjustedNote).replace(/\D/g, '') || '2';
        textColor = getPdfHighlightColor(taxNoteNum).text;
        fontName = 'Helvetica-Bold';
      } else if (isPctCol && cell) {
        const str = String(cell).trim();
        if (str.startsWith('-')) {
          textColor = '#dc2626'; // Rojo para negativos
        } else if (str.startsWith('+') || /^[0-9]/.test(str)) {
          textColor = '#16a34a'; // Verde para positivos
        }
      } else if (isCapitalCell && cell) {
        const str = String(cell).trim();
        if (str.startsWith('-')) {
          textColor = '#dc2626';
        } else if (str.startsWith('+') || (/^[0-9]/.test(str) && str !== '0')) {
          textColor = '#16a34a';
        }
      }

      doc.fillColor(textColor).font(fontName).fontSize(7.5);
      doc.text(sanitize(cell), x + 4, y + 5, { width: valueWidths[i] - 8, height: rowHeight - 4 });
      x += valueWidths[i];
    });
    y += rowHeight;
  });

  return y + 8;
}

function drawSectionTitle(doc, title, y, minSpace = 130) {
  if (y + minSpace > doc.page.height - doc.page.margins.bottom - 10) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(title, doc.page.margins.left, y + 6);
  return y + 22;
}

function drawNotes(doc, notes, y) {
  let currentY = y;
  (notes ?? []).filter(Boolean).forEach((note) => {
    const raw = sanitize(note);
    const match = raw.match(/^\*(\d+):?\s*([\s\S]*)$/);
    if (match) {
      const num = match[1];
      const marker = `*${num}:`;
      const rest = match[2];
      const colorScheme = getPdfHighlightColor(num);

      doc.font('Helvetica-Bold').fontSize(7.5);
      const markerWidth = doc.widthOfString(marker) + 6;
      doc.rect(doc.page.margins.left, currentY, markerWidth, 10).fill(colorScheme.bg);
      doc.fillColor(colorScheme.text).font('Helvetica-Bold').fontSize(7.5).text(marker, doc.page.margins.left + 3, currentY + 1.5);
      doc.fillColor('#4b5563').font('Helvetica').fontSize(7.5).text(rest, doc.page.margins.left + markerWidth + 4, currentY + 1.5, { width: doc.page.width - doc.page.margins.left * 2 - markerWidth - 4, lineBreak: true });
      currentY = doc.y + 4;
    } else {
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#6b7280');
      currentY = doc.text(raw, doc.page.margins.left, currentY, { width: doc.page.width - doc.page.margins.left * 2, lineBreak: true }).y + 3;
    }
  });
  return currentY + 4;
}

function drawHorizontalRule(doc, y) {
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.left, y).lineWidth(0.5).strokeColor('#d1d5db').stroke();
  return y + 10;
}

function drawSharesChart(doc, chart, y) {
  if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return y;
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin * 2;
  const padL = 46;
  const padR = 6;
  const plotH = 130;
  const boxH = 22 + plotH + 22;
  if (y + boxH > doc.page.height - doc.page.margins.bottom - 20) {
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

  const fmtP = (v) => `${v < 0 ? '' : '-'}${v.toFixed(1).replace('.', ',')} %`;
  const fmtB = (v) => `+${v.toFixed(1).replace('.', ',')} %`;
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
    drawLabelBox(`CAGR: ${fmtP(mets[0].pct)} · BPA ${fmtB(mets[0].bpa)}`, (x0 + xN) / 2, (y0 + yN) / 2 - 20, '#1f2937');
    if (mets[1]) {
      const xPrev = plotX + slotW * (n - 1.5);
      const yPrev = yFor(chart.points[n - 2].shares);
      drawDashed(xPrev, yPrev, xN, yN, '#dc2626');
      drawLabelBox(`Últ. año: ${fmtP(mets[1].pct)} · BPA ${fmtB(mets[1].bpa)}`, (xPrev + xN) / 2, (yPrev + yN) / 2 - 34, '#dc2626');
    }
  }
  return y + boxH + 6;
}

function drawDebtMaturityChart(doc, chart, y) {
  if (!chart || !Array.isArray(chart.years) || !chart.years.length) return y;
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin * 2;
  const padL = 46;
  const padR = 10;
  const plotH = 120;
  const headerH = 20;
  const footerH = 22;
  const boxH = headerH + plotH + footerH + 20;

  if (y + boxH > doc.page.height - doc.page.margins.bottom - 20) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  // Fondo y borde del contenedor
  doc.rect(margin, y, pageWidth, boxH).fill('#f8fafc');
  doc.rect(margin, y, pageWidth, boxH).lineWidth(0.5).strokeColor('#e2e8f0').stroke();

  // Título
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text(sanitize(chart.title), margin + 8, y + 6, { width: pageWidth - 16 });

  const plotX = margin + padL;
  const plotW = pageWidth - padL - padR;
  const plotTop = y + headerH + 6;
  const max = chart.maxYearAmount || 1;
  const step = max > 5000 ? 1000 : (max > 1000 ? 500 : (max > 200 ? 100 : 50));
  const niceMax = Math.ceil(max / step) * step || max;
  const yFor = (v) => plotTop + plotH * (1 - v / niceMax);

  // Líneas de cuadrícula Y
  for (let g = 0; g <= 3; g += 1) {
    const v = (niceMax * (3 - g)) / 3;
    const gy = yFor(v);
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).lineWidth(0.5).strokeColor(g === 3 ? '#cbd5e1' : '#e2e8f0').stroke();
    doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(`$${Math.round(v)}M`, margin + 2, gy - 3.5, { width: padL - 8, align: 'right', lineBreak: false });
  }

  const n = chart.years.length;
  const slotW = plotW / n;
  const barW = Math.min(46, slotW * 0.65);

  chart.years.forEach((yr, i) => {
    const cx = plotX + slotW * (i + 0.5);
    let curBaseline = plotTop + plotH;

    yr.items.forEach((it) => {
      const blockH = Math.max(2, (it.amount / niceMax) * plotH);
      const top = curBaseline - blockH;
      doc.rect(cx - barW / 2, top, barW, blockH).fill(it.color || '#f59e0b');

      // Tipo de interés en cada bloque
      if (blockH >= 11 && it.interestRate != null) {
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor(it.textColor || '#ffffff').text(
          `${Number(it.interestRate).toFixed(1).replace('.', ',')}%`,
          cx - barW / 2,
          top + (blockH - 7) / 2,
          { width: barW, align: 'center', lineBreak: false }
        );
      }
      curBaseline = top;
    });

    // Cifra sobre la barra: importe que vence ese año (en negrita) y tipo medio anual
    if (yr.totalAmount > 0) {
      const totalLabel = `$${yr.totalAmount.toFixed(1).replace('.', ',')}M`;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text(totalLabel, cx - slotW / 2, curBaseline - 15, { width: slotW, align: 'center', lineBreak: false });
      if (yr.averageRate != null) {
        const rateLabel = `Media: ${yr.averageRate.toFixed(2).replace('.', ',')}%`;
        doc.font('Helvetica-Bold').fontSize(6).fillColor('#c2410c').text(rateLabel, cx - slotW / 2, curBaseline - 6, { width: slotW, align: 'center', lineBreak: false });
      }
    } else {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#94a3b8').text('—', cx - slotW / 2, plotTop + plotH - 12, { width: slotW, align: 'center', lineBreak: false });
    }

    // Año abajo
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#334155').text(String(yr.year), cx - slotW / 2, plotTop + plotH + 5, { width: slotW, align: 'center', lineBreak: false });
  });

  // Banner inferior: tipo de interés medio total y deuda a amortizar
  const bannerY = y + boxH - footerH - 4;
  doc.rect(margin + 6, bannerY, pageWidth - 12, footerH).fill('#1e293b');
  const afterText = chart.afterYearFive != null ? `   |   Después del año 5: $${chart.afterYearFive.toFixed(1).replace('.', ',')}M` : '';
  const bannerText = chart.totalAverageRate != null
    ? `Tipo de interés medio total (próximos 5 años): ${chart.totalAverageRate.toFixed(2).replace('.', ',')} %   |   Deuda a amortizar: $${chart.totalAmount.toFixed(1).replace('.', ',')}M${afterText}`
    : `Deuda a amortizar en los próximos 5 años: $${chart.totalAmount.toFixed(1).replace('.', ',')}M${afterText}`;
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff').text(sanitize(bannerText), margin + 8, bannerY + 7, { width: pageWidth - 16, align: 'center', lineBreak: false });

  return y + boxH + 8;
}

function drawDebtHistoryChart(doc, chart, y) {
  if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return y;
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin * 2;
  const padL = 46;
  const padR = 10;
  const plotH = 120;
  const headerH = 22;
  const boxH = headerH + plotH + 26;

  if (y + boxH > doc.page.height - doc.page.margins.bottom - 20) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  doc.rect(margin, y, pageWidth, boxH).fill('#f8fafc');
  doc.rect(margin, y, pageWidth, boxH).lineWidth(0.5).strokeColor('#e2e8f0').stroke();

  // Título y Leyenda
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text(sanitize(chart.title), margin + 8, y + 6, { width: 300 });

  const legX = margin + pageWidth - 190;
  doc.rect(legX, y + 6, 8, 8).fill('#1e40af');
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#334155').text('Deuda Normal', legX + 11, y + 6.5);
  doc.rect(legX + 85, y + 6, 8, 8).fill('#d97706');
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#334155').text('Deuda Neta', legX + 96, y + 6.5);

  const plotX = margin + padL;
  const plotW = pageWidth - padL - padR;
  const plotTop = y + headerH;
  const max = chart.maxVal || 1;
  const step = max > 5000 ? 1000 : (max > 1000 ? 500 : (max > 200 ? 100 : 50));
  const niceMax = Math.ceil(max / step) * step || max;
  const yFor = (v) => plotTop + plotH * (1 - Math.max(0, v) / niceMax);

  for (let g = 0; g <= 3; g += 1) {
    const v = (niceMax * (3 - g)) / 3;
    const gy = yFor(v);
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).lineWidth(0.5).strokeColor(g === 3 ? '#cbd5e1' : '#e2e8f0').stroke();
    doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(`$${Math.round(v)}M`, margin + 2, gy - 3.5, { width: padL - 8, align: 'right', lineBreak: false });
  }

  const n = chart.points.length;
  const slotW = plotW / n;
  const groupW = Math.min(44, slotW * 0.76);
  const barW = (groupW - 4) / 2;

  chart.points.forEach((p, i) => {
    const cx = plotX + slotW * (i + 0.5);
    const top1 = yFor(p.totalDebt);
    const top2 = Number.isFinite(p.netDebt) ? yFor(p.netDebt) : plotTop + plotH;

    // Barra 1: Deuda Normal
    doc.rect(cx - groupW / 2, top1, barW, plotTop + plotH - top1).fill('#1e40af');
    doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#1e40af').text(
      `${Math.round(p.totalDebt)}M`,
      cx - groupW / 2 - 2,
      top1 - 7,
      { width: barW + 4, align: 'center', lineBreak: false }
    );

    // Barra 2: Deuda Neta
    if (Number.isFinite(p.netDebt)) {
      doc.rect(cx - groupW / 2 + barW + 4, top2, barW, plotTop + plotH - top2).fill('#d97706');
      doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#d97706').text(
        `${Math.round(p.netDebt)}M`,
        cx - groupW / 2 + barW + 2,
        top2 - 7,
        { width: barW + 4, align: 'center', lineBreak: false }
      );
    }

    // Año
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#334155').text(String(p.year), cx - slotW / 2, plotTop + plotH + 4, { width: slotW, align: 'center', lineBreak: false });

    // Variación respecto al año anterior de cada barra (verde si se redujo, rojo si aumentó)
    const deltaY = plotTop + plotH + 12;
    if (p.deltaTotalDebt != null) {
      const dColor = p.deltaTotalDebt < 0 ? '#16a34a' : '#dc2626';
      const dSign = p.deltaTotalDebt > 0 ? '+' : '';
      doc.font('Helvetica-Bold').fontSize(5).fillColor(dColor).text(
        `${dSign}${Math.round(p.deltaTotalDebt)}M`,
        cx - groupW / 2 - 1,
        deltaY,
        { width: barW + 4, align: 'center', lineBreak: false }
      );
    }
    if (p.deltaNetDebt != null) {
      const dColor = p.deltaNetDebt < 0 ? '#16a34a' : '#dc2626';
      const dSign = p.deltaNetDebt > 0 ? '+' : '';
      doc.font('Helvetica-Bold').fontSize(5).fillColor(dColor).text(
        `${dSign}${Math.round(p.deltaNetDebt)}M`,
        cx - groupW / 2 + barW + 3,
        deltaY,
        { width: barW + 4, align: 'center', lineBreak: false }
      );
    }
  });

  return y + boxH + 8;
}

function drawDebtRefinancingBox(doc, refinancing, y) {
  if (!refinancing) return y;
  const margin = doc.page.margins.left;
  const boxWidth = doc.page.width - margin * 2;
  const boxPad = 8;
  const boxLabel = 'Refinanciación de deuda e impacto en BPA:';

  doc.font('Helvetica-Bold').fontSize(8.5);
  const labelH = doc.heightOfString(boxLabel, { width: boxWidth - 16 });

  let textH = 0;
  if (refinancing.explanation) {
    doc.font('Helvetica').fontSize(8);
    textH = doc.heightOfString(refinancing.explanation, { width: boxWidth - 16, lineBreak: true });
  }
  let impactH = 0;
  if (refinancing.impactExplanation) {
    doc.font('Helvetica').fontSize(7.5);
    impactH = doc.heightOfString(refinancing.impactExplanation, { width: boxWidth - 16, lineBreak: true });
  }

  const boxHeight = boxPad + labelH + 28 + (textH ? textH + 8 : 0) + (impactH ? impactH + 6 : 0) + boxPad;
  if (y + boxHeight > doc.page.height - doc.page.margins.bottom - 20) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  const boxStartY = y;
  doc.rect(margin, boxStartY, boxWidth, boxHeight).fill('#fff7ed');
  doc.rect(margin, boxStartY, 3.5, boxHeight).fill('#ea580c');

  let curY = boxStartY + boxPad;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#9a3412').text(boxLabel, margin + 10, curY);
  curY += labelH + 6;

  // Fila de métricas clave en negrita
  const badgeW = (boxWidth - 20) / 4;
  const badges = [
    { label: 'Tipo deuda anterior', val: refinancing.oldDebtRate != null ? `${refinancing.oldDebtRate.toFixed(2).replace('.', ',')} %` : '—' },
    { label: 'Tipo nueva emisión', val: refinancing.newDebtRate != null ? `${refinancing.newDebtRate.toFixed(2).replace('.', ',')} %` : '—' },
    { label: 'Volumen refinanciado', val: refinancing.amount != null ? `$${Math.round(refinancing.amount)}M` : '—' },
    {
      label: 'Impacto en BPA',
      val: refinancing.epsImpact != null ? `${refinancing.epsImpact >= 0 ? '+' : ''}${refinancing.epsImpact.toFixed(2).replace('.', ',')} $/acc` : '—',
      highlight: true,
    },
  ];

  badges.forEach((b, idx) => {
    const bx = margin + 10 + idx * badgeW;
    if (b.highlight) {
      doc.roundedRect(bx, curY, badgeW - 6, 22, 3).fill('#fed7aa');
      doc.font('Helvetica').fontSize(6).fillColor('#7c2d12').text(b.label, bx + 2, curY + 2, { width: badgeW - 10, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#7c2d12').text(b.val, bx + 2, curY + 11, { width: badgeW - 10, align: 'center' });
    } else {
      doc.roundedRect(bx, curY, badgeW - 6, 22, 3).fill('#ffedd5');
      doc.font('Helvetica').fontSize(6).fillColor('#9a3412').text(b.label, bx + 2, curY + 2, { width: badgeW - 10, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#431407').text(b.val, bx + 2, curY + 11, { width: badgeW - 10, align: 'center' });
    }
  });

  curY += 28;

  if (refinancing.explanation) {
    drawPdfFormattedText(doc, refinancing.explanation, margin + 10, curY, boxWidth - 20, 'Helvetica', 'Helvetica-Bold', 7.5, '#431407');
    curY = doc.y + 6;
  }
  if (refinancing.impactExplanation) {
    drawPdfFormattedText(doc, refinancing.impactExplanation, margin + 10, curY, boxWidth - 20, 'Helvetica-Bold', 'Helvetica-Bold', 7.5, '#c2410c');
  }

  return boxStartY + boxHeight + 10;
}

function tokenizeNumbersPdf(text) {
  const str = String(text ?? '');
  const parts = [];
  const regex = /([~±\-+]\s*)?\d[\d.,]*\s*(?:M|%|\$)?/g;
  let last = 0;
  let m;
  while ((m = regex.exec(str)) !== null) {
    if (m.index > last) parts.push({ text: str.slice(last, m.index), number: false });
    parts.push({ text: m[0], number: true });
    last = m.index + m[0].length;
  }
  if (last < str.length) parts.push({ text: str.slice(last), number: false });
  return parts.length ? parts : [{ text: str, number: false }];
}

function drawHighlightedText(doc, text, x, y, { width, baseFont = 'Helvetica', baseSize = 8.5, baseColor = '#374151', boldFont = 'Helvetica-Bold', boldColor = '#0f172a' } = {}) {
  const parts = tokenizeNumbersPdf(text);
  let first = true;
  const lastIndex = parts.length - 1;
  parts.forEach((seg, i) => {
    const isNumber = seg.number;
    doc.font(isNumber ? boldFont : baseFont).fontSize(baseSize).fillColor(isNumber ? boldColor : baseColor);
    if (first) {
      doc.text(seg.text, x, y, { width, lineBreak: true, continued: i !== lastIndex });
      first = false;
    } else {
      doc.text(seg.text, { continued: i !== lastIndex });
    }
  });
  return doc.y;
}

function parseMarkdownAndNumbers(text) {
  if (!text) return [];
  const str = String(text);
  const rawParts = str.split(/(\*\*.*?\*\*)/g).filter(Boolean);
  const result = [];

  for (const part of rawParts) {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      result.push({ text: part.slice(2, -2), bold: true });
    } else {
      const autoRegex = /(\bflat\s*(?:[±+\-/]+|\+\/-)\s*\d+(?:[\.,]\d+)?\s*%?|\b[~±+\-]?\s*\$?\d+(?:[\.,]\d+)?\s*(?:M|B|k|%)?\s*(?:al?|to|-)\s*[~±+\-]?\s*\$?\d+(?:[\.,]\d+)?\s*(?:M|B|k|%|\$|€)?|[~±+\-]?\s*\$?\d+(?:[\.,]\d+)*\s*(?:M|B|k|%|\$|€)(?:\s*(?:[±+\-/]+|\+\/-)\s*\d+(?:[\.,]\d+)?\s*%)?|\b20\d\d\s*-\s*20\d\d\b)/gi;
      let last = 0;
      let m;
      while ((m = autoRegex.exec(part)) !== null) {
        if (m.index > last) {
          result.push({ text: part.slice(last, m.index), bold: false });
        }
        result.push({ text: m[0], bold: true });
        last = m.index + m[0].length;
      }
      if (last < part.length) {
        result.push({ text: part.slice(last), bold: false });
      }
    }
  }

  const merged = [];
  for (const seg of result) {
    if (!seg.text) continue;
    if (merged.length && merged[merged.length - 1].bold === seg.bold) {
      merged[merged.length - 1].text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

function drawPdfFormattedText(doc, text, x, y, width, baseFont = 'Helvetica', boldFont = 'Helvetica-Bold', fontSize = 8.5, color = '#374151') {
  if (!text) return y;
  const segments = parseMarkdownAndNumbers(text);
  if (!segments.length) return y;

  if (x != null && y != null) {
    doc.x = x;
    doc.y = y;
  }
  segments.forEach((seg, idx) => {
    const isLast = idx === segments.length - 1;
    const clean = sanitize(seg.text);
    const font = seg.bold ? boldFont : baseFont;
    const textColor = seg.bold ? '#0f172a' : color;
    doc.font(font).fontSize(fontSize).fillColor(textColor).text(clean, {
      continued: !isLast,
      width,
      lineBreak: isLast,
    });
  });
  return doc.y;
}

function drawPdfSecSnippet(doc, snippet, y) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return y;
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin * 2;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  const headers = Array.isArray(snippet.headers) ? snippet.headers : [];
  const rows = snippet.rows.map((r) => Array.isArray(r) ? r.map(sanitize) : [sanitize(r.metric ?? r.name), sanitize(r.value)]);
  const numCols = headers.length || (rows[0] ? rows[0].length : 2);

  let colWidths;
  if (numCols === 4) {
    const wMetric = 160;
    const wPrev = 90;
    const wGuidance = 110;
    const wProj = Math.max(80, pageWidth - wMetric - wPrev - wGuidance);
    colWidths = [wMetric, wPrev, wGuidance, wProj];
  } else {
    const firstColWidth = numCols === 2 ? 220 : 160;
    const remainingWidth = (pageWidth - firstColWidth) / Math.max(1, numCols - 1);
    colWidths = [firstColWidth, ...Array(numCols - 1).fill(remainingWidth)];
  }

  // Altura estimada de cabecera
  let headerH = 16;
  if (headers.length) {
    doc.font('Helvetica-Bold').fontSize(7.5);
    headers.forEach((h, i) => {
      const hh = doc.heightOfString(sanitize(h), { width: colWidths[i] - 8 });
      headerH = Math.max(headerH, hh + 8);
    });
  }

  // Si no queda espacio para cabecera y al menos 4 filas (~110 pt), mover a nueva página
  const minStartSpace = 32 + headerH + 60;
  if (y + minStartSpace > pageBottom) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  // Encabezado del extracto SEC
  doc.rect(margin, y, pageWidth, 16).fill('#f1f5f9');
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8).text('EXTRACTO OFICIAL SEC (FORM 10-K)', margin + 6, y + 4);
  if (snippet.summary) {
    doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(7.5).text(sanitize(snippet.summary), margin + 170, y + 4, { width: pageWidth - 176, align: 'right' });
  }
  y += 18;

  if (snippet.title) {
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(sanitize(snippet.title), margin, y);
    y += 13;
  }

  function drawSnippetHeaderRow() {
    if (!headers.length) return;
    doc.rect(margin, y, pageWidth, headerH).fill('#1e293b');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
    let curX = margin;
    headers.forEach((h, i) => {
      const align = i > 0 ? 'right' : 'left';
      doc.text(sanitize(h), curX + 4, y + 4, { width: colWidths[i] - 8, align });
      curX += colWidths[i];
    });
    y += headerH;
  }

  drawSnippetHeaderRow();

  rows.forEach((row, rIdx) => {
    let rowHeight = 16;
    row.forEach((cellText, cIdx) => {
      const cellH = doc.fontSize(7.5).font(cIdx === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .heightOfString(sanitize(cellText), { width: colWidths[cIdx] - 8 });
      rowHeight = Math.max(rowHeight, cellH + 9);
    });
    if (y + rowHeight > pageBottom - 15) {
      doc.addPage();
      y = doc.page.margins.top;
      drawSnippetHeaderRow();
    }
    const isOdd = rIdx % 2 === 1;
    if (isOdd) doc.rect(margin, y, pageWidth, rowHeight).fill('#f8fafc');

    const rowText = row.join(' ').toLowerCase();
    const isYellow = rowText.includes('repurchased') || rowText.includes('recomprad');
    const isOrange = rowText.includes('aggregate') || rowText.includes('cost');

    let curX = margin;
    row.forEach((cellText, cIdx) => {
      let font = cIdx === 0 ? 'Helvetica-Bold' : 'Helvetica';
      let textColor = '#1e293b';

      if (numCols === 4) {
        if (cIdx === 1) {
          doc.rect(curX + 1, y + 1, colWidths[cIdx] - 2, rowHeight - 2).fill('#f8fafc');
          textColor = '#475569';
          font = 'Helvetica-Bold';
        } else if (cIdx === 2) {
          font = 'Helvetica-Bold';
        } else if (cIdx === 3) {
          doc.rect(curX + 1, y + 1, colWidths[cIdx] - 2, rowHeight - 2).fill('#f0fdfa');
          textColor = '#0d9488';
          font = 'Helvetica-Bold';
        }
      } else if (cIdx > 0 && isYellow) {
        doc.rect(curX + 1, y + 1, colWidths[cIdx] - 2, rowHeight - 2).fill('#fef08a');
        textColor = '#854d0e';
        font = 'Helvetica-Bold';
      } else if (cIdx > 0 && isOrange) {
        doc.rect(curX + 1, y + 1, colWidths[cIdx] - 2, rowHeight - 2).fill('#fed7aa');
        textColor = '#c2410c';
        font = 'Helvetica-Bold';
      } else if (cIdx > 0) {
        font = 'Helvetica-Bold';
      }

      const align = cIdx > 0 ? 'right' : 'left';
      doc.fillColor(textColor).font(font).fontSize(7.5).text(sanitize(cellText), curX + 4, y + 4, {
        width: colWidths[cIdx] - 8,
        align,
      });
      curX += colWidths[cIdx];
    });
    y += rowHeight;
  });

  return y + 10;
}

export function buildReportPdf(report) {
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
      doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text(`Ticker: ${sanitize(report.ticker)}`, margin, y);
      y += 14;
    }
    if (report.periodTitle) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#374151').text(sanitize(report.periodTitle), margin, y + 2);
      y += 22;
    }

    y = drawHorizontalRule(doc, y);

    const horizons = Array.isArray(report.horizons) ? report.horizons : [];
    horizons.forEach((horizon, hIndex) => {
      const label = sanitize(horizon.label ?? (hIndex === 0 ? 'ÚLTIMOS 3 MESES' : 'EN TODO EL AÑO'));
      if (hIndex > 0) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#111827').text(label, margin, y + 4);
      y += 26;

      const sales = horizon.sales ?? {};
      if (Array.isArray(sales.rows) && sales.rows.length) {
        y = drawSectionTitle(doc, '1. VENTAS', y);
        const salesRows = sales.rows.map((row) => [
          row.name,
          row.adjusted,
          row.prevAdjusted,
          row.pctAdjusted,
          row.normal,
          row.prevNormal,
          row.pctNormal,
        ]);
        y = drawTable(doc, ['Métrica', 'Ajustado', 'Anterior Aj.', '% Ajustado', 'Normal', 'Anterior N.', '% Normal'], salesRows, {
          startY: y,
          colWidths: [140, 62, 62, 63, 62, 62, 63],
          rowHeight: 18,
          metaRows: sales.rows,
        });
        const extras = [];
        if (sales.shares) extras.push(`ACCIONES: ${sanitize(sales.shares)}`);
        if (sales.eps) extras.push(`BPA: ${sanitize(sales.eps)}`);
        if (extras.length) {
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827').text(extras.join('  ·  '), margin, y, { lineBreak: false });
          y += 14;
        }
        y = drawNotes(doc, sales.notes, y);
        y = drawHorizontalRule(doc, y);
      }

      const cashFlow = horizon.cashFlow ?? {};
      if (Array.isArray(cashFlow.rows) && cashFlow.rows.length) {
        y = drawSectionTitle(doc, '2. CASH FLOW', y);
        let scenarios = Array.isArray(cashFlow.scenarios) ? [...cashFlow.scenarios] : [];
        if (scenarios.length === 0) {
          scenarios = ['Normal', 'Ajustado'];
        } else if (scenarios.length === 1) {
          scenarios = [scenarios[0], 'Ajustado'];
        }
        const header = ['Métrica', ...scenarios];
        const valWidth = (doc.page.width - 80 - 150) / scenarios.length;
        const colWidths = [150, ...Array(scenarios.length).fill(valWidth)];
        const cfRows = cashFlow.rows.map((row) => {
          let values = Array.isArray(row.values) && row.values.length ? [...row.values] : [row.value];
          if (values.length === 1 && scenarios.length === 2) {
            values.push(values[0]);
          }
          return [row.name, ...values];
        });
        y = drawTable(doc, header, cfRows, { startY: y, colWidths, rowHeight: 18, metaRows: cashFlow.rows, isCashFlow: true });
        const cfNotes = (Array.isArray(cashFlow.notes) ? cashFlow.notes : []).filter((n) => {
          const lower = String(n || '').toLowerCase();
          return !lower.includes('deducido del acumulado') && !lower.includes('flujo trimestral deducido');
        });
        y = drawNotes(doc, cfNotes, y);
        y = drawHorizontalRule(doc, y);
      }

      const capital = horizon.capital ?? {};
      if (Array.isArray(capital.rows) && capital.rows.length) {
        y = drawSectionTitle(doc, '3. ASIGNACIÓN DE CAPITAL', y);
        const capitalRows = capital.rows.map((row) => [row.name, row.value]);
        y = drawTable(doc, ['Métrica', 'Valor'], capitalRows, { startY: y, colWidths: [150, 365], rowHeight: 18, isCapital: true });
        if (capital.verification) {
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827').text(sanitize(capital.verification), margin, y);
          y += 14;
        }
        y = drawNotes(doc, capital.notes, y);
        y = drawHorizontalRule(doc, y);
      }

      y += 6;
    });

    // PARTE II y PARTE III para informes anuales (Form 10-K)
    if (report.conclusion || report.rating) {
      doc.addPage();
      y = doc.page.margins.top;

      const conclusion = report.conclusion || {};

      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text('PARTE II: INDAGACIÓN A FONDO Y CONCLUSIÓN', margin, y);
      y += 18;
      doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('Análisis detallado de recompras, outlook oficial, deuda y asignación de capital', margin, y);
      y += 18;
      y = drawHorizontalRule(doc, y);

      const ensureSpace = (needed) => {
        if (y + needed > doc.page.height - doc.page.margins.bottom - 20) {
          doc.addPage();
          y = doc.page.margins.top;
        }
      };

      // 1: Recompras
      if (conclusion.repurchases) {
        const rep = conclusion.repurchases;
        ensureSpace(60);
        y = drawSectionTitle(doc, rep.title || '1: RECOMPRAS', y);
        if (rep.text) {
          y = drawHighlightedText(doc, sanitize(rep.text), margin, y, { width: doc.page.width - margin * 2, baseSize: 8.5, baseColor: '#374151', boldColor: '#0f172a' }) + 8;
        }
        const repExpiry = (rep.authorizationExpiry && !/no indicad|not disclosed|not stated|no consta|no especificad/i.test(String(rep.authorizationExpiry)))
          ? rep.authorizationExpiry
          : null;
        const repBadges = [
          (rep.authorizationRemaining || rep.programRemaining) ? `Autorización restante: ${rep.authorizationRemaining || rep.programRemaining}` : null,
          repExpiry ? `Vigencia: ${repExpiry}` : null,
          rep.shareCountEvolution ? `Evolución acciones: ${rep.shareCountEvolution}` : null,
          rep.bpaImpact ? `Impacto BPA: ${rep.bpaImpact}` : null,
          rep.futureProjection ? `Proyección 5 años: ${rep.futureProjection}` : null,
        ].filter(Boolean);
        if (repBadges.length) {
          ensureSpace(20);
          repBadges.forEach((b) => {
            y = drawHighlightedText(doc, `• ${sanitize(b)}`, margin + 6, y, { width: doc.page.width - margin * 2 - 12, baseSize: 8, baseFont: 'Helvetica-Bold', baseColor: '#854d0e', boldFont: 'Helvetica-Bold', boldColor: '#7c2d12' }) + 3;
          });
          y += 5;
        }
        const repChart = buildSharesChartModel(rep.sharesHistory);
        if (repChart) {
          y = drawSharesChart(doc, repChart, y);
          y += 4;
        }
        if (rep.secSnippet) {
          y = drawPdfSecSnippet(doc, withAveragePriceRow(rep.secSnippet), y);
        }
        y = drawHorizontalRule(doc, y);
      }

      // 2: Outlook
      if (conclusion.outlook) {
        const out = conclusion.outlook;
        ensureSpace(60);
        y = drawSectionTitle(doc, out.title || '2: OUTLOOK', y);
        if (out.text) {
          y = drawPdfFormattedText(doc, out.text, margin, y, doc.page.width - margin * 2, 'Helvetica', 'Helvetica-Bold', 8.5, '#374151') + 8;
        }
        const outDetails = [
          out.fcfAnalysis ? `Análisis FCF: ${out.fcfAnalysis}` : null,
          out.riskFactors ? `Riesgos y Sensibilidad: ${out.riskFactors}` : null,
          out.efficiencyPlans ? `Programas de ahorro / eficiencia: ${out.efficiencyPlans}` : null,
        ].filter(Boolean);
        if (outDetails.length) {
          ensureSpace(20);
          outDetails.forEach((d) => {
            y = drawPdfFormattedText(doc, `• ${d}`, margin + 6, y, doc.page.width - margin * 2 - 12, 'Helvetica', 'Helvetica-Bold', 8, '#4b5563') + 3;
          });
          y += 5;
        }
        const outSnippet = out.secSnippet || out.secTable;
        if (outSnippet) {
          y = drawPdfSecSnippet(doc, withOutlookComparison(outSnippet, report), y);
        }
        y = drawHorizontalRule(doc, y);
      }

      // 3: Deuda
      if (conclusion.debt) {
        const debt = conclusion.debt;
        ensureSpace(60);
        y = drawSectionTitle(doc, debt.title || '3: DEUDA', y);
        if (debt.text) {
          y = drawPdfFormattedText(doc, debt.text, margin, y, doc.page.width - margin * 2, 'Helvetica', 'Helvetica-Bold', 8.5, '#374151') + 8;
        }

        // Gráfico 1: Calendario de vencimientos de la deuda (próximos 10 años)
        const maturityChart = buildDebtMaturityModel(debt, report?.fiscalYear);
        if (maturityChart) {
          y = drawDebtMaturityChart(doc, maturityChart, y);
        }

        // Gráfico 2: Evolución de deuda normal vs neta (últimos 10 años)
        const historyChart = buildDebtHistoryModel(debt, report);
        if (historyChart) {
          y = drawDebtHistoryChart(doc, historyChart, y);
        }

        // Análisis de refinanciación e impacto en BPA
        const refinancing = buildDebtRefinancingModel(debt, report);
        if (refinancing) {
          y = drawDebtRefinancingBox(doc, refinancing, y);
        } else if (debt.refinancingAnalysis || debt.refinancingImpact) {
          const boxWidth = doc.page.width - margin * 2;
          const boxPad = 6;
          const boxLabel = 'Refinanciación de deuda próxima a vencer:';
          const boxAnalysis = debt.refinancingAnalysis ? sanitize(debt.refinancingAnalysis) : null;
          const boxImpact = debt.refinancingImpact ? `Impacto intereses: ${sanitize(debt.refinancingImpact)}` : null;

          doc.font('Helvetica-Bold').fontSize(8);
          const labelH = doc.heightOfString(boxLabel, { width: boxWidth - 16 });
          doc.font('Helvetica').fontSize(7.5);
          const analysisH = boxAnalysis ? doc.heightOfString(boxAnalysis, { width: boxWidth - 16, lineBreak: true }) : 0;
          doc.font('Helvetica-Bold').fontSize(7.5);
          const impactH = boxImpact ? doc.heightOfString(boxImpact, { width: boxWidth - 16, lineBreak: true }) : 0;

          const boxHeight = boxPad + labelH + 6 + analysisH + (boxImpact ? 6 + impactH : 0) + boxPad;
          ensureSpace(boxHeight + 20);

          const boxStartY = y;
          doc.rect(margin, boxStartY, boxWidth, boxHeight).fill('#f8fafc');
          doc.rect(margin, boxStartY, 3, boxHeight).fill('#ea580c');

          let boxY = boxStartY + boxPad;
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text(boxLabel, margin + 8, boxY);
          boxY += labelH + 6;
          if (boxAnalysis) {
            drawPdfFormattedText(doc, boxAnalysis, margin + 8, boxY, boxWidth - 16, 'Helvetica', 'Helvetica-Bold', 7.5, '#334155');
            boxY += analysisH + 6;
          }
          if (boxImpact) {
            drawPdfFormattedText(doc, boxImpact, margin + 8, boxY, boxWidth - 16, 'Helvetica', 'Helvetica-Bold', 7.5, '#c2410c');
          }
          y = boxStartY + boxHeight + 12;
        }

        if (debt.secSnippet) {
          y = drawPdfSecSnippet(doc, debt.secSnippet, y);
        }
        y = drawHorizontalRule(doc, y);
      }

      // 4: Adquisiciones
      if (conclusion.acquisitions) {
        const acq = conclusion.acquisitions;
        ensureSpace(40);
        y = drawSectionTitle(doc, acq.title || '4: ADQUISICIONES', y);
        doc.font('Helvetica').fontSize(8.5).fillColor('#374151').text(sanitize(acq.text || 'No se realizaron adquisiciones materiales durante el ejercicio.'), margin, y, { width: doc.page.width - margin * 2, lineBreak: true });
        y = doc.y + 8;
        y = drawHorizontalRule(doc, y);
      }

      // 5: Watchlist
      if (conclusion.watchlist && Array.isArray(conclusion.watchlist.items) && conclusion.watchlist.items.length) {
        ensureSpace(50);
        y = drawSectionTitle(doc, conclusion.watchlist.title || 'COSAS A TENER EN CUENTA', y);
        conclusion.watchlist.items.forEach((item) => {
          ensureSpace(16);
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#16a34a').text('OK', margin + 6, y, { continued: true });
          doc.font('Helvetica').fontSize(8).fillColor('#374151').text(`  ${sanitize(item)}`, { width: doc.page.width - margin * 2 - 20, lineBreak: true });
          y = doc.y + 4;
        });
        y += 6;
        y = drawHorizontalRule(doc, y);
      }

      // Parte III: Nota de Resultados
      if (report.rating && report.rating.score != null) {
        const score = Number(report.rating.score);
        const bannerWidth = doc.page.width - margin * 2;
        const bannerBg = score >= 7 ? '#dcfce7' : (score >= 4 ? '#fef9c3' : '#fee2e2');
        const bannerBorder = score >= 7 ? '#16a34a' : (score >= 4 ? '#ca8a04' : '#dc2626');
        const bannerText = score >= 7 ? '#14532d' : (score >= 4 ? '#713f12' : '#7f1d1d');

        const labelText = sanitize(report.rating.label || `NOTA DE RESULTADOS: ${score}`);
        const rationaleText = report.rating.rationale ? sanitize(report.rating.rationale) : null;
        const disclaimerText = 'Nota puramente financiera basada exclusivamente en cuentas del año, outlook oficial y asignación de capital. Sin especulación futura.';

        const padTop = 8;
        const padBottom = 8;
        const gap = 4;

        doc.font('Helvetica-Bold').fontSize(12);
        const labelH = doc.heightOfString(labelText, { width: bannerWidth - 24 - 92 });
        doc.font('Helvetica').fontSize(8);
        const rationaleH = rationaleText ? doc.heightOfString(rationaleText, { width: bannerWidth - 24, lineBreak: true }) : 0;
        doc.font('Helvetica-Oblique').fontSize(6.5);
        const disclaimerH = doc.heightOfString(disclaimerText, { width: bannerWidth - 24, lineBreak: true });

        const bannerHeight = padTop
          + Math.max(labelH, 20)
          + (rationaleText ? gap + rationaleH : 0)
          + gap
          + disclaimerH
          + padBottom;

        ensureSpace(bannerHeight + 20);
        doc.rect(margin, y, bannerWidth, bannerHeight).fill(bannerBg);
        doc.rect(margin, y, bannerWidth, bannerHeight).lineWidth(1.5).strokeColor(bannerBorder).stroke();

        let innerY = y + padTop;
        doc.font('Helvetica-Bold').fontSize(12).fillColor(bannerText).text(labelText, margin + 12, innerY, { width: bannerWidth - 24 - 92 });
        doc.font('Helvetica-Bold').fontSize(16).fillColor(bannerText).text(`${score} / 10`, margin + bannerWidth - 80, innerY - 1, { width: 70, align: 'right' });
        innerY += Math.max(labelH, 20);

        if (rationaleText) {
          innerY += gap;
          doc.font('Helvetica').fontSize(8).fillColor('#1e293b').text(rationaleText, margin + 12, innerY, { width: bannerWidth - 24, lineBreak: true });
          innerY += rationaleH;
        }

        innerY += gap;
        doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#64748b').text(disclaimerText, margin + 12, innerY, { width: bannerWidth - 24, lineBreak: true });

        y = y + bannerHeight + 14;
      }
    }

    doc.font('Helvetica').fontSize(8).fillColor('#9ca3af').text('Generado por Cifra · beta 0.1 · La IA ordena la información. Tú decides qué significa.', margin, doc.page.height - doc.page.margins.bottom - 14);

    doc.end();
  });
}

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
