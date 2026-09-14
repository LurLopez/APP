/**
 * @fileoverview Construcción y desacumulación de series temporales trimestrales y anuales a partir de Company Facts.
 * @module services/edgar/factsSeries
 */

import {
  CONCEPTS,
  FLOW_KEYS,
  INSTANT_KEYS,
  NON_ADDITIVE_KEYS,
  normalizeConceptValue,
  classifyFrame,
} from './statementConcepts.js';
import {
  calculateUnusualTotal,
  calculateNormalizedNetIncomeAndEps,
} from './rederiveStatements.js';

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

export function buildSeries(facts) {
  const rows = new Map();

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

  for (const concept of CONCEPTS) {
    const unitData = pickConceptData(facts, concept);
    if (!unitData) continue;

    for (const entry of unitData) {
      if (!entry.frame) continue;
      const classified = classifyFrame(entry.frame);
      if (!classified) continue;
      if (classified.series === 'annual' && entry.fp && entry.fp !== 'FY' && entry.form && entry.form !== '10-K') continue;
      const row = ensureRow(classified.key, classified.series, classified.sortKey);
      if (concept.namespace !== 'dei') {
        setPeriodEnd(row, entry.end);
        setPeriodStart(row, entry.start);
      }
      row.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
    }
  }

  const conceptByKey = new Map(CONCEPTS.map((concept) => [concept.key, concept]));
  const flowKeys = FLOW_KEYS;
  const instantKeys = INSTANT_KEYS;
  const nonAdditiveKeys = NON_ADDITIVE_KEYS;

  const annualRows = [...rows.values()].filter((row) => row.series === 'annual');
  const quarterlyRows = [...rows.values()].filter((row) => row.series === 'quarterly');

  for (const concept of CONCEPTS) {
    if (concept.namespace === 'dei') continue;
    const unitData = pickConceptData(facts, concept);
    if (!unitData) continue;

    for (const entry of unitData) {
      if (entry.frame) continue;
      const days = durationDays(entry.start, entry.end);

      if (entry.fp === 'FY' || (days !== null && days >= 300)) {
        const target = annualRows.find((row) => row.periodEnd === entry.end)
          ?? annualRows.find((row) => row.periodStart === entry.start && row.periodEnd === null)
          ?? null;
        if (target) {
          if (target.values[concept.key] === undefined) target.values[concept.key] = normalizeConceptValue(concept, entry.val, entry.tag);
          continue;
        }
        const year = annualYearOf(entry.end);
        if (year === null) continue;
        const annualRow = ensureRow(String(year), 'annual', year * 10);
        setPeriodEnd(annualRow, entry.end);
        setPeriodStart(annualRow, entry.start);
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

  for (const concept of CONCEPTS) {
    if (concept.namespace !== 'dei') continue;
    const unitData = pickConceptData(facts, concept);
    if (!unitData) continue;
    for (const entry of unitData) {
      if (entry.frame) {
        const classified = classifyFrame(entry.frame);
        if (classified) {
          const row = ensureRow(classified.key, classified.series, classified.sortKey);
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
        const annualRow = ensureRow(year, 'annual', Number(year) * 10);
        if (annualRow.values[concept.key] === undefined) annualRow.values[concept.key] = normalizeConceptValue(concept, entry.val);
      }
    }
  }

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

  const all = [...rows.values()]
    .filter((row) => row.periodEnd !== null && row.periodEnd !== undefined)
    .sort((a, b) => b.sortKey - a.sortKey);
  const annual = all.filter((row) => row.series === 'annual');
  const quarterly = all.filter((row) => row.series === 'quarterly');

  const sumValues = (values, keys) => {
    const available = keys
      .map((key) => Number(values[key]))
      .filter((value) => Number.isFinite(value));
    return available.length ? available.reduce((sum, value) => sum + value, 0) : undefined;
  };

  const setDerived = (values, key, calculate) => {
    if (values[key] !== undefined) return;
    const result = calculate(values);
    if (Number.isFinite(result)) values[key] = Math.round(result * 1e6) / 1e6;
  };

  all.forEach((row) => {
    const values = row.values;

    if (values.revenue === undefined && values.grossProfit !== undefined && values.costOfRevenue !== undefined) {
      values.revenue = Math.round((Number(values.grossProfit) - Number(values.costOfRevenue)) * 1e6) / 1e6;
    } else if (values.costOfRevenue === undefined && values.revenue !== undefined && values.grossProfit !== undefined) {
      values.costOfRevenue = Math.round((Number(values.grossProfit) - Number(values.revenue)) * 1e6) / 1e6;
    }

    setDerived(values, 'grossProfit', (data) => sumValues(data, ['revenue', 'costOfRevenue']));

    const unusualNet = calculateUnusualTotal(values);
    const nonOpKeys = ['interestExpense', 'interestIncome', 'equityMethodIncome', 'foreignCurrencyGainLoss', 'otherNonoperatingIncome'];
    const nonOpTotal = sumValues(values, nonOpKeys) || 0;

    if (values.pretaxIncome === undefined && values.ebtIncludingUnusual !== undefined) {
      values.pretaxIncome = values.ebtIncludingUnusual - unusualNet;
    }
    if (values.operatingIncome === undefined) {
      if (values.pretaxIncome !== undefined) {
        values.operatingIncome = values.pretaxIncome - nonOpTotal;
      } else if (values.grossProfit !== undefined && values.operatingExpenses !== undefined) {
        values.operatingIncome = values.grossProfit - values.operatingExpenses;
      }
    }
    if (values.operatingExpenses === undefined && values.grossProfit !== undefined && values.operatingIncome !== undefined) {
      values.operatingExpenses = values.operatingIncome - values.grossProfit;
    }
    if (values.sellingGeneralAdmin === undefined && values.operatingExpenses !== undefined) {
      values.sellingGeneralAdmin = values.operatingExpenses - (Number(values.researchDevelopment) || 0) - (Number(values.amortizationGoodwillIntangibles) || 0) - (Number(values.otherOperatingExpenses) || 0);
    }
    setDerived(values, 'operatingIncomeAdjusted', (data) => {
      let expense = 0;
      if (data.interestExpense !== undefined && Number.isFinite(Number(data.interestExpense))) {
        expense = Math.abs(Number(data.interestExpense));
      }
      let income = 0;
      if (data.interestIncome !== undefined && Number.isFinite(Number(data.interestIncome))) {
        income = Math.abs(Number(data.interestIncome));
      }
      const netInterest = expense - income;

      if (data.pretaxIncome !== undefined && Number.isFinite(Number(data.pretaxIncome))) {
        return Number(data.pretaxIncome) + netInterest;
      }
      if (data.ebtIncludingUnusual !== undefined && Number.isFinite(Number(data.ebtIncludingUnusual))) {
        const unusual = calculateUnusualTotal(data);
        return (Number(data.ebtIncludingUnusual) - unusual) + netInterest;
      }
      if (data.operatingIncome !== undefined && Number.isFinite(Number(data.operatingIncome))) {
        const unusual = calculateUnusualTotal(data);
        return Number(data.operatingIncome) - unusual;
      }
      return undefined;
    });
    setDerived(values, 'ebtIncludingUnusual', (data) => sumValues(data, ['pretaxIncome', 'mergerRestructuringCharges', 'goodwillImpairment', 'gainLossOnInvestments', 'gainLossOnAssets', 'assetImpairment', 'insuranceSettlements', 'legalSettlements', 'otherUnusualItems']));

    setDerived(values, 'incomeFromContinuingOps', (data) => sumValues(data, ['ebtIncludingUnusual', 'incomeTax']));
    setDerived(values, 'netIncome', (data) => sumValues(data, ['incomeFromContinuingOps', 'discontinuedOperations']));
    setDerived(values, 'netIncomeToCommonIncludingUnusual', (data) => {
      const netIncome = Number(data.netIncome);
      const minority = Number(data.minorityInterestIncome) || 0;
      const pref = Number(data.preferredDividendsOtherAdjustments) || 0;
      return Number.isFinite(netIncome) ? netIncome + minority + pref : undefined;
    });
    setDerived(values, 'netIncomeToCommonExcludingUnusual', (data) => {
      const res = calculateNormalizedNetIncomeAndEps(data);
      return res.netIncomeAdjusted;
    });
    setDerived(values, 'epsDilutedNormalized', (data) => {
      const res = calculateNormalizedNetIncomeAndEps(data);
      return res.epsNormalized;
    });
    setDerived(values, 'ebitda', (data) => {
      const dep = Number.isFinite(Number(data.depreciationAmortizationTotal))
        ? Number(data.depreciationAmortizationTotal)
        : ((Number(data.depreciation) || 0) + Math.abs(Number(data.cashflowAmortizationGoodwillIntangibles) || 0));
      const opInc = Number(data.operatingIncome);
      const nonCashOperatingCharges = Math.abs(Number(data.goodwillImpairment) || 0)
        + Math.abs(Number(data.assetImpairment) || 0);
      return Number.isFinite(opInc) ? opInc + dep + nonCashOperatingCharges : undefined;
    });
    setDerived(values, 'ebitdaNormalized', (data) => {
      const ebitda = Number(data.ebitda);
      if (!Number.isFinite(ebitda)) return undefined;
      const rawMr = Math.abs(Number(data.mergerRestructuringCharges) || 0);
      const gw = Math.abs(Number(data.goodwillImpairment) || 0);
      const as = Math.abs(Number(data.assetImpairment) || 0);
      const imp = gw + as;
      const pureMr = rawMr > imp ? (rawMr - imp) : (imp > 0 ? 0 : rawMr);
      return ebitda + pureMr;
    });
    setDerived(values, 'ebitdar', (data) => Number.isFinite(Number(data.ebitda)) && Number.isFinite(Number(data.rentExpense))
      ? Number(data.ebitda) - Number(data.rentExpense)
      : undefined);

    setDerived(values, 'cashAndShortTermInvestments', (data) => sumValues(data, ['cash', 'shortTermInvestments']));
    setDerived(values, 'totalReceivables', (data) => sumValues(data, ['receivables', 'otherReceivables']));
    setDerived(values, 'propertyPlantEquipment', (data) => {
      const gross = Number(data.propertyPlantEquipmentGross);
      const dep = data.accumulatedDepreciation !== undefined ? Math.abs(Number(data.accumulatedDepreciation)) : undefined;
      return Number.isFinite(gross) && Number.isFinite(dep) ? gross - dep : undefined;
    });
    setDerived(values, 'propertyPlantEquipmentGross', (data) => {
      const net = Number(data.propertyPlantEquipment);
      const dep = data.accumulatedDepreciation !== undefined ? Math.abs(Number(data.accumulatedDepreciation)) : undefined;
      return Number.isFinite(net) && Number.isFinite(dep) ? net + dep : undefined;
    });
    setDerived(values, 'accumulatedDepreciation', (data) => {
      const gross = Number(data.propertyPlantEquipmentGross);
      const net = Number(data.propertyPlantEquipment);
      return Number.isFinite(gross) && Number.isFinite(net) && gross >= net ? -(gross - net) : undefined;
    });
    setDerived(values, 'assetsNoncurrent', (data) => Number.isFinite(Number(data.assets)) && Number.isFinite(Number(data.currentAssets))
      ? Number(data.assets) - Number(data.currentAssets)
      : undefined);
    setDerived(values, 'commonStock', (data) => {
      if (!Number.isFinite(Number(data.commonEquity))) return undefined;
      const apic = Number(data.additionalPaidInCapital) || 0;
      const re = Number(data.retainedEarnings) || 0;
      const ts = Number(data.treasuryStock) || 0;
      const aoci = Number(data.accumulatedOtherComprehensiveIncome) || 0;
      const diff = Number(data.commonEquity) - (apic + re + ts + aoci);
      return Number.isFinite(diff) && diff > 0 ? diff : undefined;
    });
    setDerived(values, 'commonEquity', (data) => Number.isFinite(Number(data.equity))
      ? Number(data.equity) - (Number.isFinite(Number(data.minorityInterest)) ? Number(data.minorityInterest) : 0)
      : undefined);
    setDerived(values, 'equity', (data) => sumValues(data, ['commonEquity', 'minorityInterest']));
    setDerived(values, 'liabilities', (data) => Number.isFinite(Number(data.assets)) && Number.isFinite(Number(data.equity))
      ? Number(data.assets) - Number(data.equity)
      : undefined);
    setDerived(values, 'liabilitiesNoncurrent', (data) => Number.isFinite(Number(data.liabilities)) && Number.isFinite(Number(data.currentLiabilities))
      ? Number(data.liabilities) - Number(data.currentLiabilities)
      : undefined);
    setDerived(values, 'liabilitiesAndEquity', (data) => sumValues(data, ['liabilities', 'equity']) ?? data.assets);
    setDerived(values, 'tangibleBookValue', (data) => {
      const commonEquity = Number(data.commonEquity);
      if (!Number.isFinite(commonEquity)) return undefined;
      return commonEquity - (Number(data.goodwill) || 0) - (Number(data.otherIntangibleAssets) || 0);
    });
    setDerived(values, 'totalDebt', (data) => {
      const toNum = (v) => (v === undefined || v === null) ? null : Number(v);
      const ltd = toNum(data.longTermDebt);
      const stl = toNum(data.shortTermLoans);
      const ltdc = toNum(data.longTermDebtCurrent);
      const parts = [ltd, stl, ltdc].filter((v) => v !== null && Number.isFinite(v));
      return parts.length ? parts.reduce((a, b) => a + b, 0) : undefined;
    });
    setDerived(values, 'netDebt', (data) => Number.isFinite(Number(data.totalDebt)) && Number.isFinite(Number(data.cashAndShortTermInvestments ?? data.cash))
      ? Number(data.totalDebt) - Number(data.cashAndShortTermInvestments ?? data.cash)
      : undefined);
    if (values.sharesOutstanding === undefined || !Number(values.sharesOutstanding)) {
      values.sharesOutstanding = values.weightedSharesDiluted ?? values.weightedSharesBasic;
    }
    setDerived(values, 'bookValuePerShare', (data) => Number.isFinite(Number(data.commonEquity)) && Number(data.sharesOutstanding) > 0
      ? Number(data.commonEquity) / Number(data.sharesOutstanding)
      : undefined);
    setDerived(values, 'tangibleBookValuePerShare', (data) => Number.isFinite(Number(data.tangibleBookValue)) && Number(data.sharesOutstanding) > 0
      ? Number(data.tangibleBookValue) / Number(data.sharesOutstanding)
      : undefined);
    setDerived(values, 'dividendPerShare', (data) => {
      if (data.dividendsCommon === undefined) return undefined;
      const divCommon = Math.abs(Number(data.dividendsCommon));
      const shares = Number(data.sharesOutstanding || data.weightedSharesDiluted || data.weightedSharesBasic);
      if (shares > 0 && Number.isFinite(divCommon)) {
        return Math.round((divCommon / shares) * 10000) / 10000;
      }
      return undefined;
    });

    setDerived(values, 'workingCapitalChange', (data) => {
      const parts = [data.changeAccountsReceivable, data.changeInventory, data.changeAccountsPayable, data.changeOtherOperatingAssets];
      if (parts.some((v) => v !== undefined && Number.isFinite(Number(v)))) {
        return Math.round(parts.reduce((sum, v) => sum + (Number.isFinite(Number(v)) ? Number(v) : 0), 0) * 1e6) / 1e6;
      }
      return undefined;
    });

    setDerived(values, 'cfi', (data) => sumValues(data, ['capex', 'salePPE', 'acquisitions', 'divestitures', 'securitiesInvesting', 'loansInvesting', 'otherInvestingActivities']));
    setDerived(values, 'cff', (data) => sumValues(data, ['debtIssued', 'debtPaid', 'commonStockIssued', 'buybacks', 'dividendsCommon', 'dividendsPreferred', 'otherFinancingActivities']));
    setDerived(values, 'netChangeInCash', (data) => sumValues(data, ['cfo', 'cfi', 'cff', 'fx']));
    setDerived(values, 'freeCashFlow', (data) => sumValues(data, ['cfo', 'capex']));
    setDerived(values, 'cashEnding', (data) => data.cash);
    setDerived(values, 'cashBeginning', (data) => Number.isFinite(Number(data.cashEnding)) && Number.isFinite(Number(data.netChangeInCash))
      ? Number(data.cashEnding) - Number(data.netChangeInCash)
      : undefined);
    setDerived(values, 'cashFlowPerShare', (data) => Number.isFinite(Number(data.freeCashFlow)) && Number(data.weightedSharesDiluted) > 0
      ? Number(data.freeCashFlow) / Number(data.weightedSharesDiluted)
      : undefined);
  });

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

  all.forEach((row) => {
    delete row.periodEndCounts;
  });

  return { annual, quarterly };
}
