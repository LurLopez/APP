/**
 * @fileoverview Lógica auxiliar para conciliación de deuda, caja, asignación de capital y fondo de maniobra (WK).
 * @module agents/analyst/capitalAllocationHelpers
 */

import { t, normalizeLanguage } from '../../utils/i18n.js';
import { parseLooseReportNumber } from './financialParsers.js';

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
  const base = t('Desviación del circulante reportado ({reported}M) frente al WK teórico ({wcReq}M): {deviation}M.', {
    reported: formatWcNumber(reported, lang),
    wcReq: formatWcNumber(wcReq, lang),
    deviation: formatWcNumber(deviation, lang),
  }, lang);
  if (Number.isFinite(Number(cfo)) && Number.isFinite(Number(adjusted))) {
    return t('{base} El Cash Flow ajustado resta esa desviación: {cfo}M - ({deviation}M) = {adjusted}M.', {
      base,
      cfo: formatWcNumber(cfo, lang),
      deviation: formatWcNumber(deviation, lang),
      adjusted: formatWcNumber(adjusted, lang),
    }, lang);
  }
  return base;
}

export function buildCapitalAllocationFromBalance(extracted, language = 'es') {
  const lang = normalizeLanguage(language);
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
  const marketablePurchasesQuarter = factNumber(extracted.facts?.purchasesOfMarketableSecuritiesQuarter);
  const marketablePurchasesYtd = factNumber(extracted.facts?.purchasesOfMarketableSecuritiesYtd);
  const marketableProceedsQuarter = factNumber(extracted.facts?.proceedsFromSaleOfMarketableSecuritiesQuarter);
  const marketableProceedsYtd = factNumber(extracted.facts?.proceedsFromSaleOfMarketableSecuritiesYtd);
  const acquisitionsQuarter = factNumber(extracted.facts?.acquisitionsQuarter);
  const acquisitionsYtd = factNumber(extracted.facts?.acquisitionsYtd);
  const assetSalesQuarter = factNumber(extracted.facts?.assetSalesQuarter);
  const assetSalesYtd = factNumber(extracted.facts?.assetSalesYtd);
  const acquisitionDescription = extracted.facts?.acquisitionDescription ?? null;
  const divestitureDescription = extracted.facts?.divestitureDescription ?? null;
  const preferredYtdRaw = factNumber(extracted.facts?.preferredIssuanceYtd);
  const nonControllingYtdRaw = factNumber(extracted.facts?.nonControllingSaleYtd);
  const debtCashYtdRaw = toFiniteNumber(extracted.facts?.debtCashFlowYtd);
  const fiscalQuarterNumber = Number(extracted.fiscalQuarter);
  const debtDeltaYtd = (bal.totalDebt != null && bal.totalDebtBeginningOfYear != null)
    ? Number(bal.totalDebt) - Number(bal.totalDebtBeginningOfYear)
    : null;
  const assumedDebtYtd = (debtDeltaYtd != null && Number.isFinite(debtCashYtdRaw) && acquisitionsYtd >= 50)
    ? Math.round((debtDeltaYtd - debtCashYtdRaw) * 10) / 10
    : 0;
  const restrictedCurr = toFiniteNumber(extracted.balance?.restrictedCash);
  const restrictedPreviousRaw = toFiniteNumber(extracted.balance?.restrictedCashPreviousQuarter);
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
  const systemDebtCash = extracted.systemDebtCash ?? {};
  const systemDebtCashYtd = toFiniteNumber(systemDebtCash.ytd);
  const systemDebtCashQuarter = toFiniteNumber(systemDebtCash.quarter);
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
  const nonCashDebtYtd = (acquisitionsYtd < 50 && inNonCashDebtBand(debtDeltaYtd, systemDebtCashYtd))
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

export function buildWorkingCapitalDataFallback(extracted, language = 'es') {
  const lang = normalizeLanguage(language);
  const balance = extracted.balance ?? {};
  const wc = extracted.workingCapital ?? {};
  const inv = Number(balance.inventories);
  const pay = Number(balance.accountsPayable);
  const rec = Number(balance.accountsReceivable ?? 0);
  const cfo = Number(extracted.cashFlow?.operating ?? extracted.facts?.cfo ?? extracted.facts?.operatingCashFlow ?? extracted.ytd?.cfo ?? extracted.quarter?.cfo);
  const rawCapex = extracted.cashFlow?.capex ?? extracted.facts?.capex;
  const capex = rawCapex != null && Number.isFinite(Number(rawCapex)) ? Math.abs(Number(rawCapex)) : 0;
  const rawDividends = extracted.cashFlow?.dividends ?? extracted.facts?.dividends ?? extracted.facts?.dividendsCommon;
  const dividends = rawDividends != null && Number.isFinite(Number(rawDividends)) ? Math.abs(Number(rawDividends)) : NaN;
  if (!Number.isFinite(cfo)) return null;

  const inflation = Number.isFinite(Number(wc.inflationRate)) ? Number(wc.inflationRate) : 3;
  const volume = Number.isFinite(Number(wc.volumeGrowth)) ? Number(wc.volumeGrowth) : 0;
  const growth = Number.isFinite(Number(wc.inflationAndVolume))
    ? Number(wc.inflationAndVolume)
    : inflation + volume;
  const hasWcInputs = Number.isFinite(inv) && Number.isFinite(pay);
  const annualWcReq = hasWcInputs ? Math.round((pay - inv - rec) * (growth / 100) * 10) / 10 : 0;
  const months = Number(extracted.ytd?.months) || 3;
  const ytdWcReq = Math.round(annualWcReq * (months / 12) * 10) / 10;
  const reportedQuarterRaw = toFiniteNumber(wc.reportedChangeQuarter);
  const reportedYtdRaw = toFiniteNumber(wc.reportedChangeYtd);
  const repYtd = reportedYtdRaw != null
    ? reportedYtdRaw
    : (reportedQuarterRaw != null && months <= 3 ? reportedQuarterRaw : 0);
  const wcDiffYtd = Math.round((repYtd - ytdWcReq) * 10) / 10;
  const cfoAdjYtd = Math.round((cfo - wcDiffYtd) * 10) / 10;
  const fcf = Math.round((cfo - capex) * 10) / 10;
  const fcfAdj = Math.round((cfoAdjYtd - capex) * 10) / 10;
  const shares = Number(extracted.shares);
  const format = (value) => {
    if (!Number.isFinite(value)) return null;
    const rounded = String(Math.round(value * 100) / 100);
    return lang === 'en' ? rounded : rounded.replace('.', ',');
  };
  const formatPrice = (value) => {
    const fixed = (Math.round(value * 100) / 100).toFixed(2);
    return lang === 'en' ? fixed : fixed.replace('.', ',');
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
  const quarterWcReq = Math.round(annualWcReq / 4 * 10) / 10;
  const deviationSentenceYtd = buildWcDeviationSentence({ reported: repYtd, wcReq: ytdWcReq, deviation: wcDiffYtd, cfo, adjusted: cfoAdjYtd, language: lang });
  const explanationYtd = hasWcInputs
    ? t('WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = ({pay} - {inv} - {rec}) × ({inflation}% + {volume}%) = {annual}M en todo el año -> en {months} meses = {ytd}M. {deviation}', {
      pay: formatWcNumber(pay, lang),
      inv: formatWcNumber(inv, lang),
      rec: formatWcNumber(rec, lang),
      inflation,
      volume,
      annual: formatWcNumber(annualWcReq, lang),
      months,
      ytd: formatWcNumber(ytdWcReq, lang),
      deviation: deviationSentenceYtd,
    }, lang)
    : t('WK: no se dispone de inventarios, cuentas por pagar y cuentas por cobrar completas; se utiliza WK=0M y no se aplica ajuste de capital circulante. Volumen asumido: {volume}%; inflación sectorial estimada: {inflation}%.', { volume, inflation }, lang);
  const result = {
    ytdScenarios: [`${t('Normal', null, lang)} (WC=${Math.round(repYtd)})`, `${t('Ajustado', null, lang)} (WC=${Math.round(ytdWcReq)})`],
    ytdValues,
    explanationYtd,
  };

  const quarterly = extracted.deducedQuarterCashFlow ?? null;
  const reportedQuarter = reportedQuarterRaw != null
    ? reportedQuarterRaw
    : (months > 3 ? round1(repYtd * (3 / months)) : repYtd);
  const wcDiffQuarter = round1(reportedQuarter - quarterWcReq);
  const cfoQuarter = toFiniteNumber(quarterly?.cfo);
  const capexQuarterRaw = toFiniteNumber(quarterly?.capex);
  const capexQuarter = capexQuarterRaw != null ? Math.abs(capexQuarterRaw) : null;
  const dividendsQuarterRaw = toFiniteNumber(quarterly?.dividends);
  const dividendsQuarter = dividendsQuarterRaw != null ? Math.abs(dividendsQuarterRaw) : 0;

  result.quarterScenarios = [`${t('Normal', null, lang)} (WC=${Math.round(reportedQuarter)})`, `${t('Ajustado', null, lang)} (WC=${Math.round(quarterWcReq)})`];
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
  result.explanation3M = hasWcInputs
    ? t('WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = ({pay} - {inv} - {rec}) × ({inflation}% + {volume}%) = {annual}M en todo el año -> en 3 meses = {quarter}M. {deviation}', {
      pay: formatWcNumber(pay, lang),
      inv: formatWcNumber(inv, lang),
      rec: formatWcNumber(rec, lang),
      inflation,
      volume,
      annual: formatWcNumber(annualWcReq, lang),
      quarter: formatWcNumber(quarterWcReq, lang),
      deviation: months <= 3 ? deviationSentenceYtd : deviationSentenceQuarter,
    }, lang)
    : explanationYtd;
  return result;
}
