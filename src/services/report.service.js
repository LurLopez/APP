import PDFDocument from 'pdfkit';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReportHtml, buildReportDocx, buildReportOdt, withAveragePriceRow, buildSharesChartModel } from './reportExport.service.js';

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
  const hasMetrics = Array.isArray(chart.metrics) && chart.metrics.length;
  const metricsH = hasMetrics ? 26 : 0;
  const chartHeight = 26 + chart.points.length * 16 + metricsH;
  if (y + chartHeight > doc.page.height - doc.page.margins.bottom - 20) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  doc.rect(margin, y, pageWidth, chartHeight).fill('#f8fafc');
  doc.rect(margin, y, pageWidth, chartHeight).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text(sanitize(chart.title), margin + 8, y + 5, { width: pageWidth - 16 });

  const labelW = 42;
  const valueW = 52;
  const trackX = margin + 8 + labelW;
  const trackW = pageWidth - 16 - labelW - valueW;
  const last = chart.points[chart.points.length - 1];
  let barY = y + 16;
  chart.points.forEach((p) => {
    const pct = Math.max(0.04, p.shares / chart.max);
    const barW = trackW * pct;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#334155').text(String(p.year), margin + 8, barY + 1, { width: labelW });
    doc.rect(trackX, barY, trackW, 10).fill('#e2e8f0');
    const isCurrent = p === last;
    doc.rect(trackX, barY, Math.max(2, barW), 10).fill(isCurrent ? '#f59e0b' : '#38bdf8');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text(`${String(p.shares).replace('.', ',')}M`, trackX + trackW + 4, barY + 1, { width: valueW });
    barY += 16;
  });
  if (hasMetrics) {
    barY += 4;
    doc.moveTo(margin + 8, barY).lineTo(margin + pageWidth - 8, barY).lineWidth(0.5).dash(2, 2).strokeColor('#cbd5e1').stroke();
    doc.undash();
    barY += 6;
    chart.metrics.forEach((m) => {
      const pctStr = `${m.pct < 0 ? '' : '-'}${m.pct.toFixed(1).replace('.', ',')} %`;
      const bpaStr = `+${m.bpa.toFixed(1).replace('.', ',')} %`;
      const labelWide = pageWidth * 0.48;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#475569').text(sanitize(m.label) + ':', margin + 8, barY, { width: labelWide });
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#b91c1c').text(pctStr, margin + 8 + labelWide, barY, { width: 62 });
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#64748b').text(`(impacto en BPA ${bpaStr})`, margin + 8 + labelWide + 66, barY, { width: pageWidth - 16 - 66 - labelWide });
      barY += 11;
    });
    barY += 3;
  }
  return barY + 4;
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

function drawPdfSecSnippet(doc, snippet, y) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return y;
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin * 2;

  if (y + 50 > doc.page.height - doc.page.margins.bottom) {
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
    y += 12;
  }

  const headers = Array.isArray(snippet.headers) ? snippet.headers : [];
  const rows = snippet.rows.map((r) => Array.isArray(r) ? r.map(sanitize) : [sanitize(r.metric ?? r.name), sanitize(r.value)]);
  const numCols = headers.length || (rows[0] ? rows[0].length : 2);
  const firstColWidth = numCols === 2 ? 220 : 160;
  const remainingWidth = (pageWidth - firstColWidth) / Math.max(1, numCols - 1);
  const colWidths = [firstColWidth, ...Array(numCols - 1).fill(remainingWidth)];

  if (headers.length) {
    doc.rect(margin, y, pageWidth, 15).fill('#1e293b');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
    let curX = margin;
    headers.forEach((h, i) => {
      doc.text(sanitize(h), curX + 4, y + 4, { width: colWidths[i] - 8 });
      curX += colWidths[i];
    });
    y += 15;
  }

  rows.forEach((row, rIdx) => {
    let rowHeight = 15;
    row.forEach((cellText, cIdx) => {
      const cellH = doc.fontSize(7.5).font(cIdx === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .heightOfString(sanitize(cellText), { width: colWidths[cIdx] - 8 });
      rowHeight = Math.max(rowHeight, cellH + 9);
    });
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 15) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    const isOdd = rIdx % 2 === 1;
    if (isOdd) doc.rect(margin, y, pageWidth, rowHeight).fill('#f8fafc');

    const rowText = row.join(' ').toLowerCase();
    const isYellow = rowText.includes('repurchased') || rowText.includes('recomprad') || rowText.includes('2026');
    const isOrange = rowText.includes('aggregate') || rowText.includes('cost');

    let curX = margin;
    row.forEach((cellText, cIdx) => {
      if (cIdx > 0 && isYellow) {
        doc.rect(curX + 1, y + 1, colWidths[cIdx] - 2, rowHeight - 2).fill('#fef08a');
        doc.fillColor('#854d0e').font('Helvetica-Bold');
      } else if (cIdx > 0 && isOrange) {
        doc.rect(curX + 1, y + 1, colWidths[cIdx] - 2, rowHeight - 2).fill('#fed7aa');
        doc.fillColor('#c2410c').font('Helvetica-Bold');
      } else {
        doc.fillColor('#1e293b').font(cIdx === 0 ? 'Helvetica-Bold' : 'Helvetica');
      }
      doc.fontSize(7.5).text(sanitize(cellText), curX + 4, y + 4, { width: colWidths[cIdx] - 8 });
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
        const repBadges = [
          (rep.authorizationRemaining || rep.programRemaining) ? `Autorización restante: ${rep.authorizationRemaining || rep.programRemaining}` : null,
          rep.authorizationExpiry ? `Vigencia: ${rep.authorizationExpiry}` : null,
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
          doc.font('Helvetica').fontSize(8.5).fillColor('#374151').text(sanitize(out.text), margin, y, { width: doc.page.width - margin * 2, lineBreak: true });
          y = doc.y + 8;
        }
        const outDetails = [
          out.fcfAnalysis ? `Análisis FCF: ${out.fcfAnalysis}` : null,
          out.riskFactors ? `Riesgos y Sensibilidad: ${out.riskFactors}` : null,
          out.efficiencyPlans ? `Programas de ahorro / eficiencia: ${out.efficiencyPlans}` : null,
        ].filter(Boolean);
        if (outDetails.length) {
          ensureSpace(20);
          doc.font('Helvetica').fontSize(8).fillColor('#4b5563');
          outDetails.forEach((d) => {
            doc.text(`• ${sanitize(d)}`, margin + 6, y, { width: doc.page.width - margin * 2 - 12 });
            y = doc.y + 3;
          });
          y += 5;
        }
        if (out.secSnippet) {
          y = drawPdfSecSnippet(doc, out.secSnippet, y);
        }
        y = drawHorizontalRule(doc, y);
      }

      // 3: Deuda
      if (conclusion.debt) {
        const debt = conclusion.debt;
        ensureSpace(60);
        y = drawSectionTitle(doc, debt.title || '3: DEUDA', y);
        if (debt.text) {
          doc.font('Helvetica').fontSize(8.5).fillColor('#374151').text(sanitize(debt.text), margin, y, { width: doc.page.width - margin * 2, lineBreak: true });
          y = doc.y + 8;
        }
        if (debt.refinancingAnalysis || debt.refinancingImpact) {
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
            doc.font('Helvetica').fontSize(7.5).fillColor('#334155').text(boxAnalysis, margin + 8, boxY, { width: boxWidth - 16, lineBreak: true });
            boxY += analysisH + 6;
          }
          if (boxImpact) {
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#c2410c').text(boxImpact, margin + 8, boxY, { width: boxWidth - 16, lineBreak: true });
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
