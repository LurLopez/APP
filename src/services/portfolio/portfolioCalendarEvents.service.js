/**
 * @fileoverview Generador de eventos cronológicos (resultados oficiales SEC EDGAR y fechas ex-dividend) para el calendario financiero.
 * @module services/portfolio/portfolioCalendarEvents
 */

import { round } from './portfolioFifo.service.js';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateIso, days) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isValidIsoDate(dateStr) {
  return String(dateStr).split('-').length >= 3;
}

/** Descompone 'YYYY-MM-DD' en el índice de mes base 0 que usa el calendario. */
function splitDateParts(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return { year, month: month - 1, day };
}

function buildCalendarEntries(positions, calendarItems, quoteMap) {
  const activePositions = (positions || []).filter((position) => Number(position.shares) > 0);
  const entries = activePositions.map((position) => ({
    ticker: position.ticker.toUpperCase(),
    name: position.companyName || position.ticker,
    shares: Number(position.shares) || 0,
    isPortfolio: true,
  }));

  const seenTickers = new Set(entries.map((entry) => entry.ticker));
  for (const item of (calendarItems || [])) {
    const ticker = String(item.ticker ?? '').toUpperCase();
    if (!ticker || seenTickers.has(ticker)) continue;
    seenTickers.add(ticker);
    entries.push({
      ticker,
      name: item.companyName || quoteMap?.get(ticker)?.name || ticker,
      shares: 0,
      isPortfolio: false,
    });
  }

  entries.sort((a, b) => {
    if (a.isPortfolio !== b.isPortfolio) return a.isPortfolio ? -1 : 1;
    return a.ticker.localeCompare(b.ticker);
  });
  return entries;
}

/** Resultados reales desde los filings oficiales de EDGAR SEC. */
function buildFilingEvents(entry, filings, nowIso) {
  const { ticker, name, shares, isPortfolio } = entry;
  const events = [];

  for (const filing of filings) {
    if (!filing.filedAt) continue;
    const filingDate = String(filing.filedAt).slice(0, 10);
    if (!isValidIsoDate(filingDate)) continue;
    const { year, month, day } = splitDateParts(filingDate);
    const isPast = filingDate <= nowIso;

    events.push({
      id: `earn-${ticker}-${filingDate}`,
      type: 'earnings',
      typeName: 'Resultados',
      typeBadge: filing.formType || '10-Q',
      dateStr: filingDate,
      year,
      month,
      day,
      ticker,
      name,
      isPortfolio,
      shares,
      color: '#2563eb',
      accession: filing.accession ?? null,
      documentUrl: filing.accession ? `/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(filing.accession)}/document` : (filing.documentUrl ?? null),
      documentName: filing.documentName ?? `${ticker.toLowerCase()}-${(filing.formType || '10q').toLowerCase()}-${year}.pdf`,
      periodLabel: filing.periodLabel || `Informe ${filing.formType}`,
      timing: 'Publicación oficial SEC EDGAR',
      status: isPast ? 'Publicado' : 'Convocado',
      details: isPortfolio
        ? `Publicación oficial del informe ${filing.formType} (${filing.periodLabel || 'Resultados trimestrales'}) en la SEC para ${name} (${shares} acc. en cartera).`
        : `Publicación oficial del informe ${filing.formType} (${filing.periodLabel || 'Resultados trimestrales'}) en la SEC para ${name} (en seguimiento).`,
    });
  }
  return events;
}

function buildExDividendEvent(entry, { dateStr, totalAmount, amountPerShare, status, details }) {
  const { ticker, name, shares, isPortfolio } = entry;
  return {
    id: `exdiv-${ticker}-${dateStr}`,
    type: 'exdiv',
    typeName: 'Fecha Ex-Dividend',
    typeBadge: 'Ex-Fecha',
    dateStr,
    ...splitDateParts(dateStr),
    ticker,
    name,
    isPortfolio,
    shares,
    color: '#d97706',
    amount: totalAmount,
    perShare: amountPerShare,
    status,
    details,
  };
}

function buildPayoutEvent(entry, { dateStr, totalAmount, amountPerShare, status, details }) {
  const { ticker, name, shares, isPortfolio } = entry;
  return {
    id: `payout-${ticker}-${dateStr}`,
    type: 'payout',
    typeName: 'Pago de dividendo',
    typeBadge: 'Dividendo',
    dateStr,
    ...splitDateParts(dateStr),
    ticker,
    name,
    isPortfolio,
    shares,
    color: '#059669',
    amount: totalAmount,
    perShare: amountPerShare,
    status,
    details,
  };
}

/** Dividendos reales desde el historial de mercado, con pago confirmado o estimado a 14 días. */
function buildHistoricalDividendEvents(entry, dividends, marketCalendar, nowIso) {
  const { ticker, name, shares, isPortfolio } = entry;
  const events = [];
  const historyExDates = new Set();

  for (const dividend of dividends) {
    if (!dividend.date) continue;
    const exDateStr = String(dividend.date).slice(0, 10);
    if (!isValidIsoDate(exDateStr)) continue;
    historyExDates.add(exDateStr);

    const amountPerShare = Number(dividend.amount) || 0;
    const totalAmount = isPortfolio ? round(amountPerShare * shares, 2) : null;
    const isPast = exDateStr <= nowIso;

    events.push(buildExDividendEvent(entry, {
      dateStr: exDateStr,
      totalAmount,
      amountPerShare,
      status: isPast ? 'Ejecutado' : 'Anunciado',
      details: isPortfolio
        ? `Fecha de corte oficial para el dividendo de ${totalAmount} € (${amountPerShare} €/acc. × ${shares} acc.).`
        : `Fecha de corte oficial para el dividendo de ${amountPerShare} €/acc. para ${name} (en seguimiento).`,
    }));

    const confirmedPayDate = marketCalendar?.exDividendDate === exDateStr ? marketCalendar.dividendDate : null;
    const payDateStr = confirmedPayDate || addDaysIso(exDateStr, 14);
    if (!payDateStr) continue;

    events.push(buildPayoutEvent(entry, {
      dateStr: payDateStr,
      totalAmount,
      amountPerShare,
      status: payDateStr <= nowIso ? (isPortfolio ? 'Cobrado' : 'Abonado') : 'Confirmado',
      details: isPortfolio
        ? `Abono de ${totalAmount} € (${shares} acc. × ${amountPerShare} €/acc.) en cuenta de valores.`
        : `Pago de dividendo de ${amountPerShare} €/acc. para ${name} (en seguimiento).`,
    }));
  }

  return { events, historyExDates };
}

function latestDividendAmount(dividends) {
  return [...dividends].reverse().find((dividend) => Number(dividend.amount) > 0)?.amount ?? null;
}

/** Próximas fechas anunciadas por el mercado (aún sin filing oficial en la SEC). */
function buildUpcomingMarketEvents({ entry, marketCalendar, latestAmount, historyExDates, nowIso }) {
  if (!marketCalendar) return [];
  const { name, shares, isPortfolio } = entry;
  const events = [];

  const nextExDate = marketCalendar.exDividendDate;
  if (nextExDate && nextExDate > nowIso && !historyExDates.has(nextExDate)) {
    const amountPerShare = latestAmount !== null ? Number(latestAmount) : null;
    const totalAmount = isPortfolio && amountPerShare !== null ? round(amountPerShare * shares, 2) : null;

    events.push(buildExDividendEvent(entry, {
      dateStr: nextExDate,
      totalAmount,
      amountPerShare,
      status: 'Anunciado',
      details: isPortfolio
        ? `Próxima fecha de corte anunciada para el dividendo de ${amountPerShare} €/acc. (${shares} acc. en cartera).`
        : `Próxima fecha de corte anunciada para el dividendo de ${amountPerShare ?? '—'} €/acc. de ${name} (en seguimiento).`,
    }));

    const payDateStr = marketCalendar.dividendDate || addDaysIso(nextExDate, 14);
    if (payDateStr) {
      events.push(buildPayoutEvent(entry, {
        dateStr: payDateStr,
        totalAmount,
        amountPerShare,
        status: payDateStr <= nowIso ? (isPortfolio ? 'Cobrado' : 'Abonado') : 'Confirmado',
        details: isPortfolio
          ? `Próximo abono anunciado de ${totalAmount} € (${shares} acc. × ${amountPerShare} €/acc.).`
          : `Próximo pago anunciado de dividendo de ${amountPerShare ?? '—'} €/acc. para ${name} (en seguimiento).`,
      }));
    }
  }

  const nextEarnings = marketCalendar.earningsDate;
  if (nextEarnings && nextEarnings >= nowIso) {
    const isEstimate = Boolean(marketCalendar.earningsDateEstimate);
    const timingDetail = isEstimate ? 'Fecha estimada pendiente de confirmación oficial.' : 'Fecha anunciada pendiente de publicación en la SEC.';
    events.push({
      id: `earn-${entry.ticker}-${nextEarnings}`,
      type: 'earnings',
      typeName: 'Resultados',
      typeBadge: 'Próximo',
      dateStr: nextEarnings,
      ...splitDateParts(nextEarnings),
      ticker: entry.ticker,
      name,
      isPortfolio,
      shares,
      color: '#2563eb',
      accession: null,
      documentUrl: null,
      documentName: null,
      periodLabel: 'Próximo informe trimestral',
      timing: isEstimate ? 'Fecha estimada por el mercado' : 'Fecha anunciada por el mercado',
      status: isEstimate ? 'Estimado' : 'Convocado',
      details: isPortfolio
        ? `Próxima presentación de resultados de ${name} (${shares} acc. en cartera). ${timingDetail}`
        : `Próxima presentación de resultados de ${name} (en seguimiento). ${timingDetail}`,
    });
  }
  return events;
}

function dedupeAndSortEvents(events) {
  const unique = new Map();
  for (const event of events) {
    if (!unique.has(event.id)) unique.set(event.id, event);
  }
  const deduped = [...unique.values()];
  deduped.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  return deduped;
}

/**
 * Combina las posiciones de cartera y empresas en seguimiento para construir el feed del calendario.
 * @param {Array<Object>} positions - Posiciones activas de cartera.
 * @param {Array<Object>} calendarItems - Elementos adicionales de seguimiento.
 * @param {Map<string, Array<Object>>} dividendMap - Dividendos históricos.
 * @param {Map<string, Array<Object>>} filingsMap - Filings de EDGAR SEC.
 * @param {Map<string, Object>} quoteMap - Cotizaciones de mercado.
 * @param {Map<string, Object>} [calendarMap] - Próximas fechas anunciadas por el mercado (resultados, ex-dividend y pago).
 * @returns {{ events: Array<Object>, companies: Array<Object> }}
 */
export function buildPortfolioCalendarEvents(positions, calendarItems, dividendMap, filingsMap, quoteMap, calendarMap) {
  const nowIso = todayIso();
  const entries = buildCalendarEntries(positions, calendarItems, quoteMap);
  const events = [];

  for (const entry of entries) {
    const marketCalendar = calendarMap?.get(entry.ticker) ?? null;
    const dividends = dividendMap?.get(entry.ticker) ?? [];

    events.push(...buildFilingEvents(entry, filingsMap?.get(entry.ticker) ?? [], nowIso));

    const historical = buildHistoricalDividendEvents(entry, dividends, marketCalendar, nowIso);
    events.push(...historical.events);
    events.push(...buildUpcomingMarketEvents({
      entry,
      marketCalendar,
      latestAmount: latestDividendAmount(dividends),
      historyExDates: historical.historyExDates,
      nowIso,
    }));
  }

  return { events: dedupeAndSortEvents(events), companies: entries };
}
