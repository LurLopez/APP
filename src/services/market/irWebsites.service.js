/**
 * @fileoverview Localizador y normalizador de páginas oficiales de relación con inversores (IR) y corporativas.
 * @module services/market/irWebsites
 */

import { getYahooSession, MARKET_TIMEOUT } from './yahooClient.service.js';

const irWebsiteCache = new Map();
const IR_WEBSITE_TTL = 24 * 60 * 60 * 1000;
const IR_WEBSITE_EMPTY_TTL = 10 * 60 * 1000;

/**
 * Normaliza una URL asegurando protocolo https y extrayendo el origen canónico.
 * @param {unknown} value - URL en bruto.
 * @returns {string|null}
 */
export function normalizeIrSiteUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

/**
 * Resuelve las páginas webs corporativas y de relación con inversores oficiales asociadas a un ticker.
 * @param {string} ticker - Ticker bursátil.
 * @returns {Promise<Array<{ url: string, kind: string }>>}
 */
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
      // Reintento con nueva sesión si falla
    }
  }

  return store();
}
