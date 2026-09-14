/**
 * @fileoverview Generador de eventos cronológicos (resultados oficiales SEC EDGAR y fechas ex-dividend) para el calendario financiero.
 * @module services/portfolio/portfolioCalendarEvents
 */

import { round } from './portfolioFifo.service.js';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Combina las posiciones de cartera y empresas en seguimiento para construir el feed del calendario.
 * @param {Array<Object>} positions - Posiciones activas de cartera.
 * @param {Array<Object>} calendarItems - Elementos adicionales de seguimiento.
 * @param {Map<string, Array<Object>>} dividendMap - Dividendos históricos.
 * @param {Map<string, Array<Object>>} filingsMap - Filings de EDGAR SEC.
 * @param {Map<string, Object>} quoteMap - Cotizaciones de mercado.
 * @returns {{ events: Array<Object>, companies: Array<Object> }}
 */
export function buildPortfolioCalendarEvents(positions, calendarItems, dividendMap, filingsMap, quoteMap) {
  const events = [];
  const nowIso = todayIso();

  const activePositions = (positions || []).filter((p) => Number(p.shares) > 0);
  const portfolioTickers = new Set(activePositions.map((p) => p.ticker.toUpperCase()));
  const allEntries = [];

  for (const pos of activePositions) {
    allEntries.push({
      ticker: pos.ticker.toUpperCase(),
      name: pos.companyName || pos.ticker,
      shares: Number(pos.shares) || 0,
      isPortfolio: true,
    });
  }

  const seenCalendarTickers = new Set(portfolioTickers);
  for (const calItem of (calendarItems || [])) {
    const ticker = String(calItem.ticker ?? '').toUpperCase();
    if (!ticker || seenCalendarTickers.has(ticker)) continue;
    seenCalendarTickers.add(ticker);
    allEntries.push({
      ticker,
      name: calItem.companyName || quoteMap?.get(ticker)?.name || ticker,
      shares: 0,
      isPortfolio: false,
    });
  }

  allEntries.sort((a, b) => {
    if (a.isPortfolio !== b.isPortfolio) return a.isPortfolio ? -1 : 1;
    return a.ticker.localeCompare(b.ticker);
  });

  for (const entry of allEntries) {
    const { ticker, name, shares, isPortfolio } = entry;

    // 1. Resultados reales desde filings oficiales de EDGAR SEC
    const filings = filingsMap?.get(ticker) ?? [];
    for (const filing of filings) {
      if (!filing.filedAt) continue;
      const filingDate = String(filing.filedAt).slice(0, 10);
      const parts = filingDate.split('-').map(Number);
      if (parts.length < 3) continue;
      const [fYear, fMonth, fDay] = parts;

      const isPast = filingDate <= nowIso;
      events.push({
        id: `earn-${ticker}-${filingDate}`,
        type: 'earnings',
        typeName: 'Resultados',
        typeBadge: filing.formType || '10-Q',
        dateStr: filingDate,
        year: fYear,
        month: fMonth - 1,
        day: fDay,
        ticker,
        name,
        isPortfolio,
        shares,
        color: '#2563eb',
        accession: filing.accession ?? null,
        documentUrl: filing.accession ? `/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(filing.accession)}/document` : (filing.documentUrl ?? null),
        documentName: filing.documentName ?? `${ticker.toLowerCase()}-${(filing.formType || '10q').toLowerCase()}-${fYear}.pdf`,
        periodLabel: filing.periodLabel || `Informe ${filing.formType}`,
        timing: 'Publicación oficial SEC EDGAR',
        status: isPast ? 'Publicado' : 'Convocado',
        details: isPortfolio
          ? `Publicación oficial del informe ${filing.formType} (${filing.periodLabel || 'Resultados trimestrales'}) en la SEC para ${name} (${shares} acc. en cartera).`
          : `Publicación oficial del informe ${filing.formType} (${filing.periodLabel || 'Resultados trimestrales'}) en la SEC para ${name} (en seguimiento).`,
      });
    }

    // 2. Dividendos reales desde historial de mercado
    const divs = dividendMap?.get(ticker) ?? [];
    for (const div of divs) {
      if (!div.date) continue;
      const exDateStr = String(div.date).slice(0, 10);
      const parts = exDateStr.split('-').map(Number);
      if (parts.length < 3) continue;
      const [dYear, dMonth, dDay] = parts;

      const amountPerShare = Number(div.amount) || 0;
      const totalAmount = isPortfolio ? round(amountPerShare * shares, 2) : null;
      const isPast = exDateStr <= nowIso;

      events.push({
        id: `exdiv-${ticker}-${exDateStr}`,
        type: 'exdiv',
        typeName: 'Fecha Ex-Dividend',
        typeBadge: 'Ex-Fecha',
        dateStr: exDateStr,
        year: dYear,
        month: dMonth - 1,
        day: dDay,
        ticker,
        name,
        isPortfolio,
        shares,
        color: '#d97706',
        amount: totalAmount,
        perShare: amountPerShare,
        status: isPast ? 'Ejecutado' : 'Anunciado',
        details: isPortfolio
          ? `Fecha de corte oficial para el dividendo de ${totalAmount} € (${amountPerShare} €/acc. × ${shares} acc.).`
          : `Fecha de corte oficial para el dividendo de ${amountPerShare} €/acc. para ${name} (en seguimiento).`,
      });

      // Pago estimado ~14 días tras la ex-fecha
      const exDateTime = new Date(dYear, dMonth - 1, dDay);
      exDateTime.setDate(exDateTime.getDate() + 14);
      const payYear = exDateTime.getFullYear();
      const payMonth = exDateTime.getMonth();
      const payDay = exDateTime.getDate();
      const payDateStr = `${payYear}-${String(payMonth + 1).padStart(2, '0')}-${String(payDay).padStart(2, '0')}`;

      events.push({
        id: `payout-${ticker}-${payDateStr}`,
        type: 'payout',
        typeName: 'Pago de dividendo',
        typeBadge: 'Dividendo',
        dateStr: payDateStr,
        year: payYear,
        month: payMonth,
        day: payDay,
        ticker,
        name,
        isPortfolio,
        shares,
        color: '#059669',
        amount: totalAmount,
        perShare: amountPerShare,
        status: payDateStr <= nowIso ? (isPortfolio ? 'Cobrado' : 'Abonado') : 'Confirmado',
        details: isPortfolio
          ? `Abono estimado de ${totalAmount} € (${shares} acc. × ${amountPerShare} €/acc.) en cuenta de valores.`
          : `Pago de dividendo de ${amountPerShare} €/acc. para ${name} (en seguimiento).`,
      });
    }
  }

  events.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  return { events, companies: allEntries };
}
