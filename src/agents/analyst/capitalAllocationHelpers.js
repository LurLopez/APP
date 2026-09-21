/**
 * @fileoverview Lógica auxiliar para conciliación de deuda, caja, asignación de capital y fondo de maniobra (WK).
 * @module agents/analyst/capitalAllocationHelpers
 */

import { t, normalizeLanguage } from '../../utils/i18n.js';
import { parseLooseReportNumber } from './financialParsers.js';
import { resolveSectorByTicker } from '../sectorAgent.js';
import { getAssumedDebtPolicy, isBusinessAcquisitionDescription } from './sectorPolicy.js';

export function formatWcNumber(value, language = 'es') {
  if (!Number.isFinite(Number(value))) return '0';
  const rounded = String(Math.round(Number(value) * 10) / 10);
  return language === 'en' ? rounded : rounded.replace('.', ',');
}

function toFiniteNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = parseLooseReportNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Normaliza un campo de extracción a número (0 si falta o no es parseable). */
function factNumber(value) {
  return toFiniteNumber(value) ?? 0;
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

export function buildDebtDetails({ prev, curr, prevCash, currCash, prevSti, currSti, fallback, language = 'es' }) {
  const lang = normalizeLanguage(language);
  if (prev != null && curr != null) {
    const diff = Math.round((curr - prev) * 10) / 10;
    const diffText = `${diff > 0 ? '+' : ''}${formatWcNumber(diff, lang)}`;
    let netPart = '';
    if (prevCash != null && currCash != null) {
      const prevNet = Math.round((prev - prevCash - (prevSti ?? 0)) * 10) / 10;
      const currNet = Math.round((curr - currCash - (currSti ?? 0)) * 10) / 10;
      const diffNet = Math.round((currNet - prevNet) * 10) / 10;
      netPart = t('. Deuda neta: {prevNet}M -> {currNet}M ({diffNet}M)', {
        prevNet: formatWcNumber(prevNet, lang),
        currNet: formatWcNumber(currNet, lang),
        diffNet: `${diffNet > 0 ? '+' : ''}${formatWcNumber(diffNet, lang)}`,
      }, lang);
    }
    return t('Deuda balance: {prev}M -> {curr}M ({diff}M){netPart}', {
      prev: formatWcNumber(prev, lang),
      curr: formatWcNumber(curr, lang),
      diff: diffText,
      netPart,
    }, lang);
  }
  return fallback ?? null;
}

export function buildCashMovementDetails({ prev, curr, caja, periodYear, prevLabel: prevLabelOverride, currLabel: currLabelOverride, statementChange, language = 'es' }) {
  const lang = normalizeLanguage(language);
  if (prev == null || curr == null) return null;
  const delta = Math.round((curr - prev) * 10) / 10;
  const deltaText = `${delta > 0 ? '+' : ''}${formatWcNumber(delta, lang)}M`;
  const rowValue = caja != null ? `${Number(caja) > 0 ? '+' : ''}${formatWcNumber(caja, lang)}M` : '—';
  const year = Number(periodYear);
  const prevLabel = prevLabelOverride ?? (Number.isFinite(year) ? ` (${year - 1})` : '');
  const currLabel = currLabelOverride ?? (Number.isFinite(year) ? ` (${year})` : '');
  const meaning = delta >= 0
    ? t('la caja aumentó: uso de capital (-)', null, lang)
    : t('la caja disminuyó: fuente de liquidez (+)', null, lang);
  let statementNote = '';
  const statement = statementChange == null || statementChange === '' ? NaN : Number(statementChange);
  if (Number.isFinite(statement) && Math.abs(statement - delta) >= 1) {
    const diff = Math.round((statement - delta) * 10) / 10;
    statementNote = t(' El estado de flujos presenta un neto de {amount}M porque incluye efectivo restringido y otros ajustes ({diff}M frente a la caja del balance).', {
      amount: formatWcNumber(statement, lang),
      diff: `${diff > 0 ? '+' : ''}${formatWcNumber(diff, lang)}`,
    }, lang);
  }
  return t('Caja balance: {prev}M{prevLabel} -> {curr}M{currLabel} ({delta}); {meaning}; fila Caja = {rowValue}.{statementNote}', {
    prev: formatWcNumber(prev, lang),
    prevLabel,
    curr: formatWcNumber(curr, lang),
    currLabel,
    delta: deltaText,
    meaning,
    rowValue,
    statementNote,
  }, lang);
}

export function buildWcDeviationSentence({ reported, wcReq, deviation, cfo, adjusted, language = 'es' }) {
  const lang = normalizeLanguage(language);
  const base = t('Desviación del circulante reportado ({reported}M) frente al WC teórico ({wcReq}M): {deviation}M.', {
    reported: formatWcNumber(reported, lang),
    wcReq: formatWcNumber(wcReq, lang),
    deviation: formatWcNumber(deviation, lang),
  }, lang);
  if (Number.isFinite(Number(cfo)) && Number.isFinite(Number(adjusted))) {
    return t('{base} El Cash Flow tras el ajuste de circulante queda en: {cfo}M - ({deviation}M) = {adjusted}M.', {
      base,
      cfo: formatWcNumber(cfo, lang),
      deviation: formatWcNumber(deviation, lang),
      adjusted: formatWcNumber(adjusted, lang),
    }, lang);
  }
  return base;
}

export function buildCapitalAllocationFromBalance(extracted, language = 'es', sector = null, isAnnual = false) {
  const lang = normalizeLanguage(language);
  const resolvedSector = sector || extracted?.sector || (extracted?.ticker ? resolveSectorByTicker(extracted.ticker) : null);
  const assumedDebtPolicy = getAssumedDebtPolicy(resolvedSector);
  const bal = extracted.balance ?? {};
  const invDiff3M = (bal.shortTermInvestments != null && bal.shortTermInvestmentsPreviousQuarter != null)
    ? Number(bal.shortTermInvestments) - Number(bal.shortTermInvestmentsPreviousQuarter)
    : 0;
  const invDiffYtd = (bal.shortTermInvestments != null)
    ? Number(bal.shortTermInvestments) - (bal.shortTermInvestmentsBeginningOfYear != null ? Number(bal.shortTermInvestmentsBeginningOfYear) : 0)
    : 0;
  const rawDivYtd = factNumber(extracted.facts?.brandDivestitures);
  const divestitureItemsProceeds = (Array.isArray(extracted.annualDetails?.divestitures?.items)
    ? extracted.annualDetails.divestitures.items
    : []).reduce((acc, item) => acc + Math.abs(factNumber(item?.proceeds)), 0);
  const divestituresYtd = Math.max(rawDivYtd, Math.round(divestitureItemsProceeds * 10) / 10);
  const buybacksYtd = factNumber(extracted.facts?.shareBuybacks);
  const buybacksQuarterRaw = toFiniteNumber(extracted.facts?.shareBuybacksQuarter);
  // Magnitudes positivas: el neto de la fila es ventas − compras. La IA puede devolver las
  // compras con el signo del estado de flujos (entre paréntesis = negativas) y el respaldo de
  // texto también, así que se normaliza el signo aquí para no invertir el neto.
  const marketablePurchasesQuarter = Math.abs(factNumber(extracted.facts?.purchasesOfMarketableSecuritiesQuarter));
  const marketablePurchasesYtd = Math.abs(factNumber(extracted.facts?.purchasesOfMarketableSecuritiesYtd));
  const marketableProceedsQuarter = Math.abs(factNumber(extracted.facts?.proceedsFromSaleOfMarketableSecuritiesQuarter));
  const marketableProceedsYtd = Math.abs(factNumber(extracted.facts?.proceedsFromSaleOfMarketableSecuritiesYtd));
  const acquisitionsQuarter = factNumber(extracted.facts?.acquisitionsQuarter);
  const acquisitionsYtd = factNumber(extracted.facts?.acquisitionsYtd);
  const assetSalesQuarter = factNumber(extracted.facts?.assetSalesQuarter);
  const assetSalesYtd = factNumber(extracted.facts?.assetSalesYtd);
  const acquisitionDescription = extracted.facts?.acquisitionDescription ?? null;
  const divestitureDescription = extracted.facts?.divestitureDescription ?? null;
  const preferredYtdRaw = factNumber(extracted.facts?.preferredIssuanceYtd);
  const nonControllingYtdRaw = factNumber(extracted.facts?.nonControllingSaleYtd);
  const debtCashYtdRaw = toFiniteNumber(extracted.facts?.debtCashFlowYtd);
  const systemDebtCash = extracted.systemDebtCash ?? {};
  const systemDebtCashYtd = toFiniteNumber(systemDebtCash.ytd);
  const systemDebtCashQuarter = toFiniteNumber(systemDebtCash.quarter);
  // En consumo discrecional se prioriza la composición XBRL del sistema (más fiable que el
  // parser de texto para el flujo neto de deuda) y se exige descripción de compra de negocio.
  const debtCashForAssumedDebt = (assumedDebtPolicy.preferSystemDebtCash && Number.isFinite(systemDebtCashYtd))
    ? systemDebtCashYtd
    : debtCashYtdRaw;
  const fiscalQuarterNumber = Number(extracted.fiscalQuarter);
  const debtDeltaYtd = (bal.totalDebt != null && bal.totalDebtBeginningOfYear != null)
    ? Number(bal.totalDebt) - Number(bal.totalDebtBeginningOfYear)
    : null;
  const hasBusinessAcquisitionEvidence = !assumedDebtPolicy.requireBusinessAcquisitionEvidence
    || isBusinessAcquisitionDescription(acquisitionDescription);
  const assumedDebtCandidate = (debtDeltaYtd != null && Number.isFinite(debtCashForAssumedDebt) && acquisitionsYtd >= 50 && hasBusinessAcquisitionEvidence)
    ? Math.round((debtDeltaYtd - debtCashForAssumedDebt) * 10) / 10
    : 0;
  // Si la divergencia explica casi toda la variación de deuda del balance, lo más probable es
  // que sea deuda nueva captada en efectivo (con su flujo mal leído) y no deuda asumida de la
  // empresa adquirida: en ese caso no se pinta la fila (evita inventar cientos de millones).
  const assumedDebtRatio = debtDeltaYtd ? Math.abs(assumedDebtCandidate) / Math.abs(debtDeltaYtd) : 1;
  const assumedDebtYtd = assumedDebtCandidate >= 50 && assumedDebtRatio <= assumedDebtPolicy.maxDebtDeltaRatio
    ? assumedDebtCandidate
    : 0;
  const restrictedCurr = toFiniteNumber(extracted.balance?.restrictedCash);
  // En Q1 no hay trimestre previo (applyPreviousQuarterCashFlow no se ejecuta): el saldo de
  // partida es el de inicio de año, que sí viene en el balance comparativo del 10-Q.
  const restrictedPreviousRaw = toFiniteNumber(extracted.balance?.restrictedCashPreviousQuarter)
    ?? (Number(extracted.fiscalQuarter) === 1 ? toFiniteNumber(extracted.balance?.restrictedCashBeginningOfYear) : null);
  const restrictedStart = toFiniteNumber(extracted.balance?.restrictedCashBeginningOfYear);
  const restrictedPrevious = (restrictedPreviousRaw === 0 && ((restrictedStart ?? 0) > 0 || (restrictedCurr ?? 0) > 0))
    ? null
    : restrictedPreviousRaw;
  const restrictedDiff3M = (restrictedCurr != null && restrictedPrevious != null)
    ? restrictedCurr - restrictedPrevious
    : null;
  const restrictedDiffYtd = (restrictedCurr != null && restrictedStart != null)
    ? restrictedCurr - restrictedStart
    : null;

  const acquisitions3MAbs = acquisitionsQuarter >= 50
    ? acquisitionsQuarter
    : (fiscalQuarterNumber === 1 ? acquisitionsYtd : 0);
  const assumedDebt3M = (acquisitions3MAbs >= 50 && acquisitionsYtd >= 50
    && Math.abs(acquisitions3MAbs - acquisitionsYtd) < 1 && assumedDebtYtd >= 50)
    ? assumedDebtYtd
    : 0;
  // Movimiento no monetario de deuda: diferencia entre la variación del balance y los flujos de
  // deuda del estado de flujos (recompras/amortizaciones anticipadas con ganancia o pérdida,
  // efecto divisa u otras reclasificaciones). Solo se usa la composición XBRL del sistema (no el
  // parser de texto) y, para no inventar filas cuando la fuente está incompleta, la divergencia
  // debe ser material y no superar la mitad de la variación del balance, con el mismo signo.
  const debtDelta3M = (bal.totalDebt != null && bal.totalDebtPreviousQuarter != null)
    ? Math.round((Number(bal.totalDebt) - Number(bal.totalDebtPreviousQuarter)) * 10) / 10
    : null;
  const inNonCashDebtBand = (debtDelta, debtCash) => {
    if (debtDelta == null || debtCash == null || debtDelta === 0) return false;
    if (Math.sign(debtDelta) !== Math.sign(debtCash)) return false;
    const diff = Math.abs(debtDelta - debtCash);
    const absDelta = Math.abs(debtDelta);
    return diff >= Math.max(50, absDelta * 0.1) && diff <= absDelta * 0.5;
  };
  const nonCashDebt3M = (acquisitions3MAbs < 50 && inNonCashDebtBand(debtDelta3M, systemDebtCashQuarter))
    ? Math.round((debtDelta3M - systemDebtCashQuarter) * 10) / 10
    : 0;
  // En el informe anual el flujo neto de deuda viene de EDGAR (XBRL) y es homogéneo con la
  // variación del balance, así que el residual se explica completo aunque supere la variación
  // (efecto divisa y ajustes de valor razonable que no pasan por caja: MCD 2025, +1.627M no
  // monetarios frente a un flujo de -78M). Se resta la deuda asumida ya detectada para no
  // contarla dos veces.
  const annualNonCashDebtYtd = (() => {
    if (debtDeltaYtd == null || systemDebtCashYtd == null || debtDeltaYtd === 0) return 0;
    const residual = Math.round((debtDeltaYtd - systemDebtCashYtd - assumedDebtYtd) * 10) / 10;
    return Math.abs(residual) >= Math.max(50, Math.abs(debtDeltaYtd) * 0.1) ? residual : 0;
  })();
  const nonCashDebtYtd = isAnnual
    ? annualNonCashDebtYtd
    : (acquisitionsYtd < 50 && inNonCashDebtBand(debtDeltaYtd, systemDebtCashYtd))
      ? Math.round((debtDeltaYtd - systemDebtCashYtd) * 10) / 10
      : 0;
  const cashDiff3M = (bal.cash != null && bal.cashPreviousQuarter != null)
    ? Math.round(-(Number(bal.cash) - Number(bal.cashPreviousQuarter)) * 10) / 10
    : null;
  const cashDiffYtd = (bal.cash != null && bal.cashBeginningOfYear != null)
    ? Math.round(-(Number(bal.cash) - Number(bal.cashBeginningOfYear)) * 10) / 10
    : null;

  return {
    threeMonths: {
      libre: null,
      deuda: (bal.totalDebt != null && bal.totalDebtPreviousQuarter != null)
        ? Math.round((Number(bal.totalDebt) - Number(bal.totalDebtPreviousQuarter)) * 10) / 10
        : null,
      caja: cashDiff3M,
      inversionesCortoPlazo: (marketablePurchasesQuarter || marketableProceedsQuarter)
        ? Math.round((marketableProceedsQuarter - marketablePurchasesQuarter) * 10) / 10
        : (Math.abs(invDiff3M) >= 50 ? Math.round(-invDiff3M * 10) / 10 : 0),
      divestitures: 0,
      buybacks: Number(extracted.fiscalQuarter) === 1
        ? -Math.abs(buybacksYtd)
        : (buybacksQuarterRaw != null ? -Math.abs(buybacksQuarterRaw) : 0),
      acquisitions: (() => {
        const raw = Number(extracted.fiscalQuarter) === 1 ? (acquisitionsQuarter || acquisitionsYtd) : acquisitionsQuarter;
        return raw >= 50 ? -Math.abs(raw) : 0;
      })(),
      assetSales: Number(extracted.fiscalQuarter) === 1 ? (assetSalesQuarter || assetSalesYtd) : assetSalesQuarter,
      preferredIssuance: fiscalQuarterNumber === 1 && preferredYtdRaw >= 50 ? preferredYtdRaw : 0,
      nonControllingSale: fiscalQuarterNumber === 1 && nonControllingYtdRaw >= 50 ? nonControllingYtdRaw : 0,
      assumedDebt: assumedDebt3M >= 50 ? assumedDebt3M : 0,
      nonCashDebt: nonCashDebt3M,
      debtDelta: debtDelta3M,
      debtCashFlow: systemDebtCashQuarter,
      restrictedCashMovement: (restrictedDiff3M != null && Math.abs(restrictedDiff3M) >= 50)
        ? Math.round(-restrictedDiff3M * 10) / 10
        : 0,
      acquisitionDescription,
      divestitureDescription,
      debtDetails: buildDebtDetails({
        prev: bal.totalDebtPreviousQuarter != null ? Number(bal.totalDebtPreviousQuarter) : null,
        curr: bal.totalDebt != null ? Number(bal.totalDebt) : null,
        prevCash: bal.cashPreviousQuarter != null ? Number(bal.cashPreviousQuarter) : null,
        currCash: bal.cash != null ? Number(bal.cash) : null,
        prevSti: bal.shortTermInvestmentsPreviousQuarter != null ? Number(bal.shortTermInvestmentsPreviousQuarter) : null,
        currSti: bal.shortTermInvestments != null ? Number(bal.shortTermInvestments) : null,
        language: lang,
      }),
      cashDetails: buildCashMovementDetails({
        prev: bal.cashPreviousQuarter != null ? Number(bal.cashPreviousQuarter) : null,
        curr: bal.cash != null ? Number(bal.cash) : null,
        caja: cashDiff3M,
        periodYear: Number(extracted.fiscalYear) || (extracted.reportingPeriod ? Number(String(extracted.reportingPeriod).slice(0, 4)) : null),
        prevLabel: Number.isFinite(fiscalQuarterNumber) && fiscalQuarterNumber >= 2 ? ` (Q${fiscalQuarterNumber - 1})` : undefined,
        currLabel: Number.isFinite(fiscalQuarterNumber) && fiscalQuarterNumber >= 2 ? ` (Q${fiscalQuarterNumber})` : undefined,
        statementChange: Number(extracted.fiscalQuarter) === 1 ? extracted.facts?.netChangeInCash : undefined,
        language: lang,
      }),
    },
    ytd: {
      libre: null,
      deuda: (bal.totalDebt != null && bal.totalDebtBeginningOfYear != null)
        ? Math.round((Number(bal.totalDebt) - Number(bal.totalDebtBeginningOfYear)) * 10) / 10
        : null,
      caja: cashDiffYtd,
      inversionesCortoPlazo: (marketablePurchasesYtd || marketableProceedsYtd)
        ? Math.round((marketableProceedsYtd - marketablePurchasesYtd) * 10) / 10
        : (Math.abs(invDiffYtd) >= 50 ? Math.round(-invDiffYtd * 10) / 10 : 0),
      divestitures: divestituresYtd >= 50 ? divestituresYtd : 0,
      buybacks: buybacksYtd ? -Math.abs(buybacksYtd) : 0,
      acquisitions: acquisitionsYtd >= 50 ? -Math.abs(acquisitionsYtd) : 0,
      assetSales: assetSalesYtd,
      preferredIssuance: preferredYtdRaw >= 50 ? preferredYtdRaw : 0,
      nonControllingSale: nonControllingYtdRaw >= 50 ? nonControllingYtdRaw : 0,
      assumedDebt: assumedDebtYtd >= 50 ? assumedDebtYtd : 0,
      nonCashDebt: nonCashDebtYtd,
      debtDelta: debtDeltaYtd,
      debtCashFlow: systemDebtCashYtd,
      restrictedCashMovement: (restrictedDiffYtd != null && Math.abs(restrictedDiffYtd) >= 50)
        ? Math.round(-restrictedDiffYtd * 10) / 10
        : 0,
      acquisitionDescription,
      divestitureDescription,
      debtDetails: buildDebtDetails({
        prev: bal.totalDebtBeginningOfYear != null ? Number(bal.totalDebtBeginningOfYear) : null,
        curr: bal.totalDebt != null ? Number(bal.totalDebt) : null,
        prevCash: bal.cashBeginningOfYear != null ? Number(bal.cashBeginningOfYear) : null,
        currCash: bal.cash != null ? Number(bal.cash) : null,
        prevSti: bal.shortTermInvestmentsBeginningOfYear != null ? Number(bal.shortTermInvestmentsBeginningOfYear) : null,
        currSti: bal.shortTermInvestments != null ? Number(bal.shortTermInvestments) : null,
        language: lang,
      }),
      cashDetails: buildCashMovementDetails({
        prev: bal.cashBeginningOfYear != null ? Number(bal.cashBeginningOfYear) : null,
        curr: bal.cash != null ? Number(bal.cash) : null,
        caja: cashDiffYtd,
        periodYear: Number(extracted.fiscalYear) || (extracted.reportingPeriod ? Number(String(extracted.reportingPeriod).slice(0, 4)) : null),
        statementChange: extracted.facts?.netChangeInCash,
        language: lang,
      }),
    },
  };
}

function resolveSalesGrowth(extracted, isTrimestral = false) {
  const period = isTrimestral ? (extracted?.quarter ?? {}) : (extracted?.ytd ?? {});
  const currentSales = Number(period.sales ?? (isTrimestral ? extracted?.facts?.salesQuarter : (extracted?.facts?.salesYtd ?? extracted?.facts?.sales ?? extracted?.sales)));
  const prevSales = Number(period.prev?.sales ?? (isTrimestral ? extracted?.facts?.prevSalesQuarter : (extracted?.facts?.prevSalesYtd ?? extracted?.facts?.prevSales)));
  if (Number.isFinite(currentSales) && Number.isFinite(prevSales) && prevSales > 0) {
    return Math.round(((currentSales - prevSales) / prevSales) * 1000) / 10;
  }
  const ytdCurr = Number(extracted?.ytd?.sales ?? extracted?.facts?.sales ?? extracted?.sales);
  const ytdPrev = Number(extracted?.ytd?.prev?.sales ?? extracted?.facts?.prevSales);
  if (Number.isFinite(ytdCurr) && Number.isFinite(ytdPrev) && ytdPrev > 0) {
    return Math.round(((ytdCurr - ytdPrev) / ytdPrev) * 1000) / 10;
  }
  return null;
}

export function buildWorkingCapitalDataFallback(extracted, language = 'es', sector = null) {
  const lang = normalizeLanguage(language);
  const balance = extracted?.balance ?? {};
  const wc = extracted?.workingCapital ?? {};
  const inv = Number(balance.inventories);
  const pay = Number(balance.accountsPayable);
  const rec = Number(balance.accountsReceivable ?? 0);
  const cfo = Number(extracted?.cashFlow?.operating ?? extracted?.facts?.cfo ?? extracted?.facts?.operatingCashFlow ?? extracted?.ytd?.cfo ?? extracted?.quarter?.cfo);
  const rawCapex = extracted?.cashFlow?.capex ?? extracted?.facts?.capex;
  const capex = rawCapex != null && Number.isFinite(Number(rawCapex)) ? Math.abs(Number(rawCapex)) : 0;
  const rawDividends = extracted?.cashFlow?.dividends ?? extracted?.facts?.dividends ?? extracted?.facts?.dividendsCommon;
  const dividends = rawDividends != null && Number.isFinite(Number(rawDividends)) ? Math.abs(Number(rawDividends)) : NaN;
  if (!Number.isFinite(cfo)) return null;

  const resolvedSector = sector || extracted?.sector || (extracted?.ticker ? resolveSectorByTicker(extracted.ticker) : null);
  const isTechnology = resolvedSector === 'technology';

  const inflation = Number.isFinite(Number(wc.inflationRate)) ? Number(wc.inflationRate) : 3;
  const volume = Number.isFinite(Number(wc.volumeGrowth)) ? Number(wc.volumeGrowth) : 0;

  const ytdSalesGrowth = isTechnology ? resolveSalesGrowth(extracted, false) : null;
  const quarterSalesGrowth = isTechnology ? resolveSalesGrowth(extracted, true) : null;

  let growth;
  if (isTechnology) {
    if (ytdSalesGrowth != null) growth = ytdSalesGrowth;
    else if (Number.isFinite(Number(wc.salesGrowth))) growth = Number(wc.salesGrowth);
    else if (Number.isFinite(Number(wc.volumeGrowth)) && Number(wc.volumeGrowth) > 0) growth = Number(wc.volumeGrowth);
    else if (Number.isFinite(Number(wc.inflationAndVolume)) && Number(wc.inflationAndVolume) !== 3) growth = Number(wc.inflationAndVolume);
    else growth = 0;
  } else {
    growth = Number.isFinite(Number(wc.inflationAndVolume))
      ? Number(wc.inflationAndVolume)
      : inflation + volume;
  }

  // Base del capital circulante: se prefiere el saldo de INICIO del ejercicio (balance del
  // ejercicio anterior, disponible en 10-K vía EDGAR). Aplicar el crecimiento al saldo de
  // CIERRE cuenta dos veces el crecimiento (el saldo de cierre ya lo incorpora), lo que en
  // empresas de alto crecimiento (NVIDIA: +65,5 %) dispara la necesidad teórica (32.774M
  // frente a 17.570M con el saldo de inicio). Sin saldo previo se corrige el factor a
  // g/(1+g), que es la parte del saldo de cierre atribuible al aumento de ventas.
  const prevBalance = extracted?.balancePreviousYear ?? {};
  const invPrev = toFiniteNumber(prevBalance.inventories);
  const payPrev = toFiniteNumber(prevBalance.accountsPayable);
  const recPrev = toFiniteNumber(prevBalance.accountsReceivable) ?? 0;
  const hasPrevWcInputs = Number.isFinite(invPrev) && Number.isFinite(payPrev);
  const wcBase = (isTechnology && hasPrevWcInputs)
    ? { pay: payPrev, inv: invPrev, rec: recPrev, previousYear: true }
    : { pay, inv, rec, previousYear: false };
  const wcBaseReady = Number.isFinite(wcBase.pay) && Number.isFinite(wcBase.inv) && Number.isFinite(wcBase.rec);
  const wcRequirementFor = (growthRate) => {
    if (!wcBaseReady) return 0;
    const rate = Number(growthRate);
    if (!Number.isFinite(rate) || rate === 0) return 0;
    const factor = (isTechnology && !wcBase.previousYear) ? rate / (100 + rate) : rate / 100;
    return Math.round((wcBase.pay - wcBase.inv - wcBase.rec) * factor * 10) / 10;
  };
  const months = Number(extracted?.ytd?.months) || 3;
  const reportedQuarterRaw = toFiniteNumber(wc.reportedChangeQuarter);
  const reportedYtdRaw = toFiniteNumber(wc.reportedChangeYtd);
  const repYtd = reportedYtdRaw != null
    ? reportedYtdRaw
    : (reportedQuarterRaw != null && months <= 3 ? reportedQuarterRaw : 0);

  // Método histórico (ÚNICO método desde 2026-09-20, también cuando el informe publica volumen):
  // media de los últimos ejercicios del peso que supuso el circulante sobre el flujo de
  // operaciones SIN circulante (CFO − ΔWC). Ej.: CFO 80.000M con ΔWC −20.000M => base 100.000M
  // y peso del 20 %. Ese % medio se aplica al flujo del periodo sin circulante. La fórmula
  // (inflación + volumen) / (crecimiento de ventas) queda solo como respaldo para empresas sin
  // historia suficiente (menos de 3 ejercicios).
  const history = Array.isArray(extracted?.workingCapitalHistory) ? extracted.workingCapitalHistory : [];
  const wcRatioPoints = history
    .map((point) => {
      const pointCfo = Number(point?.cfo);
      const pointWc = Number(point?.wcChange);
      const base = pointCfo - pointWc;
      if (!Number.isFinite(pointCfo) || !Number.isFinite(pointWc) || !Number.isFinite(base) || base <= 0) return null;
      return { ratio: pointWc / base, base, cfo: pointCfo, wcChange: pointWc, year: Number(point?.year) };
    })
    .filter(Boolean);
  // Método del circulante, configurable con WC_METHOD en el .env:
  //  - 'historical' (por defecto): SIEMPRE el peso agregado histórico cuando exista serie
  //    suficiente (>= 3 ejercicios), con o sin volumen publicado. Validado en
  //    comparacion/circulante-10-empresas-consumo-defensivo.md: error medio 881M frente a
  //    1.028M de la fórmula 3 % y más cercano al reportado en 6 de 10 empresas.
  //  - 'formula': comportamiento anterior (solo para revertir): consumo defensivo con volumen
  //    reportado usa (inflación + volumen); el resto usa el histórico si lo hay.
  const wcMethod = String(process.env.WC_METHOD ?? '').trim().toLowerCase() || 'historical';
  const useFormulaFirst = wcMethod === 'formula';
  const hasVolumeData = !isTechnology && Number.isFinite(Number(wc.volumeGrowth)) && Number(wc.volumeGrowth) !== 0;
  const useHistoricalRatio = useFormulaFirst
    ? (isTechnology || !hasVolumeData) && wcRatioPoints.length >= 3
    : wcRatioPoints.length >= 3;
  // Peso agregado (media ponderada por el tamaño de cada ejercicio): ΣΔWC / Σ(CFO − ΔWC).
  // La media simple de porcentajes es inestable en empresas con años de denominador pequeño
  // (KHC: +152 % y +201 % en 2023-24 y −82,9 % en 2017 mueven la media de +15,4 % a −24,9 %
  // según se filtren o no); el agregado da −6,1 % y no necesita descartar ningún año.
  const historicalRatio = useHistoricalRatio
    ? wcRatioPoints.reduce((acc, point) => acc + point.wcChange, 0)
      / wcRatioPoints.reduce((acc, point) => acc + point.base, 0)
    : null;
  // Ancla anual para horizontes parciales (10-Q): el peso agregado se aplica al flujo ANUAL del
  // último ejercicio completo de la serie (wcRatioPoints va de más reciente a más antiguo) y el
  // teórico resultante se prorratea: Q1 -> 1/4, Q2 -> 2/4, Q3 -> 3/4 (el trimestre suelto, 1/4).
  const historyAnchor = useHistoricalRatio ? wcRatioPoints[0] : null;
  const annualHistoryWc = (useHistoricalRatio && historyAnchor)
    ? round1(historicalRatio * historyAnchor.base)
    : null;
  const useProratedHistory = useHistoricalRatio && annualHistoryWc != null && months < 12;
  const annualWcReq = useHistoricalRatio
    ? (useProratedHistory ? annualHistoryWc : round1(historicalRatio * (cfo - repYtd)))
    : wcRequirementFor(growth);
  const ytdWcReq = useHistoricalRatio
    ? (useProratedHistory ? round1(annualWcReq * (months / 12)) : annualWcReq)
    : Math.round(annualWcReq * (months / 12) * 10) / 10;
  const wcDiffYtd = Math.round((repYtd - ytdWcReq) * 10) / 10;
  const cfoAdjYtd = Math.round((cfo - wcDiffYtd) * 10) / 10;
  const fcf = Math.round((cfo - capex) * 10) / 10;
  const fcfAdj = Math.round((cfoAdjYtd - capex) * 10) / 10;
  const shares = Number(extracted?.shares);
  const format = (value) => {
    if (!Number.isFinite(value)) return null;
    const rounded = String(Math.round(value * 100) / 100);
    return lang === 'en' ? rounded : rounded.replace('.', ',');
  };
  const formatPrice = (value) => {
    const fixed = (Math.round(value * 100) / 100).toFixed(2);
    return lang === 'en' ? fixed : fixed.replace('.', ',');
  };
  const formatGrowth = (val) => {
    if (!Number.isFinite(Number(val))) return '0';
    const rounded = String(Math.round(Number(val) * 10) / 10);
    return lang === 'en' ? rounded : rounded.replace('.', ',');
  };
  const techWcExplanation = ({ growthRate, annual, monthsCount, ytdValue, deviation }) => {
    const payload = {
      pay: formatWcNumber(wcBase.pay, lang),
      inv: formatWcNumber(wcBase.inv, lang),
      rec: formatWcNumber(wcBase.rec, lang),
      growth: formatGrowth(growthRate),
      annual: formatWcNumber(annual, lang),
      months: monthsCount,
      ytd: formatWcNumber(ytdValue, lang),
      deviation,
    };
    return wcBase.previousYear
      ? t('WC = (Cuentas por pagar - Inventarios - Cuentas por cobrar) del ejercicio anterior × (crecimiento de ventas) = ({pay} - {inv} - {rec}) × ({growth}%) = {annual}M en todo el año -> en {months} meses = {ytd}M. {deviation}', payload, lang)
      : t('WC = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (crecimiento de ventas) / (1 + crecimiento) = ({pay} - {inv} - {rec}) × ({growth}%) / (1 + {growth}%) = {annual}M en todo el año -> en {months} meses = {ytd}M. {deviation}', payload, lang);
  };
  const historicalWcExplanation = ({ annual, periodBase, deviation }) => {
    const list = wcRatioPoints.map((point) => `${formatGrowth(point.ratio * 100)}%`).join('; ');
    return t('WC = peso agregado del circulante sobre el flujo operativo sin circulante en los últimos {years} ejercicios: {ratio}% × {base}M = {annual}M en el periodo. Ratios de los ejercicios: {list}. {deviation}', {
      years: wcRatioPoints.length,
      list,
      ratio: formatGrowth(historicalRatio * 100),
      base: formatWcNumber(periodBase, lang),
      annual: formatWcNumber(annual, lang),
      deviation,
    }, lang);
  };
  const proratedWcExplanation = ({ ytdValue, quarterValue, deviation }) => {
    const list = wcRatioPoints.map((point) => `${formatGrowth(point.ratio * 100)}%`).join('; ');
    const payload = {
      years: wcRatioPoints.length,
      list,
      ratio: formatGrowth(historicalRatio * 100),
      baseAnual: formatWcNumber(historyAnchor.base, lang),
      anchorYear: Number.isFinite(historyAnchor.year) ? historyAnchor.year : '',
      annual: formatWcNumber(annualHistoryWc, lang),
      deviation,
    };
    if (quarterValue != null) {
      return t('WC = peso agregado del circulante sobre el flujo operativo sin circulante en los últimos {years} ejercicios: {ratio}% × {baseAnual}M (flujo anual de {anchorYear}) = {annual}M en todo el año -> en 3 meses = {quarter}M. Ratios de los ejercicios: {list}. {deviation}', {
        ...payload,
        quarter: formatWcNumber(quarterValue, lang),
      }, lang);
    }
    return t('WC = peso agregado del circulante sobre el flujo operativo sin circulante en los últimos {years} ejercicios: {ratio}% × {baseAnual}M (flujo anual de {anchorYear}) = {annual}M en todo el año -> en {months} meses = {ytd}M. Ratios de los ejercicios: {list}. {deviation}', {
      ...payload,
      months,
      ytd: formatWcNumber(ytdValue, lang),
    }, lang);
  };
  const effectiveDividends = Number.isFinite(dividends) ? dividends : 0;
  const ytdValues = {
    cfo: [format(cfo), format(cfoAdjYtd)],
    capex: [format(capex), format(capex)],
    fcf: [format(fcf), format(fcfAdj)],
    fcfPerShare: [Number.isFinite(shares) && shares ? `${formatPrice(fcf / shares)} $` : null, Number.isFinite(shares) && shares ? `${formatPrice(fcfAdj / shares)} $` : null],
    dividends: [Number.isFinite(dividends) ? format(dividends) : '0', Number.isFinite(dividends) ? format(dividends) : '0'],
    libre: [format(fcf - effectiveDividends), format(fcfAdj - effectiveDividends)],
  };
  const growth3M = isTechnology ? (quarterSalesGrowth ?? growth) : growth;
  const quarterly = extracted?.deducedQuarterCashFlow ?? null;
  const reportedQuarter = reportedQuarterRaw != null
    ? reportedQuarterRaw
    : (months > 3 ? round1(repYtd * (3 / months)) : repYtd);
  const cfoQuarter = toFiniteNumber(quarterly?.cfo);
  const quarterBase = cfoQuarter != null ? cfoQuarter - reportedQuarter : null;
  const annualWcReqQuarter = useHistoricalRatio
    ? (useProratedHistory
      ? round1(annualHistoryWc / 4)
      : (quarterBase != null && quarterBase > 0 ? round1(historicalRatio * quarterBase) : annualWcReq))
    : ((isTechnology && growth3M !== growth && wcBaseReady) ? wcRequirementFor(growth3M) : annualWcReq);
  const quarterWcReq = useHistoricalRatio
    ? (useProratedHistory
      ? (months <= 3 ? ytdWcReq : annualWcReqQuarter)
      : (months <= 3 ? ytdWcReq : (quarterBase != null && quarterBase > 0 ? annualWcReqQuarter : round1(ytdWcReq * (3 / months)))))
    : (months <= 3 ? ytdWcReq : Math.round(annualWcReqQuarter / 4 * 10) / 10);
  const deviationSentenceYtd = buildWcDeviationSentence({ reported: repYtd, wcReq: ytdWcReq, deviation: wcDiffYtd, cfo, adjusted: cfoAdjYtd, language: lang });
  const explanationYtd = useProratedHistory
    ? proratedWcExplanation({ ytdValue: ytdWcReq, deviation: deviationSentenceYtd })
    : useHistoricalRatio
    ? historicalWcExplanation({ annual: ytdWcReq, periodBase: cfo - repYtd, deviation: deviationSentenceYtd })
    : wcBaseReady
    ? (isTechnology
      ? techWcExplanation({ growthRate: growth, annual: annualWcReq, monthsCount: months, ytdValue: ytdWcReq, deviation: deviationSentenceYtd })
      : t('WC = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = ({pay} - {inv} - {rec}) × ({inflation}% + {volume}%) = {annual}M en todo el año -> en {months} meses = {ytd}M. {deviation}', {
        pay: formatWcNumber(pay, lang),
        inv: formatWcNumber(inv, lang),
        rec: formatWcNumber(rec, lang),
        inflation,
        volume,
        annual: formatWcNumber(annualWcReq, lang),
        months,
        ytd: formatWcNumber(ytdWcReq, lang),
        deviation: deviationSentenceYtd,
      }, lang))
    : (isTechnology
      ? t('WC: no se dispone de inventarios, cuentas por pagar y cuentas por cobrar completas; se utiliza WC=0M y no se aplica ajuste de capital circulante. Crecimiento de ventas: {growth}%.', { growth: formatGrowth(growth) }, lang)
      : t('WC: no se dispone de inventarios, cuentas por pagar y cuentas por cobrar completas; se utiliza WC=0M y no se aplica ajuste de capital circulante. Volumen asumido: {volume}%; inflación sectorial estimada: {inflation}%.', { volume, inflation }, lang));
  const result = {
    ytdScenarios: [`${t('Normal', null, lang)} (WC=${Math.round(repYtd)})`, `${t('Ajustado', null, lang)}*1 (WC=${Math.round(ytdWcReq)})`],
    ytdValues,
    explanationYtd,
  };

  const wcDiffQuarter = round1(reportedQuarter - quarterWcReq);
  const capexQuarterRaw = toFiniteNumber(quarterly?.capex);
  const capexQuarter = capexQuarterRaw != null ? Math.abs(capexQuarterRaw) : null;
  const dividendsQuarterRaw = toFiniteNumber(quarterly?.dividends);
  const dividendsQuarter = dividendsQuarterRaw != null ? Math.abs(dividendsQuarterRaw) : 0;

  result.quarterScenarios = [`${t('Normal', null, lang)} (WC=${Math.round(reportedQuarter)})`, `${t('Ajustado', null, lang)}*1 (WC=${Math.round(quarterWcReq)})`];
  if (months <= 3) {
    result.quarterValues = ytdValues;
  } else if (cfoQuarter != null && capexQuarter != null) {
    const cfoAdjQuarter = round1(cfoQuarter - wcDiffQuarter);
    const fcfQuarter = round1(cfoQuarter - capexQuarter);
    const fcfAdjQuarter = round1(cfoAdjQuarter - capexQuarter);
    result.quarterValues = {
      cfo: [format(cfoQuarter), format(cfoAdjQuarter)],
      capex: [format(capexQuarter), format(capexQuarter)],
      fcf: [format(fcfQuarter), format(fcfAdjQuarter)],
      fcfPerShare: [
        Number.isFinite(shares) && shares ? `${formatPrice(fcfQuarter / shares)} $` : null,
        Number.isFinite(shares) && shares ? `${formatPrice(fcfAdjQuarter / shares)} $` : null,
      ],
      dividends: [format(dividendsQuarter), format(dividendsQuarter)],
      libre: [format(fcfQuarter - dividendsQuarter), format(fcfAdjQuarter - dividendsQuarter)],
    };
  }
  const deviationSentenceQuarter = buildWcDeviationSentence({
    reported: reportedQuarter,
    wcReq: quarterWcReq,
    deviation: wcDiffQuarter,
    cfo: cfoQuarter,
    adjusted: cfoQuarter != null ? round1(cfoQuarter - wcDiffQuarter) : null,
    language: lang,
  });
  result.explanation3M = useProratedHistory
    ? proratedWcExplanation({ quarterValue: quarterWcReq, deviation: months <= 3 ? deviationSentenceYtd : deviationSentenceQuarter })
    : useHistoricalRatio
    ? historicalWcExplanation({ annual: quarterWcReq, periodBase: quarterBase ?? (cfo - repYtd), deviation: months <= 3 ? deviationSentenceYtd : deviationSentenceQuarter })
    : wcBaseReady
    ? (isTechnology
      ? techWcExplanation({ growthRate: growth3M, annual: annualWcReqQuarter, monthsCount: 3, ytdValue: quarterWcReq, deviation: months <= 3 ? deviationSentenceYtd : deviationSentenceQuarter })
      : t('WC = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = ({pay} - {inv} - {rec}) × ({inflation}% + {volume}%) = {annual}M en todo el año -> en 3 meses = {quarter}M. {deviation}', {
        pay: formatWcNumber(pay, lang),
        inv: formatWcNumber(inv, lang),
        rec: formatWcNumber(rec, lang),
        inflation,
        volume,
        annual: formatWcNumber(annualWcReq, lang),
        quarter: formatWcNumber(quarterWcReq, lang),
        deviation: months <= 3 ? deviationSentenceYtd : deviationSentenceQuarter,
      }, lang))
    : explanationYtd;
  return result;
}
