/**
 * @fileoverview Seguimiento de periodos y volcado de hechos al mapa de series (extraído de factsSeries.js).
 */

import { CONCEPTS, FLOW_KEYS, INSTANT_KEYS, NON_ADDITIVE_KEYS, normalizeConceptValue, classifyFrame } from './statementConcepts.js';
import { pickConceptData, durationDays, annualYearOf } from './factsSeries.core.js';

const flowKeys = FLOW_KEYS;
const instantKeys = INSTANT_KEYS;
const nonAdditiveKeys = NON_ADDITIVE_KEYS;

export function createPeriodTracker(rows) {
    const setPeriodEnd = (row, end) => {
      if (typeof end !== 'string') return;
      row.periodEndCounts ??= new Map();
      row.periodEndCounts.set(end, (row.periodEndCounts.get(end) ?? 0) + 1);
      let best = null;
      for (const [candidate, count] of row.periodEndCounts) {
        if (best === null || count > row.periodEndCounts.get(best) || (count === row.periodEndCounts.get(best) && candidate > best)) {
          best = candidate;
        }
      }
      row.periodEnd = best;
    };
  
    const setPeriodStart = (row, start) => {
      if (typeof start === 'string' && (!row.periodStart || start < row.periodStart)) row.periodStart = start;
    };
  
    const ensureRow = (key, series, sortKey) => {
      if (!rows.has(key)) {
        rows.set(key, { series, sortKey, period: key, periodStart: null, periodEnd: null, values: {} });
      }
      return rows.get(key);
    };
  
    const durationDays = (start, end) => {
      if (typeof start !== 'string' || typeof end !== 'string') return null;
      const startMs = Date.parse(`${start}T00:00:00Z`);
      const endMs = Date.parse(`${end}T00:00:00Z`);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
      return Math.round((endMs - startMs) / 86400000);
    };
  
    const annualYearOf = (end) => {
      if (typeof end !== 'string' || end.length < 4) return null;
      const year = Number(end.slice(0, 4));
      const month = Number(end.slice(5, 7));
      if (!Number.isFinite(year)) return null;
      return Number.isFinite(month) && month <= 2 ? year - 1 : year;
    };

  return { setPeriodEnd, setPeriodStart, ensureRow };
}

export function applyFrameEntries(facts, tracker) {
  for (const concept of CONCEPTS) {
    const unitData = pickConceptData(facts, concept);
    if (!unitData) continue;

    for (const entry of unitData) {
        if (!entry.frame) continue;
        const classified = classifyFrame(entry.frame);
        if (!classified) continue;
        if (classified.series === 'annual' && entry.fp && entry.fp !== 'FY' && entry.form && entry.form !== '10-K') continue;
        const row = tracker.ensureRow(classified.key, classified.series, classified.sortKey);
        if (concept.namespace !== 'dei') {
          tracker.setPeriodEnd(row, entry.end);
          tracker.setPeriodStart(row, entry.start);
        }
        row.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
    }
  }
}

export function applyNonFrameEntries(facts, tracker, annualRows, quarterlyRows) {
  for (const concept of CONCEPTS) {
      if (concept.namespace === 'dei') continue;
      const unitData = pickConceptData(facts, concept);
      if (!unitData) continue;
  
      for (const entry of unitData) {
        if (entry.frame) continue;
        const days = durationDays(entry.start, entry.end);
  
        // Un hecho de más de ~13 meses (p. ej. "costes incurridos desde el inicio del plan") no es
        // un ejercicio anual: no debe crear filas anuales ni contaminar las existentes.
        if ((entry.fp === 'FY' || (days !== null && days >= 300)) && (days === null || days <= 400)) {
          const target = annualRows.find((row) => row.periodEnd === entry.end)
            ?? annualRows.find((row) => row.periodStart === entry.start && row.periodEnd === null)
            ?? null;
          if (target) {
            if (target.values[concept.key] === undefined) target.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
            continue;
          }
          const year = annualYearOf(entry.end);
          if (year === null) continue;
          const annualRow = tracker.ensureRow(String(year), 'annual', year * 10);
          tracker.setPeriodEnd(annualRow, entry.end);
          tracker.setPeriodStart(annualRow, entry.start);
          if (annualRow.values[concept.key] === undefined) annualRow.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
          continue;
        }
  
        if (instantKeys.has(concept.key)) {
          const target = quarterlyRows.find((row) => row.periodEnd === entry.end)
            ?? annualRows.find((row) => row.periodEnd === entry.end);
          if (target && target.values[concept.key] === undefined) {
            target.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
          }
          continue;
        }
  
        if (flowKeys.has(concept.key)) {
          if (days !== null && days >= 70 && days <= 115) {
            const target = quarterlyRows.find((row) => row.periodEnd === entry.end);
            if (target && target.values[concept.key] === undefined) {
              target.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
            }
          } else if (days !== null && days >= 150 && days <= 290) {
            const target = quarterlyRows.find((row) => row.periodEnd === entry.end);
            if (target) {
              target.ytdValues ??= {};
              if (target.ytdValues[concept.key] === undefined) {
                target.ytdValues[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
              }
            }
          }
        }
      }
  }
}

export function deriveMissingQuarters(facts, annualRows, rows, tracker) {
  const conceptByKey = new Map(CONCEPTS.map((concept) => [concept.key, concept]));
  const flowKeys = FLOW_KEYS;
  const instantKeys = INSTANT_KEYS;
  const nonAdditiveKeys = NON_ADDITIVE_KEYS;
  applyInstantAnnualValues(facts, annualRows);
  applyDeiAnnualValues(facts, annualRows, tracker);
  applyQuarterDerivations(annualRows, rows, flowKeys, instantKeys, nonAdditiveKeys, conceptByKey);
}

function applyInstantAnnualValues(facts, annualRows) {
    for (const concept of CONCEPTS) {
      if (!instantKeys.has(concept.key)) continue;
      const unitData = pickConceptData(facts, concept);
      if (!unitData) continue;
      for (const entry of unitData) {
        if (entry.frame) {
          if (!/^CY\d{4}Q[1-4]I$/.test(entry.frame)) continue;
        } else if (entry.fp !== 'FY' || typeof entry.end !== 'string') {
          continue;
        }
        const target = entry.end ? annualRows.find((row) => row.periodEnd === entry.end) : null;
        if (!target) continue;
        if (target.values[concept.key] === undefined || entry.frame?.endsWith('Q4I')) {
          target.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
        }
      }
    }
}

function applyDeiAnnualValues(facts, annualRows, tracker) {
    for (const concept of CONCEPTS) {
      if (concept.namespace !== 'dei') continue;
      const unitData = pickConceptData(facts, concept);
      if (!unitData) continue;
      for (const entry of unitData) {
        if (entry.frame) {
          const classified = classifyFrame(entry.frame);
          if (classified) {
            const row = tracker.ensureRow(classified.key, classified.series, classified.sortKey);
            if (row.values[concept.key] === undefined) row.values[concept.key] = normalizeConceptValue(concept, entry.val);
          }
        }
        if (entry.fp !== 'FY') continue;
        const target = annualRows
          .filter((row) => !row.periodEnd || !entry.end || row.periodEnd <= entry.end)
          .sort((a, b) => String(b.periodEnd ?? '').localeCompare(String(a.periodEnd ?? '')))[0];
        if (target) {
          if (target.values[concept.key] === undefined) target.values[concept.key] = normalizeConceptValue(concept, entry.val);
        } else if (typeof entry.end === 'string' && entry.end.length >= 4) {
          const year = Number.isFinite(Number(entry.fy)) ? String(entry.fy) : entry.end.slice(0, 4);
          const annualRow = tracker.ensureRow(year, 'annual', Number(year) * 10);
          if (annualRow.values[concept.key] === undefined) annualRow.values[concept.key] = normalizeConceptValue(concept, entry.val);
        }
      }
    }
}

function applyQuarterDerivations(annualRows, rows, flowKeys, instantKeys, nonAdditiveKeys, conceptByKey) {
    for (const annualRow of annualRows) {
      if (!annualRow.periodEnd) continue;
      const quartersUpToAnnual = [...rows.values()]
        .filter((row) => row.series === 'quarterly' && row.periodEnd && row.periodEnd <= annualRow.periodEnd)
        .sort((a, b) => String(a.periodEnd).localeCompare(String(b.periodEnd)));
      const fiscalQuarters = quartersUpToAnnual.slice(-4);
      if (fiscalQuarters.length !== 4) continue;
      const [q1, q2, q3, q4] = fiscalQuarters;
      if (q4.periodEnd !== annualRow.periodEnd) continue;
  
      for (const key of flowKeys) {
        if (nonAdditiveKeys.has(key)) continue;
  
        if (q2.values[key] === undefined && q2.ytdValues?.[key] !== undefined && q1.values[key] !== undefined) {
          const res = Number(q2.ytdValues[key]) - Number(q1.values[key]);
          if (Number.isFinite(res)) q2.values[key] = Math.round(res * 1e6) / 1e6;
        }
  
        if (q3.values[key] === undefined && q3.ytdValues?.[key] !== undefined) {
          if (q2.ytdValues?.[key] !== undefined) {
            const res = Number(q3.ytdValues[key]) - Number(q2.ytdValues[key]);
            if (Number.isFinite(res)) q3.values[key] = Math.round(res * 1e6) / 1e6;
          } else if (q1.values[key] !== undefined && q2.values[key] !== undefined) {
            const res = Number(q3.ytdValues[key]) - Number(q1.values[key]) - Number(q2.values[key]);
            if (Number.isFinite(res)) q3.values[key] = Math.round(res * 1e6) / 1e6;
          }
        }
  
        if (q4.values[key] === undefined && annualRow.values[key] !== undefined) {
          if (q3.ytdValues?.[key] !== undefined) {
            const res = Number(annualRow.values[key]) - Number(q3.ytdValues[key]);
            if (Number.isFinite(res)) q4.values[key] = Math.round(res * 1e6) / 1e6;
          } else if (q1.values[key] !== undefined && q2.values[key] !== undefined && q3.values[key] !== undefined) {
            const res = Number(annualRow.values[key]) - Number(q1.values[key]) - Number(q2.values[key]) - Number(q3.values[key]);
            if (Number.isFinite(res)) q4.values[key] = Math.round(res * 1e6) / 1e6;
          }
        }
      }
  
      const cumulative = Boolean(q1.periodStart && q2.periodStart) && q1.periodStart === q2.periodStart;
      for (const [key, annualValue] of Object.entries(annualRow.values)) {
        if (q4.values[key] !== undefined) continue;
        if (annualValue === null || annualValue === undefined) continue;
        const concept = conceptByKey.get(key);
        if (!concept || concept.namespace === 'dei') continue;
        if (instantKeys.has(key)) {
          q4.values[key] = annualValue;
          continue;
        }
        if (key === 'dividendPerShare') {
          const defaultQDiv = Math.round((Number(annualValue) / 4) * 10000) / 10000;
          if (q1.values[key] === undefined) q1.values[key] = defaultQDiv;
          if (q2.values[key] === undefined) q2.values[key] = defaultQDiv;
          if (q3.values[key] === undefined) q3.values[key] = defaultQDiv;
          q4.values[key] = q3.values.dividendPerShare ?? q2.values.dividendPerShare ?? q1.values.dividendPerShare ?? defaultQDiv;
          continue;
        }
        if (key === 'epsDiluted' || key === 'epsBasic') {
          const a = Number(q1.values[key]) || 0;
          const b = Number(q2.values[key]) || 0;
          const c = Number(q3.values[key]) || 0;
          q4.values[key] = Math.round((Number(annualValue) - a - b - c) * 100) / 100;
          continue;
        }
        if (!flowKeys.has(key) || nonAdditiveKeys.has(key)) continue;
        if (cumulative) {
          if (q3.values[key] === undefined) continue;
          const result = Number(annualValue) - Number(q3.values[key]);
          if (Number.isFinite(result)) q4.values[key] = Math.round(result * 1e6) / 1e6;
          continue;
        }
        const a = Number(q1.values[key]);
        const b = Number(q2.values[key]);
        const c = Number(q3.values[key]);
        if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) continue;
        const result = Number(annualValue) - a - b - c;
        if (Number.isFinite(result)) q4.values[key] = Math.round(result * 1e6) / 1e6;
      }
    }
}

export function fillCashBeginning(all) {
    const annualAscending = all.filter((row) => row.series === 'annual').sort((a, b) => a.sortKey - b.sortKey);
    for (let index = 1; index < annualAscending.length; index += 1) {
      const row = annualAscending[index];
      if (row.values.cashBeginning !== undefined) continue;
      const previous = annualAscending[index - 1]?.values?.cashEnding;
      if (Number.isFinite(Number(previous))) row.values.cashBeginning = Number(previous);
    }
    const quarterlyAscending = all.filter((row) => row.series === 'quarterly').sort((a, b) => a.sortKey - b.sortKey);
    for (let index = 1; index < quarterlyAscending.length; index += 1) {
      const row = quarterlyAscending[index];
      if (row.values.cashBeginning !== undefined) continue;
      const previous = quarterlyAscending[index - 1]?.values?.cashEnding;
      if (Number.isFinite(Number(previous))) row.values.cashBeginning = Number(previous);
    }
}
