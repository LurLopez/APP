import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadEscapeHtml() {
  const code = readFileSync(new URL('../../public/js/shared/htmlUtils.js', import.meta.url), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(code, context);
  return context.window.HtmlUtils.escapeHtml;
}

test('escapeHtml escapa comillas simples y dobles', () => {
  const escapeHtml = loadEscapeHtml();
  assert.equal(
    escapeHtml(`<b class="x">'&'</b>`),
    '&lt;b class=&quot;x&quot;&gt;&#039;&amp;&#039;&lt;/b&gt;',
  );
});

test('escapeHtml convierte null y undefined a cadena vacía', () => {
  const escapeHtml = loadEscapeHtml();
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});
