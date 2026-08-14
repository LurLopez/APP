const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const MARKET_TTL = 5 * 60 * 1000;
const MARKET_TIMEOUT = 8000;
const marketCache = new Map();

async function fetchChart(ticker) {
  const url = `${YAHOO_CHART_URL}/${encodeURIComponent(ticker)}?range=5y&interval=1d&events=div%2Csplits`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Cifra contacto@cifra.local',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(MARKET_TIMEOUT),
  });
  if (!response.ok) throw new Error(`Yahoo Finance respondió ${response.status}`);

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('Yahoo Finance no devolvió datos de mercado');
  return result;
}

function extractSeries(chart, useAdjustedClose = false) {
  const timestamps = Array.isArray(chart?.timestamp) ? chart.timestamp : [];
  const quote = chart?.indicators?.quote?.[0]?.close ?? [];
  const adjusted = chart?.indicators?.adjclose?.[0]?.adjclose ?? [];
  const series = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const close = Number(useAdjustedClose ? adjusted[index] : quote[index]);
    if (Number.isFinite(close) && close > 0) {
      series.push({ timestamp: Number(timestamps[index]), close });
    }
  }
  return series;
}

function calculateBeta(assetSeries, benchmarkSeries) {
  const assetByDay = new Map(assetSeries.map((item) => [Math.floor(item.timestamp / 86400), item.close]));
  const benchmarkByDay = new Map(benchmarkSeries.map((item) => [Math.floor(item.timestamp / 86400), item.close]));
  const dates = [...assetByDay.keys()].filter((date) => benchmarkByDay.has(date)).sort((a, b) => a - b);
  const assetReturns = [];
  const benchmarkReturns = [];

  for (let index = 1; index < dates.length; index += 1) {
    const previousDate = dates[index - 1];
    const currentDate = dates[index];
    const previousAsset = assetByDay.get(previousDate);
    const currentAsset = assetByDay.get(currentDate);
    const previousBenchmark = benchmarkByDay.get(previousDate);
    const currentBenchmark = benchmarkByDay.get(currentDate);
    if (!previousAsset || !previousBenchmark) continue;
    assetReturns.push((currentAsset / previousAsset) - 1);
    benchmarkReturns.push((currentBenchmark / previousBenchmark) - 1);
  }

  if (assetReturns.length < 30) return null;
  const assetMean = assetReturns.reduce((sum, value) => sum + value, 0) / assetReturns.length;
  const benchmarkMean = benchmarkReturns.reduce((sum, value) => sum + value, 0) / benchmarkReturns.length;
  let covariance = 0;
  let variance = 0;
  for (let index = 0; index < assetReturns.length; index += 1) {
    covariance += (assetReturns[index] - assetMean) * (benchmarkReturns[index] - benchmarkMean);
    variance += (benchmarkReturns[index] - benchmarkMean) ** 2;
  }
  if (!variance) return null;
  return covariance / variance;
}

function sumRecentDividends(chart) {
  const events = Object.values(chart?.events?.dividends ?? {});
  const now = Date.now();
  const yearAgo = now - (366 * 24 * 60 * 60 * 1000);
  return events.reduce((sum, event) => {
    const date = Number(event?.date) * 1000;
    const amount = Number(event?.amount);
    if (!Number.isFinite(date) || !Number.isFinite(amount) || date < yearAgo || date > now + (7 * 24 * 60 * 60 * 1000)) return sum;
    return sum + amount;
  }, 0) || null;
}

function findYearAgoClose(series) {
  if (!series.length) return null;
  const target = series.at(-1).timestamp - (365 * 24 * 60 * 60);
  return series.find((item) => item.timestamp >= target)?.close ?? null;
}

function toIsoDate(timestamp) {
  if (!Number.isFinite(Number(timestamp))) return null;
  return new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
}

const CHART_RANGES = {
  '3m': { range: '3mo', interval: '1d' },
  '6m': { range: '6mo', interval: '1d' },
  '1y': { range: '1y', interval: '1d' },
  '3y': { range: '3y', interval: '1wk' },
  '5y': { range: '5y', interval: '1wk' },
  '10y': { range: '10y', interval: '1mo' },
  all: { range: 'max', interval: '1mo' },
};

function computeMovingAverage(series, window) {
  if (series.length < window) return [];
  const result = [];
  let sum = 0;
  for (let index = 0; index < series.length; index += 1) {
    sum += series[index].close;
    if (index >= window) sum -= series[index - window].close;
    if (index >= window - 1) result.push({ t: series[index].timestamp, v: sum / window });
  }
  return result;
}

export async function getChartSeries(ticker, rangeKey = '5y', withMovingAverage = false) {
  const config = CHART_RANGES[rangeKey] ?? CHART_RANGES['5y'];
  const displayCacheKey = `chart:${ticker}:${config.range}:${config.interval}`;
  const cached = marketCache.get(displayCacheKey);
  let out;
  if (cached && Date.now() - cached.at < MARKET_TTL) {
    out = cached.data;
  } else {
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(ticker)}?range=${config.range}&interval=${config.interval}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Cifra contacto@cifra.local',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(MARKET_TIMEOUT),
    });
    if (!response.ok) throw new Error(`Yahoo Finance respondió ${response.status}`);

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('Yahoo Finance no devolvió datos de mercado');

    const points = extractSeries(result).map((item) => ({ t: item.timestamp, v: item.close }));
    out = {
      range: CHART_RANGES[rangeKey] ? rangeKey : '5y',
      currency: result?.meta?.currency ?? 'USD',
      points,
      source: 'Yahoo Finance',
    };
    marketCache.set(displayCacheKey, { data: out, at: Date.now() });
  }

  if (withMovingAverage) {
    const maCacheKey = `chart-ma:${ticker}:${config.range}`;
    const maCached = marketCache.get(maCacheKey);
    if (maCached && Date.now() - maCached.at < MARKET_TTL) {
      out = { ...out, maPoints: maCached.data };
    } else if (config.interval === '1d') {
      const maPoints = computeMovingAverage(out.points.map((point) => ({ timestamp: point.t, close: point.v })), 100);
      marketCache.set(maCacheKey, { data: maPoints, at: Date.now() });
      out = { ...out, maPoints };
    } else {
      const url = `${YAHOO_CHART_URL}/${encodeURIComponent(ticker)}?range=${config.range}&interval=1d`;
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Cifra contacto@cifra.local',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(MARKET_TIMEOUT),
        });
        const data = await response.json();
        const result = data?.chart?.result?.[0];
        const maPoints = result ? computeMovingAverage(extractSeries(result), 100) : [];
        marketCache.set(maCacheKey, { data: maPoints, at: Date.now() });
        out = { ...out, maPoints };
      } catch {
        out = { ...out, maPoints: [] };
      }
    }
  }

  return out;
}

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
  const previousSeriesClose = series.at(-2)?.close ?? null;
  const regularMarketPrice = Number(chart?.meta?.regularMarketPrice);
  const price = Number.isFinite(regularMarketPrice) ? regularMarketPrice : latestSeriesClose;
  const previousClose = previousSeriesClose;
  const change = price !== null && previousClose !== null ? price - previousClose : null;
  const changePercent = price !== null && previousClose ? (change / previousClose) * 100 : null;
  const dividendPerShare = sumRecentDividends(chart);
  const yearAgoClose = findYearAgoClose(series);
  const yearChangePercent = price !== null && yearAgoClose ? ((price / yearAgoClose) - 1) * 100 : null;
  const benchmarkSeries = benchmark ? extractSeries(benchmark, true) : [];
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
    beta: calculateBeta(adjustedSeries, benchmarkSeries),
    ipoDate: toIsoDate(chart?.meta?.firstTradeDate),
    marketTime: toIsoDate(chart?.meta?.regularMarketTime),
    sparkline: series.slice(-45).map((item) => item.close),
    source: 'Yahoo Finance',
  };
  marketCache.set(ticker, { data, at: Date.now() });
  return data;
}
