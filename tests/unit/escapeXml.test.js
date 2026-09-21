import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeXml } from '../../src/utils/escapeXml.js';
import { esc } from '../../src/services/reportExport/exportColors.js';

test('escapeXml escapa los cinco caracteres reservados', () => {
  assert.equal(escapeXml(`&<>"'`), '&amp;&lt;&gt;&quot;&apos;');
});

test('escapeXml convierte valores nulos a cadena vacía y números a texto', () => {
  assert.equal(escapeXml(null), '');
  assert.equal(escapeXml(undefined), '');
  assert.equal(escapeXml(42), '42');
});

test('exportColors.esc delega en escapeXml', () => {
  assert.equal(esc(`Tom & "Jerry" <ok>`), 'Tom &amp; &quot;Jerry&quot; &lt;ok&gt;');
});
