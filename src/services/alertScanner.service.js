/**
 * @fileoverview Orquestador y planificador del escaneo de alertas periódicas (resultados financieros, dividendos y precios).
 * @module services/alertScanner
 */

import { getAllActiveAlertSubscriptions } from '../../db/repositories/watchlistRepository.js';
import { checkEarningsFilingAlerts, checkDividendCutAlerts } from './alerts/companyEventScanner.js';
import { checkMarketPriceAlerts } from './alerts/priceAlertScanner.js';

let isScanning = false;
let scanTimer = null;

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getRecentDateThresholdIso(days = 5) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * Escanea y envía alertas por correo electrónico según los criterios configurados por los usuarios.
 * @returns {Promise<Object>} Resumen estadístico de las comprobaciones y alertas enviadas.
 */
export async function checkAndDispatchAlerts() {
  if (isScanning) {
    return { ok: true, skipped: true, reason: 'Scan already in progress' };
  }

  isScanning = true;
  const stats = {
    tickersChecked: 0,
    earningsAlertsSent: 0,
    exdivAlertsSent: 0,
    payoutAlertsSent: 0,
    priceAlertsTriggered: 0,
    errors: [],
  };

  try {
    const subscriptions = await getAllActiveAlertSubscriptions();
    if (subscriptions.length > 0) {
      const subsByTicker = new Map();
      for (const sub of subscriptions) {
        const ticker = sub.ticker.toUpperCase();
        if (!subsByTicker.has(ticker)) subsByTicker.set(ticker, []);
        subsByTicker.get(ticker).push(sub);
      }

      const today = getTodayIso();
      const recentThreshold = getRecentDateThresholdIso(5);

      for (const [ticker, subscribers] of subsByTicker.entries()) {
        stats.tickersChecked += 1;
        const companyName = subscribers[0]?.companyName || ticker;

        const earningsSubs = subscribers.filter((s) => s.notifyEarnings);
        if (earningsSubs.length > 0) {
          try {
            const count = await checkEarningsFilingAlerts(ticker, companyName, earningsSubs, recentThreshold);
            stats.earningsAlertsSent += count;
          } catch (err) {
            stats.errors.push({ ticker, type: 'earnings', error: err.message });
          }
        }

        const exdivSubs = subscribers.filter((s) => s.notifyExdiv);
        if (exdivSubs.length > 0) {
          try {
            const count = await checkDividendCutAlerts(ticker, companyName, exdivSubs, today, recentThreshold);
            stats.exdivAlertsSent += count;
          } catch (err) {
            stats.errors.push({ ticker, type: 'exdiv', error: err.message });
          }
        }
      }
    }

    const priceResult = await checkMarketPriceAlerts();
    stats.priceAlertsTriggered += priceResult.triggeredCount;
    stats.errors.push(...priceResult.errors.map((e) => ({ ...e, type: 'priceAlert' })));

    return { ok: true, ...stats };
  } catch (error) {
    console.error('[ALERT SCANNER] Error general escaneando alertas:', error);
    return { ok: false, error: error.message, ...stats };
  } finally {
    isScanning = false;
  }
}

/**
 * Inicia el temporizador periódico en segundo plano para el escaneo de alertas.
 * @param {number} [intervalMinutes=30] - Intervalo entre ejecuciones.
 */
export function startAlertScanner(intervalMinutes = 30) {
  if (scanTimer) clearInterval(scanTimer);

  const intervalMs = Math.max(5, Number(intervalMinutes || 30)) * 60 * 1000;

  setTimeout(() => {
    checkAndDispatchAlerts().catch((err) => {
      console.error('[ALERT SCANNER] Error en escaneo inicial:', err.message);
    });
  }, 10000);

  scanTimer = setInterval(() => {
    checkAndDispatchAlerts().catch((err) => {
      console.error('[ALERT SCANNER] Error en escaneo periódico:', err.message);
    });
  }, intervalMs);

  console.log(`[ALERT SCANNER] Servicio de alertas activado (intervalo: cada ${intervalMinutes} minutos).`);
}

/**
 * Detiene el temporizador en segundo plano del servicio de alertas.
 */
export function stopAlertScanner() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
}
