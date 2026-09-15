/**
 * @fileoverview Módulo extraído de historyBuilders.js.
 */

import { parseFinancialValue, formatFinancialValue, extractIncomeTaxesPaid } from './financialParsers.js';

export function buildDividendHistoryFromEdgar(annualSeries, maxYear) {
  if (!Array.isArray(annualSeries) || !annualSeries.length) return null;
  const points = annualSeries
    .map((row) => {
      const year = Number(row?.period || (row?.periodEnd ? String(row.periodEnd).slice(0, 4) : null));
      const values = row?.values ?? {};
      const dps = Number(values.dividendPerShare);
      const rawTotal = Math.abs(Number(values.dividendsCommon ?? values.dividends));
      const eps = Number(values.epsDiluted);
      if (!Number.isFinite(year)) return null;
      const hasDps = Number.isFinite(dps) && dps > 0;
      const hasTotal = Number.isFinite(rawTotal) && rawTotal > 0;
      if (!hasDps && !hasTotal) return null;
      return {
        year,
        dps: hasDps ? Math.round(dps * 100) / 100 : null,
        total: hasTotal ? Math.round((rawTotal > 1e6 ? rawTotal / 1e6 : rawTotal) * 10) / 10 : null,
        eps: Number.isFinite(eps) ? Math.round(eps * 100) / 100 : null,
      };
    })
    .filter(Boolean)
    .filter((point) => !Number.isFinite(maxYear) || point.year <= maxYear)
    .sort((a, b) => a.year - b.year);
  const unique = [...new Map(points.map((point) => [point.year, point])).values()];
  return unique.length >= 2 ? unique.slice(-5) : null;
}

export function mergeDividendHistory(primary, fallback) {
  const map = new Map();
  [...(Array.isArray(fallback) ? fallback : [])].forEach((point) => {
    const year = Number(point?.year);
    if (Number.isFinite(year)) map.set(year, { ...point });
  });
  [...(Array.isArray(primary) ? primary : [])].forEach((point) => {
    const year = Number(point?.year);
    if (!Number.isFinite(year)) return;
    const existing = map.get(year);
    if (!existing) {
      map.set(year, { ...point });
      return;
    }
    if (existing.adjustedEps == null && point.adjustedEps != null) existing.adjustedEps = point.adjustedEps;
    if (existing.dps == null && point.dps != null) existing.dps = point.dps;
    if (existing.total == null && point.total != null) existing.total = point.total;
  });
  return [...map.values()].sort((a, b) => Number(a.year) - Number(b.year));
}

export function mergeHistoryByYear(primary, fallback) {
  const map = new Map();
  [...(Array.isArray(fallback) ? fallback : [])].forEach((point) => {
    const year = Number(point?.year);
    if (Number.isFinite(year)) map.set(year, point);
  });
  [...(Array.isArray(primary) ? primary : [])].forEach((point) => {
    const year = Number(point?.year);
    if (Number.isFinite(year) && !map.has(year)) map.set(year, point);
  });
  return [...map.values()].sort((a, b) => Number(a.year) - Number(b.year));
}

export function buildFutureProjectionText({ remainingAuthorization, averagePrice, sharesHistory }) {
  const remaining = Number(remainingAuthorization);
  const price = Number(averagePrice);
  if (!Number.isFinite(remaining) || remaining <= 0 || !Number.isFinite(price) || price <= 0) return null;
  const sharesToRepurchase = remaining / price;
  const perYear = sharesToRepurchase / 5;
  const points = [...(Array.isArray(sharesHistory) ? sharesHistory : [])]
    .map((point) => Number(point?.shares))
    .filter((value) => Number.isFinite(value) && value > 0);
  const lastShares = points.length ? points[points.length - 1] : null;
  const annualPct = lastShares ? (perYear / lastShares) * 100 : null;
  const bpaPct = annualPct != null ? (annualPct / (100 - annualPct)) * 100 : null;
  const fmt = (value) => String(value.toFixed(1)).replace('.', ',');
  if (annualPct == null) {
    return `Proyección a 5 años: con ~${formatFinancialValue(remaining)}M de autorización restante y un precio medio de ~${fmt(price)} $, se podrían recomprar ~${fmt(sharesToRepurchase)}M de acciones (~${fmt(perYear)}M/año).`;
  }
  return `Proyección a 5 años: con ~${formatFinancialValue(remaining)}M de autorización restante y un precio medio de ~${fmt(price)} $, se podrían recomprar ~${fmt(sharesToRepurchase)}M de acciones (~${fmt(perYear)}M/año), lo que reduciría el capital un ~${fmt(annualPct)} % anual e impulsaría el BPA ~${fmt(bpaPct)} % cada año.`;
}

export function buildShareCountEvolutionText(sharesHistory) {
  const points = [...(Array.isArray(sharesHistory) ? sharesHistory : [])]
    .map((point) => ({ year: Number(point?.year), shares: Number(point?.shares) }))
    .filter((point) => Number.isFinite(point.year) && Number.isFinite(point.shares) && point.shares > 0)
    .sort((a, b) => a.year - b.year);
  if (points.length < 2) return null;
  const prev = points[points.length - 2];
  const curr = points[points.length - 1];
  const pct = ((curr.shares - prev.shares) / prev.shares) * 100;
  const fmtShares = (value) => String(Math.round(value * 10) / 10).replace('.', ',');
  const fmtPct = `${pct < 0 ? '-' : '+'}${Math.abs(pct).toFixed(1).replace('.', ',')} %`;
  return `De ${fmtShares(prev.shares)}M de acciones al cierre de ${prev.year} a ${fmtShares(curr.shares)}M al cierre de ${curr.year} (${fmtPct})`;
}

export function getTaxNormalizationData({ extracted, horizon, isTrimestral }) {
  const facts = extracted.facts ?? {};
  const ebtRow = horizon.sales?.rows?.find((row) => String(row.name).toLowerCase().includes('ebt'));
  const netRow = horizon.sales?.rows?.find((row) => String(row.name).toLowerCase().includes('neto'));
  const ebtReported = parseFinancialValue(ebtRow?.normal);
  let ebtAdjusted = parseFinancialValue(ebtRow?.adjusted);
  const netReported = parseFinancialValue(netRow?.normal);

  if (!Number.isFinite(ebtAdjusted) && Number.isFinite(ebtReported)) {
    const impairments = Number(facts[isTrimestral ? 'impairmentsQuarter' : 'impairmentsYtd']) || 0;
    ebtAdjusted = ebtReported + impairments;
  }

  const normalizedRate = 0.23;
  if (!Number.isFinite(ebtAdjusted) || ebtAdjusted <= 0) {
    return null;
  }

  const normalizedCashTaxes = Math.round(ebtAdjusted * normalizedRate * 10) / 10;

  let cashTaxesPaid = Number(facts[isTrimestral ? 'incomeTaxesPaidQuarter' : 'incomeTaxesPaidYtd']);
  if (!Number.isFinite(cashTaxesPaid) || cashTaxesPaid <= 0) {
    const rawText = extracted._rawText || extracted.text || '';
    if (rawText) {
      const extractedPaid = extractIncomeTaxesPaid(rawText);
      if (Number.isFinite(extractedPaid) && extractedPaid > 0) {
        cashTaxesPaid = extractedPaid;
      }
    }
  }

  const rawTaxCfoAdjustment = facts[isTrimestral ? 'taxCashFlowAdjustmentQuarter' : 'taxCashFlowAdjustmentYtd'];
  const taxCfoAdjustment = Number(rawTaxCfoAdjustment);
  const taxExpense = Number(facts[isTrimestral ? 'incomeTaxExpenseQuarter' : 'incomeTaxExpenseYtd']);
  const reportedTax = Number.isFinite(taxExpense)
    ? taxExpense
    : (Number.isFinite(ebtReported) && Number.isFinite(netReported) ? ebtReported - netReported : NaN);

  if (!Number.isFinite(cashTaxesPaid) || cashTaxesPaid <= 0) {
    if (Number.isFinite(reportedTax) && Number.isFinite(taxCfoAdjustment) && rawTaxCfoAdjustment != null && rawTaxCfoAdjustment !== 0) {
      cashTaxesPaid = Math.abs(reportedTax - taxCfoAdjustment);
    }
  }

  if (!Number.isFinite(cashTaxesPaid) || cashTaxesPaid <= 0) {
    return null;
  }

  const adjustment = Math.round((cashTaxesPaid - normalizedCashTaxes) * 10) / 10;
  if (Math.abs(adjustment) < 0.5) return null;

  const normTaxText = `${formatFinancialValue(normalizedCashTaxes)}M`;
  const paidTaxText = `${formatFinancialValue(cashTaxesPaid)}M`;
  const adjText = `${adjustment >= 0 ? '+' : ''}${formatFinancialValue(adjustment)}M`;

  return {
    reportedTax,
    taxCfoAdjustment: Number.isFinite(taxCfoAdjustment) ? taxCfoAdjustment : null,
    cashTaxesPaid,
    normalizedRate,
    normalizedCashTaxes,
    adjustment,
    explanation: `Impuestos: La empresa debería haber pagado ${normTaxText} en impuestos (23 % sobre el EBT ajustado de ${formatFinancialValue(ebtAdjusted)}M) y solamente ha pagado ${paidTaxText} en efectivo según el estado de flujos. Ajuste de ${adjText} al Cash Flow Ajustado por la discrepancia fiscal.`,
  };
}
