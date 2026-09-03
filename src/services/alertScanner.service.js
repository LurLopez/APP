import {
  getAllActiveAlertSubscriptions,
  hasSentAlert,
  recordSentAlert,
} from '../../db/repositories/watchlistRepository.js';
import {
  getActivePendingPriceAlerts,
  markPriceAlertTriggered,
} from '../../db/repositories/priceAlertRepository.js';
import { getCompanyFilings } from './edgar.service.js';
import { getDividendHistory, getMarketQuote } from './market.service.js';
import { sendCompanyEventAlert, sendPriceAlertNotification } from './email.service.js';

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getRecentDateThresholdIso(days = 5) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

let isScanning = false;
let scanTimer = null;

/**
 * Escanea y envía alertas por correo según los criterios:
 * 1. Resultados (10-Q / 10-K): se envían únicamente cuando ya han sido PRESENTADOS y PUBLICADOS en la SEC.
 * 2. Ex-Dividendo / Pago: se envían exactamente en la fecha del evento (el día ex-date o fecha de pago).
 * 3. Alertas de Precio: se envían cuando la cotización toca o supera/cae bajo el precio objetivo, pasando a estado 'triggered'.
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
    // --- PARTE A: ALERTAS DE EVENTOS (RESULTADOS Y DIVIDENDOS) ---
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

        // 1. VERIFICAR RESULTADOS PUBLICADOS (10-Q / 10-K en SEC EDGAR)
        const earningsSubscribers = subscribers.filter((s) => s.notifyEarnings);
        if (earningsSubscribers.length > 0) {
          try {
            const filingsData = await getCompanyFilings(ticker);
            const filings = filingsData?.filings || [];

            for (const filing of filings) {
              if (!['10-Q', '10-K'].includes(filing.formType)) continue;
              if (!filing.filedAt || filing.filedAt < recentThreshold) continue;

              const eventKey = `earnings:${ticker}:${filing.accession || filing.filedAt}`;
              const periodText = filing.periodLabel || filing.period || '';
              const eventTitle = `Resultados publicados (${periodText ? `${periodText} · ` : ''}Form ${filing.formType})`;

              for (const user of earningsSubscribers) {
                const alreadySent = await hasSentAlert(user.userId, eventKey);
                if (!alreadySent) {
                  await sendCompanyEventAlert({
                    to: user.email,
                    ticker,
                    companyName,
                    eventType: 'earnings',
                    eventTitle,
                    eventDate: filing.filedAt,
                    details: `La empresa ${companyName} (${ticker}) acaba de publicar oficialmente su informe ${filing.formType}${periodText ? ` correspondiente a ${periodText}` : ''} ante la SEC. Ya puedes consultar los estados financieros completos y el análisis con IA en Cifra.`,
                  });
                  await recordSentAlert(user.userId, ticker, 'earnings', eventKey);
                  stats.earningsAlertsSent += 1;
                }
              }
            }
          } catch (err) {
            stats.errors.push({ ticker, type: 'earnings', error: err.message });
          }
        }

        // 2. VERIFICAR DIVIDENDOS: EX-DIVIDEND (El día exacto de corte)
        const exdivSubscribers = subscribers.filter((s) => s.notifyExdiv);
        if (exdivSubscribers.length > 0) {
          try {
            const dividends = await getDividendHistory(ticker, { from: recentThreshold }).catch(() => []);
            const todayDiv = dividends.find((d) => d.date === today);

            if (todayDiv) {
              const eventKey = `exdiv:${ticker}:${todayDiv.date}`;
              const eventTitle = 'Fecha Ex-Dividend (Hoy)';

              for (const user of exdivSubscribers) {
                const alreadySent = await hasSentAlert(user.userId, eventKey);
                if (!alreadySent) {
                  const amountFormatted = Number(todayDiv.amount).toFixed(2);
                  await sendCompanyEventAlert({
                    to: user.email,
                    ticker,
                    companyName,
                    eventType: 'exdiv',
                    eventTitle,
                    eventDate: todayDiv.date,
                    details: `Hoy (${todayDiv.date}) es la fecha de corte Ex-Dividend de ${companyName} (${ticker}) por un importe de $${amountFormatted} por acción. Para tener derecho al dividendo, las acciones debían poseerse antes de la sesión de hoy.`,
                  });
                  await recordSentAlert(user.userId, ticker, 'exdiv', eventKey);
                  stats.exdivAlertsSent += 1;
                }
              }
            }
          } catch (err) {
            stats.errors.push({ ticker, type: 'exdiv', error: err.message });
          }
        }
      }
    }

    // --- PARTE B: ALERTAS DE PRECIO (OBJETIVO ALCANZADO) ---
    const pendingPriceAlerts = await getActivePendingPriceAlerts().catch(() => []);
    if (pendingPriceAlerts.length > 0) {
      const alertsByTicker = new Map();
      for (const alert of pendingPriceAlerts) {
        const t = alert.ticker.toUpperCase();
        if (!alertsByTicker.has(t)) alertsByTicker.set(t, []);
        alertsByTicker.get(t).push(alert);
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
              });
              await markPriceAlertTriggered(alert.id, currentPrice);
              stats.priceAlertsTriggered += 1;
            }
          }
        } catch (err) {
          stats.errors.push({ ticker, type: 'priceAlert', error: err.message });
        }
      }
    }

    return { ok: true, ...stats };
  } catch (error) {
    console.error('[ALERT SCANNER] Error general escaneando alertas:', error);
    return { ok: false, error: error.message, ...stats };
  } finally {
    isScanning = false;
  }
}

/**
 * Inicia el temporizador en segundo plano para escanear periódicamente.
 */
export function startAlertScanner(intervalMinutes = 30) {
  if (scanTimer) clearInterval(scanTimer);

  const intervalMs = Math.max(5, Number(intervalMinutes || 30)) * 60 * 1000;

  // Ejecutar primera comprobación inicial tras 10 segundos del arranque
  setTimeout(() => {
    checkAndDispatchAlerts().catch((err) => {
      console.error('[ALERT SCANNER] Error en escaneo inicial:', err.message);
    });
  }, 10000);

  // Escaneo programado periódico
  scanTimer = setInterval(() => {
    checkAndDispatchAlerts().catch((err) => {
      console.error('[ALERT SCANNER] Error en escaneo periódico:', err.message);
    });
  }, intervalMs);

  console.log(`[ALERT SCANNER] Servicio de alertas activado (intervalo: cada ${intervalMinutes} minutos).`);
}

export function stopAlertScanner() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
}
