import JSZip from 'jszip';
import { withOutlookComparison } from '../agents/analystAgent.js';

export { withOutlookComparison };

/* ── Paleta de resaltado por nota (*1…*6) — idéntica a la del PDF ── */
const HIGHLIGHT_PALETTE = [
  { bg: '#fef08a', text: '#854d0e' }, // 1: Amarillo
  { bg: '#fed7aa', text: '#c2410c' }, // 2: Naranja
  { bg: '#bbf7d0', text: '#15803d' }, // 3: Verde lima
  { bg: '#e9d5ff', text: '#7e22ce' }, // 4: Morado / Malva
  { bg: '#bae6fd', text: '#0369a1' }, // 5: Celeste pastel
  { bg: '#fbcfe8', text: '#be185d' }, // 6: Rosa pastel
];

const COLORS = {
  ink: '#111827',
  headerBg: '#1f2937',
  headerColor: '#ffffff',
  stripe: '#f3f4f6',
  muted: '#6b7280',
  noteText: '#4b5563',
  soft: '#9ca3af',
  ticker: '#6b7280',
  period: '#374151',
  rule: '#d1d5db',
  positive: '#16a34a',
  negative: '#dc2626',
};

function sanitize(value) {
  if (value === null || value === undefined) return '—';
  return String(value).replaceAll('−', '-');
}

function getHighlight(noteNumber) {
  const num = parseInt(noteNumber, 10);
  if (Number.isNaN(num) || num < 1) return HIGHLIGHT_PALETTE[0];
  return HIGHLIGHT_PALETTE[(num - 1) % HIGHLIGHT_PALETTE.length];
}

function noteNumberOf(value) {
  const match = String(value ?? '').match(/\*?(\d+)/);
  return match ? match[1] : '1';
}

/* ── Recompras: fila de precio medio y modelo del gráfico de acciones ── */

function parseSecNumber(str) {
  if (str == null) return NaN;
  let s = String(str).replace(/[$€£\s]/g, '').trim();
  if (!s) return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && !hasDot) {
    s = s.replace(',', '.');
  } else if (!hasComma && hasDot && s.split('.').length > 2) {
    s = s.split('.').join('');
  } else if (hasComma && hasDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const num = parseFloat(s);
  return Number.isFinite(num) ? num : NaN;
}

export function withAveragePriceRow(snippet) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return snippet;
  if (snippet.rows.some((r) => /average price/i.test(String(Array.isArray(r) ? r[0] : (r.metric ?? r.name))))) return snippet;
  const sharesRow = snippet.rows.find((r) => /shares repurchased/i.test(String(Array.isArray(r) ? r[0] : (r.metric ?? r.name))));
  const costRow = snippet.rows.find((r) => /aggregate cost/i.test(String(Array.isArray(r) ? r[0] : (r.metric ?? r.name))));
  if (!sharesRow || !costRow) return snippet;
  const width = Math.max(Array.isArray(sharesRow) ? sharesRow.length : 2, Array.isArray(costRow) ? costRow.length : 2);
  const prices = [];
  for (let i = 1; i < width; i += 1) {
    const shares = parseSecNumber(Array.isArray(sharesRow) ? sharesRow[i] : sharesRow.value);
    const cost = parseSecNumber(Array.isArray(costRow) ? costRow[i] : costRow.value);
    if (Number.isFinite(shares) && Number.isFinite(cost) && shares > 0) {
      const price = (cost * 1e6) / shares;
      prices.push(`$${price.toFixed(1).replace('.', ',')}`);
    } else {
      prices.push('—');
    }
  }
  if (prices.every((p) => p === '—')) return snippet;
  return { ...snippet, rows: [...snippet.rows, ['Average price paid (in $)', ...prices]] };
}

export function buildSharesChartModel(sharesHistory) {
  if (!Array.isArray(sharesHistory) || !sharesHistory.length) return null;
  const points = sharesHistory
    .map((h) => ({ year: String(h?.year ?? '').trim(), shares: Number(h?.shares) }))
    .filter((p) => p.year && Number.isFinite(p.shares) && p.shares > 0);
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.shares));
  const title = points.length >= 5
    ? 'EVOLUCIÓN DEL NÚMERO DE ACCIONES (ÚLTIMOS 5 AÑOS)'
    : 'EVOLUCIÓN DEL NÚMERO DE ACCIONES (AÑOS DISPONIBLES)';
  const n = points.length;
  const first = points[0].shares;
  const lastPoint = points[n - 1].shares;
  const cagrPct = (1 - Math.pow(lastPoint / first, 1 / (n - 1))) * 100;
  const bpaCagr = cagrPct / (100 - cagrPct) * 100;
  const prevPoint = points[n - 2].shares;
  const lastPct = (1 - lastPoint / prevPoint) * 100;
  const bpaLast = lastPct / (100 - lastPct) * 100;
  return {
    title,
    max,
    points,
    metrics: [
      { label: `Reducción media anual (CAGR, ${n - 1} años)`, pct: cagrPct, bpa: bpaCagr },
      { label: 'Último año', pct: lastPct, bpa: bpaLast },
    ],
  };
}

function fmtPct(pct) {
  return `${pct < 0 ? '' : '-'}${pct.toFixed(1).replace('.', ',')} %`;
}

function fmtBpa(pct) {
  return `+${pct.toFixed(1).replace('.', ',')} %`;
}

export function buildSharesChartTable(chart) {
  if (!chart || !Array.isArray(chart.points) || !chart.points.length) return null;
  const headers = [
    cell('Año', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Acciones (millones)', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Δ vs año anterior', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
  ];
  const rows = chart.points.map((p, i) => {
    const prev = i > 0 ? chart.points[i - 1].shares : null;
    const delta = prev != null ? ((p.shares - prev) / prev) * 100 : null;
    return [
      cell(String(p.year), { bold: true, color: COLORS.ink }),
      cell(`${String(p.shares).replace('.', ',')}M`, { color: COLORS.ink }),
      cell(delta != null ? fmtPct(delta) : '—', { color: delta != null && delta < 0 ? COLORS.negative : COLORS.ink }),
    ];
  });
  const metricRows = (chart.metrics ?? []).map((m) => [
    cell(m.label, { bold: true, color: COLORS.ink, bg: '#e0f2fe' }),
    cell('—', { color: COLORS.ink, bg: '#e0f2fe' }),
    cell(`${fmtPct(m.pct)} (BPA ${fmtBpa(m.bpa)})`, { bold: true, color: COLORS.negative, bg: '#e0f2fe' }),
  ]);
  return { columns: ['Año', 'Acciones (millones)', 'Δ vs año anterior'], widths: [70, 140, 120], headers, rows: [...rows, ...metricRows] };
}

/* ── Deuda: Modelos de Calendario de Vencimientos, Evolución 10 Años y Refinanciación ── */

const DEBT_BLOCK_PALETTE = [
  { fill: '#0284c7', text: '#ffffff' }, // Azul / Sky
  { fill: '#d97706', text: '#ffffff' }, // Ámbar / Dorado
  { fill: '#7c3aed', text: '#ffffff' }, // Púrpura / Violeta
  { fill: '#059669', text: '#ffffff' }, // Esmeralda / Verde
  { fill: '#e11d48', text: '#ffffff' }, // Carmín / Rosa
  { fill: '#0891b2', text: '#ffffff' }, // Cian
  { fill: '#4f46e5', text: '#ffffff' }, // Índigo
  { fill: '#ea580c', text: '#ffffff' }, // Naranja
  { fill: '#475569', text: '#ffffff' }, // Pizarra
];

export function buildDebtMaturityModel(debt, reportFiscalYear) {
  if (!debt) return null;

  let baseYear = Number(reportFiscalYear);
  if (!Number.isFinite(baseYear) || baseYear < 2000) {
    const fromSnippet = String(debt?.secSnippet?.title || debt?.title || '').match(/20\d\d/);
    baseYear = fromSnippet ? parseInt(fromSnippet[0], 10) : 2025;
  }
  const minYear = baseYear + 1;
  const maxYear = baseYear + 5;

  const rawItems = [];
  const pushItem = (entry, fallbackYear) => {
    const yr = Number(entry?.year ?? fallbackYear);
    const amount = parseSecNumber(entry?.amount ?? entry?.totalAmount ?? entry?.value);
    const rate = parseSecNumber(entry?.interestRate ?? entry?.rate ?? entry?.averageRate);
    const type = String(entry?.type || entry?.name || entry?.label || 'Deuda total').trim();
    if (!Number.isFinite(yr) || !Number.isFinite(amount) || amount <= 0) return;
    rawItems.push({
      year: yr,
      name: String(entry?.name || entry?.label || type).trim(),
      type,
      amount,
      interestRate: Number.isFinite(rate) && rate > 0 ? rate : null,
    });
  };

  // 1. Si existe maturitySchedule estructurado (array plano o agrupado por años)
  if (Array.isArray(debt.maturitySchedule)) {
    debt.maturitySchedule.forEach((entry) => {
      if (Array.isArray(entry?.items) && entry.items.length) {
        entry.items.forEach((it) => pushItem(it, entry.year));
      } else {
        pushItem(entry, entry?.year);
      }
    });
  } else if (debt.maturitySchedule && Array.isArray(debt.maturitySchedule.years)) {
    debt.maturitySchedule.years.forEach((entry) => {
      if (Array.isArray(entry?.items) && entry.items.length) {
        entry.items.forEach((it) => pushItem(it, entry.year));
      } else {
        pushItem(entry, entry?.year);
      }
    });
  }

  // 2. Calendario XBRL de la SEC (maturityCalendar) como respaldo
  if (rawItems.length === 0 && Array.isArray(debt.maturityCalendar?.years)) {
    debt.maturityCalendar.years.forEach((entry) => pushItem({ ...entry, type: 'Deuda total' }));
  }

  // 3. Si no hay items directos, extraer de secSnippet o secTable
  if (rawItems.length === 0) {
    const snippetRows = debt.secSnippet?.rows || debt.secTable?.rows;
    if (Array.isArray(snippetRows) && snippetRows.length) {
      snippetRows.forEach((r) => {
        const rowArr = Array.isArray(r) ? r : [r.metric ?? r.name, r.value];
        const rowText = rowArr.join(' ');
        const name = String(rowArr[0] || '').trim();

        // Localizar la celda con año o fecha de vencimiento (ej. "2026", "July 2026")
        let yr = null;
        rowArr.slice(1).forEach((cellValue) => {
          if (yr != null) return;
          const yearMatch = String(cellValue ?? '').match(/\b(20\d\d)\b/);
          if (yearMatch) yr = parseInt(yearMatch[1], 10);
        });
        if (!Number.isFinite(yr)) return;

        // Localizar el primer importe monetario de la fila (columna de saldo actual)
        let amount = null;
        rowArr.slice(1).forEach((cellValue) => {
          if (Number.isFinite(amount)) return;
          const text = String(cellValue ?? '');
          if (!/(\$|€|£|million|billion|\d[.,]\d)/i.test(text)) return;
          const parsed = parseSecNumber(cellValue);
          if (Number.isFinite(parsed) && parsed > 0) amount = parsed;
        });
        if (!Number.isFinite(amount) || amount <= 0) return;

        const rateMatch = rowText.match(/(\d+(?:[\.,]\d+)?)\s*%/);
        const interestRate = rateMatch ? parseFloat(rateMatch[1].replace(',', '.')) : null;
        pushItem({
          year: yr,
          name,
          type: (name || 'Deuda total').replace(/^(\$|CAD|EUR|GBP)?\s*[\d.,]+\s*(?:billion|million|B|M)?\s*/i, '').replace(/\s+senior\s+notes/i, ' Notes').trim() || 'Deuda total',
          amount,
          interestRate,
        });
      });
    }
  }

  // Regla estricta: el gráfico solo muestra los próximos 5 años
  const futureItems = rawItems.filter((it) => Number.isFinite(it.year) && it.year > maxYear && Number.isFinite(it.amount));
  const filtered = rawItems
    .filter((it) => Number.isFinite(it.year) && it.year >= minYear && it.year <= maxYear && Number.isFinite(it.amount) && it.amount > 0);

  if (filtered.length === 0) return null;

  // Asignar colores por tipo de deuda (naranja si solo hay un tipo, como el gráfico de acciones)
  const distinctTypes = [...new Set(filtered.map((it) => it.type || it.name))];
  const typeColorMap = new Map();
  if (distinctTypes.length <= 1) {
    typeColorMap.set(distinctTypes[0] ?? 'Deuda total', { fill: '#f59e0b', text: '#ffffff' });
  } else {
    distinctTypes.forEach((t, i) => {
      typeColorMap.set(t, DEBT_BLOCK_PALETTE[i % DEBT_BLOCK_PALETTE.length]);
    });
  }

  filtered.forEach((it) => {
    const paletteItem = typeColorMap.get(it.type || it.name) || DEBT_BLOCK_PALETTE[0];
    it.color = paletteItem.fill;
    it.textColor = paletteItem.text;
  });

  // Agrupar por año: siempre los 5 ejercicios de la ventana
  const yearsMap = new Map();
  filtered.forEach((it) => {
    if (!yearsMap.has(it.year)) yearsMap.set(it.year, []);
    yearsMap.get(it.year).push(it);
  });

  const groupedYears = [];
  for (let yr = minYear; yr <= maxYear; yr += 1) {
    const items = yearsMap.get(yr) ?? [];
    const totalAmount = items.reduce((sum, it) => sum + it.amount, 0);
    const ratedItems = items.filter((it) => Number.isFinite(it.interestRate) && it.interestRate > 0);
    const ratedAmount = ratedItems.reduce((sum, it) => sum + it.amount, 0);
    const averageRate = ratedAmount > 0
      ? ratedItems.reduce((sum, it) => sum + it.amount * it.interestRate, 0) / ratedAmount
      : null;
    groupedYears.push({ year: yr, totalAmount, averageRate, items });
  }

  const totalAmount = filtered.reduce((sum, it) => sum + it.amount, 0);
  const ratedItems = filtered.filter((it) => Number.isFinite(it.interestRate) && it.interestRate > 0);
  const ratedAmount = ratedItems.reduce((sum, it) => sum + it.amount, 0);
  const totalAverageRate = ratedAmount > 0
    ? ratedItems.reduce((sum, it) => sum + it.amount * it.interestRate, 0) / ratedAmount
    : null;

  let afterYearFive = parseSecNumber(debt.maturityAfterFive ?? debt.maturityAfterFiveAmount);
  if (!Number.isFinite(afterYearFive) && futureItems.length) {
    afterYearFive = futureItems.reduce((sum, it) => sum + it.amount, 0);
  }

  const maxYearAmount = Math.max(...groupedYears.map((y) => y.totalAmount), 0);

  return {
    title: `CALENDARIO DE VENCIMIENTOS DE DEUDA (${minYear}–${maxYear})`,
    baseYear,
    minYear,
    maxYear,
    years: groupedYears,
    totalAmount,
    totalAverageRate,
    afterYearFive: Number.isFinite(afterYearFive) ? afterYearFive : null,
    maxYearAmount,
    hasRates: ratedAmount > 0,
    types: distinctTypes.map((t) => ({
      name: t,
      color: typeColorMap.get(t).fill,
      textColor: typeColorMap.get(t).text,
    })),
  };
}

export function buildDebtHistoryModel(debt, report) {
  const rawList = debt?.debtHistory
    || report?.edgarDebtHistory
    || report?.annualDebtHistory
    || null;

  if (!Array.isArray(rawList) || rawList.length < 2) return null;

  const toMillionsVal = (v) => {
    const num = parseSecNumber(v);
    if (!Number.isFinite(num)) return null;
    return Math.abs(num) > 1e6 ? Math.round(num / 1e6) : Math.round(num * 10) / 10;
  };

  const points = rawList
    .map((p) => ({
      year: Number(p?.year || (p?.periodEnd ? parseInt(String(p.periodEnd).slice(0, 4), 10) : null)),
      totalDebt: toMillionsVal(p?.totalDebt),
      netDebt: toMillionsVal(p?.netDebt),
    }))
    .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.totalDebt))
    .sort((a, b) => a.year - b.year)
    .slice(-10); // Máximo últimos 10 años hasta la actualidad

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
  const maxVal = Math.max(...allVals);
  const minVal = Math.min(0, ...allVals);

  return {
    title: `EVOLUCIÓN DE LA DEUDA: NORMAL VS NETA (${points[0].year}–${points[points.length - 1].year})`,
    points,
    maxVal,
    minVal,
  };
}

export function buildDebtRefinancingModel(debt, report) {
  if (!debt) return null;

  let oldDebtRate = debt.refinancing?.oldDebtRate ?? null;
  let newDebtRate = debt.refinancing?.newDebtRate ?? debt.refinancing?.estimatedRefinancingRate ?? null;
  let amount = debt.refinancing?.amountRefinanced ?? debt.refinancing?.nearTermMaturities ?? null;

  const narrative = `${debt.refinancingAnalysis || ''} ${debt.refinancingImpact || ''} ${debt.text || ''}`;

  const parseLocaleNumber = (raw) => {
    let s = String(raw ?? '').trim();
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };

  if (oldDebtRate == null) {
    const patterns = [
      /(?:tipo anterior|antigua|vencida|vendida|retirada|emisi[oó]n original|original(?:es)?|devengaba|pagaba)[^.%]{0,60}?(\d+(?:[.,]\d+)?)\s*%/i,
      /(?:alrededor del|al)\s*(\d+(?:[.,]\d+)?)\s*%/i,
    ];
    for (const re of patterns) {
      const m = narrative.match(re);
      if (m) { oldDebtRate = parseLocaleNumber(m[1]); break; }
    }
  }
  if (newDebtRate == null) {
    const patterns = [
      /(?:nueva deuda|nueva emisi[oó]n|nuevo tipo|coste estimado|refinanciaci[oó]n)[^.%]{0,80}?(\d+(?:[.,]\d+)?)\s*%/i,
      /(?:mercado actual|nuevo coste|estima(?:mos|do)?)[^.%]{0,60}?(\d+(?:[.,]\d+)?)\s*%/i,
    ];
    for (const re of patterns) {
      const m = narrative.match(re);
      if (m) { newDebtRate = parseLocaleNumber(m[1]); break; }
    }
  }
  if (amount == null) {
    const m = narrative.match(/(?:vencen unos|vencen|nominal de|importe de|asciende a|deuda que vence[^.]{0,50}?)(?:~?\$?)([\d.,]+)\s*(?:M|mil millones|B)\b/i);
    if (m) {
      const parsed = parseLocaleNumber(m[1]);
      amount = /mil millones|B\b/i.test(m[0]) ? parsed * 1000 : parsed;
    }
  }

  // Extraer número de acciones para calcular BPA
  let shares = null;
  const sharesRow = report?.horizons?.[0]?.sales?.shares;
  if (sharesRow) {
    const sMatch = String(sharesRow).match(/([\d\.,]+)\s*M/i);
    if (sMatch) shares = parseFloat(sMatch[1].replace(',', '.'));
  }
  if (!shares && report?.shares) {
    shares = Number(report.shares);
  }
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
    const taxRate = 0.23; // Tipo impositivo normalizado
    netInterestDelta = Math.round((interestDelta * (1 - taxRate)) * 10) / 10;

    if (Number.isFinite(shares) && shares > 0) {
      epsImpact = Math.round((-netInterestDelta / shares) * 100) / 100;
    }
  }

  if (epsImpact != null) {
    const absEps = Math.abs(epsImpact).toFixed(2).replace('.', ',');
    if (epsImpact < 0) {
      epsText = `los nuevos costes suben reduciendo en torno a **${absEps} $/acción** el BPA (impacto: **-${absEps} $/acc**)`;
    } else {
      epsText = `los nuevos costes bajan en torno a **${absEps} $/acción** (impacto favorable en el BPA de **+${absEps} $/acc**)`;
    }
  }

  const hasRefinancingData = Number.isFinite(oldDebtRate) || Number.isFinite(newDebtRate) || debt.refinancingAnalysis || debt.refinancingImpact;
  if (!hasRefinancingData) return null;

  return {
    oldDebtRate,
    newDebtRate,
    amount,
    interestDelta,
    netInterestDelta,
    shares,
    epsImpact,
    epsText,
    badge: (oldDebtRate != null && newDebtRate != null)
      ? `Refinanciación: deuda vendida/vencida al **${oldDebtRate.toFixed(2).replace('.', ',')} %** vs nueva emitida al **${newDebtRate.toFixed(2).replace('.', ',')} %**${epsText ? ` · ${epsText}` : ''}`
      : null,
    explanation: debt.refinancingAnalysis || null,
    impactExplanation: debt.refinancingImpact || null,
  };
}

export function buildDebtMaturityTable(chart) {
  if (!chart || !Array.isArray(chart.years) || !chart.years.length) return null;
  const headers = [
    cell('Año', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Tipo / Emisión de Deuda', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Importe ($M)', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Tipo Interés', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Tipo Medio Anual', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
  ];
  const rows = [];
  chart.years.forEach((yr) => {
    if (!yr.items.length) {
      rows.push([
        cell(String(yr.year), { bold: true, color: COLORS.ink }),
        cell('Sin vencimientos', { color: COLORS.muted }),
        cell('$0,0M', { bold: true, color: COLORS.ink }),
        cell('—', { color: COLORS.muted }),
        cell('—', { color: COLORS.muted }),
      ]);
      return;
    }
    yr.items.forEach((it, idx) => {
      rows.push([
        cell(idx === 0 ? String(yr.year) : '', { bold: true, color: COLORS.ink }),
        cell(it.name, { color: COLORS.ink }),
        cell(`$${it.amount.toFixed(1).replace('.', ',')}M`, { bold: true, color: COLORS.ink }),
        cell(it.interestRate != null ? `${it.interestRate.toFixed(2).replace('.', ',')} %` : '—', { bold: true, color: '#c2410c' }),
        cell(idx === 0 && yr.averageRate != null ? `${yr.averageRate.toFixed(2).replace('.', ',')} %` : '', { bold: true, color: '#0369a1', bg: idx === 0 ? '#f0fdfa' : null }),
      ]);
    });
  });
  const summaryRow = [
    cell(`TOTAL (PRÓXIMOS 5 AÑOS)`, { bold: true, color: COLORS.ink, bg: '#e0f2fe' }),
    cell(chart.afterYearFive != null ? `Después del año 5: $${chart.afterYearFive.toFixed(1).replace('.', ',')}M` : '—', { color: COLORS.ink, bg: '#e0f2fe' }),
    cell(`$${chart.totalAmount.toFixed(1).replace('.', ',')}M`, { bold: true, color: COLORS.ink, bg: '#e0f2fe' }),
    cell('—', { color: COLORS.ink, bg: '#e0f2fe' }),
    cell(chart.totalAverageRate != null ? `Total medio: ${chart.totalAverageRate.toFixed(2).replace('.', ',')} %` : '—', { bold: true, color: '#0369a1', bg: '#e0f2fe' }),
  ];
  return {
    columns: ['Año', 'Tipo / Emisión de Deuda', 'Importe ($M)', 'Tipo Interés', 'Tipo Medio Anual'],
    widths: [55, 170, 95, 95, 100],
    headers,
    rows: [...rows, summaryRow],
  };
}

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
  return {
    columns: ['Año', 'Deuda Normal ($M)', 'Δ vs año anterior', 'Deuda Neta ($M)', 'Δ vs año anterior'],
    widths: [60, 115, 110, 115, 115],
    headers,
    rows,
  };
}

/* ── Modelo intermedio compartido por los tres formatos ─────────────── */

function cell(text, opts = {}) {
  return { text: sanitize(text), ...opts };
}

function headerCell(text) {
  const noteMatch = String(text).match(/\*(\d+)/);
  if (noteMatch) {
    const scheme = getHighlight(noteMatch[1]);
    return cell(text, { bold: true, color: scheme.text, bg: scheme.bg });
  }
  return cell(text, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg });
}

function isPctHeader(header) {
  return ['% Aj.', '% N.', '% Ajustado', '% Normal', '%'].includes(String(header).trim());
}

function pctColor(value) {
  const str = String(value ?? '').trim();
  if (!str || str === '—') return null;
  if (str.startsWith('-')) return COLORS.negative;
  if (str.startsWith('+') || /^[0-9]/.test(str)) return COLORS.positive;
  return null;
}

function buildSalesSection(sales) {
  const columns = ['Métrica', 'Ajustado', 'Anterior Aj.', '% Ajustado', 'Normal', 'Anterior N.', '% Normal'];
  const widths = [140, 62, 62, 63, 62, 62, 63];
  const headers = columns.map(headerCell);
  const rows = (sales.rows ?? []).map((row, index) => {
    const stripeBg = index % 2 === 0 ? COLORS.stripe : null;
    const isRowAdjusted = row.isAdjusted === true;
    const scheme = getHighlight(noteNumberOf(row.adjustedNote));

    const nameText = sanitize(row.name);
    const nameNoteMatch = nameText.match(/\*(\d+)/);
    const nameCell = nameNoteMatch
      ? cell(nameText, { bold: true, color: getHighlight(nameNoteMatch[1]).text, bg: getHighlight(nameNoteMatch[1]).bg })
      : cell(nameText, { bold: true, color: COLORS.ink, bg: stripeBg });

    const values = [row.adjusted, row.prevAdjusted, row.pctAdjusted, row.normal, row.prevNormal, row.pctNormal];
    const valueCells = values.map((value, i) => {
      const colHeader = columns[i + 1];
      const base = { bold: colHeader === 'Ajustado' || colHeader === 'Normal', color: COLORS.ink, bg: stripeBg };
      if (i === 0 && isRowAdjusted) {
        return cell(value, { bold: true, color: scheme.text, bg: scheme.bg });
      }
      if (isPctHeader(colHeader)) {
        const color = pctColor(value);
        if (color) return cell(value, { ...base, color, bold: false });
      }
      return cell(value, base);
    });
    return [nameCell, ...valueCells];
  });

  return {
    title: '1. VENTAS',
    table: { columns, widths, headers, rows },
    extras: [
      sales.shares ? `ACCIONES: ${sanitize(sales.shares)}` : null,
      sales.eps ? `BPA: ${sanitize(sales.eps)}` : null,
    ].filter(Boolean),
    notes: buildNotes(sales.notes),
  };
}

function buildCashFlowSection(cashFlow) {
  let scenarios = Array.isArray(cashFlow.scenarios) ? [...cashFlow.scenarios] : [];
  if (scenarios.length === 0) scenarios = ['Normal', 'Ajustado'];
  else if (scenarios.length === 1) scenarios = [scenarios[0], 'Ajustado'];

  const columns = ['Métrica', ...scenarios];
  const widths = [150, ...Array(scenarios.length).fill((515 - 150) / scenarios.length)];
  const headers = columns.map(headerCell);
  const rows = (cashFlow.rows ?? []).map((row, index) => {
    const stripeBg = index % 2 === 0 ? COLORS.stripe : null;
    const nameText = sanitize(row.name);
    const nameNoteMatch = nameText.match(/\*(\d+)/);
    const nameCell = nameNoteMatch
      ? cell(nameText, { bold: true, color: getHighlight(nameNoteMatch[1]).text, bg: getHighlight(nameNoteMatch[1]).bg })
      : cell(nameText, { bold: true, color: COLORS.ink, bg: stripeBg });

    let values = Array.isArray(row.values) && row.values.length ? [...row.values] : [row.value];
    if (values.length === 1 && scenarios.length === 2) values.push(values[0]);

    const valueCells = values.map((value, i) => {
      const base = { bold: columns[i + 1] === 'Ajustado' || columns[i + 1] === 'Normal', color: COLORS.ink, bg: stripeBg };
      if (i === 1 && row.cashFlowAdjustedNote) {
        const scheme = getHighlight(String(row.cashFlowAdjustedNote).replace(/\D/g, '') || '2');
        return cell(value, { bold: true, color: scheme.text, bg: scheme.bg });
      }
      return cell(value, base);
    });
    return [nameCell, ...valueCells];
  });

  const notes = (Array.isArray(cashFlow.notes) ? cashFlow.notes : []).filter((n) => {
    const lower = String(n || '').toLowerCase();
    return !lower.includes('deducido del acumulado') && !lower.includes('flujo trimestral deducido');
  });

  return { title: '2. CASH FLOW', table: { columns, widths, headers, rows }, notes: buildNotes(notes) };
}

function buildCapitalSection(capital) {
  const columns = ['Métrica', 'Valor'];
  const widths = [150, 365];
  const headers = columns.map(headerCell);
  const rows = (capital.rows ?? []).map((row, index) => {
    const stripeBg = index % 2 === 0 ? COLORS.stripe : null;
    const nameText = sanitize(row.name);
    const nameNoteMatch = nameText.match(/\*(\d+)/);
    const nameCell = nameNoteMatch
      ? cell(nameText, { bold: true, color: getHighlight(nameNoteMatch[1]).text, bg: getHighlight(nameNoteMatch[1]).bg })
      : cell(nameText, { bold: true, color: COLORS.ink, bg: stripeBg });

    const str = String(row.value ?? '').trim();
    const color = str.startsWith('-') ? COLORS.negative
      : (str.startsWith('+') || (/^[0-9]/.test(str) && str !== '0')) ? COLORS.positive
        : COLORS.ink;
    return [nameCell, cell(row.value, { color, bg: stripeBg })];
  });

  return {
    title: '3. ASIGNACIÓN DE CAPITAL',
    table: { columns, widths, headers, rows },
    verification: capital.verification ? sanitize(capital.verification) : null,
    notes: buildNotes(capital.notes),
  };
}

function buildNotes(notes) {
  return (Array.isArray(notes) ? notes : []).filter(Boolean).map((note) => {
    const raw = sanitize(note);
    const match = raw.match(/^\*(\d+):?\s*([\s\S]*)$/);
    if (match) {
      const scheme = getHighlight(match[1]);
      return { marker: `*${match[1]}:`, text: match[2], bg: scheme.bg, color: scheme.text, italic: false };
    }
    return { marker: null, text: raw, italic: true, color: COLORS.muted };
  });
}

function buildSecSnippetTable(snippet) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return null;
  const rawHeaders = Array.isArray(snippet.headers) ? snippet.headers : [];
  const rawRows = snippet.rows.map((r) => (Array.isArray(r) ? r : [r.metric ?? r.name, r.value]));
  const numCols = rawHeaders.length || (rawRows[0] ? rawRows[0].length : 2);
  let widths;
  if (numCols === 4) {
    widths = [165, 85, 110, 155];
  } else {
    const firstColWidth = numCols === 2 ? 220 : 160;
    const remainingWidth = (515 - firstColWidth) / Math.max(1, numCols - 1);
    widths = [firstColWidth, ...Array(numCols - 1).fill(remainingWidth)];
  }

  const columns = rawHeaders.length ? rawHeaders : Array(numCols).fill('');
  const headers = columns.map(headerCell);

  const rows = rawRows.map((r, rIdx) => {
    const stripeBg = rIdx % 2 === 1 ? COLORS.stripe : null;
    const rowText = r.join(' ').toLowerCase();
    const isYellow = rowText.includes('repurchased') || rowText.includes('recomprad');
    const isOrange = rowText.includes('aggregate') || rowText.includes('cost');

    return r.map((c, cIdx) => {
      let bg = stripeBg;
      let color = COLORS.ink;
      let bold = cIdx === 0;

      if (numCols === 4) {
        if (cIdx === 1) {
          bg = '#f8fafc';
          color = '#475569';
          bold = true;
        } else if (cIdx === 2) {
          bold = true;
        } else if (cIdx === 3) {
          bg = '#f0fdfa';
          color = '#0d9488';
          bold = true;
        }
      } else if (cIdx > 0 && isYellow) {
        bg = '#fef08a';
        color = '#854d0e';
        bold = true;
      } else if (cIdx > 0 && isOrange) {
        bg = '#fed7aa';
        color = '#c2410c';
        bold = true;
      } else if (cIdx > 0) {
        bold = true;
      }
      return cell(c, { bg, color, bold });
    });
  });

  return {
    title: snippet.title || 'EXTRACTO OFICIAL SEC (FORM 10-K)',
    summary: snippet.summary || null,
    headers,
    widths,
    rows,
  };
}

export function buildReportModel(report) {
  const horizons = Array.isArray(report?.horizons) ? report.horizons : [];
  const model = {
    company: sanitize(report?.company ?? ''),
    ticker: report?.ticker ? `Ticker: ${sanitize(report.ticker)}` : null,
    periodTitle: report?.periodTitle ? sanitize(report.periodTitle) : null,
    horizons: horizons.map((horizon, hIndex) => ({
      label: sanitize(horizon.label ?? (hIndex === 0 ? 'ÚLTIMOS 3 MESES' : 'EN TODO EL AÑO')),
      sections: [
        (Array.isArray(horizon.sales?.rows) && horizon.sales.rows.length) ? buildSalesSection(horizon.sales) : null,
        (Array.isArray(horizon.cashFlow?.rows) && horizon.cashFlow.rows.length) ? buildCashFlowSection(horizon.cashFlow) : null,
        (Array.isArray(horizon.capital?.rows) && horizon.capital.rows.length) ? buildCapitalSection(horizon.capital) : null,
      ].filter(Boolean),
    })),
    conclusion: null,
    rating: null,
    footer: 'Generado por Cifra · beta 0.1 · La IA ordena la información. Tú decides qué significa.',
  };

  if (report?.conclusion) {
    const conc = report.conclusion;
    model.conclusion = {
      title: 'PARTE II: INDAGACIÓN A FONDO Y CONCLUSIÓN',
      subtitle: 'Análisis detallado de recompras, outlook oficial, deuda y asignación de capital',
      cards: [],
    };

    if (conc.repurchases) {
      const rep = conc.repurchases;
      const repExpiry = (rep.authorizationExpiry && !/no indicad|not disclosed|not stated|no consta|no especificad/i.test(String(rep.authorizationExpiry)))
        ? rep.authorizationExpiry
        : null;
      const badges = [
        (rep.authorizationRemaining || rep.programRemaining) ? `Autorización restante: ${rep.authorizationRemaining || rep.programRemaining}` : null,
        repExpiry ? `Vigencia: ${repExpiry}` : null,
        rep.shareCountEvolution ? `Evolución acciones: ${rep.shareCountEvolution}` : null,
        rep.bpaImpact ? `Impacto BPA: ${rep.bpaImpact}` : null,
        rep.futureProjection ? `Proyección 5 años: ${rep.futureProjection}` : null,
      ].filter(Boolean);
      model.conclusion.cards.push({
        title: rep.title || '1: Recompras',
        text: rep.text || null,
        badges,
        highlight: true,
        chart: buildSharesChartModel(rep.sharesHistory),
        table: buildSecSnippetTable(withAveragePriceRow(rep.secSnippet)),
      });
    }

    if (conc.outlook) {
      const out = conc.outlook;
      const details = [
        out.fcfAnalysis ? `Análisis FCF: ${out.fcfAnalysis}` : null,
        out.riskFactors ? `Riesgos y Sensibilidad: ${out.riskFactors}` : null,
        out.efficiencyPlans ? `Programas de eficiencia: ${out.efficiencyPlans}` : null,
      ].filter(Boolean);
      model.conclusion.cards.push({
        title: out.title || '2: Outlook',
        text: out.text || null,
        badges: details,
        table: buildSecSnippetTable(withOutlookComparison(out.secSnippet, report)),
      });
    }

    if (conc.debt) {
      const debt = conc.debt;
      const maturityChart = buildDebtMaturityModel(debt, report?.fiscalYear);
      const historyChart = buildDebtHistoryModel(debt, report);
      const refinancingModel = buildDebtRefinancingModel(debt, report);

      const details = [
        refinancingModel?.badge ? refinancingModel.badge : null,
        debt.refinancingAnalysis ? `Refinanciación de deuda: ${debt.refinancingAnalysis}` : null,
        debt.refinancingImpact ? `Impacto en intereses: ${debt.refinancingImpact}` : null,
      ].filter(Boolean);
      model.conclusion.cards.push({
        title: debt.title || '3: Deuda',
        text: debt.text || null,
        badges: details,
        highlight: true,
        debtMaturityChart: maturityChart,
        debtHistoryChart: historyChart,
        refinancing: refinancingModel,
        table: buildSecSnippetTable(debt.secSnippet),
      });
    }

    if (conc.acquisitions) {
      model.conclusion.cards.push({
        title: conc.acquisitions.title || '4: Adquisiciones',
        text: conc.acquisitions.text || 'No se realizaron adquisiciones materiales durante el ejercicio.',
      });
    }

    if (conc.watchlist && Array.isArray(conc.watchlist.items) && conc.watchlist.items.length) {
      model.conclusion.cards.push({
        title: conc.watchlist.title || 'Cosas a tener en cuenta',
        items: conc.watchlist.items,
        isWatchlist: true,
      });
    }
  }

  if (report?.rating && report.rating.score != null) {
    const score = Number(report.rating.score);
    model.rating = {
      score,
      label: report.rating.label || `NOTA DE RESULTADOS: ${score}`,
      rationale: report.rating.rationale || 'Calificación puramente financiera basada en las cuentas anuales, outlook oficial y asignación de capital.',
      disclaimer: 'Nota puramente financiera basada exclusivamente en las cuentas anuales, el outlook oficial y la asignación de capital ejecutada. Sin especulación sobre el cumplimiento de expectativas.',
    };
  }

  return model;
}

/* ── HTML (formato maestro de guardado) ─────────────────────────────── */

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderHtmlNotes(notes) {
  if (!notes?.length) return '';
  const items = notes.map((note) => {
    if (note.marker) {
      return `<li><mark style="background:${note.bg};color:${note.color};font-weight:700;padding:1px 4px;border-radius:3px;">${escapeHtml(note.marker)}</mark> ${escapeHtml(note.text).replaceAll('\n', '<br>')}</li>`;
    }
    return `<li style="font-style:italic;color:${note.color};">${escapeHtml(note.text).replaceAll('\n', '<br>')}</li>`;
  }).join('');
  return `<ul class="notes">${items}</ul>`;
}

function renderSharesChartSvg(chart) {
  if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return '';
  const W = 640;
  const H = 232;
  const padL = 50;
  const padR = 10;
  const padT = 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = chart.points.length;
  const max = chart.max;
  const step = max > 500 ? 100 : (max > 100 ? 50 : 10);
  const niceMax = Math.ceil(max / step) * step || max;
  const xFor = (i) => padL + (plotW / n) * (i + 0.5);
  const yFor = (v) => padT + plotH * (1 - v / niceMax);
  const fmtP = (v) => `${v < 0 ? '' : '-'}${v.toFixed(1).replace('.', ',')} %`;
  const fmtB = (v) => `+${v.toFixed(1).replace('.', ',')} %`;
  const parts = [];

  for (let g = 0; g <= 3; g += 1) {
    const v = (niceMax * (3 - g)) / 3;
    const gy = yFor(v).toFixed(1);
    parts.push(`<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
    parts.push(`<text x="${padL - 6}" y="${(parseFloat(gy) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">${Math.round(v)}M</text>`);
  }

  const slotW = plotW / n;
  const barW = Math.min(46, slotW * 0.6);
  chart.points.forEach((p, i) => {
    const cx = xFor(i).toFixed(1);
    const top = yFor(p.shares).toFixed(1);
    parts.push(`<rect x="${(parseFloat(cx) - barW / 2).toFixed(1)}" y="${top}" width="${barW.toFixed(1)}" height="${(padT + plotH - parseFloat(top)).toFixed(1)}" rx="2" fill="#f59e0b"/>`);
    parts.push(`<text x="${cx}" y="${(padT + plotH + 14).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${escapeHtml(String(p.year))}</text>`);
  });

  const mets = Array.isArray(chart.metrics) ? chart.metrics : [];
  const y0 = yFor(chart.points[0].shares);
  const yN = yFor(chart.points[n - 1].shares);
  parts.push(`<line x1="${xFor(0).toFixed(1)}" y1="${y0.toFixed(1)}" x2="${xFor(n - 1).toFixed(1)}" y2="${yN.toFixed(1)}" stroke="#1f2937" stroke-width="1.6" stroke-dasharray="6 4"/>`);
  if (mets.length) {
    const midX = (xFor(0) + xFor(n - 1)) / 2;
    const lineMidY = (y0 + yN) / 2;
    const label1 = `CAGR: ${fmtP(mets[0].pct)} · BPA ${fmtB(mets[0].bpa)}`;
    const w1 = label1.length * 5.4 + 12;
    parts.push(`<rect x="${(midX - w1 / 2).toFixed(1)}" y="${(lineMidY - 20).toFixed(1)}" width="${w1.toFixed(1)}" height="15" rx="3" fill="#1f2937"/>`);
    parts.push(`<text x="${midX.toFixed(1)}" y="${(lineMidY - 9).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#ffffff">${escapeHtml(label1)}</text>`);
    if (mets[1]) {
      const xPrev = xFor(n - 2);
      const yPrev = yFor(chart.points[n - 2].shares);
      parts.push(`<line x1="${xPrev.toFixed(1)}" y1="${yPrev.toFixed(1)}" x2="${xFor(n - 1).toFixed(1)}" y2="${yN.toFixed(1)}" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="6 4"/>`);
      const label2 = `Últ. año: ${fmtP(mets[1].pct)} · BPA ${fmtB(mets[1].bpa)}`;
      const w2 = label2.length * 5.4 + 12;
      const lx = Math.min(W - padR - w2 / 2, (xPrev + xFor(n - 1)) / 2);
      parts.push(`<rect x="${(lx - w2 / 2).toFixed(1)}" y="${(lineMidY - 40).toFixed(1)}" width="${w2.toFixed(1)}" height="15" rx="3" fill="#dc2626"/>`);
      parts.push(`<text x="${lx.toFixed(1)}" y="${(lineMidY - 29).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#ffffff">${escapeHtml(label2)}</text>`);
    }
  }
  return `<svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(chart.title)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}

function renderHtmlSharesChart(chart) {
  if (!chart || !Array.isArray(chart.points) || !chart.points.length) return '';
  return `<div class="shares-chart"><div class="sc-title">${escapeHtml(chart.title)}</div>${renderSharesChartSvg(chart)}</div>`;
}

export function renderDebtMaturitySvg(chart) {
  if (!chart || !Array.isArray(chart.years) || !chart.years.length) return '';
  const W = 640;
  const H = 265;
  const padL = 52;
  const padR = 14;
  const padT = 32;
  const padB = 52;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = chart.maxYearAmount || 1;
  const step = max > 5000 ? 1000 : (max > 1000 ? 500 : (max > 200 ? 100 : 50));
  const niceMax = Math.ceil(max / step) * step || max;
  const n = chart.years.length;
  const slotW = plotW / n;
  const barW = Math.min(50, slotW * 0.65);
  const parts = [];

  // Leyenda en la parte superior (solo si hay varios tipos de deuda)
  if (Array.isArray(chart.types) && chart.types.length > 1) {
    let legX = padL;
    chart.types.forEach((t) => {
      parts.push(`<rect x="${legX}" y="10" width="10" height="10" rx="2" fill="${t.color}"/>`);
      parts.push(`<text x="${legX + 13}" y="18" font-size="8.5" font-weight="700" fill="#334155">${escapeHtml(t.name)}</text>`);
      legX += (t.name.length * 5.2) + 26;
    });
  }

  // Líneas horizontales de cuadrícula
  for (let g = 0; g <= 3; g += 1) {
    const v = (niceMax * (3 - g)) / 3;
    const gy = padT + plotH * (1 - v / niceMax);
    parts.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
    parts.push(`<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">$${Math.round(v)}M</text>`);
  }

  // Barras por año (apiladas por tipo de deuda si hay varios tramos)
  chart.years.forEach((yr, i) => {
    const cx = padL + slotW * (i + 0.5);
    let curBaseline = padT + plotH;

    yr.items.forEach((it) => {
      const blockH = Math.max(3, (it.amount / niceMax) * plotH);
      const topY = curBaseline - blockH;
      parts.push(`<rect x="${(cx - barW / 2).toFixed(1)}" y="${topY.toFixed(1)}" width="${barW.toFixed(1)}" height="${blockH.toFixed(1)}" rx="2" fill="${it.color || '#f59e0b'}"/>`);
      if (blockH >= 12 && it.interestRate != null) {
        parts.push(`<text x="${cx.toFixed(1)}" y="${(topY + blockH / 2 + 3.5).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="${it.textColor || '#ffffff'}">${it.interestRate.toFixed(1).replace('.', ',')}%</text>`);
      }
      curBaseline = topY;
    });

    // Importe que vence cada año (en negrita) y tipo medio anual si se conoce
    if (yr.totalAmount > 0) {
      parts.push(`<text x="${cx.toFixed(1)}" y="${(curBaseline - 12).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a">$${yr.totalAmount.toFixed(1).replace('.', ',')}M</text>`);
      if (yr.averageRate != null) {
        parts.push(`<text x="${cx.toFixed(1)}" y="${(curBaseline - 2).toFixed(1)}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#c2410c">Media: ${yr.averageRate.toFixed(2).replace('.', ',')}%</text>`);
      }
    } else {
      parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH - 4).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#94a3b8">—</text>`);
    }

    // Año al pie
    parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH + 15).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${yr.year}</text>`);
  });

  // Banner inferior: tipo de interés medio total y deuda a amortizar
  const bannerY = H - 28;
  parts.push(`<rect x="${padL}" y="${bannerY}" width="${plotW}" height="22" rx="4" fill="#1e293b"/>`);
  const afterText = chart.afterYearFive != null ? `  ·  Después del año 5: $${chart.afterYearFive.toFixed(1).replace('.', ',')}M` : '';
  const bannerText = chart.totalAverageRate != null
    ? `Tipo de interés medio total (próximos 5 años): ${chart.totalAverageRate.toFixed(2).replace('.', ',')} %  ·  Deuda a amortizar: $${chart.totalAmount.toFixed(1).replace('.', ',')}M${afterText}`
    : `Deuda a amortizar en los próximos 5 años: $${chart.totalAmount.toFixed(1).replace('.', ',')}M${afterText}`;
  parts.push(`<text x="${(padL + plotW / 2).toFixed(1)}" y="${bannerY + 14.5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#ffffff">${escapeHtml(bannerText)}</text>`);

  return `<svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(chart.title)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}

export function renderHtmlDebtMaturityChart(chart) {
  if (!chart || !Array.isArray(chart.years) || !chart.years.length) return '';
  return `<div class="shares-chart"><div class="sc-title">${escapeHtml(chart.title)}</div>${renderDebtMaturitySvg(chart)}</div>`;
}

export function renderDebtHistorySvg(chart) {
  if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return '';
  const W = 640;
  const H = 260;
  const padL = 52;
  const padR = 14;
  const padT = 32;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = chart.maxVal || 1;
  const step = max > 5000 ? 1000 : (max > 1000 ? 500 : (max > 200 ? 100 : 50));
  const niceMax = Math.ceil(max / step) * step || max;
  const n = chart.points.length;
  const slotW = plotW / n;
  const groupW = Math.min(48, slotW * 0.76);
  const barW = (groupW - 4) / 2;
  const parts = [];

  // Leyenda
  parts.push(`<rect x="170" y="10" width="10" height="10" rx="2" fill="#1e40af"/>`);
  parts.push(`<text x="185" y="18" font-size="8.5" font-weight="700" fill="#334155">Deuda Normal / Total</text>`);
  parts.push(`<rect x="330" y="10" width="10" height="10" rx="2" fill="#d97706"/>`);
  parts.push(`<text x="345" y="18" font-size="8.5" font-weight="700" fill="#334155">Deuda Neta</text>`);

  // Líneas de cuadrícula
  for (let g = 0; g <= 3; g += 1) {
    const v = (niceMax * (3 - g)) / 3;
    const gy = padT + plotH * (1 - v / niceMax);
    parts.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
    parts.push(`<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">$${Math.round(v)}M</text>`);
  }

  // Dos barras por año (Deuda Normal y Deuda Neta)
  chart.points.forEach((p, i) => {
    const cx = padL + slotW * (i + 0.5);
    const top1 = padT + plotH * (1 - p.totalDebt / niceMax);
    const top2 = Number.isFinite(p.netDebt) ? padT + plotH * (1 - Math.max(0, p.netDebt) / niceMax) : padT + plotH;

    // Barra 1: Deuda Normal
    parts.push(`<rect x="${(cx - groupW / 2).toFixed(1)}" y="${top1.toFixed(1)}" width="${barW.toFixed(1)}" height="${(padT + plotH - top1).toFixed(1)}" rx="2" fill="#1e40af"/>`);
    parts.push(`<text x="${(cx - groupW / 2 + barW / 2).toFixed(1)}" y="${(top1 - 3).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="700" fill="#1e40af">${Math.round(p.totalDebt)}M</text>`);

    // Barra 2: Deuda Neta
    if (Number.isFinite(p.netDebt)) {
      parts.push(`<rect x="${(cx - groupW / 2 + barW + 4).toFixed(1)}" y="${top2.toFixed(1)}" width="${barW.toFixed(1)}" height="${(padT + plotH - top2).toFixed(1)}" rx="2" fill="#d97706"/>`);
      parts.push(`<text x="${(cx - groupW / 2 + barW + 4 + barW / 2).toFixed(1)}" y="${(top2 - 3).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="700" fill="#d97706">${Math.round(p.netDebt)}M</text>`);
    }

    // Año
    parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH + 13).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#334155">${p.year}</text>`);

    // Variación vs año anterior de cada barra (verde si bajó la deuda, rojo si subió)
    const deltaY = padT + plotH + 24;
    if (p.deltaTotalDebt != null) {
      const dColor = p.deltaTotalDebt < 0 ? '#16a34a' : '#dc2626';
      const dSign = p.deltaTotalDebt > 0 ? '+' : '';
      parts.push(`<text x="${(cx - groupW / 2 + barW / 2).toFixed(1)}" y="${deltaY.toFixed(1)}" text-anchor="middle" font-size="6.5" font-weight="700" fill="${dColor}">${dSign}${Math.round(p.deltaTotalDebt)}M</text>`);
    }
    if (p.deltaNetDebt != null) {
      const dColor = p.deltaNetDebt < 0 ? '#16a34a' : '#dc2626';
      const dSign = p.deltaNetDebt > 0 ? '+' : '';
      parts.push(`<text x="${(cx - groupW / 2 + barW + 4 + barW / 2).toFixed(1)}" y="${deltaY.toFixed(1)}" text-anchor="middle" font-size="6.5" font-weight="700" fill="${dColor}">${dSign}${Math.round(p.deltaNetDebt)}M</text>`);
    }
  });

  return `<svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(chart.title)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}

export function renderHtmlDebtHistoryChart(chart) {
  if (!chart || !Array.isArray(chart.points) || !chart.points.length) return '';
  return `<div class="shares-chart"><div class="sc-title">${escapeHtml(chart.title)}</div>${renderDebtHistorySvg(chart)}</div>`;
}

function tokenizeNumbers(text) {
  const str = String(text ?? '');
  const parts = [];
  const regex = /([~±\-+]\s*)?\d[\d.,]*\s*(?:M|%|\$)?/g;
  let last = 0;
  let m;
  while ((m = regex.exec(str)) !== null) {
    if (m.index > last) parts.push({ text: str.slice(last, m.index), number: false });
    parts.push({ text: m[0], number: true });
    last = m.index + m[0].length;
  }
  if (last < str.length) parts.push({ text: str.slice(last), number: false });
  return parts.length ? parts : [{ text: str, number: false }];
}

function highlightNumbersHtml(text) {
  return tokenizeNumbers(text).map((seg) => (seg.number ? `<strong>${escapeHtml(seg.text)}</strong>` : escapeHtml(seg.text))).join('');
}

function renderHtmlTable(table) {
  const thead = table.headers.map((h) => {
    const style = h.bg
      ? `background:${h.bg};color:${h.color};`
      : `background:${COLORS.headerBg};color:${COLORS.headerColor};`;
    return `<th style="${style}${h.bold ? 'font-weight:700;' : ''}">${escapeHtml(h.text)}</th>`;
  }).join('');
  const tbody = table.rows.map((row) => `<tr>${row.map((c) => {
    const style = [
      c.bg ? `background:${c.bg};` : '',
      c.color ? `color:${c.color};` : '',
      c.bold ? 'font-weight:700;' : '',
    ].join('');
    return `<td${style ? ` style="${style}"` : ''}>${escapeHtml(c.text)}</td>`;
  }).join('')}</tr>`).join('');
  return `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

export function buildReportHtml(report) {
  const model = buildReportModel(report);
  const body = model.horizons.map((horizon) => `
  <section class="horizon">
    <h2>${escapeHtml(horizon.label)}</h2>
    ${horizon.sections.map((section) => `
    <h3>${escapeHtml(section.title)}</h3>
    ${section.table ? renderHtmlTable(section.table) : ''}
    ${section.extras?.length ? `<p class="extras">${escapeHtml(section.extras.join('  ·  '))}</p>` : ''}
    ${section.verification ? `<p class="extras">${escapeHtml(section.verification)}</p>` : ''}
    ${renderHtmlNotes(section.notes)}
    <hr>
    `).join('')}
  </section>`).join('');

  const conclusionHtml = model.conclusion ? `
  <section class="conclusion" style="page-break-before:always;margin-top:20pt;">
    <h2 style="font-size:13pt;margin:0 0 4pt;">${escapeHtml(model.conclusion.title)}</h2>
    <p style="color:${COLORS.muted};font-size:9.5pt;margin:0 0 12pt;">${escapeHtml(model.conclusion.subtitle)}</p>
    ${model.conclusion.cards.map((card) => `
    <div style="border:1px solid ${COLORS.rule};border-radius:6px;padding:10pt 12pt;margin-bottom:12pt;background:#fff;">
      <h3 style="margin:0 0 6pt;font-size:11pt;color:${COLORS.ink};">${escapeHtml(card.title)}</h3>
      ${card.highlight && card.text ? `<p style="font-size:9pt;line-height:1.5;margin:4pt 0 8pt;color:#374151;">${highlightNumbersHtml(card.text).replaceAll('\n', '<br>')}</p>` : (card.text ? `<p style="font-size:9pt;line-height:1.5;margin:4pt 0 8pt;color:#374151;">${escapeHtml(card.text).replaceAll('\n', '<br>')}</p>` : '')}
      ${card.badges?.length ? `<ul style="font-size:8.5pt;color:#854d0e;padding-left:14pt;margin:4pt 0 8pt;">${card.highlight ? card.badges.map((b) => `<li>${highlightNumbersHtml(b)}</li>`).join('') : card.badges.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
      ${card.chart ? renderHtmlSharesChart(card.chart) : ''}
      ${card.debtMaturityChart ? renderHtmlDebtMaturityChart(card.debtMaturityChart) : ''}
      ${card.debtHistoryChart ? renderHtmlDebtHistoryChart(card.debtHistoryChart) : ''}
      ${card.isWatchlist && card.items?.length ? `<ul style="font-size:8.5pt;color:#16a34a;padding-left:14pt;margin:4pt 0 8pt;list-style:none;">${card.items.map((it) => `<li>✓ <span style="color:#374151;">${escapeHtml(it)}</span></li>`).join('')}</ul>` : ''}
      ${card.table ? `
        <div style="margin-top:8pt;border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
          <div style="padding:4pt 8pt;background:#f1f5f9;font-size:8pt;font-weight:700;color:#475569;">${escapeHtml(card.table.title)} ${card.table.summary ? `<span style="font-style:italic;color:#64748b;margin-left:8pt;">${escapeHtml(card.table.summary)}</span>` : ''}</div>
          ${renderHtmlTable(card.table)}
        </div>
      ` : ''}
    </div>`).join('')}
  </section>` : '';

  const ratingHtml = model.rating ? `
  <section style="margin:16pt 0;padding:14pt 18pt;border:2px solid ${model.rating.score >= 7 ? '#16a34a' : (model.rating.score >= 4 ? '#ca8a04' : '#dc2626')};border-radius:6px;background:${model.rating.score >= 7 ? '#f0fdf4' : (model.rating.score >= 4 ? '#fefce8' : '#fef2f2')};">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:12pt;font-weight:800;text-transform:uppercase;color:#0f172a;">${escapeHtml(model.rating.label)}</span>
      <span style="font-size:22pt;font-weight:900;color:#0f172a;">${model.rating.score} <small style="font-size:12pt;color:#64748b;">/ 10</small></span>
    </div>
    <p style="font-size:9.5pt;color:#1e293b;margin:6pt 0 4pt;font-weight:500;">${escapeHtml(model.rating.rationale)}</p>
    <p style="font-size:7.5pt;color:#64748b;font-style:italic;margin:4pt 0 0;">${escapeHtml(model.rating.disclaimer)}</p>
  </section>` : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model.company)}${model.periodTitle ? ` — ${escapeHtml(model.periodTitle)}` : ''}</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; color: ${COLORS.ink}; margin: 32px auto; max-width: 720pt; padding: 0 16px; }
  h1 { font-size: 18pt; margin: 0; }
  .ticker { font-size: 10pt; color: ${COLORS.ticker}; margin: 4pt 0; }
  .period { font-size: 12pt; font-weight: 700; color: ${COLORS.period}; margin: 4pt 0 8pt; }
  hr { border: 0; border-top: 1px solid ${COLORS.rule}; margin: 10pt 0; }
  .horizon h2 { font-size: 13pt; margin: 0 0 8pt; page-break-before: always; }
  .horizon:first-of-type h2 { page-break-before: avoid; }
  .horizon h3 { font-size: 10pt; margin: 12pt 0 6pt; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 6pt; }
  th { font-size: 7.5pt; text-align: left; padding: 4pt 4pt; }
  td { font-size: 7.5pt; padding: 4pt 4pt; color: ${COLORS.ink}; }
  td:first-child { font-weight: 700; }
  tbody tr:nth-child(odd) td { background: ${COLORS.stripe}; }
  .extras { font-size: 8pt; font-weight: 700; margin: 4pt 0 0; }
  .notes { font-size: 7.5pt; color: ${COLORS.noteText}; padding-left: 14pt; margin: 4pt 0 0; }
  .notes li { margin: 2pt 0; }
  footer { font-size: 8pt; color: ${COLORS.soft}; margin-top: 16pt; }
  .shares-chart { margin: 8pt 0 10pt; padding: 8pt 10pt; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
  .sc-title { font-size: 8.5pt; font-weight: 700; color: #475569; margin-bottom: 4pt; }
  .sc-svg { width: 100%; height: auto; display: block; }
  strong { color: inherit; }
</style>
</head>
<body>
<h1>${escapeHtml(model.company)}</h1>
${model.ticker ? `<p class="ticker">${escapeHtml(model.ticker)}</p>` : ''}
${model.periodTitle ? `<p class="period">${escapeHtml(model.periodTitle)}</p>` : ''}
<hr>
${body}
${conclusionHtml}
${ratingHtml}
<footer>${escapeHtml(model.footer)}</footer>
</body>
</html>`;
}

/* ── DOCX (Word) ────────────────────────────────────────────────────── */

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

const hex = (color) => String(color ?? '').replace('#', '').toUpperCase();

function docxRun(text, { size, bold, italic, color, highlight } = {}) {
  const rPr = [
    bold ? '<w:b/>' : '',
    italic ? '<w:i/>' : '',
    color ? `<w:color w:val="${hex(color)}"/>` : '',
    highlight ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(highlight)}"/>` : '',
    size ? `<w:sz w:val="${Math.round(size * 2)}"/>` : '',
  ].join('');
  return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function docxParagraph(text, opts = {}) {
  const pPr = `${opts.pageBreakBefore ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 40}"/>`;
  return `<w:p><w:pPr>${pPr}</w:pPr>${docxRun(text, opts)}</w:p>`;
}

function docxRichParagraph(text, opts = {}) {
  const pPr = `${opts.pageBreakBefore ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 40}"/>`;
  const runs = tokenizeNumbers(text).map((seg) => docxRun(seg.text, {
    size: opts.size ?? 8.5,
    bold: seg.number ? true : (opts.bold ?? false),
    italic: opts.italic,
    color: seg.number ? '#0f172a' : (opts.color ?? COLORS.ink),
  })).join('');
  return `<w:p><w:pPr>${pPr}</w:pPr>${runs}</w:p>`;
}

function docxTable(table) {
  const totalRelative = table.widths.reduce((a, b) => a + b, 0);
  const available = 10466; // A4 (11906) menos márgenes (2 × 720)
  const colWidths = table.widths.map((w) => Math.max(600, Math.round((w / totalRelative) * available)));

  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${hex(COLORS.rule)}"/>`)
    .join('');

  const headerRow = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${table.headers.map((h, i) => `
  <w:tc><w:tcPr><w:tcW w:w="${colWidths[i]}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${hex(h.bg ?? COLORS.headerBg)}"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${docxRun(h.text, { size: 7.5, bold: true, color: h.color ?? COLORS.headerColor })}</w:p></w:tc>`).join('')}</w:tr>`;

  const bodyRows = table.rows.map((row) => `<w:tr>${row.map((c, i) => `
  <w:tc><w:tcPr><w:tcW w:w="${colWidths[i]}" w:type="dxa"/>${c.bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(c.bg)}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${docxRun(c.text, { size: 7.5, bold: c.bold, color: c.color ?? COLORS.ink })}</w:p></w:tc>`).join('')}</w:tr>`).join('');

  return `<w:tbl><w:tblPr><w:tblW w:w="${available}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${colWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${headerRow}${bodyRows}</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`;
}

function docxNotes(notes) {
  return (notes ?? []).map((note) => {
    if (note.marker) {
      return `<w:p><w:pPr><w:spacing w:before="0" w:after="40"/></w:pPr>${docxRun(note.marker, { size: 7.5, bold: true, color: note.color, highlight: note.bg })}${docxRun(` ${note.text}`, { size: 7.5, color: COLORS.noteText })}</w:p>`;
    }
    return `<w:p><w:pPr><w:spacing w:before="0" w:after="40"/></w:pPr>${docxRun(note.text, { size: 7.5, italic: true, color: note.color })}</w:p>`;
  }).join('');
}

function buildDocxXml(model) {
  const parts = [];
  parts.push(docxParagraph(model.company, { size: 18, bold: true, color: COLORS.ink, after: 60 }));
  if (model.ticker) parts.push(docxParagraph(model.ticker, { size: 10, color: COLORS.ticker, after: 40 }));
  if (model.periodTitle) parts.push(docxParagraph(model.periodTitle, { size: 12, bold: true, color: COLORS.period, after: 80 }));

  model.horizons.forEach((horizon, hIndex) => {
    parts.push(docxParagraph(horizon.label, { size: 13, bold: true, color: COLORS.ink, after: 80, pageBreakBefore: hIndex > 0 }));
    horizon.sections.forEach((section, sIndex) => {
      parts.push(docxParagraph(section.title, { size: 10, bold: true, color: COLORS.ink, after: 60 }));
      if (section.table) parts.push(docxTable(section.table));
      if (section.extras?.length) parts.push(docxParagraph(section.extras.join('  ·  '), { size: 8, bold: true, color: COLORS.ink, before: 40 }));
      if (section.verification) parts.push(docxParagraph(section.verification, { size: 8, bold: true, color: COLORS.ink, before: 40 }));
      parts.push(docxNotes(section.notes));
      if (sIndex < horizon.sections.length - 1) {
        parts.push(docxParagraph('', { size: 8, color: COLORS.rule, after: 40 }));
      }
    });
  });

  if (model.conclusion) {
    parts.push(docxParagraph(model.conclusion.title, { size: 14, bold: true, color: COLORS.ink, after: 40, pageBreakBefore: true }));
    if (model.conclusion.subtitle) {
      parts.push(docxParagraph(model.conclusion.subtitle, { size: 9, italic: true, color: COLORS.muted, after: 80 }));
    }
    model.conclusion.cards.forEach((card) => {
      parts.push(docxParagraph(card.title, { size: 11, bold: true, color: COLORS.ink, after: 40, before: 60 }));
      if (card.text) {
        if (card.highlight) {
          parts.push(docxRichParagraph(card.text, { size: 8.5, color: COLORS.ink, after: 40 }));
        } else {
          parts.push(docxParagraph(card.text, { size: 8.5, color: COLORS.ink, after: 40 }));
        }
      }
      if (card.badges?.length) {
        if (card.highlight) {
          card.badges.forEach((b) => parts.push(docxRichParagraph(`• ${b}`, { size: 8, bold: true, color: '#854D0E', after: 20 })));
        } else {
          card.badges.forEach((b) => parts.push(docxParagraph(`• ${b}`, { size: 8, bold: true, color: '#854D0E', after: 20 })));
        }
      }
      if (card.chart) {
        const chartTable = buildSharesChartTable(card.chart);
        if (chartTable) {
          parts.push(docxParagraph(card.chart.title, { size: 8, bold: true, color: '#475569', after: 40 }));
          parts.push(docxTable(chartTable));
        }
      }
      if (card.debtMaturityChart) {
        const matTable = buildDebtMaturityTable(card.debtMaturityChart);
        if (matTable) {
          parts.push(docxParagraph(card.debtMaturityChart.title, { size: 8, bold: true, color: '#475569', after: 40, before: 60 }));
          parts.push(docxTable(matTable));
        }
      }
      if (card.debtHistoryChart) {
        const histTable = buildDebtHistoryTable(card.debtHistoryChart);
        if (histTable) {
          parts.push(docxParagraph(card.debtHistoryChart.title, { size: 8, bold: true, color: '#475569', after: 40, before: 60 }));
          parts.push(docxTable(histTable));
        }
      }
      if (card.isWatchlist && card.items?.length) {
        card.items.forEach((it) => parts.push(docxParagraph(`✓ ${it}`, { size: 8, color: COLORS.ink, after: 20 })));
      }
      if (card.table) {
        parts.push(docxParagraph(card.table.title, { size: 8, bold: true, color: '#475569', after: 20, before: 40 }));
        parts.push(docxTable(card.table));
      }
    });
  }

  if (model.rating) {
    parts.push(docxParagraph(`${model.rating.label}  (${model.rating.score} / 10)`, { size: 13, bold: true, color: COLORS.ink, after: 40, before: 100 }));
    parts.push(docxParagraph(model.rating.rationale, { size: 9, color: COLORS.ink, after: 40 }));
    parts.push(docxParagraph(model.rating.disclaimer, { size: 7.5, italic: true, color: COLORS.muted, after: 60 }));
  }

  parts.push(docxParagraph(model.footer, { size: 8, color: COLORS.soft, before: 120 }));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parts.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
}

export async function buildReportDocx(report) {
  const model = buildReportModel(report);
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  const word = zip.folder('word');
  word.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  word.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Helvetica" w:hAnsi="Helvetica"/><w:sz w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`);
  word.file('document.xml', buildDocxXml(model));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/* ── ODT (OpenDocument / LibreOffice) ───────────────────────────────── */

function odtEsc(value) {
  return esc(value);
}

function createOdtStyleRegistry() {
  const textStyles = new Map();
  const cellStyles = new Map();
  const columnStyles = new Map();

  const textStyleFor = ({ bold, italic, color, size }) => {
    const key = `${bold ? 'b' : ''}${italic ? 'i' : ''}|${color ?? 'auto'}|${size ?? 7.5}`;
    if (!textStyles.has(key)) {
      const name = `T${textStyles.size + 1}`;
      const props = [
        color ? `fo:color="${color}"` : '',
        bold ? 'fo:font-weight="bold" style:font-weight-asian="bold"' : '',
        italic ? 'fo:font-style="italic"' : '',
        size ? `fo:font-size="${size}pt"` : '',
      ].filter(Boolean).join(' ');
      textStyles.set(key, { name, props });
    }
    return textStyles.get(key).name;
  };

  const cellStyleFor = (bg) => {
    const key = bg ?? 'none';
    if (!cellStyles.has(key)) {
      const name = `C${cellStyles.size + 1}`;
      const props = [
        bg ? `fo:background-color="${bg}"` : 'fo:background-color="transparent"',
        'fo:border="0.5pt solid #d1d5db"',
        'fo:padding="0.028in"',
      ].join(' ');
      cellStyles.set(key, { name, props });
    }
    return cellStyles.get(key).name;
  };

  const columnStyleFor = (widthIn) => {
    const key = widthIn.toFixed(3);
    if (!columnStyles.has(key)) {
      const name = `W${columnStyles.size + 1}`;
      columnStyles.set(key, { name, props: `style:column-width="${key}in"` });
    }
    return columnStyles.get(key).name;
  };

  const automaticStyles = () => {
    const texts = [...textStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="text"><style:text-properties ${s.props}/></style:style>`).join('');
    const cells = [...cellStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="table-cell"><style:table-cell-properties ${s.props}/></style:style>`).join('');
    const columns = [...columnStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="table-column"><style:table-column-properties ${s.props}/></style:style>`).join('');
    return `${texts}${cells}${columns}<style:style style:name="PBreak" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:break-before="page"/></style:style><style:style style:name="PBody" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0.02in" fo:margin-bottom="0.04in"/></style:style><style:style style:name="TReport" style:family="table"><style:table-properties style:width="6.69in" table:align="left"/></style:style>`;
  };

  return { textStyleFor, cellStyleFor, columnStyleFor, automaticStyles };
}

function buildOdtContent(model) {
  const styles = createOdtStyleRegistry();
  const body = [];
  let tableCount = 0;

  const paragraph = (text, opts = {}) => {
    const styleName = styles.textStyleFor({ bold: opts.bold, italic: opts.italic, color: opts.color, size: opts.size });
    const pStyle = opts.pageBreakBefore ? 'PBreak' : 'PBody';
    body.push(`<text:p text:style-name="${pStyle}"><text:span text:style-name="${styleName}">${odtEsc(text)}</text:span></text:p>`);
  };

  const richParagraph = (text, opts = {}) => {
    const pStyle = opts.pageBreakBefore ? 'PBreak' : 'PBody';
    const spans = tokenizeNumbers(text).map((seg) => {
      const styleName = styles.textStyleFor({
        bold: seg.number ? true : (opts.bold ?? false),
        italic: opts.italic,
        color: seg.number ? '#0f172a' : (opts.color ?? COLORS.ink),
        size: opts.size,
      });
      return `<text:span text:style-name="${styleName}">${odtEsc(seg.text)}</text:span>`;
    }).join('');
    body.push(`<text:p text:style-name="${pStyle}">${spans}</text:p>`);
  };

  const notes = (list) => {
    (list ?? []).forEach((note) => {
      if (note.marker) {
        const markerStyle = styles.textStyleFor({ bold: true, color: note.color, size: 7.5 });
        const textStyle = styles.textStyleFor({ color: COLORS.noteText, size: 7.5 });
        body.push(`<text:p text:style-name="PBody"><text:span text:style-name="${markerStyle}">${odtEsc(note.marker)}</text:span><text:span text:style-name="${textStyle}"> ${odtEsc(note.text)}</text:span></text:p>`);
      } else {
        paragraph(note.text, { italic: true, color: note.color, size: 7.5 });
      }
    });
  };

  const table = (sectionTable) => {
    tableCount += 1;
    const totalRelative = sectionTable.widths.reduce((a, b) => a + b, 0);
    const availableIn = 6.69;
    const colWidths = sectionTable.widths.map((w) => Math.max(0.5, (w / totalRelative) * availableIn));

    const colsXml = colWidths.map((w) => `<table:table-column table:style-name="${styles.columnStyleFor(w)}"/>`).join('');
    const headerRow = `<table:table-row>${sectionTable.headers.map((h, i) => `<table:table-cell table:style-name="${styles.cellStyleFor(h.bg ?? COLORS.headerBg)}"><text:p text:style-name="PBody"><text:span text:style-name="${styles.textStyleFor({ bold: true, color: h.color ?? COLORS.headerColor, size: 7.5 })}">${odtEsc(h.text)}</text:span></text:p></table:table-cell>`).join('')}</table:table-row>`;
    const bodyRows = sectionTable.rows.map((row) => `<table:table-row>${row.map((c, i) => `<table:table-cell table:style-name="${styles.cellStyleFor(c.bg)}"><text:p text:style-name="PBody"><text:span text:style-name="${styles.textStyleFor({ bold: c.bold, color: c.color ?? COLORS.ink, size: 7.5 })}">${odtEsc(c.text)}</text:span></text:p></table:table-cell>`).join('')}</table:table-row>`).join('');

    body.push(`<table:table table:name="Tabla${tableCount}" table:style-name="TReport">${colsXml}${headerRow}${bodyRows}</table:table>`);
    body.push('<text:p text:style-name="PBody"/>');
  };

  paragraph(model.company, { bold: true, color: COLORS.ink, size: 18 });
  if (model.ticker) paragraph(model.ticker, { color: COLORS.ticker, size: 10 });
  if (model.periodTitle) paragraph(model.periodTitle, { bold: true, color: COLORS.period, size: 12 });

  model.horizons.forEach((horizon, hIndex) => {
    paragraph(horizon.label, { bold: true, color: COLORS.ink, size: 13, pageBreakBefore: hIndex > 0 });
    horizon.sections.forEach((section) => {
      paragraph(section.title, { bold: true, color: COLORS.ink, size: 10 });
      if (section.table) table(section.table);
      if (section.extras?.length) paragraph(section.extras.join('  ·  '), { bold: true, color: COLORS.ink, size: 8 });
      if (section.verification) paragraph(section.verification, { bold: true, color: COLORS.ink, size: 8 });
      notes(section.notes);
    });
  });

  if (model.conclusion) {
    paragraph(model.conclusion.title, { bold: true, color: COLORS.ink, size: 14, pageBreakBefore: true });
    if (model.conclusion.subtitle) {
      paragraph(model.conclusion.subtitle, { italic: true, color: COLORS.muted, size: 9 });
    }
    model.conclusion.cards.forEach((card) => {
      paragraph(card.title, { bold: true, color: COLORS.ink, size: 11 });
      if (card.text) {
        if (card.highlight) {
          richParagraph(card.text, { color: COLORS.ink, size: 8.5 });
        } else {
          paragraph(card.text, { color: COLORS.ink, size: 8.5 });
        }
      }
      if (card.badges?.length) {
        if (card.highlight) {
          card.badges.forEach((b) => richParagraph(`• ${b}`, { bold: true, color: '#854d0e', size: 8 }));
        } else {
          card.badges.forEach((b) => paragraph(`• ${b}`, { bold: true, color: '#854d0e', size: 8 }));
        }
      }
      if (card.chart) {
        const chartTable = buildSharesChartTable(card.chart);
        if (chartTable) {
          paragraph(card.chart.title, { bold: true, color: '#475569', size: 8 });
          table(chartTable);
        }
      }
      if (card.debtMaturityChart) {
        const matTable = buildDebtMaturityTable(card.debtMaturityChart);
        if (matTable) {
          paragraph(card.debtMaturityChart.title, { bold: true, color: '#475569', size: 8 });
          table(matTable);
        }
      }
      if (card.debtHistoryChart) {
        const histTable = buildDebtHistoryTable(card.debtHistoryChart);
        if (histTable) {
          paragraph(card.debtHistoryChart.title, { bold: true, color: '#475569', size: 8 });
          table(histTable);
        }
      }
      if (card.isWatchlist && card.items?.length) {
        card.items.forEach((it) => paragraph(`✓ ${it}`, { color: COLORS.ink, size: 8 }));
      }
      if (card.table) {
        paragraph(card.table.title, { bold: true, color: '#475569', size: 8 });
        table(card.table);
      }
    });
  }

  if (model.rating) {
    paragraph(`${model.rating.label} (${model.rating.score} / 10)`, { bold: true, color: COLORS.ink, size: 13 });
    paragraph(model.rating.rationale, { color: COLORS.ink, size: 9 });
    paragraph(model.rating.disclaimer, { italic: true, color: COLORS.muted, size: 7.5 });
  }

  paragraph(model.footer, { color: COLORS.soft, size: 8 });

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"><office:automatic-styles>${styles.automaticStyles()}</office:automatic-styles><office:body><office:text>${body.join('')}</office:text></office:body></office:document-content>`;
}

export async function buildReportOdt(report) {
  const model = buildReportModel(report);
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>`);
  zip.file('styles.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"><office:styles><style:default-style style:family="paragraph"><style:text-properties fo:font-size="10pt" style:font-name="Helvetica"/></style:default-style></office:styles></office:document-styles>`);
  zip.file('content.xml', buildOdtContent(model));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
