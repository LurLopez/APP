/**
 * @fileoverview Módulo extraído de analystHorizonProcessor.js.
 */

import { parseFinancialValue, formatFinancialValue, formatCellNumber } from './financialParsers.js';
import {
  getSectorPolicy,
  resolveImpairmentAddBack,
  resolveExcludedIntangibleImpairment,
  resolveDiscardedImpairment,
} from './sectorPolicy.js';
import { t, formatPercent, normalizeLanguage } from '../../utils/i18n.js';

const TAX_NORMALIZATION_RATE = 0.23;
const TAX_DEVIATION_LIMIT = 0.2;

/**
 * Resuelve el gasto por impuestos reportado del periodo: el hecho extraído o,
 * si no consta, la diferencia entre el EBT y el beneficio neto reportados.
 * @param {object} params - Datos del periodo.
 * @returns {number} Gasto fiscal reportado en millones o NaN.
 */
function resolveReportedTaxExpense({ facts, isTrimestral, ebtNormal, netNormal }) {
  const key = isTrimestral ? 'incomeTaxExpenseQuarter' : 'incomeTaxExpenseYtd';
  const fromFacts = Number(facts?.[key]);
  if (Number.isFinite(fromFacts) && fromFacts !== 0) return fromFacts;
  if (Number.isFinite(ebtNormal) && Number.isFinite(netNormal)) return ebtNormal - netNormal;
  return NaN;
}

/**
 * Decide si el impuesto debe normalizarse al 23 % del EBT ajustado por superar
 * el umbral de ±20 %. La desviación se mide sobre el tipo efectivo del periodo
 * reportado (impuesto reportado / EBT normal frente al 23 % de referencia); así los
 * deterioros y amortizaciones sumados de vuelta no distorsionan la comparación.
 * Devuelve null cuando no procede normalizar o faltan datos.
 * @param {object} params - Cifras de la columna.
 * @returns {object|null} Datos de la normalización (incluida la cifra neta ajustada).
 */
function resolveTaxNormalization({ ebtNormal, ebtAdjusted, netNormal, reportedTax, isPrevious = false }) {
  if (![ebtNormal, ebtAdjusted, netNormal, reportedTax].every(Number.isFinite)) return null;
  if (ebtNormal <= 0 || ebtAdjusted <= 0) return null;
  const referenceTax = ebtNormal * TAX_NORMALIZATION_RATE;
  if (referenceTax <= 0) return null;
  const deviation = (reportedTax - referenceTax) / referenceTax;
  if (Math.abs(deviation) <= TAX_DEVIATION_LIMIT) return null;
  const normalizedTax = ebtAdjusted * TAX_NORMALIZATION_RATE;
  // Participación no controladora implícita si la base del beneficio neto es la atribuible.
  const impliedNci = ebtNormal - netNormal - reportedTax;
  const nciDeduction = !isPrevious && impliedNci > 0 && impliedNci < normalizedTax * 0.5 ? impliedNci : 0;
  const adjustedNet = Math.round((ebtAdjusted * (1 - TAX_NORMALIZATION_RATE) - nciDeduction) * 100) / 100;
  return { ebtNormal, ebtAdjusted, netNormal, reportedTax, normalizedTax, deviation, adjustedNet };
}

/**
 * Redacta la nota fiscal (*2) con el cierre exacto que figura en la tabla.
 * @param {object} data - Resultado de resolveTaxNormalization.
 * @param {string} lang - Idioma del informe.
 * @returns {string} Texto de la nota, sin el marcador.
 */
function buildTaxNormalizationNote(data, lang) {
  const fmt = (value) => `${formatCellNumber(value, lang)}M`;
  const rateText = data.ebtNormal > 0 && data.reportedTax > 0
    ? ` ${t('(tipo efectivo del {rate} %)', { rate: formatCellNumber((data.reportedTax / data.ebtNormal) * 100, lang) }, lang)}`
    : '';
  return t('Impuestos: el gasto fiscal reportado fue {reported} sobre un EBT de {ebt}{rateText}. La desviación de su tipo efectivo frente al 23 % de referencia es del {deviation}, fuera del umbral de ±20 %, por lo que se normaliza el gasto al 23 % del EBT ajustado ({ebtAdjusted}): Beneficio Neto Ajustado = EBT Ajustado × 0,77 = {adjustedNet}.', {
    reported: fmt(data.reportedTax),
    ebt: fmt(data.ebtNormal),
    rateText,
    deviation: formatPercent(data.deviation * 100, { digits: 2, lang }),
    ebtAdjusted: fmt(data.ebtAdjusted),
    adjustedNet: fmt(data.adjustedNet),
  }, lang);
}

export function normalizeSalesBlock(horizon, extracted, language = 'es', sector = null) {
  const lang = normalizeLanguage(language);
  if (!horizon.sales?.rows) return;
  const policy = getSectorPolicy(sector ?? extracted?.sector);
  const labelUpper = String(horizon.label).toUpperCase();
  const isTrimestral = labelUpper.includes('ÚLTIMOS')
    || labelUpper.includes('3 MESES')
    || labelUpper.includes('LAST 3 MONTHS')
    || labelUpper.includes('THREE MONTHS');
  const facts = extracted.facts ?? {};
  const currSuffix = isTrimestral ? 'Quarter' : 'Ytd';
  const prevSuffix = isTrimestral ? 'PrevQuarter' : 'PrevYtd';
  // Solo se suma de vuelta la parte de deterioro que la política sectorial permite
  // (en tecnología: fondo de comercio sí; intangibles/marcas/activos no).
  const prevImpairment = resolveImpairmentAddBack(facts, prevSuffix, policy);
  const currImpairment = resolveImpairmentAddBack(facts, currSuffix, policy);
  // Parte de deterioro de intangibles que la política mantiene como coste (no revertida).
  const excludedPrevIntangible = resolveExcludedIntangibleImpairment(facts, prevSuffix, policy);
  const excludedCurrIntangible = resolveExcludedIntangibleImpairment(facts, currSuffix, policy);
  const amortization = isTrimestral
    ? (Number(extracted.facts?.intangiblesAmortizationQuarter) || 0)
    : (Number(extracted.facts?.intangiblesAmortizationYtd) || Number(extracted.facts?.intangiblesAmortization) || 0);
  const tolerance = Math.max(
    20,
    Math.abs(amortization) * 0.05,
    Math.abs(excludedCurrIntangible) * 0.05,
    Math.abs(excludedPrevIntangible) * 0.05,
  );

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
      // El Beneficio Bruto se calcula de forma determinista como ventas − coste de ventas cuando
      // la extracción trae "cogs": el modelo no siempre encuentra la línea (Amazon no publica
      // "Gross profit") y llegó a copiar las ventas o a mezclar columnas del comparativo.
      if (reportedKey === 'grossProfit') {
        const sales = Number(rep.sales);
        const cogs = Number(rep.cogs);
        if (Number.isFinite(sales) && Number.isFinite(cogs)) return Math.round((sales - cogs) * 100) / 100;
        const gross = Number(rep.grossProfit);
        // Un "grossProfit" idéntico a las ventas es una copia, no un margen del 100 %: se descarta.
        if (Number.isFinite(gross) && !(Number.isFinite(sales) && sales > 0 && Math.abs(gross - sales) < 0.5)) return rep.grossProfit;
        return null;
      }
      if (rep[reportedKey] != null) return rep[reportedKey];
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
      const formatReported = (val) => (val != null && Number.isFinite(Number(val)) ? `${formatFinancialValue(Number(val), lang)}M` : null);
      // Solo se impone la cifra de la extracción cuando la métrica viene explícita (o el
      // Beneficio Bruto se puede calcular con ventas y coste de ventas); los fallbacks entre
      // métricas solo rellenan huecos, no sobrescriben lo que el informe ya trae.
      const hasExactMetric = (rep) => rep != null
        && (rep[reportedKey] != null
          || (reportedKey === 'grossProfit' && Number.isFinite(Number(rep.sales)) && Number.isFinite(Number(rep.cogs))));
      const normalFill = formatReported(resolveReportedMetric(reported));
      const prevFill = formatReported(resolveReportedMetric(reportedPrev));
      const exactNormal = hasExactMetric(reported) ? normalFill : null;
      const exactPrev = hasExactMetric(reportedPrev) ? prevFill : null;
      if (normalFill && (!row.normal || row.normal === '—')) row.normal = normalFill;
      if (prevFill && (!row.prevNormal || row.prevNormal === '—')) row.prevNormal = prevFill;
      // La cifra oficial de la extracción manda sobre la fila escrita por el modelo (evita
      // Beneficio Bruto = Ventas u otros arrastres). La columna Ajustado solo se sincroniza si
      // era una copia de la Normal; los ajustes propios se aplican después.
      if (exactNormal) {
        const officialNormal = parseFinancialValue(exactNormal);
        const existingNormal = parseFinancialValue(row.normal);
        if (!Number.isFinite(existingNormal) || Math.abs(existingNormal - officialNormal) >= 0.5) {
          const adjustedWasCopy = !Number.isFinite(parseFinancialValue(row.adjusted))
            || row.adjusted === '—'
            || (Number.isFinite(existingNormal) && Math.abs(parseFinancialValue(row.adjusted) - existingNormal) < 0.05);
          row.normal = exactNormal;
          if (adjustedWasCopy) row.adjusted = exactNormal;
        }
      }
      if (exactPrev) {
        const officialPrev = parseFinancialValue(exactPrev);
        const existingPrev = parseFinancialValue(row.prevNormal);
        const existingPrevAdjusted = parseFinancialValue(row.prevAdjusted);
        const prevAdjustedIsJustCopy = !Number.isFinite(existingPrevAdjusted)
          || (Number.isFinite(existingPrev) && Math.abs(existingPrevAdjusted - existingPrev) < 0.05);
        if (!Number.isFinite(existingPrev) || Math.abs(officialPrev - existingPrev) >= 0.5) {
          row.prevNormal = exactPrev;
          if (prevAdjustedIsJustCopy) row.prevAdjusted = exactPrev;
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

  // Guarda anti-copia del Beneficio Bruto: si la extracción no trae ni coste de ventas ni un
  // beneficio bruto válido y la fila del modelo copió las ventas (margen del 100 % imposible),
  // se deja sin dato en vez de publicar una cifra inventada (McDonald's no publica "Gross
  // profit"; el modelo copió las ventas antes de que la extracción trajera los costes directos).
  const salesRowRef = horizon.sales.rows.find((row) => /venta|sales|ingreso/i.test(String(row.name)));
  const grossRowRef = horizon.sales.rows.find((row) => /bruto|gross/i.test(String(row.name)));
  if (salesRowRef && grossRowRef) {
    const reportedPeriod = isTrimestral ? (extracted.quarter ?? {}) : (extracted.ytd ?? {});
    const reportedPrevPeriod = reportedPeriod?.prev ?? {};
    const hasGrossSource = (rep) => Number.isFinite(Number(rep?.cogs)) || rep?.grossProfit != null;
    const blankIfSalesCopy = (normalKey, adjustedKey) => {
      const salesValue = parseFinancialValue(salesRowRef[normalKey]);
      const grossValue = parseFinancialValue(grossRowRef[normalKey]);
      if (!Number.isFinite(salesValue) || salesValue <= 0) return;
      if (!Number.isFinite(grossValue) || Math.abs(grossValue - salesValue) >= 0.5) return;
      grossRowRef[normalKey] = '—';
      grossRowRef[adjustedKey] = '—';
    };
    if (!hasGrossSource(reportedPeriod)) {
      blankIfSalesCopy('normal', 'adjusted');
      grossRowRef.pctNormal = undefined;
      grossRowRef.pctAdjusted = undefined;
    }
    if (!hasGrossSource(reportedPrevPeriod)) {
      blankIfSalesCopy('prevNormal', 'prevAdjusted');
      grossRowRef.pctAdjusted = undefined;
    }
  }

  // Política sectorial de intangibles: la amortización recurrente de intangibles y el
  // deterioro de intangibles/marcas/activos no se suman de vuelta en tecnología. Si el
  // modelo los añadió a la columna Ajustado, se revierten para que la cifra quede como
  // Normal (+ los deterioros de fondo de comercio permitidos por la política).
  const discardedExtras = [
    policy.intangibleAmortizationAddBack ? 0 : Math.abs(amortization),
    Math.abs(excludedCurrIntangible),
    resolveDiscardedImpairment(facts, currSuffix, policy),
  ].filter((amount) => amount > 0);
  const discardedPrevExtras = [
    Math.abs(excludedPrevIntangible),
    resolveDiscardedImpairment(facts, prevSuffix, policy),
  ].filter((amount) => amount > 0);
  if (discardedExtras.length > 0 || discardedPrevExtras.length > 0) {
    const recomputeAdjustedPct = (row) => {
      if (!row) return;
      const a = parseFinancialValue(row.adjusted);
      const b = parseFinancialValue(row.prevAdjusted);
      if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) {
        row.pctAdjusted = formatPercent(((a - b) / Math.abs(b)) * 100, { digits: 2, lang });
      }
    };
    const rollback = (target, legitAdjustment, extras, normalKey = 'normal', adjustedKey = 'adjusted') => {
      if (!target || !extras.length) return null;
      const normVal = parseFinancialValue(target[normalKey]);
      const adjVal = parseFinancialValue(target[adjustedKey]);
      if (!Number.isFinite(normVal) || !Number.isFinite(adjVal)) return null;
      const candidates = [];
      for (let mask = (1 << extras.length) - 1; mask >= 1; mask -= 1) {
        let removed = 0;
        for (let i = 0; i < extras.length; i += 1) {
          if (mask & (1 << i)) removed += extras[i];
        }
        candidates.push({ expected: normVal + legitAdjustment + removed, fixed: normVal + legitAdjustment, removed });
        candidates.push({ expected: normVal + removed, fixed: normVal, removed });
      }
      const match = candidates.find(({ expected }) => Math.abs(adjVal - expected) <= tolerance);
      if (!match) return null;
      target[adjustedKey] = `${Math.round(match.fixed)}M`;
      return { previous: adjVal, previousNorm: normVal, removedExtras: match.removed };
    };

    const opRow = horizon.sales.rows.find((row) => {
      const name = String(row.name).toLowerCase();
      return name.includes('operativ') || name.includes('operating');
    });
    const ebtRow = horizon.sales.rows.find((row) => String(row.name).toLowerCase().includes('ebt'));
    const netRow = horizon.sales.rows.find((row) => {
      const name = String(row.name).toLowerCase();
      return name.includes('neto') || name.includes('net income');
    });

    const opRollback = rollback(opRow, currImpairment, discardedExtras);
    const ebtRollback = rollback(ebtRow, currImpairment, discardedExtras);

    if (opRollback) {
      if (currImpairment >= 30) {
        opRow.isAdjusted = true;
        if (!opRow.adjustedNote) opRow.adjustedNote = '*1';
      } else {
        opRow.isAdjusted = false;
        opRow.adjustedNote = undefined;
      }
    }

    if (ebtRollback && netRow) {
      const netNorm = parseFinancialValue(netRow.normal);
      const netAdj = parseFinancialValue(netRow.adjusted);
      if (Number.isFinite(netNorm) && Number.isFinite(netAdj)) {
        const netDiff = netAdj - netNorm;
        const ebtDiff = ebtRollback.previous - ebtRollback.previousNorm;
        let ratio = ebtDiff !== 0 ? netDiff / ebtDiff : 0;
        if (!(ratio > 0.5 && ratio < 1.05)) ratio = 0.77;
        // Solo se revierte la parte posimpuestos de los extras que el modelo sumó de verdad.
        const removed = ebtRollback.removedExtras * ratio;
        if (netDiff >= removed - tolerance) {
          netRow.adjusted = `${Math.round(netNorm + (netDiff - removed))}M`;
        }
      }
    }

    // Reversión del periodo anterior (columna "Anterior Ajustado"): el deterioro de
    // intangibles del periodo comparable tampoco se revierte.
    if (discardedPrevExtras.length > 0) {
      rollback(opRow, prevImpairment, discardedPrevExtras, 'prevNormal', 'prevAdjusted');
      rollback(ebtRow, prevImpairment, discardedPrevExtras, 'prevNormal', 'prevAdjusted');
      const ebtPrevNorm = parseFinancialValue(ebtRow?.prevNormal);
      const netPrevNorm = parseFinancialValue(netRow?.prevNormal);
      const netPrevAdj = parseFinancialValue(netRow?.prevAdjusted);
      if (Number.isFinite(ebtPrevNorm) && Number.isFinite(netPrevNorm) && Number.isFinite(netPrevAdj)) {
        const netCandidates = [
          { expected: (ebtPrevNorm + prevImpairment + excludedPrevIntangible) * 0.77, fixed: (ebtPrevNorm + prevImpairment) * 0.77 },
          { expected: (ebtPrevNorm + excludedPrevIntangible) * 0.77, fixed: ebtPrevNorm * 0.77 },
        ];
        const netTolerance = Math.max(20, Math.abs(excludedPrevIntangible) * 0.77 * 0.05);
        const netMatch = netCandidates.find(({ expected }) => Math.abs(netPrevAdj - expected) <= netTolerance);
        if (netMatch) netRow.prevAdjusted = `${Math.round(netMatch.fixed)}M`;
      }
    }

    if (opRollback) recomputeAdjustedPct(opRow);
    if (ebtRollback) recomputeAdjustedPct(ebtRow);
    if (ebtRollback && netRow) recomputeAdjustedPct(netRow);
    if (discardedPrevExtras.length > 0) {
      recomputeAdjustedPct(opRow);
      recomputeAdjustedPct(ebtRow);
      recomputeAdjustedPct(netRow);
    }
  }

  // Normalización fiscal determinista (±20 %): la regla no admite que la columna Ajustado
  // conserve el impuesto reportado cuando el tipo efectivo del periodo se desvía más del
  // umbral del 23 % de referencia. Si el modelo no la aplicó (o no la aplicó bien), se
  // corrige aquí y la nota fiscal se reescribe para que cierre exactamente con la tabla.
  const taxEbtRow = horizon.sales.rows.find((row) => {
    const name = String(row.name).toLowerCase();
    return name.includes('ebt') || name.includes('before tax');
  });
  const taxNetRow = horizon.sales.rows.find((row) => {
    const name = String(row.name).toLowerCase();
    return name.includes('neto') || name.includes('net income');
  });
  const recomputeAdjustedPctFor = (row) => {
    if (!row) return;
    const a = parseFinancialValue(row.adjusted);
    const b = parseFinancialValue(row.prevAdjusted);
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) {
      row.pctAdjusted = formatPercent(((a - b) / Math.abs(b)) * 100, { digits: 2, lang });
    }
  };

  // Partidas no operativas extraordinarias/no recurrentes (revalorizaciones no realizadas de
  // inversiones, plusvalías puntuales): se excluyen del EBT Ajustado y del Beneficio Neto
  // Ajustado (efecto después de impuestos al 23 % normalizado). El EBT es la casilla de origen
  // del ajuste —lleva el resalte y la nota—; el Beneficio Neto cambia en cascada sin resalte.
  let nonOperatingApplied = null;
  if (taxEbtRow && taxNetRow) {
    const columns = [
      { isPrevious: false, gains: Number(facts[`nonOperatingGains${currSuffix}`]) },
      { isPrevious: true, gains: Number(facts[`nonOperatingGains${prevSuffix}`]) },
    ].filter((column) => Number.isFinite(column.gains) && column.gains > 0);
    const appliedGains = [];
    for (const column of columns) {
      const normalKey = column.isPrevious ? 'prevNormal' : 'normal';
      const adjustedKey = column.isPrevious ? 'prevAdjusted' : 'adjusted';
      const ebtNormalVal = parseFinancialValue(taxEbtRow[normalKey]);
      if (!Number.isFinite(ebtNormalVal) || ebtNormalVal <= 0) continue;
      if (column.gains < Math.max(50, ebtNormalVal * 0.05)) continue;
      const ebtBase = parseFinancialValue(taxEbtRow[adjustedKey]);
      if (!Number.isFinite(ebtBase) || ebtBase - column.gains < 0) continue;
      const netEffect = Math.round(column.gains * (1 - TAX_NORMALIZATION_RATE) * 100) / 100;
      taxEbtRow[adjustedKey] = `${formatFinancialValue(ebtBase - column.gains, lang)}M`;
      const netBase = parseFinancialValue(taxNetRow[adjustedKey]);
      if (Number.isFinite(netBase)) {
        taxNetRow[adjustedKey] = `${formatCellNumber(netBase - netEffect, lang)}M`;
      }
      appliedGains.push({ ...column, netEffect });
      console.info(`[analyst] Partida no operativa no recurrente excluida (${horizon.label}${column.isPrevious ? ', Anterior Ajustado' : ''}): -${column.gains}M en EBT`);
    }
    if (appliedGains.length) {
      nonOperatingApplied = {
        current: appliedGains.find((item) => !item.isPrevious) ?? null,
        previous: appliedGains.find((item) => item.isPrevious) ?? null,
      };
      recomputeAdjustedPctFor(taxEbtRow);
      recomputeAdjustedPctFor(taxNetRow);
    }
  }

  let currentTaxNormalization = null;
  if (taxEbtRow && taxNetRow) {
    const ebtNormal = parseFinancialValue(taxEbtRow.normal);
    const ebtAdjusted = parseFinancialValue(taxEbtRow.adjusted);
    const netNormal = parseFinancialValue(taxNetRow.normal);
    const reportedTax = resolveReportedTaxExpense({ facts, isTrimestral, ebtNormal, netNormal });
    currentTaxNormalization = resolveTaxNormalization({ ebtNormal, ebtAdjusted, netNormal, reportedTax });
    if (currentTaxNormalization) {
      taxNetRow.adjusted = `${formatCellNumber(currentTaxNormalization.adjustedNet, lang)}M`;
      taxNetRow.isAdjusted = true;
      recomputeAdjustedPctFor(taxNetRow);
      console.info(`[analyst] Normalización fiscal aplicada (${horizon.label}): EBT ajustado ${ebtAdjusted}M, impuesto reportado ${reportedTax}M, desviación ${(currentTaxNormalization.deviation * 100).toFixed(2)} % -> Beneficio Neto Ajustado ${taxNetRow.adjusted}`);
    }
  }

  // La columna Anterior Ajustado sigue la misma regla: si el impuesto del ejercicio
  // comparable se desvía más del ±20 %, se normaliza al 23 % del EBT ajustado.
  if (taxEbtRow && taxNetRow) {
    const prevEbtNormal = parseFinancialValue(taxEbtRow.prevNormal);
    const prevEbtAdjusted = parseFinancialValue(taxEbtRow.prevAdjusted);
    const prevNetNormal = parseFinancialValue(taxNetRow.prevNormal);
    const previousTaxNormalization = resolveTaxNormalization({
      ebtNormal: prevEbtNormal,
      ebtAdjusted: prevEbtAdjusted,
      netNormal: prevNetNormal,
      reportedTax: prevEbtNormal - prevNetNormal,
      isPrevious: true,
    });
    if (previousTaxNormalization) {
      taxNetRow.prevAdjusted = `${formatCellNumber(previousTaxNormalization.adjustedNet, lang)}M`;
      recomputeAdjustedPctFor(taxNetRow);
    }
  }

  // Notas al pie de ventas
  horizon.sales.notes = Array.isArray(horizon.sales.notes) ? [...horizon.sales.notes] : [];

  if (currentTaxNormalization && taxNetRow) {
    const isTaxNote = (note) => {
      const str = String(note);
      return /impuesto|fiscal|\btax/i.test(str) && !/deterioro|impairment|amortizaci/i.test(str);
    };
    const existingIdx = horizon.sales.notes.findIndex(isTaxNote);
    const existingMarker = existingIdx !== -1 ? String(horizon.sales.notes[existingIdx]).match(/^\*(\d+)/) : null;
    const usedMarkers = new Set(horizon.sales.notes
      .map((note) => String(note).match(/^\*(\d+)/)?.[1])
      .filter(Boolean));
    const noteNumber = existingMarker
      ? existingMarker[1]
      : (usedMarkers.has('2') ? String(horizon.sales.notes.length + 1) : '2');
    const taxNote = `*${noteNumber}: ${buildTaxNormalizationNote(currentTaxNormalization, lang)}`;
    if (existingIdx !== -1) horizon.sales.notes[existingIdx] = taxNote;
    else horizon.sales.notes.push(taxNote);
    taxNetRow.adjustedNote = `*${noteNumber}`;
  }

  // La nota de la partida no operativa se escribe de forma determinista en el EBT (casilla de
  // origen). Las notas del modelo que hablan de esa partida se eliminan (afirmaban que no se
  // ajustaba) y, si el gasto fiscal sigue sin normalizarse, la nota fiscal también se reescribe
  // para que ninguna nota contradiga las cifras de la tabla.
  if (nonOperatingApplied) {
    const nextFreeMarker = () => {
      const used = new Set(horizon.sales.notes
        .map((note) => String(note).match(/^\*(\d+)/)?.[1])
        .filter(Boolean));
      let marker = 1;
      while (used.has(String(marker))) marker += 1;
      return String(marker);
    };
    const description = String(facts.nonOperatingGainsDescription ?? '').trim();
    const noteParts = [];
    if (nonOperatingApplied.current) {
      noteParts.push(t('Partidas no operativas no recurrentes: se excluye del EBT Ajustado la partida de {gains}M del periodo por no ser resultado recurrente del negocio; el Beneficio Neto Ajustado resta su efecto después de impuestos al 23 % ({netEffect}M).', {
        gains: formatFinancialValue(nonOperatingApplied.current.gains, lang),
        netEffect: formatCellNumber(nonOperatingApplied.current.netEffect, lang),
      }, lang));
    }
    if (description) {
      noteParts.push(t('Descripción de la partida: {description}.', { description }, lang));
    }
    if (nonOperatingApplied.previous) {
      noteParts.push(t('También se excluye la partida no recurrente de {gainsPrev}M del periodo comparable (Anterior Ajustado).', {
        gainsPrev: formatFinancialValue(nonOperatingApplied.previous.gains, lang),
      }, lang));
    }
    horizon.sales.notes = horizon.sales.notes.filter((note) => !/no operativ|non-operating|revaloriz|upward adjustment/i.test(String(note)));
    const gainsMarker = nextFreeMarker();
    horizon.sales.notes.push(`*${gainsMarker}: ${noteParts.join(' ')}`);
    const gainsNoteIdx = horizon.sales.notes.length - 1;
    if (nonOperatingApplied.current) {
      taxEbtRow.isAdjusted = true;
      taxEbtRow.adjustedNote = `*${gainsMarker}`;
    }
    if (!currentTaxNormalization) {
      const isTaxNote = (note) => {
        const str = String(note);
        return /impuesto|fiscal|\btax/i.test(str) && !/deterioro|impairment|amortizaci/i.test(str);
      };
      // La propia nota de la partida no operativa no debe confundirse con la nota fiscal.
      const taxIdx = horizon.sales.notes.findIndex((note, idx) => idx !== gainsNoteIdx && isTaxNote(note));
      const taxMarker = taxIdx !== -1 ? String(horizon.sales.notes[taxIdx]).match(/^\*(\d+)/) : null;
      const taxNumber = taxMarker ? taxMarker[1] : nextFreeMarker();
      const ebtNormal = parseFinancialValue(taxEbtRow.normal);
      const reportedTax = resolveReportedTaxExpense({
        facts,
        isTrimestral,
        ebtNormal,
        netNormal: parseFinancialValue(taxNetRow.normal),
      });
      const rateText = Number.isFinite(reportedTax) && Number.isFinite(ebtNormal) && ebtNormal > 0
        ? ` ${t('(tipo efectivo del {rate} %)', { rate: formatCellNumber((reportedTax / ebtNormal) * 100, lang) }, lang)}`
        : '';
      const netAdjustedText = formatCellNumber(parseFinancialValue(taxNetRow.adjusted), lang);
      const text = t('Impuestos: el gasto fiscal reportado fue {reported}M sobre un EBT de {ebt}M{rateText}. No procede normalizar el gasto, que ya incluye el impuesto asociado a la partida no recurrente excluida; el Beneficio Neto Ajustado queda en {netAdj}M.', {
        reported: Number.isFinite(reportedTax) ? formatFinancialValue(reportedTax, lang) : '—',
        ebt: Number.isFinite(ebtNormal) ? formatFinancialValue(ebtNormal, lang) : '—',
        rateText,
        netAdj: netAdjustedText ?? '—',
      }, lang);
      const taxNote = `*${taxNumber}: ${text}`;
      if (taxIdx !== -1) horizon.sales.notes[taxIdx] = taxNote;
      else horizon.sales.notes.push(taxNote);
      taxNetRow.adjustedNote = `*${taxNumber}`;
      taxNetRow.isAdjusted = true;
    }
  }
  const onlyGoodwillAddBack = policy.goodwillImpairmentAddBack && !policy.intangibleImpairmentAddBack;
  const prevFiscalYear = Number(extracted.fiscalYear) ? Number(extracted.fiscalYear) - 1 : null;
  const hasPrevImpairmentNote = horizon.sales.notes.some((n) => {
    const str = String(n);
    if (!/deterioro|impairment/i.test(str)) return false;
    if (/anterior|previo|prior|previous|last year/i.test(str)) return true;
    return Number.isFinite(prevFiscalYear) && str.includes(String(prevFiscalYear));
  });
  if (prevImpairment >= 50 && !hasPrevImpairmentNote) {
    const text = onlyGoodwillAddBack
      ? 'El año anterior tuvieron un deterioro de fondo de comercio de {amount}M.'
      : 'El año anterior tuvieron un impairment de {amount}M.';
    const nextIdx = horizon.sales.notes.length + 1;
    horizon.sales.notes.push(`*${nextIdx}: ${t(text, { amount: Math.round(prevImpairment) }, lang)}`);
  }
  if (currImpairment >= 50 && !horizon.sales.notes.some((n) => n.includes('depreciación') || n.includes('impairment') || n.includes('deterioro') || n.includes('intangible'))) {
    const text = onlyGoodwillAddBack
      ? 'Ha habido un deterioro de fondo de comercio de {amount}M.'
      : 'Ha habido una depreciación de intangibles de {amount}M.';
    const nextIdx = horizon.sales.notes.length + 1;
    horizon.sales.notes.push(`*${nextIdx}: ${t(text, { amount: Math.round(currImpairment) }, lang)}`);
  }
  if (excludedCurrIntangible >= 50 && !horizon.sales.notes.some((n) => {
    const str = String(n).toLowerCase();
    return str.includes('se mantiene como coste') || str.includes('permanece como coste') || str.includes('no se revierte') || str.includes('no se ajusta') || str.includes('no se suma de vuelta');
  })) {
    const nextIdx = horizon.sales.notes.length + 1;
    horizon.sales.notes.push(`*${nextIdx}: ${t('El deterioro de intangibles de {amount}M se mantiene como coste en la columna Ajustado y no se revierte.', { amount: Math.round(excludedCurrIntangible) }, lang)}`);
  }

  // Las notas se muestran por orden de llamada (*1, *2, *3...), independientemente del orden en
  // que las generen los distintos ajustes deterministas.
  horizon.sales.notes.sort((a, b) => {
    const markerA = Number(String(a).match(/^\*(\d+)/)?.[1] ?? Number.POSITIVE_INFINITY);
    const markerB = Number(String(b).match(/^\*(\d+)/)?.[1] ?? Number.POSITIVE_INFINITY);
    return markerA - markerB;
  });
}
