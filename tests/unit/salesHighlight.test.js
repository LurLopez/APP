import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAdjustedCells, parseHighlightNumber } from '../../src/utils/salesHighlight.js';
import { renderTableSsr } from '../../src/services/seo/reportSsrHtml.js';
import { buildSalesSection } from '../../src/services/reportExport/reportSections.js';
import { normalizeSalesBlock } from '../../src/agents/analyst/analystSalesProcessor.js';
import { runDeterministicChecks } from '../../src/agents/auditor/deterministicChecks.js';

// Caso real PEP 2026-Q3: el único ajuste (deterioro de la marca Rockstar, 133M) es del periodo
// comparable; el trimestre actual no tuvo ajuste (Ajustado = Normal), así que el resalte y la
// nota *1 deben pintarse en «Anterior Aj.» y nunca en «Ajustado».
const pepRow = {
  name: 'Beneficio Operativo',
  adjusted: '4260M',
  prevAdjusted: '3702M',
  pctAdjusted: '+15,07 %',
  normal: '4260M',
  prevNormal: '3569M',
  pctNormal: '+19,36 %',
  isAdjusted: true,
  adjustedNote: '*1',
};

test('parseHighlightNumber interpreta cifras con sufijo, signo y separadores', () => {
  assert.equal(parseHighlightNumber('4260M'), 4260);
  assert.equal(parseHighlightNumber('-1.234,5M'), -1234.5);
  assert.equal(parseHighlightNumber('+648,9 %'), 648.9);
  assert.equal(parseHighlightNumber('—'), null);
  assert.equal(parseHighlightNumber(null), null);
});

test('resolveAdjustedCells infiere «Anterior Aj.» cuando el ajuste es del año anterior (caso PEP 2026-Q3)', () => {
  assert.deepEqual(resolveAdjustedCells(pepRow), { current: false, previous: true });
});

test('resolveAdjustedCells respeta la columna declarada y el ajuste del periodo actual', () => {
  assert.deepEqual(resolveAdjustedCells({ ...pepRow, adjustedCell: 'previous' }), { current: false, previous: true });
  assert.deepEqual(resolveAdjustedCells({ ...pepRow, adjustedCell: 'current' }), { current: true, previous: false });
  assert.deepEqual(resolveAdjustedCells({ ...pepRow, adjustedCell: 'both' }), { current: true, previous: true });
  const current = { adjusted: '520M', normal: '485M', prevAdjusted: '560M', prevNormal: '560M', isAdjusted: true, adjustedNote: '*1' };
  assert.deepEqual(resolveAdjustedCells(current), { current: true, previous: false });
  assert.deepEqual(resolveAdjustedCells({ ...current, isAdjusted: false }), { current: false, previous: false });
});

test('renderTableSsr pinta el resalte en «Anterior Aj.» y no en «Ajustado» (caso PEP 2026-Q3)', () => {
  const headers = ['Métrica', 'Ajustado', 'Anterior Aj.', '% Ajustado', 'Normal', 'Anterior N.', '% Normal'];
  const row = ['Beneficio Operativo', '4260M', '3702M', '+15,07 %', '4260M', '3569M', '+19,36 %'];
  const html = renderTableSsr(headers, [row], [pepRow], { isSales: true, boldColumns: [1, 4], percentColumns: [3, 6] });
  assert.match(html, /highlight-adjust[^>]*>3702M</, 'La celda 3702M (Anterior Aj.) debe ir resaltada');
  assert.doesNotMatch(html, /highlight-adjust[^>]*>4260M</, 'La celda 4260M (Ajustado/Normal) no debe ir resaltada');
});

test('buildSalesSection colorea la celda «Anterior Aj.» en HTML/DOCX/ODT (caso PEP 2026-Q3)', () => {
  const section = buildSalesSection({ rows: [pepRow], notes: ['*1: Deterioro del año anterior.'], shares: '1364M', eps: '2,23 $' }, 'es');
  const cells = section.table.rows[0];
  assert.equal(cells[1].bg, '#f3f4f6', 'La celda Ajustado queda sin resalte (fondo cebra)');
  assert.equal(cells[2].bg, '#fef08a', 'La celda Anterior Aj. lleva el color de la nota *1');
  const declared = buildSalesSection({ rows: [{ ...pepRow, adjustedCell: 'current', adjusted: '4350M' }], notes: [], shares: '1364M', eps: '2,23 $' }, 'es');
  assert.equal(declared.table.rows[0][1].bg, '#fef08a', 'Con adjustedCell=current el resalte vuelve a Ajustado');
});

test('normalizeSalesBlock fija adjustedCell=previous para el ajuste del año anterior (caso PEP 2026-Q3)', () => {
  const horizon = {
    label: 'ÚLTIMOS 3 MESES',
    sales: {
      rows: [
        { name: 'Ventas', adjusted: '25274M', prevAdjusted: '23937M', pctAdjusted: '+5,59 %', normal: '25274M', prevNormal: '23937M', pctNormal: '+5,59 %' },
        { name: 'Beneficio Operativo', adjusted: '4260M', prevAdjusted: '3702M', pctAdjusted: '+15,07 %', normal: '4260M', prevNormal: '3569M', pctNormal: '+19,36 %', isAdjusted: true, adjustedNote: '*1' },
      ],
      notes: ['*1: El año anterior tuvieron un deterioro de intangibles (marca Rockstar) de 133M.'],
      shares: '1364M',
      eps: '2,23 $',
    },
  };
  const extracted = {
    quarter: { sales: 25274, operatingIncome: 4260, prev: { sales: 23937, operatingIncome: 3569 } },
    facts: {},
  };
  normalizeSalesBlock(horizon, extracted);
  assert.equal(horizon.sales.rows[1].adjustedCell, 'previous');
});

test('normalizeSalesBlock fija adjustedCell=current para el ajuste del periodo actual', () => {
  const horizon = {
    label: 'ÚLTIMOS 3 MESES',
    sales: {
      rows: [
        { name: 'Ventas', adjusted: '1000M', prevAdjusted: '900M', normal: '1000M', prevNormal: '900M' },
        { name: 'Beneficio Operativo', adjusted: '150M', prevAdjusted: '120M', normal: '100M', prevNormal: '120M', isAdjusted: true, adjustedNote: '*1' },
      ],
      notes: ['*1: Ha habido un deterioro de 50M.'],
      shares: '100M',
      eps: '1,00 $',
    },
  };
  const extracted = { quarter: { sales: 1000, operatingIncome: 100, prev: { sales: 900, operatingIncome: 120 } }, facts: {} };
  normalizeSalesBlock(horizon, extracted);
  assert.equal(horizon.sales.rows[1].adjustedCell, 'current');
});

test('la comprobación determinista avisa cuando el resalte apunta a la columna equivocada', () => {
  const salesRow = { ...pepRow, adjustedCell: 'current' };
  const report = {
    horizons: [
      {
        label: 'ÚLTIMOS 3 MESES',
        sales: {
          rows: [
            { name: 'Ventas', adjusted: '25274M', prevAdjusted: '23937M', normal: '25274M', prevNormal: '23937M' },
            { name: 'Beneficio Bruto', adjusted: '13754M', prevAdjusted: '12824M', normal: '13754M', prevNormal: '12824M' },
            salesRow,
            { name: 'EBT', adjusted: '3904M', prevAdjusted: '3464M', normal: '3904M', prevNormal: '3331M' },
            { name: 'Beneficio Neto', adjusted: '3048M', prevAdjusted: '2667M', normal: '3048M', prevNormal: '2603M' },
          ],
          notes: ['*1: El año anterior tuvieron un deterioro de intangibles (marca Rockstar) de 133M.'],
          shares: '1364M',
          eps: '2,23 $',
        },
        cashFlow: { scenarios: ['Normal (WC=0)', 'Ajustado*1 (WC=0)'], rows: [], notes: [] },
        capital: { rows: [{ name: 'Libre', value: '0' }, { name: 'En total', value: '0' }], notes: [], verification: '' },
      },
    ],
  };
  const { findings } = runDeterministicChecks(report);
  assert.ok(
    findings.some((item) => item.check === 'ventas.resalte_columna'),
    'Debe avisar de que el resalte está en «Ajustado» cuando el ajuste nació en «Anterior Ajustado»',
  );
});
