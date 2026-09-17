/**
 * @fileoverview Extracción, mapeo y consolidación de hechos contables detallados desde archivos XBRL de instancia.
 * @module services/edgar/instanceFacts
 */

import {
  CONCEPTS,
  INSTANT_KEYS,
  NON_ADDITIVE_KEYS,
  CONCEPT_EXTENSION,
  EXTENSION_EXCLUDED,
  normalizeConceptValue,
} from './statementConcepts.js';
import { fetchSecText } from './secClient.js';
import { getCompanyFilings } from './filingPeriods.js';
import { getFilingIndexItems } from './filingDocuments.js';

const extensionFactsCache = new Map();
const EXTENSION_FACTS_TTL = 24 * 60 * 60 * 1000;
const EXTENSION_CONCURRENCY = 3;
const EXTENSION_ANNUAL_MIN_DAYS = 300;
const EXTENSION_ANNUAL_MAX_DAYS = 400;
const EXTENSION_QUARTERLY_DIRECT_DAYS = 110;
const EXTENSION_QUARTERLY_YTD_DAYS = 370;

const conceptByTag = new Map();
for (const concept of CONCEPTS) {
  for (const tag of concept.tags ?? []) {
    const list = conceptByTag.get(tag) ?? [];
    list.push(concept);
    conceptByTag.set(tag, list);
  }
}

const INSTANCE_ONLY_TAGS = {
  CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: ['cash'],
  CashAndCashEquivalentsAtCarryingValueIncludingDiscontinuedOperations: ['cash'],
  CashCashEquivalentsAndShortTermInvestments: ['cash', 'cashAndShortTermInvestments'],
  Cash: ['cash'],
  CashEquivalentsAtCarryingValue: ['cash'],
};

export function parseInstanceFacts(xml) {
  const periods = new Map();
  const contextPattern = /<context id="([^"]+)"[^>]*>([\s\S]*?)<\/context>/g;
  let match;
  while ((match = contextPattern.exec(xml))) {
    const inner = match[2];
    const member = inner.includes('<segment>')
      ? inner.match(/xbrldi:explicitMember[^>]*>([^<]+)<\/xbrldi:explicitMember>/)?.[1] ?? ''
      : null;
    const start = inner.match(/<startDate>([^<]+)<\/startDate>/);
    const end = inner.match(/<endDate>([^<]+)<\/endDate>/);
    const instant = inner.match(/<instant>([^<]+)<\/instant>/);
    if (start?.[1] && end?.[1]) periods.set(match[1], { start: start[1], end: end[1], member });
    else if (instant?.[1]) periods.set(match[1], { start: null, end: instant[1], member });
  }

  const facts = [];
  const seen = new Set();
  const factPattern = /<([a-zA-Z0-9-]+):([A-Za-z0-9_]+)[^>]*?contextRef="([^"]+)"[^>]*?>\s*(-?\d+(?:\.\d+)?)\s*<\/\1:\2>/g;
  while ((match = factPattern.exec(xml))) {
    const period = periods.get(match[3]);
    if (!period) continue;
    const key = `${match[1]}:${match[2]}|${match[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ tag: match[2], value: Number(match[4]), start: period.start, end: period.end, member: period.member });
  }
  return facts;
}

export function aggregateSegmentedInstants(facts) {
  const nonSegmented = new Set();
  for (const fact of facts) {
    if (fact.start === null && fact.member === null) {
      nonSegmented.add(`${fact.tag}|${fact.end}`);
    }
  }
  const grouped = new Map();
  for (const fact of facts) {
    if (fact.start !== null || fact.member === null || /total|all|combined/i.test(fact.member)) continue;
    if (nonSegmented.has(`${fact.tag}|${fact.end}`)) continue;
    const key = `${fact.tag}|${fact.end}`;
    const entry = grouped.get(key) ?? { value: 0 };
    entry.value += fact.value;
    grouped.set(key, entry);
  }
  for (const [key, entry] of grouped) {
    const [tag, end] = key.split('|');
    facts.push({ tag, value: entry.value, start: null, end, member: null });
  }
}

export function matchConceptKeys(tag) {
  const exact = conceptByTag.get(tag);
  if (exact) return exact.map((concept) => concept.key);
  const instanceOnly = INSTANCE_ONLY_TAGS[tag];
  if (instanceOnly) return instanceOnly;
  if (EXTENSION_EXCLUDED.test(tag)) return null;
  let bestKey = null;
  let bestLength = 0;
  for (const [key, pattern] of Object.entries(CONCEPT_EXTENSION)) {
    if (!new RegExp(pattern, 'i').test(tag)) continue;
    if (pattern.length > bestLength) {
      bestLength = pattern.length;
      bestKey = key;
    }
  }
  return bestKey ? [bestKey] : null;
}

export async function getFilingInstanceFacts(company, filing) {
  const items = await getFilingIndexItems(company, filing);
  if (!Array.isArray(items)) return [];
  const instanceName = items
    .map((item) => item.name)
    .find((name) => typeof name === 'string' && /_htm\.xml$/i.test(name));
  if (!instanceName) return [];
  const accessionNoDashes = filing.accession.replaceAll('-', '');
  const url = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accessionNoDashes}/${instanceName}`;
  const xml = await fetchSecText(url);
  if (!xml) return [];
  const facts = parseInstanceFacts(xml);
  aggregateSegmentedInstants(facts);
  return facts;
}

export async function getExtensionFacts(company) {
  const cached = extensionFactsCache.get(company.ticker);
  if (cached && Date.now() - cached.at < EXTENSION_FACTS_TTL) return cached.data;
  const { filings } = await getCompanyFilings(company.ticker);
  const queue = [
    ...filings.filter((filing) => filing.formType === '10-K').slice(0, 8),
    ...filings.filter((filing) => filing.formType === '10-Q').slice(0, 8),
  ];
  const facts = [];
  for (let offset = 0; offset < queue.length; offset += EXTENSION_CONCURRENCY) {
    const batch = queue.slice(offset, offset + EXTENSION_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((filing) => getFilingInstanceFacts(company, filing)));
    for (const result of results) {
      if (result.status === 'fulfilled') facts.push(...result.value);
    }
    if (offset + EXTENSION_CONCURRENCY < queue.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const relevant = facts.filter((fact) => matchConceptKeys(fact.tag) !== null);
  extensionFactsCache.set(company.ticker, { data: relevant, at: Date.now() });
  return relevant;
}

export function scoreMember(member, ticker, conceptKey) {
  if (member === null || member === '') return 100;
  const m = String(member).toLowerCase();
  if (m.includes('preferred') || m.includes('noncontrolling') || m.includes('discontinued') || m.includes('parent')) return -1;

  const tick = String(ticker || '').toUpperCase();
  const isClassB = /[-.]B$/i.test(tick);
  const isClassA = /[-.]A$/i.test(tick);

  if (isClassB) {
    if (m.includes('classb') || m.includes('commonclassb')) return 95;
    if (m.includes('classa') || m.includes('commonclassa')) return 40;
  } else if (isClassA) {
    if (m.includes('classa') || m.includes('commonclassa')) return 95;
    if (m.includes('classb') || m.includes('commonclassb')) return 40;
  } else {
    if (m.includes('commonclassa') || m.includes('classacommon') || m.includes('commonstockclassa') || m.includes('classa')) return 90;
    if (m.includes('commonstock') || m.includes('commonshare') || m.includes('commonclass')) return 75;
    if (m.includes('classb') || m.includes('commonclassb')) return 50;
  }

  if (m.includes('common')) return 60;
  return 10;
}

export function isShareOrPerShareConcept(concept, key) {
  return concept?.unit === 'shares' ||
         concept?.unit === 'USD/shares' ||
         concept?.format === 'perShare' ||
         concept?.format === 'shares' ||
         key === 'sharesOutstanding' ||
         key === 'weightedSharesDiluted' ||
         key === 'weightedSharesBasic' ||
         key === 'epsDiluted' ||
         key === 'epsBasic' ||
         key === 'epsDilutedNormalized' ||
         key === 'dividendPerShare';
}

export function mergeInstanceFacts(annual, quarterly, facts, ticker = '') {
  const durationDays = (fact) => {
    if (!fact.start) return null;
    const startMs = Date.parse(`${fact.start}T00:00:00Z`);
    const endMs = Date.parse(`${fact.end}T00:00:00Z`);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    return Math.round((endMs - startMs) / 86400000);
  };

  const factsByConcept = new Map();
  for (const fact of facts) {
    const keys = matchConceptKeys(fact.tag);
    if (!keys) continue;
    for (const key of keys) {
      const list = factsByConcept.get(key) ?? [];
      list.push(fact);
      factsByConcept.set(key, list);
    }
  }

  const annualEnds = annual.map((row) => row.periodEnd).filter(Boolean).sort();

  for (const [key, conceptFacts] of factsByConcept) {
    const concept = CONCEPTS.find((item) => item.key === key);
    if (!concept) continue;
    const isPerShare = isShareOrPerShareConcept(concept, key);
    const factsByEnd = new Map();
    for (const fact of conceptFacts) {
      const list = factsByEnd.get(fact.end) ?? [];
      list.push(fact);
      factsByEnd.set(fact.end, list);
    }
    const pick = (end, minDays, maxDays) => {
      const list = factsByEnd.get(end) ?? [];
      const valid = list
        .map((fact) => ({
          fact,
          days: durationDays(fact),
          score: isPerShare ? scoreMember(fact.member, ticker, key) : (fact.member === null ? 100 : -1),
        }))
        .filter(({ fact, days, score }) => days !== null && days >= minDays && days <= maxDays && score > 0);
      if (!valid.length) return null;
      valid.sort((a, b) => b.score - a.score || b.days - a.days);
      return valid[0].fact;
    };
    const instantAt = (end) => {
      const list = factsByEnd.get(end) ?? [];
      const valid = list
        .filter((fact) => !fact.start)
        .map((fact) => ({
          fact,
          score: isPerShare ? scoreMember(fact.member, ticker, key) : (fact.member === null ? 100 : -1),
        }))
        .filter(({ score }) => score > 0);
      if (!valid.length) return null;
      valid.sort((a, b) => b.score - a.score);
      return valid[0].fact;
    };
    const valueFor = (row) => {
      const duration = pick(row.periodEnd, EXTENSION_ANNUAL_MIN_DAYS, EXTENSION_ANNUAL_MAX_DAYS);
      if (duration) return duration.value;
      const instant = instantAt(row.periodEnd);
      return instant ? instant.value : null;
    };

    for (const row of annual) {
      if (row.values[key] !== undefined || !row.periodEnd) continue;
      const value = valueFor(row);
      if (Number.isFinite(value)) row.values[key] = normalizeConceptValue(concept, value);
    }

    for (const row of quarterly) {
      if (row.values[key] !== undefined || !row.periodEnd) continue;
      const direct = pick(row.periodEnd, 0, EXTENSION_QUARTERLY_DIRECT_DAYS);
      if (direct) {
        row.values[key] = normalizeConceptValue(concept, direct.value);
        continue;
      }
      const instant = instantAt(row.periodEnd);
      if (instant) {
        row.values[key] = normalizeConceptValue(concept, instant.value);
        continue;
      }
      const ytd = pick(row.periodEnd, EXTENSION_QUARTERLY_DIRECT_DAYS + 1, EXTENSION_QUARTERLY_YTD_DAYS);
      if (!ytd) continue;
      const fiscalYearStart = annualEnds.filter((end) => end < row.periodEnd).sort().slice(-1)[0];
      if (!fiscalYearStart) {
        row.values[key] = normalizeConceptValue(concept, ytd.value);
        continue;
      }
      const previousEnd = [...factsByEnd.keys()]
        .filter((end) => end < row.periodEnd && end > fiscalYearStart)
        .sort()
        .slice(-1)[0];
      const previous = previousEnd ? pick(previousEnd, 0, EXTENSION_QUARTERLY_YTD_DAYS) : null;
      if (!previous) {
        if (key === 'dividendPerShare') {
          const days = durationDays(ytd);
          if (days && days > 180) continue;
        }
        row.values[key] = normalizeConceptValue(concept, ytd.value);
        continue;
      }
      if (INSTANT_KEYS.has(key) || NON_ADDITIVE_KEYS.has(key) || concept.unit === 'shares' || (concept.format === 'perShare' && key !== 'dividendPerShare') || concept.format === 'shares') {
        row.values[key] = normalizeConceptValue(concept, ytd.value);
        continue;
      }
      const quarterValue = ytd.value - previous.value;
      if (Number.isFinite(quarterValue)) row.values[key] = normalizeConceptValue(concept, quarterValue);
    }
  }
}
