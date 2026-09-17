/**
 * @fileoverview Motor de series temporales para el gráfico de rentabilidad de la cartera (plusvalías, dividendos y ponderación).
 * @module services/portfolio/portfolioChart
 */

import * as portfolioRepository from '../../../db/repositories/portfolioRepository.js';
import { getMarketQuote, getDividendHistory, getHistoricalPrices } from '../market.service.js';
import { getCompanyOrigin } from '../edgar.service.js';
import { buildState, PortfolioError } from './portfolioFifo.service.js';
import { resolveChartItems } from './portfolioChartItems.js';
import {
  calculateContributionsTimeline,
  chartSeriesValue,
  detectDividendFrequency,
  remainingSharesOn,
} from './portfolioChartSeries.js';

export {
  annualDividendRateAtDate,
  calculateContributionsTimeline,
  chartSeriesValue,
  detectDividendFrequency,
  lotDividendsReceived,
} from './portfolioChartSeries.js';

const CHART_SOURCE = 'Yahoo Finance';
const CHART_METRICS = new Set(['gainAmount', 'gainPct', 'gainWithDividendsAmount', 'gainWithDividendsPct', 'dividendYield', 'dividendYoc', 'weight', 'portfolioValue']);
const CHART_RANGES = new Set(['1m', '3m', '6m', '1y', '2y', '3y', '5y', 'all']);
const RANGE_DAYS = { '1m': 31, '3m': 93, '6m': 186, '1y': 365, '2y': 730, '3y': 1095, '5y': 1825 };
const MAX_CHART_ITEMS = 20;
const MAX_CHART_POINTS = 4000;

function validateChartRequest({ ids, metric, range }) {
  if (!CHART_METRICS.has(metric)) throw new PortfolioError('Métrica de gráfico no válida.', 'INVALID_CHART');
  if (!CHART_RANGES.has(range)) throw new PortfolioError('Rango de gráfico no válido.', 'INVALID_CHART');
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_CHART_ITEMS) {
    throw new PortfolioError(`Selecciona entre 1 y ${MAX_CHART_ITEMS} elementos.`, 'INVALID_CHART');
  }
}

function emptyChart(metric, range) {
  return { metric, range, source: CHART_SOURCE, points: [], labels: [] };
}

function chartStartDate(range) {
  if (range === 'all') return null;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - RANGE_DAYS[range]);
  return date.toISOString().slice(0, 10);
}

function collectHistoricalDates(tickerPrices) {
  return [...new Set([...tickerPrices.values()].flat().map((point) => point.date))].sort();
}

/**
 * Construye el mapa de precios por ticker rellenando hacia delante los huecos
 * (fines de semana y festivos) con el último cierre conocido.
 */
function buildPriceMaps(tickerPrices, allHistoricalDates) {
  const priceMaps = new Map();
  for (const [ticker, points] of tickerPrices) {
    const byDate = new Map(points.map((point) => [point.date, point.close]));
    const filled = new Map();
    let lastClose;
    for (const date of allHistoricalDates) {
      const close = byDate.get(date);
      if (close !== undefined && Number.isFinite(close)) lastClose = close;
      if (lastClose !== undefined) filled.set(date, lastClose);
    }
    priceMaps.set(ticker, filled);
  }
  return priceMaps;
}

function selectSeriesDates(allDates, start) {
  return allDates.filter((date) => !start || date >= start).slice(-MAX_CHART_POINTS);
}

function selectPortfolioValueDates(allDates, start, from) {
  return allDates.filter((date) => (!start || date >= start) && date >= from).slice(-MAX_CHART_POINTS);
}

function heldSharesAndCostOnDate(item, date) {
  let shares = 0;
  let cost = 0;
  for (const lot of item.lots) {
    if (lot.date > date) continue;
    const held = remainingSharesOn(lot, date);
    if (held <= 0) continue;
    shares += held;
    cost += held * lot.price;
  }
  return { shares, cost };
}

/** Valor de la cartera usando el coste como respaldo si aún no hay precio histórico. */
function portfolioValueWithCostFallback(state, priceMaps, date) {
  return state.reduce((sum, item) => {
    const { shares, cost } = heldSharesAndCostOnDate(item, date);
    if (shares <= 0) return sum;
    const price = priceMaps.get(item.ticker)?.get(date);
    return sum + (price !== undefined ? price * shares : cost);
  }, 0);
}

/** Valor de mercado de la cartera a una fecha (solo posiciones con precio disponible). */
function portfolioMarketValue(state, priceMaps, date) {
  return state.reduce((sum, item) => {
    const price = priceMaps.get(item.ticker)?.get(date);
    if (price === undefined) return sum;
    const shares = item.lots.reduce(
      (total, lot) => (lot.date <= date ? total + remainingSharesOn(lot, date) : total),
      0
    );
    return sum + price * shares;
  }, 0);
}

function buildFrequencyMap(tickerDividends) {
  const frequencyMap = new Map();
  for (const [ticker, dividends] of tickerDividends) {
    frequencyMap.set(ticker, detectDividendFrequency(dividends));
  }
  return frequencyMap;
}

function resolvePortfolioSeriesOptions(ids) {
  let wantValue = true;
  let wantContributions = true;
  if (ids.some((id) => String(id).startsWith('portfolio:'))) {
    wantValue = ids.includes('portfolio:value');
    wantContributions = ids.includes('portfolio:contributions');
  }
  if (!wantValue && !wantContributions) return { wantValue: true, wantContributions: true };
  return { wantValue, wantContributions };
}

function buildPortfolioLabels({ wantValue, wantContributions }) {
  const labels = [];
  if (wantValue) {
    labels.push({
      id: 'portfolio:value',
      label: 'Valor de la cartera',
      sub: 'Valor de mercado de las posiciones',
      color: '#2563eb',
      kind: 'portfolio',
    });
  }
  if (wantContributions) {
    labels.push({
      id: 'portfolio:contributions',
      label: 'Aportaciones',
      sub: 'Capital neto aportado de bolsillo',
      color: '#10b981',
      kind: 'portfolio',
    });
  }
  return labels;
}

function buildPortfolioValuePoints({ dates, state, priceMaps, transactions, tickerDividends, seriesOptions }) {
  const contributionsAt = calculateContributionsTimeline(transactions, state, tickerDividends);
  return dates.map((date) => {
    const series = [];
    if (seriesOptions.wantValue) series.push(portfolioValueWithCostFallback(state, priceMaps, date));
    if (seriesOptions.wantContributions) series.push(contributionsAt(date));
    return { date, series };
  });
}

function buildPortfolioValueChart({ ids, metric, range, state, transactions, dates, priceMaps, tickerDividends }) {
  const seriesOptions = resolvePortfolioSeriesOptions(ids);
  return {
    metric,
    range,
    source: CHART_SOURCE,
    points: buildPortfolioValuePoints({ dates, state, priceMaps, transactions, tickerDividends, seriesOptions }),
    labels: buildPortfolioLabels(seriesOptions),
  };
}

function buildSeriesPoints({ dates, resolved, metric, state, priceMaps, tickerDividends, frequencyMap }) {
  return dates.map((date) => {
    const portfolioValue = portfolioMarketValue(state, priceMaps, date);
    return {
      date,
      series: resolved.map(({ lots }) => chartSeriesValue(metric, lots, priceMaps, tickerDividends, date, portfolioValue, frequencyMap)),
    };
  });
}

function toChartLabel({ id, label, sub, color, kind }) {
  return { id, label, sub, color, kind };
}

async function loadMarketData(state, from, today) {
  const tickers = [...new Set(state.map((item) => item.ticker))];
  const [pricesResults, dividendsResults, originResults, quoteResults] = await Promise.all([
    Promise.all(tickers.map(async (ticker) => [ticker, await getHistoricalPrices(ticker, { from, to: today }).catch(() => [])])),
    Promise.all(tickers.map(async (ticker) => [ticker, await getDividendHistory(ticker, { from }).catch(() => [])])),
    Promise.all(tickers.map(async (ticker) => [ticker, await getCompanyOrigin(ticker).catch(() => ({ sector: null, country: null }))])),
    Promise.all(tickers.map(async (ticker) => [ticker, await getMarketQuote(ticker).catch(() => null)])),
  ]);

  return {
    tickerPrices: new Map(pricesResults),
    tickerDividends: new Map(dividendsResults),
    originMap: new Map(originResults),
    quoteMap: new Map(quoteResults),
  };
}

function buildItemContext({ state, groups, rules, lotAssignments, marketData }) {
  return {
    state,
    groups,
    groupById: new Map(groups.map((group) => [group.id, group])),
    rules,
    lotAssignments,
    originMap: marketData.originMap,
    quoteMap: marketData.quoteMap,
  };
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
  validateChartRequest({ ids, metric, range });

  const [transactions, groups, rules, lotAssignments] = await Promise.all([
    portfolioRepository.listTransactions(userId),
    portfolioRepository.listGroups(userId),
    portfolioRepository.listGroupRules(userId),
    portfolioRepository.listGroupLots(userId),
  ]);

  const state = buildState(transactions);
  if (!state.length) return emptyChart(metric, range);

  const start = chartStartDate(range);
  const today = new Date().toISOString().slice(0, 10);
  const from = transactions.map((item) => item.tradeDate).sort()[0] ?? today;

  const marketData = await loadMarketData(state, from, today);
  const allHistoricalDates = collectHistoricalDates(marketData.tickerPrices);
  const priceMaps = buildPriceMaps(marketData.tickerPrices, allHistoricalDates);

  if (metric === 'portfolioValue') {
    const dates = selectPortfolioValueDates(allHistoricalDates, start, from);
    return buildPortfolioValueChart({
      ids,
      metric,
      range,
      state,
      transactions,
      dates,
      priceMaps,
      tickerDividends: marketData.tickerDividends,
    });
  }

  const context = buildItemContext({ state, groups, rules, lotAssignments, marketData });
  const resolved = resolveChartItems(ids, context);
  if (!resolved.length) throw new PortfolioError('No se encontró ninguno de los elementos seleccionados.', 'INVALID_CHART');

  const frequencyMap = buildFrequencyMap(marketData.tickerDividends);
  const points = buildSeriesPoints({
    dates: selectSeriesDates(allHistoricalDates, start),
    resolved,
    metric,
    state,
    priceMaps,
    tickerDividends: marketData.tickerDividends,
    frequencyMap,
  });

  return {
    metric,
    range,
    source: CHART_SOURCE,
    points,
    labels: resolved.map(toChartLabel),
  };
}
