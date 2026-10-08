import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildReportOdt } from '../../src/services/reportExport/odtExporter.js';
import { buildReportDocx } from '../../src/services/reportExport/docxExporter.js';

const QUARTER_REPORT = {
  company: 'Test Co',
  ticker: 'TST',
  periodTitle: '2027 Q2 results',
  quarterNotes: {
    guidance: { status: 'raised', text: 'Guidance al alza' },
    notes: [
      { title: 'Nota uno', text: 'Texto uno' },
      { title: 'Nota dos', text: 'Texto dos' },
      { title: 'Nota tres', text: 'Texto tres' },
    ],
  },
};

const CONCLUSION_REPORT = {
  company: 'Test Co',
  ticker: 'TST',
  periodTitle: '2025 results',
  fiscalYear: 2025,
  conclusion: {
    repurchases: { title: '1: Recompras', text: 'Texto de recompras' },
    watchlist: { title: 'Cosas a tener en cuenta', items: ['Primera cosa'] },
  },
};

async function unzipEntry(buffer, entry) {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file(entry).async('string');
}

const countOccurrences = (text, needle) => text.split(needle).length - 1;

test('las notas del trimestre del ODT fluyen sin salto de página por nota', async () => {
  const content = await unzipEntry(await buildReportOdt(QUARTER_REPORT), 'content.xml');
  assert.equal(countOccurrences(content, 'text:style-name="PCardTitle"'), 4, 'guidance + 3 notas con estilo de tarjeta');
  assert.equal(countOccurrences(content, 'text:style-name="PCardTitleBreak"'), 0, 'ninguna nota fuerza página nueva');
  assert.equal(countOccurrences(content, 'text:style-name="PBreak"'), 1, 'solo el título de la sección salta de página');
  assert.match(content, /fo:border-bottom="0\.5pt solid #e2e8f0"/);
});

test('las notas del trimestre del DOCX fluyen sin salto de página por nota', async () => {
  const document = await unzipEntry(await buildReportDocx(QUARTER_REPORT), 'word/document.xml');
  assert.equal(countOccurrences(document, '<w:pageBreakBefore/>'), 1, 'solo el título de la sección salta de página');
  assert.equal(countOccurrences(document, '<w:pBdr><w:bottom'), 4, 'guidance + 3 notas con regla inferior');
});

test('la Parte II del ODT mantiene cada tarjeta en su propia página', async () => {
  const content = await unzipEntry(await buildReportOdt(CONCLUSION_REPORT), 'content.xml');
  assert.equal(countOccurrences(content, 'text:style-name="PCardTitleBreak"'), 1, 'la segunda tarjeta abre página nueva');
  assert.equal(countOccurrences(content, 'text:style-name="PCardTitle"'), 1);
});

test('la Parte II del DOCX mantiene cada tarjeta en su propia página', async () => {
  const document = await unzipEntry(await buildReportDocx(CONCLUSION_REPORT), 'word/document.xml');
  assert.equal(countOccurrences(document, '<w:pageBreakBefore/>'), 2, 'título de sección + segunda tarjeta');
});
