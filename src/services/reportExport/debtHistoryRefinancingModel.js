/**
 * @fileoverview Modelos analíticos de evolución de deuda a 10 años y análisis de impacto en BPA de refinanciaciones.
 * @module services/reportExport/debtHistoryRefinancingModel
 */

import { parseSecNumber, cell, COLORS } from './exportColors.js';

/**
 * Genera el modelo histórico de los últimos 10 años comparando deuda total bruta vs neta.
 * @param {object} debt - Sección de deuda del informe.
 * @param {object} report - Informe financiero completo.
 * @returns {object|null} Puntos temporales y tasas de crecimiento compuesto (CAGR).
 */
export function buildDebtHistoryModel(debt, report) {
  const toMillionsVal = (v) => {
    const num = parseSecNumber(v);
    if (!Number.isFinite(num)) return null;
    return Math.abs(num) > 1e6 ? Math.round(num / 1e6) : Math.round(num * 10) / 10;
  };
  const toPoint = (p) => ({
    year: Number(p?.year || (p?.periodEnd ? parseInt(String(p.periodEnd).slice(0, 4), 10) : null)),
    totalDebt: toMillionsVal(p?.totalDebt),
    netDebt: toMillionsVal(p?.netDebt),
  });

  const sources = [];
  if (Array.isArray(report?.edgarDebtHistory) && report.edgarDebtHistory.length) sources.push(report.edgarDebtHistory);
  if (Array.isArray(debt?.debtHistory) && debt.debtHistory.length) sources.push(debt.debtHistory);
  if (Array.isArray(report?.annualDebtHistory) && report.annualDebtHistory.length) sources.push(report.annualDebtHistory);

  const byYear = new Map();
  sources.forEach((list) => {
    list.forEach((raw) => {
      const point = toPoint(raw);
      if (!Number.isFinite(point.year) || !Number.isFinite(point.totalDebt)) return;
      const existing = byYear.get(point.year);
      if (!existing) {
        byYear.set(point.year, point);
        return;
      }
      if (existing.totalDebt == null) existing.totalDebt = point.totalDebt;
      if (existing.netDebt == null) existing.netDebt = point.netDebt;
    });
  });

  const points = [...byYear.values()].sort((a, b) => a.year - b.year).slice(-10);
  if (points.length < 2) return null;

  points.forEach((p, i) => {
    if (i > 0) {
      const prev = points[i - 1];
      p.deltaTotalDebt = Number.isFinite(prev.totalDebt) ? Math.round((p.totalDebt - prev.totalDebt) * 10) / 10 : null;
      p.deltaNetDebt = (Number.isFinite(p.netDebt) && Number.isFinite(prev.netDebt)) ? Math.round((p.netDebt - prev.netDebt) * 10) / 10 : null;
    } else {
      p.deltaTotalDebt = null;
      p.deltaNetDebt = null;
    }
  });

  const allVals = points.flatMap((p) => [p.totalDebt, Number.isFinite(p.netDebt) ? p.netDebt : p.totalDebt]);
  const first = points[0];
  const last = points[points.length - 1];
  const span = last.year - first.year;
  const cagr = (from, to) => (span > 0 && Number.isFinite(from) && from > 0 && Number.isFinite(to) && to > 0
    ? (Math.pow(to / from, 1 / span) - 1) * 100
    : null);

  return {
    title: `EVOLUCIÓN DE LA DEUDA: NORMAL VS NETA (${first.year}–${last.year})`,
    points,
    maxVal: Math.max(...allVals),
    minVal: Math.min(0, ...allVals),
    cagrTotalDebt: cagr(first.totalDebt, last.totalDebt),
    cagrNetDebt: cagr(first.netDebt, last.netDebt),
  };
}

/**
 * Convierte la evolución histórica de la deuda a estructura tabular exportable.
 * @param {object} chart - Modelo retornado por buildDebtHistoryModel.
 * @returns {object|null} Columnas, encabezados y filas formateadas.
 */
export function buildDebtHistoryTable(chart) {
  if (!chart || !Array.isArray(chart.points) || !chart.points.length) return null;
  const headers = [
    cell('Año', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Deuda Normal ($M)', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Δ vs año anterior', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Deuda Neta ($M)', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Δ vs año anterior', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
  ];
  const rows = chart.points.map((p) => [
    cell(String(p.year), { bold: true, color: COLORS.ink }),
    cell(`$${p.totalDebt.toFixed(1).replace('.', ',')}M`, { bold: true, color: '#1e40af' }),
    cell(p.deltaTotalDebt != null ? `${p.deltaTotalDebt > 0 ? '+' : ''}${p.deltaTotalDebt.toFixed(1).replace('.', ',')}M` : '—', {
      bold: true,
      color: p.deltaTotalDebt != null ? (p.deltaTotalDebt < 0 ? COLORS.positive : COLORS.negative) : COLORS.ink,
    }),
    cell(Number.isFinite(p.netDebt) ? `$${p.netDebt.toFixed(1).replace('.', ',')}M` : '—', { bold: true, color: '#d97706' }),
    cell(p.deltaNetDebt != null ? `${p.deltaNetDebt > 0 ? '+' : ''}${p.deltaNetDebt.toFixed(1).replace('.', ',')}M` : '—', {
      bold: true,
      color: p.deltaNetDebt != null ? (p.deltaNetDebt < 0 ? COLORS.positive : COLORS.negative) : COLORS.ink,
    }),
  ]);
  return { columns: ['Año', 'Deuda Normal ($M)', 'Δ vs año anterior', 'Deuda Neta ($M)', 'Δ vs año anterior'], widths: [60, 115, 110, 115, 115], headers, rows };
}

/**
 * Calcula el impacto financiero y sobre el BPA de la refinanciación de tramos de deuda a vencer.
 * @param {object} debt - Sección de deuda del informe.
 * @param {object} report - Informe financiero consolidado.
 * @returns {object|null} Datos numéricos de tipos, delta de intereses e impacto por acción.
 */
export function buildDebtRefinancingModel(debt, report) {
  if (!debt) return null;
  let oldDebtRate = debt.refinancing?.oldDebtRate ?? null;
  let newDebtRate = debt.refinancing?.newDebtRate ?? debt.refinancing?.estimatedRefinancingRate ?? null;
  let amount = debt.refinancing?.amountRefinanced ?? debt.refinancing?.nearTermMaturities ?? null;
  const narrative = `${debt.refinancingAnalysis || ''} ${debt.refinancingImpact || ''} ${debt.text || ''}`;
  const refinancingOccurred = debt.refinancing?.occurred === true;
  const possible = debt.refinancing?.occurred === false
    || (!refinancingOccurred && /posible|estimad|evaluando|si (?:la compa[ñn][íi]a )?refinancia|sin decisi[oó]n|podr[íi]a|alternativas|previsi[oó]n|prev[eé]\b/i.test(narrative));

  const parseLocaleNumber = (raw) => {
    let s = String(raw ?? '').trim();
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };

  const scheduleEntries = Array.isArray(debt.maturitySchedule) ? debt.maturitySchedule : [];
  const scheduleItems = scheduleEntries.flatMap((entry) => {
    if (Array.isArray(entry?.items) && entry.items.length) {
      return entry.items.map((item) => ({ ...item, year: Number(entry.year) }));
    }
    return [{ ...entry, year: Number(entry?.year) }];
  }).filter((item) => Number.isFinite(item.year) && Number.isFinite(parseSecNumber(item.amount)) && parseSecNumber(item.amount) > 0);

  const firstMaturityYear = scheduleItems.reduce((min, item) => Math.min(min, item.year), Infinity);
  const firstYearItems = scheduleItems.filter((item) => item.year === firstMaturityYear);
  const firstYearRated = firstYearItems.filter((item) => {
    const rate = parseSecNumber(item.interestRate ?? item.rate);
    return Number.isFinite(rate) && rate > 0;
  });
  const firstYearRatedAmount = firstYearRated.reduce((sum, item) => sum + parseSecNumber(item.amount), 0);
  const firstYearWeightedRate = firstYearRatedAmount > 0
    ? firstYearRated.reduce((sum, item) => sum + parseSecNumber(item.amount) * parseSecNumber(item.interestRate ?? item.rate), 0) / firstYearRatedAmount
    : null;
  const firstYearAmount = firstYearItems.reduce((sum, item) => sum + parseSecNumber(item.amount), 0);

  if (oldDebtRate == null) {
    const m = narrative.match(/(?:tipo anterior|antigua|vencida|vendida|retirada|emisi[oó]n original|original(?:es)?|devengaba|pagaba|alrededor del|al)[^.%]{0,60}?(\d+(?:[.,]\d+)?)\s*%/i);
    if (m) oldDebtRate = parseLocaleNumber(m[1]);
  }
  if (newDebtRate == null) {
    const m = narrative.match(/(?:nueva deuda|nueva emisi[oó]n|nuevo tipo|coste estimado|refinanciaci[oó]n|mercado actual|nuevo coste|estima(?:mos|do)?)[^.%]{0,80}?(\d+(?:[.,]\d+)?)\s*%/i);
    if (m) newDebtRate = parseLocaleNumber(m[1]);
  }
  if (amount == null) {
    const m = narrative.match(/(?:vencen unos|vencen|nominal de|importe de|asciende a|deuda que vence[^.]{0,50}?|totalizando|refinanci(?:a|ar|ando)?)(?:~?\$?)([\d.,]+)\s*(?:M|mil millones|B)\b/i);
    if (m) {
      const parsed = parseLocaleNumber(m[1]);
      if (parsed != null) amount = /mil millones|B\b/i.test(m[0]) ? parsed * 1000 : parsed;
    }
  }
  if (amount == null && possible && Number.isFinite(firstYearAmount) && firstYearAmount > 0) {
    amount = Math.round(firstYearAmount * 10) / 10;
  }
  if (possible && firstYearWeightedRate != null) {
    oldDebtRate = Math.round(firstYearWeightedRate * 100) / 100;
  }

  let shares = null;
  const sharesRow = report?.horizons?.[0]?.sales?.shares;
  if (sharesRow) {
    const sMatch = String(sharesRow).match(/([\d\.,]+)\s*M/i);
    if (sMatch) shares = parseFloat(sMatch[1].replace(',', '.'));
  }
  if (!shares && report?.shares) shares = Number(report.shares);
  if (!shares && Array.isArray(report?.conclusion?.repurchases?.sharesHistory)) {
    const lastPoint = report.conclusion.repurchases.sharesHistory.slice(-1)[0];
    if (lastPoint?.shares) shares = Number(lastPoint.shares);
  }

  let interestDelta = null;
  let netInterestDelta = null;
  let epsImpact = null;
  let epsText = null;

  if (Number.isFinite(oldDebtRate) && Number.isFinite(newDebtRate) && Number.isFinite(amount)) {
    const rateDiff = newDebtRate - oldDebtRate;
    interestDelta = Math.round((amount * (rateDiff / 100)) * 10) / 10;
    netInterestDelta = Math.round((interestDelta * (1 - 0.23)) * 10) / 10;
    if (Number.isFinite(shares) && shares > 0) {
      epsImpact = Math.round((-netInterestDelta / shares) * 100) / 100;
    }
  }

  if (epsImpact != null) {
    const absEps = Math.abs(epsImpact).toFixed(2).replace('.', ',');
    if (possible) {
      epsText = epsImpact < 0
        ? `posible impacto en el BPA de **-${absEps} $/acción** por el sobrecoste neto de intereses tras impuestos`
        : `posible impacto favorable en el BPA de **+${absEps} $/acción**`;
    } else {
      epsText = epsImpact < 0
        ? `los nuevos costes suben reduciendo en torno a **${absEps} $/acción** el BPA (impacto: **-${absEps} $/acc**)`
        : `los nuevos costes bajan en torno a **${absEps} $/acción** (impacto favorable en el BPA de **+${absEps} $/acc**)`;
    }
  }

  const hasData = Number.isFinite(oldDebtRate) || Number.isFinite(newDebtRate) || debt.refinancingAnalysis || debt.refinancingImpact;
  if (!hasData) return null;

  return {
    oldDebtRate,
    newDebtRate,
    amount,
    interestDelta,
    netInterestDelta,
    shares,
    epsImpact,
    epsText,
    possible,
    badge: (oldDebtRate != null && newDebtRate != null)
      ? `${possible ? 'Posible refinanciación' : 'Refinanciación'}: deuda ${possible ? 'actual' : 'vendida/vencida'} al **${oldDebtRate.toFixed(2).replace('.', ',')} %** vs ${possible ? 'posible nueva emisión' : 'nueva emitida'} al **${newDebtRate.toFixed(2).replace('.', ',')} %**${epsText ? ` · ${epsText}` : ''}`
      : null,
    explanation: debt.refinancingAnalysis || null,
    impactExplanation: debt.refinancingImpact || null,
  };
}

/**
 * Genera el conjunto de tarjetas o insignias métricas de refinanciación.
 * @param {object} refinancing - Modelo retornado por buildDebtRefinancingModel.
 * @returns {Array<{label: string, val: string, highlight?: boolean}>} Insignias con etiquetas y valores.
 */
export function buildDebtRefinancingBadges(refinancing) {
  if (!refinancing) return [];
  const possible = refinancing.possible === true;
  return [
    { label: possible ? 'Tipo deuda actual' : 'Tipo deuda anterior', val: refinancing.oldDebtRate != null ? `${refinancing.oldDebtRate.toFixed(2).replace('.', ',')} %` : '—' },
    { label: possible ? 'Posible tipo nueva emisión' : 'Tipo nueva emisión', val: refinancing.newDebtRate != null ? `${refinancing.newDebtRate.toFixed(2).replace('.', ',')} %` : '—' },
    { label: possible ? 'Volumen a refinanciar' : 'Volumen refinanciado', val: refinancing.amount != null ? `$${Math.round(refinancing.amount)}M` : '—' },
    {
      label: possible ? 'Posible impacto en BPA' : 'Impacto en BPA',
      val: refinancing.epsImpact != null ? `${refinancing.epsImpact >= 0 ? '+' : ''}${refinancing.epsImpact.toFixed(2).replace('.', ',')} $/acc` : '—',
      highlight: true,
    },
  ];
}
