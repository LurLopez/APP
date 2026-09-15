/**
 * @fileoverview Lógica auxiliar para conciliación de deuda, caja, asignación de capital y fondo de maniobra (WK).
 * @module agents/analyst/capitalAllocationHelpers
 */

export function formatWcNumber(value) {
  if (!Number.isFinite(Number(value))) return '0';
  return String(Math.round(Number(value) * 10) / 10).replace('.', ',');
}

export function buildDebtDetails({ prev, curr, prevCash, currCash, prevSti, currSti, fallback }) {
  if (prev != null && curr != null) {
    const diff = Math.round((curr - prev) * 10) / 10;
    let netPart = '';
    if (prevCash != null && currCash != null) {
      const prevNet = Math.round((prev - prevCash - (prevSti ?? 0)) * 10) / 10;
      const currNet = Math.round((curr - currCash - (currSti ?? 0)) * 10) / 10;
      const diffNet = Math.round((currNet - prevNet) * 10) / 10;
      netPart = `. Deuda neta: ${prevNet}M -> ${currNet}M (${diffNet > 0 ? '+' : ''}${diffNet}M)`;
    }
    return `Deuda balance: ${prev}M -> ${curr}M (${diff > 0 ? '+' : ''}${diff}M)${netPart}`;
  }
  return fallback ?? null;
}

export function buildCashMovementDetails({ prev, curr, caja, periodYear, statementChange }) {
  if (prev == null || curr == null) return null;
  const delta = Math.round((curr - prev) * 10) / 10;
  const deltaText = `${delta > 0 ? '+' : ''}${formatWcNumber(delta)}M`;
  const rowValue = caja != null ? `${Number(caja) > 0 ? '+' : ''}${formatWcNumber(caja)}M` : '—';
  const year = Number(periodYear);
  const prevLabel = Number.isFinite(year) ? ` (${year - 1})` : '';
  const currLabel = Number.isFinite(year) ? ` (${year})` : '';
  const meaning = delta >= 0 ? 'la caja aumentó: uso de capital (-)' : 'la caja disminuyó: fuente de liquidez (+)';
  let statementNote = '';
  const statement = Number(statementChange);
  if (Number.isFinite(statement) && Math.abs(statement - delta) >= 1) {
    const diff = Math.round((statement - delta) * 10) / 10;
    statementNote = ` El estado de flujos presenta un neto de ${formatWcNumber(statement)}M porque incluye efectivo restringido y otros ajustes (${diff > 0 ? '+' : ''}${formatWcNumber(diff)}M frente a la caja del balance).`;
  }
  return `Caja balance: ${formatWcNumber(prev)}M${prevLabel} -> ${formatWcNumber(curr)}M${currLabel} (${deltaText}); ${meaning}; fila Caja = ${rowValue}.${statementNote}`;
}

export function buildWcDeviationSentence({ reported, wcReq, deviation, cfo, adjusted }) {
  const base = `Desviación del circulante reportado (${formatWcNumber(reported)}M) frente al WK teórico (${formatWcNumber(wcReq)}M): ${formatWcNumber(deviation)}M.`;
  if (Number.isFinite(Number(cfo)) && Number.isFinite(Number(adjusted))) {
    return `${base} El Cash Flow ajustado resta esa desviación: ${formatWcNumber(cfo)}M - (${formatWcNumber(deviation)}M) = ${formatWcNumber(adjusted)}M.`;
  }
  return base;
}

export function buildCapitalAllocationFromBalance(extracted) {
  const bal = extracted.balance ?? {};
  const invDiff3M = (bal.shortTermInvestments != null && bal.shortTermInvestmentsPreviousQuarter != null)
    ? Number(bal.shortTermInvestments) - Number(bal.shortTermInvestmentsPreviousQuarter)
    : 0;
  const invDiffYtd = (bal.shortTermInvestments != null)
    ? Number(bal.shortTermInvestments) - (bal.shortTermInvestmentsBeginningOfYear != null ? Number(bal.shortTermInvestmentsBeginningOfYear) : 0)
    : 0;
  const rawDivYtd = Number(extracted.facts?.brandDivestitures) || 0;
  const buybacksYtd = Number(extracted.facts?.shareBuybacks) || 0;
  const marketablePurchasesQuarter = Number(extracted.facts?.purchasesOfMarketableSecuritiesQuarter) || 0;
  const marketablePurchasesYtd = Number(extracted.facts?.purchasesOfMarketableSecuritiesYtd) || 0;
  const marketableProceedsQuarter = Number(extracted.facts?.proceedsFromSaleOfMarketableSecuritiesQuarter) || 0;
  const marketableProceedsYtd = Number(extracted.facts?.proceedsFromSaleOfMarketableSecuritiesYtd) || 0;
  const acquisitionsQuarter = Number(extracted.facts?.acquisitionsQuarter) || 0;
  const acquisitionsYtd = Number(extracted.facts?.acquisitionsYtd) || 0;
  const assetSalesQuarter = Number(extracted.facts?.assetSalesQuarter) || 0;
  const assetSalesYtd = Number(extracted.facts?.assetSalesYtd) || 0;
  const acquisitionDescription = extracted.facts?.acquisitionDescription ?? null;
  const divestitureDescription = extracted.facts?.divestitureDescription ?? null;
  const preferredYtdRaw = Number(extracted.facts?.preferredIssuanceYtd) || 0;
  const nonControllingYtdRaw = Number(extracted.facts?.nonControllingSaleYtd) || 0;
  const debtCashYtdRaw = Number(extracted.facts?.debtCashFlowYtd);
  const fiscalQuarterNumber = Number(extracted.fiscalQuarter);
  const debtDeltaYtd = (bal.totalDebt != null && bal.totalDebtBeginningOfYear != null)
    ? Number(bal.totalDebt) - Number(bal.totalDebtBeginningOfYear)
    : null;
  const assumedDebtYtd = (debtDeltaYtd != null && Number.isFinite(debtCashYtdRaw) && acquisitionsYtd >= 50)
    ? Math.round((debtDeltaYtd - debtCashYtdRaw) * 10) / 10
    : 0;
  const restrictedCurr = Number(extracted.balance?.restrictedCash);
  const restrictedPrevious = Number(extracted.balance?.restrictedCashPreviousQuarter);
  const restrictedStart = Number(extracted.balance?.restrictedCashBeginningOfYear);
  const restrictedDiff3M = (Number.isFinite(restrictedCurr) && Number.isFinite(restrictedPrevious))
    ? restrictedCurr - restrictedPrevious
    : null;
  const restrictedDiffYtd = (Number.isFinite(restrictedCurr) && Number.isFinite(restrictedStart))
    ? restrictedCurr - restrictedStart
    : null;

  const acquisitions3MAbs = acquisitionsQuarter >= 50
    ? acquisitionsQuarter
    : (fiscalQuarterNumber === 1 ? acquisitionsYtd : 0);
  const assumedDebt3M = (acquisitions3MAbs >= 50 && acquisitionsYtd >= 50
    && Math.abs(acquisitions3MAbs - acquisitionsYtd) < 1 && assumedDebtYtd >= 50)
    ? assumedDebtYtd
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
      divestitures: rawDivYtd >= 50 ? rawDivYtd : 0,
      buybacks: Number(extracted.fiscalQuarter) === 1 ? -Math.abs(buybacksYtd) : 0,
      acquisitions: (() => {
        const raw = Number(extracted.fiscalQuarter) === 1 ? (acquisitionsQuarter || acquisitionsYtd) : acquisitionsQuarter;
        return raw >= 50 ? -Math.abs(raw) : 0;
      })(),
      assetSales: Number(extracted.fiscalQuarter) === 1 ? (assetSalesQuarter || assetSalesYtd) : assetSalesQuarter,
      preferredIssuance: fiscalQuarterNumber === 1 && preferredYtdRaw >= 50 ? preferredYtdRaw : 0,
      nonControllingSale: fiscalQuarterNumber === 1 && nonControllingYtdRaw >= 50 ? nonControllingYtdRaw : 0,
      assumedDebt: assumedDebt3M >= 50 ? assumedDebt3M : 0,
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
      }),
      cashDetails: buildCashMovementDetails({
        prev: bal.cashPreviousQuarter != null ? Number(bal.cashPreviousQuarter) : null,
        curr: bal.cash != null ? Number(bal.cash) : null,
        caja: cashDiff3M,
        periodYear: Number(extracted.fiscalYear) || (extracted.reportingPeriod ? Number(String(extracted.reportingPeriod).slice(0, 4)) : null),
        statementChange: Number(extracted.fiscalQuarter) === 1 ? extracted.facts?.netChangeInCash : undefined,
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
      divestitures: rawDivYtd >= 50 ? rawDivYtd : 0,
      buybacks: buybacksYtd ? -Math.abs(buybacksYtd) : 0,
      acquisitions: acquisitionsYtd >= 50 ? -Math.abs(acquisitionsYtd) : 0,
      assetSales: assetSalesYtd,
      preferredIssuance: preferredYtdRaw >= 50 ? preferredYtdRaw : 0,
      nonControllingSale: nonControllingYtdRaw >= 50 ? nonControllingYtdRaw : 0,
      assumedDebt: assumedDebtYtd >= 50 ? assumedDebtYtd : 0,
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
      }),
      cashDetails: buildCashMovementDetails({
        prev: bal.cashBeginningOfYear != null ? Number(bal.cashBeginningOfYear) : null,
        curr: bal.cash != null ? Number(bal.cash) : null,
        caja: cashDiffYtd,
        periodYear: Number(extracted.fiscalYear) || (extracted.reportingPeriod ? Number(String(extracted.reportingPeriod).slice(0, 4)) : null),
        statementChange: extracted.facts?.netChangeInCash,
      }),
    },
  };
}

export function buildWorkingCapitalDataFallback(extracted) {
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
  const repYtd = Number.isFinite(Number(wc.reportedChangeYtd)) ? Number(wc.reportedChangeYtd) : 0;
  const wcDiffYtd = Math.round((repYtd - ytdWcReq) * 10) / 10;
  const cfoAdjYtd = Math.round((cfo - wcDiffYtd) * 10) / 10;
  const fcf = Math.round((cfo - capex) * 10) / 10;
  const fcfAdj = Math.round((cfoAdjYtd - capex) * 10) / 10;
  const shares = Number(extracted.shares);
  const format = (value) => Number.isFinite(value) ? String(Math.round(value * 100) / 100).replace('.', ',') : null;
  const effectiveDividends = Number.isFinite(dividends) ? dividends : 0;
  const ytdValues = {
    cfo: [format(cfo), format(cfoAdjYtd)],
    capex: [format(capex), format(capex)],
    fcf: [format(fcf), format(fcfAdj)],
    fcfPerShare: [Number.isFinite(shares) && shares ? `${(fcf / shares).toFixed(2).replace('.', ',')} $` : null, Number.isFinite(shares) && shares ? `${(fcfAdj / shares).toFixed(2).replace('.', ',')} $` : null],
    dividends: [Number.isFinite(dividends) ? format(dividends) : '0', Number.isFinite(dividends) ? format(dividends) : '0'],
    libre: [format(fcf - effectiveDividends), format(fcfAdj - effectiveDividends)],
  };
  const result = {
    ytdScenarios: [`Normal (WC=${Math.round(repYtd)})`, `Ajustado (WC=${Math.round(ytdWcReq)})`],
    ytdValues,
    explanationYtd: hasWcInputs
      ? `WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (${Math.round(pay)} - ${Math.round(inv)} - ${Math.round(rec)}) × (${inflation}% + ${volume}%) = ${formatWcNumber(annualWcReq)}M en todo el año -> en ${months} meses = ${formatWcNumber(ytdWcReq)}M. ${buildWcDeviationSentence({ reported: repYtd, wcReq: ytdWcReq, deviation: wcDiffYtd, cfo, adjusted: cfoAdjYtd })}`
      : `WK: no se dispone de inventarios, cuentas por pagar y cuentas por cobrar completas; se utiliza WK=0M y no se aplica ajuste de capital circulante. Volumen asumido: ${volume}%; inflación sectorial estimada: ${inflation}%.`,
  };
  if (Number(extracted.fiscalQuarter) === 1 || months === 3) {
    result.quarterScenarios = [`Normal (WC=${Math.round(repYtd)})`, `Ajustado (WC=${Math.round(annualWcReq / 4)})`];
    result.quarterValues = ytdValues;
    result.explanation3M = result.explanationYtd.replace(
      `en ${months} meses = ${formatWcNumber(ytdWcReq)}M`,
      `en 3 meses = ${formatWcNumber(Math.round(annualWcReq / 4 * 10) / 10)}M`,
    );
  }
  return result;
}
