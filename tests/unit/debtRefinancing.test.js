import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDebtRefinancingModel, buildDebtRefinancingBadges } from '../../src/services/reportExport/debtHistoryRefinancingModel.js';
import { processDebtSection } from '../../src/agents/analyst/annualConclusionSections.js';
import { extractRefinancingFilingText } from '../../src/agents/analyst/filingExtractor.js';

test('no muestra refinanciación si no ocurrió, aunque haya vencimientos y tipos', () => {
  const debt = {
    refinancing: { occurred: false, oldDebtRate: 2.6, newDebtRate: null, amountRefinanced: 3948 },
    refinancingAnalysis: 'No se ha producido refinanciación de deuda en el ejercicio.',
    refinancingImpact: 'No aplica.',
    maturitySchedule: [{ year: 2019, label: 'Notes due 2019 (3.1% and 2.1%)', amount: 3948, rate: 2.6 }],
    text: 'La deuda neta se sitúa en 23.328M$.',
  };
  assert.equal(buildDebtRefinancingModel(debt, {}), null);
});

test('procesa una refinanciación real con tipos, volumen e impacto', () => {
  const debt = {
    refinancing: { occurred: true, oldDebtRate: 3, newDebtRate: 5.25, amountRefinanced: 1000 },
    refinancingAnalysis: 'Se retiraron notas al 3,00 % y se emitieron al 5,25 %.',
    refinancingImpact: 'Sobrecoste de 22,5M.',
  };
  const model = buildDebtRefinancingModel(debt, {});
  assert.ok(model);
  assert.equal(model.oldDebtRate, 3);
  assert.equal(model.newDebtRate, 5.25);
  assert.equal(model.amount, 1000);
  assert.equal(model.possible, undefined);
  assert.deepEqual(
    buildDebtRefinancingBadges(model).map((badge) => badge.label),
    ['Tipo deuda anterior', 'Tipo nueva emisión', 'Volumen refinanciado', 'Impacto en BPA'],
  );
});

test('processDebtSection descarta refinanciaciones no ejecutadas', () => {
  const conclusion = {};
  processDebtSection(conclusion, {
    debt: {
      refinancing: { occurred: false, oldDebtRate: 2.6, amountRefinanced: 3948 },
      refinancingAnalysis: 'No se ha producido refinanciación de deuda en el ejercicio.',
      refinancingImpact: 'No aplica.',
    },
  }, {}, 2018);
  assert.equal(conclusion.debt.refinancing, undefined);
  assert.equal(conclusion.debt.refinancingAnalysis, null);
  assert.equal(conclusion.debt.refinancingImpact, null);
});

test('processDebtSection conserva la refinanciación realmente ejecutada', () => {
  const conclusion = {};
  processDebtSection(conclusion, {
    debt: { refinancing: { occurred: true, oldDebtRate: 3, newDebtRate: 5.25, amountRefinanced: 1000 } },
  }, {}, 2018);
  assert.equal(conclusion.debt.refinancing.occurred, true);
  assert.equal(conclusion.debt.refinancing.amountRefinanced, 1000);
});

test('extractRefinancingFilingText detecta tender/exchange offers reales y no provisiones genéricas', () => {
  const filing = `In 2018, we completed a cash tender offer for certain notes issued by PepsiCo for $1.6 billion in cash to redeem the following amounts. We also completed an exchange offer for certain notes issued by predecessors to a PepsiCo subsidiary.`;
  const text = extractRefinancingFilingText(filing);
  assert.ok(text.includes('cash tender offer'));
  assert.ok(text.includes('exchange offer'));

  const boilerplate = 'The notes contain redemption provisions to redeem all of our outstanding notes at any time prior to maturity.';
  assert.equal(extractRefinancingFilingText(boilerplate), '');
  assert.equal(extractRefinancingFilingText(''), '');
});

test('usa el impacto en BPA y el cargo por intereses publicados cuando faltan tipos', () => {
  const debt = {
    refinancing: { occurred: true, description: 'Tender y exchange offers', amountRefinanced: 1600, annualInterestImpact: 253, epsImpact: -0.13 },
  };
  const model = buildDebtRefinancingModel(debt, {});
  assert.ok(model);
  assert.equal(model.amount, 1600);
  assert.equal(model.interestDelta, 253);
  assert.equal(model.epsImpact, -0.13);
  assert.match(model.epsText, /-0,13 \$\/acción/);
  const badges = buildDebtRefinancingBadges(model);
  assert.equal(badges[2].val, '$1600M');
  assert.equal(badges[3].val, '-0,13 $/acc');
});
