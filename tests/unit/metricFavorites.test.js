import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFavoritePayload } from '../../src/api/controllers/metricFavorites.controller.js';

test('normaliza una métrica favorita válida', () => {
  const result = normalizeFavoritePayload({ statement: 'income', key: 'revenue', label: 'Ingresos totales' });
  assert.deepEqual(result, { statement: 'income', key: 'revenue', label: 'Ingresos totales' });
});

test('acepta estado y clave recibidos por parámetro de ruta', () => {
  const result = normalizeFavoritePayload(null, 'cashflow', 'freeCashFlow');
  assert.deepEqual(result, { statement: 'cashflow', key: 'freeCashFlow', label: 'freeCashFlow' });
});

test('rechaza estados financieros fuera del conjunto permitido', () => {
  assert.equal(normalizeFavoritePayload({ statement: 'valuation', key: 'revenue', label: 'x' }), null);
  assert.equal(normalizeFavoritePayload(null, 'otro', 'revenue'), null);
});

test('acepta la pestaña de ratios', () => {
  const result = normalizeFavoritePayload(null, 'ratios', 'roa');
  assert.deepEqual(result, { statement: 'ratios', key: 'roa', label: 'roa' });
});

test('rechaza claves con formato no válido', () => {
  assert.equal(normalizeFavoritePayload(null, 'income', 'revenue; drop table'), null);
  assert.equal(normalizeFavoritePayload(null, 'income', ''), null);
  assert.equal(normalizeFavoritePayload(null, 'income', '1revenue'), null);
});

test('recorta la etiqueta al máximo permitido', () => {
  const result = normalizeFavoritePayload({ statement: 'balance', key: 'assets', label: 'a'.repeat(400) });
  assert.equal(result.label.length, 160);
});
