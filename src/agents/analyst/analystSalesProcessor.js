/**
 * @fileoverview Módulo extraído de analystHorizonProcessor.js.
 */

import { parseFinancialValue, formatFinancialValue } from './financialParsers.js';

export function normalizeSalesBlock(horizon, extracted) {
  if (!horizon.sales?.rows) return;
  const isTrimestral = String(horizon.label).toUpperCase().includes('ÚLTIMOS')
    || String(horizon.label).toUpperCase().includes('3 MESES');
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

    if (reportedKey) {
      const formatReported = (val) => (Number.isFinite(Number(val)) ? `${formatFinancialValue(Number(val))}M` : null);
      const normalFill = formatReported(reported[reportedKey]);
      const prevFill = formatReported(reportedPrev[reportedKey]);
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
      row.pctAdjusted = `${pct >= 0 ? '+' : ''}${pct.toFixed(2).replace('.', ',')} %`;
    }

    const an = parseFinancialValue(row.normal);
    const bn = parseFinancialValue(row.prevNormal);
    if (Number.isFinite(an) && Number.isFinite(bn) && bn !== 0) {
      if (bn > 0) {
        const pctN = ((an - bn) / Math.abs(bn)) * 100;
        row.pctNormal = `${pctN >= 0 ? '+' : ''}${pctN.toFixed(2).replace('.', ',')} %`;
      } else {
        row.pctNormal = '—';
      }
    }

    if (nameLower.includes('ebt')) {
      row.isAdjusted = false;
      row.adjustedNote = undefined;
    } else if (nameLower.includes('neto')) {
      const hasTaxNote = Boolean(row.adjustedNote && horizon.sales?.notes?.some((n) => {
        const str = String(n).toLowerCase();
        return str.startsWith(String(row.adjustedNote).toLowerCase())
          && (str.includes('impuesto') || str.includes('fiscal') || str.includes('23%') || str.includes('tasa') || str.includes('crédito'));
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
  if (prevImpairment >= 50 && !horizon.sales.notes.some((n) => (n.includes('impairment') || n.includes('deterioro')) && (n.includes('anterior') || n.includes('previo')))) {
    horizon.sales.notes.push(`*1: El año anterior tuvieron un impairment de ${Math.round(prevImpairment)}M.`);
  }
  if (currImpairment >= 50 && !horizon.sales.notes.some((n) => n.includes('depreciación') || n.includes('impairment') || n.includes('deterioro') || n.includes('intangible'))) {
    const nextIdx = horizon.sales.notes.length + 1;
    horizon.sales.notes.push(`*${nextIdx}: Ha habido una depreciación de intangibles de ${Math.round(currImpairment)}M.`);
  }
}
