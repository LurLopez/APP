import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMaturityScheduleFromDebtTable, normalizeMaturityPayload, maturityItemsLookBucketed, shouldRecoverMaturitySchedule } from '../../src/agents/analyst/debtMaturityFallback.js';
import { processDebtSection, processAcquisitionsDividendsAndWatchlist } from '../../src/agents/analyst/annualConclusionSections.js';
import { extractDebtFilingText } from '../../src/agents/analyst/filingExtractor.js';
import { buildDebtMaturityModel } from '../../src/services/reportExport/debtMaturityModel.js';

// Tabla real de PepsiCo 2018 (Note 8 — Debt Obligations), que ordena la deuda por año de vencimiento.
const PEPSI_TABLE = {
  headers: ['Obligación', 'Vencimiento', 'December 29, 2018', 'December 30, 2017'],
  rows: [
    ['Short-term debt obligations', 'Corriente', '$4,026', '$5,485'],
    ['Current maturities of long-term debt', '', '$3,953', '$4,020'],
    ['Commercial paper (1.3%)', '', '—', '$1,385'],
    ['Other borrowings (6.0% and 4.7%)', '', '$73', '$80'],
    ['Long-term debt obligations', 'Largo plazo', '$32,248', '$37,816'],
    ['Notes due 2019 (3.1% and 2.1%)', '', '$3,948', '$3,933'],
    ['Notes due 2020 (3.9% and 3.1%)', '', '$3,784', '$3,792'],
    ['Notes due 2021 (3.1% and 2.4%)', '', '$3,257', '$3,300'],
    ['Notes due 2022 (2.8% and 2.6%)', '', '$3,802', '$3,853'],
    ['Notes due 2023 (2.9% and 2.4%)', '', '$1,270', '$1,257'],
    ['Notes due 2024-2047 (3.7% and 3.8%)', '', '$16,161', '$17,634'],
    ['Other, due 2018-2026 (1.3% and 1.3%)', '', '$26', '$31'],
    ['Less: current maturities of long-term debt obligations', '', '($3,953)', '($4,020)'],
    ['Total', '', '$28,295', '$33,796'],
  ],
};

test('deriva el calendario de una nota ordenada por años de vencimiento (PepsiCo 2018)', () => {
  const result = buildMaturityScheduleFromDebtTable(PEPSI_TABLE, 2018);
  assert.ok(result);
  assert.deepEqual(result.items.map((item) => [item.year, item.amount]), [
    [2019, 3948],
    [2020, 3784],
    [2021, 3257],
    [2022, 3802],
    [2023, 1270],
  ]);
  assert.equal(result.afterYearFive, 16161);
  assert.ok(result.items.every((item) => item.rate > 0 && item.estimated === true));
});

test('ignora subtotales sin año y rangos que empiezan antes de la ventana', () => {
  const result = buildMaturityScheduleFromDebtTable(PEPSI_TABLE, 2018);
  assert.ok(!result.items.some((item) => /short-term|long-term|current maturities|total|2018-2026/i.test(item.label)));
});

test('usa la columna de vencimiento cuando la etiqueta no lleva el año', () => {
  const table = {
    headers: ['Obligación', 'Vencimiento', '2025', '2024'],
    rows: [
      ['Senior notes 3.5%', '2026', '$500', '$480'],
      ['Term loan 4.0%', 'March 2027', '$250', '$300'],
    ],
  };
  const result = buildMaturityScheduleFromDebtTable(table, 2025);
  assert.deepEqual(result.items.map((item) => [item.year, item.amount, item.rate]), [
    [2026, 500, 3.5],
    [2027, 250, 4],
  ]);
  assert.equal(result.afterYearFive, null);
});

test('devuelve null sin tabla, sin filas con año o sin año fiscal', () => {
  assert.equal(buildMaturityScheduleFromDebtTable(null, 2018), null);
  assert.equal(buildMaturityScheduleFromDebtTable({ headers: [], rows: [['Total', '$1']] }, 2018), null);
  assert.equal(buildMaturityScheduleFromDebtTable(PEPSI_TABLE, null), null);
});

test('processDebtSection completa el calendario desde la tabla cuando la IA no lo extrae', () => {
  const conclusion = {};
  processDebtSection(conclusion, { debt: { secTable: PEPSI_TABLE } }, {}, 2018);
  assert.equal(conclusion.debt.maturitySchedule.length, 5);
  assert.equal(conclusion.debt.maturitySchedule[0].year, 2019);
  assert.equal(conclusion.debt.maturityAfterFive, 16161);
});

test('processDebtSection respeta los maturityItems extraídos por la IA', () => {
  const conclusion = {};
  const items = [{ year: 2026, label: 'CAD 500M 3.44% senior notes', amount: 364.3, rate: 3.44, type: 'Senior Notes' }];
  processDebtSection(conclusion, { debt: { maturityItems: items, secTable: PEPSI_TABLE } }, {}, 2018);
  assert.deepEqual(conclusion.debt.maturitySchedule, items);
  assert.equal(conclusion.debt.maturityAfterFive, undefined);
});

test('normaliza la respuesta de la pasada focalizada de IA (rangos y tipos múltiples)', () => {
  const payload = {
    items: [
      { year: 2019, label: 'Notes due 2019 (3.1% and 2.1%)', amount: 3948, rate: null, type: 'Senior Notes' },
      { year: '2024-2047', label: 'Notes due 2024-2047 (3.7% and 3.8%)', amount: 16161, type: 'Senior Notes' },
      { year: 2018, label: 'Other, due 2018-2026 (1.3%)', amount: 26, type: 'Deuda total' },
      { year: null, label: 'Current maturities of long-term debt', amount: 3953, type: 'Deuda total' },
    ],
    afterYearFive: 16161,
  };
  const result = normalizeMaturityPayload(payload, 2018);
  assert.deepEqual(result.items, [
    { year: 2019, label: 'Notes due 2019 (3.1% and 2.1%)', amount: 3948, rate: 2.6, estimated: true, type: 'Senior Notes' },
  ]);
  assert.equal(result.afterYearFive, 16161);
});

test('extractDebtFilingText aísla la nota de deuda y no mezcla otras secciones', () => {
  const filingText = `Note 8 — Debt Obligations
The following table summarizes the Company's debt obligations (in millions):
Notes due 2019 (3.1% and 2.1%) 3,948 3,933
Notes due 2020 (3.9% and 3.1%) 3,784 3,792
Share Repurchase Program
The Company repurchased shares...`;
  const debtText = extractDebtFilingText(filingText);
  assert.ok(debtText.includes('Notes due 2019'));
  assert.ok(!debtText.includes('### RECOMPRAS'));

  const fallbackText = `Note 8 — Debt Obligations
The following table summarizes the Company's debt obligations (in millions):
Current maturities of long-term debt $ 3,953
Total $ 28,295`;
  const fallback = extractDebtFilingText(fallbackText);
  assert.ok(fallback.includes('DEUDA:'));

  assert.equal(extractDebtFilingText('No hay nota de deuda en este texto.'), '');
});

test('marca como estimados los tipos medios cuando las partidas promedian varios cupones', () => {
  const items = [
    { year: 2019, label: 'Notes due 2019 (3.1% and 2.1%)', amount: 3948, rate: 2.6, estimated: true, type: 'Senior Notes' },
    { year: 2020, label: 'Notes due 2020 (3.9% and 3.1%)', amount: 3784, rate: 3.5, estimated: true, type: 'Senior Notes' },
  ];
  const model = buildDebtMaturityModel({ maturitySchedule: items }, 2018);
  assert.equal(model.totalAverageRateEstimated, true);
  assert.equal(model.years[0].averageRateEstimated, true);
  assert.equal(model.years[1].averageRateEstimated, true);
  assert.equal(model.years[0].items[0].estimated, true);
});

test('processAcquisitions genera un texto extenso desde los detalles del 10-K', () => {
  const conclusion = { acquisitions: {} };
  processAcquisitionsDividendsAndWatchlist(
    conclusion,
    {
      acquisitions: {
        occurred: true,
        items: [{
          name: 'SodaStream International Ltd.',
          description: 'fabricante de sistemas de carbonatación doméstica con presencia principal en Europa y EE. UU.',
          price: 1197,
          priceNote: 'valoración total de la operación de 3.200M$',
          rationale: 'acelerar la estrategia de bebidas más saludables y el canal de consumo en casa',
          expectedImpact: 'sinergias de ingresos y ahorros de costes a partir de 2019',
        }],
      },
    },
    { facts: { acquisitionsYtd: 1496 } },
    {},
    2018,
  );
  const text = conclusion.acquisitions.text;
  assert.match(text, /Se adquirió \*\*SodaStream International Ltd\.\*\*/);
  assert.match(text, /\*\*1\.197M\$\*\*/);
  assert.match(text, /bebidas más saludables/);
  assert.match(text, /sinergias de ingresos/);
  assert.ok(text.includes('\n\n') || text.length > 200);
});

test('processAcquisitions mantiene el texto de la IA cuando existe', () => {
  const conclusion = { acquisitions: { text: 'Texto redactado por la IA con detalle.' } };
  processAcquisitionsDividendsAndWatchlist(
    conclusion,
    { acquisitions: { items: [{ name: 'Otra empresa', price: 100 }] } },
    { facts: { acquisitionsYtd: 100 } },
    {},
    2018,
  );
  assert.equal(conclusion.acquisitions.text, 'Texto redactado por la IA con detalle.');
});

// Tabla del MD&A de PepsiCo 2018 ("Payments Due by Period"), agregada en rangos: NO es el calendario.
const PEPSI_MDA_BUCKETS = [
  { year: 2020, label: 'Long-term debt obligations due 2020-2021', amount: 7166, type: 'Deuda total' },
  { year: 2022, label: 'Long-term debt obligations due 2022-2023', amount: 5093, type: 'Deuda total' },
  { year: 2024, label: 'Long-term debt obligations due 2024 and beyond', amount: 16092, type: 'Deuda total' },
];

test('maturityItemsLookBucketed detecta los rangos agregados del MD&A y respeta los tramos año a año', () => {
  assert.equal(maturityItemsLookBucketed(PEPSI_MDA_BUCKETS, 2018), true);
  assert.equal(maturityItemsLookBucketed([{ year: 2020, label: 'Deuda a largo plazo 2020-2021', amount: 7166 }], 2018), true);
  assert.equal(maturityItemsLookBucketed([{ year: 2020, label: '1-3 years', amount: 7166 }], 2018), true);
  assert.equal(maturityItemsLookBucketed([{ year: 2020, label: 'más de 5 años', amount: 7166 }], 2018), true);

  const yearByYear = [
    { year: 2019, label: 'Notes due 2019 (3.1% and 2.1%)', amount: 3948, type: 'Senior Notes' },
    { year: 2024, label: 'Notes due 2024-2047 (3.7% and 3.8%)', amount: 16161, type: 'Senior Notes' },
  ];
  assert.equal(maturityItemsLookBucketed(yearByYear, 2018), false);
  assert.equal(maturityItemsLookBucketed(yearByYear, 2025), false);
});

test('shouldRecoverMaturitySchedule reconstruye cuando faltan o vienen agregados por periodos', () => {
  const yearByYear = [{ year: 2019, label: 'Notes due 2019 (3.1% and 2.1%)', amount: 3948, type: 'Senior Notes' }];
  assert.equal(shouldRecoverMaturitySchedule([], [], 2018), true);
  assert.equal(shouldRecoverMaturitySchedule([], PEPSI_MDA_BUCKETS, 2018), true);
  assert.equal(shouldRecoverMaturitySchedule(PEPSI_MDA_BUCKETS, [], 2018), true);
  assert.equal(shouldRecoverMaturitySchedule(yearByYear, [], 2018), false);
  assert.equal(shouldRecoverMaturitySchedule([], yearByYear, 2018), false);
});

test('processDebtSection prefiere el calendario año a año cuando la extracción trae rangos del MD&A', () => {
  const conclusion = {};
  processDebtSection(
    conclusion,
    { debt: { maturityItems: PEPSI_MDA_BUCKETS, maturityAfterFive: 16092, secTable: PEPSI_TABLE } },
    {},
    2018,
  );
  assert.deepEqual(conclusion.debt.maturitySchedule.map((item) => [item.year, item.amount]), [
    [2019, 3948],
    [2020, 3784],
    [2021, 3257],
    [2022, 3802],
    [2023, 1270],
  ]);
  assert.equal(conclusion.debt.maturityAfterFive, 16161);
});

test('normalizeMaturityPayload promedia los dos cupones de una fila aunque la IA devuelva solo uno', () => {
  const payload = {
    items: [{ year: 2019, label: 'Notes due 2019 (3.1% and 2.1%)', amount: 3948, rate: 3.1, type: 'Senior Notes' }],
    afterYearFive: null,
  };
  const result = normalizeMaturityPayload(payload, 2018);
  assert.equal(result.items[0].rate, 2.6);
  assert.equal(result.items[0].estimated, true);
});
