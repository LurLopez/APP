import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCashFlowBlock,
  normalizeCapitalBlock,
  buildCashFlowAdjustmentChain,
} from '../../src/agents/analyst/analystCashCapitalProcessor.js';
import { visibleCapitalRows } from '../../src/utils/capitalRows.js';
import { buildCapitalAllocationFromBalance } from '../../src/agents/analyst/capitalAllocationHelpers.js';
import { rederiveCashValues } from '../../src/services/edgar/rederiveStatements.js';

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

test('buildCashFlowAdjustmentChain explicita los dos ajustes cuando el neto es pequeño', () => {  const chain = buildCashFlowAdjustmentChain({
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

test('normalizeCapitalBlock no pinta el efectivo restringido como fila (Pepsi 2018, SodaStream escrow)', () => {
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

  assert.ok(!horizon.capital.rows.some((r) => /restringid/i.test(r.name)), 'El efectivo restringido no se pinta como fila');

  const divestitureRow = horizon.capital.rows.find((r) => /desinver/i.test(r.name));
  assert.equal(divestitureRow.value, '639', 'Desinversiones debe sumar ventas de negocios (505) y de activos (134)');

  const totalRow = horizon.capital.rows.find((r) => /total/i.test(r.name));
  assert.equal(totalRow.value, '1984', 'El cuadre incluye el hueco del escrow, que no se pinta como fila');
  assert.match(horizon.capital.verification, /Más o menos cuadra/);
  assert.match(horizon.capital.verification, /efectivo restringido \(consignaciones o liberaciones\) -1997M/);
  assert.match(horizon.capital.verification, /Con ellos, el resto sin explicar sería -13M, dentro del margen razonable/);
});

test('normalizeCapitalBlock elimina las filas a 0 y la deuda asumida inventada (caso CAG 2026)', () => {
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    cashFlow: { rows: [{ name: 'Libre', values: ['309'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '309' },
        { name: 'Inversiones a corto plazo', value: '0' },
        { name: 'Desinversiones', value: '648,9' },
        { name: 'Adquisiciones', value: '0' },
        { name: 'Recompras', value: '-15,3' },
        { name: 'Efectivo restringido', value: '0' },
        { name: 'Emisión de preferentes', value: '0' },
        { name: 'Venta de participaciones', value: '0' },
        { name: 'Deuda asumida (no-cash)', value: '-799,2' },
        { name: 'Caja', value: '-150' },
        { name: 'Deuda', value: '-799,2' },
        { name: 'En total', value: '-805,8' },
      ],
      notes: ['*1: Deuda asumida (no-cash): se asume con la compra.'],
      verification: '',
    },
  };
  const extracted = {
    capitalAllocationData: {
      ytd: {
        deuda: -799.2,
        caja: -150,
        inversionesCortoPlazo: 0,
        divestitures: 648.9,
        assetSales: 0,
        buybacks: -15.3,
        acquisitions: 0,
        preferredIssuance: 0,
        nonControllingSale: 0,
        assumedDebt: 0,
      },
    },
  };

  normalizeCapitalBlock(horizon, extracted);

  assert.deepEqual(horizon.capital.rows.map((r) => r.name.replace(/\*\d+/g, '').trim()), [
    'Libre', 'Desinversiones', 'Caja', 'Deuda', 'En total',
  ]);
  const totalRow = horizon.capital.rows.find((r) => /total/i.test(r.name));
  assert.equal(totalRow.value, '8,7', 'El total no debe duplicar la variación de deuda');
  assert.match(horizon.capital.verification, /Más o menos cuadra/);
  assert.ok(!horizon.capital.notes.some((n) => /asumida/i.test(n)), 'La nota de la fila eliminada no debe quedar huérfana');
});

test('normalizeCapitalBlock añade la deuda asumida (no-cash) del sistema con su nota cuando existe', () => {
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    cashFlow: { rows: [{ name: 'Libre', values: ['255'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '255' },
        { name: 'Adquisiciones', value: '-16615' },
        { name: 'Caja', value: '-491' },
        { name: 'Deuda', value: '13839' },
        { name: 'En total', value: '-3012' },
      ],
      notes: [],
      verification: '',
    },
  };
  const extracted = {
    capitalAllocationData: {
      ytd: {
        deuda: 13839,
        caja: -491,
        acquisitions: -16615,
        divestitures: 0,
        assetSales: 0,
        buybacks: 0,
        preferredIssuance: 4395,
        nonControllingSale: 3899,
        inversionesCortoPlazo: 0,
        assumedDebt: 4819,
      },
    },
  };

  normalizeCapitalBlock(horizon, extracted);

  const assumedRow = horizon.capital.rows.find((r) => /asumid/i.test(r.name));
  assert.ok(assumedRow, 'Debe existir la fila de deuda asumida');
  assert.equal(assumedRow.value, '-4819');
  assert.match(assumedRow.name, /\*\d+$/);
  const note = horizon.capital.notes.find((n) => /asumid/i.test(n));
  assert.ok(note, 'Debe existir la nota de la deuda asumida');
  assert.match(note, /4819M/);
  const totalRow = horizon.capital.rows.find((r) => /total/i.test(r.name));
  assert.equal(totalRow.value, '463');
  assert.match(horizon.capital.verification, /Más o menos cuadra/);
});

test('normalizeCapitalBlock fuerza los valores del sistema y elimina filas que el sistema calcula a 0', () => {
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    cashFlow: { rows: [{ name: 'Libre', values: ['100'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '100' },
        { name: 'Emisión de preferentes', value: '999' },
        { name: 'Caja', value: '-1' },
        { name: 'Deuda', value: '5' },
        { name: 'En total', value: '0' },
      ],
      notes: [],
      verification: '',
    },
  };
  const extracted = {
    capitalAllocationData: {
      ytd: { deuda: -200, caja: -50, preferredIssuance: 0, nonControllingSale: 0, buybacks: 0, acquisitions: 0 },
    },
  };

  normalizeCapitalBlock(horizon, extracted);

  assert.ok(!horizon.capital.rows.some((r) => /preferent/i.test(r.name)), 'La fila inventada debe eliminarse');
  assert.equal(horizon.capital.rows.find((r) => /^deuda/i.test(r.name)).value, '-200');
  assert.equal(horizon.capital.rows.find((r) => /^caja/i.test(r.name)).value, '-50');
});

test('normalizeCapitalBlock elimina la fila Recompras cuando son inmateriales (< 50M)', () => {
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    cashFlow: { rows: [{ name: 'Libre', values: ['309'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '309' },
        { name: 'Desinversiones', value: '687,8' },
        { name: 'Recompras', value: '-15,3' },
        { name: 'Caja', value: '-150' },
        { name: 'Deuda', value: '-799,2' },
        { name: 'En total', value: '-805,8' },
      ],
      notes: [],
    },
  };
  const extracted = { capitalAllocationData: { ytd: { deuda: -799.2, caja: -150, buybacks: -15.3, divestitures: 687.8, assetSales: 0 } } };

  normalizeCapitalBlock(horizon, extracted);

  assert.ok(!horizon.capital.rows.some((r) => /recompra/i.test(r.name)), 'La recompra inmaterial no debe aparecer');
  assert.equal(horizon.capital.rows.find((r) => /total/i.test(r.name)).value, '47,6');
  assert.match(horizon.capital.verification, /Más o menos cuadra/);
});

test('el efectivo restringido suma las partes corriente y no corriente (caso KHC 2026)', () => {
  const rows = [
    { periodEnd: '2026-03-28', values: { cash: 3308e6, restrictedCashCurrent: 165e6, restrictedCashNoncurrent: 143e6 } },
    { periodEnd: '2026-06-27', values: { cash: 2419e6, restrictedCashCurrent: 164e6, restrictedCashNoncurrent: 106e6 } },
  ];
  rederiveCashValues([], rows);
  assert.equal(rows[0].values.restrictedCash, 308e6);
  assert.equal(rows[1].values.restrictedCash, 270e6);

  const totalRow = [{ periodEnd: '2026-03-28', values: { restrictedCash: 500e6, restrictedCashCurrent: 200e6, restrictedCashNoncurrent: 300e6 } }];
  rederiveCashValues([], totalRow);
  assert.equal(totalRow[0].values.restrictedCash, 500e6, 'Si el total ya cubre las partes, no se duplica');
});

test('buildCapitalAllocationFromBalance detecta el movimiento no monetario de deuda (caso KHC 2026-Q2)', () => {
  const extracted = {
    fiscalQuarter: 2,
    fiscalYear: 2026,
    balance: {
      totalDebt: 19001,
      totalDebtPreviousQuarter: 21133,
      cash: 2419,
      cashPreviousQuarter: 3308,
      shortTermInvestments: 262,
      shortTermInvestmentsPreviousQuarter: 783,
      restrictedCash: 270,
      restrictedCashPreviousQuarter: 308,
    },
    systemDebtCash: { ytd: -1829, quarter: -1829 },
  };
  const data = buildCapitalAllocationFromBalance(extracted);
  assert.equal(data.threeMonths.deuda, -2132);
  assert.equal(data.threeMonths.nonCashDebt, -303, '2.132M de caída de balance frente a 1.829M de caja: 303M no monetarios');
  assert.equal(data.threeMonths.restrictedCashMovement, 0, 'La variación de efectivo restringido (38M) queda por debajo del umbral de 50M');
});

test('buildCapitalAllocationFromBalance no inventa la deuda no monetaria si la divergencia no es explicable', () => {
  const base = {
    fiscalQuarter: 2,
    balance: { totalDebt: 19001, totalDebtPreviousQuarter: 21133 },
  };
  const tiny = buildCapitalAllocationFromBalance({
    ...base,
    systemDebtCash: { ytd: -1829, quarter: -1829 },
  });
  assert.equal(tiny.threeMonths.nonCashDebt, -303);

  // Divergencia pequeña (3,8 % de la variación): caso TAP 2026-Q2.
  const small = buildCapitalAllocationFromBalance({
    ...base,
    balance: { totalDebt: 7709.6, totalDebtPreviousQuarter: 6271.9 },
    systemDebtCash: { ytd: 1465.9, quarter: 1492.6 },
  });
  assert.equal(small.threeMonths.nonCashDebt, 0);

  // Signos opuestos (el balance sube y el flujo de deuda baja): caso PEP 2026-Q2.
  const opposite = buildCapitalAllocationFromBalance({
    ...base,
    balance: { totalDebt: 53214, totalDebtPreviousQuarter: 52728 },
    systemDebtCash: { ytd: 753, quarter: -582 },
  });
  assert.equal(opposite.threeMonths.nonCashDebt, 0);

  // Divergencia demasiado grande (posible fuente incompleta): caso PEP acumulado.
  const tooBig = buildCapitalAllocationFromBalance({
    ...base,
    balance: { totalDebt: 53214, totalDebtBeginningOfYear: 49182 },
    systemDebtCash: { ytd: 753, quarter: -582 },
  });
  assert.equal(tooBig.ytd.nonCashDebt, 0);
});

test('normalizeCapitalBlock explica la deuda no monetaria bajo la tabla y no como fila (caso KHC)', () => {
  const horizon = {
    label: 'ÚLTIMOS 3 MESES',
    cashFlow: { rows: [{ name: 'Libre', values: ['418'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '418' },
        { name: 'Inversiones a corto plazo', value: '521' },
        { name: 'Caja', value: '889' },
        { name: 'Deuda', value: '-2132' },
      ],
      notes: [],
      verification: '',
    },
  };
  const extracted = {
    capitalAllocationData: {
      threeMonths: {
        deuda: -2132,
        caja: 889,
        inversionesCortoPlazo: 521,
        nonCashDebt: -303,
        debtDelta: -2132,
        debtCashFlow: -1829,
      },
    },
  };

  normalizeCapitalBlock(horizon, extracted);

  assert.ok(!horizon.capital.rows.some((r) => /no monetaria/i.test(r.name)), 'La deuda no monetaria no se pinta como fila');
  const totalRow = horizon.capital.rows.find((r) => /total/i.test(r.name));
  assert.equal(totalRow.value, '-304', '418 + 521 + 889 - 2.132 = -304 (sin movimientos no monetarios)');
  // El hueco de 304M queda dentro del umbral (10 % de la suma bruta = 396M), pero se explica igualmente.
  assert.match(horizon.capital.verification, /Más o menos cuadra/);
  assert.match(horizon.capital.verification, /deuda no monetaria/i);
  assert.match(horizon.capital.verification, /\+303M/);
  assert.match(horizon.capital.verification, /Con ellos, el resto sin explicar sería -1M, dentro del margen razonable/);
});

test('normalizeCapitalBlock cierra en «más o menos cuadra» cuando los movimientos no monetarios explican el hueco', () => {
  const horizon = {
    label: 'ÚLTIMOS 3 MESES',
    cashFlow: { rows: [{ name: 'Libre', values: ['100'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '100' },
        { name: 'Caja', value: '200' },
        { name: 'Deuda', value: '-800' },
      ],
      notes: [],
      verification: '',
    },
  };
  const extracted = {
    capitalAllocationData: {
      threeMonths: {
        deuda: -800,
        caja: 200,
        nonCashDebt: -500,
        debtDelta: -800,
        debtCashFlow: -300,
      },
    },
  };

  normalizeCapitalBlock(horizon, extracted);

  assert.ok(!horizon.capital.rows.some((r) => /no monetaria/i.test(r.name)));
  const totalRow = horizon.capital.rows.find((r) => /total/i.test(r.name));
  assert.equal(totalRow.value, '-500');
  assert.match(horizon.capital.verification, /Más o menos cuadra/);
  assert.match(horizon.capital.verification, /deuda no monetaria/i);
  assert.match(horizon.capital.verification, /\+500M/);
  assert.match(horizon.capital.verification, /Con ellos, el resto sin explicar sería \+0M, dentro del margen razonable/i);
  assert.doesNotMatch(horizon.capital.verification, /No cuadra/);
});

test('visibleCapitalRows oculta las filas a 0 y conserva Libre y En total', () => {
  const rows = [
    { name: 'Libre', value: '0' },
    { name: 'Inversiones a corto plazo', value: '0' },
    { name: 'Recompras', value: '0,0' },
    { name: 'Desinversiones', value: '+648,9' },
    { name: 'Caja*1', value: '-150' },
    { name: 'En total', value: '0' },
    { name: 'Deuda', value: '—' },
  ];
  assert.deepEqual(visibleCapitalRows(rows).map((r) => r.name), ['Libre', 'Desinversiones', 'Caja*1', 'En total', 'Deuda']);
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

test('normalizeCapitalBlock pinta el escrow que financia la adquisición y enlaza la financiación previa (caso KDP 2026-Q2)', () => {
  const extracted = {
    balance: { restrictedCash: 36, restrictedCashPreviousQuarter: 17818 },
    capitalAllocationData: {
      ytd: { preferredIssuance: 4395, nonControllingSale: 3899 },
      threeMonths: {
        deuda: 4273,
        caja: -619,
        acquisitions: -16615,
        assumedDebt: 4819,
        restrictedCashMovement: 17782,
        nonCashDebt: 0,
        debtDetails: 'Deuda balance: 25707M -> 29980M (+4273M). Deuda neta: 24809M -> 28463M (+3654M)',
        cashDetails: 'Caja balance: 898M (Q1) -> 1517M (Q2) (+619M); la caja aumentó: uso de capital (-); fila Caja = -619M.',
      },
    },
  };
  const horizon = {
    label: 'ÚLTIMOS 3 MESES',
    cashFlow: { rows: [{ name: 'Libre', values: ['348'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '348' },
        { name: 'Deuda*1', value: '4273' },
        { name: 'Caja*1', value: '-619' },
        { name: 'En total', value: '4002' },
      ],
      notes: ['*1: Deuda balance: 25707M -> 29980M (+4273M). Deuda neta: 24809M -> 28463M (+3654M) Caja balance: 898M (Q1) -> 1517M (Q2) (+619M); la caja aumentó: uso de capital (-); fila Caja = -619M.'],
      verification: '',
    },
  };

  normalizeCapitalBlock(horizon, extracted);

  const values = Object.fromEntries(horizon.capital.rows.map((row) => [row.name.replace(/\*\d+$/, ''), row.value]));
  assert.equal(values['Libre'], '348');
  assert.equal(values['Adquisiciones'], '-16615');
  assert.equal(values['Deuda'], '4273');
  assert.equal(values['Deuda asumida (no-cash)'], '-4819');
  assert.equal(values['Caja'], '-619');
  assert.equal(values['Efectivo restringido (escrow)'], '17782', 'El escrow que financia la compra se pinta como fila');
  assert.equal(values['En total'], '350', '348 - 16.615 + 4.273 - 4.819 - 619 + 17.782 = 350');
  assert.match(horizon.capital.verification, /Más o menos cuadra/);
  assert.doesNotMatch(horizon.capital.verification, /No cuadra/);
  assert.doesNotMatch(horizon.capital.verification, /21784/);

  const escrowNote = horizon.capital.notes.find((note) => /efectivo restringido pasa de/i.test(note));
  assert.ok(escrowNote, 'Debe existir la nota determinista del escrow');
  assert.match(escrowNote, /17818M a 36M/);
  assert.match(escrowNote, /liberación de 17782M financió la adquisición del periodo \(16615M\)/);
  assert.match(escrowNote, /emisión de preferentes \(\+4395M\)/);
  assert.match(escrowNote, /venta de participaciones \(\+3899M\)/);
});

test('normalizeCapitalBlock avisa cuando los movimientos no monetarios no reducen el descuadre', () => {
  const extracted = {
    capitalAllocationData: {
      threeMonths: { deuda: 4273, caja: -619, restrictedCashMovement: 17782 },
    },
  };
  const horizon = {
    label: 'ÚLTIMOS 3 MESES',
    cashFlow: { rows: [{ name: 'Libre', values: ['348'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '348' },
        { name: 'Deuda', value: '4273' },
        { name: 'Caja', value: '-619' },
      ],
      notes: [],
      verification: '',
    },
  };

  normalizeCapitalBlock(horizon, extracted);

  const totalRow = horizon.capital.rows.find((row) => /total/i.test(row.name));
  assert.equal(totalRow.value, '4002');
  assert.match(horizon.capital.verification, /efectivo restringido \(consignaciones o liberaciones\) \+17782M/);
  assert.match(horizon.capital.verification, /no reducen el descuadre/);
  assert.doesNotMatch(horizon.capital.verification, /explican el descuadre/, 'No puede afirmar que explican un descuadre que amplían');
});

test('la cabecera Ajustado lleva la llamada *1 y la nota del circulante usa WC (caso KDP)', () => {
  const horizon = {
    label: 'ÚLTIMOS 3 MESES',
    cashFlow: {
      scenarios: ['Normal (WC=414)', 'Ajustado (WC=-8)'],
      rows: [
        { name: 'Cash Flow', values: ['1082', '659,6'] },
        { name: 'CAPEX', values: ['189', '189'] },
        { name: 'FCF', values: ['893', '470,6'] },
        { name: 'FCF/Acción', values: ['0,75 $', '0,40 $'] },
        { name: 'Dividendo', values: ['475', '475'] },
        { name: 'Libre', values: ['418', '-4,4'] },
      ],
      notes: [],
    },
  };
  const extracted = {
    shares: 1300,
    workingCapitalData: {
      quarterScenarios: ['Normal (WC=414)', 'Ajustado (WC=-8)'],
      quarterValues: {
        cfo: ['1082', '659,6'],
        capex: ['189', '189'],
        fcf: ['893', '470,6'],
        fcfPerShare: ['0,75 $', '0,40 $'],
        dividends: ['475', '475'],
        libre: ['418', '-4,4'],
      },
      explanation3M: '*1: WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (4478 - 3308 - 2286) × (3% + 0%) = -33,5M en todo el año -> en 3 meses = -8,4M. Desviación del circulante reportado (414M) frente al WK teórico (-8,4M): 422,4M. El Cash Flow tras el ajuste de circulante queda en: 1082M - (422,4M) = 659,6M.',
    },
  };

  normalizeCashFlowBlock(horizon, extracted);

  assert.equal(horizon.cashFlow.scenarios[1], 'Ajustado*1 (WC=-8)', 'La cabecera ajustada referencia la nota *1 (se resalta en amarillo en web y PDF)');
  const wcNote = horizon.cashFlow.notes.find((note) => note.startsWith('*1:'));
  assert.ok(wcNote, 'Debe existir la nota *1 del circulante');
  assert.match(wcNote, /^\*1: WC = \(Cuentas por pagar/);
  assert.match(wcNote, /frente al WC teórico/);
  assert.doesNotMatch(wcNote, /\bWK\b/, 'La nota no debe mezclar la nomenclatura WK');
});

test('el fallback del circulante genera la cabecera Ajustado*1 y la fórmula WC', async () => {
  const { buildWorkingCapitalDataFallback } = await import('../../src/agents/analyst/capitalAllocationHelpers.js');
  const result = buildWorkingCapitalDataFallback({
    cashFlow: { operating: 1082, capex: 189, dividends: 475 },
    balance: { inventories: 3308, accountsPayable: 4478, accountsReceivable: 2286 },
    workingCapital: { reportedChangeQuarter: 414 },
    fiscalQuarter: 2,
    fiscalYear: 2026,
    ytd: { months: 6 },
  });
  assert.match(result.quarterScenarios[1], /\*1 \(WC=/);
  assert.match(result.ytdScenarios[1], /\*1 \(WC=/);
  assert.match(result.explanation3M, /^WC = \(Cuentas por pagar/);
  assert.match(result.explanationYtd, /^WC = \(Cuentas por pagar/);
  assert.doesNotMatch(result.explanation3M, /\bWK\b/);
  assert.doesNotMatch(result.explanationYtd, /\bWK\b/);
});

test('normalizeCapitalBlock pinta la consignación de escrow financiada en el trimestre (caso KDP 2026-Q1)', () => {
  const extracted = {
    balance: { restrictedCash: 17818, restrictedCashPreviousQuarter: 18 },
    capitalAllocationData: {
      ytd: { preferredIssuance: 4489, nonControllingSale: 3948 },
      threeMonths: {
        deuda: 9566,
        caja: 128,
        acquisitions: 0,
        preferredIssuance: 4489,
        nonControllingSale: 3948,
        restrictedCashMovement: -17800,
        nonCashDebt: 0,
        debtDetails: 'Deuda balance: 16141M -> 25707M (+9566M). Deuda neta: 15115M -> 24809M (+9694M)',
        cashDetails: 'Caja balance: 1026M -> 898M (-128M); la caja disminuyó: fuente de liquidez (+); fila Caja = 128M.',
      },
    },
  };
  const horizon = {
    label: 'ÚLTIMOS 3 MESES',
    cashFlow: { rows: [{ name: 'Libre', values: ['-147'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '-147' },
        { name: 'Emisión de preferentes*1', value: '4489' },
        { name: 'Venta de participaciones*1', value: '3948' },
        { name: 'Caja*1', value: '128' },
        { name: 'Deuda*1', value: '9566' },
        { name: 'En total', value: '17984' },
      ],
      notes: [],
      verification: '',
    },
  };

  normalizeCapitalBlock(horizon, extracted);

  const values = Object.fromEntries(horizon.capital.rows.map((row) => [row.name.replace(/\*\d+$/, ''), row.value]));
  assert.equal(values['Efectivo restringido (escrow)'], '-17800', 'La consignación del escrow se pinta como uso');
  assert.equal(values['En total'], '184', '-147 + 4.489 + 3.948 + 128 + 9.566 - 17.800 = 184');
  assert.match(horizon.capital.verification, /Más o menos cuadra/);
  assert.doesNotMatch(horizon.capital.verification, /17984|17.984/);
  const escrowNote = horizon.capital.notes.find((note) => /consignación de/i.test(note));
  assert.ok(escrowNote, 'Debe existir la nota del escrow consignado');
  assert.match(escrowNote, /pasa de 18M a 17818M/);
  assert.match(escrowNote, /consignación de 17800M/);
  assert.match(escrowNote, /emisión de preferentes \(\+4489M\)/);
  assert.match(escrowNote, /venta de participaciones \(\+3948M\)/);
  assert.match(escrowNote, /deuda del periodo \(\+9566M\)/);
});
