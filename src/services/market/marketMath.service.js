/**
 * @fileoverview Funciones matemáticas y estadísticas para análisis financiero (beta, medias móviles, rendimientos).
 * @module services/market/marketMath
 */

/**
 * Extrae pares ordenados de marca temporal y precio de cierre válido de un objeto de gráfico.
 * @param {Object} chart - Nodo chart de Yahoo Finance.
 * @param {boolean} [useAdjustedClose=false] - Si debe usar precios ajustados por splits y dividendos.
 * @returns {Array<{ timestamp: number, close: number }>}
 */
export function extractSeries(chart, useAdjustedClose = false) {
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

/**
 * Calcula la beta de volatilidad de un activo comparado contra el benchmark de referencia (ej. S&P 500 / SPY).
 * @param {Array<{ timestamp: number, close: number }>} assetSeries - Serie del activo.
 * @param {Array<{ timestamp: number, close: number }>} benchmarkSeries - Serie del benchmark.
 * @returns {number|null} Coeficiente beta o null si los datos son insuficientes.
 */
export function calculateBeta(assetSeries, benchmarkSeries) {
  const assetByDay = new Map(assetSeries.map((item) => [Math.floor(item.timestamp / 86400), item.close]));
  const benchmarkByDay = new Map(benchmarkSeries.map((item) => [Math.floor(item.timestamp / 86400), item.close]));
  const dates = [...assetByDay.keys()].filter((date) => benchmarkByDay.has(date)).sort((a, b) => a - b);
  const assetReturns = [];
  const benchmarkReturns = [];

  for (let index = 1; index < dates.length; index += 1) {
    const previousAsset = assetByDay.get(dates[index - 1]);
    const currentAsset = assetByDay.get(dates[index]);
    const previousBenchmark = benchmarkByDay.get(dates[index - 1]);
    const currentBenchmark = benchmarkByDay.get(dates[index]);
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
  return variance ? covariance / variance : null;
}

/**
 * Calcula la media móvil simple (SMA) sobre una serie de precios para una ventana de sesiones dada.
 * @param {Array<{ timestamp: number, close: number }>} series - Serie temporal.
 * @param {number} window - Número de sesiones (ej. 50, 100, 200).
 * @returns {Array<{ t: number, v: number }>} Puntos de la media móvil.
 */
export function computeMovingAverage(series, window) {
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

/**
 * Suma los dividendos por acción repartidos durante los últimos 12 meses.
 * @param {Object} chart - Nodo del gráfico con eventos de dividendos.
 * @returns {number|null} Total anual o null si no hubo.
 */
export function sumRecentDividends(chart) {
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

/**
 * Localiza el precio de cierre más cercano de hace un año para calcular la variación interanual.
 * @param {Array<{ timestamp: number, close: number }>} series - Serie cronológica.
 * @returns {number|null} Precio o null.
 */
export function findYearAgoClose(series) {
  if (!series.length) return null;
  const target = series.at(-1).timestamp - (365 * 24 * 60 * 60);
  return series.find((item) => item.timestamp >= target)?.close ?? null;
}

/**
 * Convierte un timestamp en segundos de UNIX a formato de fecha ISO (AAAA-MM-DD).
 * @param {number|string} timestamp - Timestamp en segundos.
 * @returns {string|null} Fecha ISO o null.
 */
export function toIsoDate(timestamp) {
  if (!Number.isFinite(Number(timestamp))) return null;
  return new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
}
