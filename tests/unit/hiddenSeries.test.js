import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSeriesIds } from '../../src/api/controllers/hiddenSeries.controller.js';
import { DEFAULT_METRIC_FAVORITES } from '../../db/repositories/metricFavoriteRepository.js';
import { DISPLAY_STATEMENTS } from '../../src/services/edgar/statementDisplay.js';

test('acepta identificadores de serie válidos y elimina duplicados', () => {
  const result = normalizeSeriesIds(['buybacks__KHC', 'cfo__KHC', 'buybacks__KHC']);
  assert.deepEqual(result, ['buybacks__KHC', 'cfo__KHC']);
});

test('acepta la lista vacía (ninguna serie oculta)', () => {
  assert.deepEqual(normalizeSeriesIds([]), []);
});

test('rechaza identificadores con formato incorrecto', () => {
  assert.equal(normalizeSeriesIds(['buybacks']), null);
  assert.equal(normalizeSeriesIds(['buybacks__']), null);
  assert.equal(normalizeSeriesIds(['__KHC']), null);
  assert.equal(normalizeSeriesIds(['buybacks__KHC/../x']), null);
  assert.equal(normalizeSeriesIds(['1buybacks__KHC']), null);
  assert.equal(normalizeSeriesIds([42]), null);
  assert.equal(normalizeSeriesIds('buybacks__KHC'), null);
});

test('cada favorito por defecto existe en su estado financiero', () => {
  assert.ok(DEFAULT_METRIC_FAVORITES.length > 0);
  DEFAULT_METRIC_FAVORITES.forEach((favorite) => {
    const items = DISPLAY_STATEMENTS[favorite.statement] ?? [];
    const found = items.some((item) => item.key === favorite.key);
    assert.ok(found, `La métrica por defecto ${favorite.statement}:${favorite.key} no existe`);
    assert.ok(favorite.label && favorite.label.length <= 160);
  });
});

test('los favoritos por defecto no se repiten', () => {
  const ids = DEFAULT_METRIC_FAVORITES.map((favorite) => `${favorite.statement}:${favorite.key}`);
  assert.equal(new Set(ids).size, ids.length);
});
