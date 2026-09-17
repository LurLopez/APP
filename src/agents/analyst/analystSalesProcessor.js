/**
 * @fileoverview Módulo extraído de analystHorizonProcessor.js.
 */

import { parseFinancialValue, formatFinancialValue } from './financialParsers.js';
import { t, formatPercent, normalizeLanguage } from '../../utils/i18n.js';

export function normalizeSalesBlock(horizon, extracted, language = 'es') {
  const lang = normalizeLanguage(language);
  if (!horizon.sales?.rows) return;
  const labelUpper = String(horizon.label).toUpperCase();
  const isTrimestral = labelUpper.includes('ÚLTIMOS')
    || labelUpper.includes('3 MESES')
    || labelUpper.includes('LAST 3 MONTHS')
    || labelUpper.includes('THREE MONTHS');
  const prevImpairment = isTrimestral
    ? (Number(extracted.facts?.impairmentsPrevQuarter) || 0)
    : (Number(extracted.facts?.impairmentsPrevYtd) || 0);
  const currImpairment = isTrimestral
    ? (Number(extracted.facts?.impairmentsQuarter) || 0)
    : (Number(extracted.facts?.impairmentsYtd) || 0);

  horizon.sales.rows.forEach((row) => {
    const nameLower = String(row.name).toLowerCase();
    const isOperativeOrNet = nameLower.includes('operativo') || nameLower.includes('ebt') || nameLower.includes('neto');

    const reported = isTrimestral ? (extracted.quarter ?? {}) : (extracted.ytd ?? {});
    const reportedPrev = reported.prev ?? {};
    const reportedKey = (() => {
      if (nameLower.includes('venta') || nameLower.includes('sales') || nameLower.includes('ingreso')) return 'sales';
      if (nameLower.includes('bruto') || nameLower.includes('gross')) return 'grossProfit';
      if (nameLower.includes('operativ') || nameLower.includes('operating')) return 'operatingIncome';
      if (nameLower.includes('ebt') || nameLower.includes('impuesto') || nameLower.includes('before tax')) return 'ebt';
      if (nameLower.includes('neto') || nameLower.includes('net income')) return 'netIncome';
      return null;
    })();

    // Fallbacks entre métricas de la cuenta de resultados si alguna falta
    const resolveReportedMetric = (rep) => {
      if (!reportedKey || rep == null) return null;
      if (rep[reportedKey] != null) return rep[reportedKey];
      if (reportedKey === 'grossProfit') {
        if (rep.sales != null && rep.cogs != null) return Number(rep.sales) - Number(rep.cogs);
        if (rep.sales != null) return rep.sales;
      }
      if (reportedKey === 'operatingIncome') {
        if (rep.ebt != null) return rep.ebt;
        if (rep.grossProfit != null && rep.operatingExpenses != null) return Number(rep.grossProfit) - Number(rep.operatingExpenses);
      }
      if (reportedKey === 'ebt') {
        if (rep.operatingIncome != null) return rep.operatingIncome;
        if (rep.netIncome != null) return rep.netIncome;
      }
      if (reportedKey === 'netIncome') {
        if (rep.ebt != null) return rep.ebt;
        if (rep.operatingIncome != null) return rep.operatingIncome;
      }
      return null;
    };

    if (reportedKey) {
      const formatReported = (val) => (Number.isFinite(Number(val)) ? `${formatFinancialValue(Number(val), lang)}M` : null);
      const normalFill = formatReported(resolveReportedMetric(reported));
      const prevFill = formatReported(resolveReportedMetric(reportedPrev));
      if (normalFill && (!row.normal || row.normal === '—')) row.normal = normalFill;
      if (prevFill) {
        const officialPrev = parseFinancialValue(prevFill);
        const existingPrev = parseFinancialValue(row.prevNormal);
        const existingPrevAdjusted = parseFinancialValue(row.prevAdjusted);
        const prevAdjustedIsJustCopy = !Number.isFinite(existingPrevAdjusted)
          || (Number.isFinite(existingPrev) && Math.abs(existingPrevAdjusted - existingPrev) < 0.05);
        if (!Number.isFinite(existingPrev) || officialPrev !== existingPrev) {
          row.prevNormal = prevFill;
          if (prevAdjustedIsJustCopy) row.prevAdjusted = prevFill;
        }
      }
    }

    // Ajuste por impairment del ejercicio previo
    if (isOperativeOrNet && prevImpairment >= 50 && row.prevNormal && row.prevNormal !== '—') {
      const prevNormVal = parseFinancialValue(row.prevNormal);
      const prevAdjVal = parseFinancialValue(row.prevAdjusted ?? '');
      if (!Number.isFinite(prevAdjVal) || Math.abs(prevAdjVal - prevNormVal) < 20 || (prevAdjVal <= 0 && prevNormVal <= 0)) {
        let calculatedPrevAdj;
        if (nameLower.includes('neto')) {
          const prevEbtRow = horizon.sales.rows.find((r) => String(r.name).toLowerCase().includes('ebt'));
          const prevEbtNorm = prevEbtRow ? parseFinancialValue(prevEbtRow.prevNormal) : NaN;
          calculatedPrevAdj = Number.isFinite(prevEbtNorm)
            ? Math.round((prevEbtNorm + prevImpairment) * 0.77)
            : Math.round(prevNormVal + prevImpairment * 0.77);
        } else {
          calculatedPrevAdj = Math.round(prevNormVal + prevImpairment);
        }
        row.prevAdjusted = `${calculatedPrevAdj}M`;
        if (nameLower.includes('operativo')) {
          row.isAdjusted = true;
          if (!row.adjustedNote) row.adjustedNote = '*1';
        } else {
          row.isAdjusted = false;
          row.adjustedNote = undefined;
        }
      }
    }

    // Ajuste por impairment del ejercicio actual
    if (isOperativeOrNet && currImpairment >= 30 && row.normal && row.normal !== '—') {
      const normVal = parseFinancialValue(row.normal);
      const adjVal = parseFinancialValue(row.adjusted ?? '');
      if (!Number.isFinite(adjVal) || Math.abs(adjVal - normVal) < 20) {
        let calculatedAdj;
        if (nameLower.includes('neto')) {
          const ebtRow = horizon.sales.rows.find((r) => String(r.name).toLowerCase().includes('ebt'));
          const ebtNorm = ebtRow ? parseFinancialValue(ebtRow.normal) : NaN;
          calculatedAdj = Number.isFinite(ebtNorm)
            ? Math.round((ebtNorm + currImpairment) * 0.77)
            : Math.round(normVal + currImpairment * 0.77);
        } else {
          calculatedAdj = Math.round(normVal + currImpairment);
        }
        row.adjusted = `${calculatedAdj}M`;
        if (nameLower.includes('operativo')) {
          row.isAdjusted = true;
          if (!row.adjustedNote) row.adjustedNote = '*1';
        } else {
          row.isAdjusted = false;
          row.adjustedNote = undefined;
        }
      }
    }

    if ((!row.prevAdjusted || row.prevAdjusted === '—') && row.prevNormal && row.prevNormal !== '—') {
      row.prevAdjusted = row.prevNormal;
    }
    if ((!row.adjusted || row.adjusted === '—') && row.normal && row.normal !== '—') {
      row.adjusted = row.normal;
    }

    // Variaciones porcentuales
    const a = parseFinancialValue(row.adjusted);
    const b = parseFinancialValue(row.prevAdjusted);
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) {
      const pct = ((a - b) / Math.abs(b)) * 100;
      row.pctAdjusted = formatPercent(pct, { digits: 2, lang });
    }

    const an = parseFinancialValue(row.normal);
    const bn = parseFinancialValue(row.prevNormal);
    if (Number.isFinite(an) && Number.isFinite(bn) && bn !== 0) {
      if (bn > 0) {
        const pctN = ((an - bn) / Math.abs(bn)) * 100;
        row.pctNormal = formatPercent(pctN, { digits: 2, lang });
      } else {
        row.pctNormal = '—';
      }
    }

    if (nameLower.includes('ebt')) {
      row.isAdjusted = false;
      row.adjustedNote = undefined;
    } else if (nameLower.includes('neto') || nameLower.includes('net income')) {
      const hasTaxNote = Boolean(row.adjustedNote && horizon.sales?.notes?.some((n) => {
        const str = String(n).toLowerCase();
        return str.startsWith(String(row.adjustedNote).toLowerCase())
          && (str.includes('impuesto') || str.includes('fiscal') || str.includes('23%') || str.includes('tasa') || str.includes('crédito')
            || str.includes('tax') || str.includes('rate') || str.includes('credit'));
      }));
      if (!hasTaxNote) {
        row.isAdjusted = false;
        row.adjustedNote = undefined;
      }
    }

    if (row.isAdjusted && !row.adjustedNote) row.adjustedNote = '*1';
  });

  // Notas al pie de ventas
  horizon.sales.notes = Array.isArray(horizon.sales.notes) ? [...horizon.sales.notes] : [];
  if (prevImpairment >= 50 && !horizon.sales.notes.some((n) => (n.includes('impairment') || n.includes('deterioro')) && (n.includes('anterior') || n.includes('previo') || n.includes('prior') || n.includes('previous') || n.includes('last year')))) {
    horizon.sales.notes.push(`*1: ${t('El año anterior tuvieron un impairment de {amount}M.', { amount: Math.round(prevImpairment) }, lang)}`);
  }
  if (currImpairment >= 50 && !horizon.sales.notes.some((n) => n.includes('depreciación') || n.includes('impairment') || n.includes('deterioro') || n.includes('intangible'))) {
    const nextIdx = horizon.sales.notes.length + 1;
    horizon.sales.notes.push(`*${nextIdx}: ${t('Ha habido una depreciación de intangibles de {amount}M.', { amount: Math.round(currImpairment) }, lang)}`);
  }
}
