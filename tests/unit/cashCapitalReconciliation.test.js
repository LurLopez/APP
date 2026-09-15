import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCashFlowBlock,
  normalizeCapitalBlock,
  buildCashFlowAdjustmentChain,
} from '../../src/agents/analyst/analystCashCapitalProcessor.js';

function buildAnnualHorizon() {
  return {
    label: 'EN TODO EL AÑO (12 MESES)',
    sales: {
      rows: [
        { name: 'EBT', normal: '9500M', adjusted: '10000M' },
        { name: 'Beneficio Neto', normal: '7000M' },
      ],
    },
    cashFlow: {
      scenarios: ['Normal', 'Ajustado'],
      rows: [
        { name: 'Cash Flow', values: ['9.415', '8.768,3'] },
        { name: 'CAPEX', values: ['3.274', '3.274'] },
        { name: 'FCF', values: ['6.141', '5.494,3'] },
        { name: 'FCF/Acción', values: ['4,37 $', '3,91 $'] },
        { name: 'Dividendo', values: ['4.930', '4.930'] },
        { name: 'Libre', values: ['1.211', '564,3'] },
      ],
      notes: [],
    },
  };
}

function buildPepsiExtracted() {
  return {
    shares: 1400,
    facts: { incomeTaxesPaidYtd: 2954.7, incomeTaxExpenseYtd: 2500 },
    workingCapitalData: {
      ytdScenarios: ['Normal (WC=-533)', 'Ajustado (WC=114)'],
      ytdValues: {
        cfo: ['9.415', '8.768,3'],
        capex: ['3.274', '3.274'],
        fcf: ['6.141', '5.494,3'],
        fcfPerShare: ['4,37 $', '3,91 $'],
        dividends: ['4.930', '4.930'],
        libre: ['1.211', '564,3'],
      },
      explanationYtd: '*1: WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) x (3 % + 0 %) = -533M. Desviación del circulante reportado (114M) frente al WK teórico (-533M): 646,7M. El Cash Flow ajustado resta esa desviación: 9415M - 646,7M = 8768,3M.',
    },
  };
}

test('buildCashFlowAdjustmentChain explicita los dos ajustes cuando el neto es pequeño', () => {
  const chain = buildCashFlowAdjustmentChain({
    normalCfo: 9415,
    afterWc: 8768.3,
    finalCfo: 9423,
    taxAdjustment: 654.7,
  });
  assert.match(chain, /9415M -646,7M \(circulante\) \+654,7M \(impuestos\) = 9423M/);
  assert.match(chain, /el efecto neto es de solo \+8M/i);
});

test('normalizeCashFlowBlock cierra la cadena de los dos ajustes en la nota *2 y no deja un neto engañoso', () => {
  const horizon = buildAnnualHorizon();
  const extracted = buildPepsiExtracted();

  normalizeCashFlowBlock(horizon, extracted);

  const cfoRow = horizon.cashFlow.rows.find((r) => r.name === 'Cash Flow');
  const fcfRow = horizon.cashFlow.rows.find((r) => r.name === 'FCF');
  assert.equal(cfoRow.values[1], '9423');
  assert.equal(fcfRow.values[1], '6149');

  const taxNote = horizon.cashFlow.notes.find((n) => n.startsWith('*2:'));
  assert.ok(taxNote, 'Debe existir la nota fiscal *2');
  assert.match(taxNote, /8768,3M|9415M/);
  assert.match(taxNote, /-646,7M \(circulante\) \+654,7M \(impuestos\) = 9423M/);
  assert.match(taxNote, /se cancelan en gran medida/i);
});

test('normalizeCapitalBlock añade la fila de efectivo restringido y cuadra el caso Pepsi 2018 (SodaStream escrow)', () => {
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    cashFlow: { rows: [{ name: 'Libre', values: ['1.211', '1.211'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '1.211' },
        { name: 'Inversiones a corto plazo', value: '8.701' },
        { name: 'Desinversiones', value: '505' },
        { name: 'Adquisiciones', value: '-1.496' },
        { name: 'Recompras', value: '-2.000' },
        { name: 'Caja', value: '1.889' },
        { name: 'Deuda', value: '-6.960' },
      ],
      notes: ['*1: Adquisiciones: SodaStream.', '*2: Deuda balance: ...'],
    },
  };
  const extracted = {
    balance: { restrictedCash: 1997, restrictedCashBeginningOfYear: 0 },
    capitalAllocationData: { ytd: { restrictedCashMovement: -1997, divestitures: 505, assetSales: 134 } },
  };

  normalizeCapitalBlock(horizon, extracted);

  const restrictedRow = horizon.capital.rows.find((r) => /restringid/i.test(r.name));
  assert.ok(restrictedRow, 'Debe añadirse la fila de efectivo restringido');
  assert.equal(restrictedRow.name, 'Efectivo restringido*3');
  assert.equal(restrictedRow.value, '-1997');

  const divestitureRow = horizon.capital.rows.find((r) => /desinver/i.test(r.name));
  assert.equal(divestitureRow.value, '639', 'Desinversiones debe sumar ventas de negocios (505) y de activos (134)');

  const totalIdx = horizon.capital.rows.findIndex((r) => /total/i.test(r.name));
  const restrictedIdx = horizon.capital.rows.findIndex((r) => /restringid/i.test(r.name));
  assert.ok(restrictedIdx < totalIdx, 'La fila debe ir antes de En total');

  const note = horizon.capital.notes.find((n) => n.startsWith('*3:'));
  assert.ok(note, 'Debe existir la nota del efectivo restringido');
  assert.match(note, /0M a 1997M/);
  assert.match(note, /-1997M/);
  assert.match(note, /escrow|restringido/i);

  const totalRow = horizon.capital.rows.find((r) => /total/i.test(r.name));
  assert.equal(totalRow.value, '-13');
  assert.match(horizon.capital.verification, /Más o menos cuadra/);
});

test('normalizeCapitalBlock indica el importe exacto del descuadre y su causa no monetaria', () => {
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    cashFlow: { rows: [{ name: 'Libre', values: ['100', '100'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '100' },
        { name: 'Recompras', value: '-2000' },
        { name: 'Caja', value: '500' },
      ],
      notes: [],
    },
  };
  const extracted = { capitalAllocationData: { ytd: {} } };

  normalizeCapitalBlock(horizon, extracted);

  assert.match(horizon.capital.verification, /No cuadra/);
  assert.match(horizon.capital.verification, /-1400M/);
  assert.match(horizon.capital.verification, /no monetarios|reclasificaciones/);
});
