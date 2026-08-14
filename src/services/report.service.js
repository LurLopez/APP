import PDFDocument from 'pdfkit';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GENERATED_DIR = path.join(__dirname, '..', '..', 'uploads', 'generated');

function sanitize(value) {
  if (value === null || value === undefined) return '—';
  return String(value).replaceAll('−', '-');
}

function drawTable(doc, columns, rows, options = {}) {
  const { startY, colWidths, nameColWidth = 140, headerBg = '#1f2937', headerColor = '#ffffff' } = options;
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin * 2;
  const nameWidth = colWidths ? colWidths[0] : nameColWidth;
  const valueWidths = colWidths ? colWidths.slice(1) : Array(columns.length - 1).fill((pageWidth - nameWidth) / Math.max(1, columns.length - 1));
  const tableWidth = nameWidth + valueWidths.reduce((a, b) => a + b, 0);
  const rowHeight = options.rowHeight ?? 18;
  let y = startY;

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
      doc.text(col, x + 4, y + 5, { width: valueWidths[i] - 8, height: rowHeight - 4 });
      x += valueWidths[i];
    });
    y += rowHeight;
  };

  drawHeaderRow();

  rows.forEach((row, index) => {
    ensureSpace(rowHeight);
    if (index % 2 === 0) {
      doc.rect(margin, y, tableWidth, rowHeight).fill('#f3f4f6');
    }
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(7.5);
    let x = margin;
    doc.text(sanitize(row[0]), x + 4, y + 5, { width: nameWidth - 8, height: rowHeight - 4 });
    x += nameWidth;
    row.slice(1).forEach((cell, i) => {
      doc.fillColor('#111827').font('Helvetica').fontSize(7.5);
      doc.text(sanitize(cell), x + 4, y + 5, { width: valueWidths[i] - 8, height: rowHeight - 4 });
      x += valueWidths[i];
    });
    y += rowHeight;
  });

  return y + 8;
}

function drawSectionTitle(doc, title, y) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(title, doc.page.margins.left, y + 6);
  return y + 22;
}

function drawNotes(doc, notes, y) {
  let currentY = y;
  (notes ?? []).filter(Boolean).forEach((note) => {
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#6b7280');
    currentY = doc.text(sanitize(note), doc.page.margins.left, currentY, { width: doc.page.width - 80, lineBreak: true }).y + 3;
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
      if (y > doc.page.height - 120) {
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
        const scenarios = Array.isArray(cashFlow.scenarios) ? cashFlow.scenarios : [];
        const header = ['Métrica', ...(scenarios.length ? scenarios : ['Valor'])];
        const width = scenarios.length > 1 ? (doc.page.width - 80 - 150) / 2 : doc.page.width - 80 - 150;
        const colWidths = [150, width, width];
        const cfRows = cashFlow.rows.map((row) => {
          const values = Array.isArray(row.values) && row.values.length ? row.values : [row.value];
          return [row.name, ...values];
        });
        y = drawTable(doc, header, cfRows, { startY: y, colWidths, rowHeight: 18 });
        y = drawNotes(doc, cashFlow.notes, y);
        y = drawHorizontalRule(doc, y);
      }

      const capital = horizon.capital ?? {};
      if (Array.isArray(capital.rows) && capital.rows.length) {
        y = drawSectionTitle(doc, '3. ASIGNACIÓN DE CAPITAL', y);
        const capitalRows = capital.rows.map((row) => [row.name, row.value]);
        y = drawTable(doc, ['Métrica', 'Valor'], capitalRows, { startY: y, colWidths: [150, 365], rowHeight: 18 });
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

export async function saveReportPdf(buffer) {
  const filename = `${randomUUID()}.pdf`;
  const filePath = path.join(GENERATED_DIR, filename);
  await mkdir(GENERATED_DIR, { recursive: true });
  await writeFile(filePath, buffer);
  return { filename, url: `/api/reports/${filename}` };
}

export async function generateReportPdf(report) {
  const buffer = await buildReportPdf(report);
  return saveReportPdf(buffer);
}
