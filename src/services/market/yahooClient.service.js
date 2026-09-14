/**
 * @fileoverview Cliente HTTP para Yahoo Finance con negociación de cookies, tokens de sesión (crumb) y caché.
 * @module services/market/yahooClient
 */

export const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
export const MARKET_TTL = 5 * 60 * 1000;
export const QUOTE_TTL = 60 * 1000;
export const MARKET_TIMEOUT = 8000;

export const marketCache = new Map();
export const quoteCache = new Map();

let yahooSession = { cookie: null, crumb: null, at: 0 };
const SESSION_TTL = 6 * 60 * 60 * 1000;

/**
 * Obtiene o refresca de forma transparente la cookie y el crumb necesarios para la API v10 de Yahoo Finance.
 * @param {boolean} [forceRefresh=false] - Forzar obtención de credenciales nuevas.
 * @returns {Promise<{ cookie: string, crumb: string }>}
 */
export async function getYahooSession(forceRefresh = false) {
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

/**
 * Realiza una consulta directa al endpoint de gráficos de Yahoo Finance.
 * @param {string} ticker - Ticker bursátil.
 * @param {string} [range='5y'] - Rango temporal (1d, 5d, 1mo, 1y, 5y, etc.).
 * @param {string} [interval='1d'] - Frecuencia de velas (1m, 1d, 1wk, 1mo).
 * @returns {Promise<Object>} Nodo de resultados de la respuesta.
 */
export async function fetchChart(ticker, range = '5y', interval = '1d') {
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
