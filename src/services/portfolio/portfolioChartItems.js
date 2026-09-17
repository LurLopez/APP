/**
 * @fileoverview Resolución de los elementos seleccionables del gráfico comparativo
 * de cartera: tickers (compra/venta/total), lotes concretos, grupos personalizados
 * y grupos predefinidos por sector, país, región o tipo de instrumento.
 * @module services/portfolio/portfolioChartItems
 */

import { regionForCountry, instrumentTypeLabel } from './portfolioAggregator.service.js';

const PREDEFINED_GROUP_TABS = ['sector', 'country', 'region', 'type'];

function getPredefinedGroupValue(ticker, tabKey, originMap, quoteMap) {
  if (tabKey === 'sector') return originMap.get(ticker)?.sector || 'Sin sector';
  if (tabKey === 'country') return originMap.get(ticker)?.country || 'Sin país';
  if (tabKey === 'region') return regionForCountry(originMap.get(ticker)?.country) || 'Sin región';
  if (tabKey === 'type') return instrumentTypeLabel(quoteMap.get(ticker)?.instrumentType) || 'Sin tipo';
  return null;
}

function resolvePredefinedLots(tabKey, targetLabel, { state, originMap, quoteMap }) {
  const matching = state.filter((item) => {
    const value = getPredefinedGroupValue(item.ticker, tabKey, originMap, quoteMap);
    return value && value.toLowerCase() === targetLabel.toLowerCase();
  });
  return matching.flatMap((item) => item.lots.map((lot) => ({ item, lot })));
}

function isMixedPosition(position) {
  return (position.heldShares ?? 0) > 0 && (position.sharesSold ?? 0) > 0;
}

function inferTickerMode(position) {
  const hasHeld = (position.heldShares ?? 0) > 0;
  const hasSold = (position.sharesSold ?? 0) > 0;
  if (hasHeld && hasSold) return 'all';
  return hasHeld ? 'buy' : 'sell';
}

function buildTickerBuyItem(rawId, position) {
  const lots = position.lots
    .filter((lot) => (lot.remaining ?? 0) > 0)
    .map((lot) => ({
      item: position,
      lot: {
        id: lot.id,
        date: lot.date,
        price: lot.price,
        shares: lot.remaining,
        remaining: lot.remaining,
        soldPortions: [],
      },
    }));
  if (!lots.length) return null;

  const name = position.companyName || position.ticker;
  return {
    id: rawId,
    label: isMixedPosition(position) ? `${name} (Compra)` : name,
    sub: `${position.ticker} · Compra (${position.heldShares} acc)`,
    color: null,
    kind: 'ticker',
    lots,
  };
}

function buildTickerSellItem(rawId, position) {
  const lots = position.lots.flatMap((lot) => (lot.soldPortions ?? []).map((portion, index) => ({
    item: position,
    lot: {
      id: `${lot.id}_sell_${index}`,
      date: lot.date,
      price: lot.price,
      shares: portion.shares,
      remaining: 0,
      soldPortions: [portion],
    },
  })));
  if (!lots.length) return null;

  const name = position.companyName || position.ticker;
  return {
    id: rawId,
    label: isMixedPosition(position) ? `${name} (Venta)` : name,
    sub: `${position.ticker} · Venta (${position.sharesSold} acc vendidas)`,
    color: null,
    kind: 'ticker',
    lots,
  };
}

function buildTickerTotalItem(rawId, position) {
  const held = position.heldShares ?? 0;
  const sold = position.sharesSold ?? 0;
  const isPartial = held > 0 && sold > 0;
  const name = position.companyName || position.ticker;
  const sub = isPartial
    ? `${position.ticker} · Total (${held} en cartera + ${sold} vendidas)`
    : (held > 0 ? `${position.ticker} · ${held} acc` : `${position.ticker} · ${sold} acc vendidas`);

  return {
    id: rawId,
    label: isPartial ? `${name} (Total)` : name,
    sub,
    color: null,
    kind: 'ticker',
    lots: position.lots.map((lot) => ({ item: position, lot })),
  };
}

function resolveTickerItem(rawId, rest, context) {
  const [tickerPart, modePart] = rest.split(':');
  const ticker = tickerPart.trim().toUpperCase();
  const position = context.state.find((item) => item.ticker.toUpperCase() === ticker);
  if (!position) return null;

  const mode = modePart?.trim().toLowerCase() || inferTickerMode(position);
  if (mode === 'buy' || mode === 'held') return buildTickerBuyItem(rawId, position);
  if (mode === 'sell' || mode === 'sold') return buildTickerSellItem(rawId, position);
  return buildTickerTotalItem(rawId, position);
}

function findPositionByLotId(state, lotId) {
  return state.find((position) => position.lots.some((lot) => String(lot.id) === lotId)) ?? null;
}

function buildLotSaleItem(rawId, position, lot, saleDate) {
  const portions = saleDate
    ? (lot.soldPortions ?? []).filter((portion) => portion.sellDate === saleDate)
    : (lot.soldPortions ?? []);
  if (!portions.length) return null;

  const lots = portions.map((portion, index) => ({
    item: position,
    lot: {
      id: `${lot.id}_sell_${index}`,
      date: lot.date,
      price: lot.price,
      shares: portion.shares,
      remaining: 0,
      soldPortions: [portion],
    },
  }));
  const totalSoldShares = portions.reduce((total, portion) => total + portion.shares, 0);
  const saleDateLabel = saleDate || portions[0].sellDate;
  return {
    id: rawId,
    label: `${position.companyName || position.ticker} (Venta) · Venta ${saleDateLabel}`,
    sub: `${position.ticker} · ${totalSoldShares} acc @ $${portions[0].sellPrice}`,
    color: null,
    kind: 'lot',
    lots,
  };
}

function buildLotBuyItem(rawId, position, lot) {
  const heldShares = (lot.remaining ?? 0) > 0 ? lot.remaining : lot.shares;
  return {
    id: rawId,
    label: `${position.companyName || position.ticker} (Compra) · Compra ${lot.date}`,
    sub: `${position.ticker} · ${heldShares} acc @ $${lot.price}`,
    color: null,
    kind: 'lot',
    lots: [{
      item: position,
      lot: {
        id: lot.id,
        date: lot.date,
        price: lot.price,
        shares: heldShares,
        remaining: heldShares,
        soldPortions: [],
      },
    }],
  };
}

function resolveLotItem(rawId, rest, context) {
  const [lotIdPart, modePart, saleDatePart] = rest.split(':');
  const lotId = lotIdPart.trim();
  const saleDate = saleDatePart?.trim();
  const position = findPositionByLotId(context.state, lotId);
  if (!position) return null;

  const lot = position.lots.find((candidate) => String(candidate.id) === lotId);
  const mode = modePart?.trim().toLowerCase();
  if (mode === 'sell' || mode === 'sold') return buildLotSaleItem(rawId, position, lot, saleDate);
  return buildLotBuyItem(rawId, position, lot);
}

function findCustomGroup(groupValue, { groupById, groups }) {
  const numericId = Number(groupValue);
  if (Number.isFinite(numericId) && groupById.has(numericId)) return groupById.get(numericId);
  return groups.find((group) => group.name.toLowerCase() === groupValue.toLowerCase()) ?? null;
}

function buildCustomGroupItem(rawId, group, { state, rules, lotAssignments }) {
  const groupTickers = new Set(rules.filter((rule) => rule.groupId === group.id).map((rule) => rule.ticker));
  const groupLotIds = new Set(
    lotAssignments.filter((assignment) => assignment.groupId === group.id).map((assignment) => assignment.buyTransactionId)
  );
  const lots = state.flatMap((item) => item.lots
    .filter((lot) => groupTickers.has(item.ticker) || groupLotIds.has(lot.id))
    .map((lot) => ({ item, lot })));

  return {
    id: `group:${group.id}`,
    label: group.name,
    sub: 'Grupo personalizado',
    color: group.color ?? null,
    kind: 'group',
    lots,
  };
}

function buildPredefinedGroupItem(rawId, targetLabel, tabKey, lots) {
  return {
    id: rawId,
    label: targetLabel,
    sub: `Grupo (${tabKey})`,
    color: null,
    kind: 'group',
    lots,
  };
}

function resolvePredefinedGroupItem(rawId, id, context) {
  const parts = id.split(':');
  const tabKey = parts[2];
  const targetLabel = parts.slice(3).join(':').trim();
  const lots = resolvePredefinedLots(tabKey, targetLabel, context);
  if (!lots.length) return null;
  return buildPredefinedGroupItem(rawId, targetLabel, tabKey, lots);
}

function resolveGroupItem(rawId, groupValue, context) {
  const group = findCustomGroup(groupValue, context);
  if (group) return buildCustomGroupItem(rawId, group, context);

  for (const tabKey of PREDEFINED_GROUP_TABS) {
    const lots = resolvePredefinedLots(tabKey, groupValue, context);
    if (lots.length) return buildPredefinedGroupItem(rawId, groupValue, tabKey, lots);
  }
  return null;
}

function resolveChartItem(rawId, context) {
  const id = String(rawId).trim();
  if (!id) return null;
  if (id.startsWith('ticker:')) return resolveTickerItem(rawId, id.slice(7), context);
  if (id.startsWith('lot:')) return resolveLotItem(rawId, id.slice(4), context);
  if (id.startsWith('group:pre:')) return resolvePredefinedGroupItem(rawId, id, context);
  if (id.startsWith('group:')) return resolveGroupItem(rawId, id.slice(6).trim(), context);
  return null;
}

/**
 * Resuelve la lista de ids solicitados descartando los que ya no existen.
 * @param {string[]} ids - Identificadores seleccionados.
 * @param {Object} context - Estado FIFO, grupos, reglas y mapas auxiliares.
 * @returns {Array<Object>} Elementos resueltos con sus lotes y etiquetas.
 */
export function resolveChartItems(ids, context) {
  return ids.map((id) => resolveChartItem(id, context)).filter(Boolean);
}
