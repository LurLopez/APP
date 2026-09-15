/**
 * @fileoverview Módulo extraído de analystHorizonProcessor.js.
 */

import { parseFinancialValue, formatFinancialValue, parseLooseReportNumber, formatCellNumber, normalizeNumericCell } from './financialParsers.js';
import { getTaxNormalizationData } from './historyBuilders.js';

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
