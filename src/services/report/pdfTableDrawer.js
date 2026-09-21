/**
 * @fileoverview Renderizado de tablas financieras estructuradas (Ventas, Cash Flow, Asignación de Capital) en PDF.
 * @module services/report/pdfTableDrawer
 */

import { sanitize, getPdfHighlightColor } from './pdfStyles.js';

/**
 * Dibuja una tabla financiera con soporte para saltos de página automáticos, filas cebra y resaltados.
 * @param {PDFKit.PDFDocument} doc - Instancia del documento PDFKit.
 * @param {string[]} columns - Lista de nombres de columnas.
 * @param {Array<string[]>} rows - Matriz de celdas por fila.
 * @param {object} [options={}] - Parámetros de posicionamiento, estilos y metadatos.
 * @returns {number} Coordenada Y final tras pintar la tabla.
 */
export function drawTable(doc, columns, rows, options = {}) {
  const { startY, colWidths, nameColWidth = 140, headerBg = '#1f2937', headerColor = '#ffffff', metaRows = [], isCapital = false, isCashFlow = false } = options;
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin * 2;
  const nameWidth = colWidths ? colWidths[0] : nameColWidth;
  const valueWidths = colWidths ? colWidths.slice(1) : Array(columns.length - 1).fill((pageWidth - nameWidth) / Math.max(1, columns.length - 1));
  const tableWidth = nameWidth + valueWidths.reduce((a, b) => a + b, 0);
  const rowHeight = options.rowHeight ?? 18;
  let y = startY;

  if (y + rowHeight * 3 > doc.page.height - doc.page.margins.bottom - 10 && y > doc.page.margins.top + 10) {
    doc.addPage();
    y = doc.page.margins.top;
  }

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

  const ensureSpace = (needed) => {
    if (y + needed > doc.page.height - doc.page.margins.bottom - 20 && y > doc.page.margins.top + 10) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeaderRow();
    }
  };

  drawHeaderRow();

  const isSalesTable = options.isSales === true;
  const isCapitalTable = isCapital === true || options.isCapital === true;
  const isCashFlowTable = isCashFlow === true;
  const boldColumns = Array.isArray(options.boldColumns) ? options.boldColumns : [1];
  const pctColumns = Array.isArray(options.pctColumns) ? options.pctColumns : [];

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
    if (noteMatch) noteNum = parseInt(noteMatch[1], 10);
    const colorScheme = getPdfHighlightColor(noteNum);

    row.slice(1).forEach((cellValue, i) => {
      const colIdx = i + 1;
      const isBoldCol = boldColumns.includes(colIdx);
      const isPctCol = pctColumns.includes(colIdx);
      const isAdjustedCell = isSalesTable && i === 0 && isRowAdjusted;
      const isTaxAdjustedCell = isCashFlowTable && i === 1 && meta.cashFlowAdjustedNote;
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
      } else if (isPctCol && cellValue) {
        const str = String(cellValue).trim();
        if (str.startsWith('-')) textColor = '#dc2626';
        else if (str.startsWith('+') || /^[0-9]/.test(str)) textColor = '#16a34a';
      } else if (isCapitalCell && cellValue) {
        const str = String(cellValue).trim();
        if (str.startsWith('-')) textColor = '#dc2626';
        else if (str.startsWith('+') || (/^[0-9]/.test(str) && str !== '0')) textColor = '#16a34a';
      }

      doc.fillColor(textColor).font(fontName).fontSize(7.5);
      doc.text(sanitize(cellValue), x + 4, y + 5, { width: valueWidths[i] - 8, height: rowHeight - 4 });
      x += valueWidths[i];
    });
    y += rowHeight;
  });

  return y + 8;
}
