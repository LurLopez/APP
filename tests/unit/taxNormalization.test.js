import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Normalización fiscal determinista del bloque de Ventas: la desviación del impuesto
 * reportado frente al 23 % del EBT ajustado debe cruzar el umbral ±20 % para normalizar,
 * y cuando lo cruza la cifra de la tabla y la nota *2 deben quedar coherentes.
 */

function buildAdbeHorizon() {
  return {
    label: 'EN TODO EL AÑO (12 MESES)',
    sales: {
      rows: [
        { name: 'Ventas', normal: '23769M', prevNormal: '21505M', adjusted: '23769M', prevAdjusted: '21505M' },
        { name: 'Beneficio Bruto', normal: '21218M', prevNormal: '19147M', adjusted: '21218M', prevAdjusted: '19147M' },
        { name: 'Beneficio Operativo', normal: '8706M', prevNormal: '6741M', adjusted: '8706M', prevAdjusted: '6819M', isAdjusted: true, adjustedNote: '*1' },
        { name: 'EBT', normal: '8734M', prevNormal: '6931M', adjusted: '8734M', prevAdjusted: '7009M' },
        { name: 'Beneficio Neto', normal: '7130M', prevNormal: '5560M', adjusted: '7130M', prevAdjusted: '5397M' },
      ],
      notes: [
        '*1: No ha habido deterioros (impairments) en el ejercicio 2025 (0M). El cargo por deterioro de activos por arrendamiento de 78M$ corresponde al ejercicio 2024 y se ha sumado de vuelta en la columna Anterior Ajustado del Beneficio Operativo (6741M + 78M = 6819M). La amortización recurrente de intangibles de 157M$ NO se suma de vuelta en la columna Ajustado, conforme a la política sectorial de tecnología: permanece como coste operativo real. Por tanto, el Beneficio Operativo Ajustado coincide con el Normal (8706M).',
        '*2: Impuestos: el gasto fiscal reportado del ejercicio es de 1604M sobre un EBT de 8734M (tipo efectivo del 18,4 %). El tipo normalizado de referencia (23 %) sobre el EBT ajustado daría 8734M × 0,23 = 2008,82M. La desviación relativa frente al impuesto reportado es de (1604 - 2008,82) / 2008,82 = -20,15 %, que queda justo fuera del umbral de ±20 %, por lo que se normaliza el gasto fiscal al 23 %: Beneficio Neto Ajustado = EBT Ajustado × 0,77 = 8734M × 0,77 = 6725,18M. No obstante, dado que la desviación es marginal (-20,15 % frente al límite del -20 %) y que el Beneficio Neto Normal reportado es de 7130M, se mantiene la cifra reportada como referencia de la columna Normal; la columna Ajustado refleja el escenario normalizado a efectos de comparabilidad fiscal.',
      ],
    },
  };
}

test('aplica la normalización fiscal al superar el ±20 % y reescribe la nota *2 (caso ADBE)', async () => {
  const { normalizeSalesBlock } = await import('../../src/agents/analyst/analystSalesProcessor.js');
  const horizon = buildAdbeHorizon();

  normalizeSalesBlock(horizon, { facts: { incomeTaxExpenseYtd: 1604 }, fiscalYear: 2025 }, 'es', 'technology');

  const rows = Object.fromEntries(horizon.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['EBT'].adjusted, '8734M');
  assert.equal(rows['Beneficio Neto'].adjusted, '6725,18M');
  assert.equal(rows['Beneficio Neto'].isAdjusted, true);
  assert.equal(rows['Beneficio Neto'].adjustedNote, '*2');
  assert.equal(rows['Beneficio Neto'].pctAdjusted, '+24,61 %');

  const taxNote = horizon.sales.notes.find((note) => /^\*2:/.test(note));
  assert.match(taxNote, /Beneficio Neto Ajustado = EBT Ajustado × 0,77 = 6725,18M\.$/);
  assert.doesNotMatch(taxNote, /No obstante|se mantiene la cifra reportada/);
  // No debe duplicarse la nota del deterioro del año anterior (ya está en la nota *1).
  assert.equal(horizon.sales.notes.length, 2);
});

test('no normaliza cuando la desviación está dentro del ±20 %', async () => {
  const { normalizeSalesBlock } = await import('../../src/agents/analyst/analystSalesProcessor.js');
  const horizon = buildAdbeHorizon();
  horizon.sales.rows.find((row) => row.name === 'Beneficio Neto').adjusted = '7200M';

  // Impuesto reportado = 23 % exacto del EBT ajustado -> desviación 0 %.
  normalizeSalesBlock(horizon, { facts: { incomeTaxExpenseYtd: 2008.82 }, fiscalYear: 2025 }, 'es', 'technology');

  const rows = Object.fromEntries(horizon.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['Beneficio Neto'].adjusted, '7200M');
  assert.equal(horizon.sales.notes.filter((note) => /^\*2:/.test(note)).length, 1);
  assert.match(horizon.sales.notes.find((note) => /^\*2:/.test(note)), /No obstante/);
});

test('normaliza también cuando el impuesto reportado supera el techo del +20 %', async () => {
  const { normalizeSalesBlock } = await import('../../src/agents/analyst/analystSalesProcessor.js');
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    sales: {
      rows: [
        { name: 'Ventas', normal: '5000M', prevNormal: '4500M', adjusted: '5000M', prevAdjusted: '4500M' },
        { name: 'Beneficio Bruto', normal: '3000M', prevNormal: '2700M', adjusted: '3000M', prevAdjusted: '2700M' },
        { name: 'Beneficio Operativo', normal: '1400M', prevNormal: '1300M', adjusted: '1400M', prevAdjusted: '1300M' },
        { name: 'EBT', normal: '1000M', prevNormal: '900M', adjusted: '1000M', prevAdjusted: '900M' },
        { name: 'Beneficio Neto', normal: '600M', prevNormal: '540M', adjusted: '600M', prevAdjusted: '540M' },
      ],
      notes: ['*1: Ha habido una depreciación de intangibles de 120M.'],
    },
  };

  // Impuesto reportado 400M (40 %) frente al 23 % de 1000M = 230M -> +73,9 %.
  normalizeSalesBlock(horizon, { facts: { incomeTaxExpenseYtd: 400, intangiblesAmortizationYtd: 120 } }, 'es', 'technology');

  const rows = Object.fromEntries(horizon.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['Beneficio Neto'].adjusted, '770M');
  assert.equal(rows['Beneficio Neto'].isAdjusted, true);
  assert.equal(rows['Beneficio Neto'].adjustedNote, '*2');
  const taxNote = horizon.sales.notes.find((note) => /^\*2:/.test(note));
  assert.match(taxNote, /= 770M\.$/);
});

test('normaliza la columna Anterior Ajustado cuando su impuesto también supera el ±20 %', async () => {
  const { normalizeSalesBlock } = await import('../../src/agents/analyst/analystSalesProcessor.js');
  const horizon = {
    label: 'EN TODO EL AÑO (12 MESES)',
    sales: {
      rows: [
        { name: 'Ventas', normal: '5000M', prevNormal: '4500M', adjusted: '5000M', prevAdjusted: '4500M' },
        { name: 'Beneficio Bruto', normal: '3000M', prevNormal: '2700M', adjusted: '3000M', prevAdjusted: '2700M' },
        { name: 'Beneficio Operativo', normal: '1400M', prevNormal: '1300M', adjusted: '1400M', prevAdjusted: '1300M' },
        { name: 'EBT', normal: '1200M', prevNormal: '1000M', adjusted: '1200M', prevAdjusted: '1000M' },
        { name: 'Beneficio Neto', normal: '924M', prevNormal: '400M', adjusted: '924M', prevAdjusted: '400M' },
      ],
      notes: [],
    },
  };

  // Actual: impuesto 276M = 23 % exacto -> sin cambios. Anterior: impuesto 600M (60 %)
  // frente a 230M -> se normaliza a 1000M × 0,77 = 770M.
  normalizeSalesBlock(horizon, { facts: { incomeTaxExpenseYtd: 276 } }, 'es', 'technology');

  const rows = Object.fromEntries(horizon.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['Beneficio Neto'].adjusted, '924M');
  assert.equal(rows['Beneficio Neto'].prevAdjusted, '770M');
  assert.equal(rows['Beneficio Neto'].pctAdjusted, '+20 %');
});

test('excluye del EBT y del Beneficio Neto Ajustado las partidas no operativas no recurrentes (AMZN 2026-Q2)', async () => {
  const { normalizeSalesBlock } = await import('../../src/agents/analyst/analystSalesProcessor.js');
  const horizon = {
    label: 'ÚLTIMOS 3 MESES',
    sales: {
      rows: [
        { name: 'Ventas', normal: '200606M', prevNormal: '167702M', adjusted: '200606M', prevAdjusted: '167702M' },
        { name: 'Beneficio Bruto', normal: '104828M', prevNormal: '86893M', adjusted: '104828M', prevAdjusted: '86893M' },
        { name: 'Beneficio Operativo', normal: '27461M', prevNormal: '19171M', adjusted: '27461M', prevAdjusted: '19171M' },
        { name: 'EBT', normal: '80857M', prevNormal: '20857M', adjusted: '80857M', prevAdjusted: '20857M' },
        { name: 'Beneficio Neto', normal: '62647M', prevNormal: '18164M', adjusted: '62647M', prevAdjusted: '18164M' },
      ],
      notes: [
        '*1: No se han registrado deterioros de fondo de comercio ni de activos intangibles en el trimestre.',
        '*2: Impuestos: el EBT ajustado del trimestre es de 80857M y el tipo efectivo reportado es del 22,5%. No procede normalizar. Beneficio Neto Ajustado = 80857M − 18199M = 62658M.',
        '*3: El beneficio neto del trimestre incluye otros ingresos no operativos antes de impuestos de 53400M, principalmente por la revalorización de las inversiones en Anthropic. No se ha ajustado en la columna Ajustado.',
      ],
    },
  };
  const extracted = {
    fiscalYear: 2026,
    quarter: {
      sales: 200606,
      cogs: 95778,
      grossProfit: 104828,
      operatingIncome: 27461,
      ebt: 80857,
      netIncome: 62647,
      prev: { sales: 167702, cogs: 80809, grossProfit: 86893, operatingIncome: 19171, ebt: 20857, netIncome: 18164 },
    },
    facts: {
      incomeTaxExpenseQuarter: 18199,
      nonOperatingGainsQuarter: 53400,
      nonOperatingGainsDescription: 'revalorización de las inversiones en Anthropic',
    },
  };

  normalizeSalesBlock(horizon, extracted, 'es', 'consumer_discretionary');

  const rows = Object.fromEntries(horizon.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['EBT'].normal, '80857M');
  assert.equal(rows['EBT'].adjusted, '27457M', '80.857 − 53.400');
  assert.equal(rows['EBT'].isAdjusted, true, 'el EBT es la casilla de origen del ajuste');
  assert.equal(rows['EBT'].adjustedNote, '*3');
  assert.equal(rows['Beneficio Neto'].normal, '62647M');
  assert.equal(rows['Beneficio Neto'].adjusted, '21529M', '62.647 − 53.400 × 0,77');
  assert.equal(rows['Beneficio Neto'].adjustedNote, '*2');
  assert.equal(rows['EBT'].pctAdjusted, '+31,64 %');
  // El Anterior Ajustado del Beneficio Neto sigue la normalización fiscal del comparativo
  // (Q2 2025: tipo efectivo 12,9 % -> 20.857M × 0,77 = 16.059,89M).
  assert.equal(rows['Beneficio Neto'].prevAdjusted, '16059,89M');
  assert.equal(rows['Beneficio Neto'].pctAdjusted, '+34,05 %');

  const gainsNote = horizon.sales.notes.find((note) => note.startsWith('*3:'));
  assert.match(gainsNote, /se excluye del EBT Ajustado la partida de 53400M/);
  assert.match(gainsNote, /revalorización de las inversiones en Anthropic/);
  const taxNote = horizon.sales.notes.find((note) => note.startsWith('*2:'));
  assert.match(taxNote, /Beneficio Neto Ajustado queda en 21529M/);
  assert.doesNotMatch(horizon.sales.notes.join(' '), /No se ha ajustado/);
  assert.doesNotMatch(horizon.sales.notes.join(' '), /62658M/);
});

test('reescribe la única nota del modelo que mezclaba impuestos y la partida no recurrente', async () => {
  const { normalizeSalesBlock } = await import('../../src/agents/analyst/analystSalesProcessor.js');
  const horizon = {
    label: 'ÚLTIMOS 3 MESES',
    sales: {
      rows: [
        { name: 'Ventas', normal: '200606M', prevNormal: '167702M', adjusted: '200606M', prevAdjusted: '167702M' },
        { name: 'Beneficio Bruto', normal: '104828M', prevNormal: '86893M', adjusted: '104828M', prevAdjusted: '86893M' },
        { name: 'Beneficio Operativo', normal: '27461M', prevNormal: '19171M', adjusted: '27461M', prevAdjusted: '19171M' },
        { name: 'EBT', normal: '80857M', prevNormal: '20857M', adjusted: '80857M', prevAdjusted: '20857M' },
        { name: 'Beneficio Neto', normal: '62647M', prevNormal: '18164M', adjusted: '62647M', prevAdjusted: '18164M' },
      ],
      notes: [
        '*1: Impuestos y partidas no operativas: el beneficio neto incluye la revalorización de las inversiones en Anthropic de 50486M, que no se ha ajustado en la columna Ajustado.',
      ],
    },
  };
  const extracted = {
    fiscalYear: 2026,
    quarter: {
      sales: 200606,
      cogs: 95778,
      grossProfit: 104828,
      operatingIncome: 27461,
      ebt: 80857,
      netIncome: 62647,
      prev: { sales: 167702, cogs: 80809, grossProfit: 86893, operatingIncome: 19171, ebt: 20857, netIncome: 18164 },
    },
    facts: {
      incomeTaxExpenseQuarter: 18199,
      nonOperatingGainsQuarter: 50486,
      nonOperatingGainsDescription: 'Revalorización de las inversiones en Anthropic',
    },
  };

  normalizeSalesBlock(horizon, extracted, 'es', 'consumer_discretionary');

  const rows = Object.fromEntries(horizon.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['EBT'].adjusted, '30371M');
  assert.equal(rows['EBT'].adjustedNote, '*1');
  assert.equal(rows['Beneficio Neto'].adjusted, '23772,78M');
  assert.equal(rows['Beneficio Neto'].adjustedNote, '*2');
  assert.deepEqual(horizon.sales.notes.map((note) => note.slice(0, 2)), ['*1', '*2']);
  assert.match(horizon.sales.notes[0], /se excluye del EBT Ajustado la partida de 50486M/);
  assert.match(horizon.sales.notes[1], /Beneficio Neto Ajustado queda en 23772,78M/);
  assert.doesNotMatch(horizon.sales.notes.join(' '), /no se ha ajustado/);
});

test('la nota fiscal se redacta en inglés cuando el informe es en inglés', async () => {  const { normalizeSalesBlock } = await import('../../src/agents/analyst/analystSalesProcessor.js');
  const horizon = buildAdbeHorizon();
  horizon.sales.notes = [];

  normalizeSalesBlock(horizon, { facts: { incomeTaxExpenseYtd: 1604 }, fiscalYear: 2025 }, 'en', 'technology');

  const rows = Object.fromEntries(horizon.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['Beneficio Neto'].adjusted, '6725.18M');
  const taxNote = horizon.sales.notes.find((note) => /^\*2:/.test(note));
  assert.match(taxNote, /Taxes: reported tax expense was 1604M/);
  assert.match(taxNote, /= 6725\.18M\.$/);
});

test('el auditor determinista detecta la nota fiscal que no cierra con la tabla', async () => {
  const { runDeterministicChecks } = await import('../../src/agents/auditor/deterministicChecks.js');
  const report = {
    horizons: [
      {
        label: 'EN TODO EL AÑO (12 MESES)',
        sales: {
          rows: [
            { name: 'Ventas', normal: '23769M', prevNormal: '21505M', adjusted: '23769M', prevAdjusted: '21505M' },
            { name: 'Beneficio Bruto', normal: '21218M', prevNormal: '19147M', adjusted: '21218M', prevAdjusted: '19147M' },
            { name: 'Beneficio Operativo', normal: '8706M', prevNormal: '6741M', adjusted: '8706M', prevAdjusted: '6819M' },
            { name: 'EBT', normal: '8734M', prevNormal: '6931M', adjusted: '8734M', prevAdjusted: '7009M' },
            { name: 'Beneficio Neto', normal: '7130M', prevNormal: '5560M', adjusted: '7130M', prevAdjusted: '5397M' },
          ],
          notes: ['*2: Impuestos: Beneficio Neto Ajustado = EBT Ajustado × 0,77 = 8734M × 0,77 = 6725,18M. Se mantiene la cifra reportada.'],
        },
        cashFlow: { rows: [], notes: [] },
        capital: { rows: [] },
      },
    ],
  };

  const { findings } = runDeterministicChecks(report);
  assert.ok(
    findings.some((finding) => finding.check === 'notas.beneficio_neto'),
    'Debe marcar la incoherencia entre la nota fiscal y la celda Ajustado',
  );
});
