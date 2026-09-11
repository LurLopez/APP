const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const MARKET_TTL = 5 * 60 * 1000;
const QUOTE_TTL = 60 * 1000;
const MARKET_TIMEOUT = 8000;
const marketCache = new Map();
const quoteCache = new Map();

async function fetchChart(ticker, range = '5y', interval = '1d') {
  const url = `${YAHOO_CHART_URL}/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&events=div%2Csplits`;
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

const DIVIDEND_TTL = 24 * 60 * 60 * 1000;
const DIVIDEND_CHUNK_MS = 5 * 365 * 24 * 60 * 60 * 1000;

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
      headers: {
        'User-Agent': 'Cifra contacto@cifra.local',
        Accept: 'application/json',
      },
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
  '1m': { range: '1mo', interval: '1d' },
  '3m': { range: '3mo', interval: '1d' },
  '6m': { range: '6mo', interval: '1d' },
  '1y': { range: '1y', interval: '1d' },
  '3y': { range: '3y', interval: '1wk' },
  '5y': { range: '5y', interval: '1wk' },
  '10y': { range: '10y', interval: '1mo' },
  all: { range: 'max', interval: '1mo' },
};

const HISTORICAL_RANGES = new Set(['1m', '3m', '6m', '1y', '2y', '3y', '5y', 'all']);

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

  const windows = Array.isArray(withMovingAverage)
    ? withMovingAverage.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 5000)
    : (withMovingAverage ? [100] : []);
  const hasMovingAverage = windows.length > 0;

  if (hasMovingAverage) {
    const sortedKey = [...windows].sort((a, b) => a - b).join('-');
    const maCacheKey = `chart-ma:${ticker}:${config.range}:${sortedKey}`;
    const maCached = marketCache.get(maCacheKey);
    if (maCached && Date.now() - maCached.at < MARKET_TTL) {
      out = { ...out, movingAverages: maCached.data.movingAverages, maPoints: maCached.data.maPoints };
    } else if (out.points?.length) {
      const firstT = out.points[0].t;
      const lastT = out.points[out.points.length - 1].t;
      const maxWindow = Math.max(...windows);
      // Fetch daily prices starting with sufficient buffer before firstT (day 0) to ensure
      // at least maxWindow trading sessions prior to day 0 for all requested moving averages.
      const bufferDays = Math.ceil(maxWindow * 1.6) + 60;
      const period1 = Math.max(0, Math.floor(firstT - (bufferDays * 86400)));
      const period2 = Math.ceil(lastT + 86400);
      const url = `${YAHOO_CHART_URL}/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d`;
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
        const dailySeries = result ? extractSeries(result) : [];

        const movingAverages = windows.map((win) => {
          const allMa = computeMovingAverage(dailySeries, win);
          let maPoints;
          if (config.interval === '1d') {
            const maByT = new Map(allMa.map((m) => [m.t, m.v]));
            maPoints = out.points
              .map((p) => {
                let v = maByT.get(p.t);
                if (!Number.isFinite(v)) {
                  const nearest = allMa.find((m) => Math.abs(m.t - p.t) < 43200);
                  v = nearest?.v;
                }
                return { t: p.t, v };
              })
              .filter((p) => Number.isFinite(p.v));
          } else {
            maPoints = allMa.filter((m) => m.t >= firstT);
            if (maPoints.length > 0 && maPoints[0].t > firstT) {
              const lastBefore = allMa.filter((m) => m.t <= firstT).at(-1);
              if (lastBefore) {
                maPoints.unshift({ t: firstT, v: lastBefore.v });
              }
            }
          }
          return { window: win, points: maPoints };
        });

        const maData = {
          movingAverages,
          maPoints: movingAverages[0]?.points ?? [],
        };
        marketCache.set(maCacheKey, { data: maData, at: Date.now() });
        out = { ...out, ...maData };
      } catch {
        out = { ...out, movingAverages: [], maPoints: [] };
      }
    } else {
      out = { ...out, movingAverages: [], maPoints: [] };
    }
  }

  return out;
}

export async function getMarketQuote(ticker) {
  const normalizedTicker = String(ticker).trim().toUpperCase();
  const cached = quoteCache.get(normalizedTicker);
  if (cached && Date.now() - cached.at < QUOTE_TTL) return cached.data;

  const chart = await fetchChart(normalizedTicker, '5d', '1d');
  const meta = chart?.meta ?? {};
  const series = extractSeries(chart);
  const latestSeriesClose = series.at(-1)?.close ?? null;
  const previousSeriesClose = series.at(-2)?.close ?? null;
  const numberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const price = numberOrNull(meta.regularMarketPrice) ?? latestSeriesClose;
  const previousClose = numberOrNull(meta.regularMarketPreviousClose) ?? previousSeriesClose;
  const change = numberOrNull(meta.regularMarketChange)
    ?? (price !== null && previousClose !== null ? price - previousClose : null);
  const changePercent = numberOrNull(meta.regularMarketChangePercent)
    ?? (change !== null && previousClose ? (change / previousClose) * 100 : null);
  const latestQuoteValue = (key) => {
    const values = chart?.indicators?.quote?.[0]?.[key] ?? [];
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const value = numberOrNull(values[index]);
      if (value !== null) return value;
    }
    return null;
  };
  const regularPeriod = meta.currentTradingPeriod?.regular;
  const marketTimestamp = numberOrNull(meta.regularMarketTime);
  const marketState = meta.marketState
    ?? (marketTimestamp !== null && regularPeriod
      ? marketTimestamp >= Number(regularPeriod.start) && marketTimestamp < Number(regularPeriod.end) ? 'REGULAR' : 'CLOSED'
      : null);
  const quote = {
    currency: meta.currency ?? 'USD',
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
    instrumentType: meta.instrumentType ?? null,
    price,
    open: numberOrNull(meta.regularMarketOpen) ?? latestQuoteValue('open'),
    dayHigh: numberOrNull(meta.regularMarketDayHigh) ?? latestQuoteValue('high'),
    dayLow: numberOrNull(meta.regularMarketDayLow) ?? latestQuoteValue('low'),
    previousClose,
    change,
    changePercent,
    volume: numberOrNull(meta.regularMarketVolume) ?? latestQuoteValue('volume'),
    marketTimestamp,
    marketState,
    source: 'Yahoo Finance',
  };
  quoteCache.set(normalizedTicker, { data: quote, at: Date.now() });
  return quote;
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

const COUNTRY_RULES = [
  { pattern: /\b(australia|dfa australia|macquarie)\b/i, code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { pattern: /\b(u\.?k\.?|british|baillie gifford|schroders|legal & general|barclays|hsbc|abrdn|man group)\b/i, code: 'GB', flag: '🇬🇧', name: 'Reino Unido' },
  { pattern: /\b(norges|norway)\b/i, code: 'NO', flag: '🇳🇴', name: 'Noruega' },
  { pattern: /\b(ubs|credit suisse|pictet|vontobel|swiss|switzerland)\b/i, code: 'CH', flag: '🇨🇭', name: 'Suiza' },
  { pattern: /\b(rbc|royal bank of canada|td asset|toronto dominion|bmo|scotiabank|brookfield|canada)\b/i, code: 'CA', flag: '🇨🇦', name: 'Canadá' },
  { pattern: /\b(amundi|bnp paribas|societe generale|crédit agricole|natixis|carmignac|france)\b/i, code: 'FR', flag: '🇫🇷', name: 'Francia' },
  { pattern: /\b(allianz|dws|deutsche|flossbach|germany)\b/i, code: 'DE', flag: '🇩🇪', name: 'Alemania' },
  { pattern: /\b(nomura|sumitomo|mizuho|mitsubishi|daiwa|japan)\b/i, code: 'JP', flag: '🇯🇵', name: 'Japón' },
  { pattern: /\b(temasek|gic|singapore)\b/i, code: 'SG', flag: '🇸🇬', name: 'Singapur' },
  { pattern: /\b(blackrock|vanguard|state street|dodge & cox|aqr|fidelity|geode|jpmorgan|morgan stanley|capital world|capital research|t\.? rowe|invesco|franklin|wellington|lsv|northern trust|bank of america|goldman sachs|wells fargo|berkshire)\b/i, code: 'US', flag: '🇺🇸', name: 'Estados Unidos' },
];

function detectHolderCountry(name) {
  if (!name) return { code: 'US', flag: '🇺🇸', name: 'Estados Unidos' };
  for (const r of COUNTRY_RULES) {
    if (r.pattern.test(name)) return { code: r.code, flag: r.flag, name: r.name };
  }
  return { code: 'US', flag: '🇺🇸', name: 'Estados Unidos' };
}

let yahooSession = { cookie: null, crumb: null, at: 0 };
const SESSION_TTL = 6 * 60 * 60 * 1000;
const HOLDERS_TTL = 12 * 60 * 60 * 1000;
const holdersCache = new Map();

async function getYahooSession(forceRefresh = false) {
  if (!forceRefresh && yahooSession.cookie && yahooSession.crumb && (Date.now() - yahooSession.at < SESSION_TTL)) {
    return yahooSession;
  }
  try {
    const cookieRes = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(MARKET_TIMEOUT),
    }).catch((err) => err);
    const rawCookie = cookieRes.headers?.get('set-cookie') || '';
    const cookie = rawCookie.split(';')[0];

    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Cookie: cookie,
      },
      signal: AbortSignal.timeout(MARKET_TIMEOUT),
    });
    if (!crumbRes.ok) throw new Error(`Yahoo crumb respondió ${crumbRes.status}`);
    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes('error') || crumb.includes('Invalid') || crumb.includes('Unauthorized')) {
      throw new Error('Crumb de Yahoo Finance inválido');
    }
    yahooSession = { cookie, crumb, at: Date.now() };
    return yahooSession;
  } catch (err) {
    yahooSession = { cookie: null, crumb: null, at: 0 };
    throw err;
  }
}

export async function getCompanyHolders(ticker) {
  const normalizedTicker = String(ticker).trim().toUpperCase();
  const cached = holdersCache.get(normalizedTicker);
  if (cached && Date.now() - cached.at < HOLDERS_TTL) {
    return cached.data;
  }

  let session = await getYahooSession();
  const modules = 'institutionOwnership,fundOwnership,majorHoldersBreakdown,insiderHolders';
  let url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(normalizedTicker)}?crumb=${encodeURIComponent(session.crumb)}&modules=${modules}`;

  let res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Cookie: session.cookie,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(MARKET_TIMEOUT),
  });

  if (res.status === 401 || res.status === 403) {
    session = await getYahooSession(true);
    url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(normalizedTicker)}?crumb=${encodeURIComponent(session.crumb)}&modules=${modules}`;
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Cookie: session.cookie,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(MARKET_TIMEOUT),
    });
  }

  if (!res.ok) {
    throw new Error(`Yahoo Finance respondió ${res.status} al consultar accionariado`);
  }

  const json = await res.json();
  const summary = json?.quoteSummary?.result?.[0];
  if (!summary) {
    throw new Error('No se encontraron datos de accionariado');
  }

  const breakdownRaw = summary.majorHoldersBreakdown ?? {};
  const breakdown = {
    insidersPercent: breakdownRaw.insidersPercentHeld?.raw ?? null,
    institutionsPercent: breakdownRaw.institutionsPercentHeld?.raw ?? null,
    institutionsFloatPercent: breakdownRaw.institutionsFloatPercentHeld?.raw ?? null,
    institutionsCount: breakdownRaw.institutionsCount?.raw ?? null,
  };

  const institutions = (summary.institutionOwnership?.ownershipList ?? []).map((item) => ({
    name: item.organization,
    country: detectHolderCountry(item.organization),
    shares: item.position?.raw ?? null,
    sharesFormatted: item.position?.fmt ?? null,
    percentage: item.pctHeld?.raw ?? null,
    percentageFormatted: item.pctHeld?.fmt ?? null,
    value: item.value?.raw ?? null,
    valueFormatted: item.value?.fmt ?? null,
    changePercent: item.pctChange?.raw ?? null,
    changePercentFormatted: item.pctChange?.fmt ?? null,
    reportDate: item.reportDate?.fmt ?? null,
  }));

  const funds = (summary.fundOwnership?.ownershipList ?? []).map((item) => ({
    name: item.organization,
    country: detectHolderCountry(item.organization),
    shares: item.position?.raw ?? null,
    sharesFormatted: item.position?.fmt ?? null,
    percentage: item.pctHeld?.raw ?? null,
    percentageFormatted: item.pctHeld?.fmt ?? null,
    value: item.value?.raw ?? null,
    valueFormatted: item.value?.fmt ?? null,
    changePercent: item.pctChange?.raw ?? null,
    changePercentFormatted: item.pctChange?.fmt ?? null,
    reportDate: item.reportDate?.fmt ?? null,
  }));

  const insiders = (summary.insiderHolders?.holders ?? []).map((item) => ({
    name: item.name,
    relation: item.relation,
    position: item.positionDirect?.raw ?? null,
    positionFormatted: item.positionDirect?.fmt ?? null,
    transactionDescription: item.transactionDescription ?? null,
    reportDate: item.latestTransDate?.fmt ?? null,
  }));

  const data = {
    ticker: normalizedTicker,
    breakdown,
    institutions,
    funds,
    insiders,
    source: 'SEC Form 13F / Yahoo Finance',
    updatedAt: new Date().toISOString(),
  };

  holdersCache.set(normalizedTicker, { data, at: Date.now() });
  return data;
}

const irWebsiteCache = new Map();
const IR_WEBSITE_TTL = 24 * 60 * 60 * 1000;
const IR_WEBSITE_EMPTY_TTL = 10 * 60 * 1000;

function normalizeIrSiteUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

export async function getCompanyIrSites(ticker) {
  const normalizedTicker = String(ticker).trim().toUpperCase();
  const cached = irWebsiteCache.get(normalizedTicker);
  if (cached && Date.now() - cached.at < (cached.ttl ?? IR_WEBSITE_TTL)) {
    return cached.data;
  }
  const result = [];
  const seen = new Set();
  const add = (url, kind) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    result.push({ url, kind });
  };
  const store = () => {
    const ttl = result.length ? IR_WEBSITE_TTL : IR_WEBSITE_EMPTY_TTL;
    irWebsiteCache.set(normalizedTicker, { data: result, at: Date.now(), ttl });
    return result;
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const session = await getYahooSession(attempt > 0);
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(normalizedTicker)}?crumb=${encodeURIComponent(session.crumb)}&modules=summaryProfile`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Cookie: session.cookie,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(MARKET_TIMEOUT),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const profile = json?.quoteSummary?.result?.[0]?.summaryProfile ?? {};
      const website = normalizeIrSiteUrl(profile.website);
      let websiteHost = null;
      try {
        websiteHost = website ? new URL(website).hostname.replace(/^www\./, '') : null;
      } catch {
        websiteHost = null;
      }
      const ir = normalizeIrSiteUrl(profile.irWebsite);
      if (ir) {
        let irHost = null;
        try {
          irHost = new URL(ir).hostname.replace(/^www\./, '');
        } catch {
          irHost = null;
        }
        add(ir, websiteHost && irHost === websiteHost ? 'website' : 'ir');
      }
      if (website) {
        try {
          const host = new URL(website).hostname.replace(/^www\./, '');
          if (!seen.has(`https://ir.${host}`)) add(`https://ir.${host}`, 'ir');
          if (!seen.has(`https://investor.${host}`)) add(`https://investor.${host}`, 'ir');
          if (!seen.has(`https://investors.${host}`)) add(`https://investors.${host}`, 'ir');
        } catch {
          // Sin subdominio IR derivable
        }
        add(website, 'website');
      }
      const tickerLower = normalizedTicker.toLowerCase();
      if (!seen.has(`https://investor.${tickerLower}.com`)) add(`https://investor.${tickerLower}.com`, 'ir');
      if (!seen.has(`https://investors.${tickerLower}.com`)) add(`https://investors.${tickerLower}.com`, 'ir');
      if (!seen.has(`https://ir.${tickerLower}.com`)) add(`https://ir.${tickerLower}.com`, 'ir');
      if (result.length) break;
    } catch {
      // Reintento con sesión nueva de Yahoo.
    }
  }
  return store();
}
