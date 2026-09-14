/**
 * @fileoverview Motor de conciliación FIFO (First-In, First-Out) para asignación de lotes de compra y cálculo de plusvalías realizadas.
 * @module services/portfolio/portfolioFifo
 */

import * as portfolioRepository from '../../../db/repositories/portfolioRepository.js';

export class PortfolioError extends Error {
  constructor(message, code = 'PORTFOLIO_ERROR') {
    super(message);
    this.code = code;
  }
}

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Reconstruye el estado de lotes abiertos y plusvalías realizadas aplicando contabilidad estricta FIFO.
 * @param {Array<Object>} transactions - Listado cronológico de transacciones.
 * @returns {Array<Object> & { saleGains: Map<number, number> }}
 */
export function buildState(transactions) {
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

/**
 * Registra una compra de acciones en la base de datos.
 * @param {number} userId - ID de usuario.
 * @param {Object} data - Datos de la compra.
 * @returns {Promise<Object>}
 */
export async function addBuy(userId, { ticker, companyName, shares, price, tradeDate }) {
  return portfolioRepository.createTransaction(userId, {
    ticker,
    companyName,
    type: 'buy',
    shares,
    price,
    tradeDate,
  });
}

/**
 * Registra una venta verificando previamente que existan suficientes títulos en cartera vía FIFO.
 * @param {number} userId - ID de usuario.
 * @param {Object} data - Datos de la venta.
 * @returns {Promise<Object>}
 */
export async function addSell(userId, { ticker, companyName, shares, price, tradeDate }) {
  const transactions = await portfolioRepository.listTransactions(userId);
  const normalizedTicker = ticker.toUpperCase();
  const tickerTransactions = transactions.filter((t) => t.ticker.toUpperCase() === normalizedTicker);
  const prospective = [
    ...tickerTransactions,
    { id: -1, ticker: normalizedTicker, type: 'sell', shares, price, tradeDate },
  ];

  try {
    buildState(prospective);
  } catch (error) {
    if (error instanceof PortfolioError) throw error;
    throw new PortfolioError('Operación no permitida en la cartera.', 'INVALID_STATE');
  }

  return portfolioRepository.createTransaction(userId, {
    ticker,
    companyName,
    type: 'sell',
    shares,
    price,
    tradeDate,
  });
}

/**
 * Elimina una transacción comprobando que no invalide ventas posteriores que consumieron dicho lote.
 * @param {number} userId - ID de usuario.
 * @param {number} transactionId - ID de la transacción a remover.
 * @returns {Promise<boolean>}
 */
export async function removeTransaction(userId, transactionId) {
  const transactions = await portfolioRepository.listTransactions(userId);
  const target = transactions.find((t) => t.id === transactionId);
  if (!target) throw new PortfolioError('Transacción no encontrada.', 'NOT_FOUND');

  const remaining = transactions.filter((t) => t.id !== transactionId);
  try {
    buildState(remaining);
  } catch (error) {
    if (error.code === 'NOT_ENOUGH_SHARES') {
      throw new PortfolioError(
        'No puedes eliminar esta compra porque ventas posteriores consumieron sus acciones.',
        'INVALID_STATE',
      );
    }
    throw error;
  }

  return portfolioRepository.deleteTransaction(userId, transactionId);
}
