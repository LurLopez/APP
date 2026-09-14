/**
 * @fileoverview Detector y emisor de alertas sobre eventos corporativos oficiales (filings 10-Q/10-K y fechas de corte de dividendos).
 * @module services/alerts/companyEventScanner
 */

import { hasSentAlert, recordSentAlert } from '../../../db/repositories/watchlistRepository.js';
import { getCompanyFilings } from '../edgar.service.js';
import { getDividendHistory } from '../market.service.js';
import { sendCompanyEventAlert } from '../email.service.js';

/**
 * Comprueba si existen nuevos informes 10-Q o 10-K presentados ante la SEC y notifica a los suscriptores.
 * @param {string} ticker - Símbolo de la empresa.
 * @param {string} companyName - Nombre corporativo.
 * @param {Object[]} subscribers - Lista de usuarios suscritos a resultados.
 * @param {string} recentThreshold - Fecha ISO mínima de presentación.
 * @returns {Promise<number>} Número de alertas enviadas.
 */
export async function checkEarningsFilingAlerts(ticker, companyName, subscribers, recentThreshold) {
  let sentCount = 0;
  const filingsData = await getCompanyFilings(ticker);
  const filings = filingsData?.filings || [];

  for (const filing of filings) {
    if (!['10-Q', '10-K'].includes(filing.formType)) continue;
    if (!filing.filedAt || filing.filedAt < recentThreshold) continue;

    const eventKey = `earnings:${ticker}:${filing.accession || filing.filedAt}`;
    const periodText = filing.periodLabel || filing.period || '';
    const eventTitle = `Resultados publicados (${periodText ? `${periodText} · ` : ''}Form ${filing.formType})`;

    for (const user of subscribers) {
      const alreadySent = await hasSentAlert(user.userId, eventKey);
      if (alreadySent) continue;

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
      sentCount += 1;
    }
  }

  return sentCount;
}

/**
 * Comprueba si la fecha actual coincide con el día de corte ex-dividend y notifica a los suscriptores.
 * @param {string} ticker - Ticker de la compañía.
 * @param {string} companyName - Nombre de la empresa.
 * @param {Object[]} subscribers - Suscriptores al dividendo.
 * @param {string} todayIso - Fecha ISO de hoy (AAAA-MM-DD).
 * @param {string} recentThreshold - Umbral de fechas.
 * @returns {Promise<number>} Número de alertas emitidas.
 */
export async function checkDividendCutAlerts(ticker, companyName, subscribers, todayIso, recentThreshold) {
  let sentCount = 0;
  const dividends = await getDividendHistory(ticker, { from: recentThreshold }).catch(() => []);
  const todayDiv = dividends.find((d) => d.date === todayIso);

  if (!todayDiv) return sentCount;

  const eventKey = `exdiv:${ticker}:${todayDiv.date}`;
  const eventTitle = 'Fecha Ex-Dividend (Hoy)';

  for (const user of subscribers) {
    const alreadySent = await hasSentAlert(user.userId, eventKey);
    if (alreadySent) continue;

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
    sentCount += 1;
  }

  return sentCount;
}
