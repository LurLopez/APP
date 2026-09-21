/**
 * @fileoverview Detección y descarga de presentaciones de resultados (Investor Decks) asociadas a 10-K, 10-Q y 8-K.
 * @module services/edgar/filingPresentations
 */

import {
  USER_AGENT,
  FILINGS_LIMIT,
  EARNINGS_WINDOW_DAYS,
  FILING_PRESENTATIONS_LIMIT,
} from './statementConcepts.js';
import { getCompanySubmissions } from './companyProfile.js';
import { getCompanyFilings, normalizeRecentFilings, addDaysToDate } from './filingPeriods.js';
import { getFilingIndexItems } from './filingDocuments.js';
import { getIrDeckForFiling } from './irCrawler.js';
import { assertPublicUrl } from '../../utils/ssrfGuard.js';

const PRESENTATION_NAME_RE = /presentation|slides?|deck|investor.?present|webcast|earnings.?call/i;
// Los comunicados de resultados no siempre se llaman "press release": NVIDIA y otras compañías
// usan abreviaturas tipo "q4fy26pr.htm" (pr = press release) o "q4fy26er.htm" (er = earnings release).
const PRESS_RELEASE_NAME_RE = /press.?release|news.?release|earnings.?release|releas|pressrelease|release.?\d|press.?releases|(?:^|[^a-z])(?:pr|er)(?:[^a-z]|$)/i;
const EARNINGS_DOC_NAME_RE = /ex.?99|exhibit.?99|exhibits?99|earnings|results|press|presentation|slides?|deck|commentary|shareholder.?letter/i;
const NON_EARNINGS_DOC_NAME_RE = /proxy|voting|annual.?meeting|bylaws|charter|code.?of.?ethics|compensation|employment|credit.?agreement|indenture|underwriting|auditor|consent/i;
const EARNINGS_FILE_RE = /\.(pdf|htm|html)$/i;
const INDEX_DOC_NAME_RE = /index|^r\d+\.(?:htm|html)$/i;

const MAX_PRESENTATION_BYTES = 20 * 1024 * 1024;

/**
 * Lee el cuerpo de una respuesta con un límite estricto de tamaño (anti-DoS de memoria).
 * @param {Response} response - Respuesta fetch.
 * @param {number} maxBytes - Máximo de bytes permitidos.
 * @returns {Promise<Buffer>} Contenido descargado.
 */
async function readLimitedBuffer(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('Documento complementario demasiado grande.');
  }
  if (!response.body?.getReader) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) throw new Error('Documento complementario demasiado grande.');
    return Buffer.from(arrayBuffer);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error('Documento complementario demasiado grande.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

const filingPresentationsCache = new Map();
const filingPresentationsInFlight = new Map();
const FILING_PRESENTATIONS_CACHE_TTL = 24 * 60 * 60 * 1000;
const IR_BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

export function looksLikePresentationName(name) {
  return PRESENTATION_NAME_RE.test(String(name ?? '').toLowerCase());
}

export function looksLikePressReleaseName(name) {
  return PRESS_RELEASE_NAME_RE.test(String(name ?? '').toLowerCase());
}

export function classifyEarningsDocument(name, primaryDocument) {
  const raw = String(name ?? '');
  const lower = raw.toLowerCase();
  if (!raw || raw === primaryDocument) return null;
  if (!/\.(pdf|htm|html)$/i.test(lower)) return null;
  if (lower.includes('index') || /^r\d+\.(htm|html)$/i.test(lower)) return null;
  if (NON_EARNINGS_DOC_NAME_RE.test(lower)) return null;
  if (looksLikePresentationName(lower)) return 'presentation';
  if (/\.pdf$/i.test(lower) && !looksLikePressReleaseName(lower)) return 'presentation';
  if (/(?:^|[^a-z0-9]|x)(?:ex|exhibit)[-_.]?99(?:[._-][2-9]|d[2-9])(?![0-9])/i.test(lower) && !looksLikePressReleaseName(lower)) return 'presentation';
  if (looksLikePressReleaseName(lower)) return 'release';
  if (EARNINGS_DOC_NAME_RE.test(lower)) return 'release';
  return null;
}

/**
 * Respaldo permisivo para 8-K de resultados (Item 2.02) cuyo comunicado no sigue las
 * convenciones de nombre habituales: cualquier documento ofimático del propio 8-K que no sea
 * el cuerpo principal, un índice ni un anexo administrativo se considera comunicado de resultados.
 * @param {Array<{name: string}>} items - Documentos del índice del filing.
 * @param {string|null} primaryDocument - Documento principal del 8-K (se excluye).
 * @returns {Array<{name: string, docType: string}>} Documentos candidatos con su tipo.
 */
export function pickEarningsDocumentsFallback(items, primaryDocument) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => typeof item?.name === 'string')
    .filter((item) => EARNINGS_FILE_RE.test(item.name))
    .filter((item) => item.name !== primaryDocument)
    .filter((item) => !INDEX_DOC_NAME_RE.test(item.name))
    .filter((item) => !NON_EARNINGS_DOC_NAME_RE.test(item.name.toLowerCase()))
    .map((item) => ({
      name: item.name,
      docType: looksLikePresentationName(item.name) ? 'presentation' : 'release',
    }));
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}

export function getCachedFilingPresentations(ticker, accession) {
  if (!ticker || !accession) return null;
  const key = `${ticker}:${accession}`;
  const hit = filingPresentationsCache.get(key);
  if (hit && Date.now() - hit.at < FILING_PRESENTATIONS_CACHE_TTL) {
    return hit.data;
  }
  return null;
}

async function findFilingPresentations(company, filing) {
  const cacheKey = `${company.ticker}:${filing.accession}`;
  const cached = filingPresentationsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < FILING_PRESENTATIONS_CACHE_TTL) {
    return cached.data;
  }
  const inFlight = filingPresentationsInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const presentations = [];
    const irDeck = await getIrDeckForFiling(company, filing);
    if (irDeck) {
      presentations.push({
        kind: 'presentation',
        source: 'ir',
        docType: 'presentation',
        name: irDeck.name || 'Presentación de resultados',
        documentName: irDeck.name || 'Presentación de resultados',
        period: filing.period ?? null,
        filedAt: filing.filedAt ?? null,
        accession: null,
        documentUrl: irDeck.url,
      });
    }

    const submissions = await getCompanySubmissions(company);
    const recent = normalizeRecentFilings(submissions?.filings?.recent);
    if (!Array.isArray(recent)) return presentations;

    const periodEnd = filing.period ? String(filing.period).slice(0, 10) : null;
    const candidates = [];
    const fallbackStart = periodEnd ? null : (filing.filedAt ? addDaysToDate(filing.filedAt, -35) : null);
    const fallbackEnd = periodEnd ? null : (filing.filedAt ? addDaysToDate(filing.filedAt, 35) : null);
    const earningsWindowEnd = periodEnd ? addDaysToDate(periodEnd, EARNINGS_WINDOW_DAYS) : null;

    for (const entry of recent) {
      if (entry.form !== '8-K' || !entry.accessionNumber) continue;
      const rep = (entry.reportDate || entry.filingDate) ? String(entry.reportDate || entry.filingDate).slice(0, 10) : null;
      const filed = entry.filingDate ? String(entry.filingDate).slice(0, 10) : null;
      let matches = false;
      if (periodEnd && rep && earningsWindowEnd && rep >= periodEnd && rep <= earningsWindowEnd) {
        matches = true;
      }
      if (!matches && filing.filedAt && filed) {
        const filedTarget = String(filing.filedAt).slice(0, 10);
        const windowStart = addDaysToDate(filedTarget, -45);
        const windowEnd = addDaysToDate(filedTarget, 45);
        if (windowStart && windowEnd && filed >= windowStart && filed <= windowEnd) {
          matches = true;
        }
      }
      if (!matches && fallbackStart && fallbackEnd && filed && filed >= fallbackStart && filed <= fallbackEnd) {
        matches = true;
      }
      if (matches) {
        candidates.push(entry);
      }
    }
    if (!candidates.length) return presentations;

    const earningsCandidates = candidates.filter((entry) => String(entry.items ?? '').includes('2.02'));
    let pool = earningsCandidates.length ? earningsCandidates : candidates;
    if (filing.filedAt && pool.length > 1) {
      const targetTime = new Date(filing.filedAt).getTime();
      pool = [...pool].sort((a, b) => {
        const diffA = a.filingDate ? Math.abs(new Date(a.filingDate).getTime() - targetTime) : Infinity;
        const diffB = b.filingDate ? Math.abs(new Date(b.filingDate).getTime() - targetTime) : Infinity;
        return diffA - diffB;
      });
    }
    const selected = earningsCandidates.length ? pool.slice(0, 1) : pool.slice(0, 4);

    const indexed = await mapWithConcurrency(selected, 3, async (entry) => ({
      entry,
      items: await getFilingIndexItems(company, { accession: entry.accessionNumber }),
    }));

    const seen = new Set();
    for (const { entry, items } of indexed) {
      if (!Array.isArray(items)) continue;
      const picks = [];
      for (const item of items) {
        const docType = classifyEarningsDocument(item.name, entry.primaryDocument);
        if (!docType) continue;
        picks.push({ name: item.name, docType });
      }
      // Si el 8-K es de resultados (Item 2.02) y ningún documento encaja con los patrones de
      // nombre, se incluyen sus anexos ofimáticos como comunicado (evita perder el guidance
      // por convenciones de nombre inesperadas, p. ej. NVIDIA q4fy26pr.htm).
      if (!picks.length && String(entry.items ?? '').includes('2.02')) {
        picks.push(...pickEarningsDocumentsFallback(items, entry.primaryDocument));
      }
      picks.sort((a, b) => (a.docType === b.docType ? 0 : (a.docType === 'presentation' ? -1 : 1)));
      for (const pick of picks.slice(0, 2)) {
        if (seen.has(pick.name)) continue;
        seen.add(pick.name);
        presentations.push({
          kind: 'presentation',
          docType: pick.docType,
          formType: '8-K',
          name: pick.name,
          period: entry.reportDate ?? null,
          filedAt: entry.filingDate ?? null,
          accession: entry.accessionNumber,
          documentName: pick.name,
          documentUrl: `https://www.sec.gov/Archives/edgar/data/${company.cik}/${entry.accessionNumber.replaceAll('-', '')}/${pick.name}`,
        });
      }
    }
    return presentations;
  })().then((res) => {
    filingPresentationsCache.set(cacheKey, { data: res, at: Date.now() });
    return res;
  }).finally(() => {
    filingPresentationsInFlight.delete(cacheKey);
  });

  filingPresentationsInFlight.set(cacheKey, promise);
  return promise;
}

export async function getFilingsPresentationsMap(ticker, options = {}) {
  const limit = Math.min(Number(options?.presentationLimit) || FILING_PRESENTATIONS_LIMIT, FILINGS_LIMIT);
  const { company, filings } = await getCompanyFilings(ticker, options);
  const recent = filings.slice(0, limit);
  const results = await mapWithConcurrency(recent, 4, async (filing) => {
    const presentations = await findFilingPresentations(company, filing);
    return { accession: filing.accession, presentations };
  });
  const map = {};
  for (const item of results) {
    if (item.accession) {
      map[item.accession] = item.presentations || [];
    }
  }
  return map;
}

export async function getFilingsWithPresentations(ticker, options = {}) {
  const limit = Math.min(Number(options?.presentationLimit) || FILING_PRESENTATIONS_LIMIT, FILINGS_LIMIT);
  const { company, filings } = await getCompanyFilings(ticker, options);
  const recent = filings.slice(0, limit);
  const withPresentations = await mapWithConcurrency(recent, 4, async (filing) => ({
    ...filing,
    presentations: await findFilingPresentations(company, filing),
  }));
  const rest = filings.slice(limit).map((filing) => ({ ...filing, presentations: [] }));
  return {
    company: { ticker: company.ticker, name: company.name, cik: company.cik },
    filings: [...withPresentations, ...rest],
  };
}

export async function getFilingPresentations(ticker, accession) {
  const { company, filings } = await getCompanyFilings(ticker);
  const filing = filings.find((item) => item.accession === accession);
  if (!filing) return [];
  return findFilingPresentations(company, filing);
}

export async function getPresentationBuffers(ticker, accession) {
  const presentations = await getFilingPresentations(ticker, accession);
  if (!presentations.length) return [];

  const downloadOne = async (presentation) => {
    try {
      // Guarda anti-SSRF: el destino debe ser público (nunca localhost/red privada).
      const safeUrl = await assertPublicUrl(presentation.documentUrl);
      const isSecUrl = String(safeUrl.href).includes('sec.gov');
      const response = await fetch(safeUrl, {
        headers: {
          'User-Agent': isSecUrl ? USER_AGENT : IR_BROWSER_UA,
          Accept: 'application/pdf,text/html',
        },
        signal: AbortSignal.timeout(isSecUrl ? 25000 : 35000),
      });
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? '';
      const buffer = await readLimitedBuffer(response, MAX_PRESENTATION_BYTES);
      if (!buffer.byteLength) return null;
      return {
        name: presentation.documentName ?? presentation.name,
        buffer,
        kind: contentType.includes('pdf') ? 'pdf' : (contentType.includes('html') ? 'html' : 'pdf'),
      };
    } catch {
      return null;
    }
  };

  const results = await Promise.allSettled(presentations.map(downloadOne));
  return results
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);
}
