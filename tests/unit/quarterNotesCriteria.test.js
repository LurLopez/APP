import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXTRACTION_PROMPT } from '../../src/agents/analyst/analystExtractionPrompt.js';
import { SYSTEM_PROMPT } from '../../src/agents/analyst/analystSystemPrompt.js';
import { AUDITOR_SYSTEM_PROMPT } from '../../src/agents/auditor/auditorPrompt.js';

test('la extracción solo admite hechos muy importantes de la lista cerrada', () => {
  assert.match(EXTRACTION_PROMPT, /LISTA CERRADA/);
  assert.match(EXTRACTION_PROMPT, /1 % de las acciones en circulación/);
  assert.match(EXTRACTION_PROMPT, /planes antiguos sin novedad/);
  assert.doesNotMatch(EXTRACTION_PROMPT, /≥ 25M\$/);
});

test('la estructuración mantiene la lista cerrada y la regla del 1 % de recompras', () => {
  assert.match(SYSTEM_PROMPT, /LISTA CERRADA/);
  assert.match(SYSTEM_PROMPT, /1 % de las acciones en circulación/);
  assert.match(SYSTEM_PROMPT, /planes antiguos/);
});

test('el auditor exige la lista cerrada y marca las notas de relleno', () => {
  assert.match(AUDITOR_SYSTEM_PROMPT, /lista cerrada/);
  assert.match(AUDITOR_SYSTEM_PROMPT, /1 % de las acciones en circulación/);
  assert.match(AUDITOR_SYSTEM_PROMPT, /error de relleno/);
});

test('la regla del nivel de notas del trimestre queda alineada', () => {
  const md = readFileSync(new URL('../../src/agents/knowledge/notas/trimestral.md', import.meta.url), 'utf8');
  assert.match(md, /lista cerrada/);
  assert.match(md, /1 % de las acciones en circulación/);
  assert.doesNotMatch(md, /≥ 25M\$/);
});
