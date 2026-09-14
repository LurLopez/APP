/**
 * @fileoverview Construcción de series históricas continuas de múltiplos de valoración (EV/EBITDA, PER, P/FCF, etc.).
 * @module services/edgar/valuationSeries
 */

import { getHistoricalPrices } from '../market.service.js';
import {
  getCompanyByTicker,
  getCompanyFacts,
  getCompanySubmissions,
} from './companyProfile.js';
import { buildSeries } from './factsSeries.js';
import { getExtensionFacts, mergeInstanceFacts } from './instanceFacts.js';
import {
  propagateMissingShares,
  harmonizeSeriesSplits,
} from './sharesHarmonizer.js';
import {
  rederiveCashValues,
  rederiveIncomeValues,
  rederiveBalanceValues,
} from './rederiveStatements.js';

export const VALUATION_RANGES = {
  '1m': 31,
  '3m': 92,
  '6m': 184,
  '1y': 366,
  '3y': 1096,
  '5y': 1827,
  '10y': 3653,
  all: 7305,
};

export function sanitizeValuationSeries(points) {
  const metricKeys = ['evEbitda', 'peRatio', 'peRatioNormalized', 'priceToFcf', 'netDebtToEbitda', 'dividendYield', 'payoutRatio', 'payoutRatioNormalized'];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    for (const key of metricKeys) {
      const vPrev = prev[key];
      const vCurr = curr[key];
      const vNext = next[key];
      if (Number.isFinite(vPrev) && Number.isFinite(vCurr) && Number.isFinite(vNext) && vPrev > 0 && vNext > 0) {
        const r1 = vCurr / vPrev;
        const r2 = vCurr / vNext;
        if ((r1 > 2.5 && r2 > 2.5) || (r1 < 0.4 && r2 < 0.4)) {
          curr[key] = Math.round(((vPrev + vNext) / 2) * 100) / 100;
        }
      }
    }
  }
}

export function pointInTimeSnapshot(annual, quarterly, submissions = null) {
  const filingDateByPeriod = new Map();
  const recent = submissions?.filings?.recent;
  if (recent) {
    for (let i = 0; i < (recent.form?.length ?? 0); i += 1) {
      if (['10-K', '10-Q', '10-K/A', '10-Q/A', '20-F', '20-F/A', '6-K'].includes(recent.form[i]) && recent.reportDate?.[i] && recent.filingDate?.[i]) {
        if (!filingDateByPeriod.has(recent.reportDate[i]) || recent.filingDate[i] < filingDateByPeriod.get(recent.reportDate[i])) {
          filingDateByPeriod.set(recent.reportDate[i], recent.filingDate[i]);
        }
      }
    }
  }

  const snapshotsByDate = new Map();

  const quartersAsc = [...quarterly].sort((a, b) => a.sortKey - b.sortKey);
  quartersAsc.forEach((quarter, index) => {
    if (index < 3) return;
    const window = quartersAsc.slice(index - 3, index + 1);
    const endDate = window[window.length - 1].periodEnd;
    if (!endDate) return;

    const effDate = filingDateByPeriod.get(endDate) ?? endDate;

    const normEbitdas = window.map((row) => Number(row.values.ebitdaNormalized ?? row.values.ebitda)).filter((v) => Number.isFinite(v));
    const rawEbitdas = window.map((row) => Number(row.values.ebitda)).filter((v) => Number.isFinite(v));
    const sumNormalized = normEbitdas.length === 4 ? normEbitdas.reduce((sum, v) => sum + v, 0) : null;
    const sumRaw = rawEbitdas.length === 4 ? rawEbitdas.reduce((sum, v) => sum + v, 0) : null;
    let sumEbitda = (sumNormalized !== null && sumNormalized > 0) ? sumNormalized : sumRaw;
    if (!sumEbitda || sumEbitda <= 0) return;

    const latest = window[window.length - 1].values;
    let netDebt = Number(latest.netDebt);
    if (!Number.isFinite(netDebt)) {
      for (let i = window.length - 2; i >= 0; i -= 1) {
        const nd = Number(window[i].values.netDebt);
        if (Number.isFinite(nd)) { netDebt = nd; break; }
      }
    }
    const netDebts = window.map((row) => Number(row.values.netDebt)).filter((v) => Number.isFinite(v));
    const avgNetDebt = netDebts.length ? netDebts.reduce((sum, v) => sum + v, 0) / netDebts.length : netDebt;
    let shares = Number.isFinite(Number(latest.weightedSharesDiluted)) && Number(latest.weightedSharesDiluted) > 0
      ? Number(latest.weightedSharesDiluted)
      : (Number.isFinite(Number(latest.sharesOutstanding)) ? Number(latest.sharesOutstanding) : null);
    if (shares === null) {
      for (let i = window.length - 2; i >= 0; i -= 1) {
        const sh = Number(window[i].values.weightedSharesDiluted) || Number(window[i].values.sharesOutstanding);
        if (Number.isFinite(sh) && sh > 0) { shares = sh; break; }
      }
    }
    if (shares === null) {
      for (const ann of annual) {
        const sh = Number(ann.values?.weightedSharesDiluted) || Number(ann.values?.sharesOutstanding);
        if (Number.isFinite(sh) && sh > 0) { shares = sh; break; }
      }
    }

    const epsValues = window.map((row) => Number(row.values.epsDiluted));
    let epsTtm = epsValues.every((v) => Number.isFinite(v)) ? epsValues.reduce((sum, v) => sum + v, 0) : null;

    const epsNormValues = window.map((row) => Number(row.values.epsDilutedNormalized ?? row.values.epsDiluted));
    let epsNormalizedTtm = epsNormValues.every((v) => Number.isFinite(v)) ? epsNormValues.reduce((sum, v) => sum + v, 0) : null;

    if (epsNormalizedTtm === null && shares && shares > 0) {
      const netIncomesAdj = window.map((row) => Number(row.values.netIncomeToCommonExcludingUnusual ?? row.values.netIncomeAdjusted ?? row.values.netIncome));
      if (netIncomesAdj.every((v) => Number.isFinite(v))) {
        epsNormalizedTtm = Math.round((netIncomesAdj.reduce((sum, v) => sum + v, 0) / shares) * 100) / 100;
      }
    }
    if (epsTtm === null && shares && shares > 0) {
      const netIncomes = window.map((row) => Number(row.values.netIncomeToCommonIncludingUnusual ?? row.values.netIncome));
      if (netIncomes.every((v) => Number.isFinite(v))) {
        epsTtm = Math.round((netIncomes.reduce((sum, v) => sum + v, 0) / shares) * 100) / 100;
      }
    }

    const fcfValues = window.map((row) => Number(row.values.freeCashFlow));
    let fcfTtm = fcfValues.every((v) => Number.isFinite(v)) ? fcfValues.reduce((sum, v) => sum + v, 0) : null;

    const dpsValues = window.map((row) => Number(row.values.dividendPerShare));
    let dpsTtm = dpsValues.every((v) => Number.isFinite(v) && v >= 0 && v < 10)
      ? dpsValues.reduce((sum, v) => sum + v, 0)
      : null;

    let fcfPerShareTtm = (fcfTtm !== null && shares && shares > 0) ? fcfTtm / shares : null;
    if (fcfPerShareTtm === null) {
      const fcfpsValues = window.map((row) => Number(row.values.cashFlowPerShare));
      if (fcfpsValues.every((v) => Number.isFinite(v))) {
        fcfPerShareTtm = fcfpsValues.reduce((sum, v) => sum + v, 0);
      }
    }

    const annualMatch = annual.find((a) => a.periodEnd === endDate);
    if (annualMatch?.values) {
      const annEbitda = Number(annualMatch.values.ebitdaNormalized ?? annualMatch.values.ebitda);
      if (Number.isFinite(annEbitda) && annEbitda > 0) {
        sumEbitda = annEbitda;
      }
      const annEps = Number(annualMatch.values.epsDiluted);
      if (Number.isFinite(annEps)) {
        epsTtm = annEps;
      }
      const annEpsNorm = Number(annualMatch.values.epsDilutedNormalized);
      if (Number.isFinite(annEpsNorm)) {
        epsNormalizedTtm = annEpsNorm;
      }
      const annFcf = Number(annualMatch.values.freeCashFlow);
      if (Number.isFinite(annFcf)) {
        fcfTtm = annFcf;
        if (shares && shares > 0) fcfPerShareTtm = annFcf / shares;
      }
      const annFcfps = Number(annualMatch.values.cashFlowPerShare);
      if (Number.isFinite(annFcfps) && fcfPerShareTtm === null) {
        fcfPerShareTtm = annFcfps;
      }
      const annDps = Number(annualMatch.values.dividendPerShare);
      if (Number.isFinite(annDps) && annDps >= 0 && annDps <= 20) {
        dpsTtm = annDps;
      }
      const annNetDebt = Number(annualMatch.values.netDebt);
      if (Number.isFinite(annNetDebt)) {
        netDebt = annNetDebt;
      }
      const annShares = Number(annualMatch.values.weightedSharesDiluted) || Number(annualMatch.values.sharesOutstanding);
      if (Number.isFinite(annShares) && annShares > 0) {
        shares = annShares;
      }
    }

    snapshotsByDate.set(effDate, {
      date: effDate,
      ebitdaTtm: sumEbitda,
      epsTtm,
      epsNormalizedTtm,
      fcfTtm: Number.isFinite(fcfTtm) ? fcfTtm : null,
      fcfPerShareTtm: Number.isFinite(fcfPerShareTtm) ? fcfPerShareTtm : null,
      dpsTtm: dpsTtm !== null && dpsTtm >= 0 && dpsTtm <= 20 ? dpsTtm : (snapshotsByDate.get(effDate)?.dpsTtm ?? null),
      netDebt: Number.isFinite(netDebt) ? netDebt : null,
      avgNetDebt: Number.isFinite(avgNetDebt) ? avgNetDebt : (Number.isFinite(netDebt) ? netDebt : null),
      shares,
    });
  });

  const annualAsc = [...annual].sort((a, b) => a.sortKey - b.sortKey);
  annualAsc.forEach((row) => {
    if (!row.periodEnd) return;
    const effDate = filingDateByPeriod.get(row.periodEnd) ?? row.periodEnd;
    if (snapshotsByDate.has(effDate)) {
      const existing = snapshotsByDate.get(effDate);
      if (existing.epsNormalizedTtm === null && Number.isFinite(Number(row.values.epsDilutedNormalized))) {
        existing.epsNormalizedTtm = Number(row.values.epsDilutedNormalized);
      }
      if (existing.epsTtm === null && Number.isFinite(Number(row.values.epsDiluted))) {
        existing.epsTtm = Number(row.values.epsDiluted);
      }
      return;
    }
    const values = row.values;
    const ebitda = Number(values.ebitdaNormalized ?? values.ebitda);
    if (!Number.isFinite(ebitda) || ebitda <= 0) return;
    const eps = Number(values.epsDiluted);
    const epsNormalized = Number(values.epsDilutedNormalized);
    const fcf = Number(values.freeCashFlow);
    const fcfps = Number(values.cashFlowPerShare);
    const dps = Number(values.dividendPerShare);
    const netDebt = Number(values.netDebt);
    const shares = Number.isFinite(Number(values.weightedSharesDiluted)) && Number(values.weightedSharesDiluted) > 0
      ? Number(values.weightedSharesDiluted)
      : (Number.isFinite(Number(values.sharesOutstanding)) ? Number(values.sharesOutstanding) : null);
    const fcfPerShare = Number.isFinite(fcfps) ? fcfps : (Number.isFinite(fcf) && shares && shares > 0 ? fcf / shares : null);

    snapshotsByDate.set(effDate, {
      date: effDate,
      ebitdaTtm: ebitda,
      epsTtm: Number.isFinite(eps) ? eps : null,
      epsNormalizedTtm: Number.isFinite(epsNormalized) ? epsNormalized : (Number.isFinite(eps) ? eps : null),
      fcfTtm: Number.isFinite(fcf) ? fcf : null,
      fcfPerShareTtm: Number.isFinite(fcfPerShare) ? fcfPerShare : null,
      dpsTtm: Number.isFinite(dps) && dps >= 0 && dps <= 20 ? dps : null,
      netDebt: Number.isFinite(netDebt) ? netDebt : null,
      shares,
    });
  });

  const sortedSnaps = [...snapshotsByDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  for (const s of sortedSnaps) {
    if (s.epsNormalizedTtm === null || s.epsTtm === null) {
      const year = s.date?.slice(0, 4);
      const ann = annual.find((a) => a.periodEnd?.startsWith(year) || (a.sortKey && Math.floor(a.sortKey / 10) === Number(year)));
      if (s.epsNormalizedTtm === null && Number.isFinite(Number(ann?.values?.epsDilutedNormalized))) {
        s.epsNormalizedTtm = Number(ann.values.epsDilutedNormalized);
      }
      if (s.epsTtm === null && Number.isFinite(Number(ann?.values?.epsDiluted))) {
        s.epsTtm = Number(ann.values.epsDiluted);
      }
    }
  }

  for (let i = 1; i < sortedSnaps.length; i += 1) {
    const prev = sortedSnaps[i - 1];
    const curr = sortedSnaps[i];
    if (curr.epsNormalizedTtm === null && prev.epsNormalizedTtm !== null) curr.epsNormalizedTtm = prev.epsNormalizedTtm;
    if (curr.epsTtm === null && prev.epsTtm !== null) curr.epsTtm = prev.epsTtm;
    if (curr.fcfPerShareTtm === null && prev.fcfPerShareTtm !== null) curr.fcfPerShareTtm = prev.fcfPerShareTtm;
    if (curr.dpsTtm === null && prev.dpsTtm !== null) curr.dpsTtm = prev.dpsTtm;
  }
  for (let i = sortedSnaps.length - 2; i >= 0; i -= 1) {
    const next = sortedSnaps[i + 1];
    const curr = sortedSnaps[i];
    if (curr.epsNormalizedTtm === null && next.epsNormalizedTtm !== null) curr.epsNormalizedTtm = next.epsNormalizedTtm;
    if (curr.epsTtm === null && next.epsTtm !== null) curr.epsTtm = next.epsTtm;
    if (curr.fcfPerShareTtm === null && next.fcfPerShareTtm !== null) curr.fcfPerShareTtm = next.fcfPerShareTtm;
    if (curr.dpsTtm === null && next.dpsTtm !== null) curr.dpsTtm = next.dpsTtm;
  }

  return sortedSnaps;
}

export async function getValuationSeries(ticker, rangeKey = '5y') {
  const days = VALUATION_RANGES[rangeKey] ?? VALUATION_RANGES['5y'];
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const [company, prices] = await Promise.all([
    getCompanyByTicker(ticker),
    getHistoricalPrices(ticker, { from, to }).catch(() => []),
  ]);
  const [facts, submissions] = await Promise.all([
    getCompanyFacts(company),
    getCompanySubmissions(company).catch(() => null),
  ]);
  const { annual, quarterly } = buildSeries(facts);
  try {
    const extensionFacts = await getExtensionFacts(company);
    mergeInstanceFacts(annual, quarterly, extensionFacts, company.ticker);
  } catch {
    // Continuar
  }
  propagateMissingShares(annual, quarterly);
  rederiveCashValues(annual, quarterly);
  rederiveIncomeValues(annual, quarterly);
  rederiveBalanceValues(annual, quarterly);
  harmonizeSeriesSplits(annual, quarterly);

  const snapshots = pointInTimeSnapshot(annual, quarterly, submissions);
  const points = [];
  let snapshotIndex = -1;

  for (const price of prices) {
    while (snapshotIndex + 1 < snapshots.length && snapshots[snapshotIndex + 1].date <= price.date) snapshotIndex += 1;
    const snapshot = snapshotIndex >= 0 ? snapshots[snapshotIndex] : null;
    if (!snapshot) continue;

    const nextSnapshot = (snapshotIndex + 1 < snapshots.length) ? snapshots[snapshotIndex + 1] : null;

    let interpEbitda = snapshot.ebitdaTtm;
    let interpEps = snapshot.epsTtm;
    let interpEpsNorm = snapshot.epsNormalizedTtm;
    let interpDps = snapshot.dpsTtm;
    let interpFcf = snapshot.fcfTtm;
    let interpFcfPerShare = snapshot.fcfPerShareTtm;

    if (nextSnapshot) {
      const tCurr = Date.parse(`${snapshot.date}T00:00:00Z`);
      const tNext = Date.parse(`${nextSnapshot.date}T00:00:00Z`);
      const tPrice = Date.parse(`${price.date}T00:00:00Z`);
      const span = tNext - tCurr;
      if (span > 0) {
        const fraction = Math.max(0, Math.min(1, (tPrice - tCurr) / span));
        if (Number.isFinite(snapshot.ebitdaTtm) && snapshot.ebitdaTtm > 0 &&
            Number.isFinite(nextSnapshot.ebitdaTtm) && nextSnapshot.ebitdaTtm > 0) {
          interpEbitda = snapshot.ebitdaTtm + fraction * (nextSnapshot.ebitdaTtm - snapshot.ebitdaTtm);
        }
        if (Number.isFinite(snapshot.epsTtm) && Number.isFinite(nextSnapshot.epsTtm)) {
          interpEps = snapshot.epsTtm + fraction * (nextSnapshot.epsTtm - snapshot.epsTtm);
        }
        if (Number.isFinite(snapshot.epsNormalizedTtm) && Number.isFinite(nextSnapshot.epsNormalizedTtm)) {
          interpEpsNorm = snapshot.epsNormalizedTtm + fraction * (nextSnapshot.epsNormalizedTtm - snapshot.epsNormalizedTtm);
        }
        if (Number.isFinite(snapshot.dpsTtm) && snapshot.dpsTtm >= 0 &&
            Number.isFinite(nextSnapshot.dpsTtm) && nextSnapshot.dpsTtm >= 0) {
          interpDps = snapshot.dpsTtm + fraction * (nextSnapshot.dpsTtm - snapshot.dpsTtm);
        }
        if (Number.isFinite(snapshot.fcfTtm) && Number.isFinite(nextSnapshot.fcfTtm)) {
          interpFcf = snapshot.fcfTtm + fraction * (nextSnapshot.fcfTtm - snapshot.fcfTtm);
        }
        if (Number.isFinite(snapshot.fcfPerShareTtm) && Number.isFinite(nextSnapshot.fcfPerShareTtm)) {
          interpFcfPerShare = snapshot.fcfPerShareTtm + fraction * (nextSnapshot.fcfPerShareTtm - snapshot.fcfPerShareTtm);
        }
      }
    }

    const close = Number(price.close);
    if (!Number.isFinite(close) || close <= 0) continue;
    const shares = Number.isFinite(Number(snapshot.shares)) && Number(snapshot.shares) > 0
      ? Number(snapshot.shares)
      : (Number(company?.shares) || null);
    const marketCap = shares !== null ? close * shares : null;
    let netDebt = snapshot.netDebt;
    if (netDebt === null && snapshotIndex > 0) {
      for (let si = snapshotIndex - 1; si >= 0; si -= 1) {
        if (snapshots[si].netDebt !== null) { netDebt = snapshots[si].netDebt; break; }
      }
    }
    const enterpriseValue = marketCap !== null && netDebt !== null ? marketCap + netDebt : marketCap;
    const evEbitda = (enterpriseValue !== null && enterpriseValue > 0 && Number.isFinite(interpEbitda) && interpEbitda > 0)
      ? enterpriseValue / interpEbitda
      : null;
    const peRatio = Number.isFinite(interpEps) && interpEps > 0 ? close / interpEps : null;
    const peRatioNormalized = Number.isFinite(interpEpsNorm) && interpEpsNorm > 0 ? close / interpEpsNorm : null;
    const priceToFcf = Number.isFinite(interpFcfPerShare) && interpFcfPerShare > 0
      ? close / interpFcfPerShare
      : (marketCap !== null && Number.isFinite(interpFcf) && interpFcf > 0 ? marketCap / interpFcf : null);
    const netDebtToEbitda = netDebt !== null && Number.isFinite(interpEbitda) && interpEbitda > 0
      ? netDebt / interpEbitda
      : null;
    const dividendYield = Number.isFinite(interpDps) && interpDps >= 0 ? (interpDps / close) * 100 : null;
    const payoutRatio = (Number.isFinite(interpDps) && interpDps >= 0 && Number.isFinite(interpEps) && interpEps > 0)
      ? (interpDps / interpEps) * 100
      : null;
    const payoutRatioNormalized = (Number.isFinite(interpDps) && interpDps >= 0 && Number.isFinite(interpEpsNorm) && interpEpsNorm > 0)
      ? (interpDps / interpEpsNorm) * 100
      : null;

    points.push({
      t: Math.floor(Date.parse(`${price.date}T00:00:00Z`) / 1000),
      date: price.date,
      price: close,
      evEbitda: evEbitda !== null && evEbitda > 0 && evEbitda < 250 ? Math.round(evEbitda * 100) / 100 : null,
      peRatio: peRatio !== null && peRatio > 0 && peRatio < 300 ? Math.round(peRatio * 100) / 100 : null,
      peRatioNormalized: peRatioNormalized !== null && peRatioNormalized > 0 && peRatioNormalized < 300 ? Math.round(peRatioNormalized * 100) / 100 : null,
      priceToFcf: priceToFcf !== null && priceToFcf > 0 && priceToFcf < 300 ? Math.round(priceToFcf * 100) / 100 : null,
      netDebtToEbitda: netDebtToEbitda !== null && netDebtToEbitda > -50 && netDebtToEbitda < 50 ? Math.round(netDebtToEbitda * 100) / 100 : null,
      dividendYield: dividendYield !== null && dividendYield > 0 && dividendYield < 30 ? Math.round(dividendYield * 100) / 100 : null,
      payoutRatio: payoutRatio !== null && payoutRatio >= 0 && payoutRatio < 500 ? Math.round(payoutRatio * 100) / 100 : null,
      payoutRatioNormalized: payoutRatioNormalized !== null && payoutRatioNormalized >= 0 && payoutRatioNormalized < 500 ? Math.round(payoutRatioNormalized * 100) / 100 : null,
      dpsTtm: Number.isFinite(interpDps) ? Math.round(interpDps * 100) / 100 : null,
      netDebt: Number.isFinite(Number(netDebt)) ? Number(netDebt) : null,
      ebitdaTtm: Number.isFinite(Number(interpEbitda)) ? Math.round(interpEbitda) : null,
      epsTtm: Number.isFinite(interpEps) ? Math.round(interpEps * 100) / 100 : null,
      epsNormalizedTtm: Number.isFinite(interpEpsNorm) ? Math.round(interpEpsNorm * 100) / 100 : null,
      fcfTtm: Number.isFinite(interpFcf) ? Math.round(interpFcf) : null,
      fcfPerShareTtm: Number.isFinite(interpFcfPerShare) ? Math.round(interpFcfPerShare * 100) / 100 : null,
      enterpriseValue: Number.isFinite(Number(enterpriseValue)) ? Number(enterpriseValue) : null,
    });
  }

  sanitizeValuationSeries(points);

  return {
    range: VALUATION_RANGES[rangeKey] ? rangeKey : '5y',
    currency: 'USD',
    points,
    source: 'SEC EDGAR + Yahoo Finance',
  };
}
