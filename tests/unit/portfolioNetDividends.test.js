import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadNetDividends() {
  const code = readFileSync(new URL('../../public/js/portfolio/portfolioFormatting.js', import.meta.url), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(code, context);
  return context.window.PortfolioFormatting.netDividends;
}

test('netDividends aplica la retención por defecto del 20 %', () => {
  const netDividends = loadNetDividends();
  assert.equal(netDividends(1000), 800);
  assert.equal(netDividends(1000, null), 800);
  assert.equal(netDividends(1000, undefined), 800);
  assert.equal(netDividends(1000, 'texto'), 800);
});

test('netDividends respeta el porcentaje configurado', () => {
  const netDividends = loadNetDividends();
  assert.equal(netDividends(1000, 15), 850);
  assert.equal(netDividends(1000, 0), 1000);
  assert.equal(netDividends(1000, '18.5'), 815);
});

test('netDividends acota el porcentaje al rango 0-100', () => {
  const netDividends = loadNetDividends();
  assert.equal(netDividends(1000, 150), 0);
  assert.equal(netDividends(1000, -5), 1000);
});

test('netDividends devuelve 0 con importes inválidos', () => {
  const netDividends = loadNetDividends();
  assert.equal(netDividends(null, 20), 0);
  assert.equal(netDividends(undefined, 20), 0);
  assert.equal(netDividends('n/a', 20), 0);
});
