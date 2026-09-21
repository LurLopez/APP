import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSalesBlock } from '../../src/agents/analyst/analystSalesProcessor.js';

/**
 * El Beneficio Bruto debe salir siempre de la extracción (ventas − coste de ventas) y nunca
 * copiarse de las Ventas. Caso reportado: AMZN 2026-Q2, cuya cuenta de resultados no publica
 * la línea "Gross profit" y el informe generado mostró Beneficio Bruto = Ventas (200.606M).
 * Cifras reales del 10-Q (accession 0001018724-26-000026).
 */

const AMZN_QUARTER = {
  sales: 200606,
  cogs: 95778,
  grossProfit: 104828,
  operatingIncome: 27461,
  ebt: 80857,
  netIncome: 62647,
  prev: { sales: 167702, cogs: 80809, grossProfit: 71924, operatingIncome: 19171, ebt: 20857, netIncome: 18164 },
};

const AMZN_YTD = {
  months: 6,
  sales: 382125,
  cogs: 183241,
  grossProfit: 198884,
  operatingIncome: 51313,
  ebt: 120691,
  netIncome: 92902,
  prev: { sales: 323369, cogs: 157785, grossProfit: 165584, operatingIncome: 37576, ebt: 42536, netIncome: 35291 },
};

function buildHorizon(label, salesValues, grossValues) {
  return {
    label,
    sales: {
      rows: [
        { name: 'Ventas', normal: salesValues[0], prevNormal: salesValues[1], adjusted: salesValues[0], prevAdjusted: salesValues[1] },
        { name: 'Beneficio Bruto', normal: grossValues[0], prevNormal: grossValues[1], adjusted: grossValues[0], prevAdjusted: grossValues[1] },
        { name: 'Beneficio Operativo', normal: '27461M', prevNormal: '19171M', adjusted: '27461M', prevAdjusted: '19171M' },
        { name: 'EBT', normal: '80857M', prevNormal: '20857M', adjusted: '80857M', prevAdjusted: '20857M' },
        { name: 'Beneficio Neto', normal: '62647M', prevNormal: '18164M', adjusted: '62647M', prevAdjusted: '18164M' },
      ],
      notes: [],
    },
  };
}

test('normalizeSalesBlock calcula Beneficio Bruto = Ventas − Coste de ventas y corrige la fila copiada (AMZN 2026-Q2)', () => {
  const horizon = buildHorizon(
    'ÚLTIMOS 3 MESES',
    ['200606M', '167702M'],
    ['200606M', '167702M'],
  );

  normalizeSalesBlock(horizon, { quarter: AMZN_QUARTER }, 'es', 'consumer_discretionary');

  const rows = Object.fromEntries(horizon.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['Ventas'].normal, '200606M');
  assert.equal(rows['Beneficio Bruto'].normal, '104828M', 'Beneficio Bruto = 200.606 − 95.778');
  assert.equal(rows['Beneficio Bruto'].adjusted, '104828M');
  assert.equal(rows['Beneficio Bruto'].prevNormal, '86893M', 'el comparativo usa el coste de su propia columna: 167.702 − 80.809');
  assert.equal(rows['Beneficio Bruto'].prevAdjusted, '86893M');
  assert.equal(rows['Beneficio Bruto'].pctNormal, '+20,64 %');
  assert.equal(rows['Beneficio Bruto'].pctAdjusted, '+20,64 %');
});

test('normalizeSalesBlock calcula el Beneficio Bruto acumulado del semestre (AMZN 2026-Q2)', () => {
  const horizon = buildHorizon(
    'EN TODO EL AÑO (6 MESES)',
    ['382125M', '323369M'],
    ['382125M', '323369M'],
  );

  normalizeSalesBlock(horizon, { ytd: AMZN_YTD }, 'es', 'consumer_discretionary');

  const rows = Object.fromEntries(horizon.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['Beneficio Bruto'].normal, '198884M');
  assert.equal(rows['Beneficio Bruto'].prevNormal, '165584M');
});

test('normalizeSalesBlock usa el grossProfit extraído cuando no hay coste de ventas', () => {  const horizon = buildHorizon('ÚLTIMOS 3 MESES', ['5000M', '4500M'], ['5000M', '4500M']);
  const extracted = {
    quarter: {
      sales: 5000,
      grossProfit: 3000,
      operatingIncome: 1400,
      ebt: 1000,
      netIncome: 800,
      prev: { sales: 4500, grossProfit: 2700, operatingIncome: 1300, ebt: 900, netIncome: 720 },
    },
  };

  normalizeSalesBlock(horizon, extracted, 'es', 'defensive_consumer');

  const rows = Object.fromEntries(horizon.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['Beneficio Bruto'].normal, '3000M');
  assert.equal(rows['Beneficio Bruto'].prevNormal, '2700M');
});

test('normalizeSalesBlock impone también las filas Normal de la extracción si el modelo las altera', () => {
  const horizon = buildHorizon('ÚLTIMOS 3 MESES', ['200606M', '167702M'], ['104828M', '86893M']);
  horizon.sales.rows.find((row) => row.name === 'Beneficio Operativo').normal = '99999M';
  horizon.sales.rows.find((row) => row.name === 'Beneficio Operativo').adjusted = '99999M';

  normalizeSalesBlock(horizon, { quarter: AMZN_QUARTER }, 'es', 'consumer_discretionary');

  const rows = Object.fromEntries(horizon.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['Beneficio Operativo'].normal, '27461M');
  assert.equal(rows['Beneficio Operativo'].adjusted, '27461M');
});

test('normalizeSalesBlock calcula el Beneficio Bruto con los costes directos de un restaurante (MCD 2025)', () => {
  const horizon = buildHorizon(
    'EN TODO EL AÑO (12 MESES)',
    ['26885M', '25920M'],
    ['26885M', '25920M'],
  );
  const extracted = {
    ytd: {
      months: 12,
      sales: 26885,
      cogs: 11451,
      grossProfit: 26885,
      operatingIncome: 12393,
      ebt: 10897,
      netIncome: 8563,
      prev: { sales: 25920, cogs: 11210, grossProfit: 25920, operatingIncome: 11712, ebt: 10345, netIncome: 8223 },
    },
  };

  normalizeSalesBlock(horizon, extracted, 'es', 'consumer_discretionary');

  const rows = Object.fromEntries(horizon.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['Ventas'].normal, '26885M');
  assert.equal(rows['Beneficio Bruto'].normal, '15434M', '26.885 − 11.451 de restaurantes franquiciados y propios');
  assert.equal(rows['Beneficio Bruto'].prevNormal, '14710M', '25.920 − 11.210');
  assert.equal(rows['Beneficio Bruto'].adjusted, '15434M');
  assert.equal(rows['Beneficio Bruto'].prevAdjusted, '14710M');
});

test('normalizeSalesBlock deja el Beneficio Bruto sin dato si no hay costes y el modelo copió las Ventas', () => {
  const horizon = buildHorizon(
    'EN TODO EL AÑO (12 MESES)',
    ['26885M', '25920M'],
    ['26885M', '25920M'],
  );
  const extracted = {
    ytd: {
      months: 12,
      sales: 26885,
      operatingIncome: 12393,
      ebt: 10897,
      netIncome: 8563,
      prev: { sales: 25920, operatingIncome: 11712, ebt: 10345, netIncome: 8223 },
    },
  };

  normalizeSalesBlock(horizon, extracted, 'es', 'consumer_discretionary');

  const rows = Object.fromEntries(horizon.sales.rows.map((row) => [row.name, row]));
  assert.equal(rows['Beneficio Bruto'].normal, '—');
  assert.equal(rows['Beneficio Bruto'].adjusted, '—');
  assert.equal(rows['Beneficio Bruto'].prevNormal, '—');
  assert.equal(rows['Beneficio Bruto'].prevAdjusted, '—');
  assert.equal(rows['Beneficio Bruto'].pctNormal, undefined);
  assert.equal(rows['Ventas'].normal, '26885M');
});

