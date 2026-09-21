/**
 * @fileoverview Cliente HTTP para consultas con reintentos y caché hacia la SEC EDGAR.
 * @module services/edgar/secClient
 */

import {
  USER_AGENT,
  COMPANY_TICKERS_URL,
  TICKER_MAP_TTL,
} from './statementConcepts.js';

let tickerMapCache = null;

export const KNOWN_TICKER_OVERRIDES = {
  XOM: { cik: 34088, ticker: 'XOM', name: 'EXXON MOBIL CORP' },
  'BRK-B': { cik: 1067983, ticker: 'BRK-B', name: 'BERKSHIRE HATHAWAY INC' },
  'BRK.B': { cik: 1067983, ticker: 'BRK-B', name: 'BERKSHIRE HATHAWAY INC' },
  'BRK-A': { cik: 1067983, ticker: 'BRK-A', name: 'BERKSHIRE HATHAWAY INC' },
  'BRK.A': { cik: 1067983, ticker: 'BRK-A', name: 'BERKSHIRE HATHAWAY INC' },
  'BF-B': { cik: 14693, ticker: 'BF-B', name: 'BROWN-FORMAN CORP' },
  'BF.B': { cik: 14693, ticker: 'BF-B', name: 'BROWN-FORMAN CORP' },
};

/**
 * Crea un error personalizado de empresa no encontrada en SEC EDGAR.
 * @param {string} message - Mensaje de error.
 * @returns {Error} Objeto de error con código 'COMPANY_NOT_FOUND'.
 */
export function notFound(message) {
  const error = new Error(message);
  error.code = 'COMPANY_NOT_FOUND';
  return error;
}

let secThrottleChain = Promise.resolve();

function throttledFetch(url, options) {
  const next = secThrottleChain.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    return fetch(url, options);
  });
  secThrottleChain = next.catch(() => {});
  return next;
}

/**
 * Realiza una petición JSON a la API de la SEC con reintentos exponenciales ante rate limiting (429).
 * @param {string} url - URL de la SEC.
 * @param {number} [retries=3] - Intentos restantes.
 * @returns {Promise<object>} Respuesta deserializada.
 */
export async function fetchSecJson(url, retries = 3) {
  try {
    const response = await throttledFetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 429 && retries > 0) {
      const waitMs = (4 - retries) * 3500;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return fetchSecJson(url, retries - 1);
    }
    if (!response.ok) {
      throw new Error(`EDGAR respondió ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    const wrapped = new Error(`No se pudo consultar EDGAR: ${error.message}`);
    wrapped.code = 'EDGAR_UNAVAILABLE';
    throw wrapped;
  }
}

/**
 * Realiza una petición HTML a SEC EDGAR.
 * @param {string} url - URL del documento.
 * @returns {Promise<string>} Texto HTML del documento.
 */
export async function fetchSecHtml(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`EDGAR respondió ${response.status}`);
  return response.text();
}

/**
 * Realiza una petición XML / texto a SEC EDGAR con reintentos.
 * @param {string} url - URL del archivo XML/XBRL.
 * @param {number} [retries=2] - Intentos restantes.
 * @returns {Promise<string>} Texto de la respuesta.
 */
export async function fetchSecText(url, retries = 2) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml,text/xml' },
    signal: AbortSignal.timeout(45000),
  });
  if (response.status === 429 && retries > 0) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    return fetchSecText(url, retries - 1);
  }
  if (!response.ok) {
    throw new Error(`EDGAR respondió ${response.status}`);
  }
  return response.text();
}

/**
 * Obtiene el mapa completo de tickers y CIKs de la SEC con caché en memoria.
 * @returns {Promise<Map<string, {cik: number|string, ticker: string, name: string}>>} Mapa indexado por ticker mayúsculas.
 */
let pendingTickerMap = null;

export async function getTickerMap() {
  if (tickerMapCache && Date.now() - tickerMapCache.at < TICKER_MAP_TTL) {
    return tickerMapCache.data;
  }
  if (pendingTickerMap) {
    return pendingTickerMap;
  }
  pendingTickerMap = (async () => {
    try {
      const raw = await fetchSecJson(COMPANY_TICKERS_URL);
      const data = new Map();
      for (const entry of Object.values(raw)) {
        data.set(String(entry.ticker).toUpperCase(), {
          cik: entry.cik_str,
          ticker: String(entry.ticker).toUpperCase(),
          name: entry.title,
        });
      }
      for (const [tick, override] of Object.entries(KNOWN_TICKER_OVERRIDES)) {
        data.set(tick, override);
      }
      tickerMapCache = { data, at: Date.now() };
      return data;
    } finally {
      pendingTickerMap = null;
    }
  })();
  return pendingTickerMap;
}
