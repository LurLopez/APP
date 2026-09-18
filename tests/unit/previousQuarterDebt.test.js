import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceSheetDebt, balanceSheetDebtWithoutCurrentPortion } from '../../src/services/edgar/previousQuarterCashFlow.js';
import { matchConceptKeys, parseInstanceFacts, mergeInstanceFacts } from '../../src/services/edgar/instanceFacts.js';
import { rederiveCashValues } from '../../src/services/edgar/rederiveStatements.js';
import { applyEdgarBalanceFallbacks, pickPreviousQuarterDebt } from '../../src/agents/analyst/analystRunSteps.js';

function millions(value) {
  return value * 1e6;
}

test('la porción corriente de la deuda no se cubre con arrendamientos financieros corrientes', () => {
  const currentDebtKeys = matchConceptKeys('LongTermDebtCurrent') ?? [];
  const financeLeaseKeys = matchConceptKeys('FinanceLeaseLiabilityCurrent') ?? [];
  assert.ok(currentDebtKeys.includes('longTermDebtCurrent'));
  assert.ok(!currentDebtKeys.includes('currentCapitalLeaseObligations'));
  assert.ok(financeLeaseKeys.includes('currentCapitalLeaseObligations'));
  assert.ok(!financeLeaseKeys.includes('longTermDebtCurrent'), 'El arrendamiento financiero corriente no debe tapar la porción corriente de la deuda');
});

test('balanceSheetDebt suma la porción corriente de la deuda a largo plazo (caso TAP 2026-Q1)', () => {
  const row = {
    periodEnd: '2026-03-31',
    values: {
      shortTermLoans: millions(55.5),
      longTermDebt: millions(3848.5),
      longTermDebtCurrent: millions(2367.9),
      totalDebt: millions(6271.9),
    },
  };
  assert.equal(balanceSheetDebt(row), 6271.9);
  assert.equal(balanceSheetDebt({ values: { shortTermLoans: millions(55.5), longTermDebt: millions(3848.5) } }), 3904);
  assert.equal(balanceSheetDebt({ values: { totalDebt: millions(6271.9) } }), 6271.9);
  assert.equal(balanceSheetDebt({ values: {} }), null);
});

test('el rescate desde la instancia XBRL rellena la porción corriente ausente en Company Facts', () => {
  const xml = `
    <context id="c-1">
      <entity><identifier scheme="http://www.sec.gov/CIK">0000024545</identifier></entity>
      <period><instant>2026-03-31</instant></period>
    </context>
    <us-gaap:LongTermDebtCurrent contextRef="c-1">2367900000</us-gaap:LongTermDebtCurrent>
    <us-gaap:LongTermDebt contextRef="c-1">3848500000</us-gaap:LongTermDebt>
    <us-gaap:OtherShortTermBorrowings contextRef="c-1">55500000</us-gaap:OtherShortTermBorrowings>
  `;
  const quarterly = [{ period: '2026-Q1', periodEnd: '2026-03-31', values: {} }];
  const annual = [];
  mergeInstanceFacts(annual, quarterly, parseInstanceFacts(xml), 'TAP');
  assert.equal(quarterly[0].values.longTermDebtCurrent, millions(2367.9));

  rederiveCashValues(annual, quarterly);
  assert.equal(quarterly[0].values.totalDebt, millions(6271.9));
  assert.equal(balanceSheetDebt(quarterly[0]), 6271.9);
});

test('balanceSheetDebtWithoutCurrentPortion deja fuera la porción corriente narrativa (caso PEP 2026-Q1)', () => {
  const row = {
    periodEnd: '2026-03-21',
    values: {
      shortTermLoans: millions(10151),
      longTermDebt: millions(42577),
      longTermDebtCurrent: millions(1600),
      totalDebt: millions(54328),
    },
  };
  assert.equal(balanceSheetDebt(row), 54328);
  assert.equal(balanceSheetDebtWithoutCurrentPortion(row), 52728);
});

test('pickPreviousQuarterDebt usa la composición que reproduce la deuda actual (caso PEP 2026-Q1)', () => {
  const prevFlow = {
    balanceSheetDebt: 54328,
    balanceSheetDebtWithoutCurrentPortion: 52728,
    currentBalanceSheetDebt: 54814,
    currentBalanceSheetDebtWithoutCurrentPortion: 53214,
  };
  assert.equal(pickPreviousQuarterDebt(prevFlow, 53214), 52728);
  assert.equal(pickPreviousQuarterDebt(prevFlow, null), 54328);
});

test('pickPreviousQuarterDebt conserva la porción corriente cuando es real (caso TAP 2026-Q1)', () => {
  const prevFlow = {
    balanceSheetDebt: 6271.9,
    balanceSheetDebtWithoutCurrentPortion: 3904,
    currentBalanceSheetDebt: 7709.6,
    currentBalanceSheetDebtWithoutCurrentPortion: 5700.3,
  };
  assert.equal(pickPreviousQuarterDebt(prevFlow, 7709.6), 6271.9);
});

test('applyEdgarBalanceFallbacks corrige el doble conteo de préstamos a corto plazo (caso TAP 2026-Q2)', () => {
  const extracted = { balance: { totalDebt: 7737.4 } };
  applyEdgarBalanceFallbacks(extracted, { totalDebt: millions(7709.6), shortTermLoans: millions(27.8) });
  assert.equal(extracted.balance.totalDebt, 7709.6);
});

test('applyEdgarBalanceFallbacks respeta la deuda extraída cuando no hay doble conteo', () => {
  const extracted = { balance: { totalDebt: 7709.6 } };
  applyEdgarBalanceFallbacks(extracted, { totalDebt: millions(7709.6), shortTermLoans: millions(27.8) });
  assert.equal(extracted.balance.totalDebt, 7709.6);
});

test('applyEdgarBalanceFallbacks rellena la deuda si la extracción no la trae', () => {
  const extracted = { balance: {} };
  applyEdgarBalanceFallbacks(extracted, { totalDebt: millions(7709.6) });
  assert.equal(extracted.balance.totalDebt, 7709.6);
});
