import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { buildSeries } from '../../src/services/edgar/factsSeries.js';
import { rederiveCashValues, rederiveIncomeValues, rederiveBalanceValues } from '../../src/services/edgar/rederiveStatements.js';

const metricsCode = fs.readFileSync('./public/js/empresa/empresaValuationMetrics.js', 'utf8');
const renderCode = fs.readFileSync('./public/js/empresa/empresaValuationRender.js', 'utf8');

function setupValuationContext() {
  const win = {};
  const context = {
    window: win,
    formatProfilePrice: (v) => `${v} $`,
    formatProfileCompactUsd: (v) => `${v} $`,
    formatMultiple: (v, d = 2) => `${Number(v).toFixed(d)}x`,
    formatProfilePercent: (v) => `${Number(v).toFixed(2)} %`,
    I18n: { t: (k) => k }
  };
  vm.createContext(context);
  vm.runInContext(metricsCode, context);
  return { win, context };
}

test('calculateValuationMetrics devuelve null en dividendos si la empresa no paga dividendo', () => {
  const { win } = setupValuationContext();
  const data = {
    profile: {
      market: { price: 250 },
      metrics: {
        shares: 400000000,
        marketCap: 100000000000,
        dividendPerShare: null,
        dividendYield: null,
        ebitda: 10000000000,
      }
    },
    annual: [
      {
        period: '2025',
        values: {
          dividendPerShare: undefined,
          epsDiluted: 16.5,
          epsDilutedNormalized: 17.8,
          totalDebt: 6000000000,
          cashAndShortTermInvestments: 5000000000,
        }
      }
    ],
    quarterly: [
      { period: '2026-Q2', values: { totalDebt: 6645000000, cashAndShortTermInvestments: 5626000000, ebitda: 2500000000, epsDiluted: 4.1, epsDilutedNormalized: 4.4 } },
      { period: '2026-Q1', values: { ebitda: 2500000000, epsDiluted: 4.1, epsDilutedNormalized: 4.4 } },
      { period: '2025-Q4', values: { ebitda: 2500000000, epsDiluted: 4.1, epsDilutedNormalized: 4.4 } },
      { period: '2025-Q3', values: { ebitda: 2500000000, epsDiluted: 4.1, epsDilutedNormalized: 4.4 } },
    ]
  };

  const v = win.calculateValuationMetrics(data);
  assert.equal(v.dividendPerShare, null);
  assert.equal(v.dividendYield, null);
  assert.equal(v.payoutRatio, null);
  assert.equal(v.payoutRatioNormalized, null);
  assert.equal(v.totalDebt, 6645000000);
  assert.equal(v.netDebt, 1019000000);
  assert.ok(Math.abs(v.netDebtToEbitda - 0.1019) < 0.01);
});

test('calculateValuationMetrics calcula correctamente dividendos para empresas que sí pagan', () => {
  const { win } = setupValuationContext();
  const data = {
    profile: {
      market: { price: 60 },
      metrics: {
        shares: 4300000000,
        marketCap: 258000000000,
        dividendPerShare: 2.0,
        dividendYield: 3.33,
        ebitda: 15000000000,
      }
    },
    annual: [
      {
        period: '2025',
        values: {
          dividendPerShare: 2.0,
          epsDiluted: 2.5,
          epsDilutedNormalized: 2.6,
          totalDebt: 40000000000,
          cashAndShortTermInvestments: 10000000000,
        }
      }
    ],
    quarterly: [
      { period: '2026-Q2', values: { dividendPerShare: 0.5, ebitda: 3750000000, epsDiluted: 0.65, epsDilutedNormalized: 0.7 } },
      { period: '2026-Q1', values: { dividendPerShare: 0.5, ebitda: 3750000000, epsDiluted: 0.65, epsDilutedNormalized: 0.7 } },
      { period: '2025-Q4', values: { dividendPerShare: 0.5, ebitda: 3750000000, epsDiluted: 0.65, epsDilutedNormalized: 0.7 } },
      { period: '2025-Q3', values: { dividendPerShare: 0.5, ebitda: 3750000000, epsDiluted: 0.65, epsDilutedNormalized: 0.7 } },
    ]
  };

  const v = win.calculateValuationMetrics(data);
  assert.equal(v.dividendPerShare, 2.0);
  assert.ok(Math.abs(v.dividendYield - 3.33) < 0.01);
  assert.ok(Math.abs(v.payoutRatio - 76.92) < 0.1);
});

test('renderValuation muestra guion «—» para yield y payout si no hay dividendo', () => {
  const elements = {};
  const win = {
    document: {
      querySelector: (sel) => {
        if (!elements[sel]) elements[sel] = { textContent: '', innerHTML: '', checked: false };
        return elements[sel];
      }
    },
    formatMultiple: (v) => `${v}x`,
    formatProfileCompactUsd: (v) => `${v} $`,
    formatProfilePrice: (v) => `${v} $`,
    formatProfilePercent: (v) => `${v} %`,
    I18n: { t: (k) => k }
  };
  const context = {
    window: win,
    document: win.document,
    formatPrice: win.formatProfilePrice,
    formatCompact: win.formatProfileCompactUsd,
    formatMult: win.formatMultiple,
    formatPct: win.formatProfilePercent,
    calculateValuationMetrics: (d) => d
  };
  vm.createContext(context);
  vm.runInContext(renderCode, context);

  win.renderValuation({
    currency: 'USD',
    price: 248.92,
    marketCap: 100190000000,
    evToEbitda: 10.15,
    enterpriseValue: 101210000000,
    ebitda: 9920000000,
    peRatio: 14.5,
    peRatioNormalized: 13.95,
    eps: 16.7,
    epsNormalized: 17.85,
    netDebtToEbitda: 0.10,
    netDebt: 1019000000,
    dividendYield: null,
    dividendPerShare: null,
    payoutRatio: null,
    payoutRatioNormalized: null,
    priceToFcf: 9.75,
    fcfPerShare: 25.54
  });

  assert.equal(elements['#val-dividend-yield'].textContent, '—');
  assert.equal(elements['#val-dps'].textContent, '—');
  assert.equal(elements['#val-payout-ratio'].textContent, '—');
  assert.equal(elements['#val-payout-dps'].textContent, '—');
  assert.equal(elements['#val-netdebt-ebitda'].textContent, '0.1x');
});

test('DebtCurrent se mapea en shortTermLoans y se desduplica contra longTermDebtCurrent si son idénticos', () => {
  const facts = {
    facts: {
      'us-gaap': {
        LongTermDebtNoncurrent: {
          units: { USD: [{ end: '2026-06-30', val: 3000, fp: 'Q2', form: '10-Q', frame: 'CY2026Q2I' }] }
        },
        DebtCurrent: {
          units: { USD: [{ end: '2026-06-30', val: 1000, fp: 'Q2', form: '10-Q', frame: 'CY2026Q2I' }] }
        },
        LongTermDebtCurrent: {
          units: { USD: [{ end: '2026-06-30', val: 1000, fp: 'Q2', form: '10-Q', frame: 'CY2026Q2I' }] }
        },
        CashAndCashEquivalentsAtCarryingValue: {
          units: { USD: [{ end: '2026-06-30', val: 5000, fp: 'Q2', form: '10-Q', frame: 'CY2026Q2I' }] }
        }
      }
    }
  };

  const { quarterly } = buildSeries(facts);
  rederiveCashValues([], quarterly);
  rederiveIncomeValues([], quarterly);
  rederiveBalanceValues([], quarterly);

  const q = quarterly[0].values;
  assert.equal(q.longTermDebt, 3000);
  assert.equal(q.longTermDebtCurrent, 1000);
  assert.equal(q.totalDebt, 4000); // 3000 + 1000 (sin duplicar los 1000 de DebtCurrent)
  assert.equal(q.netDebt, -1000); // 4000 - 5000 = -1000
});
