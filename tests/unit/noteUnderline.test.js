import { test } from 'node:test';
import assert from 'node:assert/strict';
import { underlineFigure } from '../../src/utils/noteText.js';
import { buildWcDeviationSentence } from '../../src/agents/analyst/capitalAllocationHelpers.js';
import { buildCashFlowAdjustmentChain } from '../../src/agents/analyst/analystCashCapitalProcessor.js';
import { renderNotesSsr } from '../../src/services/seo/reportSsrHtml.js';
import { parseRichSegments } from '../../src/services/reportExport/exportColors.js';
import { renderRichHtml } from '../../src/services/reportExport/htmlExporter.js';

test('underlineFigure subraya la cifra exacta sin tocar coincidencias parciales', () => {
  assert.equal(underlineFigure('Desviación: -2326,6M y 100M', '-2326,6M'), 'Desviación: __-2326,6M__ y 100M');
  assert.equal(underlineFigure('total 100M', '0M'), 'total 100M', '«0M» no debe subrayar dentro de «100M»');
  assert.equal(underlineFigure('Ajuste de -816M al Cash Flow', '-816M'), 'Ajuste de __-816M__ al Cash Flow');
  assert.equal(underlineFigure('', '-816M'), '');
});

test('la nota del circulante subraya la desviación en la frase y en la cadena (caso PEP 2026-Q3)', () => {
  const sentence = buildWcDeviationSentence({
    reported: -2628,
    wcReq: -301.4,
    deviation: -2326.6,
    cfo: 7950,
    adjusted: 10276.6,
    language: 'es',
  });
  assert.match(sentence, /frente al WC teórico \(-301,4M\): __-2326,6M__/);
  assert.match(sentence, /7950M - \(__-2326,6M__\) = 10276,6M/);
});

test('la cadena de ajustes subraya cada importe ajustado (circulante, impuestos y SBC)', () => {
  const chain = buildCashFlowAdjustmentChain({
    normalCfo: 7950,
    afterWc: 10276.6,
    finalCfo: 9220.6,
    taxAdjustment: -816,
    sbcAdjustment: -240,
    language: 'es',
  });
  assert.match(chain, /__\+2326,6M__ \(circulante\)/);
  assert.match(chain, /__-816M__ \(impuestos\)/);
  assert.match(chain, /__-240M__ \(stock options\)/);
});

test('la cadena de dos ajustes subraya circulante e impuestos (sin SBC)', () => {
  const chain = buildCashFlowAdjustmentChain({
    normalCfo: 9415,
    afterWc: 8768.3,
    finalCfo: 9423,
    taxAdjustment: 654.7,
    language: 'es',
  });
  assert.match(chain, /__-646,7M__ \(circulante\) __\+654,7M__ \(impuestos\)/);
});

test('las notas SSR convierten el marcador __…__ en subrayado', () => {
  const html = renderNotesSsr(['*2: Impuestos: Ajuste de __-816M__ al Cash Flow Ajustado por la discrepancia fiscal.']);
  assert.match(html, /<u>-816M<\/u>/);
  assert.doesNotMatch(html, /__-816M__/);
});

test('parseRichSegments separa el subrayado y respeta la negrita anidada', () => {
  const segments = parseRichSegments('**7950M __-816M__ (impuestos) = 7134M**', { autoBold: false });
  assert.deepEqual(segments, [
    { text: '7950M ', bold: true, underline: false },
    { text: '-816M', bold: true, underline: true },
    { text: ' (impuestos) = 7134M', bold: true, underline: false },
  ]);
});

test('el HTML de exportación (DOCX/ODT/HTML) subraya los importes ajustados', () => {
  const html = renderRichHtml('**7950M __-816M__ (impuestos) = 7134M**');
  assert.match(html, /<u><strong>-816M<\/strong><\/u>/);
  assert.doesNotMatch(html, /__-816M__/);
});
