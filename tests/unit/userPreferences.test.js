import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWithholdingPct, DEFAULT_USER_PREFERENCES, DEFAULT_DIVIDEND_WITHHOLDING_PCT } from '../../db/repositories/watchlistRepositoryPrefs.js';

test('normalizeWithholdingPct usa el 20 % por defecto ante valores ausentes o inválidos', () => {
  assert.equal(normalizeWithholdingPct(null), 20);
  assert.equal(normalizeWithholdingPct(undefined), 20);
  assert.equal(normalizeWithholdingPct(''), 20);
  assert.equal(normalizeWithholdingPct('abc'), 20);
  assert.equal(DEFAULT_DIVIDEND_WITHHOLDING_PCT, 20);
});

test('normalizeWithholdingPct acepta números y cadenas numéricas', () => {
  assert.equal(normalizeWithholdingPct(15), 15);
  assert.equal(normalizeWithholdingPct('18.5'), 18.5);
  assert.equal(normalizeWithholdingPct(0), 0);
  assert.equal(normalizeWithholdingPct(100), 100);
});

test('normalizeWithholdingPct acota al rango 0-100 y redondea a dos decimales', () => {
  assert.equal(normalizeWithholdingPct(-10), 0);
  assert.equal(normalizeWithholdingPct(150), 100);
  assert.equal(normalizeWithholdingPct(19.129), 19.13);
});

test('las preferencias por defecto incluyen el cálculo neto de dividendos', () => {
  assert.equal(DEFAULT_USER_PREFERENCES.dividendWithholdingPct, 20);
  assert.equal(DEFAULT_USER_PREFERENCES.dividendNetEnabled, false);
});
