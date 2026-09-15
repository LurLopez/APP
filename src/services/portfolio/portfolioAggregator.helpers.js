/**
 * @fileoverview Módulo extraído de portfolioAggregator.service.js.
 */

const NORTH_AMERICA = new Set(['Estados Unidos', 'United States', 'US', 'USA', 'CA', 'Canada', 'Canadá', 'MX', 'Mexico', 'México', 'BM', 'Bermudas']);

const EUROPE = new Set(['GB', 'UK', 'DE', 'FR', 'ES', 'IT', 'NL', 'CH', 'IE', 'SE', 'NO', 'DK', 'BE', 'PT', 'AT', 'FI', 'PL', 'LU', 'GR', 'HU', 'CZ', 'RO', 'SK', 'SI', 'HR', 'BG', 'LT', 'LV', 'EE', 'CY', 'MT', 'IS', 'LI', 'MC', 'AD', 'VA', 'RU', 'Rusia', 'Reino Unido', 'Alemania', 'Francia', 'España', 'Italia', 'Países Bajos', 'Suiza', 'Irlanda', 'Suecia', 'Noruega', 'Dinamarca', 'Bélgica', 'Portugal', 'Austria', 'Finlandia', 'Polonia', 'Luxemburgo', 'Grecia', 'Israel', 'IL']);

const ASIA_PACIFIC = new Set(['JP', 'Japón', 'CN', 'China', 'HK', 'Hong Kong', 'IN', 'India', 'KR', 'Corea del Sur', 'SG', 'Singapur', 'TW', 'Taiwán', 'AU', 'Australia', 'NZ', 'Nueva Zelanda', 'ID', 'Indonesia', 'MY', 'Malasia', 'TH', 'Tailandia', 'PH', 'Filipinas', 'VN', 'Vietnam']);

const LATAM = new Set(['AR', 'Argentina', 'BR', 'Brasil', 'CL', 'Chile', 'CO', 'Colombia', 'PE', 'Perú', 'UY', 'Uruguay', 'PA', 'Panamá', 'CR', 'Costa Rica', 'DO', 'República Dominicana']);

export function regionForCountry(country) {
  const normalized = String(country ?? '').trim();
  if (!normalized) return null;
  if (NORTH_AMERICA.has(normalized)) return 'América del Norte';
  if (EUROPE.has(normalized)) return 'Europa';
  if (ASIA_PACIFIC.has(normalized)) return 'Asia-Pacífico';
  if (LATAM.has(normalized)) return 'Latinoamérica';
  return 'Internacional';
}

export function instrumentTypeLabel(instrumentType) {
  if (!instrumentType) return null;
  if (instrumentType === 'EQUITY') return 'Acción';
  if (instrumentType === 'ETF') return 'ETF';
  if (instrumentType === 'INDEX') return 'Índice';
  return String(instrumentType);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function dividendsBetween(dividends, fromDate, toDate, shares) {
  if (!fromDate || !toDate || fromDate > toDate) return 0;
  let perShare = 0;
  for (const div of dividends) {
    if (div.date >= fromDate && div.date <= toDate) perShare += div.amount;
  }
  return perShare * shares;
}

export function ttmDividendPerShare(dividends, fromDate, toDate) {
  let perShare = 0;
  for (const div of dividends) {
    if (div.date >= fromDate && div.date <= toDate) perShare += div.amount;
  }
  return perShare;
}
