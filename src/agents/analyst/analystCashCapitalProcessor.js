/**
 * @fileoverview Módulo extraído de analystHorizonProcessor.js.
 * Normaliza los bloques de Cash Flow y Asignación de Capital con soporte de idioma.
 */

import { parseFinancialValue, formatFinancialValue, parseLooseReportNumber, formatCellNumber, normalizeNumericCell } from './financialParsers.js';
import { getTaxNormalizationData } from './historyBuilders.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';

function toFiniteNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatSignedFinancial(value, language = 'es') {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return `${num >= 0 ? '+' : '-'}${formatFinancialValue(Math.abs(num), language)}M`;
}

function formatTwoDecimals(value, language = 'es') {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const fixed = num.toFixed(2);
  return language === 'en' ? fixed : fixed.replace('.', ',');
}

function isTrimestralHorizon(horizon) {
  const label = String(horizon?.label || '').toUpperCase();
  return label.includes('ÚLTIMOS') || label.includes('3 MESES')
    || label.includes('LAST 3 MONTHS') || label.includes('THREE MONTHS');
}

/**
 * Redacta la cadena de ajustes del Cash Flow (circulante e impuestos) para que la tabla
 * no oculte dos ajustes grandes de signo opuesto tras un neto pequeño.
 * @param {object} params - Cifras del escenario normal, tras circulante, final y ajuste fiscal.
 * @returns {string} Frase de desglose o cadena vacía si faltan datos.
 */
export function buildCashFlowAdjustmentChain({ normalCfo, afterWc, finalCfo, taxAdjustment, language = 'es' }) {
  const lang = normalizeLanguage(language);
  const normal = Number(normalCfo);
  const afterWcNum = Number(afterWc);
  const final = Number(finalCfo);
  const tax = Number(taxAdjustment);
  if (![normal, afterWcNum, final, tax].every(Number.isFinite)) return '';
  const wcAdjustment = Math.round((afterWcNum - normal) * 10) / 10;
  const netAdjustment = Math.round((final - normal) * 10) / 10;
  const parts = [
    t('La cifra final combina los dos ajustes sobre el Cash Flow: {normal}M {wc} (circulante) {tax} (impuestos) = {final}M.', {
      normal: formatFinancialValue(normal, lang),
      wc: formatSignedFinancial(wcAdjustment, lang),
      tax: formatSignedFinancial(tax, lang),
      final: formatFinancialValue(final, lang),
    }, lang),
  ];
  const gross = Math.max(Math.abs(wcAdjustment), Math.abs(tax));
  if (wcAdjustment !== 0 && tax !== 0 && Math.abs(netAdjustment) <= gross * 0.25) {
    parts.push(t('El efecto neto es de solo {net}, porque ambos ajustes se cancelan en gran medida.', {
      net: formatSignedFinancial(netAdjustment, lang),
    }, lang));
  }
  return parts.join(' ');
}

function buildRestrictedCashNote(extracted, isTrimestral, movement, language = 'es') {
  const lang = normalizeLanguage(language);
  const bal = extracted.balance ?? {};
  const rawPrev = isTrimestral ? bal.restrictedCashPreviousQuarter : bal.restrictedCashBeginningOfYear;
  const prev = rawPrev == null || rawPrev === '' ? NaN : Number(rawPrev);
  const rawCurr = bal.restrictedCash;
  const curr = rawCurr == null || rawCurr === '' ? NaN : Number(rawCurr);
  const context = Number.isFinite(prev) && Number.isFinite(curr)
    ? t('saldo de {prev}M a {curr}M', { prev: formatFinancialValue(prev, lang), curr: formatFinancialValue(curr, lang) }, lang)
    : t('variación del saldo', null, lang);
  const effect = movement < 0
    ? t('aumentó la tesorería consignada (uso de capital, signo negativo)', null, lang)
    : t('disminuyó la tesorería consignada (fuente de liquidez, signo positivo)', null, lang);
  return t('Efectivo restringido: {context} ({movement}); {effect}. Corresponde a movimientos no monetarios o reclasificaciones entre caja y efectivo restringido (consignaciones, escrow o colaterales) que se detallan en las notas del informe. No duplica la fila de Adquisiciones ni otras salidas: la compra registra solo el efectivo desembolsado y esta fila el traslado entre caja disponible y restringida, no un segundo pago.', {
    context,
    movement: formatSignedFinancial(movement, lang),
    effect,
  }, lang);
}

export function normalizeCashFlowBlock(horizon, extracted, language = 'es') {
  const lang = normalizeLanguage(language);
  if (!horizon.cashFlow) {
    horizon.cashFlow = {
      scenarios: [t('Normal', null, lang), t('Ajustado', null, lang)],
      rows: [],
      notes: [],
    };
  }
  if (!Array.isArray(horizon.cashFlow.rows) || horizon.cashFlow.rows.length === 0) {
    horizon.cashFlow.rows = [
      { name: t('Cash Flow', null, lang), values: [] },
      { name: 'CAPEX', values: [] },
      { name: 'FCF', values: [] },
      { name: t('FCF/Acción', null, lang), values: [] },
      { name: t('Dividendo', null, lang), values: [] },
      { name: t('Libre', null, lang), values: [] },
    ];
  }

  const isTrimestral = isTrimestralHorizon(horizon);
  const wcInfo = extracted.workingCapitalData;
  const targetScenarios = isTrimestral ? wcInfo?.quarterScenarios : wcInfo?.ytdScenarios;
  const targetVals = isTrimestral ? wcInfo?.quarterValues : wcInfo?.ytdValues;
  const taxNorm = getTaxNormalizationData({ extracted, horizon, isTrimestral, language: lang });

  let taxChainNote = '';
  if (taxNorm && targetVals?.cfo?.[1] != null) {
    const adjustedCfo = parseFinancialValue(targetVals.cfo[1]);
    if (Number.isFinite(adjustedCfo)) {
      const finalCfo = Math.round((adjustedCfo + taxNorm.adjustment) * 10) / 10;
      targetVals.cfo[1] = formatFinancialValue(finalCfo, lang);
      taxChainNote = buildCashFlowAdjustmentChain({
        normalCfo: parseFinancialValue(targetVals.cfo[0]),
        afterWc: adjustedCfo,
        finalCfo,
        taxAdjustment: taxNorm.adjustment,
        language: lang,
      });
      const adjustedCapex = parseFinancialValue(targetVals.capex?.[1]);
      const adjustedFcf = Number.isFinite(adjustedCapex) ? finalCfo - adjustedCapex : NaN;
      if (Number.isFinite(adjustedFcf)) {
        targetVals.fcf[1] = formatFinancialValue(adjustedFcf, lang);
        const shares = Number(extracted.shares);
        if (Number.isFinite(shares) && shares !== 0) {
          targetVals.fcfPerShare[1] = `${formatTwoDecimals(adjustedFcf / shares, lang)} $`;
        }
        const adjustedDividends = parseFinancialValue(targetVals.dividends?.[1]);
        targetVals.libre[1] = formatFinancialValue(adjustedFcf - (Number.isFinite(adjustedDividends) ? adjustedDividends : 0), lang);
      }
    }
  }

  const cfoRow = horizon.cashFlow.rows.find((r) => /cash flow|flujo de caja/i.test(String(r.name)));
  if (cfoRow) {
    if (taxNorm) cfoRow.cashFlowAdjustedNote = '*2';
    else delete cfoRow.cashFlowAdjustedNote;
  }

  const defaultAdjusted = t('Ajustado*1', null, lang);
  const scenarios = targetScenarios && targetScenarios.length === 2
    ? targetScenarios
    : [t('Normal', null, lang), defaultAdjusted];
  horizon.cashFlow.scenarios = scenarios;

  horizon.cashFlow.rows.forEach((row) => {
    const nameLower = String(row.name).toLowerCase();
    let key = null;
    if (nameLower.includes('cash flow') || nameLower.includes('flujo de caja')) key = 'cfo';
    else if (nameLower.includes('capex')) key = 'capex';
    else if (nameLower.includes('fcf/acción') || nameLower.includes('fcf / acción') || nameLower.includes('fcf/share') || nameLower.includes('fcf / share')) key = 'fcfPerShare';
    else if (nameLower.includes('fcf')) key = 'fcf';
    else if (nameLower.includes('dividendo') || nameLower.includes('dividend')) key = 'dividends';
    else if (nameLower.includes('libre') || nameLower.includes('free')) key = 'libre';

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
        const formatted = formatFinancialValue(Math.abs(Number(fallbackVal)), lang);
        if (row.values[0] === '—') row.values[0] = formatted;
        if (row.values[1] === '—') row.values[1] = formatted;
      }
    }
    row.values = row.values.map((value) => normalizeNumericCell(value, lang));
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
      fcfRow.values[0] = formatFinancialValue(computedFcf, lang);
      if (fcfRow.values[1] === '—' || !fcfRow.values[1]) fcfRow.values[1] = fcfRow.values[0];
    }
  }

  const fcfPerShareRow = horizon.cashFlow.rows.find((r) => /fcf\/acción|fcf \/ acción|fcf\/share|fcf \/ share/i.test(String(r.name)));
  const sharesNum = Number(extracted.shares);
  if (fcfPerShareRow && (fcfPerShareRow.values[0] === '—' || !fcfPerShareRow.values[0]) && Number.isFinite(sharesNum) && sharesNum > 0) {
    const fcfVal = parseFinancialValue(fcfRow?.values?.[0]);
    if (Number.isFinite(fcfVal)) {
      const perShareStr = `${formatTwoDecimals(fcfVal / sharesNum, lang)} $`;
      fcfPerShareRow.values[0] = perShareStr;
      if (fcfPerShareRow.values[1] === '—' || !fcfPerShareRow.values[1]) fcfPerShareRow.values[1] = perShareStr;
    }
  }

  const libreRow = horizon.cashFlow.rows.find((r) => {
    const name = String(r.name).toLowerCase();
    return name === 'libre' || name === 'free' || name.startsWith('libre*') || name.startsWith('free*');
  });
  const divRowRef = horizon.cashFlow.rows.find((r) => /dividendo|dividend/i.test(String(r.name)));
  if (libreRow && (libreRow.values[0] === '—' || !libreRow.values[0])) {
    const fcfVal = parseFinancialValue(fcfRow?.values?.[0]);
    const divVal = parseFinancialValue(divRowRef?.values?.[0]);
    if (Number.isFinite(fcfVal)) {
      const computedLibre = fcfVal - (Number.isFinite(divVal) ? Math.abs(divVal) : 0);
      libreRow.values[0] = formatFinancialValue(computedLibre, lang);
      if (libreRow.values[1] === '—' || !libreRow.values[1]) libreRow.values[1] = libreRow.values[0];
    }
  }

  // Asegurar notas del cash flow
  horizon.cashFlow.notes = (Array.isArray(horizon.cashFlow.notes) ? [...horizon.cashFlow.notes] : [])
    .filter((n) => !/deducido del acumulado|flujo trimestral deducido|deduced from the accumulated|quarterly flow deduced/i.test(String(n)));

  const expNote = isTrimestral ? wcInfo?.explanation3M : wcInfo?.explanationYtd;
  if (expNote) {
    const noteText = `*1: ${expNote.replace(/^\*\d+:?\s*/, '')}`;
    const idx = horizon.cashFlow.notes.findIndex((n) => /WK|circulante|Cuentas por pagar|working capital|accounts payable/i.test(n));
    if (idx !== -1) horizon.cashFlow.notes[idx] = noteText;
    else horizon.cashFlow.notes.push(noteText);
  }
  if (taxNorm) {
    const baseTaxNote = `*2: ${taxNorm.explanation.replace(/^\*\d+:?\s*/, '')}`;
    const taxNote = taxChainNote ? `${baseTaxNote} ${taxChainNote}` : baseTaxNote;
    const idx = horizon.cashFlow.notes.findIndex((n) => /impuestos|taxes/i.test(n));
    if (idx !== -1) horizon.cashFlow.notes[idx] = taxNote;
    else horizon.cashFlow.notes.push(taxNote);
  }
}

export function normalizeCapitalBlock(horizon, extracted, language = 'es') {
  const lang = normalizeLanguage(language);
  if (!horizon.capital?.rows) return;
  const isTrimestral = isTrimestralHorizon(horizon);
  const capData = isTrimestral ? extracted.capitalAllocationData?.threeMonths : extracted.capitalAllocationData?.ytd;

  // Sincronizar fila Libre con la fila Libre de Cash Flow
  const cfLibreRow = horizon.cashFlow?.rows?.find((r) => {
    const name = String(r.name).toLowerCase();
    return name.includes('libre') || name.includes('free');
  });
  const libreVal = cfLibreRow
    ? (Array.isArray(cfLibreRow.values) && cfLibreRow.values.length ? cfLibreRow.values[0] : cfLibreRow.value)
    : (capData?.libre != null ? formatCellNumber(capData.libre, lang) : null);

  const freeName = t('Libre', null, lang);
  let capLibreRow = horizon.capital.rows.find((r) => {
    const name = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
    return name === 'libre' || name === 'free';
  });
  if (!capLibreRow) {
    capLibreRow = { name: freeName, value: libreVal ? String(libreVal) : '0' };
    horizon.capital.rows.unshift(capLibreRow);
  } else if (libreVal) {
    capLibreRow.value = String(libreVal);
  }

  // Deuda y Caja
  const findCapitalRow = (matcher) => horizon.capital.rows.find((r) => {
    const name = String(r.name).replace(/\*\d+/g, '').trim();
    return matcher.test(name);
  });
  const ensureCapitalRow = (matcher, name, value) => {
    const num = toFiniteNumber(value);
    if (num == null || num === 0) return null;
    let row = findCapitalRow(matcher);
    if (!row) {
      const totalIdx = horizon.capital.rows.findIndex((r) => String(r.name).toLowerCase().includes('total'));
      row = { name, value: formatCellNumber(num, lang) };
      if (totalIdx === -1) horizon.capital.rows.push(row);
      else horizon.capital.rows.splice(totalIdx, 0, row);
    } else if (!Number.isFinite(parseLooseReportNumber(row.value)) || parseLooseReportNumber(row.value) === 0) {
      row.value = formatCellNumber(num, lang);
    }
    return row;
  };

  ensureCapitalRow(/^(deuda|debt)\b(?!\s*(neta|net))/i, t('Deuda', null, lang), capData?.deuda);
  ensureCapitalRow(/^(caja|cash)\b(?!.*(restringid|restricted|escrow))/i, t('Caja', null, lang), capData?.caja);
  ensureCapitalRow(/^(inversiones?|short[- ]?term investments?)\b|marketable|valores/i, t('Inversiones a corto plazo', null, lang), capData?.inversionesCortoPlazo);
  ensureCapitalRow(/recompra|buyback|treasury/i, t('Recompras', null, lang), capData?.buybacks);
  ensureCapitalRow(/adquisic|acquisition/i, t('Adquisiciones', null, lang), capData?.acquisitions);
  if (isTrimestral) {
    ensureCapitalRow(
      /desinver|divestit|venta de marcas|asset sale/i,
      t('Desinversiones', null, lang),
      (toFiniteNumber(capData?.divestitures) || 0) + (toFiniteNumber(capData?.assetSales) || 0),
    );
  }

  // Efectivo restringido: variación material de tesorería consignada (escrow, colateral, adquisiciones)
  const restrictedMovement = toFiniteNumber(capData?.restrictedCashMovement);
  if (restrictedMovement != null && restrictedMovement !== 0) {
    const restrictedRow = horizon.capital.rows.find((r) => /restringid|escrow|restricted/i.test(String(r.name)));
    if (!restrictedRow) {
      const totalIdx = horizon.capital.rows.findIndex((r) => String(r.name).toLowerCase().includes('total'));
      const restrictedName = t('Efectivo restringido', null, lang);
      const newRow = { name: restrictedName, value: formatCellNumber(restrictedMovement, lang) };
      if (totalIdx === -1) horizon.capital.rows.push(newRow);
      else horizon.capital.rows.splice(totalIdx, 0, newRow);
    } else if (!Number.isFinite(parseLooseReportNumber(restrictedRow.value)) || parseLooseReportNumber(restrictedRow.value) === 0) {
      restrictedRow.value = formatCellNumber(restrictedMovement, lang);
    }
    const targetRow = horizon.capital.rows.find((r) => /restringid|escrow|restricted/i.test(String(r.name)));
    const notes = Array.isArray(horizon.capital.notes) ? horizon.capital.notes : [];
    if (!notes.some((n) => /restringid|escrow|restricted/i.test(String(n)))) {
      const existingMatch = String(targetRow?.name || '').match(/\*(\d+)/);
      const nextNum = existingMatch
        ? Number(existingMatch[1])
        : 1 + notes.reduce((max, n) => {
          const match = String(n).match(/\*(\d+)/);
          return match ? Math.max(max, Number(match[1])) : max;
        }, 0);
      notes.push(`*${nextNum}: ${buildRestrictedCashNote(extracted, isTrimestral, restrictedMovement, lang)}`);
      if (!existingMatch && targetRow) targetRow.name = `${targetRow.name}*${nextNum}`;
      horizon.capital.notes = notes;
    }
  }

  // Desinversiones: la fila debe sumar ventas de negocios/marcas y ventas de activos fijos
  if (!isTrimestral) {
    const totalDivestitures = Math.round(((Number(capData?.divestitures) || 0) + (Number(capData?.assetSales) || 0)) * 10) / 10;
    if (totalDivestitures >= 50) {
      const divestitureRow = horizon.capital.rows.find((r) => /desinver|venta de marcas|divestit/i.test(String(r.name)));
      if (!divestitureRow) {
        const totalIdx = horizon.capital.rows.findIndex((r) => String(r.name).toLowerCase().includes('total'));
        const newRow = { name: t('Desinversiones', null, lang), value: formatCellNumber(totalDivestitures, lang) };
        if (totalIdx === -1) horizon.capital.rows.push(newRow);
        else horizon.capital.rows.splice(totalIdx, 0, newRow);
      } else {
        const current = parseLooseReportNumber(divestitureRow.value);
        if (!Number.isFinite(current) || totalDivestitures - current >= 50) {
          divestitureRow.value = formatCellNumber(totalDivestitures, lang);
        }
      }
    }
  }

  // Recalcular suma total
  let sum = 0;
  let totalRow = horizon.capital.rows.find((r) => String(r.name).toLowerCase().includes('total'));
  if (!totalRow) {
    totalRow = { name: t('En total', null, lang), value: '0' };
    horizon.capital.rows.push(totalRow);
  }

  horizon.capital.rows.forEach((r) => {
    if (String(r.name).toLowerCase().includes('total')) return;
    const num = parseLooseReportNumber(r.value);
    if (Number.isFinite(num)) sum += num;
  });
  totalRow.value = formatCellNumber(sum, lang);

  const libreAbs = (() => {
    const row = horizon.capital.rows.find((r) => /^(libre|free)\b/i.test(String(r.name).replace(/\*\d+/g, '').trim()));
    const num = parseLooseReportNumber(row?.value);
    return Number.isFinite(num) ? Math.abs(num) : 0;
  })();
  const grossMovements = horizon.capital.rows.reduce((acc, r) => {
    if (String(r.name).toLowerCase().includes('total')) return acc;
    const num = parseLooseReportNumber(r.value);
    return acc + (Number.isFinite(num) ? Math.abs(num) : 0);
  }, 0);
  const threshold = Math.max(50, libreAbs * 0.2, grossMovements * 0.1);
  horizon.capital.verification = Math.abs(sum) <= threshold
    ? t('Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle.', null, lang)
    : t('No cuadra: quedan {amount} sin explicar entre el capital libre y los usos detectados. El desfase corresponde a partidas no mapeadas o a movimientos no monetarios y reclasificaciones de balance (efectivo restringido, efecto divisa en caja, deuda asumida en compras o reclasificaciones entre caja e inversiones) que deben revisarse en las notas de flujos y balance del informe.', {
      amount: formatSignedFinancial(sum, lang),
    }, lang);
}
