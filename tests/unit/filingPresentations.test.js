import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyEarningsDocument,
  looksLikePressReleaseName,
  pickEarningsDocumentsFallback,
} from '../../src/services/edgar/filingPresentations.js';

test('classifyEarningsDocument reconoce los documentos de resultados de NVIDIA (q4fy26pr.htm, q4fy26cfocommentary.htm)', () => {
  assert.equal(looksLikePressReleaseName('q4fy26pr.htm'), true);
  assert.equal(looksLikePressReleaseName('q4fy26er.htm'), true);
  assert.equal(classifyEarningsDocument('q4fy26pr.htm', 'nvda-20260225.htm'), 'release');
  assert.equal(classifyEarningsDocument('q4fy26cfocommentary.htm', 'nvda-20260225.htm'), 'release');
});

test('classifyEarningsDocument conserva las convenciones clásicas y las exclusiones administrativas', () => {
  assert.equal(classifyEarningsDocument('ex99-1.htm', 'form8k.htm'), 'release');
  assert.equal(classifyEarningsDocument('pressrelease.htm', 'form8k.htm'), 'release');
  assert.equal(classifyEarningsDocument('investor-presentation.pdf', 'form8k.htm'), 'presentation');
  assert.equal(classifyEarningsDocument('form8k.htm', 'form8k.htm'), null);
  assert.equal(classifyEarningsDocument('0001045810-26-000019-index.html', 'form8k.htm'), null);
  assert.equal(classifyEarningsDocument('R1.htm', 'form8k.htm'), null);
  assert.equal(classifyEarningsDocument('credit-agreement.htm', 'form8k.htm'), null);
  assert.equal(classifyEarningsDocument('report.css', 'form8k.htm'), null);
});

test('pickEarningsDocumentsFallback rescata los anexos de un 8-K de resultados sin nombre convencional', () => {
  const items = [
    { name: '0001045810-26-000019-index.html' },
    { name: 'nvda-20260225.htm' },
    { name: 'q4fy26pr.htm' },
    { name: 'q4fy26cfocommentary.htm' },
    { name: 'nvdalogoa19.jpg' },
    { name: 'R1.htm' },
    { name: 'report.css' },
  ];
  const picked = pickEarningsDocumentsFallback(items, 'nvda-20260225.htm');
  assert.deepEqual(picked.map((item) => item.name).sort(), ['q4fy26cfocommentary.htm', 'q4fy26pr.htm']);
  assert.ok(picked.every((item) => item.docType === 'release'));
});
