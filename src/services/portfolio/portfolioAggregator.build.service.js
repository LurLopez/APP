/**
 * @fileoverview Módulo extraído de portfolioAggregator.service.js.
 */

import * as portfolioRepository from '../../../db/repositories/portfolioRepository.js';
import { listCalendarTickers, getUserPreferences } from '../../../db/repositories/watchlistRepository.js';
import { getMarketQuote, getDividendHistory, getCompanyCalendar } from '../market.service.js';
import { getCompanyOrigin, getCompanyFilings } from '../edgar.service.js';
import { buildState, round } from './portfolioFifo.service.js';
import { buildPortfolioDividends } from './portfolioDividends.service.js';
import { buildPortfolioCalendarEvents } from './portfolioCalendarEvents.service.js';
import { regionForCountry, instrumentTypeLabel, todayIso, daysAgoIso, dividendsBetween, ttmDividendPerShare } from './portfolioAggregator.helpers.js';

export async function getPortfolio(userId) {
  const transactions = await portfolioRepository.listTransactions(userId);
  const state = buildState(transactions);
  const now = todayIso();
  const ttmFrom = daysAgoIso(365);

  const [tabs, groups, rules, lotAssignments, calendarItems, userPreferences] = await Promise.all([
    portfolioRepository.listTabs(userId),
    portfolioRepository.listGroups(userId),
    portfolioRepository.listGroupRules(userId),
    portfolioRepository.listGroupLots(userId),
    listCalendarTickers(userId),
    getUserPreferences(userId),
  ]);

  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const ruleGroupsByTicker = new Map();
  const explicitLotGroups = new Map();

  for (const rule of rules) {
    const group = groupsById.get(rule.groupId);
    if (!group) continue;
    const list = ruleGroupsByTicker.get(rule.ticker) ?? [];
    list.push(group);
    ruleGroupsByTicker.set(rule.ticker, list);
  }
  for (const assignment of lotAssignments) {
    const group = groupsById.get(assignment.groupId);
    if (!group) continue;
    const list = explicitLotGroups.get(assignment.buyTransactionId) ?? [];
    list.push(group);
    explicitLotGroups.set(assignment.buyTransactionId, list);
  }

  const portfolioTickers = [...new Set(state.map((item) => item.ticker))];
  const calendarTickers = [...new Set((calendarItems || []).map((item) => String(item.ticker).toUpperCase()))];
  const tickers = [...new Set([...portfolioTickers, ...calendarTickers])];

  const minBuyDate = new Map();
  for (const transaction of transactions) {
    if (transaction.type !== 'buy') continue;
    const date = String(transaction.tradeDate).slice(0, 10);
    const current = minBuyDate.get(transaction.ticker);
    if (!current || date < current) minBuyDate.set(transaction.ticker, date);
  }

  const [dividendMap, originMap, quoteMap, filingsMap, calendarMap] = await Promise.all([
    Promise.all(tickers.map(async (ticker) => {
      try {
        const from = minBuyDate.get(ticker);
        return [ticker, await getDividendHistory(ticker, { from: from && from < ttmFrom ? from : ttmFrom })];
      } catch {
        return [ticker, []];
      }
    })).then((entries) => new Map(entries)),
    Promise.all(tickers.map(async (ticker) => {
      try {
        return [ticker, await getCompanyOrigin(ticker)];
      } catch {
        return [ticker, { sector: null, country: null }];
      }
    })).then((entries) => new Map(entries)),
    Promise.all(tickers.map(async (ticker) => {
      try {
        return [ticker, await getMarketQuote(ticker)];
      } catch {
        return [ticker, null];
      }
    })).then((entries) => new Map(entries)),
    Promise.all(tickers.map(async (ticker) => {
      try {
        const res = await getCompanyFilings(ticker);
        return [ticker, res?.filings ?? []];
      } catch {
        return [ticker, []];
      }
    })).then((entries) => new Map(entries)),
    Promise.all(tickers.map(async (ticker) => {
      try {
        return [ticker, await getCompanyCalendar(ticker)];
      } catch {
        return [ticker, null];
      }
    })).then((entries) => new Map(entries)),
  ]);

  const positions = state.map((item) => {
    const dividends = dividendMap.get(item.ticker) ?? [];
    const quote = quoteMap.get(item.ticker);
    const price = Number(quote?.price);
    const hasPrice = Number.isFinite(price) && price > 0;
    const ruleGroups = (ruleGroupsByTicker.get(item.ticker) ?? [])
      .map((group) => ({ ...group, viaRule: true }));

    let costBasis = 0;
    let heldDividends = 0;
    let soldDividends = 0;

    for (const lot of item.lots) {
      if (lot.remaining > 0) {
        costBasis += lot.price * lot.remaining;
        heldDividends += dividendsBetween(dividends, lot.date, now, lot.remaining);
      }
      for (const portion of lot.soldPortions) {
        soldDividends += dividendsBetween(dividends, lot.date, portion.sellDate, portion.shares);
      }
    }

    const totalDividends = heldDividends + soldDividends;
    const shares = item.heldShares;
    const totalInvested = item.lots.reduce((sum, lot) => sum + lot.price * lot.shares, 0);
    const avgCost = shares > 0 ? costBasis / shares : null;
    const value = hasPrice ? price * shares : null;
    const unrealizedGross = hasPrice && shares > 0 ? value - costBasis : null;
    const projectedAnnual = shares > 0 ? ttmDividendPerShare(dividends, ttmFrom, now) * shares : 0;
    const realizedGross = item.realizedGross;
    const unrealizedWithDividends = unrealizedGross !== null ? unrealizedGross + heldDividends : null;
    const totalReturn = unrealizedGross !== null ? unrealizedGross + realizedGross + totalDividends : realizedGross + totalDividends;
    const totalReturnPct = totalReturn !== null && costBasis > 0 ? (totalReturn / costBasis) * 100 : null;

    const lots = item.lots.map((lot) => {
      const heldShares = lot.remaining;
      const heldCost = lot.price * heldShares;
      const heldValue = hasPrice ? price * heldShares : null;
      const lotHeldDividends = dividendsBetween(dividends, lot.date, now, heldShares);
      const sales = (lot.soldPortions ?? []).map((portion) => {
        const proceeds = portion.sellPrice * portion.shares;
        return {
          date: portion.sellDate,
          shares: portion.shares,
          price: portion.sellPrice,
          proceeds: round(proceeds),
          gain: round(proceeds - lot.price * portion.shares),
          dividends: round(dividendsBetween(dividends, lot.date, portion.sellDate, portion.shares)),
        };
      });

      const explicitGroups = (explicitLotGroups.get(lot.id) ?? []).map((group) => ({ ...group, viaRule: false }));
      const lotGroups = [...ruleGroups];
      for (const group of explicitGroups) {
        if (!lotGroups.some((it) => it.id === group.id)) lotGroups.push(group);
      }

      return {
        id: lot.id,
        date: lot.date,
        price: lot.price,
        shares: lot.shares,
        remaining: heldShares,
        cost: round(lot.price * lot.shares),
        heldCost: round(heldCost),
        heldValue: round(heldValue),
        heldUnrealized: heldValue !== null ? round(heldValue - heldCost) : null,
        heldDividends: round(lotHeldDividends),
        sales,
        groups: lotGroups,
      };
    });

    return {
      ticker: item.ticker,
      companyName: item.companyName,
      sector: originMap.get(item.ticker)?.sector ?? null,
      type: instrumentTypeLabel(quote?.instrumentType),
      country: originMap.get(item.ticker)?.country ?? null,
      region: regionForCountry(originMap.get(item.ticker)?.country),
      shares,
      sharesSold: item.sharesSold ?? 0,
      soldProceeds: item.saleProceeds ?? 0,
      totalInvested: round(totalInvested),
      lots,
      avgCost: round(avgCost, 4),
      costBasis: round(costBasis),
      price: hasPrice ? round(price, 4) : null,
      value: round(value),
      unrealizedGross: round(unrealizedGross),
      unrealizedWithDividends: round(unrealizedWithDividends),
      realizedGross: round(realizedGross),
      realizedWithDividendsOnSold: round(realizedGross + soldDividends),
      realizedPlusAllDividends: round(realizedGross + totalDividends),
      totalReturn: round(totalReturn),
      totalReturnPct: round(totalReturnPct),
      dividendsHeld: round(heldDividends),
      dividendsSold: round(soldDividends),
      dividendsTotal: round(totalDividends),
      projectedAnnualDividends: round(projectedAnnual),
      quote,
      groups: ruleGroups,
    };
  });

  const totalValue = positions.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const totalCost = positions.reduce((sum, item) => sum + item.costBasis, 0);
  const totalUnrealized = positions.reduce((sum, item) => sum + (item.unrealizedGross ?? 0), 0);
  const totalRealized = positions.reduce((sum, item) => sum + item.realizedGross, 0);
  const totalDividends = positions.reduce((sum, item) => sum + item.dividendsTotal, 0);
  const totalReturn = totalUnrealized + totalRealized + totalDividends;
  const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : null;
  const projectedAnnualDividends = positions.reduce((sum, item) => sum + item.projectedAnnualDividends, 0);
  const dividendYield = totalValue > 0 ? (projectedAnnualDividends / totalValue) * 100 : null;

  const byCompany = positions
    .filter((item) => (item.value ?? 0) > 0)
    .map((item) => ({
      ticker: item.ticker,
      companyName: item.companyName,
      value: item.value,
      percent: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const sectorTotals = new Map();
  for (const item of positions) {
    if ((item.value ?? 0) <= 0) continue;
    const sector = item.sector && item.sector !== '—' ? item.sector : 'Otros';
    const current = sectorTotals.get(sector) ?? { value: 0, tickers: [] };
    current.value += item.value;
    current.tickers.push(item.ticker);
    sectorTotals.set(sector, current);
  }
  const bySector = [...sectorTotals.entries()]
    .map(([sector, data]) => ({
      sector,
      value: round(data.value),
      percent: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
      tickers: data.tickers,
    }))
    .sort((a, b) => b.value - a.value);

  const saleGains = state.saleGains ?? new Map();
  const rulesByGroup = new Map();
  for (const rule of rules) {
    const list = rulesByGroup.get(rule.groupId) ?? [];
    list.push(rule.ticker);
    rulesByGroup.set(rule.groupId, list);
  }
  const lotsByGroup = new Map();
  for (const assignment of lotAssignments) {
    const list = lotsByGroup.get(assignment.groupId) ?? [];
    list.push(assignment.buyTransactionId);
    lotsByGroup.set(assignment.groupId, list);
  }

  const dividendDashboardData = buildPortfolioDividends(positions, state, dividendMap, ttmFrom, now);
  const { events: calendarEvents, companies: calendarCompanies } = buildPortfolioCalendarEvents(positions, calendarItems, dividendMap, filingsMap, quoteMap, calendarMap);

  return {
    summary: {
      totalValue: round(totalValue),
      totalCost: round(totalCost),
      totalUnrealized: round(totalUnrealized),
      totalRealized: round(totalRealized),
      totalDividends: round(totalDividends),
      totalReturn: round(totalReturn),
      totalReturnPct: round(totalReturnPct),
      projectedAnnualDividends: round(projectedAnnualDividends),
      dividendYield: round(dividendYield),
    },
    positions,
    dividends: dividendDashboardData,
    calendarEvents,
    calendarCompanies,
    userPreferences,
    transactions: transactions.map((transaction) => ({
      ...transaction,
      realizedGain: transaction.type === 'sell' ? round(saleGains.get(transaction.id) ?? 0) : null,
    })),
    allocations: { byCompany, bySector },
    tabs,
    groups: groups.map((group) => ({
      ...group,
      ruleTickers: rulesByGroup.get(group.id) ?? [],
      lotTransactionIds: lotsByGroup.get(group.id) ?? [],
    })),
  };
}
