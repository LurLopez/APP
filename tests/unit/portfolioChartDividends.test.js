import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lotDividendsReceived, chartSeriesValue } from '../../src/services/portfolio/portfolioChart.service.js';

test('lotDividendsReceived devuelve 0 si no hay dividendos o la fecha del lote es posterior', () => {
  const lot = { date: '2024-01-01', shares: 100, price: 50 };
  assert.equal(lotDividendsReceived([], lot, '2024-06-01'), 0);
  assert.equal(lotDividendsReceived(null, lot, '2024-06-01'), 0);
  assert.equal(lotDividendsReceived([{ date: '2023-12-15', amount: 1.0 }], lot, '2023-12-31'), 0);
});

test('lotDividendsReceived acumula dividendos según las acciones poseídas en cada fecha ex-div', () => {
  const divs = [
    { date: '2023-03-15', amount: 0.50 },
    { date: '2023-06-15', amount: 0.50 },
    { date: '2023-09-15', amount: 0.50 },
    { date: '2023-12-15', amount: 0.50 },
  ];

  const lot = {
    date: '2023-01-10',
    shares: 100,
    price: 50,
    soldPortions: [
      { sellDate: '2023-07-01', shares: 40, sellPrice: 60 },
    ],
  };

  // Antes del primer dividendo
  assert.equal(lotDividendsReceived(divs, lot, '2023-02-01'), 0);

  // Tras el primer dividendo (100 acciones * 0.50 = 50)
  assert.equal(lotDividendsReceived(divs, lot, '2023-04-01'), 50);

  // Tras el segundo dividendo (100 * 0.5 + 100 * 0.5 = 100)
  assert.equal(lotDividendsReceived(divs, lot, '2023-06-20'), 100);

  // Tras la venta de 40 acciones el 2023-07-01 y el tercer dividendo el 2023-09-15 (100 + 60 * 0.5 = 130)
  assert.equal(lotDividendsReceived(divs, lot, '2023-10-01'), 130);

  // Tras el cuarto dividendo (130 + 60 * 0.5 = 160)
  assert.equal(lotDividendsReceived(divs, lot, '2024-01-01'), 160);
});

test('lotDividendsReceived preserva los dividendos cobrados incluso si el lote fue vendido en su totalidad posteriormente', () => {
  const divs = [
    { date: '2023-03-15', amount: 0.50 },
    { date: '2023-06-15', amount: 0.50 },
    { date: '2023-09-15', amount: 0.50 },
  ];

  const lot = {
    date: '2023-01-10',
    shares: 50,
    price: 30,
    soldPortions: [
      { sellDate: '2023-07-01', shares: 50, sellPrice: 40 },
    ],
  };

  // Tras venta total el 07-01, solo cobró los 2 primeros dividendos (50 * 0.5 * 2 = 50)
  assert.equal(lotDividendsReceived(divs, lot, '2023-08-01'), 50);
  // El tercer dividendo (09-15) no se cobra porque las acciones ya estaban vendidas
  assert.equal(lotDividendsReceived(divs, lot, '2023-12-31'), 50);
});

test('chartSeriesValue para serie de compra vs serie de venta', () => {
  const pos = { ticker: 'AAPL', companyName: 'Apple Inc.' };
  const buyLot = {
    id: 1,
    date: '2024-01-15',
    shares: 10,
    remaining: 10,
    price: 150,
    soldPortions: [],
  };
  const soldLot = {
    id: 2,
    date: '2024-01-15',
    shares: 10,
    remaining: 0,
    price: 150,
    soldPortions: [
      { sellDate: '2024-06-15', shares: 10, sellPrice: 180 },
    ],
  };

  const priceMaps = new Map([
    ['AAPL', new Map([
      ['2024-03-01', 165], // +10% gain
      ['2024-06-15', 180], // sale date (+20% gain)
      ['2024-09-01', 210], // later date (+40% gain)
    ])],
  ]);
  const dividendMap = new Map([['AAPL', []]]);
  const frequencyMap = new Map([['AAPL', 4]]);

  // 1. Serie de compra (10 acciones compradas a $150, hoy a $210 -> +40%)
  const buyVal = chartSeriesValue('gainPct', [{ item: pos, lot: buyLot }], priceMaps, dividendMap, '2024-09-01', 0, frequencyMap);
  assert.equal(Math.round(buyVal * 100) / 100, 40);

  // 2. Serie de venta antes de vender (a 2024-03-01 cotizaba a $165 -> +10%)
  const soldValBefore = chartSeriesValue('gainPct', [{ item: pos, lot: soldLot }], priceMaps, dividendMap, '2024-03-01', 0, frequencyMap);
  assert.equal(Math.round(soldValBefore * 100) / 100, 10);

  // 3. Serie de venta después de vender (vendida el 2024-06-15 a $180 -> queda congelada en +20% a perpetuidad)
  const soldValAfter = chartSeriesValue('gainPct', [{ item: pos, lot: soldLot }], priceMaps, dividendMap, '2024-09-01', 0, frequencyMap);
  assert.equal(Math.round(soldValAfter * 100) / 100, 20);
});
