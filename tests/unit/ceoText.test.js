import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ceoMarketDataText } from '../../src/services/reportExport/ceoText.js';

test('devuelve null cuando no hay datos válidos', () => {
  assert.equal(ceoMarketDataText(null), null);
  assert.equal(ceoMarketDataText({}), null);
  assert.equal(ceoMarketDataText({ changeFirstSessionPct: 'N/D' }), null);
});

test('compone la frase completa con fecha, 3 sesiones y fuente', () => {
  const text = ceoMarketDataText({
    changeFirstSessionPct: 2.5,
    changeThreeSessionsPct: -1.25,
    announcementDate: '2024-05-01',
    source: 'Yahoo Finance',
  });
  assert.equal(
    text,
    'Cotización en torno al anuncio (2024-05-01): +2,5 % en la primera sesión y -1,25 % a 3 sesiones. Fuente: Yahoo Finance.',
  );
});

test('omite el tramo a 3 sesiones cuando no hay dato', () => {
  assert.equal(
    ceoMarketDataText({ changeFirstSessionPct: 1 }),
    'Cotización en torno al anuncio: +1 % en la primera sesión.',
  );
});
