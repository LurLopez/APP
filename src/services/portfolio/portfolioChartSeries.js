/**
 * @fileoverview Cálculos puros de las series temporales del gráfico de rentabilidad
 * de la cartera: frecuencia de dividendos, renta anualizada, dividendos percibidos
 * por lote, aportaciones netas de bolsillo y valor de cada métrica en una fecha.
 * @module services/portfolio/portfolioChartSeries
 */

import { buildState } from './portfolioFifo.service.js';

const MS_PER_DAY = 1000 * 86400;

/**
 * Estima la frecuencia de pago anual (12, 4, 2 o 1) a partir de la mediana de
 * los intervalos entre dividendos.
 * @param {Array<Object>} dividends - Dividendos ordenados cronológicamente.
 * @returns {number} Pagos por año.
 */
export function detectDividendFrequency(dividends) {
  if (!dividends || dividends.length < 2) return 4;
  const intervals = [];
  for (let i = 1; i < dividends.length; i++) {
    const days = (Date.parse(dividends[i].date) - Date.parse(dividends[i - 1].date)) / MS_PER_DAY;
    if (days >= 15) intervals.push(days);
  }
  if (!intervals.length) return 4;
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  if (median <= 45) return 12;
  if (median <= 135) return 4;
  if (median <= 250) return 2;
  return 1;
}

/**
 * Calcula la renta anual estimada por acción a una fecha (regulariza pagos
 * extraordinarios y descarta historiales demasiado antiguos).
 * @param {Array<Object>} dividends - Historial de dividendos.
 * @param {string} date - Fecha de referencia.
 * @param {number} [frequency=4] - Pagos por año.
 * @returns {number}
 */
export function annualDividendRateAtDate(dividends, date, frequency = 4) {
  if (!dividends || !dividends.length) return 0;
  const past = dividends.filter((dividend) => dividend.date <= date);
  if (!past.length) {
    const first = dividends[0];
    const diffDays = (Date.parse(first.date) - Date.parse(date)) / MS_PER_DAY;
    if (diffDays <= 365) return first.amount * frequency;
    return 0;
  }
  const last = past[past.length - 1];
  const daysSinceLast = (Date.parse(date) - Date.parse(last.date)) / MS_PER_DAY;
  if (daysSinceLast > 500) return 0;

  let regularAmount = last.amount;
  if (past.length >= 2 && last.amount > past[past.length - 2].amount * 2.5) {
    regularAmount = past[past.length - 2].amount;
  }
  return regularAmount * frequency;
}

/**
 * Acciones de un lote que siguen en cartera a una fecha (descontando ventas).
 * @param {Object} lot - Lote FIFO.
 * @param {string} date - Fecha de referencia.
 * @returns {number}
 */
export function remainingSharesOn(lot, date) {
  return (lot.soldPortions ?? []).reduce(
    (shares, sale) => (sale.sellDate <= date ? shares - sale.shares : shares),
    lot.shares
  );
}

function hasSoldPortions(lot, date) {
  return (lot.soldPortions ?? []).some((sale) => sale.sellDate <= date);
}

/**
 * Dividendos percibidos por un lote entre su compra y una fecha.
 * @param {Array<Object>} dividends - Historial de dividendos.
 * @param {Object} lot - Lote FIFO.
 * @param {string} date - Fecha de referencia.
 * @returns {number}
 */
export function lotDividendsReceived(dividends, lot, date) {
  if (!dividends || !dividends.length || lot.date > date) return 0;
  return dividends.reduce((total, dividend) => {
    if (dividend.date < lot.date || dividend.date > date) return total;
    const shares = remainingSharesOn(lot, dividend.date);
    return shares > 0 ? total + dividend.amount * shares : total;
  }, 0);
}

function collectDividendEvents(state, tickerDividends) {
  const events = [];
  for (const item of state) {
    const dividends = tickerDividends?.get(item.ticker) ?? [];
    if (!dividends.length) continue;
    for (const lot of item.lots) {
      for (const dividend of dividends) {
        if (dividend.date < lot.date) continue;
        const shares = remainingSharesOn(lot, dividend.date);
        if (shares > 0) {
          events.push({ date: dividend.date, type: 'dividend', priority: 1, amount: dividend.amount * shares });
        }
      }
    }
  }
  return events;
}

function collectSaleEvents(state) {
  const events = [];
  for (const item of state) {
    for (const lot of item.lots) {
      for (const sale of lot.soldPortions ?? []) {
        events.push({ date: sale.sellDate, type: 'sale', priority: 2, amount: sale.shares * sale.sellPrice });
      }
    }
  }
  return events;
}

function collectBuyEvents(state) {
  const events = [];
  for (const item of state) {
    for (const lot of item.lots) {
      events.push({ date: lot.date, type: 'buy', priority: 3, amount: lot.shares * lot.price });
    }
  }
  return events;
}

/** Orden cronológico estricto: dividendos → ventas → compras a misma fecha. */
function compareTimelineEvents(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return a.priority - b.priority;
}

/**
 * Recorre los movimientos simulando la liquidez interna: los cobros financian
 * compras y el déficit de cada compra se registra como aportación de bolsillo.
 */
function buildCashHistory(events) {
  let cash = 0;
  let contributions = 0;
  const history = [];

  for (const event of events) {
    if (event.type === 'buy') {
      const missing = event.amount - cash;
      if (missing > 0) {
        contributions += missing;
        cash = 0;
      } else {
        cash -= event.amount;
      }
    } else {
      cash += event.amount;
    }
    history.push({ date: event.date, contributions, cash });
  }
  return history;
}

function findContributionsAt(history, date) {
  if (!history.length || date < history[0].date) return 0;
  let low = 0;
  let high = history.length - 1;
  let best = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (history[mid].date <= date) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best >= 0 ? history[best].contributions : 0;
}

/**
 * Calcula la serie temporal acumulada de aportaciones netas (capital de bolsillo)
 * rastreando la liquidez interna de la cartera (cobro de dividendos y ventas previas).
 * @param {Array<Object>} transactions - Transacciones de compra y venta.
 * @param {Array<Object>} [state] - Estado FIFO de lotes (opcional si se infiere de transactions).
 * @param {Map<string, Array<Object>>} [tickerDividends] - Historial de dividendos por ticker.
 * @returns {(date: string) => number} Función que devuelve las aportaciones netas a una fecha dada.
 */
export function calculateContributionsTimeline(transactions, state, tickerDividends = new Map()) {
  const effectiveState = state || buildState(transactions);
  const events = [
    ...collectDividendEvents(effectiveState, tickerDividends),
    ...collectSaleEvents(effectiveState),
    ...collectBuyEvents(effectiveState),
  ].sort(compareTimelineEvents);

  const history = buildCashHistory(events);
  return (date) => findContributionsAt(history, date);
}

function createSeriesAccumulator() {
  return {
    shares: 0,
    cost: 0,
    gain: 0,
    annualDividends: 0,
    collectedDividends: 0,
    frozen: false,
    frozenValue: 0,
    frozenGain: 0,
    frozenCost: 0,
    frozenAnnual: 0,
    value: 0,
    pricedShares: 0,
    realizedGain: 0,
    realizedCost: 0,
  };
}

function accumulateHeldLot(accumulator, { item, lot, heldShares, dividends }, { date, priceMaps, frequencyMap }) {
  const frequency = frequencyMap?.get(item.ticker) ?? 4;
  accumulator.shares += heldShares;
  accumulator.cost += heldShares * lot.price;
  accumulator.annualDividends += annualDividendRateAtDate(dividends, date, frequency) * heldShares;

  const price = priceMaps.get(item.ticker)?.get(date);
  if (price === undefined) return;
  accumulator.gain += (price - lot.price) * heldShares;
  accumulator.value += price * heldShares;
  accumulator.pricedShares += heldShares;
}

function accumulateFrozenLot(accumulator, { item, lot, dividends }, { date, frequencyMap }) {
  const frequency = frequencyMap?.get(item.ticker) ?? 4;
  accumulator.frozen = true;
  for (const sale of lot.soldPortions ?? []) {
    if (sale.sellDate > date) continue;
    accumulator.frozenCost += sale.shares * lot.price;
    accumulator.frozenValue += sale.shares * sale.sellPrice;
    accumulator.frozenGain += sale.shares * (sale.sellPrice - lot.price);
    accumulator.frozenAnnual += annualDividendRateAtDate(dividends, sale.sellDate, frequency) * sale.shares;
  }
}

function accumulateRealizedPortions(accumulator, lot, date) {
  for (const portion of lot.soldPortions ?? []) {
    if (portion.sellDate > date) continue;
    accumulator.realizedGain += (portion.sellPrice - lot.price) * portion.shares;
    accumulator.realizedCost += lot.price * portion.shares;
  }
}

function accumulateSelectedLot(accumulator, { item, lot }, context) {
  if (lot.date > context.date) return;

  const dividends = context.dividendMap.get(item.ticker) ?? [];
  if (context.collectDividends) {
    accumulator.collectedDividends += lotDividendsReceived(dividends, lot, context.date);
  }
  accumulateRealizedPortions(accumulator, lot, context.date);

  const heldShares = remainingSharesOn(lot, context.date);
  if (heldShares > 0) {
    accumulateHeldLot(accumulator, { item, lot, heldShares, dividends }, context);
    return;
  }
  if (hasSoldPortions(lot, context.date)) {
    accumulateFrozenLot(accumulator, { item, lot, dividends }, context);
  }
}

function percentageOrNull(numerator, denominator) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function resolveFrozenMetric(metric, accumulator) {
  switch (metric) {
    case 'weight':
      return 0;
    case 'gainAmount':
      return accumulator.frozenGain;
    case 'gainPct':
      return percentageOrNull(accumulator.frozenGain, accumulator.frozenCost);
    case 'gainWithDividendsAmount':
      return accumulator.frozenGain + accumulator.collectedDividends;
    case 'gainWithDividendsPct':
      return percentageOrNull(accumulator.frozenGain + accumulator.collectedDividends, accumulator.frozenCost);
    case 'dividendYield':
      return percentageOrNull(accumulator.frozenAnnual, accumulator.frozenValue);
    case 'dividendYoc':
      return percentageOrNull(accumulator.frozenAnnual, accumulator.frozenCost);
    default:
      return undefined;
  }
}

function resolveActiveMetric(metric, accumulator, portfolioValue) {
  const realizedGain = accumulator.gain + accumulator.realizedGain;
  const realizedCost = accumulator.cost + accumulator.realizedCost;
  const priced = accumulator.pricedShares > 0;

  switch (metric) {
    case 'gainAmount':
      return accumulator.shares > 0 && priced ? realizedGain : null;
    case 'gainPct':
      return priced ? percentageOrNull(realizedGain, realizedCost) : null;
    case 'gainWithDividendsAmount':
      return accumulator.shares > 0 && priced ? realizedGain + accumulator.collectedDividends : null;
    case 'gainWithDividendsPct':
      return priced ? percentageOrNull(realizedGain + accumulator.collectedDividends, realizedCost) : null;
    case 'dividendYield':
      return percentageOrNull(accumulator.annualDividends, accumulator.value);
    case 'dividendYoc':
      return percentageOrNull(accumulator.annualDividends, accumulator.cost);
    default:
      return portfolioValue > 0 ? (accumulator.value / portfolioValue) * 100 : 0;
  }
}

function resolveSeriesMetric(metric, accumulator, portfolioValue) {
  if (accumulator.frozen && accumulator.shares === 0) {
    const frozenValue = resolveFrozenMetric(metric, accumulator);
    if (frozenValue !== undefined) return frozenValue;
  }
  return resolveActiveMetric(metric, accumulator, portfolioValue);
}

/**
 * Valor de una métrica para una selección de lotes en una fecha concreta.
 * @param {string} metric - Métrica del gráfico.
 * @param {Array<{item: Object, lot: Object}>} selectedLots - Lotes seleccionados.
 * @param {Map<string, Map<string, number>>} priceMaps - Precios de cierre por ticker y fecha.
 * @param {Map<string, Array<Object>>} dividendMap - Dividendos por ticker.
 * @param {string} date - Fecha de la serie.
 * @param {number} portfolioValue - Valor total de la cartera en la fecha (para la métrica de peso).
 * @param {Map<string, number>} frequencyMap - Frecuencia de dividendos por ticker.
 * @returns {number|null}
 */
export function chartSeriesValue(metric, selectedLots, priceMaps, dividendMap, date, portfolioValue, frequencyMap) {
  const accumulator = createSeriesAccumulator();
  const context = {
    date,
    priceMaps,
    dividendMap,
    frequencyMap,
    collectDividends: metric === 'gainWithDividendsAmount' || metric === 'gainWithDividendsPct',
  };

  for (const selected of selectedLots) {
    accumulateSelectedLot(accumulator, selected, context);
  }
  return resolveSeriesMetric(metric, accumulator, portfolioValue);
}
