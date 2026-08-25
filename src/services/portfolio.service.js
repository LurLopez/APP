import * as portfolioRepository from '../../db/repositories/portfolioRepository.js';
import { getMarketQuote, getDividendHistory, getHistoricalPrices } from './market.service.js';
import { getCompanyOrigin } from './edgar.service.js';

export class PortfolioError extends Error {
  constructor(message, code = 'PORTFOLIO_ERROR') {
    super(message);
    this.code = code;
  }
}

const NORTH_AMERICA = new Set(['Estados Unidos', 'United States', 'US', 'USA', 'CA', 'Canada', 'Canadá', 'MX', 'Mexico', 'México', 'BM', 'Bermudas']);
const EUROPE = new Set(['GB', 'UK', 'DE', 'FR', 'ES', 'IT', 'NL', 'CH', 'IE', 'SE', 'NO', 'DK', 'BE', 'PT', 'AT', 'FI', 'PL', 'LU', 'GR', 'HU', 'CZ', 'RO', 'SK', 'SI', 'HR', 'BG', 'LT', 'LV', 'EE', 'CY', 'MT', 'IS', 'LI', 'MC', 'AD', 'VA', 'RU', 'Rusia', 'Reino Unido', 'Alemania', 'Francia', 'España', 'Italia', 'Países Bajos', 'Suiza', 'Irlanda', 'Suecia', 'Noruega', 'Dinamarca', 'Bélgica', 'Portugal', 'Austria', 'Finlandia', 'Polonia', 'Luxemburgo', 'Grecia', 'Israel', 'IL']);
const ASIA_PACIFIC = new Set(['JP', 'Japón', 'CN', 'China', 'HK', 'Hong Kong', 'IN', 'India', 'KR', 'Corea del Sur', 'SG', 'Singapur', 'TW', 'Taiwán', 'AU', 'Australia', 'NZ', 'Nueva Zelanda', 'ID', 'Indonesia', 'MY', 'Malasia', 'TH', 'Tailandia', 'PH', 'Filipinas', 'VN', 'Vietnam']);
const LATAM = new Set(['AR', 'Argentina', 'BR', 'Brasil', 'CL', 'Chile', 'CO', 'Colombia', 'PE', 'Perú', 'UY', 'Uruguay', 'PA', 'Panamá', 'CR', 'Costa Rica', 'DO', 'República Dominicana']);

function regionForCountry(country) {
  const normalized = String(country ?? '').trim();
  if (!normalized) return null;
  if (NORTH_AMERICA.has(normalized)) return 'América del Norte';
  if (EUROPE.has(normalized)) return 'Europa';
  if (ASIA_PACIFIC.has(normalized)) return 'Asia-Pacífico';
  if (LATAM.has(normalized)) return 'Latinoamérica';
  return 'Internacional';
}

function instrumentTypeLabel(instrumentType) {
  if (!instrumentType) return null;
  if (instrumentType === 'EQUITY') return 'Acción';
  if (instrumentType === 'ETF') return 'ETF';
  if (instrumentType === 'INDEX') return 'Índice';
  return String(instrumentType);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function buildState(transactions) {
  const byTicker = new Map();
  for (const transaction of transactions) {
    const ticker = String(transaction.ticker ?? '').toUpperCase();
    if (!byTicker.has(ticker)) byTicker.set(ticker, { buys: [], sells: [] });
    const bucket = byTicker.get(ticker);
    if (transaction.type === 'buy') bucket.buys.push(transaction);
    else bucket.sells.push(transaction);
  }

  const state = [];
  const saleGains = new Map();
  for (const [ticker, bucket] of byTicker) {
    const lots = bucket.buys.map((buy) => ({
      id: buy.id,
      date: buy.tradeDate,
      price: buy.price,
      shares: buy.shares,
      remaining: buy.shares,
      soldPortions: [],
    }));
    let realizedGross = 0;
    let sharesSold = 0;
    let saleProceeds = 0;
    for (const sell of bucket.sells) {
      let toSell = sell.shares;
      let saleGain = 0;
      for (const lot of lots) {
        if (toSell <= 0) break;
        if (lot.remaining <= 0) continue;
        const used = Math.min(toSell, lot.remaining);
        lot.remaining -= used;
        lot.soldPortions.push({ shares: used, sellDate: sell.tradeDate, sellPrice: sell.price });
        sharesSold += used;
        saleProceeds += sell.price * used;
        const gain = (sell.price - lot.price) * used;
        realizedGross += gain;
        saleGain += gain;
        toSell -= used;
      }
      if (toSell > 0) {
        throw new PortfolioError(
          `No tienes suficientes acciones de ${ticker} para la venta registrada.`,
          'NOT_ENOUGH_SHARES',
        );
      }
      saleGains.set(sell.id, saleGain);
    }
    const heldShares = lots.reduce((sum, lot) => sum + lot.remaining, 0);
    state.push({
      ticker,
      companyName: bucket.buys[0]?.companyName ?? bucket.sells[0]?.companyName ?? ticker,
      lots,
      heldShares,
      realizedGross,
      sharesSold: round(sharesSold, 4),
      saleProceeds: round(saleProceeds),
    });
  }
  state.saleGains = saleGains;
  return state;
}

function dividendsBetween(dividends, fromDate, toDate, shares) {
  if (!fromDate || !toDate || fromDate > toDate) return 0;
  let perShare = 0;
  for (const dividend of dividends) {
    if (dividend.date >= fromDate && dividend.date <= toDate) perShare += dividend.amount;
  }
  return perShare * shares;
}

function ttmDividendPerShare(dividends, fromDate, toDate) {
  let perShare = 0;
  for (const dividend of dividends) {
    if (dividend.date >= fromDate && dividend.date <= toDate) perShare += dividend.amount;
  }
  return perShare;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const CHART_METRICS = new Set(['gainAmount', 'gainPct', 'dividendYield', 'dividendYoc', 'weight']);
const CHART_RANGES = new Set(['1m', '3m', '6m', '1y', '2y', '3y', '5y', 'all']);
const RANGE_DAYS = { '1m': 31, '3m': 93, '6m': 186, '1y': 365, '2y': 730, '3y': 1095, '5y': 1825 };

function chartStartDate(range) {
  if (range === 'all') return null;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - RANGE_DAYS[range]);
  return date.toISOString().slice(0, 10);
}

function chartSeriesValue(metric, selectedLots, priceMaps, dividendMap, date, portfolioValue) {
  let shares = 0;
  let cost = 0;
  let gain = 0;
  let annualDividends = 0;
  let frozen = false;
  let frozenValue = 0;
  let frozenGain = 0;
  let frozenCost = 0;
  let frozenAnnual = 0;
  let value = 0;
  let pricedShares = 0;
  let realizedGain = 0;
  let realizedCost = 0;
  for (const selected of selectedLots) {
    const { item, lot } = selected;
    const bought = lot.date <= date;
    if (!bought) continue;
    let lotShares = lot.shares;
    let soldDate = null;
    for (const portion of lot.soldPortions ?? []) {
      if (portion.sellDate <= date) {
        lotShares -= portion.shares;
        soldDate = portion.sellDate;
        realizedGain += (portion.sellPrice - lot.price) * portion.shares;
        realizedCost += lot.price * portion.shares;
      }
    }
    const heldCost = lotShares * lot.price;
    const dateObj = new Date(`${date}T00:00:00Z`);
    dateObj.setUTCDate(dateObj.getUTCDate() - 365);
    const dividends = dividendMap.get(item.ticker) ?? [];
    const dividendPerShare = ttmDividendPerShare(dividends, dateObj.toISOString().slice(0, 10), date);
    if (lotShares > 0) {
      shares += lotShares;
      cost += heldCost;
      annualDividends += dividendPerShare * lotShares;
      const price = priceMaps.get(item.ticker)?.get(date);
      if (price !== undefined) {
        gain += (price - lot.price) * lotShares;
        value += price * lotShares;
        pricedShares += lotShares;
      }
    } else if (soldDate && soldDate <= date) {
      frozen = true;
      for (const sale of lot.soldPortions ?? []) {
        if (sale.sellDate > date) continue;
        frozenCost += sale.shares * lot.price;
        frozenValue += sale.shares * sale.sellPrice;
        frozenGain += sale.shares * (sale.sellPrice - lot.price);
        const saleDate = new Date(`${sale.sellDate}T00:00:00Z`);
        saleDate.setUTCDate(saleDate.getUTCDate() - 365);
        const saleDividendPerShare = ttmDividendPerShare(dividends, saleDate.toISOString().slice(0, 10), sale.sellDate);
        frozenAnnual += saleDividendPerShare * sale.shares;
      }
    }
  }
  if (frozen && shares === 0) {
    if (metric === 'weight') return 0;
    if (metric === 'gainAmount') return frozenGain;
    if (metric === 'gainPct') return frozenCost > 0 ? (frozenGain / frozenCost) * 100 : null;
    if (metric === 'dividendYield') return frozenValue > 0 ? (frozenAnnual / frozenValue) * 100 : null;
    if (metric === 'dividendYoc') return frozenCost > 0 ? (frozenAnnual / frozenCost) * 100 : null;
  }
  if (metric === 'gainAmount') return shares > 0 && pricedShares > 0 ? gain + realizedGain : null;
  if (metric === 'gainPct') return cost + realizedCost > 0 && pricedShares > 0 ? ((gain + realizedGain) / (cost + realizedCost)) * 100 : null;
  if (metric === 'dividendYield') return value > 0 ? (annualDividends / value) * 100 : null;
  if (metric === 'dividendYoc') return cost > 0 ? (annualDividends / cost) * 100 : null;
  return portfolioValue > 0 ? (value / portfolioValue) * 100 : 0;
}

export async function getPortfolioChart(userId, { ids, metric = 'gainPct', range = '1y' }) {
  if (!CHART_METRICS.has(metric)) throw new PortfolioError('Métrica de gráfico no válida.', 'INVALID_CHART');
  if (!CHART_RANGES.has(range)) throw new PortfolioError('Rango de gráfico no válido.', 'INVALID_CHART');
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20) throw new PortfolioError('Selecciona entre 1 y 20 elementos.', 'INVALID_CHART');
  const transactions = await portfolioRepository.listTransactions(userId);
  const state = buildState(transactions);
  const groups = await portfolioRepository.listGroups(userId);
  const rules = await portfolioRepository.listGroupRules(userId);
  const lotAssignments = await portfolioRepository.listGroupLots(userId);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const start = chartStartDate(range);
  const today = todayIso();
  const from = transactions.map((item) => item.tradeDate).sort()[0] ?? today;
  const selected = ids.map((raw) => String(raw).trim()).filter((id) => /^(ticker|lot|group):[A-Za-z0-9.-]+$/.test(id));
  if (selected.length !== ids.length) throw new PortfolioError('Elemento de gráfico no válido.', 'INVALID_CHART');
  const tickerPrices = new Map();
  const tickerDividends = new Map();
  const tickers = [...new Set(state.map((item) => item.ticker))];
  await Promise.all(tickers.map(async (ticker) => {
    const [prices, dividends] = await Promise.all([
      getHistoricalPrices(ticker, { from, to: today }).catch(() => []),
      getDividendHistory(ticker, { from }).catch(() => []),
    ]);
    tickerPrices.set(ticker, prices);
    tickerDividends.set(ticker, dividends);
  }));
  const dates = [...new Set([...tickerPrices.values()].flat().map((point) => point.date))].sort().filter((date) => !start || date >= start).slice(-4000);
  const priceMaps = new Map([...tickerPrices].map(([ticker, points]) => {
    const map = new Map();
    let last;
    for (const date of dates) {
      const current = points.find((point) => point.date === date)?.close;
      if (current !== undefined) last = current;
      if (last !== undefined) map.set(date, last);
    }
    return [ticker, map];
  }));
  const selectedLots = (id) => {
    if (id.startsWith('lot:')) return state.flatMap((item) => item.lots.filter((lot) => String(lot.id) === id.slice(4)).map((lot) => ({ item, lot })));
    if (id.startsWith('ticker:')) return state.filter((item) => item.ticker === id.slice(7)).flatMap((item) => item.lots.map((lot) => ({ item, lot })));
    const group = groupById.get(Number(id.slice(6)));
    if (!group) return [];
    const groupTickers = new Set(rules.filter((rule) => rule.groupId === group.id).map((rule) => rule.ticker));
    const groupLots = new Set(lotAssignments.filter((item) => item.groupId === group.id).map((item) => item.buyTransactionId));
    return state.flatMap((item) => item.lots.filter((lot) => groupTickers.has(item.ticker) || groupLots.has(lot.id)).map((lot) => ({ item, lot })));
  };
  const valueForDate = (date) => state.reduce((sum, item) => {
    const price = priceMaps.get(item.ticker)?.get(date);
    const held = item.lots.reduce((shares, lot) => shares + (lot.date <= date ? lot.shares - (lot.soldPortions ?? []).filter((sale) => sale.sellDate <= date).reduce((total, sale) => total + sale.shares, 0) : 0), 0);
    return sum + (price === undefined ? 0 : price * held);
  }, 0);
  const labels = selected.map((id) => {
    const lots = selectedLots(id);
    const first = lots[0]?.item;
    const group = id.startsWith('group:') ? groupById.get(Number(id.slice(6))) : null;
    return { id, label: group?.name ?? (id.startsWith('lot:') ? `${first?.ticker ?? ''} · Compra ${id.slice(4)}` : first?.companyName ?? id.slice(id.indexOf(':') + 1)), lots };
  });
  return { metric, range, source: 'Yahoo Finance', points: dates.map((date) => ({ date, series: labels.map(({ lots }) => chartSeriesValue(metric, lots, priceMaps, tickerDividends, date, valueForDate(date))) })), labels: labels.map(({ id, label }) => ({ id, label })) };
}

export async function addBuy(userId, { ticker, companyName, shares, price, tradeDate }) {
  return portfolioRepository.addTransaction(userId, {
    ticker: String(ticker).trim().toUpperCase(),
    companyName,
    type: 'buy',
    shares,
    price,
    tradeDate,
  });
}

export async function addSell(userId, { ticker, companyName, shares, price, tradeDate }) {
  const available = await heldSharesOf(userId, ticker);
  if (available <= 0) {
    throw new PortfolioError(`No tienes acciones de ${ticker} en cartera.`, 'NOT_ENOUGH_SHARES');
  }
  if (shares > available) {
    throw new PortfolioError(
      `Solo tienes ${round(available, 4)} acciones de ${ticker}. No puedes vender ${round(shares, 4)}.`,
      'NOT_ENOUGH_SHARES',
    );
  }
  return portfolioRepository.addTransaction(userId, {
    ticker: String(ticker).trim().toUpperCase(),
    companyName,
    type: 'sell',
    shares,
    price,
    tradeDate,
  });
}

async function heldSharesOf(userId, ticker) {
  const transactions = await portfolioRepository.listTransactions(userId);
  const state = buildState(transactions);
  const position = state.find((item) => item.ticker === String(ticker).trim().toUpperCase());
  return position?.heldShares ?? 0;
}

export async function removeTransaction(userId, transactionId) {
  const transaction = await portfolioRepository.getTransaction(userId, transactionId);
  if (!transaction) {
    throw new PortfolioError('La transacción no existe.', 'NOT_FOUND');
  }
  const remaining = (await portfolioRepository.listTransactions(userId)).filter((item) => item.id !== transactionId);
  try {
    buildState(remaining);
  } catch (error) {
    throw new PortfolioError(
      'No se puede eliminar: dejaría la cartera con más ventas que acciones compradas.',
      'INVALID_STATE',
    );
  }
  await portfolioRepository.deleteTransaction(userId, transactionId);
}

export async function getPortfolio(userId) {
  const transactions = await portfolioRepository.listTransactions(userId);
  const state = buildState(transactions);
  const now = todayIso();
  const ttmFrom = daysAgoIso(365);

  const [tabs, groups, rules, lotAssignments] = await Promise.all([
    portfolioRepository.listTabs(userId),
    portfolioRepository.listGroups(userId),
    portfolioRepository.listGroupRules(userId),
    portfolioRepository.listGroupLots(userId),
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

  const tickers = [...new Set(state.map((item) => item.ticker))];
  const minBuyDate = new Map();
  for (const transaction of transactions) {
    if (transaction.type !== 'buy') continue;
    const date = String(transaction.tradeDate).slice(0, 10);
    const current = minBuyDate.get(transaction.ticker);
    if (!current || date < current) minBuyDate.set(transaction.ticker, date);
  }
  const [dividendMap, originMap, quoteMap] = await Promise.all([
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
    const realizedWithDividendsOnSold = realizedGross + soldDividends;
    const realizedPlusAllDividends = realizedGross + totalDividends;
    const totalReturn = unrealizedGross !== null
      ? unrealizedGross + realizedGross + totalDividends
      : realizedGross + totalDividends;
    const totalReturnPct = totalReturn !== null && costBasis > 0 ? (totalReturn / costBasis) * 100 : null;

    const lots = item.lots.map((lot) => {
      const heldShares = lot.remaining;
      const heldCost = lot.price * heldShares;
      const heldValue = hasPrice ? price * heldShares : null;
      const heldDividends = dividendsBetween(dividends, lot.date, now, heldShares);
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
      const explicitGroups = (explicitLotGroups.get(lot.id) ?? [])
        .map((group) => ({ ...group, viaRule: false }));
      const lotGroups = [...ruleGroups];
      for (const group of explicitGroups) {
        if (!lotGroups.some((item) => item.id === group.id)) lotGroups.push(group);
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
        heldDividends: round(heldDividends),
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
      realizedWithDividendsOnSold: round(realizedWithDividendsOnSold),
      realizedPlusAllDividends: round(realizedPlusAllDividends),
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

/* ── Pestañas ──────────────────────────────────────────────── */

function isDuplicateError(error) {
  return error?.code === '23505';
}

export async function createTab(userId, { name, color }) {
  try {
    return await portfolioRepository.createTab(userId, { name, color });
  } catch (error) {
    if (isDuplicateError(error)) {
      throw new PortfolioError('Ya existe una pestaña con ese nombre.', 'DUPLICATE');
    }
    throw error;
  }
}

export async function updateTab(userId, tabId, { name, color }) {
  try {
    const tab = await portfolioRepository.updateTab(userId, tabId, { name, color });
    if (!tab) throw new PortfolioError('La pestaña no existe.', 'NOT_FOUND');
    return tab;
  } catch (error) {
    if (isDuplicateError(error)) {
      throw new PortfolioError('Ya existe una pestaña con ese nombre.', 'DUPLICATE');
    }
    throw error;
  }
}

export async function deleteTab(userId, tabId) {
  const deleted = await portfolioRepository.deleteTab(userId, tabId);
  if (!deleted) throw new PortfolioError('La pestaña no existe.', 'NOT_FOUND');
  return deleted;
}

/* ── Grupos ────────────────────────────────────────────────── */

export async function createGroup(userId, { tabId, name, color }) {
  const tab = await portfolioRepository.getTab(userId, tabId);
  if (!tab) throw new PortfolioError('La pestaña no existe.', 'NOT_FOUND');
  try {
    return await portfolioRepository.createGroup(userId, { tabId, name, color });
  } catch (error) {
    if (isDuplicateError(error)) {
      throw new PortfolioError('Ya existe un grupo con ese nombre en esta pestaña.', 'DUPLICATE');
    }
    throw error;
  }
}

export async function updateGroup(userId, groupId, { name, color }) {
  try {
    const group = await portfolioRepository.updateGroup(userId, groupId, { name, color });
    if (!group) throw new PortfolioError('El grupo no existe.', 'NOT_FOUND');
    return group;
  } catch (error) {
    if (isDuplicateError(error)) {
      throw new PortfolioError('Ya existe un grupo con ese nombre en esta pestaña.', 'DUPLICATE');
    }
    throw error;
  }
}

export async function deleteGroup(userId, groupId) {
  const deleted = await portfolioRepository.deleteGroup(userId, groupId);
  if (!deleted) throw new PortfolioError('El grupo no existe.', 'NOT_FOUND');
  return deleted;
}

/* ── Miembros de grupo ─────────────────────────────────────── */

export async function addGroupTicker(userId, groupId, ticker) {
  const group = await portfolioRepository.getGroup(userId, groupId);
  if (!group) throw new PortfolioError('El grupo no existe.', 'NOT_FOUND');
  await portfolioRepository.addTickerRule(userId, groupId, String(ticker).trim().toUpperCase());
}

export async function removeGroupTicker(userId, groupId, ticker) {
  const group = await portfolioRepository.getGroup(userId, groupId);
  if (!group) throw new PortfolioError('El grupo no existe.', 'NOT_FOUND');
  await portfolioRepository.removeTickerRule(userId, groupId, String(ticker).trim().toUpperCase());
}

export async function addGroupLot(userId, groupId, transactionId) {
  const group = await portfolioRepository.getGroup(userId, groupId);
  if (!group) throw new PortfolioError('El grupo no existe.', 'NOT_FOUND');
  const transaction = await portfolioRepository.getTransaction(userId, transactionId);
  if (!transaction || transaction.type !== 'buy') {
    throw new PortfolioError('La sublínea debe ser una compra de tu cartera.', 'INVALID_LOT');
  }
  await portfolioRepository.addLotAssignment(userId, groupId, transactionId);
}

export async function removeGroupLot(userId, groupId, transactionId) {
  const group = await portfolioRepository.getGroup(userId, groupId);
  if (!group) throw new PortfolioError('El grupo no existe.', 'NOT_FOUND');
  await portfolioRepository.removeLotAssignment(userId, groupId, transactionId);
}
