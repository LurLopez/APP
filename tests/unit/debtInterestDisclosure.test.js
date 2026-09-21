import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processDebtSection } from '../../src/agents/analyst/annualConclusionSections.js';

/**
 * La sección anual de deuda debe decir cuántos intereses paga la empresa: tipo medio publicado
 * (o estimado con los intereses del ejercicio sobre la deuda media) y gasto/pago en efectivo.
 * Caso reportado: MCD 2025 (10-K), 4,0 % publicado, 1.582M de gasto y 1.555M pagados.
 */

test('processDebtSection muestra el tipo medio publicado y los intereses del ejercicio (MCD 2025)', () => {
  const conclusion = {
    debt: {
      title: '2: Deuda',
      text: 'La deuda total se sitúa en 39.973M$ (+1.549M$ vs ejercicio anterior). La nota de deuda del 10-K no desglosa los tipos cupón por tramo, por lo que no es posible calcular un tipo de interés medio ponderado exacto por año.',
    },
  };
  const rawAnn = {
    debt: {
      allDebtAverageRate: 4.0,
      allDebtAverageRateSource: 'MD&A Debt highlights',
      maturityItems: [
        { year: 2027, amount: 3201 },
        { year: 2028, amount: 5166 },
      ],
      maturityAfterFive: 25130,
    },
  };
  const edgarData = {
    edgarInterestExpense: 1582,
    edgarInterestPaid: 1555,
    edgarDebtHistory: [
      { year: 2024, totalDebt: 39214 },
      { year: 2025, totalDebt: 41496 },
    ],
  };

  processDebtSection(conclusion, rawAnn, edgarData, 2025, 'es');

  const debt = conclusion.debt;
  assert.equal(debt.allDebtAverageRate, 4);
  assert.equal(debt.allDebtAverageRateEstimated, false);
  assert.doesNotMatch(debt.text, /no desglosa|no es posible calcular/);
  assert.match(debt.text, /El tipo de interés medio de la deuda es del 4,0 %/);
  assert.match(debt.text, /El gasto por intereses del ejercicio fue de 1\.582M/);
  assert.match(debt.text, /Los intereses pagados en efectivo ascendieron a 1\.555M/);
});

test('processDebtSection estima el tipo medio con los intereses del ejercicio cuando no hay dato publicado', () => {
  const conclusion = { debt: { title: '2: Deuda', text: 'Análisis de la estructura de deuda.' } };
  const rawAnn = { debt: {} };
  const edgarData = {
    edgarInterestExpense: 1582,
    edgarDebtHistory: [
      { year: 2024, totalDebt: 39214 },
      { year: 2025, totalDebt: 41496 },
    ],
  };

  processDebtSection(conclusion, rawAnn, edgarData, 2025, 'es');

  const debt = conclusion.debt;
  assert.equal(debt.allDebtAverageRate, 3.9, '1.582M / deuda media 40.355M');
  assert.equal(debt.allDebtAverageRateEstimated, true);
  assert.equal(debt.allDebtAverageRateSource, 'Intereses del ejercicio sobre la deuda media');
  assert.match(debt.text, /El tipo de interés medio estimado de la deuda es del 3,9 %/);
  assert.match(debt.text, /El gasto por intereses del ejercicio fue de 1\.582M/);
});

test('processDebtSection no toca el texto si no hay datos de intereses ni tipo medio', () => {
  const original = 'La nota de deuda no desglosa los tipos cupón por tramo de vencimiento.';
  const conclusion = { debt: { title: '2: Deuda', text: original } };

  processDebtSection(conclusion, { debt: {} }, {}, 2025, 'es');

  assert.equal(conclusion.debt.allDebtAverageRate, undefined);
  assert.equal(conclusion.debt.text, original);
});

test('processDebtSection usa los intereses extraídos del informe si no hay EDGAR', () => {
  const conclusion = { debt: { title: '2: Deuda', text: 'Deuda y vencimientos.' } };
  const rawAnn = { debt: { interestExpense: 420, interestPaid: 400 } };

  processDebtSection(conclusion, rawAnn, {}, 2025, 'es');

  assert.match(conclusion.debt.text, /El gasto por intereses del ejercicio fue de 420M/);
  assert.match(conclusion.debt.text, /Los intereses pagados en efectivo ascendieron a 400M/);
});

test('processDebtSection muestra los tipos por divisa de la nota cuando no hay cupón por vencimiento (MCD 2025)', () => {
  const conclusion = { debt: { title: '2: Deuda', text: 'Análisis de la deuda.' } };
  const rawAnn = {
    debt: {
      rateBuckets: 'USD fija 4,4 % (23.233M), USD flotante 5,1 % (1.298M), EUR fija 2,6 % (11.486M)',
      maturityItems: [{ year: 2027, amount: 3201 }, { year: 2028, amount: 5166 }],
    },
  };

  processDebtSection(conclusion, rawAnn, {}, 2025, 'es');

  const text = conclusion.debt.text;
  assert.ok(text.includes('La nota de deuda no desglosa el cupón de cada vencimiento'));
  assert.ok(text.includes('USD fija 4,4 % (23.233M), USD flotante 5,1 % (1.298M), EUR fija 2,6 % (11.486M)'));
});

test('processDebtSection presenta los tipos por divisa como información cuando ya hay cupones por vencimiento', () => {
  const conclusion = { debt: { title: '2: Deuda', text: 'Análisis de la deuda.' } };
  const rawAnn = {
    debt: {
      rateBuckets: 'USD fija 4,4 %',
      maturityItems: [{ year: 2027, amount: 3201, rate: 3.44 }],
    },
  };

  processDebtSection(conclusion, rawAnn, {}, 2025, 'es');

  assert.match(conclusion.debt.text, /Tipos medios efectivos publicados por la nota de deuda: USD fija 4,4 %\./);
});

test('processDebtSection no repite los tipos por divisa si el texto ya los enumera', () => {
  const conclusion = {
    debt: {
      title: '2: Deuda',
      text: 'La estructura de tipos por divisa es: USD fija 4,4 % (23.233M$), USD flotante 5,1 % (1.298M$), EUR fija 2,6 % (11.486M$).',
    },
  };
  const rawAnn = {
    debt: {
      rateBuckets: 'USD fija 4,4 % (23.233M); USD flotante 5,1 % (1.298M); EUR fija 2,6 % (11.486M)',
      maturityItems: [{ year: 2027, amount: 3201 }],
    },
  };

  processDebtSection(conclusion, rawAnn, {}, 2025, 'es');

  const text = conclusion.debt.text;
  assert.ok(text.includes('La nota de deuda no desglosa el cupón de cada vencimiento, solo los tipos medios efectivos por divisa o categoría.'));
  assert.equal((text.match(/USD fija/g) || []).length, 1, 'los tipos no se duplican');
});
