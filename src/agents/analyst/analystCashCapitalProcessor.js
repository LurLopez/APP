/**
 * @fileoverview Módulo extraído de analystHorizonProcessor.js.
 */

import { parseFinancialValue, formatFinancialValue, parseLooseReportNumber, formatCellNumber, normalizeNumericCell } from './financialParsers.js';
import { getTaxNormalizationData } from './historyBuilders.js';

function formatSignedFinancial(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return `${num >= 0 ? '+' : '-'}${formatFinancialValue(Math.abs(num))}M`;
}

/**
 * Redacta la cadena de ajustes del Cash Flow (circulante e impuestos) para que la tabla
 * no oculte dos ajustes grandes de signo opuesto tras un neto pequeño.
 * @param {object} params - Cifras del escenario normal, tras circulante, final y ajuste fiscal.
 * @returns {string} Frase de desglose o cadena vacía si faltan datos.
 */
export function buildCashFlowAdjustmentChain({ normalCfo, afterWc, finalCfo, taxAdjustment }) {
  const normal = Number(normalCfo);
  const afterWcNum = Number(afterWc);
  const final = Number(finalCfo);
  const tax = Number(taxAdjustment);
  if (![normal, afterWcNum, final, tax].every(Number.isFinite)) return '';
  const wcAdjustment = Math.round((afterWcNum - normal) * 10) / 10;
  const netAdjustment = Math.round((final - normal) * 10) / 10;
  const parts = [
    `La cifra final combina los dos ajustes sobre el Cash Flow: ${formatFinancialValue(normal)}M ${formatSignedFinancial(wcAdjustment)} (circulante) ${formatSignedFinancial(tax)} (impuestos) = ${formatFinancialValue(final)}M.`,
  ];
  const gross = Math.max(Math.abs(wcAdjustment), Math.abs(tax));
  if (wcAdjustment !== 0 && tax !== 0 && Math.abs(netAdjustment) <= gross * 0.25) {
    parts.push(`El efecto neto es de solo ${formatSignedFinancial(netAdjustment)}, porque ambos ajustes se cancelan en gran medida.`);
  }
  return parts.join(' ');
}

function buildRestrictedCashNote(extracted, isTrimestral, movement) {
  const bal = extracted.balance ?? {};
  const prev = Number(isTrimestral ? bal.restrictedCashPreviousQuarter : bal.restrictedCashBeginningOfYear);
  const curr = Number(bal.restrictedCash);
  const context = Number.isFinite(prev) && Number.isFinite(curr)
    ? `saldo de ${formatFinancialValue(prev)}M a ${formatFinancialValue(curr)}M`
    : 'variación del saldo';
  const effect = movement < 0
    ? 'aumentó la tesorería consignada (uso de capital, signo negativo)'
    : 'disminuyó la tesorería consignada (fuente de liquidez, signo positivo)';
  return `Efectivo restringido: ${context} (${formatSignedFinancial(movement)}); ${effect}. Corresponde a movimientos no monetarios o reclasificaciones entre caja y efectivo restringido (consignaciones, escrow o colaterales) que se detallan en las notas del informe. No duplica la fila de Adquisiciones ni otras salidas: la compra registra solo el efectivo desembolsado y esta fila el traslado entre caja disponible y restringida, no un segundo pago.`;
}

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

  let taxChainNote = '';
  if (taxNorm && targetVals?.cfo?.[1] != null) {
    const adjustedCfo = parseFinancialValue(targetVals.cfo[1]);
    if (Number.isFinite(adjustedCfo)) {
      const finalCfo = Math.round((adjustedCfo + taxNorm.adjustment) * 10) / 10;
      targetVals.cfo[1] = formatFinancialValue(finalCfo);
      taxChainNote = buildCashFlowAdjustmentChain({
        normalCfo: parseFinancialValue(targetVals.cfo[0]),
        afterWc: adjustedCfo,
        finalCfo,
        taxAdjustment: taxNorm.adjustment,
      });
      const adjustedCapex = parseFinancialValue(targetVals.capex?.[1]);
      const adjustedFcf = Number.isFinite(adjustedCapex) ? finalCfo - adjustedCapex : NaN;
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
    if (row.values[0] === '—' || row.values[1] === '—') {
      const fallbackVal = (() => {
        if (key === 'cfo') return extracted.cashFlow?.operating ?? extracted.facts?.cfo ?? extracted.facts?.operatingCashFlow;
        if (key === 'capex') return extracted.cashFlow?.capex ?? extracted.facts?.capex;
        if (key === 'dividends') return extracted.cashFlow?.dividends ?? extracted.facts?.dividends ?? extracted.facts?.dividendsCommon ?? 0;
        return null;
      })();
      if (fallbackVal != null && Number.isFinite(Number(fallbackVal))) {
        const formatted = formatFinancialValue(Math.abs(Number(fallbackVal)));
        if (row.values[0] === '—') row.values[0] = formatted;
        if (row.values[1] === '—') row.values[1] = formatted;
      }
    }
    row.values = row.values.map(normalizeNumericCell);
  });

  // Conciliar FCF, FCF/Acción y Libre si aún quedan en '—'
  const fcfRow = horizon.cashFlow.rows.find((r) => String(r.name).toLowerCase() === 'fcf');
  const cfoRowRef = horizon.cashFlow.rows.find((r) => /cash flow|flujo de caja/i.test(String(r.name)));
  const capexRowRef = horizon.cashFlow.rows.find((r) => /capex/i.test(String(r.name)));
  if (fcfRow && (fcfRow.values[0] === '—' || !fcfRow.values[0])) {
    const cVal = parseFinancialValue(cfoRowRef?.values?.[0]);
    const capVal = parseFinancialValue(capexRowRef?.values?.[0]);
    if (Number.isFinite(cVal)) {
      const computedFcf = Number.isFinite(capVal) ? cVal - Math.abs(capVal) : cVal;
      fcfRow.values[0] = formatFinancialValue(computedFcf);
      if (fcfRow.values[1] === '—' || !fcfRow.values[1]) fcfRow.values[1] = fcfRow.values[0];
    }
  }

  const fcfPerShareRow = horizon.cashFlow.rows.find((r) => /fcf\/acción|fcf \/ acción/i.test(String(r.name)));
  const sharesNum = Number(extracted.shares);
  if (fcfPerShareRow && (fcfPerShareRow.values[0] === '—' || !fcfPerShareRow.values[0]) && Number.isFinite(sharesNum) && sharesNum > 0) {
    const fcfVal = parseFinancialValue(fcfRow?.values?.[0]);
    if (Number.isFinite(fcfVal)) {
      const perShareStr = `${(fcfVal / sharesNum).toFixed(2).replace('.', ',')} $`;
      fcfPerShareRow.values[0] = perShareStr;
      if (fcfPerShareRow.values[1] === '—' || !fcfPerShareRow.values[1]) fcfPerShareRow.values[1] = perShareStr;
    }
  }

  const libreRow = horizon.cashFlow.rows.find((r) => String(r.name).toLowerCase() === 'libre');
  const divRowRef = horizon.cashFlow.rows.find((r) => /dividendo/i.test(String(r.name)));
  if (libreRow && (libreRow.values[0] === '—' || !libreRow.values[0])) {
    const fcfVal = parseFinancialValue(fcfRow?.values?.[0]);
    const divVal = parseFinancialValue(divRowRef?.values?.[0]);
    if (Number.isFinite(fcfVal)) {
      const computedLibre = fcfVal - (Number.isFinite(divVal) ? Math.abs(divVal) : 0);
      libreRow.values[0] = formatFinancialValue(computedLibre);
      if (libreRow.values[1] === '—' || !libreRow.values[1]) libreRow.values[1] = libreRow.values[0];
    }
  }

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
    const baseTaxNote = `*2: ${taxNorm.explanation.replace(/^\*\d+:?\s*/, '')}`;
    const taxNote = taxChainNote ? `${baseTaxNote} ${taxChainNote}` : baseTaxNote;
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

  // Efectivo restringido: variación material de tesorería consignada (escrow, colateral, adquisiciones)
  const restrictedMovement = Number(capData?.restrictedCashMovement);
  if (Number.isFinite(restrictedMovement) && restrictedMovement !== 0) {
    let restrictedRow = horizon.capital.rows.find((r) => /restringid|escrow/i.test(String(r.name)));
    if (!restrictedRow) {
      const totalIdx = horizon.capital.rows.findIndex((r) => String(r.name).toLowerCase().includes('total'));
      restrictedRow = { name: 'Efectivo restringido', value: formatCellNumber(restrictedMovement) };
      if (totalIdx === -1) horizon.capital.rows.push(restrictedRow);
      else horizon.capital.rows.splice(totalIdx, 0, restrictedRow);
    } else if (!Number.isFinite(parseLooseReportNumber(restrictedRow.value)) || parseLooseReportNumber(restrictedRow.value) === 0) {
      restrictedRow.value = formatCellNumber(restrictedMovement);
    }
    const notes = Array.isArray(horizon.capital.notes) ? horizon.capital.notes : [];
    if (!notes.some((n) => /restringid|escrow/i.test(String(n)))) {
      const existingMatch = String(restrictedRow.name).match(/\*(\d+)/);
      const nextNum = existingMatch
        ? Number(existingMatch[1])
        : 1 + notes.reduce((max, n) => {
          const match = String(n).match(/\*(\d+)/);
          return match ? Math.max(max, Number(match[1])) : max;
        }, 0);
      notes.push(`*${nextNum}: ${buildRestrictedCashNote(extracted, isTrimestral, restrictedMovement)}`);
      if (!existingMatch) restrictedRow.name = `${restrictedRow.name}*${nextNum}`;
      horizon.capital.notes = notes;
    }
  }

  // Desinversiones: la fila debe sumar ventas de negocios/marcas y ventas de activos fijos
  if (!isTrimestral) {
    const totalDivestitures = Math.round(((Number(capData?.divestitures) || 0) + (Number(capData?.assetSales) || 0)) * 10) / 10;
    if (totalDivestitures >= 50) {
      let divestitureRow = horizon.capital.rows.find((r) => /desinver|venta de marcas/i.test(String(r.name)));
      if (!divestitureRow) {
        const totalIdx = horizon.capital.rows.findIndex((r) => String(r.name).toLowerCase().includes('total'));
        divestitureRow = { name: 'Desinversiones', value: formatCellNumber(totalDivestitures) };
        if (totalIdx === -1) horizon.capital.rows.push(divestitureRow);
        else horizon.capital.rows.splice(totalIdx, 0, divestitureRow);
      } else {
        const current = parseLooseReportNumber(divestitureRow.value);
        if (!Number.isFinite(current) || totalDivestitures - current >= 50) {
          divestitureRow.value = formatCellNumber(totalDivestitures);
        }
      }
    }
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
    : `No cuadra: quedan ${formatSignedFinancial(sum)} sin explicar entre el capital libre y los usos detectados. El desfase corresponde a partidas no mapeadas o a movimientos no monetarios y reclasificaciones de balance (efectivo restringido, efecto divisa en caja, deuda asumida en compras o reclasificaciones entre caja e inversiones) que deben revisarse en las notas de flujos y balance del informe.`;
}
