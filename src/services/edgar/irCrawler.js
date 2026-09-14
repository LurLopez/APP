/**
 * @fileoverview Detección y rastreo de presentaciones corporativas en sitios de Investor Relations (IR) y APIs de Q4.
 * @module services/edgar/irCrawler
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CHROME_BIN = process.env.CHROME_BIN || 'google-chrome';
const IR_BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const IR_DECK_TTL = 12 * 60 * 60 * 1000;
const IR_DECK_EMPTY_TTL = 5 * 60 * 1000;
const irDeckCache = new Map();
const irDeckInFlight = new Map();

const IR_QUARTERLY_PATHS = [
  '/financials/quarterly-results/default.aspx',
  '/financials/quarterly-results',
  '/financial-information/quarterly-results/default.aspx',
  '/quarterly-results',
  '/events-and-presentations/default.aspx',
  '/events-and-presentations',
];

const DECK_NAME_RE = /presentation|deck|slides|business.?update|investor.?present|earnings.?call.?present/i;
const NON_DECK_NAME_RE = /press.?release|earnings.?release|news.?release|transcript|q\s*&\s*a|qa_|\bqa\b|pre.?recorded|recorded.?management|(?:^|[^a-z0-9])er(?:[^a-z0-9]|$)/i;

const Q4_API_HEADERS = {
  'User-Agent': IR_BROWSER_UA,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
};

export function isDeckDocument(text, url) {
  const combined = `${String(text ?? '')} ${String(url ?? '')}`;
  return DECK_NAME_RE.test(combined) && !NON_DECK_NAME_RE.test(combined);
}

export function stripHtmlTags(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function expandYear(value) {
  const year = String(value ?? '');
  if (/^\d{4}$/.test(year)) return year;
  if (/^\d{2}$/.test(year)) return Number(year) >= 40 ? `19${year}` : `20${year}`;
  return null;
}

export function extractQuarterKeys(text, url, yearHint) {
  const keys = new Set();
  const sources = [String(text ?? ''), String(url ?? '')];
  const quarterPattern = /(?:^|[^a-z0-9])(?:q|qtr|quarter)\s*([1-4])\s*[,./-]?\s*(?:(?:fy|fiscal)\s*)?((?:20)?\d{2})(?![0-9])/gi;
  const numericQuarterPattern = /(?:^|[^a-z0-9])([1-4])\s*q\s*(?:(?:fy|fiscal)\s*)?((?:20)?\d{2})(?![0-9])/gi;
  const fiscalQuarterPattern = /(?:^|[^a-z0-9])(?:f|fy)\s*(\d{2})[\s._-]*q\s*([1-4])(?![0-9])/gi;
  const fiscalPattern = /(?:fy|full\s*year|fiscal\s*year|fiscal|annual)\s*((?:20)?\d{2})(?![0-9])/gi;
  const ordinalPattern = /(first|second|third|fourth)[\s-]*quarter[^a-z0-9]*(?:(?:fy|fiscal)\s*)?((?:20)?\d{2})/gi;
  const ordinals = { first: '1', second: '2', third: '3', fourth: '4' };

  for (const source of sources) {
    let match;
    while ((match = quarterPattern.exec(source))) {
      const year = expandYear(match[2]);
      if (year) {
        keys.add(`q${match[1]}${year}`);
        keys.add(`q${match[1]}fy${year}`);
      }
    }
    while ((match = numericQuarterPattern.exec(source))) {
      const year = expandYear(match[2]);
      if (year) keys.add(`q${match[1]}${year}`);
    }
    while ((match = fiscalQuarterPattern.exec(source))) {
      const year = expandYear(match[1]);
      if (year) keys.add(`q${match[2]}${year}`);
    }
    while ((match = fiscalPattern.exec(source))) {
      const year = expandYear(match[1]);
      if (year) {
        keys.add(`fy${year}`);
        if (/full\s*year/i.test(match[0])) keys.add(`fullyear${year}`);
      }
    }
    while ((match = ordinalPattern.exec(source))) {
      const year = expandYear(match[2]);
      const quarter = ordinals[match[1].toLowerCase()];
      if (year && quarter) keys.add(`q${quarter}${year}`);
    }
  }
  if (yearHint && /^\d{4}$/.test(String(yearHint))) {
    const textTrim = String(text ?? '').trim();
    const qOnly = /(?:^|[^a-z0-9])(?:q|qtr|quarter)\s*([1-4])\s*$/i.exec(textTrim);
    const qOnlyNumeric = /(?:^|[^a-z0-9])([1-4])\s*q\s*$/i.exec(textTrim);
    const quarter = qOnly?.[1] ?? qOnlyNumeric?.[1];
    if (quarter) keys.add(`q${quarter}${yearHint}`);
  }
  return keys;
}

export function cleanDeckName(text) {
  return String(text ?? '')
    .replace(/[,]?\s*(?:PDF file|Report|opens? in new window).*$/i, '')
    .replace(/[>]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function deckNameFromUrl(url, fallback) {
  let name = cleanDeckName(fallback) || 'Presentación de resultados';
  if (/^q[1-4]\s*$/i.test(name.trim()) || !/(20\d{2}|q\s*[1-4]\s*(?:20)?\d{2}|fy)/i.test(name)) {
    const fileName = decodeURIComponent(String(url).split('/').pop().split('?')[0]).replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
    name = cleanDeckName(fileName) || name;
  }
  return name;
}

function irPageErrorType(html) {
  if (!html || String(html).length < 2000) return 'retry';
  const title = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  if (/error 404|404: not found|page not found|does not exist/i.test(title)) return 'skip';
  const sample = `${title} ${String(html).slice(0, 4000)}`;
  if (/just a moment|un momento|access denied|attention required|forbidden|service unavailable|verificación de seguridad|security check|challenges\.cloudflare\.com/i.test(sample)) return 'retry';
  return null;
}

export async function fetchIrPage(url) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let html = null;
    try {
      const { stdout } = await execFileAsync(CHROME_BIN, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        `--user-agent=${IR_BROWSER_UA}`,
        '--virtual-time-budget=60000',
        '--dump-dom',
        url,
      ], { timeout: 90000, maxBuffer: 12 * 1024 * 1024 });
      html = stdout || null;
    } catch {
      html = null;
    }
    const errorType = irPageErrorType(html);
    if (!errorType) return html;
    if (errorType === 'skip') return null;
  }
  return null;
}

export async function probeIrSiteAlive(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': IR_BROWSER_UA, Accept: 'text/html' },
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
    });
    return response.status === 200 || response.status === 403 || response.status === 429
      || response.status === 301 || response.status === 302 || response.status === 307;
  } catch {
    return false;
  }
}

export function parseIrDocumentLinks(html) {
  const links = [];
  const parts = String(html ?? '').split(/(?=<span[^>]*class="[^"]*documents__head[^"]*"[^>]*>\s*20\d{2}\s*<\/span>)/i);
  let currentYear = null;
  const anchorPattern = /<a\s+([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const part of parts) {
    const yearMatch = part.match(/<span[^>]*class="[^"]*documents__head[^"]*"[^>]*>\s*(20\d{2})\s*<\/span>/i);
    if (yearMatch) currentYear = yearMatch[1];
    let match;
    anchorPattern.lastIndex = 0;
    while ((match = anchorPattern.exec(part))) {
      const attrs = match[1];
      const hrefMatch = attrs.match(/href="([^"]+)"/i);
      if (!hrefMatch) continue;
      const url = hrefMatch[1];
      const titleMatch = attrs.match(/title="([^"]*)"/i);
      const labelMatch = attrs.match(/aria-label="([^"]*)"/i);
      const innerText = stripHtmlTags(match[2]);
      const rawName = (labelMatch?.[1] || titleMatch?.[1] || innerText || '').trim();
      const combined = `${url} ${rawName}`;
      const looksLikeDocument = /\.pdf(?:\?|$)/i.test(url)
        || /slides|presentation|deck|press|transcript|remarks|earnings/i.test(combined);
      if (!looksLikeDocument) continue;
      links.push({ url, text: rawName || innerText, year: currentYear });
    }
  }
  return links;
}

export async function getIrQuarterlyLinks(irSite) {
  for (const path of IR_QUARTERLY_PATHS) {
    const pageUrl = `${irSite}${path}`;
    const html = await fetchIrPage(pageUrl);
    if (!html) continue;
    const pageLinks = parseIrDocumentLinks(html).map((link) => ({ ...link, base: pageUrl }));
    const hasDecks = pageLinks.some((link) => isDeckDocument(link.text, link.url)
      && extractQuarterKeys(link.text, link.url, link.year).size > 0);
    if (hasDecks) return pageLinks;
  }
  return [];
}

export async function getQ4EventDeckMap(irSite) {
  const map = new Map();
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let year = currentYear + 1; year >= currentYear - 5; year -= 1) years.push(year);
  for (const year of years) {
    let events = null;
    try {
      const response = await fetch(`${irSite}/feed/Event.svc/GetEventList?year=${year}&languageId=1`, {
        headers: Q4_API_HEADERS,
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) continue;
      const json = await response.json();
      events = json?.GetEventListResult;
    } catch {
      continue;
    }
    if (!Array.isArray(events)) continue;
    for (const event of events) {
      const eventTitle = String(event?.Title ?? '');
      for (const attachment of event?.Attachments ?? []) {
        if (String(attachment?.Extension ?? '').toLowerCase() !== 'pdf') continue;
        const attachmentUrl = attachment?.Url;
        if (!attachmentUrl) continue;
        const attachmentTitle = String(attachment?.Title ?? '');
        if (!/presentation|slides|deck/i.test(`${attachmentTitle} ${attachmentUrl}`)) continue;
        const keys = extractQuarterKeys(`${eventTitle} ${attachmentTitle}`, attachmentUrl);
        if (!keys.size) continue;
        const name = deckNameFromUrl(attachmentUrl, attachmentTitle);
        for (const key of keys) {
          if (!map.has(key)) map.set(key, { url: attachmentUrl, name });
        }
      }
    }
  }
  return map;
}

function extractSubpageUrls(html, baseUrl) {
  const urls = [];
  const seen = new Set();
  const anchorPattern = /<a\s+([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const attrs = match[1];
    const hrefMatch = attrs.match(/href="([^"]+)"/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    const text = stripHtmlTags(match[2]);
    if (!/event|calendar|quarterly|result|financial|presentation|earnings/i.test(`${href} ${text}`)) continue;
    try {
      const abs = new URL(href, baseUrl).href;
      const normalized = abs.replace(/\/+$/, '');
      if (!seen.has(normalized)) {
        seen.add(normalized);
        urls.push(normalized);
      }
    } catch {
      // Ignorar URLs inválidas
    }
  }
  return urls;
}

async function getMainSiteIrPageUrls(website) {
  const candidates = [];
  const seen = new Set();
  const add = (url) => {
    const normalized = String(url ?? '').replace(/\/+$/, '');
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };
  try {
    const response = await fetch(website, {
      headers: { 'User-Agent': IR_BROWSER_UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const html = await response.text();
      const anchorPattern = /<a\s+([^>]*)>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = anchorPattern.exec(html))) {
        const attrs = match[1];
        const hrefMatch = attrs.match(/href="([^"]+)"/i);
        if (!hrefMatch) continue;
        const href = hrefMatch[1];
        const text = stripHtmlTags(match[2]);
        if (!/investor/i.test(`${href} ${text}`)) continue;
        try {
          const abs = new URL(href, website).href;
          if (/investor/i.test(abs)) add(abs);
        } catch {
          // Ignorar
        }
      }
    }
  } catch {
    // Red de reserva
  }
  add(`${website}/investor-relations/financial-news/events-calendar`);
  add(`${website}/investor-relations`);
  add(`${website}/investors`);
  return candidates;
}

function getCagDeckForFiling(filing) {
  const filed = filing.filedAt ? String(filing.filedAt).slice(0, 10) : null;
  if (!filed) return null;
  const year = parseInt(filed.slice(0, 4), 10);
  const month = parseInt(filed.slice(5, 7), 10);
  let q;
  let fy;
  if (month >= 6 && month <= 8) {
    q = 4;
    fy = year;
  } else if (month >= 9 && month <= 11) {
    q = 1;
    fy = year + 1;
  } else if (month === 12) {
    q = 2;
    fy = year + 1;
  } else if (month === 1) {
    q = 2;
    fy = year;
  } else if (month >= 2 && month <= 5) {
    q = 3;
    fy = year;
  } else {
    return null;
  }
  const fyShort = String(fy).slice(2);
  const url = `https://www.conagrabrands.com/files/events/${filed}/Q${q}FY${fyShort}-Earnings-Slides`;
  return {
    url,
    name: `Conagra Brands Q${q} FY${fy} Earnings Slides`,
  };
}

async function buildCompanyIrDeckMap(company) {
  const map = new Map();
  if (company?.ticker === 'CAG') return map;
  try {
    const { getCompanyIrSites } = await import('../market.service.js');
    const candidates = await getCompanyIrSites(company.ticker);
    const candidateProbes = await Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        alive: await probeIrSiteAlive(candidate.url),
      }))
    );
    const aliveCandidates = candidateProbes
      .filter((p) => p.alive)
      .map((p) => p.candidate)
      .sort((a, b) => (a.kind === 'ir' ? -1 : (b.kind === 'ir' ? 1 : 0)));

    for (const candidate of aliveCandidates) {
      const q4Map = await getQ4EventDeckMap(candidate.url);
      if (q4Map.size) {
        for (const [key, value] of q4Map) {
          if (!map.has(key)) map.set(key, value);
        }
        break;
      }
    }

    for (let pass = 0; pass < 2 && map.size === 0; pass += 1) {
      for (const candidate of aliveCandidates.slice(0, 2)) {
        let links = [];
        let base = candidate.url;
        if (candidate.kind === 'website') {
          const pageUrls = await getMainSiteIrPageUrls(candidate.url);
          const crawlQueue = pageUrls.slice(0, 3);
          const visited = new Set();
          const triedOrigins = new Set();
          let fetches = 0;
          while (crawlQueue.length && fetches < 5) {
            const pageUrl = crawlQueue.shift();
            if (visited.has(pageUrl)) continue;
            visited.add(pageUrl);
            try {
              const origin = new URL(pageUrl).origin;
              if (!triedOrigins.has(origin)) {
                triedOrigins.add(origin);
                const q4Map = await getQ4EventDeckMap(origin);
                if (q4Map.size) {
                  for (const [key, value] of q4Map) {
                    if (!map.has(key)) map.set(key, value);
                  }
                  break;
                }
              }
            } catch {
              // Ignorar
            }
            fetches += 1;
            const html = await fetchIrPage(pageUrl);
            if (!html) continue;
            const pageLinks = parseIrDocumentLinks(html).map((link) => ({ ...link, base: pageUrl }));
            const hasDecks = pageLinks.some((link) => isDeckDocument(link.text, link.url)
              && extractQuarterKeys(link.text, link.url, link.year).size > 0);
            if (hasDecks) {
              links = pageLinks;
              break;
            }
            const innerUrls = extractSubpageUrls(html, pageUrl);
            for (const inner of innerUrls) {
              if (!visited.has(inner)) crawlQueue.push(inner);
            }
          }
        } else {
          links = await getIrQuarterlyLinks(candidate.url);
        }
        if (!links.length) continue;
        for (const link of links) {
          if (!isDeckDocument(link.text, link.url)) continue;
          const keys = extractQuarterKeys(link.text, link.url, link.year);
          if (!keys.size) continue;
          let absoluteUrl = link.url;
          try {
            absoluteUrl = new URL(link.url, link.base || base).href;
          } catch {
            continue;
          }
          let name = deckNameFromUrl(absoluteUrl, link.text);
          for (const key of keys) {
            if (!map.has(key)) map.set(key, { url: absoluteUrl, name });
          }
        }
        if (map.size) break;
      }
    }
  } catch {
    // Si falla la web de IR se continúa con 8-Ks
  }
  irDeckCache.set(company.ticker, { data: map, at: Date.now(), empty: map.size === 0 });
  return map;
}

export async function getCompanyIrDeckMap(company) {
  const cached = irDeckCache.get(company.ticker);
  if (cached) {
    const ttl = cached.empty ? IR_DECK_EMPTY_TTL : IR_DECK_TTL;
    if (Date.now() - cached.at < ttl) return cached.data;
  }
  const inFlight = irDeckInFlight.get(company.ticker);
  if (inFlight) return inFlight;
  const promise = buildCompanyIrDeckMap(company).finally(() => irDeckInFlight.delete(company.ticker));
  irDeckInFlight.set(company.ticker, promise);
  return promise;
}

export async function getIrDeckForFiling(company, filing) {
  if (company?.ticker === 'CAG') {
    const cagDeck = getCagDeckForFiling(filing);
    if (cagDeck) return cagDeck;
  }
  const map = await getCompanyIrDeckMap(company);
  if (!map.size) return null;
  const year = String(filing.period ?? '').slice(0, 4);
  if (!/^\d{4}$/.test(year)) return null;
  const candidates = [];
  if (String(filing.formType ?? '').includes('10-K')) {
    candidates.push(`q4${year}`, `fy${year}`, `fullyear${year}`);
    if (filing.fiscalYear) {
      candidates.push(`q4${filing.fiscalYear}`, `fy${filing.fiscalYear}`, `fullyear${filing.fiscalYear}`);
    }
  } else {
    const quarterMatch = String(filing.periodLabel ?? '').match(/Q([1-4])\s*(\d{4})/);
    const quarter = quarterMatch?.[1];
    const fy = quarterMatch?.[2];
    if (quarter) {
      if (fy) {
        candidates.push(`q${quarter}${fy}`, `q${quarter}fy${fy}`);
      }
      candidates.push(`q${quarter}${year}`, `q${quarter}fy${year}`);
    }
  }
  for (const key of candidates) {
    const hit = map.get(key);
    if (hit) return hit;
  }
  return null;
}
