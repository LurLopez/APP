/**
 * @fileoverview Motor de series temporales para el gráfico de rentabilidad de la cartera (plusvalías, dividendos y ponderación).
 * @module services/portfolio/portfolioChart
 */

import * as portfolioRepository from '../../../db/repositories/portfolioRepository.js';
import { getMarketQuote, getDividendHistory, getHistoricalPrices } from '../market.service.js';
import { getCompanyOrigin } from '../edgar.service.js';
import { buildState, PortfolioError } from './portfolioFifo.service.js';
import { regionForCountry, instrumentTypeLabel } from './portfolioAggregator.service.js';

const CHART_METRICS = new Set(['gainAmount', 'gainPct', 'gainWithDividendsAmount', 'gainWithDividendsPct', 'dividendYield', 'dividendYoc', 'weight']);
const CHART_RANGES = new Set(['1m', '3m', '6m', '1y', '2y', '3y', '5y', 'all']);
const RANGE_DAYS = { '1m': 31, '3m': 93, '6m': 186, '1y': 365, '2y': 730, '3y': 1095, '5y': 1825 };

function chartStartDate(range) {
  if (range === 'all') return null;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - RANGE_DAYS[range]);
  return date.toISOString().slice(0, 10);
}

export function detectDividendFrequency(dividends) {
  if (!dividends || dividends.length < 2) return 4;
  const intervals = [];
  for (let i = 1; i < dividends.length; i++) {
    const days = (Date.parse(dividends[i].date) - Date.parse(dividends[i - 1].date)) / (1000 * 86400);
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

export function annualDividendRateAtDate(dividends, date, frequency = 4) {
  if (!dividends || !dividends.length) return 0;
  const past = dividends.filter((d) => d.date <= date);
  if (!past.length) {
    const first = dividends[0];
    const diffDays = (Date.parse(first.date) - Date.parse(date)) / (1000 * 86400);
    if (diffDays <= 365) return first.amount * frequency;
    return 0;
  }
  const last = past[past.length - 1];
  const daysSinceLast = (Date.parse(date) - Date.parse(last.date)) / (1000 * 86400);
  if (daysSinceLast > 500) return 0;

  let regularAmount = last.amount;
  if (past.length >= 2) {
    const prev = past[past.length - 2];
    if (last.amount > prev.amount * 2.5) {
      regularAmount = prev.amount;
    }
  }
  return regularAmount * frequency;
}

export function lotDividendsReceived(dividends, lot, date) {
  if (!dividends || !dividends.length || lot.date > date) return 0;
  let total = 0;
  for (const div of dividends) {
    if (div.date < lot.date || div.date > date) continue;
    let sharesOnDivDate = lot.shares;
    for (const sale of lot.soldPortions ?? []) {
      if (sale.sellDate <= div.date) {
        sharesOnDivDate -= sale.shares;
      }
    }
    if (sharesOnDivDate > 0) {
      total += div.amount * sharesOnDivDate;
    }
  }
  return total;
}

export function chartSeriesValue(metric, selectedLots, priceMaps, dividendMap, date, portfolioValue, frequencyMap) {
  let shares = 0;
  let cost = 0;
  let gain = 0;
  let annualDividends = 0;
  let collectedDividends = 0;
  let frozen = false;
  let frozenValue = 0;
  let frozenGain = 0;
  let frozenCost = 0;
  let frozenAnnual = 0;
  let value = 0;
  let pricedShares = 0;
  let realizedGain = 0;
  let realizedCost = 0;

  const isDivGainMetric = metric === 'gainWithDividendsAmount' || metric === 'gainWithDividendsPct';

  for (const selected of selectedLots) {
    const { item, lot } = selected;
    if (lot.date > date) continue;
    let lotShares = lot.shares;
    let soldDate = null;

    for (const portion of lot.soldPortions ?? []) {
      if (portion.sellDate <= date) {
        lotShares -= portion.shares;
        soldDate = portion.sellDate;
        realizedGain += (portion.sellPrice - lot.price) * portion.shares;
        realizedCost += lot.price * portion.shares;
      }
    }

    const heldCost = lotShares * lot.price;
    const dividends = dividendMap.get(item.ticker) ?? [];
    const freq = frequencyMap?.get(item.ticker) ?? 4;
    const divPerShare = annualDividendRateAtDate(dividends, date, freq);

    if (isDivGainMetric) {
      collectedDividends += lotDividendsReceived(dividends, lot, date);
    }

    if (lotShares > 0) {
      shares += lotShares;
      cost += heldCost;
      annualDividends += divPerShare * lotShares;
      const price = priceMaps.get(item.ticker)?.get(date);
      if (price !== undefined) {
        gain += (price - lot.price) * lotShares;
        value += price * lotShares;
        pricedShares += lotShares;
      }
    } else if (soldDate && soldDate <= date) {
      frozen = true;
      for (const sale of lot.soldPortions ?? []) {
        if (sale.sellDate > date) continue;
        frozenCost += sale.shares * lot.price;
        frozenValue += sale.shares * sale.sellPrice;
        frozenGain += sale.shares * (sale.sellPrice - lot.price);
        const saleDiv = annualDividendRateAtDate(dividends, sale.sellDate, freq);
        frozenAnnual += saleDiv * sale.shares;
      }
    }
  }

  if (frozen && shares === 0) {
    if (metric === 'weight') return 0;
    if (metric === 'gainAmount') return frozenGain;
    if (metric === 'gainPct') return frozenCost > 0 ? (frozenGain / frozenCost) * 100 : null;
    if (metric === 'gainWithDividendsAmount') return frozenGain + collectedDividends;
    if (metric === 'gainWithDividendsPct') return frozenCost > 0 ? ((frozenGain + collectedDividends) / frozenCost) * 100 : null;
    if (metric === 'dividendYield') return frozenValue > 0 ? (frozenAnnual / frozenValue) * 100 : null;
    if (metric === 'dividendYoc') return frozenCost > 0 ? (frozenAnnual / frozenCost) * 100 : null;
  }

  if (metric === 'gainAmount') return shares > 0 && pricedShares > 0 ? gain + realizedGain : null;
  if (metric === 'gainPct') return cost + realizedCost > 0 && pricedShares > 0 ? ((gain + realizedGain) / (cost + realizedCost)) * 100 : null;
  if (metric === 'gainWithDividendsAmount') return shares > 0 && pricedShares > 0 ? gain + realizedGain + collectedDividends : null;
  if (metric === 'gainWithDividendsPct') return cost + realizedCost > 0 && pricedShares > 0 ? ((gain + realizedGain + collectedDividends) / (cost + realizedCost)) * 100 : null;
  if (metric === 'dividendYield') return value > 0 ? (annualDividends / value) * 100 : null;
  if (metric === 'dividendYoc') return cost > 0 ? (annualDividends / cost) * 100 : null;
  return portfolioValue > 0 ? (value / portfolioValue) * 100 : 0;
}

function getPredefinedGroupValue(ticker, tabKey, originMap, quoteMap) {
  if (tabKey === 'sector') return originMap.get(ticker)?.sector || 'Sin sector';
  if (tabKey === 'country') return originMap.get(ticker)?.country || 'Sin país';
  if (tabKey === 'region') return regionForCountry(originMap.get(ticker)?.country) || 'Sin región';
  if (tabKey === 'type') return instrumentTypeLabel(quoteMap.get(ticker)?.instrumentType) || 'Sin tipo';
  return null;
}

function resolvePredefinedLots(tabKey, targetLabel, state, originMap, quoteMap) {
  const matching = state.filter((item) => {
    const val = getPredefinedGroupValue(item.ticker, tabKey, originMap, quoteMap);
    return val && val.toLowerCase() === targetLabel.toLowerCase();
  });
  return matching.flatMap((item) => item.lots.map((lot) => ({ item, lot })));
}

/**
 * Genera la serie de datos para el gráfico comparativo interactivo de la cartera.
 * @param {number} userId - ID del usuario.
 * @param {Object} options - Parámetros del gráfico.
 * @param {string[]} options.ids - Lista de IDs de elementos a graficar (ticker, lot, grupo).
 * @param {string} [options.metric='gainPct'] - Métrica seleccionada.
 * @param {string} [options.range='1y'] - Rango temporal.
 * @returns {Promise<Object>}
 */
export async function getPortfolioChart(userId, { ids, metric = 'gainPct', range = '1y' }) {
  if (!CHART_METRICS.has(metric)) throw new PortfolioError('Métrica de gráfico no válida.', 'INVALID_CHART');
  if (!CHART_RANGES.has(range)) throw new PortfolioError('Rango de gráfico no válido.', 'INVALID_CHART');
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20) throw new PortfolioError('Selecciona entre 1 y 20 elementos.', 'INVALID_CHART');

  const [transactions, groups, rules, lotAssignments] = await Promise.all([
    portfolioRepository.listTransactions(userId),
    portfolioRepository.listGroups(userId),
    portfolioRepository.listGroupRules(userId),
    portfolioRepository.listGroupLots(userId),
  ]);

  const state = buildState(transactions);
  if (!state.length) {
    return { metric, range, source: 'Yahoo Finance', points: [], labels: [] };
  }

  const groupById = new Map(groups.map((group) => [group.id, group]));
  const start = chartStartDate(range);
  const today = new Date().toISOString().slice(0, 10);
  const from = transactions.map((item) => item.tradeDate).sort()[0] ?? today;

  const tickers = [...new Set(state.map((item) => item.ticker))];
  const [pricesResults, dividendsResults, originResults, quoteResults] = await Promise.all([
    Promise.all(tickers.map(async (t) => [t, await getHistoricalPrices(t, { from, to: today }).catch(() => [])])),
    Promise.all(tickers.map(async (t) => [t, await getDividendHistory(t, { from }).catch(() => [])])),
    Promise.all(tickers.map(async (t) => [t, await getCompanyOrigin(t).catch(() => ({ sector: null, country: null }))])),
    Promise.all(tickers.map(async (t) => [t, await getMarketQuote(t).catch(() => null)])),
  ]);

  const tickerPrices = new Map(pricesResults);
  const tickerDividends = new Map(dividendsResults);
  const originMap = new Map(originResults);
  const quoteMap = new Map(quoteResults);

  const resolveItem = (rawId) => {
    const id = String(rawId).trim();
    if (!id) return null;

    if (id.startsWith('ticker:')) {
      const rest = id.slice(7).trim();
      const parts = rest.split(':');
      const ticker = parts[0].trim().toUpperCase();
      const mode = parts[1]?.trim().toLowerCase(); // 'buy' or 'sell'

      const pos = state.find((item) => item.ticker.toUpperCase() === ticker);
      if (!pos) return null;

      const hasHeld = (pos.heldShares ?? 0) > 0;
      const hasSold = (pos.sharesSold ?? 0) > 0;

      let effMode = mode;
      if (!effMode) {
        effMode = hasHeld && !hasSold ? 'buy' : (!hasHeld && hasSold ? 'sell' : 'buy');
      }

      if (effMode === 'buy' || effMode === 'held') {
        const buyLots = pos.lots
          .filter((l) => (l.remaining ?? 0) > 0)
          .map((l) => ({
            item: pos,
            lot: {
              id: l.id,
              date: l.date,
              price: l.price,
              shares: l.remaining,
              remaining: l.remaining,
              soldPortions: [],
            },
          }));

        if (!buyLots.length) return null;

        return {
          id: rawId,
          label: `${pos.companyName || pos.ticker} (Compra)`,
          sub: `${pos.ticker} · Compra (${pos.heldShares} acc)`,
          color: null,
          kind: 'ticker',
          lots: buyLots,
        };
      }

      if (effMode === 'sell' || effMode === 'sold') {
        const sellLots = pos.lots
          .flatMap((l) => (l.soldPortions ?? []).map((p, idx) => ({
            item: pos,
            lot: {
              id: `${l.id}_sell_${idx}`,
              date: l.date,
              price: l.price,
              shares: p.shares,
              remaining: 0,
              soldPortions: [p],
            },
          })));

        if (!sellLots.length) return null;

        return {
          id: rawId,
          label: `${pos.companyName || pos.ticker} (Venta)`,
          sub: `${pos.ticker} · Venta (${pos.sharesSold} acc vendidas)`,
          color: null,
          kind: 'ticker',
          lots: sellLots,
        };
      }

      return {
        id: rawId,
        label: pos.companyName || pos.ticker,
        sub: pos.ticker,
        color: null,
        kind: 'ticker',
        lots: pos.lots.map((lot) => ({ item: pos, lot })),
      };
    }

    if (id.startsWith('lot:')) {
      const rest = id.slice(4).trim();
      const parts = rest.split(':');
      const lotId = parts[0].trim();
      const lotMode = parts[1]?.trim().toLowerCase(); // 'buy' or 'sell'
      const saleDate = parts[2]?.trim();

      for (const pos of state) {
        const lot = pos.lots.find((l) => String(l.id) === lotId);
        if (lot) {
          if (lotMode === 'sell' || lotMode === 'sold') {
            const portions = saleDate
              ? (lot.soldPortions ?? []).filter((p) => p.sellDate === saleDate)
              : (lot.soldPortions ?? []);
            if (!portions.length) return null;
            const sellLots = portions.map((p, idx) => ({
              item: pos,
              lot: {
                id: `${lot.id}_sell_${idx}`,
                date: lot.date,
                price: lot.price,
                shares: p.shares,
                remaining: 0,
                soldPortions: [p],
              },
            }));
            const totalSoldShares = portions.reduce((s, p) => s + p.shares, 0);
            const saleDateStr = saleDate || portions[0].sellDate;
            return {
              id: rawId,
              label: `${pos.companyName || pos.ticker} (Venta) · Venta ${saleDateStr}`,
              sub: `${pos.ticker} · ${totalSoldShares} acc @ $${portions[0].sellPrice}`,
              color: null,
              kind: 'lot',
              lots: sellLots,
            };
          } else {
            const heldShares = (lot.remaining ?? 0) > 0 ? lot.remaining : lot.shares;
            return {
              id: rawId,
              label: `${pos.companyName || pos.ticker} (Compra) · Compra ${lot.date}`,
              sub: `${pos.ticker} · ${heldShares} acc @ $${lot.price}`,
              color: null,
              kind: 'lot',
              lots: [{
                item: pos,
                lot: {
                  id: lot.id,
                  date: lot.date,
                  price: lot.price,
                  shares: heldShares,
                  remaining: heldShares,
                  soldPortions: [],
                },
              }],
            };
          }
        }
      }
      return null;
    }

    if (id.startsWith('group:pre:')) {
      const parts = id.split(':');
      const tabKey = parts[2];
      const targetLabel = parts.slice(3).join(':').trim();
      const lots = resolvePredefinedLots(tabKey, targetLabel, state, originMap, quoteMap);
      if (!lots.length) return null;
      return {
        id: rawId,
        label: targetLabel,
        sub: `Grupo (${tabKey})`,
        color: null,
        kind: 'group',
        lots,
      };
    }

    if (id.startsWith('group:')) {
      const groupVal = id.slice(6).trim();
      const numId = Number(groupVal);
      const group = (Number.isFinite(numId) && groupById.has(numId))
        ? groupById.get(numId)
        : groups.find((g) => g.name.toLowerCase() === groupVal.toLowerCase()) ?? null;

      if (group) {
        const groupTickers = new Set(rules.filter((rule) => rule.groupId === group.id).map((rule) => rule.ticker));
        const groupLots = new Set(lotAssignments.filter((item) => item.groupId === group.id).map((item) => item.buyTransactionId));
        const lots = state.flatMap((item) => item.lots.filter((lot) => groupTickers.has(item.ticker) || groupLots.has(lot.id)).map((lot) => ({ item, lot })));
        return {
          id: `group:${group.id}`,
          label: group.name,
          sub: 'Grupo personalizado',
          color: group.color ?? null,
          kind: 'group',
          lots,
        };
      }

      for (const tabKey of ['sector', 'country', 'region', 'type']) {
        const lots = resolvePredefinedLots(tabKey, groupVal, state, originMap, quoteMap);
        if (lots.length) {
          return {
            id: rawId,
            label: groupVal,
            sub: `Grupo (${tabKey})`,
            color: null,
            kind: 'group',
            lots,
          };
        }
      }
    }
    return null;
  };

  const resolved = ids.map(resolveItem).filter(Boolean);
  if (!resolved.length) throw new PortfolioError('No se encontró ninguno de los elementos seleccionados.', 'INVALID_CHART');

  const allHistoricalDates = [...new Set([...tickerPrices.values()].flat().map((point) => point.date))].sort();
  const priceMaps = new Map();
  for (const [ticker, points] of tickerPrices) {
    const pMap = new Map(points.map((p) => [p.date, p.close]));
    const filledMap = new Map();
    let last;
    for (const date of allHistoricalDates) {
      const cur = pMap.get(date);
      if (cur !== undefined && Number.isFinite(cur)) last = cur;
      if (last !== undefined) filledMap.set(date, last);
    }
    priceMaps.set(ticker, filledMap);
  }

  const frequencyMap = new Map();
  for (const [ticker, divs] of tickerDividends) {
    frequencyMap.set(ticker, detectDividendFrequency(divs));
  }

  const dates = allHistoricalDates.filter((date) => !start || date >= start).slice(-4000);
  const valueForDate = (date) => state.reduce((sum, item) => {
    const price = priceMaps.get(item.ticker)?.get(date);
    const held = item.lots.reduce((shares, lot) => shares + (lot.date <= date ? lot.shares - (lot.soldPortions ?? []).filter((sale) => sale.sellDate <= date).reduce((total, sale) => total + sale.shares, 0) : 0), 0);
    return sum + (price === undefined ? 0 : price * held);
  }, 0);

  const points = dates.map((date) => {
    const portfolioVal = valueForDate(date);
    return {
      date,
      series: resolved.map(({ lots }) => chartSeriesValue(metric, lots, priceMaps, tickerDividends, date, portfolioVal, frequencyMap)),
    };
  });

  return {
    metric,
    range,
    source: 'Yahoo Finance',
    points,
    labels: resolved.map(({ id, label, sub, color, kind }) => ({ id, label, sub, color, kind })),
  };
}
