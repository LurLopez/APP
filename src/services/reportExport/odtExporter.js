/**
 * @fileoverview Generador de documentos OpenDocument Text (.odt) para LibreOffice y OpenOffice.
 * @module services/reportExport/odtExporter
 */

import JSZip from 'jszip';
import { esc, parseRichSegments, CHART_IMAGE_SLOTS, COLORS } from './exportColors.js';
import { buildDebtRefinancingBadges } from './debtHistoryRefinancingModel.js';
import { buildSharesChartTable } from './sharesModel.js';
import { buildDebtMaturityTable } from './debtMaturityModel.js';
import { buildDebtHistoryTable } from './debtHistoryRefinancingModel.js';
import { buildReportModel } from './reportModel.js';
import { buildReportChartImages } from './chartImages.js';
import { getExecutiveFieldLabels } from './executiveChanges.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';

function createOdtStyleRegistry() {
  const textStyles = new Map();
  const cellStyles = new Map();
  const columnStyles = new Map();

  const textStyleFor = ({ bold, italic, color, size, bg }) => {
    const key = `${bold ? 'b' : ''}${italic ? 'i' : ''}|${color ?? 'auto'}|${size ?? 7.5}|${bg ?? ''}`;
    if (!textStyles.has(key)) {
      const name = `T${textStyles.size + 1}`;
      const props = [
        color ? `fo:color="${color}"` : '',
        bg ? `fo:background-color="${bg}"` : '',
        bold ? 'fo:font-weight="bold" style:font-weight-asian="bold"' : '',
        italic ? 'fo:font-style="italic"' : '',
        size ? `fo:font-size="${size}pt"` : '',
      ].filter(Boolean).join(' ');
      textStyles.set(key, { name, props });
    }
    return textStyles.get(key).name;
  };

  const cellStyleFor = (bg, variant = 'default') => {
    const key = `${bg ?? 'none'}|${variant}`;
    if (!cellStyles.has(key)) {
      const name = `C${cellStyles.size + 1}`;
      let props;
      if (variant === 'box') {
        props = 'fo:background-color="#fff7ed" fo:border="none" fo:border-left="4pt solid #ea580c" fo:padding="0.07in"';
      } else if (variant === 'tile') {
        props = `${bg ? `fo:background-color="${bg}"` : 'fo:background-color="transparent"'} fo:border="none" fo:padding="0.035in"`;
      } else {
        props = `${bg ? `fo:background-color="${bg}"` : 'fo:background-color="transparent"'} fo:border="0.5pt solid #d1d5db" fo:padding="0.028in"`;
      }
      cellStyles.set(key, { name, props });
    }
    return cellStyles.get(key).name;
  };

  const columnStyleFor = (widthIn) => {
    const key = widthIn.toFixed(3);
    if (!columnStyles.has(key)) {
      const name = `W${columnStyles.size + 1}`;
      columnStyles.set(key, { name, props: `style:column-width="${key}in"` });
    }
    return columnStyles.get(key).name;
  };

  const frameStyle = 'FG1';
  const graphicStyles = `<style:style style:name="${frameStyle}" style:family="graphic"><style:graphic-properties style:vertical-pos="top" style:vertical-rel="paragraph" style:horizontal-pos="center" style:horizontal-rel="paragraph" style:wrap="none" style:run-through="foreground" fo:margin-top="0.05in" fo:margin-bottom="0.07in"/></style:style>`;

  const automaticStyles = () => {
    const texts = [...textStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="text"><style:text-properties ${s.props}/></style:style>`).join('');
    const cells = [...cellStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="table-cell"><style:table-cell-properties ${s.props}/></style:style>`).join('');
    const columns = [...columnStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="table-column"><style:table-column-properties ${s.props}/></style:style>`).join('');
    return `${texts}${cells}${columns}${graphicStyles}<style:style style:name="PBreak" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:break-before="page"/></style:style><style:style style:name="PBody" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0.02in" fo:margin-bottom="0.04in"/></style:style><style:style style:name="TReport" style:family="table"><style:table-properties style:width="6.69in" table:align="left"/></style:style><style:style style:name="TBox" style:family="table"><style:table-properties style:width="6.35in" table:align="left"/></style:style>`;
  };

  return { textStyleFor, cellStyleFor, columnStyleFor, frameStyle, automaticStyles };
}

function odtExecutiveChangeBlock(ctx, change, language = 'es') {
  const lang = normalizeLanguage(language);
  if (!change || typeof change !== 'object') return;
  const roleLabel = String(change.role || t('Directivo', null, lang)).toUpperCase();
  if (change.text) ctx.richParagraph(change.text, { color: COLORS.ink, size: 9 });
  const meta = [
    change.announcementDate ? `${t('Anuncio', null, lang)}: ${change.announcementDate}` : null,
    change.effectiveDate ? `${t('Efectivo', null, lang)}: ${change.effectiveDate}` : null,
    change.reason ? `${t('Motivo', null, lang)}: ${change.reason}` : null,
  ].filter(Boolean);
  if (meta.length) ctx.paragraph(`• ${meta.join('   ·   ')}`, { bold: true, color: '#854d0e', size: 8 });

  const personBlock = (label, person) => {
    if (!person) return;
    const fields = getExecutiveFieldLabels(lang)
      .map(([fieldLabel, key]) => [fieldLabel, person[key]])
      .filter(([, value]) => value);
    if (!person.name && !fields.length) return;
    ctx.paragraph(label, { bold: true, color: '#4f46e5', size: 7.5 });
    if (person.name) ctx.paragraph(`${person.name}${person.role ? ` — ${person.role}` : ''}`, { bold: true, color: '#0f172a', size: 8.5 });
    fields.forEach(([fieldLabel, value]) => ctx.richParagraph(`**${fieldLabel}:** ${value}`, { color: '#374151', boldColor: '#334155', size: 8.5 }));
  };
  personBlock(t('ANTIGUO {role}', { role: roleLabel }, lang), change.oldExecutive);
  personBlock(t('NUEVO {role}', { role: roleLabel }, lang), change.newExecutive);
}

function odtExecutiveChangesBlock(ctx, section, language = 'es') {
  const lang = normalizeLanguage(language);
  const changes = Array.isArray(section?.changes) ? section.changes : [];
  changes.forEach((change, index) => {
    if (changes.length > 1) ctx.paragraph(String(change.role || t('Directivo', null, lang)).toUpperCase(), { bold: true, color: '#4f46e5', size: 7.5 });
    odtExecutiveChangeBlock(ctx, change, lang);
  });
  if (section?.disclaimer) ctx.paragraph(section.disclaimer, { italic: true, color: '#94a3b8', size: 7 });
}

function appendCardsToOdt(body, cards, images, styles, ctx, language = 'es') {
  const lang = normalizeLanguage(language);
  cards.forEach((card, cardIndex) => {
    ctx.paragraph(card.title, { bold: true, color: COLORS.ink, size: 11, pageBreakBefore: cardIndex > 0 });
    if (card.text) ctx.richParagraph(card.text, { color: COLORS.ink, size: 8.5 });
    if (card.executiveChanges) odtExecutiveChangesBlock(ctx, card.executiveChanges, lang);
    if (card.badges?.length) card.badges.forEach((b) => ctx.richParagraph(`• ${b}`, { color: '#854d0e', boldColor: '#7c2d12', size: 8 }));
    if (card.chart) {
      ctx.paragraph(card.chart.title, { bold: true, color: '#475569', size: 8 });
      if (!ctx.image('shares')) { const ct = buildSharesChartTable(card.chart); if (ct) ctx.table(ct); }
    }
    if (card.debtMaturityChart) {
      ctx.paragraph(card.debtMaturityChart.title, { bold: true, color: '#475569', size: 8 });
      if (!ctx.image('debtMaturity')) { const mt = buildDebtMaturityTable(card.debtMaturityChart); if (mt) ctx.table(mt); }
    }
    if (card.debtHistoryChart) {
      ctx.paragraph(card.debtHistoryChart.title, { bold: true, color: '#475569', size: 8 });
      if (!ctx.image('debtHistory')) { const ht = buildDebtHistoryTable(card.debtHistoryChart); if (ht) ctx.table(ht); }
    }
    if (card.refinancing) ctx.refinancingBox(card.refinancing);
    if (card.dividendChart) {
      ctx.image('dividend');
      if (card.dividendChart.hasReportedFallback) ctx.paragraph(t('* Años con BPA reportado (sin ajustado disponible).', null, lang), { italic: true, color: COLORS.soft, size: 7 });
    }
    if (card.isWatchlist && card.items?.length) card.items.forEach((it) => ctx.richParagraph(`OK  ${it}`, { color: COLORS.ink, size: 8 }));
    if (card.table) {
      if (card.table.title) {
        ctx.paragraph(t('EXTRACTO OFICIAL SEC (FORM 10-K)', null, lang), { bold: true, color: '#475569', size: 8, bg: '#f1f5f9' });
        ctx.paragraph(card.table.title, { bold: true, color: '#0f172a', size: 9 });
      }
      if (card.table.summary) ctx.paragraph(card.table.summary, { italic: true, color: '#64748b', size: 7.5 });
      ctx.table(card.table);
    }
  });
}

function buildOdtContent(model, images = {}, language = 'es') {
  const lang = normalizeLanguage(language);
  const styles = createOdtStyleRegistry();
  const body = [];
  let tableCount = 0;

  const paragraph = (text, opts = {}) => {
    const styleName = styles.textStyleFor({ bold: opts.bold, italic: opts.italic, color: opts.color, size: opts.size, bg: opts.bg });
    const pStyle = opts.pageBreakBefore ? 'PBreak' : 'PBody';
    body.push(`<text:p text:style-name="${pStyle}"><text:span text:style-name="${styleName}">${esc(text)}</text:span></text:p>`);
  };

  const richParagraphXml = (text, opts = {}) => parseRichSegments(text).map((seg) => {
    const styleName = styles.textStyleFor({
      bold: seg.bold ? true : (opts.bold ?? false),
      italic: opts.italic,
      color: seg.bold ? (opts.boldColor ?? '#0f172a') : (opts.color ?? COLORS.ink),
      size: opts.size,
      bg: opts.bg,
    });
    return `<text:span text:style-name="${styleName}">${esc(seg.text)}</text:span>`;
  }).join('');

  const richParagraph = (text, opts = {}) => {
    const pStyle = opts.pageBreakBefore ? 'PBreak' : 'PBody';
    const paragraphs = String(text ?? '').split(/\n+/).filter((paragraphText) => paragraphText.trim().length > 0);
    if (!paragraphs.length) return;
    paragraphs.forEach((paragraphText) => {
      body.push(`<text:p text:style-name="${pStyle}">${richParagraphXml(paragraphText, opts)}</text:p>`);
    });
  };

  const notes = (list) => {
    (list ?? []).forEach((note) => {
      if (note.marker) {
        const markerStyle = styles.textStyleFor({ bold: true, color: note.color, size: 7.5 });
        const textStyle = styles.textStyleFor({ color: COLORS.noteText, size: 7.5 });
        body.push(`<text:p text:style-name="PBody"><text:span text:style-name="${markerStyle}">${esc(note.marker)}</text:span><text:span text:style-name="${textStyle}"> ${esc(note.text)}</text:span></text:p>`);
      } else {
        paragraph(note.text, { italic: true, color: note.color, size: 7.5 });
      }
    });
  };

  const table = (sectionTable) => {
    tableCount += 1;
    const totalRelative = sectionTable.widths.reduce((a, b) => a + b, 0);
    const availableIn = 6.69;
    const colWidths = sectionTable.widths.map((w) => Math.max(0.5, (w / totalRelative) * availableIn));
    const colsXml = colWidths.map((w) => `<table:table-column table:style-name="${styles.columnStyleFor(w)}"/>`).join('');
    const headerRow = `<table:table-row>${sectionTable.headers.map((h) => `<table:table-cell table:style-name="${styles.cellStyleFor(h.bg ?? COLORS.headerBg)}"><text:p text:style-name="PBody"><text:span text:style-name="${styles.textStyleFor({ bold: true, color: h.color ?? COLORS.headerColor, size: 7.5 })}">${esc(h.text)}</text:span></text:p></table:table-cell>`).join('')}</table:table-row>`;
    const bodyRows = sectionTable.rows.map((row) => `<table:table-row>${row.map((c) => `<table:table-cell table:style-name="${styles.cellStyleFor(c.bg)}"><text:p text:style-name="PBody"><text:span text:style-name="${styles.textStyleFor({ bold: c.bold, color: c.color ?? COLORS.ink, size: 7.5 })}">${esc(c.text)}</text:span></text:p></table:table-cell>`).join('')}</table:table-row>`).join('');
    body.push(`<table:table table:name="Tabla${tableCount}" table:style-name="TReport">${colsXml}${headerRow}${bodyRows}</table:table><text:p text:style-name="PBody"/>`);
  };

  const image = (key) => {
    const img = images[key];
    const slot = CHART_IMAGE_SLOTS[key];
    if (!img || !slot) return false;
    const widthIn = 6.69;
    const heightIn = (widthIn * img.height) / img.width;
    body.push(`<text:p text:style-name="PBody"><draw:frame draw:style-name="${styles.frameStyle}" draw:name="${slot.file}" text:anchor-type="as-char" svg:width="${widthIn.toFixed(3)}in" svg:height="${heightIn.toFixed(3)}in"><draw:image xlink:href="Pictures/${slot.file}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>`);
    return true;
  };

  const refinancingBox = (refinancing) => {
    const badges = buildDebtRefinancingBadges(refinancing);
    if (!badges.length) return;
    tableCount += 1;
    const tileWidth = (6.35 - (badges.length - 1) * 0.08) / badges.length;
    const innerCols = badges.map(() => `<table:table-column table:style-name="${styles.columnStyleFor(tileWidth)}"/>`).join('');
    const tiles = badges.map((badge) => `<table:table-cell table:style-name="${styles.cellStyleFor(badge.highlight ? '#fed7aa' : '#ffedd5', 'tile')}"><text:p text:style-name="PBody" text:align="center"><text:span text:style-name="${styles.textStyleFor({ color: badge.highlight ? '#7c2d12' : '#9a3412', size: 6.5 })}">${esc(badge.label)}</text:span></text:p><text:p text:style-name="PBody" text:align="center"><text:span text:style-name="${styles.textStyleFor({ bold: true, color: badge.highlight ? '#7c2d12' : '#431407', size: 8 })}">${esc(badge.val)}</text:span></text:p></table:table-cell>`).join('');
    const innerTable = `<table:table table:name="RefinBadges${tableCount}" table:style-name="TBox">${innerCols}<table:table-row>${tiles}</table:table-row></table:table>`;
    const titleStyle = styles.textStyleFor({ bold: true, color: '#9a3412', size: 8.5 });
    const bodyContent = [
      `<text:p text:style-name="PBody"><text:span text:style-name="${titleStyle}">${esc(t('Refinanciación de deuda e impacto en BPA:', null, normalizeLanguage(refinancing.language)))}</text:span></text:p>`,
      innerTable,
      refinancing.explanation ? richParagraphXml(refinancing.explanation, { color: '#431407', size: 8 }) : '',
      refinancing.impactExplanation ? richParagraphXml(refinancing.impactExplanation, { color: '#c2410c', size: 8, boldColor: '#c2410c' }) : '',
    ].join('');
    body.push(`<table:table table:name="Refin${tableCount}" table:style-name="TReport"><table:table-column table:style-name="${styles.columnStyleFor(6.69)}"/><table:table-row><table:table-cell table:style-name="${styles.cellStyleFor(null, 'box')}">${bodyContent}</table:table-cell></table:table-row></table:table><text:p text:style-name="PBody"/>`);
  };

  paragraph(model.company, { bold: true, color: COLORS.ink, size: 18 });
  if (model.ticker) paragraph(model.ticker, { color: COLORS.ticker, size: 10 });
  if (model.periodTitle) paragraph(model.periodTitle, { bold: true, color: COLORS.period, size: 12 });

  model.horizons.forEach((horizon, hIndex) => {
    paragraph(horizon.label, { bold: true, color: COLORS.ink, size: 13, pageBreakBefore: hIndex > 0 });
    horizon.sections.forEach((section) => {
      paragraph(section.title, { bold: true, color: COLORS.ink, size: 10 });
      if (section.table) table(section.table);
      if (section.extras?.length) paragraph(section.extras.join('  ·  '), { bold: true, color: COLORS.ink, size: 8 });
      if (section.verification) paragraph(section.verification, { bold: true, color: COLORS.ink, size: 8 });
      notes(section.notes);
    });
  });

  const ctx = { paragraph, richParagraph, notes, table, image, refinancingBox };
  if (model.conclusion) {
    paragraph(model.conclusion.title, { bold: true, color: COLORS.ink, size: 14, pageBreakBefore: true });
    if (model.conclusion.subtitle) paragraph(model.conclusion.subtitle, { italic: true, color: COLORS.muted, size: 9 });
    appendCardsToOdt(body, model.conclusion.cards, images, styles, ctx, lang);
  }

  if (model.rating) {
    paragraph(`${model.rating.label} (${model.rating.score} / 10)`, { bold: true, color: COLORS.ink, size: 13, pageBreakBefore: true });
    paragraph(model.rating.rationale, { color: COLORS.ink, size: 9 });
    paragraph(model.rating.disclaimer, { italic: true, color: COLORS.muted, size: 7.5 });
  }
  paragraph(model.footer, { color: COLORS.soft, size: 8 });

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.2"><office:automatic-styles>${styles.automaticStyles()}</office:automatic-styles><office:body><office:text>${body.join('')}</office:text></office:body></office:document-content>`;
}

export async function buildReportOdt(report) {
  const model = buildReportModel(report);
  const lang = normalizeLanguage(report?.language);
  const images = buildReportChartImages(model);
  const mediaFiles = Object.entries(CHART_IMAGE_SLOTS)
    .filter(([key]) => images[key])
    .map(([key, slot]) => ({ ...slot, data: images[key].buffer }));
  const mediaEntries = mediaFiles
    .map((media) => `<manifest:file-entry manifest:full-path="Pictures/${media.file}" manifest:media-type="image/png"/>`).join('');

  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>${mediaEntries}</manifest:manifest>`);
  zip.file('styles.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2"><office:styles><style:default-style style:family="paragraph"><style:text-properties fo:font-size="10pt" style:font-name="Helvetica"/></style:default-style></office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="8.27in" fo:page-height="11.69in" fo:margin-top="0.79in" fo:margin-bottom="0.79in" fo:margin-left="0.79in" fo:margin-right="0.79in" style:print-orientation="portrait"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>');
  const pictures = zip.folder('Pictures');
  mediaFiles.forEach((file) => pictures.file(file.file, file.data));
  zip.file('content.xml', buildOdtContent(model, images, lang));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
