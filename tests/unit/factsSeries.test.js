import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeries } from '../../src/services/edgar/factsSeries.js';

function annualEntry(tag, val) {
  return { start: '2023-01-01', end: '2023-12-31', val, frame: 'CY2023', fp: 'FY', form: '10-K', filed: '2024-02-01', tag };
}

function factsFixture() {
  return {
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: [annualEntry('Revenues', 1000)] } },
        CostOfRevenue: { units: { USD: [annualEntry('CostOfRevenue', 600)] } },
        GrossProfit: { units: { USD: [annualEntry('GrossProfit', 400)] } },
        NetIncomeLoss: { units: { USD: [annualEntry('NetIncomeLoss', 100)] } },
      },
    },
  };
}

test('buildSeries agrupa hechos anuales y deriva métricas básicas', () => {
  const { annual, quarterly } = buildSeries(factsFixture());
  assert.equal(quarterly.length, 0);
  assert.equal(annual.length, 1);

  const year = annual[0];
  assert.equal(year.period, '2023');
  assert.equal(year.values.revenue, 1000);
  assert.equal(year.values.grossProfit, 400);
  assert.equal(year.values.netIncome, 100);
});

test('buildSeries devuelve series vacías sin hechos', () => {
  const { annual, quarterly } = buildSeries({ facts: {} });
  assert.deepEqual(annual, []);
  assert.deepEqual(quarterly, []);
});

test('buildSeries resuelve hechos dei (acciones en circulación)', () => {
  const facts = factsFixture();
  facts.facts.dei = {
    EntityCommonStockSharesOutstanding: {
      units: { shares: [{ end: '2023-12-31', val: 500, fp: 'FY', form: '10-K', filed: '2024-02-01', tag: 'EntityCommonStockSharesOutstanding' }] },
    },
  };
  const { annual } = buildSeries(facts);
  assert.equal(annual[0].values.sharesOutstanding, 500);
});

test('buildSeries normaliza acciones en millones usando el dato absoluto de dei', () => {
  const facts = factsFixture();
  facts.facts['us-gaap'].WeightedAverageNumberOfDilutedSharesOutstanding = {
    units: { shares: [{ start: '2023-01-01', end: '2023-12-31', val: 711.1, frame: 'CY2023', fp: 'FY', form: '10-K', filed: '2024-02-01', tag: 'WeightedAverageNumberOfDilutedSharesOutstanding' }] },
  };
  facts.facts.dei = {
    EntityCommonStockSharesOutstanding: {
      units: { shares: [{ end: '2023-12-31', val: 707641531, frame: 'CY2023Q4I', fp: 'FY', form: '10-K', filed: '2024-02-01', tag: 'EntityCommonStockSharesOutstanding' }] },
    },
  };
  const { annual } = buildSeries(facts);
  assert.equal(annual[0].values.weightedSharesDiluted, 711100000);
  assert.equal(annual[0].values.sharesOutstanding, 707641531);
});

test('buildSeries deriva el EBT desde el beneficio neto y el impuesto cuando no hay etiqueta de EBT', () => {
  const facts = factsFixture();
  facts.facts['us-gaap'].IncomeTaxExpenseBenefit = {
    units: { USD: [annualEntry('IncomeTaxExpenseBenefit', 21)] },
  };
  const { annual } = buildSeries(facts);
  assert.equal(annual[0].values.incomeTax, -21);
  assert.equal(annual[0].values.ebtIncludingUnusual, 121);
  assert.equal(annual[0].values.pretaxIncome, 121);
});

test('buildSeries ignora hechos acumulados de más de un ejercicio al crear filas anuales', () => {
  const facts = factsFixture();
  facts.facts['us-gaap'].RestructuringAndRelatedCostIncurredCost = {
    units: { USD: [{ start: '2023-01-01', end: '2025-12-31', val: 697000000, fp: 'FY', form: '10-K', filed: '2026-02-01', tag: 'RestructuringAndRelatedCostIncurredCost' }] },
  };
  const { annual } = buildSeries(facts);
  assert.equal(annual.some((row) => row.periodEnd === '2025-12-31'), false);
});
