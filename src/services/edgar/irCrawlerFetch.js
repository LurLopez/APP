/**
 * @fileoverview Módulo extraído de irCrawler.js.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertPublicUrl } from '../../utils/ssrfGuard.js';

const execFileAsync = promisify(execFile);

const CHROME_BIN = process.env.CHROME_BIN || 'google-chrome';

export const CHROME_NO_SANDBOX = /^(1|true|yes)$/i.test(String(process.env.CHROME_NO_SANDBOX || '').trim());

const CHROME_SANDBOX_ARGS = CHROME_NO_SANDBOX ? ['--no-sandbox'] : [];

export const IR_BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

export const IR_DECK_TTL = 12 * 60 * 60 * 1000;

export const IR_DECK_EMPTY_TTL = 5 * 60 * 1000;

export const irDeckCache = new Map();

export const irDeckInFlight = new Map();

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

export function deckNameFromUrl(url, fallback) {
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
  try {
    await assertPublicUrl(url);
  } catch {
    return null;
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let html = null;
    try {
      const { stdout } = await execFileAsync(CHROME_BIN, [
        '--headless=new',
        '--disable-gpu',
        ...CHROME_SANDBOX_ARGS,
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
    await assertPublicUrl(url);
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
  try {
    await assertPublicUrl(irSite);
  } catch {
    return map;
  }
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
