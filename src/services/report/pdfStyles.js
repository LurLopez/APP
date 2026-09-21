/**
 * @fileoverview Utilidades tipográficas, paletas de color y primitivas de texto para renderizado PDF con PDFKit.
 * @module services/report/pdfStyles
 */

export const PDF_SAFE_CHARS = [
  ['−', '-'],
  ['Δ', 'Delta'],
  ['×', 'x'],
  ['→', '->'],
  ['✓', 'OK'],
  ['±', '+/-'],
  ['≤', '<='],
  ['≥', '>='],
  ['≈', '~'],
];

/**
 * Sanea texto para evitar caracteres incompatibles con fuentes estándar de PDFKit.
 * @param {unknown} value - Valor textual.
 * @returns {string} Cadena saneada.
 */
export function sanitize(value) {
  if (value === null || value === undefined) return '—';
  let str = String(value);
  str = str.replace(/\*\*(.+?)\*\*/gs, '$1').replace(/\*\*/g, '');
  for (const [from, to] of PDF_SAFE_CHARS) str = str.replaceAll(from, to);
  return str;
}

export const PDF_HIGHLIGHT_PALETTE = [
  { bg: '#fef08a', text: '#854d0e' }, // 1: Amarillo
  { bg: '#fed7aa', text: '#c2410c' }, // 2: Naranja
  { bg: '#bbf7d0', text: '#15803d' }, // 3: Verde lima
  { bg: '#e9d5ff', text: '#7e22ce' }, // 4: Morado / Malva
  { bg: '#bae6fd', text: '#0369a1' }, // 5: Celeste pastel
  { bg: '#fbcfe8', text: '#be185d' }, // 6: Rosa pastel
];

/**
 * Retorna el esquema de colores para una llamada de nota (*N).
 * @param {string|number} noteNumber - Número de la nota.
 * @returns {{bg: string, text: string}} Esquema de colores.
 */
export function getPdfHighlightColor(noteNumber) {
  const num = parseInt(noteNumber, 10);
  if (isNaN(num) || num < 1) return PDF_HIGHLIGHT_PALETTE[0];
  return PDF_HIGHLIGHT_PALETTE[(num - 1) % PDF_HIGHLIGHT_PALETTE.length];
}

export function tokenizeNumbersPdf(text) {
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

export function drawHighlightedText(doc, text, x, y, { width, baseFont = 'Helvetica', baseSize = 8.5, baseColor = '#374151', boldFont = 'Helvetica-Bold', boldColor = '#0f172a' } = {}) {
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

export function parseMarkdownAndNumbers(text) {
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

export function drawPdfFormattedText(doc, text, x, y, width, baseFont = 'Helvetica', boldFont = 'Helvetica-Bold', fontSize = 8.5, color = '#374151') {
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

export function drawSectionTitle(doc, title, y, minSpace = 130) {
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  if (y + minSpace > pageBottom - 10 && y > doc.page.margins.top + 10) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(title, doc.page.margins.left, y + 6);
  return y + 22;
}

export function drawNotes(doc, notes, y, options = {}) {
  let currentY = y;
  const filtered = (notes ?? []).filter(Boolean);
  if (!filtered.length) return currentY;

  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const left = doc.page.margins.left;
  const availablePageWidth = doc.page.width - left * 2;

  filtered.forEach((note) => {
    const raw = sanitize(note);
    const match = raw.match(/^\*(\d+):?\s*([\s\S]*)$/);
    if (match) {
      const num = match[1];
      const marker = `*${num}:`;
      const rest = match[2];
      const colorNum = (options.isCashFlow && (num === '3' || num === 3)) ? '2' : num;
      const colorScheme = getPdfHighlightColor(colorNum);

      doc.font('Helvetica-Bold').fontSize(7.5);
      const markerWidth = doc.widthOfString(marker) + 6;
      const textWidth = availablePageWidth - markerWidth - 4;

      doc.font('Helvetica').fontSize(7.5);
      const textHeight = doc.heightOfString(rest, { width: textWidth });
      const itemHeight = Math.max(12, textHeight + 4);

      if (currentY + itemHeight > pageBottom - 10 && currentY > doc.page.margins.top + 10) {
        doc.addPage();
        currentY = doc.page.margins.top;
      }

      const noteTop = currentY;
      doc.rect(left, noteTop, markerWidth, 10).fill(colorScheme.bg);
      doc.fillColor(colorScheme.text).font('Helvetica-Bold').fontSize(7.5).text(marker, left + 3, noteTop + 1.5, { lineBreak: false });
      doc.fillColor('#4b5563').font('Helvetica').fontSize(7.5).text(rest, left + markerWidth + 4, noteTop + 1.5, {
        width: textWidth,
        lineBreak: true,
      });
      currentY = Math.max(doc.y, noteTop + 10) + 4;
    } else {
      doc.font('Helvetica-Oblique').fontSize(7.5);
      const textHeight = doc.heightOfString(raw, { width: availablePageWidth });
      const itemHeight = textHeight + 4;

      if (currentY + itemHeight > pageBottom - 10 && currentY > doc.page.margins.top + 10) {
        doc.addPage();
        currentY = doc.page.margins.top;
      }

      const noteTop = currentY;
      doc.fillColor('#6b7280').text(raw, left, noteTop, { width: availablePageWidth, lineBreak: true });
      currentY = doc.y + 4;
    }
  });
  return currentY + 4;
}

export function drawHorizontalRule(doc, y) {
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  if (y >= pageBottom - 15) return y;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.left, y).lineWidth(0.5).strokeColor('#d1d5db').stroke();
  return y + 10;
}
