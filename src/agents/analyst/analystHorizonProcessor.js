/**
 * @fileoverview Procesamiento defensivo de horizontes financieros (Ventas, Cash Flow y Asignación de Capital).
 * @module agents/analyst/analystHorizonProcessor
 */

import {
  parseFinancialValue,
  formatFinancialValue,
  parseLooseReportNumber,
  formatCellNumber,
  normalizeNumericCell,
  cleanAssetDescription,
} from './financialParsers.js';
import { getTaxNormalizationData } from './historyBuilders.js';

/**
 * Normaliza y verifica el bloque de ventas y cuenta de resultados de un horizonte.
 * @param {object} horizon - Bloque de horizonte temporal.
 * @param {object} extracted - Datos extraídos por el modelo.
 */
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

/**
 * Normaliza el bloque de flujos de caja y sus notas de capital circulante e impuestos.
 * @param {object} horizon - Bloque de horizonte.
 * @param {object} extracted - Datos globales extraídos.
 */
export function normalizeCashFlowBlock(horizon, extracted) {
  if (!horizon.cashFlow) {
    horizon.cashFlow = { scenarios: ['Normal', 'Ajustado'], rows: [], notes: [] };
  }
  if (!Array.isArray(horizon.cashFlow.rows) || horizon.cashFlow.rows.length === 0) {
    horizon.cashFlow.rows = [
      { name: 'Cash Flow', values: [] },
      { name: 'CAPEX', values: [] },
      { name: 'FCF', values: [] },
      { name: 'FCF/Acción', values: [] },
      { name: 'Dividendo', values: [] },
      { name: 'Libre', values: [] },
    ];
  }

  const isTrimestral = String(horizon.label).toUpperCase().includes('ÚLTIMOS')
    || String(horizon.label).toUpperCase().includes('3 MESES');
  const wcInfo = extracted.workingCapitalData;
  const targetScenarios = isTrimestral ? wcInfo?.quarterScenarios : wcInfo?.ytdScenarios;
  const targetVals = isTrimestral ? wcInfo?.quarterValues : wcInfo?.ytdValues;
  const taxNorm = getTaxNormalizationData({ extracted, horizon, isTrimestral });

  if (taxNorm && targetVals?.cfo?.[1] != null) {
    const adjustedCfo = parseFinancialValue(targetVals.cfo[1]);
    if (Number.isFinite(adjustedCfo)) {
      targetVals.cfo[1] = formatFinancialValue(adjustedCfo + taxNorm.adjustment);
      const adjustedCapex = parseFinancialValue(targetVals.capex?.[1]);
      const adjustedFcf = Number.isFinite(adjustedCapex) ? adjustedCfo + taxNorm.adjustment - adjustedCapex : NaN;
      if (Number.isFinite(adjustedFcf)) {
        targetVals.fcf[1] = formatFinancialValue(adjustedFcf);
        const shares = Number(extracted.shares);
        if (Number.isFinite(shares) && shares !== 0) {
          targetVals.fcfPerShare[1] = `${(adjustedFcf / shares).toFixed(2).replace('.', ',')} $`;
        }
        const adjustedDividends = parseFinancialValue(targetVals.dividends?.[1]);
        targetVals.libre[1] = formatFinancialValue(adjustedFcf - (Number.isFinite(adjustedDividends) ? adjustedDividends : 0));
      }
    }
  }

  const cfoRow = horizon.cashFlow.rows.find((r) => /cash flow|flujo de caja/i.test(String(r.name)));
  if (cfoRow) {
    if (taxNorm) cfoRow.cashFlowAdjustedNote = '*2';
    else delete cfoRow.cashFlowAdjustedNote;
  }

  let scenarios = targetScenarios && targetScenarios.length === 2 ? targetScenarios : ['Normal', 'Ajustado*1'];
  horizon.cashFlow.scenarios = scenarios;

  horizon.cashFlow.rows.forEach((row) => {
    const nameLower = String(row.name).toLowerCase();
    let key = null;
    if (nameLower.includes('cash flow') || nameLower.includes('flujo de caja')) key = 'cfo';
    else if (nameLower.includes('capex')) key = 'capex';
    else if (nameLower.includes('fcf/acción') || nameLower.includes('fcf / acción')) key = 'fcfPerShare';
    else if (nameLower.includes('fcf')) key = 'fcf';
    else if (nameLower.includes('dividendo')) key = 'dividends';
    else if (nameLower.includes('libre')) key = 'libre';

    if (key && targetVals?.[key]) {
      const [v0, v1] = targetVals[key];
      if (v0 != null && v1 != null) row.values = [v0, v1];
    }
    if (!Array.isArray(row.values) || row.values.length === 0) row.values = ['—', '—'];
    row.values = row.values.map(normalizeNumericCell);
  });

  // Asegurar notas del cash flow
  horizon.cashFlow.notes = (Array.isArray(horizon.cashFlow.notes) ? [...horizon.cashFlow.notes] : [])
    .filter((n) => !/deducido del acumulado|flujo trimestral deducido/i.test(String(n)));

  let expNote = isTrimestral ? wcInfo?.explanation3M : wcInfo?.explanationYtd;
  if (expNote) {
    const noteText = `*1: ${expNote.replace(/^\*\d+:?\s*/, '')}`;
    const idx = horizon.cashFlow.notes.findIndex((n) => /WK|circulante|Cuentas por pagar/i.test(n));
    if (idx !== -1) horizon.cashFlow.notes[idx] = noteText;
    else horizon.cashFlow.notes.push(noteText);
  }
  if (taxNorm) {
    const taxNote = `*2: ${taxNorm.explanation.replace(/^\*\d+:?\s*/, '')}`;
    const idx = horizon.cashFlow.notes.findIndex((n) => /impuestos/i.test(n));
    if (idx !== -1) horizon.cashFlow.notes[idx] = taxNote;
    else horizon.cashFlow.notes.push(taxNote);
  }
}

/**
 * Normaliza el bloque de asignación de capital (Libre, Deuda, Caja, Recompras, Desinversiones).
 * @param {object} horizon - Bloque de horizonte.
 * @param {object} extracted - Datos extraídos.
 */
export function normalizeCapitalBlock(horizon, extracted) {
  if (!horizon.capital?.rows) return;
  const isTrimestral = String(horizon.label).toUpperCase().includes('ÚLTIMOS')
    || String(horizon.label).toUpperCase().includes('3 MESES');
  const capData = isTrimestral ? extracted.capitalAllocationData?.threeMonths : extracted.capitalAllocationData?.ytd;

  // Sincronizar fila Libre con la fila Libre de Cash Flow
  const cfLibreRow = horizon.cashFlow?.rows?.find((r) => String(r.name).toLowerCase().includes('libre'));
  const libreVal = cfLibreRow
    ? (Array.isArray(cfLibreRow.values) && cfLibreRow.values.length ? cfLibreRow.values[0] : cfLibreRow.value)
    : (capData?.libre != null ? formatCellNumber(capData.libre) : null);

  let capLibreRow = horizon.capital.rows.find((r) => String(r.name).replace(/\*\d+/g, '').trim().toLowerCase() === 'libre');
  if (!capLibreRow) {
    capLibreRow = { name: 'Libre', value: libreVal ? String(libreVal) : '0' };
    horizon.capital.rows.unshift(capLibreRow);
  } else if (libreVal) {
    capLibreRow.value = String(libreVal);
  }

  // Deuda y Caja
  if (capData?.deuda != null) {
    const deudaRow = horizon.capital.rows.find((r) => String(r.name).toLowerCase().includes('deuda'));
    if (deudaRow) deudaRow.value = formatCellNumber(capData.deuda);
  }
  if (capData?.caja != null) {
    const cajaRow = horizon.capital.rows.find((r) => String(r.name).toLowerCase() === 'caja' || String(r.name).toLowerCase().includes('caja'));
    if (cajaRow) cajaRow.value = formatCellNumber(capData.caja);
  }

  // Recalcular suma total
  let sum = 0;
  let totalRow = horizon.capital.rows.find((r) => String(r.name).toLowerCase().includes('total'));
  if (!totalRow) {
    totalRow = { name: 'En total', value: '0' };
    horizon.capital.rows.push(totalRow);
  }

  horizon.capital.rows.forEach((r) => {
    if (String(r.name).toLowerCase().includes('total')) return;
    const num = parseLooseReportNumber(r.value);
    if (Number.isFinite(num)) sum += num;
  });
  totalRow.value = formatCellNumber(sum);

  const threshold = Math.max(50, Math.abs(sum) * 0.1);
  horizon.capital.verification = Math.abs(sum) <= threshold
    ? 'Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle.'
    : 'No cuadra. Hay una discrepancia significativa entre el capital libre y los usos detectados; se deberá analizar más a fondo.';
}
