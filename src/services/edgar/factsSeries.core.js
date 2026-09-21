/**
 * @fileoverview Módulo extraído de factsSeries.js.
 */

import { CONCEPTS, FLOW_KEYS, INSTANT_KEYS, NON_ADDITIVE_KEYS, normalizeConceptValue, classifyFrame } from './statementConcepts.js';
import { calculateUnusualTotal, calculateNormalizedNetIncomeAndEps } from './rederiveStatements.js';
import { createPeriodTracker, applyFrameEntries, applyNonFrameEntries, deriveMissingQuarters, fillCashBeginning } from './factsSeriesRows.js';
import { deriveRowMetrics } from './factsSeriesDerive.js';
import { normalizeShareUnits } from './sharesHarmonizer.js';


export function combineConceptData(namespaceFacts, tags, unit) {
  const byFrame = new Map();
  for (const tag of tags) {
    const unitData = namespaceFacts[tag]?.units?.[unit];
    if (!Array.isArray(unitData)) continue;
    const latestPerFrame = new Map();
    for (const entry of unitData) {
      if (!entry.frame || !classifyFrame(entry.frame)) continue;
      const current = latestPerFrame.get(entry.frame);
      if (!current || (entry.filed ?? '') > (current.filed ?? '')) latestPerFrame.set(entry.frame, entry);
    }
    for (const [frame, entry] of latestPerFrame) {
      const existing = byFrame.get(frame);
      byFrame.set(frame, {
        frame,
        val: (existing ? existing.val : 0) + Number(entry.val),
        end: entry.end,
        fp: entry.fp,
        form: entry.form,
      });
    }
  }
  if (!byFrame.size) return null;
  return [...byFrame.values()];
}

export function pickConceptData(facts, concept) {
  if (!Array.isArray(concept.tags) || !concept.tags.length) return null;
  const namespaceFacts = facts?.facts?.[concept.namespace ?? 'us-gaap'] ?? {};
  const combineSet = new Set(concept.combine ?? []);

  const combined = combineSet.size
    ? combineConceptData(namespaceFacts, [...combineSet], concept.unit)
    : null;

  const bestByFrame = new Map();
  const noFrameEntries = [];

  concept.tags.forEach((tag, tagIndex) => {
    if (combineSet.has(tag)) return;
    const unitData = namespaceFacts[tag]?.units?.[concept.unit];
    if (!Array.isArray(unitData)) return;
    for (const entry of unitData) {
      if (!entry.tag) entry.tag = tag;
      if (!entry.frame) {
        noFrameEntries.push(entry);
        continue;
      }
      const current = bestByFrame.get(entry.frame);
      const isBetter = !current
        || (Number(current.entry.val) === 0 && Number(entry.val) !== 0)
        || (Number(entry.val) !== 0 && tagIndex < current.tagIndex)
        || (tagIndex === current.tagIndex && (entry.filed ?? '') > (current.entry.filed ?? ''));
      if (isBetter) {
        bestByFrame.set(entry.frame, { entry, tagIndex });
      }
    }
  });

  const result = [];
  const combinedMap = new Map((combined ?? []).map((item) => [item.frame, item]));
  for (const [frame, { entry }] of bestByFrame.entries()) {
    if (!combinedMap.has(frame)) result.push(entry);
  }
  result.push(...combinedMap.values());
  result.push(...noFrameEntries);
  result.sort((a, b) => String(a.filed ?? '').localeCompare(String(b.filed ?? '')));
  return result.length ? result : null;
}




export function durationDays(start, end) {
  if (typeof start !== 'string' || typeof end !== 'string') return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.round((endMs - startMs) / 86400000);
}

export function annualYearOf(end) {
  if (typeof end !== 'string' || end.length < 4) return null;
  const year = Number(end.slice(0, 4));
  const month = Number(end.slice(5, 7));
  if (!Number.isFinite(year)) return null;
  return Number.isFinite(month) && month <= 2 ? year - 1 : year;
}

export function buildSeries(facts) {
  const rows = new Map();
  const tracker = createPeriodTracker(rows);

  applyFrameEntries(facts, tracker);

  const annualRows = [...rows.values()].filter((row) => row.series === 'annual');
  const quarterlyRows = [...rows.values()].filter((row) => row.series === 'quarterly');

  applyNonFrameEntries(facts, tracker, annualRows, quarterlyRows);
  deriveMissingQuarters(facts, annualRows, rows, tracker);

  const all = [...rows.values()]
    .filter((row) => row.periodEnd !== null && row.periodEnd !== undefined)
    .sort((a, b) => b.sortKey - a.sortKey);
  const annual = all.filter((row) => row.series === 'annual');
  const quarterly = all.filter((row) => row.series === 'quarterly');

  normalizeShareUnits(annual, quarterly);
  deriveRowMetrics(all);
  fillCashBeginning(all);
  all.forEach((row) => {
    delete row.periodEndCounts;
  });

  return { annual, quarterly };
}
