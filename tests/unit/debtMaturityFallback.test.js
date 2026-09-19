import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMaturityScheduleFromDebtTable, buildMaturityScheduleFromFilingText, normalizeMaturityPayload, maturityItemsLookBucketed, maturityTableLooksIncomplete, maturityWindowBounds, pickCoveringMaturitySchedule, shouldRecoverMaturitySchedule, hasWideRangeLabels } from '../../src/agents/analyst/debtMaturityFallback.js';
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

// Tabla real de Conagra 10-K FY2026 (nota 4. LONG-TERM DEBT), ordenada por año de vencimiento.
const CAG_TABLE = {
  headers: ['Obligación', 'Vencimiento', 'May 31, 2026', 'May 25, 2025'],
  rows: [
    ['5.4% senior debt due November 2048', '', '$1,000.0', '$1,000.0'],
    ['4.65% senior debt due January 2043', '', '$176.7', '$176.7'],
    ['6.625% senior debt due August 2039', '', '$91.4', '$91.4'],
    ['5.3% senior debt due November 2038', '', '$1,000.0', '$1,000.0'],
    ['5.75% senior debt due August 2035', '', '$500.0', '—'],
    ['8.25% senior debt due September 2030', '', '$300.0', '$300.0'],
    ['5.0% senior debt due August 2030', '', '$500.0', '—'],
    ['4.85% senior debt due November 2028', '', '$1,300.0', '$1,300.0'],
    ['7.0% senior debt due October 2028', '', '$382.2', '$382.2'],
    ['1.375% senior debt due November 2027', '', '$1,000.0', '$1,000.0'],
    ['6.7% senior debt due August 2027', '', '$9.2', '$9.2'],
    ['7.125% senior debt due October 2026', '', '$262.5', '$262.5'],
    ['5.3% senior debt due October 2026', '', '$500.0', '$500.0'],
    ['4.6% senior debt due November 2025', '', '—', '$1,000.0'],
    ['0.89% to 13.22% lease financing obligations due on various dates through 2043', '', '$240.4', '$267.2'],
    ['Total face value of debt', '', '$7,262.4', '$7,289.2'],
    ['Less current installments', '', '($778.2)', '($1,028.8)'],
    ['Total long-term debt', '', '$6,456.0', '$6,234.1'],
  ],
};

test('la ventana de 5 años incluye el año de cierre cuando el ejercicio no termina en diciembre', () => {
  assert.deepEqual(maturityWindowBounds(2026, '2026-05-31'), { minYear: 2026, maxYear: 2030 });
  assert.deepEqual(maturityWindowBounds(2025, '2025-12-31'), { minYear: 2026, maxYear: 2030 });
  assert.deepEqual(maturityWindowBounds(2018), { minYear: 2019, maxYear: 2023 });
});

test('deriva el calendario completo de Conagra FY2026 incluyendo los vencimientos del año de cierre', () => {
  const result = buildMaturityScheduleFromDebtTable(CAG_TABLE, 2026, '2026-05-31');
  assert.ok(result);
  assert.deepEqual(result.items.map((item) => [item.year, item.amount]), [
    [2030, 300],
    [2030, 500],
    [2028, 1300],
    [2028, 382.2],
    [2027, 1000],
    [2027, 9.2],
    [2026, 262.5],
    [2026, 500],
  ]);
  assert.equal(result.afterYearFive, 3008.5);
  assert.ok(!result.items.some((item) => /2025|face value|current installments|total long-term/i.test(item.label)));
});

test('maturityTableLooksIncomplete detecta tablas resumidas con importes materiales sin año', () => {
  assert.equal(maturityTableLooksIncomplete(CAG_TABLE), false);
  assert.equal(maturityTableLooksIncomplete(PEPSI_TABLE), false);
  const summarized = {
    headers: ['Obligación', 'Vencimiento', 'May 31, 2026', 'May 25, 2025'],
    rows: [
      ['Notas sénior no garantizadas al 5.3%', 'Octubre 2026', '$500.0', '$500.0'],
      ['Notas sénior no garantizadas al 7.125%', 'Octubre 2026', '$262.5', '$262.5'],
      ['Notas sénior no garantizadas al 5.00%', 'Agosto 2030', '$500.0', '$0'],
      ['Notas sénior no garantizadas al 5.75%', 'Agosto 2035', '$500.0', '$0'],
      ['Otras notas sénior no garantizadas', 'Varios', '$5,257.5', '$6,500.0'],
      ['Total deuda a largo plazo', '', '$7,020.0', '$7,262.5'],
    ],
  };
  assert.equal(maturityTableLooksIncomplete(summarized), true);
  assert.equal(maturityTableLooksIncomplete(null), false);
});

test('shouldRecoverMaturitySchedule reconstruye cuando la tabla de deuda llega resumida', () => {
  const yearByYear = [{ year: 2026, label: 'Senior debt due October 2026', amount: 762.5, type: 'Senior Notes' }];
  assert.equal(shouldRecoverMaturitySchedule(yearByYear, [], 2026, '2026-05-31'), false);
  assert.equal(shouldRecoverMaturitySchedule(yearByYear, [], 2018), false);
});

test('extractDebtFilingText localiza las filas "due <mes> <año>" de la nota de deuda', () => {
  const filingText = `4. LONG-TERM DEBT
May 31, 2026 May 25, 2025
5.4% senior debt due November 2048 $ 1,000.0 $ 1,000.0
4.65% senior debt due January 2043 176.7 176.7
5.75% senior debt due August 2035 500.0 —
Total long-term debt $ 6,456.0 $ 6,234.1`;
  const debtText = extractDebtFilingText(filingText);
  assert.ok(debtText.includes('due November 2048'));
  assert.ok(debtText.includes('due August 2035'));
});

test('extractDebtFilingText descarta el índice de exhibiciones con fechas 8-K (caso KDP 10-K FY2025)', () => {
  const exhibitIndex = `EXHIBIT INDEX Incorporated by Reference No. Exhibit Description Form Date of Filing 4.3 4.50% Senior Note due 2045 (in global form) 8-K 11/10/2015 4.2 4.5 2.55% Senior Note due 2026 (in global form) 8-K 9/16/2016 4.2`;
  assert.equal(extractDebtFilingText(exhibitIndex), '');
});

test('extractDebtFilingText localiza la nota con columna Maturity Date (caso KDP 10-K FY2025)', () => {
  const note = `Note 5. Long-term Obligations and Borrowing Arrangements SENIOR UNSECURED NOTES Our Notes consisted of the following: (in millions) December 31, Issuance Maturity Date Rate 2025 2024 2026 Notes September 15, 2026 2.550 % 400 400`;
  const debtText = extractDebtFilingText(note);
  assert.ok(debtText.includes('SENIOR UNSECURED NOTES'));
  assert.ok(debtText.includes('Maturity Date Rate'));
});

// Nota real de KDP 10-K FY2025: columna "Issuance Maturity Date Rate" con cada emisión y sus dos columnas de saldo.
const KDP_DATED_DEBT_TEXT = `SENIOR UNSECURED NOTES Our Notes consisted of the following: (in millions) December 31, Issuance Maturity Date Rate 2025 2024 2025 Merger Notes May 25, 2025 4.417 % $ &#8212; &#160; $ 529 &#160; 2026 Notes September 15, 2026 2.550 % 400 &#160; 400 &#160; 2026-B Notes November 15, 2026 Floating (2) 500 &#160; &#8212; &#160; 2027 Notes June 15, 2027 3.430 % 500 &#160; 500 &#160; 2028 Merger Notes May 25, 2028 4.597 % 1,112 &#160; 1,112 &#160; 2030 Notes May 1, 2030 3.200 % 750 &#160; 750 &#160; 2031 Notes March 15, 2031 2.250 % 500 &#160; 500 &#160; 2052 Notes April 15, 2052 4.500 % 1,150 &#160; 1,150 &#160; 2025 Revolving Credit Agreement (1) March 31, 2030 $ 4,300 &#160; $ &#8212; &#160; Principal amount 14,064 &#160; 13,093 &#160;`;

test('buildMaturityScheduleFromFilingText lee las tablas con columna Maturity Date (caso KDP 10-K FY2025)', () => {
  const result = buildMaturityScheduleFromFilingText(KDP_DATED_DEBT_TEXT, 2025, '2025-12-31');
  assert.ok(result, 'Debe reconstruir el calendario desde las fechas de vencimiento');
  assert.deepEqual(result.items.map((item) => [item.year, item.amount, item.rate]), [
    [2026, 400, 2.55],
    [2026, 500, null],
    [2027, 500, 3.43],
    [2028, 1112, 4.597],
    [2030, 750, 3.2],
  ]);
  assert.equal(result.afterYearFive, 1650, '2031 (500) y 2052 (1.150) van a vencimientos posteriores al año 5');
  assert.ok(!result.items.some((item) => /revolving|credit agreement/i.test(item.label)), 'El revólver no es deuda dispuesta');
});

const CAG_DEBT_TEXT = `4. LONG-TERM DEBT
5.4% senior debt due November 2048 \t$ \t1,000.0 $ \t1,000.0
4.65% senior debt due January 2043 \t176.7 \t176.7
5.75% senior debt due August 2035 \t500.0 \t—
8.25% senior debt due September 2030 \t300.0 \t300.0
5.0% senior debt due August 2030 \t500.0 \t—
1.375% senior debt due November 2027 \t1,000.0 \t1,000.0
7.125% senior debt due October 2026 \t262.5 \t262.5
5.3% senior debt due October 2026 \t500.0 \t500.0
4.6% senior debt due November 2025 \t— \t1,000.0
0.89% to 13.22% lease financing obligations due on various dates through
2043 \t240.4 \t267.2
Total face value of debt \t7,262.4 \t7,289.2
Less current installments \t(778.2) \t(1,028.8)
Total long-term debt \t$ \t6,456.0 $ \t6,234.1`;

test('buildMaturityScheduleFromFilingText parsea la nota y une las filas partidas del PDF', () => {
  const result = buildMaturityScheduleFromFilingText(CAG_DEBT_TEXT, 2026, '2026-05-31');
  assert.ok(result);
  assert.deepEqual(result.items.map((item) => [item.year, item.amount]), [
    [2030, 300],
    [2030, 500],
    [2027, 1000],
    [2026, 262.5],
    [2026, 500],
  ]);
  assert.equal(result.afterYearFive, 1917.1);
  assert.equal(result.weightedAverageRate.rate, 4.84);
});

test('buildMaturityScheduleFromFilingText descarta índices de exhibits y líneas narrativas', () => {
  const noisy = `4.5.8 Form of 3.440% Senior Notes due 2026. 8-K 4.10 July 7, 2016
senior notes due 2026, 4.2% senior notes due 2046 and 1.25% senior notes due 2032
CAD 500 million 3.44% senior notes due July 2026 347.6 377.6`;
  const result = buildMaturityScheduleFromFilingText(noisy, 2024, '2024-12-31');
  assert.ok(result);
  assert.deepEqual(result.items.map((item) => [item.year, item.amount]), [[2026, 347.6]]);
  assert.equal(result.afterYearFive, null);
});

test('pickCoveringMaturitySchedule elige el candidato más cercano a la deuda total', () => {
  const partial = { items: [{ year: 2026, amount: 500 }], afterYearFive: null };
  const complete = { items: [{ year: 2026, amount: 500 }], afterYearFive: 6500 };
  const inflated = { items: [{ year: 2026, amount: 12000 }], afterYearFive: null };
  assert.equal(pickCoveringMaturitySchedule([partial, complete, inflated], 7000), complete);
  assert.equal(pickCoveringMaturitySchedule([partial], 7000), null);
  assert.equal(pickCoveringMaturitySchedule([partial, complete], null), partial);
  assert.equal(pickCoveringMaturitySchedule([], 7000), null);
});

// Tabla real de Coca-Cola 10-K FY2023 (Note 11): las filas de deuda agrupan emisiones por
// rangos amplios ("due 2024-2093") y la nota publica aparte la tabla año a año de vencimientos.
const KO_DEBT_TABLE = {
  headers: ['Obligation', 'Maturity', 'December 31, 2023', 'December 31, 2022'],
  rows: [
    ['U.S. dollar notes due 2024-2093', '2024-2093', '$21,982', '$21,966'],
    ['U.S. dollar debentures due 2023-2098', '2023-2098', '$788', '$891'],
    ['Australian dollar notes due 2024', '2024', '$374', '$374'],
    ['Euro notes due 2024-2041', '2024-2041', '$12,888', '$12,485'],
    ['Swiss franc notes due 2028', '2028', '$684', '$623'],
    ['Other, due through 2098', 'through 2098', '$1,763', '$1,906'],
    ['Fair value adjustments', 'N/A', '($972)', '($1,469)'],
    ['Total', '', '$37,507', '$36,776'],
    ['Less: Current portion', '', '$1,960', '$399'],
    ['Long-term debt', '', '$35,547', '$36,377'],
  ],
};

const KO_MATURITY_TEXT = `The following table summarizes the maturities of long-term debt for the five years succeeding December 31, 2023 (in millions):
Maturities of
Long-Term Debt
2024 \t$ \t1,960
2025 \t1,070
2026 \t1,810
2027 \t4,616
2028 \t2,770
NOTE 12: COMMITMENTS AND CONTINGENCIES`;

test('buildMaturityScheduleFromDebtTable descarta las filas con rangos amplios (KO 10-K FY2023)', () => {
  assert.equal(buildMaturityScheduleFromDebtTable(KO_DEBT_TABLE, 2023, '2023-12-31'), null);
});

test('hasWideRangeLabels distingue agregados de rangos cortos', () => {
  assert.equal(hasWideRangeLabels([{ label: 'U.S. dollar notes due 2024-2093' }]), true);
  assert.equal(hasWideRangeLabels([{ label: 'Euro notes due 2024-2041' }]), true);
  assert.equal(hasWideRangeLabels([{ label: 'Notes due 2024-2047' }]), true);
  assert.equal(hasWideRangeLabels([{ label: 'Vencimientos 2026-2027 (resto)' }]), false);
  assert.equal(hasWideRangeLabels([{ label: 'Long-term debt obligations due 2020-2021' }]), false);
  assert.equal(hasWideRangeLabels([]), false);
});

test('buildMaturityScheduleFromFilingText lee la tabla "maturities of long-term debt" (KO 10-K FY2023)', () => {
  const result = buildMaturityScheduleFromFilingText(KO_MATURITY_TEXT, 2023, '2023-12-31');
  assert.ok(result);
  assert.equal(result.authoritative, true);
  assert.deepEqual(result.items.map((item) => [item.year, item.amount]), [
    [2024, 1960],
    [2025, 1070],
    [2026, 1810],
    [2027, 4616],
    [2028, 2770],
  ]);
  assert.equal(result.afterYearFive, null);
});

test('la tabla año a año no confunde la tabla de arrendamientos operativos', () => {
  const leases = `The following table summarizes the maturities of our operating lease liabilities as of December 31, 2023 (in millions):
Maturities of
Operating Lease
Liabilities
2024 \t$ \t395
2025 \t254
2026 \t197
2027 \t153
2028 \t111
Thereafter \t412`;
  assert.equal(buildMaturityScheduleFromFilingText(leases, 2023, '2023-12-31'), null);
});

test('la tabla año a año respeta la fila Thereafter para los vencimientos posteriores', () => {
  const text = `As of December 31, 2024, the aggregate principal debt maturities of long-term debt and short-term borrowings are as follows (in millions):
2025 \t20.4
2026 \t2,350
2027 \t14.1
2028 \t0.5
2029 \t1.7
Thereafter \t3,730.8`;
  const result = buildMaturityScheduleFromFilingText(text, 2024, '2024-12-31');
  assert.ok(result);
  assert.equal(result.authoritative, true);
  assert.deepEqual(result.items.map((item) => [item.year, item.amount]), [
    [2025, 20.4],
    [2026, 2350],
    [2027, 14.1],
    [2028, 0.5],
    [2029, 1.7],
  ]);
  assert.equal(result.afterYearFive, 3730.8);
});
