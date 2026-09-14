/**
 * @fileoverview Generador de documentos Word (.docx) en formato OpenXML nativo.
 * @module services/reportExport/docxExporter
 */

import JSZip from 'jszip';
import { esc, hex, parseRichSegments, CHART_IMAGE_SLOTS, COLORS } from './exportColors.js';
import { buildDebtRefinancingBadges } from './debtHistoryRefinancingModel.js';
import { buildSharesChartTable } from './sharesModel.js';
import { buildDebtMaturityTable } from './debtMaturityModel.js';
import { buildDebtHistoryTable } from './debtHistoryRefinancingModel.js';
import { buildReportChartImages } from './chartImages.js';
import { buildReportModel } from './reportModel.js';

function docxRun(text, { size, bold, italic, color, highlight } = {}) {
  const rPr = [
    bold ? '<w:b/>' : '',
    italic ? '<w:i/>' : '',
    color ? `<w:color w:val="${hex(color)}"/>` : '',
    highlight ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(highlight)}"/>` : '',
    size ? `<w:sz w:val="${Math.round(size * 2)}"/>` : '',
  ].join('');
  return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function docxParagraph(text, opts = {}) {
  const pPr = `${opts.pageBreakBefore ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 40}"/>`;
  return `<w:p><w:pPr>${pPr}</w:pPr>${docxRun(text, opts)}</w:p>`;
}

function docxRichParagraph(text, opts = {}) {
  const pPr = `${opts.pageBreakBefore ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 40}"/>`;
  const runs = parseRichSegments(text).map((seg) => docxRun(seg.text, {
    size: opts.size ?? 8.5,
    bold: seg.bold ? true : (opts.bold ?? false),
    italic: opts.italic,
    color: seg.bold ? (opts.boldColor ?? '#0f172a') : (opts.color ?? COLORS.ink),
  })).join('');
  return `<w:p><w:pPr>${pPr}</w:pPr>${runs}</w:p>`;
}

function docxTable(table) {
  const totalRelative = table.widths.reduce((a, b) => a + b, 0);
  const available = 10466;
  const colWidths = table.widths.map((w) => Math.max(600, Math.round((w / totalRelative) * available)));
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${hex(COLORS.rule)}"/>`).join('');

  const headerRow = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${table.headers.map((h, i) => `
  <w:tc><w:tcPr><w:tcW w:w="${colWidths[i]}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${hex(h.bg ?? COLORS.headerBg)}"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${docxRun(h.text, { size: 7.5, bold: true, color: h.color ?? COLORS.headerColor })}</w:p></w:tc>`).join('')}</w:tr>`;

  const bodyRows = table.rows.map((row) => `<w:tr>${row.map((c, i) => `
  <w:tc><w:tcPr><w:tcW w:w="${colWidths[i]}" w:type="dxa"/>${c.bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(c.bg)}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${docxRun(c.text, { size: 7.5, bold: c.bold, color: c.color ?? COLORS.ink })}</w:p></w:tc>`).join('')}</w:tr>`).join('');

  return `<w:tbl><w:tblPr><w:tblW w:w="${available}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${colWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${headerRow}${bodyRows}</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`;
}

function docxNotes(notes) {
  return (notes ?? []).map((note) => {
    if (note.marker) {
      return `<w:p><w:pPr><w:spacing w:before="0" w:after="40"/></w:pPr>${docxRun(note.marker, { size: 7.5, bold: true, color: note.color, highlight: note.bg })}${docxRun(` ${note.text}`, { size: 7.5, color: COLORS.noteText })}</w:p>`;
    }
    return `<w:p><w:pPr><w:spacing w:before="0" w:after="40"/></w:pPr>${docxRun(note.text, { size: 7.5, italic: true, color: note.color })}</w:p>`;
  }).join('');
}

function docxImageParagraph(image, relId, ids, opts = {}) {
  if (!image) return '';
  ids.image += 1;
  const id = ids.image;
  const available = 10466;
  const cx = available * 635;
  const cy = Math.round(cx * (image.height / image.width));
  return `<w:p><w:pPr><w:spacing w:before="${opts.before ?? 40}" w:after="${opts.after ?? 80}"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Grafico${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${relId}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function docxRefinancingBox(refinancing) {
  if (!refinancing) return '';
  const badges = buildDebtRefinancingBadges(refinancing);
  const tableWidth = 10046;
  const tileWidth = Math.floor((tableWidth - (badges.length - 1) * 40) / badges.length);
  const tiles = badges.map((badge) => `
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="${tileWidth}" w:type="dxa"/>
        <w:shd w:val="clear" w:color="auto" w:fill="${badge.highlight ? 'FED7AA' : 'FFEDD5'}"/>
        <w:vAlign w:val="center"/>
        <w:tcMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tcMar>
      </w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>${docxRun(badge.label, { size: 6.5, color: badge.highlight ? '#7C2D12' : '#9A3412' })}</w:p>
      <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>${docxRun(badge.val, { size: 8, bold: true, color: badge.highlight ? '#7C2D12' : '#431407' })}</w:p>
    </w:tc>`).join('');
  const noBorder = ['top', 'bottom', 'right', 'insideH', 'insideV'].map((side) => `<w:${side} w:val="none" w:sz="0" w:space="0" w:color="auto"/>`).join('');
  const innerTable = `<w:tbl><w:tblPr><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${noBorder}</w:tblBorders><w:tblCellMar><w:top w:w="20" w:type="dxa"/><w:left w:w="20" w:type="dxa"/><w:bottom w:w="20" w:type="dxa"/><w:right w:w="20" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${badges.map(() => `<w:gridCol w:w="${tileWidth}"/>`).join('')}</w:tblGrid><w:tr>${tiles}</w:tr></w:tbl>`;
  const content = [
    `<w:p><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr>${docxRun('Refinanciación de deuda e impacto en BPA:', { size: 8.5, bold: true, color: '#9A3412' })}</w:p>`,
    innerTable,
    refinancing.explanation ? docxRichParagraph(refinancing.explanation, { size: 8, color: '#431407', after: 40, before: 80 }) : '',
    refinancing.impactExplanation ? docxRichParagraph(refinancing.impactExplanation, { size: 8, color: '#C2410C', boldColor: '#C2410C', after: 40, before: 40 }) : '',
    '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>',
  ].join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="10466" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:shd w:val="clear" w:color="auto" w:fill="FFF7ED"/><w:tblBorders><w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="28" w:space="0" w:color="EA580C"/><w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/></w:tblBorders><w:tblCellMar><w:top w:w="120" w:type="dxa"/><w:left w:w="220" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="10466"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="10466" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="FFF7ED"/></w:tcPr>${content}</w:tc></w:tr></w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`;
}

function appendCardsToDocx(parts, cards, images, ids) {
  cards.forEach((card, cardIndex) => {
    parts.push(docxParagraph(card.title, { size: 11, bold: true, color: COLORS.ink, after: 40, before: 60, pageBreakBefore: cardIndex > 0 }));
    if (card.text) parts.push(docxRichParagraph(card.text, { size: 8.5, color: COLORS.ink, after: 40 }));
    if (card.badges?.length) card.badges.forEach((b) => parts.push(docxRichParagraph(`• ${b}`, { size: 8, color: '#854D0E', boldColor: '#7C2D12', after: 20 })));
    if (card.chart) {
      parts.push(docxParagraph(card.chart.title, { size: 8, bold: true, color: '#475569', after: 40 }));
      if (images.shares) parts.push(docxImageParagraph(images.shares, CHART_IMAGE_SLOTS.shares.relId, ids));
      else { const ct = buildSharesChartTable(card.chart); if (ct) parts.push(docxTable(ct)); }
    }
    if (card.debtMaturityChart) {
      parts.push(docxParagraph(card.debtMaturityChart.title, { size: 8, bold: true, color: '#475569', after: 40, before: 60 }));
      if (images.debtMaturity) parts.push(docxImageParagraph(images.debtMaturity, CHART_IMAGE_SLOTS.debtMaturity.relId, ids));
      else { const mt = buildDebtMaturityTable(card.debtMaturityChart); if (mt) parts.push(docxTable(mt)); }
    }
    if (card.debtHistoryChart) {
      parts.push(docxParagraph(card.debtHistoryChart.title, { size: 8, bold: true, color: '#475569', after: 40, before: 60 }));
      if (images.debtHistory) parts.push(docxImageParagraph(images.debtHistory, CHART_IMAGE_SLOTS.debtHistory.relId, ids));
      else { const ht = buildDebtHistoryTable(card.debtHistoryChart); if (ht) parts.push(docxTable(ht)); }
    }
    if (card.refinancing) parts.push(docxRefinancingBox(card.refinancing));
    if (card.dividendChart) {
      if (images.dividend) parts.push(docxImageParagraph(images.dividend, CHART_IMAGE_SLOTS.dividend.relId, ids));
      if (card.dividendChart.hasReportedFallback) parts.push(docxParagraph('* Años con BPA reportado (sin ajustado disponible).', { size: 7, italic: true, color: COLORS.soft, after: 40 }));
    }
    if (card.isWatchlist && card.items?.length) card.items.forEach((it) => parts.push(docxRichParagraph(`OK  ${it}`, { size: 8, color: COLORS.ink, after: 20 })));
    if (card.table) {
      if (card.table.title) {
        parts.push(docxParagraph('EXTRACTO OFICIAL SEC (FORM 10-K)', { size: 8, bold: true, color: '#475569', highlight: '#F1F5F9', after: 20, before: 40 }));
        parts.push(docxParagraph(card.table.title, { size: 9, bold: true, color: '#0F172A', after: 20 }));
      }
      if (card.table.summary) parts.push(docxParagraph(card.table.summary, { size: 7.5, italic: true, color: '#64748B', after: 20 }));
      parts.push(docxTable(card.table));
    }
  });
}

function buildDocxXml(model, images = {}) {
  const parts = [];
  const ids = { image: 0 };
  parts.push(docxParagraph(model.company, { size: 18, bold: true, color: COLORS.ink, after: 60 }));
  if (model.ticker) parts.push(docxParagraph(model.ticker, { size: 10, color: COLORS.ticker, after: 40 }));
  if (model.periodTitle) parts.push(docxParagraph(model.periodTitle, { size: 12, bold: true, color: COLORS.period, after: 80 }));

  model.horizons.forEach((horizon, hIndex) => {
    parts.push(docxParagraph(horizon.label, { size: 13, bold: true, color: COLORS.ink, after: 80, pageBreakBefore: hIndex > 0 }));
    horizon.sections.forEach((section, sIndex) => {
      parts.push(docxParagraph(section.title, { size: 10, bold: true, color: COLORS.ink, after: 60 }));
      if (section.table) parts.push(docxTable(section.table));
      if (section.extras?.length) parts.push(docxParagraph(section.extras.join('  ·  '), { size: 8, bold: true, color: COLORS.ink, before: 40 }));
      if (section.verification) parts.push(docxParagraph(section.verification, { size: 8, bold: true, color: COLORS.ink, before: 40 }));
      parts.push(docxNotes(section.notes));
      if (sIndex < horizon.sections.length - 1) parts.push(docxParagraph('', { size: 8, color: COLORS.rule, after: 40 }));
    });
  });

  if (model.conclusion) {
    parts.push(docxParagraph(model.conclusion.title, { size: 14, bold: true, color: COLORS.ink, after: 40, pageBreakBefore: true }));
    if (model.conclusion.subtitle) parts.push(docxParagraph(model.conclusion.subtitle, { size: 9, italic: true, color: COLORS.muted, after: 80 }));
    appendCardsToDocx(parts, model.conclusion.cards, images, ids);
  }

  if (model.rating) {
    parts.push(docxParagraph(`${model.rating.label}  (${model.rating.score} / 10)`, { size: 13, bold: true, color: COLORS.ink, after: 40, before: 100, pageBreakBefore: true }));
    parts.push(docxRichParagraph(model.rating.rationale, { size: 9, color: COLORS.ink, after: 40 }));
    parts.push(docxParagraph(model.rating.disclaimer, { size: 7.5, italic: true, color: COLORS.muted, after: 60 }));
  }
  parts.push(docxParagraph(model.footer, { size: 8, color: COLORS.soft, before: 120 }));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${parts.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
}

export async function buildReportDocx(report) {
  const model = buildReportModel(report);
  const images = buildReportChartImages(model);
  const mediaFiles = Object.entries(CHART_IMAGE_SLOTS)
    .filter(([key]) => images[key])
    .map(([key, slot]) => ({ ...slot, data: images[key].buffer }));
  const imageRels = mediaFiles
    .map((media) => `<Relationship Id="${media.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${media.file}"/>`).join('');

  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.folder('_rels').file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const word = zip.folder('word');
  word.folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${imageRels}</Relationships>`);
  word.file('styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Helvetica" w:hAnsi="Helvetica" w:cs="Helvetica"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>');
  const media = word.folder('media');
  mediaFiles.forEach((file) => media.file(file.file, file.data));
  word.file('document.xml', buildDocxXml(model, images));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
