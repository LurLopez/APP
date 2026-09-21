/**
 * @fileoverview Módulo extraído de irCrawler.js.
 */

import { assertPublicUrl } from '../../utils/ssrfGuard.js';
import { IR_BROWSER_UA, IR_DECK_TTL, IR_DECK_EMPTY_TTL, irDeckCache, irDeckInFlight, isDeckDocument, stripHtmlTags, extractQuarterKeys, deckNameFromUrl, fetchIrPage, probeIrSiteAlive, parseIrDocumentLinks, getIrQuarterlyLinks, getQ4EventDeckMap } from './irCrawlerFetch.js';

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
    await assertPublicUrl(website);
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
