import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSnippetCellEmpty, stripEmptySnippetColumns } from '../../src/agents/analyst/snippetHelpers.js';
import { applyQuarterNotes } from '../../src/agents/analyst/analystRunSteps.js';
import { processOutlookSection } from '../../src/agents/analyst/annualConclusionSections.js';

const CPB_TABLE = {
  title: 'Guidance oficial del trimestre',
  summary: 'Tabla de previsiones publicada por la compañía',
  headers: ['Métrica', 'Año anterior', 'Guidance anterior', 'Guidance actual'],
  rows: [
    ['Ingresos orgánicos', '—', '+2 % a +4 %', 'Aproximadamente +3 %'],
    ['BPA core', '—', 'Extremo inferior de +5 % a +7 %', '+2,5 % a +3,5 %'],
    ['CAPEX', '—', 'Por debajo del 5 % de los ingresos netos', 'Por debajo del 5 % de los ingresos netos'],
  ],
};

test('isSnippetCellEmpty reconoce marcadores de "sin datos"', () => {
  assert.equal(isSnippetCellEmpty('—'), true);
  assert.equal(isSnippetCellEmpty(' - '), true);
  assert.equal(isSnippetCellEmpty(''), true);
  assert.equal(isSnippetCellEmpty(null), true);
  assert.equal(isSnippetCellEmpty('N/A'), true);
  assert.equal(isSnippetCellEmpty('Sin datos'), true);
  assert.equal(isSnippetCellEmpty('+3 %'), false);
  assert.equal(isSnippetCellEmpty('3.300M - 3.350M'), false);
});

test('elimina la columna «Año anterior» cuando todas sus celdas están vacías', () => {
  const stripped = stripEmptySnippetColumns(CPB_TABLE);
  assert.deepEqual(stripped.headers, ['Métrica', 'Guidance anterior', 'Guidance actual']);
  assert.deepEqual(stripped.rows[0], ['Ingresos orgánicos', '+2 % a +4 %', 'Aproximadamente +3 %']);
  assert.deepEqual(stripped.rows[2], ['CAPEX', 'Por debajo del 5 % de los ingresos netos', 'Por debajo del 5 % de los ingresos netos']);
});

test('conserva la columna si al menos una métrica tiene dato real', () => {
  const table = {
    headers: ['Métrica', 'Año anterior', 'Guidance actual'],
    rows: [
      ['Ventas', '$16,603M', 'Flat'],
      ['BPA', '—', '$2.25 - $2.30'],
    ],
  };
  const stripped = stripEmptySnippetColumns(table);
  assert.deepEqual(stripped.headers, ['Métrica', 'Año anterior', 'Guidance actual']);
  assert.deepEqual(stripped.rows, table.rows);
});

test('no modifica la tabla cuando todas las columnas tienen datos', () => {
  const table = {
    headers: ['Métrica', 'Año anterior', 'Guidance actual'],
    rows: [['Ventas', '$16,603M', 'Flat']],
  };
  assert.strictEqual(stripEmptySnippetColumns(table), table);
});

test('nunca elimina la primera columna ni toca filas que no son arrays', () => {
  const table = {
    headers: ['Métrica', 'Año anterior'],
    rows: [['Ventas', '—']],
  };
  assert.strictEqual(stripEmptySnippetColumns(table), table);

  const objectRows = {
    headers: ['Métrica', 'Año anterior'],
    rows: [{ metric: 'Ventas', value: '—' }],
  };
  assert.strictEqual(stripEmptySnippetColumns(objectRows), objectRows);
});

test('applyQuarterNotes elimina la columna vacía del guidance trimestral', () => {
  const result = {};
  const extracted = {
    quarterDetails: {
      guidance: {
        mentioned: true,
        status: 'maintained',
        text: 'La dirección mantiene el guidance anual.',
        secTable: CPB_TABLE,
      },
    },
  };
  applyQuarterNotes(result, extracted, 'es');
  const snippet = result.quarterNotes.guidance.secSnippet;
  assert.deepEqual(snippet.headers, ['Métrica', 'Guidance anterior', 'Guidance actual']);
  assert.equal(snippet.rows.every((row) => row.length === 3), true);
});

test('processOutlookSection elimina la columna «Año anterior» vacía del outlook anual', () => {
  const conclusion = { outlook: { text: 'La dirección proyecta ventas planas.' } };
  const rawAnn = {
    outlook: {
      guidanceSales: 'Flat',
      secTable: {
        title: '2027 Guidance / Full Year Outlook',
        headers: ['Métrica', '2026 (Año anterior)', 'Guidance 2027E*', 'Cifra Proyectada 2027E'],
        rows: [
          ['Ventas netas', '—', 'Flat', '~$16.600M'],
          ['BPA', '—', '$2.25 - $2.30', '~$2.25 - $2.30'],
        ],
      },
    },
  };
  processOutlookSection(conclusion, rawAnn, {}, 'es');
  const snippet = conclusion.outlook.secSnippet;
  assert.deepEqual(snippet.headers, ['Métrica', 'Guidance 2027E*', 'Cifra Proyectada 2027E']);
  assert.deepEqual(snippet.rows[0], ['Ventas netas', 'Flat', '~$16.600M']);
});
