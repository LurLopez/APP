/**
 * @fileoverview Texto compartido de la reacción de la cotización al anuncio de un cambio de CEO.
 * @module services/reportExport/ceoText
 */

/**
 * Construye la frase que resume la reacción de la cotización en torno al anuncio de un CEO.
 * @param {Object|null} marketData - Datos de mercado del anuncio (variaciones, fecha y fuente).
 * @returns {string|null} Frase lista para renderizar o null si no hay datos válidos.
 */
export function ceoMarketDataText(marketData) {
  if (!marketData || !Number.isFinite(Number(marketData.changeFirstSessionPct))) return null;

  const formatPct = (value) => `${Number(value) > 0 ? '+' : ''}${String(value).replace('.', ',')} %`;
  const threeSessions = Number.isFinite(Number(marketData.changeThreeSessionsPct))
    ? ` y ${formatPct(marketData.changeThreeSessionsPct)} a 3 sesiones`
    : '';
  const source = marketData.source ? ` Fuente: ${marketData.source}.` : '';
  const date = marketData.announcementDate ? ` (${marketData.announcementDate})` : '';

  return `Cotización en torno al anuncio${date}: ${formatPct(marketData.changeFirstSessionPct)} en la primera sesión${threeSessions}.${source}`;
}
