/**
 * @fileoverview Renderizado de extractos oficiales SEC (tablas Form 10-K y notas a los estados financieros).
 * @module services/report/pdfSnippetDrawer
 */

import { sanitize } from './pdfStyles.js';

/**
 * Dibuja un extracto oficial SEC en el documento PDFKit.
 * @param {PDFKit.PDFDocument} doc - Documento PDFKit activo.
 * @param {object} snippet - Objeto con filas, encabezados y metadatos del extracto SEC.
 * @param {number} y - Coordenada vertical Y de inicio.
 * @returns {number} Coordenada Y final tras pintar el extracto.
 */
export function drawPdfSecSnippet(doc, snippet, y) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return y;
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin * 2;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  const headers = Array.isArray(snippet.headers) ? snippet.headers : [];
  const rows = snippet.rows.map((r) => (Array.isArray(r) ? r.map(sanitize) : [sanitize(r.metric ?? r.name), sanitize(r.value)]));
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

  let headerH = 16;
  if (headers.length) {
    doc.font('Helvetica-Bold').fontSize(7.5);
    headers.forEach((h, i) => {
      const hh = doc.heightOfString(sanitize(h), { width: colWidths[i] - 8 });
      headerH = Math.max(headerH, hh + 8);
    });
  }

  const minStartSpace = 32 + headerH + 60;
  if (y + minStartSpace > pageBottom && y > doc.page.margins.top + 10) {
    doc.addPage();
    y = doc.page.margins.top;
  }

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

  const isRepurchaseTable = /repurchase|recompra/i.test(String(snippet.title || ''))
    || rows.some((row) => /shares repurchased|aggregate cost|average price paid|recompras bajo|coste agregado/i.test(String(row?.[0] ?? '')));
  let repurchaseLatestIdx = 1;
  {
    let bestYear = -Infinity;
    headers.forEach((header, i) => {
      if (i === 0) return;
      const match = String(header).match(/(20\d\d)/);
      if (match && Number(match[1]) > bestYear) {
        bestYear = Number(match[1]);
        repurchaseLatestIdx = i;
      }
    });
  }

  rows.forEach((row, rIdx) => {
    let rowHeight = 16;
    row.forEach((cellText, cIdx) => {
      const cellH = doc.fontSize(7.5).font(cIdx === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .heightOfString(sanitize(cellText), { width: colWidths[cIdx] - 8 });
      rowHeight = Math.max(rowHeight, cellH + 9);
    });
    if (y + rowHeight > pageBottom - 15 && y > doc.page.margins.top + 10) {
      doc.addPage();
      y = doc.page.margins.top;
      drawSnippetHeaderRow();
    }
    if (rIdx % 2 === 1) doc.rect(margin, y, pageWidth, rowHeight).fill('#f8fafc');

    const rowText = row.join(' ').toLowerCase();
    const isYellow = rowText.includes('repurchased') || rowText.includes('recomprad');
    const isOrange = rowText.includes('aggregate') || rowText.includes('cost');

    let curX = margin;
    row.forEach((cellText, cIdx) => {
      let font = cIdx === 0 ? 'Helvetica-Bold' : 'Helvetica';
      let textColor = '#1e293b';

      if (isRepurchaseTable) {
        if (cIdx === repurchaseLatestIdx) {
          doc.rect(curX + 1, y + 1, colWidths[cIdx] - 2, rowHeight - 2).fill('#f0fdfa');
          textColor = '#0d9488';
          font = 'Helvetica-Bold';
        } else if (cIdx > 0) font = 'Helvetica-Bold';
      } else if (numCols === 4) {
        if (cIdx === 1) {
          doc.rect(curX + 1, y + 1, colWidths[cIdx] - 2, rowHeight - 2).fill('#f8fafc');
          textColor = '#475569';
          font = 'Helvetica-Bold';
        } else if (cIdx === 2) font = 'Helvetica-Bold';
        else if (cIdx === 3) {
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
      } else if (cIdx > 0) font = 'Helvetica-Bold';

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
