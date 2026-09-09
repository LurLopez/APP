import JSZip from 'jszip';

/* ── Paleta de resaltado por nota (*1…*6) — idéntica a la del PDF ── */
const HIGHLIGHT_PALETTE = [
  { bg: '#fef08a', text: '#854d0e' }, // 1: Amarillo
  { bg: '#fed7aa', text: '#c2410c' }, // 2: Naranja
  { bg: '#bbf7d0', text: '#15803d' }, // 3: Verde lima
  { bg: '#e9d5ff', text: '#7e22ce' }, // 4: Morado / Malva
  { bg: '#bae6fd', text: '#0369a1' }, // 5: Celeste pastel
  { bg: '#fbcfe8', text: '#be185d' }, // 6: Rosa pastel
];

const COLORS = {
  ink: '#111827',
  headerBg: '#1f2937',
  headerColor: '#ffffff',
  stripe: '#f3f4f6',
  muted: '#6b7280',
  noteText: '#4b5563',
  soft: '#9ca3af',
  ticker: '#6b7280',
  period: '#374151',
  rule: '#d1d5db',
  positive: '#16a34a',
  negative: '#dc2626',
};

function sanitize(value) {
  if (value === null || value === undefined) return '—';
  return String(value).replaceAll('−', '-');
}

function getHighlight(noteNumber) {
  const num = parseInt(noteNumber, 10);
  if (Number.isNaN(num) || num < 1) return HIGHLIGHT_PALETTE[0];
  return HIGHLIGHT_PALETTE[(num - 1) % HIGHLIGHT_PALETTE.length];
}

function noteNumberOf(value) {
  const match = String(value ?? '').match(/\*?(\d+)/);
  return match ? match[1] : '1';
}

/* ── Modelo intermedio compartido por los tres formatos ─────────────── */

function cell(text, opts = {}) {
  return { text: sanitize(text), ...opts };
}

function headerCell(text) {
  const noteMatch = String(text).match(/\*(\d+)/);
  if (noteMatch) {
    const scheme = getHighlight(noteMatch[1]);
    return cell(text, { bold: true, color: scheme.text, bg: scheme.bg });
  }
  return cell(text, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg });
}

function isPctHeader(header) {
  return ['% Aj.', '% N.', '% Ajustado', '% Normal', '%'].includes(String(header).trim());
}

function pctColor(value) {
  const str = String(value ?? '').trim();
  if (!str || str === '—') return null;
  if (str.startsWith('-')) return COLORS.negative;
  if (str.startsWith('+') || /^[0-9]/.test(str)) return COLORS.positive;
  return null;
}

function buildSalesSection(sales) {
  const columns = ['Métrica', 'Ajustado', 'Anterior Aj.', '% Ajustado', 'Normal', 'Anterior N.', '% Normal'];
  const widths = [140, 62, 62, 63, 62, 62, 63];
  const headers = columns.map(headerCell);
  const rows = (sales.rows ?? []).map((row, index) => {
    const stripeBg = index % 2 === 0 ? COLORS.stripe : null;
    const isRowAdjusted = row.isAdjusted === true;
    const scheme = getHighlight(noteNumberOf(row.adjustedNote));

    const nameText = sanitize(row.name);
    const nameNoteMatch = nameText.match(/\*(\d+)/);
    const nameCell = nameNoteMatch
      ? cell(nameText, { bold: true, color: getHighlight(nameNoteMatch[1]).text, bg: getHighlight(nameNoteMatch[1]).bg })
      : cell(nameText, { bold: true, color: COLORS.ink, bg: stripeBg });

    const values = [row.adjusted, row.prevAdjusted, row.pctAdjusted, row.normal, row.prevNormal, row.pctNormal];
    const valueCells = values.map((value, i) => {
      const colHeader = columns[i + 1];
      const base = { bold: colHeader === 'Ajustado' || colHeader === 'Normal', color: COLORS.ink, bg: stripeBg };
      if (i === 0 && isRowAdjusted) {
        return cell(value, { bold: true, color: scheme.text, bg: scheme.bg });
      }
      if (isPctHeader(colHeader)) {
        const color = pctColor(value);
        if (color) return cell(value, { ...base, color, bold: false });
      }
      return cell(value, base);
    });
    return [nameCell, ...valueCells];
  });

  return {
    title: '1. VENTAS',
    table: { columns, widths, headers, rows },
    extras: [
      sales.shares ? `ACCIONES: ${sanitize(sales.shares)}` : null,
      sales.eps ? `BPA: ${sanitize(sales.eps)}` : null,
    ].filter(Boolean),
    notes: buildNotes(sales.notes),
  };
}

function buildCashFlowSection(cashFlow) {
  let scenarios = Array.isArray(cashFlow.scenarios) ? [...cashFlow.scenarios] : [];
  if (scenarios.length === 0) scenarios = ['Normal', 'Ajustado'];
  else if (scenarios.length === 1) scenarios = [scenarios[0], 'Ajustado'];

  const columns = ['Métrica', ...scenarios];
  const widths = [150, ...Array(scenarios.length).fill((515 - 150) / scenarios.length)];
  const headers = columns.map(headerCell);
  const rows = (cashFlow.rows ?? []).map((row, index) => {
    const stripeBg = index % 2 === 0 ? COLORS.stripe : null;
    const nameText = sanitize(row.name);
    const nameNoteMatch = nameText.match(/\*(\d+)/);
    const nameCell = nameNoteMatch
      ? cell(nameText, { bold: true, color: getHighlight(nameNoteMatch[1]).text, bg: getHighlight(nameNoteMatch[1]).bg })
      : cell(nameText, { bold: true, color: COLORS.ink, bg: stripeBg });

    let values = Array.isArray(row.values) && row.values.length ? [...row.values] : [row.value];
    if (values.length === 1 && scenarios.length === 2) values.push(values[0]);

    const valueCells = values.map((value, i) => {
      const base = { bold: columns[i + 1] === 'Ajustado' || columns[i + 1] === 'Normal', color: COLORS.ink, bg: stripeBg };
      if (i === 1 && row.cashFlowAdjustedNote) {
        const scheme = getHighlight(String(row.cashFlowAdjustedNote).replace(/\D/g, '') || '2');
        return cell(value, { bold: true, color: scheme.text, bg: scheme.bg });
      }
      return cell(value, base);
    });
    return [nameCell, ...valueCells];
  });

  const notes = (Array.isArray(cashFlow.notes) ? cashFlow.notes : []).filter((n) => {
    const lower = String(n || '').toLowerCase();
    return !lower.includes('deducido del acumulado') && !lower.includes('flujo trimestral deducido');
  });

  return { title: '2. CASH FLOW', table: { columns, widths, headers, rows }, notes: buildNotes(notes) };
}

function buildCapitalSection(capital) {
  const columns = ['Métrica', 'Valor'];
  const widths = [150, 365];
  const headers = columns.map(headerCell);
  const rows = (capital.rows ?? []).map((row, index) => {
    const stripeBg = index % 2 === 0 ? COLORS.stripe : null;
    const nameText = sanitize(row.name);
    const nameNoteMatch = nameText.match(/\*(\d+)/);
    const nameCell = nameNoteMatch
      ? cell(nameText, { bold: true, color: getHighlight(nameNoteMatch[1]).text, bg: getHighlight(nameNoteMatch[1]).bg })
      : cell(nameText, { bold: true, color: COLORS.ink, bg: stripeBg });

    const str = String(row.value ?? '').trim();
    const color = str.startsWith('-') ? COLORS.negative
      : (str.startsWith('+') || (/^[0-9]/.test(str) && str !== '0')) ? COLORS.positive
        : COLORS.ink;
    return [nameCell, cell(row.value, { color, bg: stripeBg })];
  });

  return {
    title: '3. ASIGNACIÓN DE CAPITAL',
    table: { columns, widths, headers, rows },
    verification: capital.verification ? sanitize(capital.verification) : null,
    notes: buildNotes(capital.notes),
  };
}

function buildNotes(notes) {
  return (Array.isArray(notes) ? notes : []).filter(Boolean).map((note) => {
    const raw = sanitize(note);
    const match = raw.match(/^\*(\d+):?\s*([\s\S]*)$/);
    if (match) {
      const scheme = getHighlight(match[1]);
      return { marker: `*${match[1]}:`, text: match[2], bg: scheme.bg, color: scheme.text, italic: false };
    }
    return { marker: null, text: raw, italic: true, color: COLORS.muted };
  });
}

export function buildReportModel(report) {
  const horizons = Array.isArray(report?.horizons) ? report.horizons : [];
  return {
    company: sanitize(report?.company ?? ''),
    ticker: report?.ticker ? `Ticker: ${sanitize(report.ticker)}` : null,
    periodTitle: report?.periodTitle ? sanitize(report.periodTitle) : null,
    horizons: horizons.map((horizon, hIndex) => ({
      label: sanitize(horizon.label ?? (hIndex === 0 ? 'ÚLTIMOS 3 MESES' : 'EN TODO EL AÑO')),
      sections: [
        (Array.isArray(horizon.sales?.rows) && horizon.sales.rows.length) ? buildSalesSection(horizon.sales) : null,
        (Array.isArray(horizon.cashFlow?.rows) && horizon.cashFlow.rows.length) ? buildCashFlowSection(horizon.cashFlow) : null,
        (Array.isArray(horizon.capital?.rows) && horizon.capital.rows.length) ? buildCapitalSection(horizon.capital) : null,
      ].filter(Boolean),
    })),
    footer: 'Generado por Cifra · beta 0.1 · La IA ordena la información. Tú decides qué significa.',
  };
}

/* ── HTML (formato maestro de guardado) ─────────────────────────────── */

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderHtmlNotes(notes) {
  if (!notes?.length) return '';
  const items = notes.map((note) => {
    if (note.marker) {
      return `<li><mark style="background:${note.bg};color:${note.color};font-weight:700;padding:1px 4px;border-radius:3px;">${escapeHtml(note.marker)}</mark> ${escapeHtml(note.text).replaceAll('\n', '<br>')}</li>`;
    }
    return `<li style="font-style:italic;color:${note.color};">${escapeHtml(note.text).replaceAll('\n', '<br>')}</li>`;
  }).join('');
  return `<ul class="notes">${items}</ul>`;
}

function renderHtmlTable(table) {
  const thead = table.headers.map((h) => {
    const style = h.bg
      ? `background:${h.bg};color:${h.color};`
      : `background:${COLORS.headerBg};color:${COLORS.headerColor};`;
    return `<th style="${style}${h.bold ? 'font-weight:700;' : ''}">${escapeHtml(h.text)}</th>`;
  }).join('');
  const tbody = table.rows.map((row) => `<tr>${row.map((c) => {
    const style = [
      c.bg ? `background:${c.bg};` : '',
      c.color ? `color:${c.color};` : '',
      c.bold ? 'font-weight:700;' : '',
    ].join('');
    return `<td${style ? ` style="${style}"` : ''}>${escapeHtml(c.text)}</td>`;
  }).join('')}</tr>`).join('');
  return `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

export function buildReportHtml(report) {
  const model = buildReportModel(report);
  const body = model.horizons.map((horizon) => `
  <section class="horizon">
    <h2>${escapeHtml(horizon.label)}</h2>
    ${horizon.sections.map((section) => `
    <h3>${escapeHtml(section.title)}</h3>
    ${section.table ? renderHtmlTable(section.table) : ''}
    ${section.extras?.length ? `<p class="extras">${escapeHtml(section.extras.join('  ·  '))}</p>` : ''}
    ${section.verification ? `<p class="extras">${escapeHtml(section.verification)}</p>` : ''}
    ${renderHtmlNotes(section.notes)}
    <hr>
    `).join('')}
  </section>`).join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model.company)}${model.periodTitle ? ` — ${escapeHtml(model.periodTitle)}` : ''}</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; color: ${COLORS.ink}; margin: 32px auto; max-width: 720pt; padding: 0 16px; }
  h1 { font-size: 18pt; margin: 0; }
  .ticker { font-size: 10pt; color: ${COLORS.ticker}; margin: 4pt 0; }
  .period { font-size: 12pt; font-weight: 700; color: ${COLORS.period}; margin: 4pt 0 8pt; }
  hr { border: 0; border-top: 1px solid ${COLORS.rule}; margin: 10pt 0; }
  .horizon h2 { font-size: 13pt; margin: 0 0 8pt; page-break-before: always; }
  .horizon:first-of-type h2 { page-break-before: avoid; }
  .horizon h3 { font-size: 10pt; margin: 12pt 0 6pt; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 6pt; }
  th { font-size: 7.5pt; text-align: left; padding: 4pt 4pt; }
  td { font-size: 7.5pt; padding: 4pt 4pt; color: ${COLORS.ink}; }
  td:first-child { font-weight: 700; }
  tbody tr:nth-child(odd) td { background: ${COLORS.stripe}; }
  .extras { font-size: 8pt; font-weight: 700; margin: 4pt 0 0; }
  .notes { font-size: 7.5pt; color: ${COLORS.noteText}; padding-left: 14pt; margin: 4pt 0 0; }
  .notes li { margin: 2pt 0; }
  footer { font-size: 8pt; color: ${COLORS.soft}; margin-top: 16pt; }
</style>
</head>
<body>
<h1>${escapeHtml(model.company)}</h1>
${model.ticker ? `<p class="ticker">${escapeHtml(model.ticker)}</p>` : ''}
${model.periodTitle ? `<p class="period">${escapeHtml(model.periodTitle)}</p>` : ''}
<hr>
${body}
<footer>${escapeHtml(model.footer)}</footer>
</body>
</html>`;
}

/* ── DOCX (Word) ────────────────────────────────────────────────────── */

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

const hex = (color) => String(color ?? '').replace('#', '').toUpperCase();

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

function docxTable(table) {
  const totalRelative = table.widths.reduce((a, b) => a + b, 0);
  const available = 10466; // A4 (11906) menos márgenes (2 × 720)
  const colWidths = table.widths.map((w) => Math.max(600, Math.round((w / totalRelative) * available)));

  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${hex(COLORS.rule)}"/>`)
    .join('');

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

function buildDocxXml(model) {
  const parts = [];
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
      if (sIndex < horizon.sections.length - 1) {
        parts.push(docxParagraph('', { size: 8, color: COLORS.rule, after: 40 }));
      }
    });
  });

  parts.push(docxParagraph(model.footer, { size: 8, color: COLORS.soft, before: 120 }));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parts.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
}

export async function buildReportDocx(report) {
  const model = buildReportModel(report);
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  const word = zip.folder('word');
  word.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  word.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Helvetica" w:hAnsi="Helvetica"/><w:sz w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`);
  word.file('document.xml', buildDocxXml(model));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/* ── ODT (OpenDocument / LibreOffice) ───────────────────────────────── */

function odtEsc(value) {
  return esc(value);
}

function createOdtStyleRegistry() {
  const textStyles = new Map();
  const cellStyles = new Map();
  const columnStyles = new Map();

  const textStyleFor = ({ bold, italic, color, size }) => {
    const key = `${bold ? 'b' : ''}${italic ? 'i' : ''}|${color ?? 'auto'}|${size ?? 7.5}`;
    if (!textStyles.has(key)) {
      const name = `T${textStyles.size + 1}`;
      const props = [
        color ? `fo:color="${color}"` : '',
        bold ? 'fo:font-weight="bold" style:font-weight-asian="bold"' : '',
        italic ? 'fo:font-style="italic"' : '',
        size ? `fo:font-size="${size}pt"` : '',
      ].filter(Boolean).join(' ');
      textStyles.set(key, { name, props });
    }
    return textStyles.get(key).name;
  };

  const cellStyleFor = (bg) => {
    const key = bg ?? 'none';
    if (!cellStyles.has(key)) {
      const name = `C${cellStyles.size + 1}`;
      const props = [
        bg ? `fo:background-color="${bg}"` : 'fo:background-color="transparent"',
        'fo:border="0.5pt solid #d1d5db"',
        'fo:padding="0.028in"',
      ].join(' ');
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

  const automaticStyles = () => {
    const texts = [...textStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="text"><style:text-properties ${s.props}/></style:style>`).join('');
    const cells = [...cellStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="table-cell"><style:table-cell-properties ${s.props}/></style:style>`).join('');
    const columns = [...columnStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="table-column"><style:table-column-properties ${s.props}/></style:style>`).join('');
    return `${texts}${cells}${columns}<style:style style:name="PBreak" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:break-before="page"/></style:style><style:style style:name="PBody" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0.02in" fo:margin-bottom="0.04in"/></style:style><style:style style:name="TReport" style:family="table"><style:table-properties style:width="6.69in" table:align="left"/></style:style>`;
  };

  return { textStyleFor, cellStyleFor, columnStyleFor, automaticStyles };
}

function buildOdtContent(model) {
  const styles = createOdtStyleRegistry();
  const body = [];
  let tableCount = 0;

  const paragraph = (text, opts = {}) => {
    const styleName = styles.textStyleFor({ bold: opts.bold, italic: opts.italic, color: opts.color, size: opts.size });
    const pStyle = opts.pageBreakBefore ? 'PBreak' : 'PBody';
    body.push(`<text:p text:style-name="${pStyle}"><text:span text:style-name="${styleName}">${odtEsc(text)}</text:span></text:p>`);
  };

  const notes = (list) => {
    (list ?? []).forEach((note) => {
      if (note.marker) {
        const markerStyle = styles.textStyleFor({ bold: true, color: note.color, size: 7.5 });
        const textStyle = styles.textStyleFor({ color: COLORS.noteText, size: 7.5 });
        body.push(`<text:p text:style-name="PBody"><text:span text:style-name="${markerStyle}">${odtEsc(note.marker)}</text:span><text:span text:style-name="${textStyle}"> ${odtEsc(note.text)}</text:span></text:p>`);
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
    const headerRow = `<table:table-row>${sectionTable.headers.map((h, i) => `<table:table-cell table:style-name="${styles.cellStyleFor(h.bg ?? COLORS.headerBg)}"><text:p text:style-name="PBody"><text:span text:style-name="${styles.textStyleFor({ bold: true, color: h.color ?? COLORS.headerColor, size: 7.5 })}">${odtEsc(h.text)}</text:span></text:p></table:table-cell>`).join('')}</table:table-row>`;
    const bodyRows = sectionTable.rows.map((row) => `<table:table-row>${row.map((c, i) => `<table:table-cell table:style-name="${styles.cellStyleFor(c.bg)}"><text:p text:style-name="PBody"><text:span text:style-name="${styles.textStyleFor({ bold: c.bold, color: c.color ?? COLORS.ink, size: 7.5 })}">${odtEsc(c.text)}</text:span></text:p></table:table-cell>`).join('')}</table:table-row>`).join('');

    body.push(`<table:table table:name="Tabla${tableCount}" table:style-name="TReport">${colsXml}${headerRow}${bodyRows}</table:table>`);
    body.push('<text:p text:style-name="PBody"/>');
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

  paragraph(model.footer, { color: COLORS.soft, size: 8 });

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"><office:automatic-styles>${styles.automaticStyles()}</office:automatic-styles><office:body><office:text>${body.join('')}</office:text></office:body></office:document-content>`;
}

export async function buildReportOdt(report) {
  const model = buildReportModel(report);
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>`);
  zip.file('styles.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"><office:styles><style:default-style style:family="paragraph"><style:text-properties fo:font-size="10pt" style:font-name="Helvetica"/></style:default-style></office:styles></office:document-styles>`);
  zip.file('content.xml', buildOdtContent(model));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
