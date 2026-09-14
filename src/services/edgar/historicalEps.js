/**
 * @fileoverview Extracción de BPA ajustado/subyacente histórico desde comunicados 8-K (Item 2.02).
 * @module services/edgar/historicalEps
 */

import { fetchSecHtml } from './secClient.js';
import { getCompanyByTicker, getCompanySubmissions } from './companyProfile.js';
import { normalizeRecentFilings, addDaysToDate } from './filingPeriods.js';
import { getFilingIndexItems } from './filingDocuments.js';

const underlyingEpsCache = new Map();
const UNDERLYING_EPS_TTL = 24 * 60 * 60 * 1000;

const UNDERLYING_EPS_PATTERNS = [
  /underlying[^.]{0,160}?diluted[^.]{0,100}?(?:of|was|were|is|to|reached|totaled)\s+\$\s*([0-9][0-9.,]*)/i,
  /underlying[^.]{0,180}?(?:income|earnings)[^.]{0,70}?per share[^.]{0,100}?(?:of|was|were|is|to|reached|totaled)\s+\$\s*([0-9][0-9.,]*)/i,
  /underlying[^.]{0,140}?per diluted share[^.]{0,80}?(?:of|was|were|is|to|reached|totaled)\s+\$\s*([0-9][0-9.,]*)/i,
  /(?:non-gaap|underlying|adjusted)[^.]{0,120}?diluted eps[^.]{0,60}?(?:of|was|were|is|to|reached|totaled)\s+\$\s*([0-9][0-9.,]*)/i,
  /adjusted[^.]{0,160}?diluted[^.]{0,100}?(?:of|was|were|is|to|reached|totaled)\s+\$\s*([0-9][0-9.,]*)/i,
  /adjusted[^.]{0,160}?(?:eps|earnings per share)[^.]{0,80}?(?:of|was|were|is|to|reached|totaled)\s+\$\s*([0-9][0-9.,]*)/i,
];

/**
 * Limpia etiquetas HTML, scripts, estilos y entidades de un comunicado.
 * @param {string} html - HTML crudo.
 * @returns {string} Texto plano limpio.
 */
export function stripFilingHtml(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Parsea un string numérico de BPA tolerando formatos con comas y puntos.
 * @param {string|number} raw - Entrada cruda.
 * @returns {number|null} Valor numérico o null si inválido.
 */
export function parseUnderlyingEpsNumber(raw) {
  if (raw == null) return null;
  let value = String(raw).trim().replace(/\s/g, '');
  if (!value) return null;
  value = value.replace(/[.,;:]+$/, '');
  if (!value) return null;
  if (value.includes(',') && value.includes('.')) {
    value = value.lastIndexOf(',') > value.lastIndexOf('.')
      ? value.replace(/\./g, '').replace(/,/g, '.')
      : value.replace(/,/g, '');
  } else if (value.includes(',')) {
    value = value.replace(',', '.');
  }
  const num = parseFloat(value);
  return Number.isFinite(num) && num > 0 && num < 200 ? Math.round(num * 100) / 100 : null;
}

/**
 * Extrae el valor de BPA ajustado o subyacente del HTML de un comunicado de resultados.
 * @param {string} html - Contenido HTML del comunicado.
 * @returns {number|null} Valor extraído o null.
 */
export function extractUnderlyingEpsFromHtml(html) {
  const text = stripFilingHtml(html);
  const lower = text.toLowerCase();

  const findHeading = (labels) => labels.reduce((best, label) => {
    const index = lower.indexOf(label);
    return index >= 0 && (best < 0 || index < best) ? index : best;
  }, -1);
  const annualHeading = findHeading([
    'full year financial highlights', 'full-year financial highlights', 'full year highlights',
    'full year performance', 'full-year performance',
    'full-year financial results', 'full year financial results', 'full-year results summary',
    'full year results summary', 'full-year financial summary', 'full year financial summary',
  ]);
  const quarterHeading = findHeading([
    'fourth quarter financial highlights', 'fourth quarter highlights', 'fourth quarter results', 'q4 results',
  ]);
  if (annualHeading < 0 || (quarterHeading >= 0 && quarterHeading > annualHeading)) return null;
  const section = text.slice(annualHeading);

  const seen = new Set();
  const candidates = [];
  for (const pattern of UNDERLYING_EPS_PATTERNS) {
    const regex = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
    let match;
    while ((match = regex.exec(section)) !== null) {
      if (!match[0]) {
        regex.lastIndex += 1;
        continue;
      }
      if (seen.has(match.index)) continue;
      seen.add(match.index);
      if (/\bfrom\b[^$]{0,50}\$/i.test(match[0])) continue;
      const value = parseUnderlyingEpsNumber(match[1]);
      if (value != null) candidates.push({ value, index: match.index });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.index - b.index);
  return candidates[0].value;
}

/**
 * Obtiene el BPA diluido ajustado publicado por la empresa en su comunicado de resultados anuales (8-K).
 * @param {string} ticker - Símbolo de cotización.
 * @param {number|string} year - Año fiscal a buscar.
 * @returns {Promise<number|null>} BPA subyacente o null.
 */
export async function getHistoricalUnderlyingEps(ticker, year) {
  const targetYear = Number(year);
  if (!Number.isFinite(targetYear)) return null;
  const cacheKey = `${String(ticker).toUpperCase()}:${targetYear}`;
  const cached = underlyingEpsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < UNDERLYING_EPS_TTL) return cached.value;

  const value = await (async () => {
    try {
      const company = await getCompanyByTicker(ticker);
      const submissions = await getCompanySubmissions(company);
      const entries = normalizeRecentFilings(submissions?.filings?.recent);
      const annualFiling = entries.find((entry) => entry.form === '10-K'
        && String(entry.reportDate ?? '').startsWith(String(targetYear)));
      const anchor = annualFiling?.filingDate ? String(annualFiling.filingDate).slice(0, 10) : `${targetYear + 1}-03-01`;
      const windowStart = addDaysToDate(anchor, -80);
      const windowEnd = addDaysToDate(anchor, 15);
      if (!windowStart || !windowEnd) return null;

      let candidates = entries.filter((entry) => entry.form === '8-K'
        && entry.filingDate
        && entry.filingDate >= windowStart && entry.filingDate <= windowEnd
        && String(entry.items ?? '').includes('2.02'));
      if (!candidates.length) {
        candidates = entries.filter((entry) => entry.form === '8-K'
          && entry.filingDate
          && entry.filingDate >= windowStart && entry.filingDate <= windowEnd);
      }
      candidates.sort((a, b) => Math.abs(new Date(a.filingDate) - new Date(anchor)) - Math.abs(new Date(b.filingDate) - new Date(anchor)));

      for (const entry of candidates.slice(0, 3)) {
        const items = await getFilingIndexItems(company, { accession: entry.accessionNumber });
        const names = (Array.isArray(items) ? items : [])
          .map((item) => item?.name)
          .filter((name) => typeof name === 'string' && /\.(htm|html)$/i.test(name) && !/index/i.test(name));
        const preferred = names.filter((name) => /ex.?99|press|release|news|earnings/i.test(name));
        const ordered = [...preferred, ...names.filter((name) => !preferred.includes(name))];
        for (const name of ordered.slice(0, 3)) {
          try {
            const url = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${entry.accessionNumber.replaceAll('-', '')}/${name}`;
            const html = await fetchSecHtml(url);
            const parsed = extractUnderlyingEpsFromHtml(html);
            if (parsed != null) return parsed;
          } catch {
            // Continúa con el siguiente documento
          }
        }
      }
      return null;
    } catch (error) {
      console.warn('[edgar] BPA ajustado histórico no disponible:', error.message);
      return null;
    }
  })();

  underlyingEpsCache.set(cacheKey, { value, at: Date.now() });
  return value;
}
