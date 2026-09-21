/**
 * @fileoverview Detector y emisor de notificaciones cuando las cotizaciones de mercado alcanzan los precios objetivo de los usuarios.
 * @module services/alerts/priceAlertScanner
 */

import {
  getActivePendingPriceAlerts,
  markPriceAlertTriggered,
} from '../../../db/repositories/priceAlertRepository.js';
import { getMarketQuote } from '../market.service.js';
import { sendPriceAlertNotification } from '../email.service.js';

/**
 * Escanea todas las alertas de precio pendientes contra las cotizaciones en tiempo real del mercado.
 * @returns {Promise<{ triggeredCount: number, errors: Array<{ ticker: string, error: string }> }>}
 */
export async function checkMarketPriceAlerts() {
  const result = { triggeredCount: 0, errors: [] };
  const pendingAlerts = await getActivePendingPriceAlerts().catch(() => []);
  if (!pendingAlerts.length) return result;

  const alertsByTicker = new Map();
  for (const alert of pendingAlerts) {
    const ticker = alert.ticker.toUpperCase();
    if (!alertsByTicker.has(ticker)) alertsByTicker.set(ticker, []);
    alertsByTicker.get(ticker).push(alert);
  }

  for (const [ticker, alerts] of alertsByTicker.entries()) {
    try {
      const quote = await getMarketQuote(ticker);
      const currentPrice = Number(quote?.price);
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;

      for (const alert of alerts) {
        const targetPrice = Number(alert.targetPrice);
        const isGte = alert.condition === 'gte';
        const conditionMet = isGte ? currentPrice >= targetPrice : currentPrice <= targetPrice;

        if (conditionMet) {
          await sendPriceAlertNotification({
            to: alert.email,
            ticker: alert.ticker,
            companyName: alert.companyName || alert.ticker,
            targetPrice,
            currentPrice,
            condition: alert.condition,
            language: alert.language || 'es',
          });
          await markPriceAlertTriggered(alert.id, currentPrice);
          result.triggeredCount += 1;
        }
      }
    } catch (err) {
      result.errors.push({ ticker, error: err.message });
    }
  }

  return result;
}
