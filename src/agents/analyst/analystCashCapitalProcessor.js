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

  // Guarda de cordura: un dividendo desproporcionado frente al Cash Flow Operativo (p. ej. una
  // cifra leída en otra sección o en otra unidad) se descarta en vez de romper FCF/Libre/capital.
  if (targetVals?.dividends && targetVals?.cfo) {
    const cfoBase = parseFinancialValue(targetVals.cfo[0]);
    const divBase = parseFinancialValue(targetVals.dividends[0]);
    if (Number.isFinite(cfoBase) && Number.isFinite(divBase) && Math.abs(divBase) > Math.max(Math.abs(cfoBase) * 5, 1000)) {
      targetVals.dividends = ['0', '0'];
      if (targetVals.fcf) targetVals.libre = [targetVals.fcf[0] ?? '0', targetVals.fcf[1] ?? '0'];
      console.warn(`[analysis] Dividendo descartado por importe implausible: ${divBase}M vs Cash Flow ${cfoBase}M`);
    }
  }

  const defaultAdjusted = t('Ajustado*1', null, lang);
  const withWcNote = (label) => {
    const text = String(label ?? '').trim();
    if (!text || /\*\d/.test(text)) return text;
    return text.replace(/^(\S+)/, '$1*1');
  };
  const scenarios = targetScenarios && targetScenarios.length === 2
    ? [targetScenarios[0], withWcNote(targetScenarios[1])]
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

  const expNoteRaw = isTrimestral ? wcInfo?.explanation3M : wcInfo?.explanationYtd;
  if (expNoteRaw) {
    // La fórmula del circulante se rotula siempre «WC» (coherente con la cabecera «WC=valor»);
    // si la IA escribió «WK», se normaliza aquí.
    const expNote = String(expNoteRaw).replace(/\bWK\b/g, 'WC');
    const noteText = `*1: ${expNote.replace(/^\*\d+:?\s*/, '')}`;
    const idx = horizon.cashFlow.notes.findIndex((n) => /W[KC]|circulante|Cuentas por pagar|working capital|accounts payable/i.test(n));
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
  const rows = horizon.capital.rows;
  const readingNotes = () => (Array.isArray(horizon.capital.notes) ? horizon.capital.notes : []);

  // Sincronizar fila Libre con la fila Libre de Cash Flow
  const cfLibreRow = horizon.cashFlow?.rows?.find((r) => {
    const name = String(r.name).toLowerCase();
    return name.includes('libre') || name.includes('free');
  });
  const libreVal = cfLibreRow
    ? (Array.isArray(cfLibreRow.values) && cfLibreRow.values.length ? cfLibreRow.values[0] : cfLibreRow.value)
    : (capData?.libre != null ? formatCellNumber(capData.libre, lang) : null);

  const freeName = t('Libre', null, lang);
  let capLibreRow = rows.find((r) => {
    const name = String(r.name).replace(/\*\d+/g, '').trim().toLowerCase();
    return name === 'libre' || name === 'free';
  });
  if (!capLibreRow) {
    capLibreRow = { name: freeName, value: libreVal ? String(libreVal) : '0' };
    rows.unshift(capLibreRow);
  } else if (libreVal) {
    capLibreRow.value = String(libreVal);
  }

  const isTotalRow = (row) => String(row?.name ?? '').toLowerCase().includes('total');
  const cleanCapitalName = (row) => String(row?.name ?? '').replace(/\*\d+/g, '').trim();
  const findCapitalRow = (matcher) => rows.find((r) => matcher.test(cleanCapitalName(r)));
  const insertBeforeTotal = (row) => {
    const totalIdx = rows.findIndex(isTotalRow);
    if (totalIdx === -1) rows.push(row);
    else rows.splice(totalIdx, 0, row);
  };
  const noteLabelOf = (row) => {
    const match = String(row?.name ?? '').match(/\*(\d+)/);
    return match ? `*${match[1]}` : null;
  };
  const nextNoteNumber = () => 1 + readingNotes().reduce((max, note) => {
    const match = String(note).match(/\*(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const dropCapitalRow = (matcher) => {
    const idx = rows.findIndex((r) => matcher.test(cleanCapitalName(r)));
    if (idx === -1) return;
    const [removed] = rows.splice(idx, 1);
    const label = noteLabelOf(removed);
    if (label) {
      horizon.capital.notes = readingNotes().filter((note) => !String(note).trim().startsWith(`${label}:`));
    }
  };
  // Fija la fila con el valor calculado por el sistema (fuente de verdad matemática):
  // si el cálculo es 0 no existe fila material, así que se elimina cualquier fila de la IA.
  const setCapitalRow = (matcher, name, value) => {
    const num = toFiniteNumber(value);
    if (num == null) return null;
    if (num === 0) {
      dropCapitalRow(matcher);
      return null;
    }
    let row = findCapitalRow(matcher);
    if (!row) {
      row = { name, value: formatCellNumber(num, lang) };
      insertBeforeTotal(row);
    } else {
      row.value = formatCellNumber(num, lang);
    }
    return row;
  };

  setCapitalRow(/^(deuda|debt)\b(?!\s*(neta|net|asumid|assumed))/i, t('Deuda', null, lang), capData?.deuda);
  setCapitalRow(/^(caja|cash)\b(?!.*(restringid|restricted|escrow))/i, t('Caja', null, lang), capData?.caja);
  setCapitalRow(/^(inversiones?|short[- ]?term investments?)\b|marketable|valores/i, t('Inversiones a corto plazo', null, lang), capData?.inversionesCortoPlazo);
  // Recompras: solo si son materiales (>= 50M), igual que el resto de partidas.
  const buybacks = toFiniteNumber(capData?.buybacks);
  if (buybacks != null) {
    setCapitalRow(/recompra|buyback|treasury/i, t('Recompras', null, lang), Math.abs(buybacks) >= 50 ? buybacks : 0);
  }
  setCapitalRow(/adquisic|acquisition/i, t('Adquisiciones', null, lang), capData?.acquisitions);
  setCapitalRow(/preferent|preferred/i, t('Emisión de preferentes', null, lang), capData?.preferredIssuance);
  setCapitalRow(/participacion|non-?controlling|minority|noncontrolling/i, t('Venta de participaciones', null, lang), capData?.nonControllingSale);

  // Desinversiones: la fila debe sumar ventas de negocios/marcas y ventas de activos fijos (>= 50M)
  const divestitures = toFiniteNumber(capData?.divestitures);
  const assetSales = toFiniteNumber(capData?.assetSales);
  if (divestitures != null || assetSales != null) {
    const totalDivestitures = Math.round(((divestitures ?? 0) + (assetSales ?? 0)) * 10) / 10;
    setCapitalRow(
      /desinver|divestit|venta de marcas|asset sale/i,
      t('Desinversiones', null, lang),
      totalDivestitures >= 50 ? totalDivestitures : 0,
    );
  }

  // Los movimientos que NO pasan por caja (deuda no monetaria) no se pintan como filas: la tabla
  // solo incluye movimientos de caja y, si el cuadre no cierra, se explican bajo la tabla con su
  // importe exacto. EXCEPCIÓN: el efectivo restringido (escrow) material se pinta como fila cuando
  // es la contrapartida de una operación del periodo: liberación que paga una adquisición (KDP Q2)
  // o consignación financiada con deuda/equity del trimestre a la espera del cierre (KDP Q1). Sin
  // esa fila la tabla no se entiende y el ajuste oculto parecía un parche contable.
  const capitalAdjustments = [];
  const pushCapitalAdjustment = (matcher, value, label) => {
    dropCapitalRow(matcher);
    const num = toFiniteNumber(value);
    if (num != null && num !== 0) capitalAdjustments.push({ value: num, label });
  };
  const escrowMovement = toFiniteNumber(capData?.restrictedCashMovement);
  const acquisitionsAbs = Math.abs(toFiniteNumber(capData?.acquisitions) ?? 0);
  const preferredRaised = Math.max(toFiniteNumber(capData?.preferredIssuance) ?? 0, 0);
  const nonControllingRaised = Math.max(toFiniteNumber(capData?.nonControllingSale) ?? 0, 0);
  const debtRaised = Math.max(toFiniteNumber(capData?.deuda) ?? 0, 0);
  const financingRaised = preferredRaised + nonControllingRaised + debtRaised;
  const escrowFundsAcquisition = escrowMovement != null
    && Math.abs(escrowMovement) >= 100
    && acquisitionsAbs >= 100
    && Math.abs(escrowMovement) >= acquisitionsAbs * 0.25;
  const escrowConsigned = escrowMovement != null
    && escrowMovement <= -100
    && financingRaised >= 100;
  if (escrowFundsAcquisition || escrowConsigned) {
    const escrowRow = setCapitalRow(/restringid|escrow|restricted/i, t('Efectivo restringido (escrow)', null, lang), escrowMovement);
    if (escrowRow) {
      const escrowNum = nextNoteNumber();
      escrowRow.name = `${cleanCapitalName(escrowRow)}*${escrowNum}`;
      const prevRestrictedRaw = isTrimestral
        ? (extracted.balance?.restrictedCashPreviousQuarter
          ?? (Number(extracted.fiscalQuarter) === 1 ? extracted.balance?.restrictedCashBeginningOfYear : null))
        : extracted.balance?.restrictedCashBeginningOfYear;
      const prevRestricted = toFiniteNumber(prevRestrictedRaw);
      const currRestricted = toFiniteNumber(extracted.balance?.restrictedCash);
      const amountText = formatFinancialValue(Math.abs(escrowMovement), lang);
      const ytdData = extracted.capitalAllocationData?.ytd ?? {};
      const preferredYtd = toFiniteNumber(ytdData.preferredIssuance);
      const nonControllingYtd = toFiniteNumber(ytdData.nonControllingSale);
      const hasPreferred = preferredYtd != null && Math.abs(preferredYtd) >= 50;
      const hasNonControlling = nonControllingYtd != null && Math.abs(nonControllingYtd) >= 50;
      let balancePart;
      let fundingPart = '';
      if (escrowMovement > 0) {
        balancePart = prevRestricted != null && currRestricted != null
          ? t('El efectivo restringido pasa de {prev}M a {curr}M; la liberación de {amount}M financió la adquisición del periodo ({acq}M).', {
            prev: formatFinancialValue(prevRestricted, lang),
            curr: formatFinancialValue(currRestricted, lang),
            amount: amountText,
            acq: formatFinancialValue(acquisitionsAbs, lang),
          }, lang)
          : t('La variación de efectivo restringido de {amount}M financió la adquisición del periodo ({acq}M).', {
            amount: amountText,
            acq: formatFinancialValue(acquisitionsAbs, lang),
          }, lang);
        if (hasPreferred && hasNonControlling) {
          fundingPart = t(' Ese efectivo se consignó con la financiación levantada en trimestres anteriores (la emisión de preferentes (+{preferred}M) y la venta de participaciones (+{nonControlling}M), visibles en el acumulado).', {
            preferred: formatFinancialValue(Math.abs(preferredYtd), lang),
            nonControlling: formatFinancialValue(Math.abs(nonControllingYtd), lang),
          }, lang);
        } else if (hasPreferred) {
          fundingPart = t(' Ese efectivo se consignó con la financiación levantada en trimestres anteriores (la emisión de preferentes (+{preferred}M), visible en el acumulado).', {
            preferred: formatFinancialValue(Math.abs(preferredYtd), lang),
          }, lang);
        } else if (hasNonControlling) {
          fundingPart = t(' Ese efectivo se consignó con la financiación levantada en trimestres anteriores (la venta de participaciones (+{nonControlling}M), visible en el acumulado).', {
            nonControlling: formatFinancialValue(Math.abs(nonControllingYtd), lang),
          }, lang);
        }
      } else {
        balancePart = prevRestricted != null && currRestricted != null
          ? t('El efectivo restringido pasa de {prev}M a {curr}M; la consignación de {amount}M queda segregada en el balance para una operación pendiente de cierre.', {
            prev: formatFinancialValue(prevRestricted, lang),
            curr: formatFinancialValue(currRestricted, lang),
            amount: amountText,
          }, lang)
          : t('La consignación de {amount}M queda segregada en el balance como efectivo restringido para una operación pendiente de cierre.', {
            amount: amountText,
          }, lang);
        const fundingItems = [];
        if (preferredRaised >= 50) {
          fundingItems.push(t('la emisión de preferentes (+{amount}M)', { amount: formatFinancialValue(preferredRaised, lang) }, lang));
        }
        if (nonControllingRaised >= 50) {
          fundingItems.push(t('la venta de participaciones (+{amount}M)', { amount: formatFinancialValue(nonControllingRaised, lang) }, lang));
        }
        if (debtRaised >= 100) {
          fundingItems.push(t('la deuda del periodo (+{amount}M)', { amount: formatFinancialValue(debtRaised, lang) }, lang));
        }
        if (fundingItems.length) {
          fundingPart = t(' Se financió con {list}.', { list: fundingItems.join('; ') }, lang);
        }
      }
      horizon.capital.notes = [...readingNotes(), `*${escrowNum}: ${balancePart}${fundingPart}`];
    }
  } else {
    pushCapitalAdjustment(
      /restringid|escrow|restricted/i,
      capData?.restrictedCashMovement,
      t('efectivo restringido (consignaciones o liberaciones)', null, lang),
    );
  }
  pushCapitalAdjustment(
    /no monetaria|non-cash debt/i,
    capData?.nonCashDebt != null ? -capData.nonCashDebt : null,
    t('deuda no monetaria (recompras o amortizaciones anticipadas de deuda con ganancia o pérdida, efecto divisa)', null, lang),
  );
  horizon.capital.notes = readingNotes().filter((note) => !/^\*\d+:\s*(efectivo restringido|restricted cash|deuda no monetaria|non-cash debt)/i.test(String(note).trim()));

  // Garantía determinista: la nota de Deuda/Caja balance SIEMPRE existe si el sistema conoce
  // los datos de balance, aunque la IA la haya omitido; las filas se reapuntan a la nota real.
  // Se hace ANTES de la deuda asumida para que esta no ocupe el número de la nota de balance
  // y deje las filas Deuda/Caja apuntando a una nota que no les corresponde.
  const notesHave = (re) => readingNotes().some((note) => re.test(String(note)));
  const labelOfNote = (re) => {
    const note = readingNotes().find((item) => re.test(String(item)));
    const match = String(note ?? '').match(/^\*(\d+):/);
    return match ? `*${match[1]}` : null;
  };
  const needsDebt = Boolean(capData?.debtDetails) && !notesHave(/Deuda balance/i);
  const needsCash = Boolean(capData?.cashDetails) && !notesHave(/Caja balance/i);
  let nextNum = null;
  if (needsDebt || needsCash) {
    nextNum = nextNoteNumber();
    const combined = [needsDebt ? capData.debtDetails : null, needsCash ? capData.cashDetails : null].filter(Boolean).join(' ');
    horizon.capital.notes = [...readingNotes(), `*${nextNum}: ${combined}`];
  }
  const debtLabel = needsDebt ? `*${nextNum}` : labelOfNote(/Deuda balance/i);
  const cashLabel = needsCash ? `*${nextNum}` : labelOfNote(/Caja balance/i);
  const refExists = (label) => readingNotes().some((note) => String(note).trim().startsWith(`${label}:`));
  rows.forEach((row) => {
    const clean = cleanCapitalName(row);
    const label = noteLabelOf(row);
    const isDebt = /^(deuda|debt)\b(?!\s*(neta|net|asumid|assumed))/i.test(clean);
    const isCash = /^(caja|cash)\b(?!.*(restringid|restricted|escrow))/i.test(clean);
    const target = (isDebt && debtLabel) || (isCash && cashLabel) || null;
    if (target && (!label || !refExists(label))) {
      row.name = `${clean}${target}`;
    }
  });

  // Deuda asumida (no-cash): solo existe si el sistema detecta deuda asumida en una compra material.
  // Si el cálculo es 0 se elimina la fila (evita duplicar la variación de deuda del balance).
  const assumedDebt = toFiniteNumber(capData?.assumedDebt);
  if (assumedDebt != null && assumedDebt !== 0) {
    const assumedRow = setCapitalRow(/asumid|assumed/i, t('Deuda asumida (no-cash)', null, lang), -Math.abs(assumedDebt));
    const capitalNotes = readingNotes();
    const hasAssumedNote = capitalNotes.some((n) => /asumid|assumed debt/i.test(String(n)));
    if (!hasAssumedNote) {
      const nextAssumedNum = nextNoteNumber();
      const noteText = t('Deuda asumida (no-cash): {amount}M de deuda preexistente de la empresa adquirida se asume con la compra; no supone entrada de caja y se resta en el cuadre.', {
        amount: formatFinancialValue(Math.abs(assumedDebt), lang),
      }, lang);
      if (assumedRow) assumedRow.name = `${cleanCapitalName(assumedRow)}*${nextAssumedNum}`;
      horizon.capital.notes = [...capitalNotes, `*${nextAssumedNum}: ${noteText}`];
    }
  } else if (assumedDebt === 0) {
    dropCapitalRow(/asumid|assumed/i);
    horizon.capital.notes = readingNotes().filter((note) => {
      const text = String(note);
      if (!/asumid|assumed debt|no-cash/i.test(text)) return true;
      return /deuda balance|debt balance/i.test(text);
    });
  }

  // Las filas sin importe (0) no se muestran: solo Libre y En total son obligatorias.
  for (let idx = rows.length - 1; idx >= 0; idx -= 1) {
    const row = rows[idx];
    if (isTotalRow(row)) continue;
    if (/^(libre|free)\b/i.test(cleanCapitalName(row))) continue;
    const num = parseLooseReportNumber(row?.value);
    if (Number.isFinite(num) && num === 0) rows.splice(idx, 1);
  }

  // Recalcular suma total
  let sum = 0;
  let totalRow = rows.find(isTotalRow);
  if (!totalRow) {
    totalRow = { name: t('En total', null, lang), value: '0' };
    rows.push(totalRow);
  }

  rows.forEach((r) => {
    if (isTotalRow(r)) return;
    const num = parseLooseReportNumber(r.value);
    if (Number.isFinite(num)) sum += num;
  });
  totalRow.value = formatCellNumber(sum, lang);

  const libreAbs = (() => {
    const row = rows.find((r) => /^(libre|free)\b/i.test(cleanCapitalName(r)));
    const num = parseLooseReportNumber(row?.value);
    return Number.isFinite(num) ? Math.abs(num) : 0;
  })();
  const grossMovements = rows.reduce((acc, r) => {
    if (isTotalRow(r)) return acc;
    const num = parseLooseReportNumber(r.value);
    return acc + (Number.isFinite(num) ? Math.abs(num) : 0);
  }, 0);
  const threshold = Math.max(50, libreAbs * 0.2, grossMovements * 0.1);
  // El veredicto final se calcula sobre el resto DESPUÉS de tener en cuenta los movimientos que no
  // pasan por caja: si con ellos el descuadre entra en el margen, el cuadre es razonable (KDP Q2:
  // -17.432 de tabla + 17.782 de escrow = +350, dentro del margen de una operación de 16.615M).
  const explainedByAdjustments = capitalAdjustments.reduce((acc, item) => acc + item.value, 0);
  const netAfterAdjustments = Math.round((sum + explainedByAdjustments) * 10) / 10;
  const verdictValue = capitalAdjustments.length ? netAfterAdjustments : sum;
  const buildAdjustmentsExplanation = () => {
    const explained = capitalAdjustments.reduce((acc, item) => acc + item.value, 0);
    const net = Math.round((sum + explained) * 10) / 10;
    const list = capitalAdjustments
      .map((item) => `${item.label} ${formatSignedFinancial(item.value, lang)}`)
      .join('; ');
    const narrowsGap = Math.abs(net) < Math.abs(sum) - 0.05;
    let tail;
    if (Math.abs(net) <= threshold) {
      tail = t('Con ellos, el resto sin explicar sería {net}, dentro del margen razonable.', {
        net: formatSignedFinancial(net, lang),
      }, lang);
    } else if (narrowsGap) {
      tail = t('Con ellos, el resto sin explicar sería {net}, que corresponde a partidas no mapeadas o reclasificaciones pendientes de revisar en las notas del informe.', {
        net: formatSignedFinancial(net, lang),
      }, lang);
    } else {
      // Los movimientos no monetarios tienen el mismo signo que el descuadre: no lo explican.
      // No se puede afirmar que "el resto" sea eso; falta un movimiento de caja por mapear.
      tail = t('Estos movimientos no reducen el descuadre: el resto sin explicar sería {net}, así que faltan movimientos de caja por mapear (adquisiciones, desinversiones, deuda o caja) antes de atribuirlo a reclasificaciones.', {
        net: formatSignedFinancial(net, lang),
      }, lang);
    }
    return { list, tail };
  };
  if (Math.abs(verdictValue) <= threshold) {
    let text = t('Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle.', null, lang);
    // Aunque el cuadre entre en el umbral, el descuadre se explica bajo la tabla cuando el sistema
    // conoce los movimientos que no pasan por caja que lo componen.
    if (capitalAdjustments.length && Math.abs(sum) > 0.5) {
      const { list, tail } = buildAdjustmentsExplanation();
      text = `${text} ${t('La tabla solo incluye movimientos de caja; los siguientes no pasan por caja: {list}. {tail}', { list, tail }, lang)}`;
    }
    horizon.capital.verification = text;
    return;
  }
  if (capitalAdjustments.length) {
    const { list, tail } = buildAdjustmentsExplanation();
    horizon.capital.verification = t('No cuadra: quedan {amount} sin explicar entre el capital libre y los usos detectados. La tabla solo incluye movimientos de caja; los siguientes no pasan por caja: {list}. {tail}', {
      amount: formatSignedFinancial(sum, lang),
      list,
      tail,
    }, lang);
  } else {
    horizon.capital.verification = t('No cuadra: quedan {amount} sin explicar entre el capital libre y los usos detectados. El desfase corresponde a partidas no mapeadas o a movimientos no monetarios y reclasificaciones de balance (efectivo restringido, efecto divisa en caja, deuda asumida en compras o reclasificaciones entre caja e inversiones) que deben revisarse en las notas de flujos y balance del informe.', {
      amount: formatSignedFinancial(sum, lang),
    }, lang);
  }
}
