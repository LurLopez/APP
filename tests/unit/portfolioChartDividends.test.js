import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lotDividendsReceived, chartSeriesValue, calculateContributionsTimeline } from '../../src/services/portfolio/portfolioChart.service.js';

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

test('chartSeriesValue para posición parcialmente vendida calcula el total exacto (no realizada + realizada) y peso ponderado', () => {
  // Escenario del usuario:
  // Lote 1: 100 acciones compradas el 2020-01-01 a $100
  // Lote 2: 200 acciones compradas el 2021-01-01 a $100
  // Venta en 2023-01-01 de 100 acciones a $150 (consumió Lote 1 vía FIFO)
  const pos = { ticker: 'ABC', companyName: 'ABC Corp' };
  const lot1 = {
    id: 1,
    date: '2020-01-01',
    shares: 100,
    price: 100,
    remaining: 0,
    soldPortions: [
      { sellDate: '2023-01-01', shares: 100, sellPrice: 150 },
    ],
  };
  const lot2 = {
    id: 2,
    date: '2021-01-01',
    shares: 200,
    price: 100,
    remaining: 200,
    soldPortions: [],
  };

  const selectedLots = [
    { item: pos, lot: lot1 },
    { item: pos, lot: lot2 },
  ];

  const priceMaps = new Map([
    ['ABC', new Map([
      ['2022-06-01', 120], // En 2022 todavía tiene 300 acciones. Coste 30.000$, valor 36.000$ -> +20%
      ['2024-06-01', 200], // En 2024: 200 acciones en cartera a $200 (ganancia $20.000) + 100 vendidas a $150 (ganancia realizada $5.000) = $25.000 total sobre $30.000 coste -> +83.33%
    ])],
  ]);
  const dividendMap = new Map([['ABC', []]]);
  const frequencyMap = new Map([['ABC', 4]]);

  // 1. En 2022 (antes de la venta de 2023):
  // Peso calculado sobre las 300 acciones (valor = 300 * 120 = 36.000, portfolioValue = 100.000 -> 36%)
  const weight2022 = chartSeriesValue('weight', selectedLots, priceMaps, dividendMap, '2022-06-01', 100000, frequencyMap);
  assert.equal(weight2022, 36);

  // Ganancia en 2022: unrealized 6.000 sobre coste 30.000 = +20%
  const gainPct2022 = chartSeriesValue('gainPct', selectedLots, priceMaps, dividendMap, '2022-06-01', 100000, frequencyMap);
  assert.equal(gainPct2022, 20);

  // 2. En 2024 (después de la venta de 2023):
  // Peso calculado sobre las 200 acciones restantes (valor = 200 * 200 = 40.000, portfolioValue = 100.000 -> 40%)
  const weight2024 = chartSeriesValue('weight', selectedLots, priceMaps, dividendMap, '2024-06-01', 100000, frequencyMap);
  assert.equal(weight2024, 40);

  // Ganancia en 2024: 20.000 no realizada + 5.000 realizada = 25.000$
  const gainAmount2024 = chartSeriesValue('gainAmount', selectedLots, priceMaps, dividendMap, '2024-06-01', 100000, frequencyMap);
  assert.equal(gainAmount2024, 25000);

  // Ganancia % en 2024: 25.000$ / (20.000$ coste vivo + 10.000$ coste realizado = 30.000$) = 83.333%
  const gainPct2024 = chartSeriesValue('gainPct', selectedLots, priceMaps, dividendMap, '2024-06-01', 100000, frequencyMap);
  assert.equal(Math.round(gainPct2024 * 100) / 100, 83.33);
});

test('calculateContributionsTimeline: compras sucesivas sin liquidez previa computan como aportaciones', () => {
  const transactions = [
    { id: 1, type: 'buy', ticker: 'AAPL', shares: 10, price: 100, tradeDate: '2020-01-01' },
    { id: 2, type: 'buy', ticker: 'MSFT', shares: 5, price: 200, tradeDate: '2021-01-01' },
  ];

  const contribAt = calculateContributionsTimeline(transactions);
  assert.equal(contribAt('2019-12-31'), 0);
  assert.equal(contribAt('2020-01-01'), 1000);
  assert.equal(contribAt('2020-06-01'), 1000);
  assert.equal(contribAt('2021-01-01'), 2000);
  assert.equal(contribAt('2022-01-01'), 2000);
});

test('calculateContributionsTimeline: compras financiadas por dividendos no incrementan aportaciones', () => {
  // 1. Compra 100 acciones de AAPL a $10 ($1000) el 2020-01-01 -> Aportaciones = 1000, Liquidez = 0
  // 2. Cobra dividendo de $1/acc ($100) el 2020-06-01 -> Liquidez = 100, Aportaciones = 1000
  // 3. Compra 2 acciones de MSFT a $40 ($80) el 2020-07-01 -> Cubierto por liquidez. Liquidez = 20, Aportaciones = 1000
  // 4. Compra 1 acción de GOOG a $50 el 2020-08-01 -> Liquidez cubre 20, faltan 30 de bolsillo -> Aportaciones = 1030, Liquidez = 0
  const transactions = [
    { id: 1, type: 'buy', ticker: 'AAPL', shares: 100, price: 10, tradeDate: '2020-01-01' },
    { id: 2, type: 'buy', ticker: 'MSFT', shares: 2, price: 40, tradeDate: '2020-07-01' },
    { id: 3, type: 'buy', ticker: 'GOOG', shares: 1, price: 50, tradeDate: '2020-08-01' },
  ];
  const tickerDividends = new Map([
    ['AAPL', [{ date: '2020-06-01', amount: 1.0 }]],
    ['MSFT', []],
    ['GOOG', []],
  ]);

  const contribAt = calculateContributionsTimeline(transactions, null, tickerDividends);
  assert.equal(contribAt('2020-01-01'), 1000);
  assert.equal(contribAt('2020-06-01'), 1000);
  assert.equal(contribAt('2020-07-01'), 1000); // 80 financiado por dividendos
  assert.equal(contribAt('2020-08-01'), 1030); // 20 liquidez remanente + 30 aportados
});

test('calculateContributionsTimeline: compras financiadas por ventas de acciones no incrementan aportaciones', () => {
  // 1. Compra 100 acc AAPL @ $10 ($1000) el 2020-01-01 -> Aportaciones = 1000
  // 2. Venta de 100 acc AAPL @ $15 ($1500) el 2021-01-01 -> Liquidez = 1500
  // 3. Compra de 10 acc MSFT @ $120 ($1200) el 2021-02-01 -> Financiada 100% por venta. Liquidez = 300, Aportaciones = 1000
  // 4. Compra de 5 acc NVDA @ $100 ($500) el 2021-03-01 -> Liquidez cubre 300, faltan 200 de bolsillo -> Aportaciones = 1200
  const transactions = [
    { id: 1, type: 'buy', ticker: 'AAPL', shares: 100, price: 10, tradeDate: '2020-01-01' },
    { id: 2, type: 'sell', ticker: 'AAPL', shares: 100, price: 15, tradeDate: '2021-01-01' },
    { id: 3, type: 'buy', ticker: 'MSFT', shares: 10, price: 120, tradeDate: '2021-02-01' },
    { id: 4, type: 'buy', ticker: 'NVDA', shares: 5, price: 100, tradeDate: '2021-03-01' },
  ];

  const contribAt = calculateContributionsTimeline(transactions);
  assert.equal(contribAt('2020-01-01'), 1000);
  assert.equal(contribAt('2021-01-01'), 1000);
  assert.equal(contribAt('2021-02-01'), 1000);
  assert.equal(contribAt('2021-03-01'), 1200);
});

