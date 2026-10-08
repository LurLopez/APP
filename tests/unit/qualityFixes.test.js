import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWcDeviationSentence } from '../../src/agents/analyst/capitalAllocationHelpers.js';
import { normalizeExtractedUnits } from '../../src/agents/analyst/financialParsersFormat.js';
import { getTaxNormalizationData } from '../../src/agents/analyst/dividendHistoryBuilders.js';

test('la nota del circulante no llama «Cash Flow Ajustado» al subtotal previo al ajuste fiscal', () => {
  const sentence = buildWcDeviationSentence({
    reported: -147,
    wcReq: 12.1,
    deviation: -159.1,
    cfo: 1784.4,
    adjusted: 1943.5,
  });
  assert.match(sentence, /tras el ajuste de circulante queda en/);
  assert.doesNotMatch(sentence, /Cash Flow ajustado resta esa desviación/);
  assert.match(sentence, /1784,4M - \(__-159,1M__\) = 1943,5M/, 'El importe ajustado va subrayado con __…__');
});

test('normalizeExtractedUnits convierte a millones los impuestos pagados en filings en miles (caso FIZZ)', () => {
  const extracted = {
    ytd: { sales: 264.6, months: 3 },
    facts: { incomeTaxesPaidYtd: 43240, incomeTaxesPaidQuarter: 43240, incomeTaxExpenseYtd: 12.4 },
  };
  normalizeExtractedUnits(extracted);
  assert.equal(extracted.facts.incomeTaxesPaidYtd, 43.2);
  assert.equal(extracted.facts.incomeTaxesPaidQuarter, 43.2);
});

test('getTaxNormalizationData descarta un pago de impuestos desproporcionado sin escalar (caso FIZZ)', () => {
  const horizon = {
    label: 'EN TODO EL AÑO (9 MESES)',
    sales: {
      rows: [
        { name: 'EBT', normal: '187,7M', adjusted: '188,3M' },
        { name: 'Beneficio Neto', normal: '143,3M' },
      ],
    },
  };
  const result = getTaxNormalizationData({
    extracted: { facts: { incomeTaxesPaidYtd: 43240, incomeTaxExpenseYtd: 12.4 } },
    horizon,
    isTrimestral: false,
  });
  assert.equal(result, null);
});

test('getTaxNormalizationData ignora una discrepancia fiscal ≤ 10 % del impuesto teórico (caso KHC)', () => {
  const horizon = {
    label: 'EN TODO EL AÑO (6 MESES)',
    sales: {
      rows: [
        { name: 'EBT', normal: '1999M', adjusted: '1999M' },
        { name: 'Beneficio Neto', normal: '1500M' },
      ],
    },
  };
  // Teórico: 23 % × 1999M = 459,8M; pagado 462M => discrepancia de 2,2M (0,5 %) => sin ajuste ni nota.
  const ignored = getTaxNormalizationData({
    extracted: { facts: { incomeTaxesPaidYtd: 462, incomeTaxExpenseYtd: 460 } },
    horizon,
    isTrimestral: false,
  });
  assert.equal(ignored, null);

  // Pagado 520M => discrepancia de 60,2M (13,1 %) => sí se ajusta.
  const applied = getTaxNormalizationData({
    extracted: { facts: { incomeTaxesPaidYtd: 520, incomeTaxExpenseYtd: 460 } },
    horizon,
    isTrimestral: false,
  });
  assert.ok(applied, 'Debe aplicarse el ajuste cuando la discrepancia supera el 10 %');
  assert.equal(applied.normalizedCashTaxes, 459.8);
  assert.equal(applied.adjustment, 60.2);
});

test('normalizeCashFlowBlock retira la nota fiscal de la IA cuando la discrepancia es insignificante', async () => {
  const { normalizeCashFlowBlock } = await import('../../src/agents/analyst/analystCashCapitalProcessor.js');
  const horizon = {
    label: 'EN TODO EL AÑO (6 MESES)',
    sales: {
      rows: [
        { name: 'EBT', normal: '1999M', adjusted: '1999M' },
        { name: 'Beneficio Neto', normal: '1500M' },
      ],
    },
    cashFlow: {
      scenarios: ['Normal (WC=402)', 'Ajustado*1 (WC=115)'],
      rows: [
        { name: 'Cash Flow', values: ['2088', '2088'] },
        { name: 'CAPEX', values: ['300', '300'] },
        { name: 'FCF', values: ['1788', '1788'] },
        { name: 'FCF/Acción', values: ['1,79 $', '1,79 $'] },
        { name: 'Dividendo', values: ['200', '200'] },
        { name: 'Libre', values: ['1588', '1588'] },
      ],
      notes: ['*2: Impuestos: La empresa debería haber pagado 459,8M en impuestos (23 % sobre el EBT ajustado de 1999M) y solamente ha pagado 462M en efectivo según el estado de flujos. Ajuste de +2,2M al Cash Flow Ajustado por la discrepancia fiscal.'],
    },
  };
  const extracted = {
    shares: 1000,
    facts: { incomeTaxesPaidYtd: 462, incomeTaxExpenseYtd: 460 },
    workingCapitalData: {
      ytdScenarios: ['Normal (WC=402)', 'Ajustado*1 (WC=115)'],
      ytdValues: {
        cfo: ['2088', '2088'],
        capex: ['300', '300'],
        fcf: ['1788', '1788'],
        fcfPerShare: ['1,79 $', '1,79 $'],
        dividends: ['200', '200'],
        libre: ['1588', '1588'],
      },
      explanationYtd: '*1: WC = media de los últimos 10 ejercicios: 5,4%. Desviación del circulante reportado (402M) frente al WC teórico (115M): 287M. El Cash Flow tras el ajuste de circulante queda en: 2088M - (287M) = 1801M.',
    },
  };

  normalizeCashFlowBlock(horizon, extracted);

  assert.equal(
    horizon.cashFlow.notes.some((n) => /^\*?\d*:?\s*(Impuestos|Taxes)\b|discrepancia fiscal|tax discrepancy/i.test(String(n))),
    false,
    'La nota fiscal insignificante debe eliminarse',
  );
  assert.equal(horizon.cashFlow.rows.find((r) => r.name === 'Cash Flow').values[1], '2088');
  assert.ok(horizon.cashFlow.notes.some((n) => n.startsWith('*1:')), 'La nota del circulante se mantiene');
});

test('getTaxNormalizationData mantiene el ajuste fiscal cuando el pago es plausible (caso PEP)', () => {
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    sales: {
      rows: [
        { name: 'EBT', normal: '1385,4M', adjusted: '1385,4M' },
        { name: 'Beneficio Neto', normal: '1100M' },
      ],
    },
  };
  const result = getTaxNormalizationData({
    extracted: { facts: { incomeTaxesPaidYtd: 131.4, incomeTaxExpenseYtd: 250 } },
    horizon,
    isTrimestral: false,
  });
  assert.ok(result, 'Debe devolver datos de normalización para un pago plausible');
  assert.equal(result.normalizedCashTaxes, 318.6);
  assert.equal(result.adjustment, -187.2);
});

test('normalizeCapitalBlock garantiza la nota de Deuda/Caja balance aunque la IA la omita (caso FIZZ)', async () => {
  const { normalizeCapitalBlock } = await import('../../src/agents/analyst/analystCashCapitalProcessor.js');
  const horizon = {
    label: 'ÚLTIMOS 3 MESES (Q1)',
    cashFlow: { rows: [{ name: 'Libre', values: ['44,6', '77,1'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '44,6' },
        { name: 'Caja*1', value: '-44,7' },
      ],
      notes: [],
    },
  };
  const extracted = {
    capitalAllocationData: {
      threeMonths: {
        caja: -44.7,
        debtDetails: 'Deuda balance: 300M -> 250M (-50M). Deuda neta: 100M -> 80M (-20M)',
        cashDetails: 'Caja balance: 82M (2025) -> 37M (2026) (-44,7M); la caja disminuyó: fuente de liquidez (+); fila Caja = -44,7M.',
      },
    },
  };

  normalizeCapitalBlock(horizon, extracted);

  const note = horizon.capital.notes.find((n) => /Caja balance/i.test(n));
  assert.ok(note, 'Debe añadirse la nota de Caja/Deuda balance');
  assert.match(note, /Deuda balance/);
  const cashRow = horizon.capital.rows.find((r) => /^Caja/i.test(r.name));
  assert.match(cashRow.name, /\*1/);
  assert.ok(horizon.capital.notes.some((n) => n.startsWith('*1:')), 'La fila debe apuntar a una nota existente');
});

test('normalizeCashFlowBlock descarta un dividendo desproporcionado (caso BJ)', async () => {
  const { normalizeCashFlowBlock } = await import('../../src/agents/analyst/analystCashCapitalProcessor.js');
  const horizon = {
    label: 'ÚLTIMOS 3 MESES (Q1)',
    sales: { rows: [{ name: 'EBT', normal: '146,8M', adjusted: '146,8M' }, { name: 'Beneficio Neto', normal: '111M' }] },
    cashFlow: {
      scenarios: ['Normal', 'Ajustado'],
      rows: [
        { name: 'Cash Flow', values: ['200,8', '166,9'] },
        { name: 'CAPEX', values: ['105,7', '105,7'] },
        { name: 'FCF', values: ['95,1', '61,2'] },
        { name: 'FCF/Acción', values: ['0,72 $', '0,46 $'] },
        { name: 'Dividendo', values: ['25000', '25000'] },
        { name: 'Libre', values: ['-24904,9', '-24938,8'] },
      ],
      notes: [],
    },
  };
  const extracted = {
    shares: 132,
    facts: {},
    workingCapitalData: {
      quarterScenarios: ['Normal (WC=10,1)', 'Ajustado (WC=-3,7)'],
      quarterValues: {
        cfo: ['200,8', '166,9'],
        capex: ['105,7', '105,7'],
        fcf: ['95,1', '61,2'],
        fcfPerShare: ['0,72 $', '0,46 $'],
        dividends: ['25000', '25000'],
        libre: ['-24904,9', '-24938,8'],
      },
      explanation3M: '*1: WK = ... El Cash Flow tras el ajuste de circulante queda en: 200,8M - 13,8M = 187M.',
    },
  };

  normalizeCashFlowBlock(horizon, extracted);

  const dividends = horizon.cashFlow.rows.find((r) => r.name === 'Dividendo');
  assert.equal(dividends.values[0], '0');
  const libre = horizon.cashFlow.rows.find((r) => r.name === 'Libre');
  assert.equal(libre.values[0], '95,1');
});

test('normalizeCapitalBlock reapunta filas Caja/Deuda a la nota real aunque el número no coincida (caso MDLZ)', async () => {
  const { normalizeCapitalBlock } = await import('../../src/agents/analyst/analystCashCapitalProcessor.js');
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    cashFlow: { rows: [{ name: 'Libre', values: ['4988', '4988'] }] },
    capital: {
      rows: [
        { name: 'Libre', value: '4988' },
        { name: 'Recompras', value: '-2400' },
        { name: 'Caja*2', value: '120' },
        { name: 'Deuda*2', value: '-300' },
      ],
      notes: ['*1: Deuda balance: 18000M -> 17700M (-300M). Deuda neta: 17500M -> 17380M (-120M). Caja balance: 500M -> 620M (+120M); la caja aumentó: uso de capital (-); fila Caja = -120M.'],
    },
  };
  const extracted = {
    capitalAllocationData: {
      ytd: {
        caja: 120,
        deuda: -300,
        debtDetails: 'Deuda balance: 18000M -> 17700M (-300M). Deuda neta: 17500M -> 17380M (-120M)',
        cashDetails: 'Caja balance: 500M -> 620M (+120M); la caja aumentó: uso de capital (-); fila Caja = -120M.',
      },
    },
  };

  normalizeCapitalBlock(horizon, extracted);

  const cashRow = horizon.capital.rows.find((r) => /^Caja/i.test(r.name));
  const debtRow = horizon.capital.rows.find((r) => /^Deuda/i.test(r.name));
  assert.match(cashRow.name, /\*1/);
  assert.match(debtRow.name, /\*1/);
  assert.equal(horizon.capital.notes.filter((n) => /Caja balance/i.test(n)).length, 1, 'No debe duplicar la nota');
});

test('normalizeCashFlowBlock usa la nueva redacción intermedia del circulante y conserva la nota fiscal', async () => {
  const { normalizeCashFlowBlock } = await import('../../src/agents/analyst/analystCashCapitalProcessor.js');
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    sales: {
      rows: [
        { name: 'EBT', normal: '1385,4M', adjusted: '1385,4M' },
        { name: 'Beneficio Neto', normal: '1100M' },
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
      notes: ['*1: WK = ... El Cash Flow tras el ajuste de circulante queda en: 9415M - 646,7M = 8768,3M.'],
    },
  };
  const extracted = {
    shares: 1400,
    facts: { incomeTaxesPaidYtd: 131.4, incomeTaxExpenseYtd: 250 },
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
      explanationYtd: '*1: WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) x (3 % + 0 %) = -533M. Desviación del circulante reportado (114M) frente al WK teórico (-533M): 646,7M. El Cash Flow tras el ajuste de circulante queda en: 9415M - 646,7M = 8768,3M.',
    },
  };

  normalizeCashFlowBlock(horizon, extracted);

  const cfoRow = horizon.cashFlow.rows.find((r) => r.name === 'Cash Flow');
  assert.equal(cfoRow.values[1], '8581,1');
  const note1 = horizon.cashFlow.notes.find((n) => n.startsWith('*1:'));
  assert.match(note1, /tras el ajuste de circulante queda en/);
  assert.doesNotMatch(note1, /Cash Flow ajustado resta/);
  const note2 = horizon.cashFlow.notes.find((n) => n.startsWith('*2:'));
  assert.match(note2, /= 8581,1M/);
});
