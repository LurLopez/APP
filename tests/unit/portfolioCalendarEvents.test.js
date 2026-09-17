import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioCalendarEvents } from '../../src/services/portfolio/portfolioCalendarEvents.service.js';

function isoOffset(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test('genera eventos futuros de resultados, ex-dividendo y pago desde el calendario de mercado', () => {
  const exDate = isoOffset(20);
  const payDate = isoOffset(34);
  const earningsDate = isoOffset(25);

  const calendarMap = new Map([['KO', { exDividendDate: exDate, dividendDate: payDate, earningsDate, earningsDateEstimate: false }]]);
  const { events, companies } = buildPortfolioCalendarEvents(
    [],
    [{ ticker: 'KO', companyName: 'Coca-Cola' }],
    new Map(),
    new Map(),
    new Map(),
    calendarMap,
  );

  const exdiv = events.find((e) => e.type === 'exdiv' && e.ticker === 'KO');
  const payout = events.find((e) => e.type === 'payout' && e.ticker === 'KO');
  const earnings = events.find((e) => e.type === 'earnings' && e.ticker === 'KO');

  assert.equal(companies.length, 1);
  assert.equal(exdiv.dateStr, exDate);
  assert.equal(exdiv.status, 'Anunciado');
  assert.equal(payout.dateStr, payDate);
  assert.equal(payout.status, 'Confirmado');
  assert.equal(earnings.dateStr, earningsDate);
  assert.equal(earnings.status, 'Convocado');
  assert.equal(earnings.accession, null);
});

test('usa la fecha de pago real anunciada y no duplica el pago estimado a 14 días', () => {
  const exDate = isoOffset(-3);
  const realPayDate = isoOffset(12);
  const estimatedPayDate = isoOffset(11);

  const dividendMap = new Map([['KO', [{ date: exDate, amount: 0.53 }]]]);
  const calendarMap = new Map([['KO', { exDividendDate: exDate, dividendDate: realPayDate, earningsDate: null, earningsDateEstimate: false }]]);
  const { events } = buildPortfolioCalendarEvents(
    [],
    [{ ticker: 'KO', companyName: 'Coca-Cola' }],
    dividendMap,
    new Map(),
    new Map(),
    calendarMap,
  );

  const payouts = events.filter((e) => e.type === 'payout' && e.ticker === 'KO');
  assert.equal(payouts.length, 1);
  assert.equal(payouts[0].dateStr, realPayDate);
  assert.equal(events.some((e) => e.dateStr === estimatedPayDate && e.type === 'payout'), false);
});

test('mantiene el pago estimado a 14 días cuando el mercado no anuncia la fecha de abono', () => {
  const exDate = isoOffset(-20);
  const estimatedPayDate = isoOffset(-6);

  const dividendMap = new Map([['KO', [{ date: exDate, amount: 0.53 }]]]);
  const { events } = buildPortfolioCalendarEvents(
    [],
    [{ ticker: 'KO', companyName: 'Coca-Cola' }],
    dividendMap,
    new Map(),
    new Map(),
    new Map(),
  );

  const payouts = events.filter((e) => e.type === 'payout' && e.ticker === 'KO');
  assert.equal(payouts.length, 1);
  assert.equal(payouts[0].dateStr, estimatedPayDate);
});

test('no duplica resultados cuando EDGAR ya tiene un filing en la misma fecha que el mercado', () => {
  const earningsDate = isoOffset(15);

  const filingsMap = new Map([['KO', [{ filedAt: earningsDate, formType: '10-Q', accession: '0001-24-000001', periodLabel: 'Q3 2026' }]]]);
  const calendarMap = new Map([['KO', { exDividendDate: null, dividendDate: null, earningsDate, earningsDateEstimate: false }]]);
  const { events } = buildPortfolioCalendarEvents(
    [],
    [{ ticker: 'KO', companyName: 'Coca-Cola' }],
    new Map(),
    filingsMap,
    new Map(),
    calendarMap,
  );

  const earnings = events.filter((e) => e.type === 'earnings' && e.ticker === 'KO');
  assert.equal(earnings.length, 1);
  assert.equal(earnings[0].accession, '0001-24-000001');
});

test('las posiciones de cartera calculan el importe total con el último dividendo conocido', () => {
  const exDate = isoOffset(30);
  const payDate = isoOffset(44);
  const dividendMap = new Map([['TAP', [{ date: isoOffset(-60), amount: 0.45 }]]]);
  const calendarMap = new Map([['TAP', { exDividendDate: exDate, dividendDate: payDate, earningsDate: null, earningsDateEstimate: false }]]);
  const { events } = buildPortfolioCalendarEvents(
    [{ ticker: 'tap', companyName: 'Molson Coors', shares: 100 }],
    [],
    dividendMap,
    new Map(),
    new Map(),
    calendarMap,
  );

  const exdiv = events.find((e) => e.type === 'exdiv' && e.ticker === 'TAP');
  const payout = events.find((e) => e.type === 'payout' && e.ticker === 'TAP');
  assert.equal(exdiv.isPortfolio, true);
  assert.equal(exdiv.amount, 45);
  assert.equal(payout.amount, 45);
});
