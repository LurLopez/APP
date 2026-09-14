/**
 * @fileoverview Servicio principal de mercado para obtención de cotizaciones en tiempo real, perfiles y series gráficas.
 * @module services/market
 */

import {
  fetchChart,
  marketCache,
  quoteCache,
  MARKET_TTL,
  QUOTE_TTL,
  MARKET_TIMEOUT,
  YAHOO_CHART_URL,
} from './market/yahooClient.service.js';
import {
  extractSeries,
  calculateBeta,
  computeMovingAverage,
  sumRecentDividends,
  findYearAgoClose,
  toIsoDate,
} from './market/marketMath.service.js';
import { getCompanyHolders } from './market/companyHolders.service.js';
import { getCompanyIrSites } from './market/irWebsites.service.js';

export { getCompanyHolders, getCompanyIrSites };

const DIVIDEND_TTL = 24 * 60 * 60 * 1000;
const DIVIDEND_CHUNK_MS = 5 * 365 * 24 * 60 * 60 * 1000;

const CHART_RANGES = {
  '1m': { range: '1mo', interval: '1d' },
  '3m': { range: '3mo', interval: '1d' },
  '6m': { range: '6mo', interval: '1d' },
  '1y': { range: '1y', interval: '1d' },
  '3y': { range: '3y', interval: '1wk' },
  '5y': { range: '5y', interval: '1wk' },
  '10y': { range: '10y', interval: '1mo' },
  all: { range: 'max', interval: '1mo' },
};

/**
 * Consulta el histórico de pagos de dividendos de un ticker.
 * @param {string} ticker - Ticker bursátil.
 * @param {Object} [options] - Filtros.
 * @param {string} [options.from] - Fecha inicial en formato ISO.
 * @returns {Promise<Array<{ date: string, amount: number }>>}
 */
export async function getDividendHistory(ticker, { from } = {}) {
  const normalizedTicker = String(ticker).trim().toUpperCase();
  const fromIso = from ? String(from).slice(0, 10) : null;
  const cacheKey = `divs:${normalizedTicker}:${fromIso ?? 'default'}`;
  const cached = marketCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DIVIDEND_TTL) return cached.data;

  const fromMs = fromIso ? Date.parse(`${fromIso}T00:00:00Z`) : Date.now() - (10 * 365 * 24 * 60 * 60 * 1000);
  const nowMs = Date.now();
  const events = [];
  let chunkStart = Number.isFinite(fromMs) ? fromMs : nowMs - (10 * 365 * 24 * 60 * 60 * 1000);

  while (chunkStart < nowMs) {
    const chunkEnd = Math.min(chunkStart + DIVIDEND_CHUNK_MS, nowMs);
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(normalizedTicker)}`
      + `?period1=${Math.floor(chunkStart / 1000)}&period2=${Math.ceil(chunkEnd / 1000)}&interval=1mo&events=div%2Csplits`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Cifra contacto@cifra.local', Accept: 'application/json' },
      signal: AbortSignal.timeout(MARKET_TIMEOUT),
    });
    if (!response.ok) throw new Error(`Yahoo Finance respondió ${response.status}`);
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const chunkEvents = Object.values(result?.events?.dividends ?? {});
    events.push(...chunkEvents
      .filter((event) => Number.isFinite(Number(event?.date)) && Number.isFinite(Number(event?.amount)))
      .map((event) => ({
        date: new Date(Number(event.date) * 1000).toISOString().slice(0, 10),
        amount: Number(event.amount),
      })));
    chunkStart = chunkEnd + 1000;
  }

  const unique = new Map();
  events.forEach((event) => unique.set(`${event.date}|${event.amount}`, event));
  const dividends = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));

  marketCache.set(cacheKey, { data: dividends, at: Date.now() });
  return dividends;
}

/**
 * Consulta la serie histórica de precios de cierre para un rango de fechas.
 * @param {string} ticker - Ticker bursátil.
 * @param {Object} [options] - Parámetros de rango.
 * @returns {Promise<Array<{ date: string, close: number }>>}
 */
export async function getHistoricalPrices(ticker, { from, to } = {}) {
  const normalizedTicker = String(ticker).trim().toUpperCase();
  const fromIso = String(from ?? '').slice(0, 10);
  const toIso = String(to ?? new Date().toISOString()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIso) || !/^\d{4}-\d{2}-\d{2}$/.test(toIso) || fromIso > toIso) {
    throw new Error('Rango histórico no válido');
  }
  const cacheKey = `historical:${normalizedTicker}:${fromIso}:${toIso}`;
  const cached = marketCache.get(cacheKey);
  if (cached && Date.now() - cached.at < MARKET_TTL) return cached.data;

  const period1 = Math.floor(Date.parse(`${fromIso}T00:00:00Z`) / 1000);
  const period2 = Math.ceil(Date.parse(`${toIso}T23:59:59Z`) / 1000) + 1;
  const url = `${YAHOO_CHART_URL}/${encodeURIComponent(normalizedTicker)}?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplits`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Cifra contacto@cifra.local', Accept: 'application/json' },
    signal: AbortSignal.timeout(MARKET_TIMEOUT),
  });
  if (!response.ok) throw new Error(`Yahoo Finance respondió ${response.status}`);
  const result = (await response.json())?.chart?.result?.[0];
  if (!result) throw new Error('Yahoo Finance no devolvió datos históricos');
  const prices = extractSeries(result).map((item) => ({
    date: new Date(item.timestamp * 1000).toISOString().slice(0, 10),
    close: item.close,
  }));
  marketCache.set(cacheKey, { data: prices, at: Date.now() });
  return prices;
}

/**
 * Obtiene la serie temporal de cotización y sus medias móviles configurables.
 * @param {string} ticker - Ticker bursátil.
 * @param {string} [rangeKey='5y'] - Rango temporal seleccionado.
 * @param {boolean|number[]} [withMovingAverage=false] - Ventanas de medias móviles.
 * @returns {Promise<Object>}
 */
export async function getChartSeries(ticker, rangeKey = '5y', withMovingAverage = false) {
  const config = CHART_RANGES[rangeKey] ?? CHART_RANGES['5y'];
  const displayCacheKey = `chart:${ticker}:${config.range}:${config.interval}`;
  const cached = marketCache.get(displayCacheKey);
  let out;

  if (cached && Date.now() - cached.at < MARKET_TTL) {
    out = cached.data;
  } else {
    const result = await fetchChart(ticker, config.range, config.interval);
    const points = extractSeries(result).map((item) => ({ t: item.timestamp, v: item.close }));
    out = {
      range: CHART_RANGES[rangeKey] ? rangeKey : '5y',
      currency: result?.meta?.currency ?? 'USD',
      points,
      source: 'Yahoo Finance',
    };
    marketCache.set(displayCacheKey, { data: out, at: Date.now() });
  }

  const windows = Array.isArray(withMovingAverage)
    ? withMovingAverage.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 5000)
    : (withMovingAverage ? [100] : []);

  if (windows.length > 0 && out.points?.length) {
    const firstT = out.points[0].t;
    const lastT = out.points[out.points.length - 1].t;
    const maxWindow = Math.max(...windows);
    const bufferDays = Math.ceil(maxWindow * 1.6) + 60;
    const period1 = Math.max(0, Math.floor(firstT - (bufferDays * 86400)));
    const period2 = Math.ceil(lastT + 86400);
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d`;

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Cifra contacto@cifra.local', Accept: 'application/json' },
        signal: AbortSignal.timeout(MARKET_TIMEOUT),
      });
      const data = await response.json();
      const dailySeries = data?.chart?.result?.[0] ? extractSeries(data.chart.result[0]) : [];

      const movingAverages = windows.map((win) => {
        const allMa = computeMovingAverage(dailySeries, win);
        let maPoints;
        if (config.interval === '1d') {
          const maByT = new Map(allMa.map((m) => [m.t, m.v]));
          maPoints = out.points
            .map((p) => ({ t: p.t, v: maByT.get(p.t) ?? allMa.find((m) => Math.abs(m.t - p.t) < 43200)?.v }))
            .filter((p) => Number.isFinite(p.v));
        } else {
          maPoints = allMa.filter((m) => m.t >= firstT);
        }
        return { window: win, points: maPoints };
      });

      out = { ...out, movingAverages, maPoints: movingAverages[0]?.points ?? [] };
    } catch {
      out = { ...out, movingAverages: [], maPoints: [] };
    }
  }

  return out;
}

/**
 * Consulta la cotización en tiempo real del mercado para un ticker.
 * @param {string} ticker - Ticker bursátil.
 * @returns {Promise<Object>}
 */
export async function getMarketQuote(ticker) {
  const normalizedTicker = String(ticker).trim().toUpperCase();
  const cached = quoteCache.get(normalizedTicker);
  if (cached && Date.now() - cached.at < QUOTE_TTL) return cached.data;

  const chart = await fetchChart(normalizedTicker, '5d', '1d');
  const meta = chart?.meta ?? {};
  const series = extractSeries(chart);
  const latestSeriesClose = series.at(-1)?.close ?? null;
  const previousSeriesClose = series.at(-2)?.close ?? null;

  const numberOrNull = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };

  const price = numberOrNull(meta.regularMarketPrice) ?? latestSeriesClose;
  const previousClose = numberOrNull(meta.regularMarketPreviousClose) ?? previousSeriesClose;
  const change = numberOrNull(meta.regularMarketChange) ?? (price !== null && previousClose !== null ? price - previousClose : null);
  const changePercent = numberOrNull(meta.regularMarketChangePercent) ?? (change !== null && previousClose ? (change / previousClose) * 100 : null);

  const quote = {
    currency: meta.currency ?? 'USD',
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
    instrumentType: meta.instrumentType ?? null,
    price,
    open: numberOrNull(meta.regularMarketOpen),
    dayHigh: numberOrNull(meta.regularMarketDayHigh),
    dayLow: numberOrNull(meta.regularMarketDayLow),
    previousClose,
    change,
    changePercent,
    volume: numberOrNull(meta.regularMarketVolume),
    marketTimestamp: numberOrNull(meta.regularMarketTime),
    marketState: meta.marketState ?? null,
    source: 'Yahoo Finance',
  };

  quoteCache.set(normalizedTicker, { data: quote, at: Date.now() });
  return quote;
}

/**
 * Obtiene el resumen de mercado completo (beta contra S&P500, dividendo anual, sparkline 45d).
 * @param {string} ticker - Ticker bursátil.
 * @returns {Promise<Object>}
 */
export async function getMarketProfile(ticker) {
  const cached = marketCache.get(ticker);
  if (cached && Date.now() - cached.at < MARKET_TTL) return cached.data;

  const [chart, benchmark] = await Promise.all([
    fetchChart(ticker),
    fetchChart('SPY').catch(() => null),
  ]);

  const series = extractSeries(chart);
  const adjustedSeries = extractSeries(chart, true);
  const latestSeriesClose = series.at(-1)?.close ?? null;
  const regularMarketPrice = Number(chart?.meta?.regularMarketPrice);
  const price = Number.isFinite(regularMarketPrice) ? regularMarketPrice : latestSeriesClose;
  const previousClose = series.at(-2)?.close ?? null;
  const change = price !== null && previousClose !== null ? price - previousClose : null;
  const changePercent = price !== null && previousClose ? (change / previousClose) * 100 : null;
  const dividendPerShare = sumRecentDividends(chart);
  const yearAgoClose = findYearAgoClose(series);
  const yearChangePercent = price !== null && yearAgoClose ? ((price / yearAgoClose) - 1) * 100 : null;

  const data = {
    currency: chart?.meta?.currency ?? 'USD',
    exchange: chart?.meta?.fullExchangeName ?? chart?.meta?.exchangeName ?? null,
    price,
    change,
    changePercent,
    previousClose,
    dayHigh: Number.isFinite(Number(chart?.meta?.regularMarketDayHigh)) ? Number(chart.meta.regularMarketDayHigh) : null,
    dayLow: Number.isFinite(Number(chart?.meta?.regularMarketDayLow)) ? Number(chart.meta.regularMarketDayLow) : null,
    week52High: Number.isFinite(Number(chart?.meta?.fiftyTwoWeekHigh)) ? Number(chart.meta.fiftyTwoWeekHigh) : null,
    week52Low: Number.isFinite(Number(chart?.meta?.fiftyTwoWeekLow)) ? Number(chart.meta.fiftyTwoWeekLow) : null,
    volume: Number.isFinite(Number(chart?.meta?.regularMarketVolume)) ? Number(chart.meta.regularMarketVolume) : null,
    dividendPerShare,
    dividendYield: dividendPerShare && price ? (dividendPerShare / price) * 100 : null,
    yearChangePercent,
    beta: calculateBeta(adjustedSeries, benchmark ? extractSeries(benchmark, true) : []),
    ipoDate: toIsoDate(chart?.meta?.firstTradeDate),
    marketTime: toIsoDate(chart?.meta?.regularMarketTime),
    sparkline: series.slice(-45).map((item) => item.close),
    source: 'Yahoo Finance',
  };

  marketCache.set(ticker, { data, at: Date.now() });
  return data;
}
