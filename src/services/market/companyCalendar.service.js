/**
 * @fileoverview Consulta de las próximas fechas anunciadas de resultados y dividendos de una empresa (Yahoo Finance calendarEvents).
 * @module services/market/companyCalendar
 */

import { getYahooSession, MARKET_TIMEOUT } from './yahooClient.service.js';

const COMPANY_CALENDAR_TTL = 6 * 60 * 60 * 1000;
const COMPANY_CALENDAR_EMPTY_TTL = 30 * 60 * 1000;
const companyCalendarCache = new Map();

const EMPTY_CALENDAR = {
  earningsDate: null,
  earningsDateEstimate: false,
  exDividendDate: null,
  dividendDate: null,
};

/**
 * Convierte un timestamp UNIX de Yahoo en fecha ISO (YYYY-MM-DD).
 * @param {*} raw - Timestamp en segundos.
 * @returns {string|null} Fecha ISO o null si no es válida.
 */
function toIsoDate(raw) {
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/**
 * Consulta las próximas fechas de resultados y dividendos anunciadas por el mercado.
 * @param {string} ticker - Ticker bursátil.
 * @returns {Promise<{earningsDate: string|null, earningsDateEstimate: boolean, exDividendDate: string|null, dividendDate: string|null}>}
 */
export async function getCompanyCalendar(ticker) {
  const normalizedTicker = String(ticker).trim().toUpperCase();
  const cached = companyCalendarCache.get(normalizedTicker);
  if (cached && Date.now() - cached.at < cached.ttl) return cached.data;

  let data = { ...EMPTY_CALENDAR };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const session = await getYahooSession(attempt > 0);
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(normalizedTicker)}?crumb=${encodeURIComponent(session.crumb)}&modules=calendarEvents`;
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
      const events = json?.quoteSummary?.result?.[0]?.calendarEvents;
      if (!events) break;

      const earningsDates = (events.earnings?.earningsDate ?? [])
        .map((item) => toIsoDate(item?.raw))
        .filter(Boolean)
        .sort();

      data = {
        earningsDate: earningsDates[0] ?? null,
        earningsDateEstimate: Boolean(events.earnings?.isEarningsDateEstimate),
        exDividendDate: toIsoDate(events.exDividendDate?.raw),
        dividendDate: toIsoDate(events.dividendDate?.raw),
      };
      break;
    } catch {
      // Reintento con sesión nueva
    }
  }

  const hasData = Boolean(data.earningsDate || data.exDividendDate || data.dividendDate);
  companyCalendarCache.set(normalizedTicker, {
    data,
    at: Date.now(),
    ttl: hasData ? COMPANY_CALENDAR_TTL : COMPANY_CALENDAR_EMPTY_TTL,
  });
  return data;
}
