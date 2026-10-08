import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExtractionPayload } from '../../src/agents/analyst/extractionNormalizer.js';

test('normaliza aliases de secciones al contrato interno', () => {
  const { data, warnings } = normalizeExtractionPayload({
    annual: { debt: {} },
    balanceSheet: { cash: 100 },
    cashflow: { operating: 50 },
    working_capital: { reportedChangeYtd: -3 },
  });

  assert.ok(data.annualDetails);
  assert.deepEqual(data.balance, { cash: 100 });
  assert.deepEqual(data.cashFlow, { operating: 50 });
  assert.deepEqual(data.workingCapital, { reportedChangeYtd: -3 });
  assert.equal(data.annual, undefined);
  assert.equal(data.balanceSheet, undefined);
  assert.equal(warnings.length, 0);
});

test('normaliza aliases del calendario de deuda y de sus partidas', () => {
  const { data, warnings } = normalizeExtractionPayload({
    fiscalYear: 2025,
    annualDetails: {
      debt: {
        maturitySchedule: [
          {
            maturityYear: '2026',
            name: 'Senior notes due 2026',
            totalAmount: '2,000M',
            interestRate: '3.44%',
            category: 'Senior Notes',
          },
        ],
        afterYearFive: '1250M',
        debtTable: { headers: ['Obligación'], rows: [] },
        interestRateBuckets: ['USD fija 3,4 %', 'EUR fija 2,6 %'],
      },
    },
  });

  const debt = data.annualDetails.debt;
  assert.deepEqual(debt.maturityItems, [{
    year: 2026,
    label: 'Senior notes due 2026',
    amount: 2000,
    rate: 3.44,
    type: 'Senior Notes',
  }]);
  assert.equal(debt.maturityAfterFive, 1250);
  assert.deepEqual(debt.secTable, { headers: ['Obligación'], rows: [] });
  assert.equal(debt.rateBuckets, 'USD fija 3,4 %; EUR fija 2,6 %');
  assert.equal(debt.maturitySchedule, undefined);
  assert.equal(debt.afterYearFive, undefined);
  assert.equal(debt.debtTable, undefined);
  assert.equal(warnings.length, 0);
});

test('prefiere el campo canónico y avisa cuando existe un alias contradictorio', () => {
  const canonical = [{ year: 2026, label: 'Canonical', amount: 100 }];
  const { data, warnings } = normalizeExtractionPayload({
    annualDetails: {
      debt: {
        maturityItems: canonical,
        maturitySchedule: [{ year: 2027, label: 'Alias', amount: 200 }],
      },
    },
  });

  assert.deepEqual(data.annualDetails.debt.maturityItems, [{
    year: 2026,
    label: 'Canonical',
    amount: 100,
    rate: null,
    type: null,
  }]);
  assert.ok(warnings.some((warning) => warning.includes('maturitySchedule')));
});

test('no convierte un calendario textual ambiguo en cifras inventadas', () => {
  const { data, warnings } = normalizeExtractionPayload({
    annualDetails: {
      debt: {
        maturitiesSchedule: '2026: 2.364M, 2027: 0.5M',
        maturitySchedule: '2026: 2.364M, 2027: 0.5M',
      },
    },
  });

  assert.equal(data.annualDetails.debt.maturityItems, undefined);
  assert.equal(data.annualDetails.debt.maturitiesSchedule, undefined);
  assert.ok(warnings.some((warning) => warning.includes('texto libre')));
  assert.ok(warnings.some((warning) => warning.includes('maturitySchedule') && warning.includes('array')));
});

test('descarta partidas de vencimiento sin importe válido y deja una advertencia', () => {
  const { data, warnings } = normalizeExtractionPayload({
    annualDetails: {
      debt: {
        maturityItems: [
          { year: 2026, label: 'Sin importe', amount: '—' },
          { year: 2027, label: 'Válida', amount: 250 },
        ],
      },
    },
  });

  assert.equal(data.annualDetails.debt.maturityItems.length, 1);
  assert.equal(data.annualDetails.debt.maturityItems[0].year, 2027);
  assert.ok(warnings.some((warning) => warning.includes('importe válido')));
});
