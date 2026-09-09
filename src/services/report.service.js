import PDFDocument from 'pdfkit';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReportHtml, buildReportDocx, buildReportOdt } from './reportExport.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GENERATED_DIR = path.join(__dirname, '..', '..', 'uploads', 'generated');

function sanitize(value) {
  if (value === null || value === undefined) return '—';
  return String(value).replaceAll('−', '-');
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
      doc.rect(x + 2, y + 2, Math.min(nameWidth - 4, textWidth), rowHeight - 4).fill(colorScheme.bg);
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
