/**
 * @fileoverview Módulo extraído de valuationSeries.js.
 */

import { getHistoricalPrices } from '../market.service.js';
import { getCompanyByTicker, getCompanyFacts, getCompanySubmissions } from './companyProfile.js';
import { buildSeries } from './factsSeries.js';
import { getExtensionFacts, mergeInstanceFacts } from './instanceFacts.js';
import { normalizeShareUnits, propagateMissingShares, harmonizeSeriesSplits } from './sharesHarmonizer.js';
import { rederiveCashValues, rederiveIncomeValues, rederiveBalanceValues } from './rederiveStatements.js';
import { pointInTimeSnapshot } from './valuationPointInTime.js';

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

export async function getValuationSeries(ticker, rangeKey = '5y', { bufferDays = 0 } = {}) {
  const days = VALUATION_RANGES[rangeKey] ?? VALUATION_RANGES['5y'];
  // Días extra de histórico previos al rango: permiten calcular medias móviles
  // largas con lookback completo (el cliente filtra los puntos del rango).
  const extraDays = Math.max(0, Math.min(7305, Math.round(Number(bufferDays) || 0)));
  const to = new Date().toISOString().slice(0, 10);
  const rangeFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const from = extraDays > 0
    ? new Date(Date.now() - (days + extraDays) * 86400000).toISOString().slice(0, 10)
    : rangeFrom;
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
  normalizeShareUnits(annual, quarterly);
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
    rangeFrom,
    points,
    source: 'SEC EDGAR + Yahoo Finance',
  };
}
