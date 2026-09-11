import JSZip from 'jszip';
import { Resvg } from '@resvg/resvg-js';
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
  // Igual que el PDF: nunca se imprimen los marcadores de negrita del markdown.
  return String(value)
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/\*\*/g, '')
    .replaceAll('−', '-');
}

/* ── Texto enriquecido: markdown (**negrita**) + autodetección de cifras ──
   Port fiel de parseMarkdownAndNumbers del PDF para que los cuatro formatos
   resalten exactamente las mismas palabras y cifras. */

function parseRichSegments(text) {
  if (!text) return [];
  const str = String(text);
  const rawParts = str.split(/(\*\*.*?\*\*)/g).filter(Boolean);
  const result = [];

  for (const part of rawParts) {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      result.push({ text: part.slice(2, -2), bold: true });
    } else {
      const autoRegex = /(\bflat\s*(?:[±+\-/]+|\+\/-)\s*\d+(?:[\.,]\d+)?\s*%?|\b[~±+\-]?\s*\$?\d+(?:[\.,]\d+)?\s*(?:M|B|k|%)?\s*(?:al?|to|-)\s*[~±+\-]?\s*\$?\d+(?:[\.,]\d+)?\s*(?:M|B|k|%|\$|€)?|[~±+\-]?\s*\$?\d+(?:[\.,]\d+)*\s*(?:M|B|k|%|\$|€)(?:\s*(?:[±+\-/]+|\+\/-)\s*\d+(?:[\.,]\d+)?\s*%)?|\b20\d\d\s*-\s*20\d\d\b)/gi;
      let last = 0;
      let m;
      while ((m = autoRegex.exec(part)) !== null) {
        if (m.index > last) {
          result.push({ text: part.slice(last, m.index), bold: false });
        }
        result.push({ text: m[0], bold: true });
        last = m.index + m[0].length;
      }
      if (last < part.length) {
        result.push({ text: part.slice(last), bold: false });
      }
    }
  }

  const merged = [];
  for (const seg of result) {
    if (!seg.text) continue;
    if (merged.length && merged[merged.length - 1].bold === seg.bold) {
      merged[merged.length - 1].text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
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
  if (hasComma && hasDot) {
    // El separador decimal es el que aparece más a la derecha; el otro separa millares
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(/,/g, '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length > 2) {
      s = parts.join(''); // 12,906,851 → 12906851
    } else if (parts[1]?.length === 3) {
      s = parts.join(''); // 2,000 → 2000 (millares en formato EE. UU.)
    } else {
      s = s.replace(',', '.');
    }
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) s = parts.join('');
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

// Colores de los segmentos dentro de cada barra apilada del calendario de vencimientos
const DEBT_STACK_PALETTE = [
  { fill: '#f59e0b', text: '#ffffff' }, // Naranja
  { fill: '#0ea5e9', text: '#ffffff' }, // Azul
  { fill: '#7c3aed', text: '#ffffff' }, // Morado
  { fill: '#10b981', text: '#ffffff' }, // Verde
  { fill: '#ef4444', text: '#ffffff' }, // Rojo
];

// Tipo de interés medio ponderado de TODA la deuda a partir de la tabla oficial de deuda
// (cada fila con su cupón en el texto y su saldo en la columna del ejercicio más reciente).
function rateFromSecSnippet(snippet) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return null;
  const headers = Array.isArray(snippet.headers) ? snippet.headers : [];
  let balanceIdx = -1;
  let bestYear = -Infinity;
  headers.forEach((header, index) => {
    const match = String(header).match(/(20\d\d)/);
    if (match) {
      const year = Number(match[1]);
      if (year > bestYear) {
        bestYear = year;
        balanceIdx = index;
      }
    }
  });
  if (balanceIdx < 0) balanceIdx = headers.length >= 3 ? 2 : 1;
  let totalAmount = 0;
  let weighted = 0;
  let estimated = false;
  snippet.rows.forEach((row) => {
    const cells = Array.isArray(row) ? row : [row?.metric ?? row?.name, row?.value];
    const rowText = cells.join(' ');
    const rateMatches = [...rowText.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)]
      .map((match) => Number(String(match[1]).replace(',', '.')))
      .filter((rate) => Number.isFinite(rate) && rate > 0);
    if (!rateMatches.length) return;
    // Una fila con dos tipos es un rango de cupón (mín-máx): se pondera por su punto medio.
    const rate = rateMatches.length >= 2
      ? (Math.min(...rateMatches) + Math.max(...rateMatches)) / 2
      : rateMatches[0];
    if (rateMatches.length >= 2) estimated = true;
    const balance = parseSecNumber(cells[balanceIdx]);
    if (!Number.isFinite(balance) || balance <= 0) return;
    totalAmount += balance;
    weighted += balance * rate;
  });
  if (totalAmount <= 0) return null;
  return { rate: weighted / totalAmount, amount: totalAmount, estimated };
}

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

  // Tipo de interés medio de TODA la deuda: se ponderan todos los tramos con tipo conocido
  // (incluidos los posteriores al año 5) y, si la tabla oficial cubre más deuda, esa manda.
  // Si el informe no desglosa cupones, el sistema aporta un tipo medio estimado.
  const allRatedItems = rawItems.filter((it) => Number.isFinite(it.interestRate) && it.interestRate > 0);
  const allRatedAmount = allRatedItems.reduce((sum, it) => sum + it.amount, 0);
  const itemsAverageRate = allRatedAmount > 0
    ? allRatedItems.reduce((sum, it) => sum + it.amount * it.interestRate, 0) / allRatedAmount
    : null;
  const snippetAverage = rateFromSecSnippet(debt.secSnippet);
  const fallbackRateRaw = parseSecNumber(debt.allDebtAverageRate);
  const fallbackRate = Number.isFinite(fallbackRateRaw) && fallbackRateRaw > 0 ? fallbackRateRaw : null;

  let totalAverageRate = null;
  let totalAverageRateEstimated = false;
  if (snippetAverage && snippetAverage.amount > allRatedAmount) {
    totalAverageRate = snippetAverage.rate;
    totalAverageRateEstimated = snippetAverage.estimated === true;
  } else if (itemsAverageRate != null) {
    totalAverageRate = itemsAverageRate;
  } else if (fallbackRate != null) {
    totalAverageRate = fallbackRate;
    totalAverageRateEstimated = true;
  }

  // Agrupar por año: siempre los 5 ejercicios de la ventana
  const yearsMap = new Map();
  filtered.forEach((it) => {
    if (!yearsMap.has(it.year)) yearsMap.set(it.year, []);
    yearsMap.get(it.year).push(it);
  });

  const groupedYears = [];
  for (let yr = minYear; yr <= maxYear; yr += 1) {
    // Se apilan los vencimientos del año de mayor a menor importe, con un color por segmento
    const items = (yearsMap.get(yr) ?? []).slice().sort((a, b) => b.amount - a.amount);
    items.forEach((it, index) => {
      const paletteItem = DEBT_STACK_PALETTE[index % DEBT_STACK_PALETTE.length];
      it.color = paletteItem.fill;
      it.textColor = paletteItem.text;
    });
    const totalAmount = items.reduce((sum, it) => sum + it.amount, 0);
    const ratedItems = items.filter((it) => Number.isFinite(it.interestRate) && it.interestRate > 0);
    const ratedAmount = ratedItems.reduce((sum, it) => sum + it.amount, 0);
    const averageRate = ratedAmount > 0
      ? ratedItems.reduce((sum, it) => sum + it.amount * it.interestRate, 0) / ratedAmount
      : null;
    // Si el informe solo publica el importe agregado de vencimientos sin cupón por emisión,
    // cada barra se queda sin tipo (nunca se repite el tipo medio estimado en todas las barras).
    groupedYears.push({
      year: yr,
      totalAmount,
      averageRate,
      averageRateEstimated: false,
      items,
    });
  }

  const totalAmount = filtered.reduce((sum, it) => sum + it.amount, 0);

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
    totalAverageRateEstimated,
    afterYearFive: Number.isFinite(afterYearFive) ? afterYearFive : null,
    maxYearAmount,
    hasRates: allRatedAmount > 0 || snippetAverage != null || fallbackRate != null,
  };
}

// ¿Hay adquisiciones/desinversiones materiales (≥ 50M$)? Si no, la sección 4 se omite.
export function buildAcquisitionsModel(report) {
  const rows = report?.horizons?.[0]?.capital?.rows ?? [];
  const readValue = (needles) => {
    for (const row of rows) {
      const name = String(row?.name ?? '').toLowerCase();
      if (!needles.some((needle) => name.includes(needle))) continue;
      const raw = Array.isArray(row?.values) ? row.values[0] : row?.value;
      const num = parseSecNumber(raw);
      if (Number.isFinite(num)) return num;
    }
    return null;
  };
  const acquisitions = readValue(['adquisic', 'acquisit']);
  const divestitures = readValue(['desinvers', 'divestit']);
  const text = String(report?.conclusion?.acquisitions?.text ?? '');
  const saysNone = /no se realizaron|no hubo|no material|sin adquisiciones|no acquisitions|no se produjeron|none/i.test(text);
  const material = (Number.isFinite(acquisitions) && Math.abs(acquisitions) >= 50)
    || (Number.isFinite(divestitures) && Math.abs(divestitures) >= 50)
    || (text.trim().length > 0 && !saysNone);
  return {
    acquisitions: acquisitions ?? 0,
    divestitures: divestitures ?? 0,
    material,
  };
}

// Serie de dividendos + payout sobre BPA ajustado. Solo se genera si hay un cambio relevante.
export function buildDividendModel(report) {
  const div = report?.conclusion?.dividends ?? null;
  const rawHistory = (Array.isArray(div?.history) && div.history.length)
    ? div.history
    : (Array.isArray(report?.edgarDividendHistory) ? report.edgarDividendHistory : []);
  const points = rawHistory
    .map((point) => ({
      year: Number(point?.year),
      dps: parseSecNumber(point?.dps),
      total: parseSecNumber(point?.total),
      adjustedEps: parseSecNumber(point?.adjustedEps),
      eps: parseSecNumber(point?.eps),
    }))
    .filter((point) => Number.isFinite(point.year) && Number.isFinite(point.dps) && point.dps > 0)
    .sort((a, b) => a.year - b.year)
    .slice(-5);
  if (points.length < 2) return null;

  points.forEach((point) => {
    const adjusted = Number.isFinite(point.adjustedEps) && point.adjustedEps > 0 ? point.adjustedEps : null;
    const reported = Number.isFinite(point.eps) && point.eps > 0 ? point.eps : null;
    const eps = adjusted ?? reported;
    point.epsUsed = eps;
    point.epsIsAdjusted = adjusted != null;
    point.payoutPct = eps ? Math.round(((point.dps / eps) * 100) * 10) / 10 : null;
  });

  const changePct = Number.isFinite(Number(div?.changePct))
    ? Number(div.changePct)
    : (points[points.length - 2].dps > 0
      ? Math.round(((points[points.length - 1].dps - points[points.length - 2].dps) / points[points.length - 2].dps) * 1000) / 10
      : null);
  const changeType = div?.changeType || (changePct > 0 ? 'increase' : (changePct < 0 ? 'cut' : 'unchanged'));
  const material = Number.isFinite(changePct) && Math.abs(changePct) >= 2;
  if (!div && !material) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const previous = points[points.length - 2];
  const span = last.year - first.year;
  const cagrOf = (from, to) => (span > 0 && Number.isFinite(from) && from > 0 && Number.isFinite(to) && to > 0
    ? (Math.pow(to / from, 1 / span) - 1) * 100
    : null);

  const generatedText = Number.isFinite(changePct)
    ? `El dividendo por acción ${changeType === 'cut' ? 'se recortó' : 'aumentó'} un ${Math.abs(changePct).toFixed(1).replace('.', ',')} % en ${last.year}, pasando de ${String(previous.dps).replace('.', ',')} $ a ${String(last.dps).replace('.', ',')} $.`
    : null;

  // La numeración depende de si se muestran las secciones de adquisiciones y recompras
  const acquisitionsMaterial = buildAcquisitionsModel(report).material;
  const repurchasesShown = Boolean(report?.conclusion?.repurchases);
  const dividendNumber = 3 + (repurchasesShown ? 1 : 0) + (acquisitionsMaterial ? 1 : 0);

  return {
    title: `${dividendNumber}: Dividendos`,
    text: div?.text || generatedText,
    points,
    changeType,
    changePct,
    material,
    dpsCagr: cagrOf(first.dps, last.dps),
    totalCagr: cagrOf(first.total, last.total),
    hasReportedFallback: points.some((point) => point.payoutPct != null && !point.epsIsAdjusted),
  };
}

export function buildDividendTable(chart) {
  if (!chart || !Array.isArray(chart.points) || !chart.points.length) return null;
  const headers = [
    cell('Año', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Dividendo/acción', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Dividendo total ($M)', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('BPA usado ($)', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
    cell('Payout (%)', { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg }),
  ];
  const rows = chart.points.map((point) => [
    cell(String(point.year), { bold: true, color: COLORS.ink }),
    cell(Number.isFinite(point.dps) ? `${point.dps.toFixed(2).replace('.', ',')} $` : '—', { color: COLORS.ink }),
    cell(Number.isFinite(point.total) ? `$${point.total.toFixed(1).replace('.', ',')}M` : '—', { color: COLORS.ink }),
    cell(Number.isFinite(point.epsUsed) ? `${point.epsUsed.toFixed(2).replace('.', ',')} $${point.epsIsAdjusted ? '' : ' *'}` : '—', { color: COLORS.ink }),
    cell(Number.isFinite(point.payoutPct) ? `${point.payoutPct.toFixed(1).replace('.', ',')} %` : '—', { bold: true, color: '#0f766e' }),
  ]);
  return {
    columns: ['Año', 'Dividendo/acción', 'Dividendo total ($M)', 'BPA usado ($)', 'Payout (%)'],
    widths: [60, 110, 130, 110, 105],
    headers,
    rows,
  };
}

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

  // Se combinan las fuentes por año dando prioridad a la serie oficial de EDGAR
  // (10 ejercicios completos) y rellenando huecos con la serie redactada por la IA.
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

  const points = [...byYear.values()]
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

  // CAGR del periodo completo para deuda normal y neta
  const first = points[0];
  const last = points[points.length - 1];
  const span = last.year - first.year;
  const cagr = (from, to) => (span > 0 && Number.isFinite(from) && from > 0 && Number.isFinite(to) && to > 0
    ? (Math.pow(to / from, 1 / span) - 1) * 100
    : null);
  const cagrTotalDebt = cagr(first.totalDebt, last.totalDebt);
  const cagrNetDebt = cagr(first.netDebt, last.netDebt);

  return {
    title: `EVOLUCIÓN DE LA DEUDA: NORMAL VS NETA (${first.year}–${last.year})`,
    points,
    maxVal,
    minVal,
    cagrTotalDebt,
    cagrNetDebt,
  };
}

export function buildDebtRefinancingModel(debt, report) {
  if (!debt) return null;

  let oldDebtRate = debt.refinancing?.oldDebtRate ?? null;
  let newDebtRate = debt.refinancing?.newDebtRate ?? debt.refinancing?.estimatedRefinancingRate ?? null;
  let amount = debt.refinancing?.amountRefinanced ?? debt.refinancing?.nearTermMaturities ?? null;

  const narrative = `${debt.refinancingAnalysis || ''} ${debt.refinancingImpact || ''} ${debt.text || ''}`;

  // Escenario posible (sin decisión tomada): se etiqueta como estimación y se calcula igualmente.
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

  // Vencimientos del primer ejercicio del calendario (los candidatos a refinanciar)
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
    const patterns = [
      /(?:vencen unos|vencen|nominal de|importe de|asciende a|deuda que vence[^.]{0,50}?)(?:~?\$?)([\d.,]+)\s*(?:M|mil millones|B)\b/i,
      /(?:totalizando|refinanci(?:a|ar|ando)?)[^.]{0,40}?(?:~?\$?)([\d.,]+)\s*(?:M|mil millones|B)\b/i,
      /(?:los|las)\s*~?\$?([\d.,]+)\s*(?:M|mil millones|B)\b[^.]{0,40}?(?:vencen|vencimiento|refinanci)/i,
    ];
    for (const re of patterns) {
      const m = narrative.match(re);
      if (m) {
        const parsed = parseLocaleNumber(m[1]);
        if (parsed != null) amount = /mil millones|B\b/i.test(m[0]) ? parsed * 1000 : parsed;
        break;
      }
    }
  }
  if (amount == null && possible && Number.isFinite(firstYearAmount) && firstYearAmount > 0) {
    amount = Math.round(firstYearAmount * 10) / 10;
  }

  // En un escenario posible, el tipo "anterior" relevante es el medio ponderado de los
  // vencimientos que se refinanciarían (no el cupón de una emisión concreta).
  if (possible && firstYearWeightedRate != null) {
    oldDebtRate = Math.round(firstYearWeightedRate * 100) / 100;
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
    if (possible) {
      epsText = epsImpact < 0
        ? `posible impacto en el BPA de **-${absEps} $/acción** por el sobrecoste neto de intereses tras impuestos`
        : `posible impacto favorable en el BPA de **+${absEps} $/acción**`;
    } else if (epsImpact < 0) {
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
    possible,
    badge: (oldDebtRate != null && newDebtRate != null)
      ? `${possible ? 'Posible refinanciación' : 'Refinanciación'}: deuda ${possible ? 'actual' : 'vendida/vencida'} al **${oldDebtRate.toFixed(2).replace('.', ',')} %** vs ${possible ? 'posible nueva emisión' : 'nueva emitida'} al **${newDebtRate.toFixed(2).replace('.', ',')} %**${epsText ? ` · ${epsText}` : ''}`
      : null,
    explanation: debt.refinancingAnalysis || null,
    impactExplanation: debt.refinancingImpact || null,
  };
}

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
        cell(it.interestRate != null ? `${it.estimated ? '~' : ''}${it.interestRate.toFixed(2).replace('.', ',')} %` : '—', { bold: true, color: '#c2410c' }),
        cell(idx === 0 && yr.averageRate != null ? `${yr.averageRateEstimated ? '~' : ''}${yr.averageRate.toFixed(2).replace('.', ',')} %` : '', { bold: true, color: '#0369a1', bg: idx === 0 ? '#f0fdfa' : null }),
      ]);
    });
  });
  const summaryRow = [
    cell(`TOTAL (PRÓXIMOS 5 AÑOS)`, { bold: true, color: COLORS.ink, bg: '#e0f2fe' }),
    cell(chart.afterYearFive != null ? `Después del año 5: $${chart.afterYearFive.toFixed(1).replace('.', ',')}M` : '—', { color: COLORS.ink, bg: '#e0f2fe' }),
    cell(`$${chart.totalAmount.toFixed(1).replace('.', ',')}M`, { bold: true, color: COLORS.ink, bg: '#e0f2fe' }),
    cell('—', { color: COLORS.ink, bg: '#e0f2fe' }),
    cell(chart.totalAverageRate != null ? `${chart.totalAverageRateEstimated ? 'Total medio estimado' : 'Total medio'}: ${chart.totalAverageRateEstimated ? '~' : ''}${chart.totalAverageRate.toFixed(2).replace('.', ',')} %` : '—', { bold: true, color: '#0369a1', bg: '#e0f2fe' }),
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

  // En las tablas de recompras solo se resalta la columna del ÚLTIMO ejercicio
  const isRepurchase = /repurchase|recompra/i.test(String(snippet.title || ''))
    || rawRows.some((r) => /shares repurchased|aggregate cost|average price paid|recompras bajo|coste agregado/i.test(String(r?.[0] ?? '')));
  const latestYearIdx = (() => {
    let index = 1;
    let bestYear = -Infinity;
    columns.forEach((header, i) => {
      if (i === 0) return;
      const match = String(header).match(/(20\d\d)/);
      if (match) {
        const year = Number(match[1]);
        if (year > bestYear) {
          bestYear = year;
          index = i;
        }
      }
    });
    return index;
  })();

  const rows = rawRows.map((r, rIdx) => {
    const stripeBg = rIdx % 2 === 1 ? COLORS.stripe : null;
    const rowText = r.join(' ').toLowerCase();
    const isYellow = rowText.includes('repurchased') || rowText.includes('recomprad');
    const isOrange = rowText.includes('aggregate') || rowText.includes('cost');

    return r.map((c, cIdx) => {
      let bg = stripeBg;
      let color = COLORS.ink;
      let bold = cIdx === 0;

      if (isRepurchase) {
        if (cIdx === latestYearIdx) {
          bg = '#f0fdfa';
          color = '#0d9488';
          bold = true;
        } else if (cIdx > 0) {
          bold = true;
        }
      } else if (numCols === 4) {
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
        !refinancingModel && debt.refinancingAnalysis ? `Refinanciación de deuda: ${debt.refinancingAnalysis}` : null,
        !refinancingModel && debt.refinancingImpact ? `Impacto en intereses: ${debt.refinancingImpact}` : null,
      ].filter(Boolean);
      model.conclusion.cards.push({
        title: debt.title || '3: Deuda',
        text: debt.text || null,
        // Si hay caja de refinanciación (como en el PDF) no se duplican los badges.
        badges: refinancingModel ? [] : details,
        highlight: true,
        debtMaturityChart: maturityChart,
        debtHistoryChart: historyChart,
        refinancing: refinancingModel,
        // La tabla oficial de vencimientos se omite cuando el gráfico ya muestra el calendario
        table: maturityChart ? null : buildSecSnippetTable(debt.secSnippet),
      });
    }

    // La sección de adquisiciones solo se muestra si hay operaciones materiales (≥ 50M$)
    const acquisitionsModel = buildAcquisitionsModel(report);
    if (conc.acquisitions && acquisitionsModel.material) {
      model.conclusion.cards.push({
        title: conc.acquisitions.title || '4: Adquisiciones',
        text: conc.acquisitions.text || 'No se realizaron adquisiciones materiales durante el ejercicio.',
      });
    }

    // Dividendos: solo si ha habido un cambio relevante en el ejercicio
    const dividendChart = buildDividendModel(report);
    if (dividendChart) {
      model.conclusion.cards.push({
        title: dividendChart.title,
        text: dividendChart.text,
        dividendChart,
        table: buildDividendTable(dividendChart),
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
  const H = 275;
  const padL = 52;
  const padR = 14;
  const padT = 32;
  const padB = 62;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = chart.maxYearAmount || 1;
  const step = max > 5000 ? 1000 : (max > 1000 ? 500 : (max > 200 ? 100 : 50));
  const niceMax = Math.ceil(max / step) * step || max;
  const n = chart.years.length;
  const slotW = plotW / n;
  const barW = Math.min(50, slotW * 0.65);
  const fmtMillions = (value) => {
    const [int, dec] = Number(value).toFixed(1).split('.');
    return `$${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}M`;
  };
  const parts = [];

  // Líneas horizontales de cuadrícula
  for (let g = 0; g <= 3; g += 1) {
    const v = (niceMax * (3 - g)) / 3;
    const gy = padT + plotH * (1 - v / niceMax);
    parts.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
    parts.push(`<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">$${Math.round(v)}M</text>`);
  }

  // Barras por año: una barra apilada por año, con un segmento por vencimiento y su tipo dentro
  chart.years.forEach((yr, i) => {
    const cx = padL + slotW * (i + 0.5);
    const items = Array.isArray(yr.items)
      ? yr.items.filter((it) => Number.isFinite(Number(it?.amount)) && Number(it.amount) > 0)
      : [];
    let baseline = padT + plotH;

    if (items.length) {
      const multiSegment = items.length > 1;
      items.forEach((it) => {
        const blockH = Math.max(3, (Number(it.amount) / niceMax) * plotH);
        const topY = baseline - blockH;
        parts.push(`<rect x="${(cx - barW / 2).toFixed(1)}" y="${topY.toFixed(1)}" width="${barW.toFixed(1)}" height="${blockH.toFixed(1)}" rx="2" fill="${it.color || '#f59e0b'}"/>`);
        const rateText = it.interestRate != null
          ? `${it.estimated ? '~' : ''}${Number(it.interestRate).toFixed(2).replace('.', ',')}%`
          : null;
        if (multiSegment && blockH >= 18 && barW >= 28) {
          const amountText = fmtMillions(it.amount);
          const textTop = topY + blockH / 2 - 2;
          parts.push(`<text x="${cx.toFixed(1)}" y="${(textTop).toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${it.textColor || '#ffffff'}">${amountText}</text>`);
          if (rateText) {
            parts.push(`<text x="${cx.toFixed(1)}" y="${(textTop + 9).toFixed(1)}" text-anchor="middle" font-size="7.5" font-weight="700" fill="${it.textColor || '#ffffff'}">${rateText}</text>`);
          }
        } else if (rateText && blockH >= 11 && barW >= 26) {
          parts.push(`<text x="${cx.toFixed(1)}" y="${(topY + blockH / 2 + 3.5).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="${it.textColor || '#ffffff'}">${rateText}</text>`);
        }
        baseline = topY;
      });
    } else {
      parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH - 4).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#94a3b8">—</text>`);
    }

    // Importe total que vence ese año (encima de la barra)
    if (yr.totalAmount > 0) {
      const totalY = Math.max(padT + 10, baseline - 11);
      parts.push(`<text x="${cx.toFixed(1)}" y="${totalY.toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a">${fmtMillions(yr.totalAmount)}</text>`);
    }

    // Año al pie
    parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH + 15).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${yr.year}</text>`);
  });

  // Banner inferior: tipo de interés medio de toda la deuda y deuda a amortizar
  const bannerY = H - 28;
  parts.push(`<rect x="${padL}" y="${bannerY}" width="${plotW}" height="22" rx="4" fill="#1e293b"/>`);
  const afterText = chart.afterYearFive != null ? `  ·  Después del año 5: ${fmtMillions(chart.afterYearFive)}` : '';
  const rateLabel = chart.totalAverageRateEstimated ? 'Tipo de interés medio estimado de la deuda' : 'Tipo de interés medio total de la deuda';
  const rateValue = chart.totalAverageRateEstimated ? '~' : '';
  const bannerText = chart.totalAverageRate != null
    ? `${rateLabel}: ${rateValue}${chart.totalAverageRate.toFixed(2).replace('.', ',')} %  ·  Deuda a amortizar: ${fmtMillions(chart.totalAmount)}${afterText}`
    : `Deuda a amortizar en los próximos 5 años: ${fmtMillions(chart.totalAmount)}${afterText}`;
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
  {
    const cagrParts = [];
    if (chart.cagrTotalDebt != null) cagrParts.push(`normal ${chart.cagrTotalDebt >= 0 ? '+' : ''}${chart.cagrTotalDebt.toFixed(1).replace('.', ',')} %`);
    if (chart.cagrNetDebt != null) cagrParts.push(`neta ${chart.cagrNetDebt >= 0 ? '+' : ''}${chart.cagrNetDebt.toFixed(1).replace('.', ',')} %`);
    if (cagrParts.length) {
      parts.push(`<text x="${W - padR}" y="18" text-anchor="end" font-size="8.5" font-weight="700" fill="#64748b">CAGR ${chart.points[0].year}–${chart.points[chart.points.length - 1].year}: ${escapeHtml(cagrParts.join(' · '))}</text>`);
    }
  }

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

export function renderDividendSvg(chart) {
  if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return '';
  const W = 640;
  const H = 250;
  const padL = 54;
  const padR = 54;
  const padT = 34;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxDps = Math.max(...chart.points.map((p) => (Number.isFinite(p.dps) ? p.dps : 0)), 0.5);
  const dpsStep = maxDps > 5 ? 2 : (maxDps > 2 ? 1 : (maxDps > 1 ? 0.5 : 0.25));
  const niceDps = Math.ceil(maxDps / dpsStep) * dpsStep || maxDps;
  const maxPayout = Math.max(...chart.points.map((p) => (Number.isFinite(p.payoutPct) ? p.payoutPct : 0)), 25);
  const nicePayout = Math.ceil(maxPayout / 25) * 25 || 25;
  const n = chart.points.length;
  const slotW = plotW / n;
  const barW = Math.min(46, slotW * 0.5);
  const yDps = (v) => padT + plotH * (1 - Math.max(0, v) / niceDps);
  const yPayout = (v) => padT + plotH * (1 - Math.max(0, v) / nicePayout);
  const parts = [];

  for (let g = 0; g <= 3; g += 1) {
    const v = (niceDps * (3 - g)) / 3;
    const gy = yDps(v);
    parts.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${g === 3 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${g === 3 ? ' stroke-dasharray="4 3"' : ''}/>`);
    parts.push(`<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">$${v.toFixed(1).replace('.', ',')}</text>`);
    parts.push(`<text x="${W - padR + 6}" y="${(gy + 3).toFixed(1)}" text-anchor="start" font-size="9" fill="#0f766e">${Math.round((nicePayout * (3 - g)) / 3)}%</text>`);
  }

  // Leyenda
  parts.push(`<rect x="${padL}" y="10" width="10" height="10" rx="2" fill="#f59e0b"/>`);
  parts.push(`<text x="${padL + 14}" y="18" font-size="8.5" font-weight="700" fill="#334155">Dividendo por acción ($)</text>`);
  parts.push(`<line x1="${padL + 165}" y1="15" x2="${padL + 185}" y2="15" stroke="#0f766e" stroke-width="2.5"/>`);
  parts.push(`<circle cx="${padL + 175}" cy="15" r="3.2" fill="#0f766e"/>`);
  parts.push(`<text x="${padL + 190}" y="18" font-size="8.5" font-weight="700" fill="#0f766e">Payout s/ BPA ajustado (%)</text>`);
  if (chart.dpsCagr != null || chart.totalCagr != null) {
    const cagrParts = [];
    if (chart.totalCagr != null) cagrParts.push(`importe ${chart.totalCagr >= 0 ? '+' : ''}${chart.totalCagr.toFixed(1).replace('.', ',')} %`);
    if (chart.dpsCagr != null) cagrParts.push(`por acción ${chart.dpsCagr >= 0 ? '+' : ''}${chart.dpsCagr.toFixed(1).replace('.', ',')} %`);
    parts.push(`<text x="${W - 14}" y="30" text-anchor="end" font-size="8.5" font-weight="700" fill="#64748b">CAGR ${chart.points[0].year}–${chart.points[chart.points.length - 1].year}: ${escapeHtml(cagrParts.join(' · '))}</text>`);
  }

  const linePoints = [];
  chart.points.forEach((point, i) => {
    const cx = padL + slotW * (i + 0.5);
    if (Number.isFinite(point.dps)) {
      const top = yDps(point.dps);
      parts.push(`<rect x="${(cx - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${(padT + plotH - top).toFixed(1)}" rx="2" fill="#f59e0b"/>`);
      parts.push(`<text x="${cx.toFixed(1)}" y="${(top - 4).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="#b45309">${Number(point.dps).toFixed(2).replace('.', ',')} $</text>`);
    }
    parts.push(`<text x="${cx.toFixed(1)}" y="${(padT + plotH + 15).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${point.year}</text>`);
    if (Number.isFinite(point.payoutPct)) {
      const py = yPayout(point.payoutPct);
      linePoints.push({
        x: cx,
        y: py,
        pct: point.payoutPct,
        barTop: Number.isFinite(point.dps) ? yDps(point.dps) : null,
        barLeft: cx - barW / 2,
        barRight: cx + barW / 2,
      });
    }
  });
  if (linePoints.length >= 2) {
    parts.push(`<polyline points="${linePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#0f766e" stroke-width="2.5"/>`);
  }
  linePoints.forEach((p) => {
    parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.6" fill="#0f766e"/>`);
    const pctLabel = `${p.pct.toFixed(1).replace('.', ',')}%`;
    // Si la etiqueta del payout choca con la del dividendo por acción, se coloca a un lado
    // de la barra para que siga siendo legible.
    const overlapsBarLabel = p.barTop != null && Math.abs((p.y - 8) - (p.barTop - 4)) < 13;
    if (overlapsBarLabel) {
      const placeRight = p.barRight + 6 + pctLabel.length * 4.6 <= W - padR;
      const x = placeRight ? p.barRight + 6 : p.barLeft - 6;
      parts.push(`<text x="${x.toFixed(1)}" y="${(p.y + 3).toFixed(1)}" text-anchor="${placeRight ? 'start' : 'end'}" font-size="8.5" font-weight="700" fill="#0f766e">${pctLabel}</text>`);
    } else {
      const labelY = Math.min(Math.max(p.y - 8, padT + 8), padT + plotH + 12);
      parts.push(`<text x="${p.x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0f766e">${pctLabel}</text>`);
    }
  });

  return `<svg class="sc-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(chart.title)}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}

export function renderHtmlDividendChart(chart) {
  if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return '';
  const note = chart.hasReportedFallback ? ' · * años con BPA reportado (sin ajustado)' : '';
  const chartTitle = `EVOLUCIÓN DEL DIVIDENDO Y PAYOUT (${chart.points[0].year}–${chart.points[chart.points.length - 1].year})`;
  return `<div class="shares-chart"><div class="sc-title">${escapeHtml(chartTitle)}${note ? `<span style="font-weight:400;color:#94a3b8;">${escapeHtml(note)}</span>` : ''}</div>${renderDividendSvg(chart)}</div>`;
}

function renderRichHtml(text) {
  if (!text) return '';
  return parseRichSegments(text)
    .map((seg) => (seg.bold ? `<strong>${escapeHtml(seg.text)}</strong>` : escapeHtml(seg.text)))
    .join('')
    .replaceAll('\n', '<br>');
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

/* ── Gráficos como imagen: mismo SVG del HTML rasterizado a PNG de alta
   resolución para incrustarlo en Word (.docx) y ODT (.odt), que no soportan
   SVG inline de forma fiable. Así los cuatro formatos muestran el mismo
   gráfico que el PDF. ──────────────────────────────────────────────────── */

const CHART_RASTER_WIDTH = 1920;

export const CHART_IMAGE_SLOTS = {
  shares: { relId: 'rIdChart1', file: 'grafico-acciones.png' },
  debtMaturity: { relId: 'rIdChart2', file: 'grafico-vencimientos-deuda.png' },
  debtHistory: { relId: 'rIdChart3', file: 'grafico-evolucion-deuda.png' },
  dividend: { relId: 'rIdChart4', file: 'grafico-dividendos.png' },
};

function svgToPng(svg, width = CHART_RASTER_WIDTH) {
  if (!svg) return null;
  const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const ratio = viewBox ? Number(viewBox[2]) / Number(viewBox[1]) : 0.36;
  const height = Math.round(width * ratio);
  const scalable = svg
    .replace('width="100%"', `width="${width}" height="${height}"`)
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif" ');
  try {
    const resvg = new Resvg(scalable, {
      fitTo: { mode: 'width', value: width },
      font: { loadSystemFonts: true },
    });
    const rendered = resvg.render();
    return { buffer: rendered.asPng(), width: rendered.width, height: rendered.height };
  } catch (error) {
    console.warn('[reportExport] No se pudo rasterizar un gráfico:', error.message);
    return null;
  }
}

export function buildReportChartImages(model) {
  const images = {};
  const add = (key, svg) => {
    if (!images[key] && svg) images[key] = svgToPng(svg);
  };
  (model?.conclusion?.cards ?? []).forEach((card) => {
    if (card.chart) add('shares', renderSharesChartSvg(card.chart));
    if (card.debtMaturityChart) add('debtMaturity', renderDebtMaturitySvg(card.debtMaturityChart));
    if (card.debtHistoryChart) add('debtHistory', renderDebtHistorySvg(card.debtHistoryChart));
    if (card.dividendChart) add('dividend', renderDividendSvg(card.dividendChart));
  });
  return images;
}

function renderHtmlRefinancingBox(refinancing) {
  if (!refinancing) return '';
  const badges = buildDebtRefinancingBadges(refinancing);
  const tiles = badges.map((badge) => `
    <div style="flex:1;min-width:110pt;background:${badge.highlight ? '#fed7aa' : '#ffedd5'};border-radius:4px;padding:5pt 6pt;text-align:center;">
      <div style="font-size:6.5pt;color:${badge.highlight ? '#7c2d12' : '#9a3412'};">${escapeHtml(badge.label)}</div>
      <div style="font-size:8pt;font-weight:800;color:${badge.highlight ? '#7c2d12' : '#431407'};">${escapeHtml(badge.val)}</div>
    </div>`).join('');
  return `
    <div style="margin:10pt 0 10pt;background:#fff7ed;border:1px solid #fed7aa;border-left:3.5pt solid #ea580c;border-radius:4px;padding:8pt 10pt;">
      <p style="margin:0 0 6pt;font-size:9pt;font-weight:800;color:#9a3412;">Refinanciación de deuda e impacto en BPA:</p>
      <div style="display:flex;gap:6pt;flex-wrap:wrap;">${tiles}</div>
      ${refinancing.explanation ? `<p style="font-size:8.5pt;line-height:1.45;margin:8pt 0 0;color:#431407;">${renderRichHtml(refinancing.explanation)}</p>` : ''}
      ${refinancing.impactExplanation ? `<p style="font-size:8.5pt;line-height:1.45;margin:5pt 0 0;color:#c2410c;font-weight:700;">${renderRichHtml(refinancing.impactExplanation)}</p>` : ''}
    </div>`;
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
    ${model.conclusion.cards.map((card, cardIndex) => `
    <div style="border:1px solid ${COLORS.rule};border-radius:6px;padding:10pt 12pt;margin-bottom:12pt;background:#fff;${cardIndex > 0 ? 'page-break-before:always;' : ''}">
      <h3 style="margin:0 0 6pt;font-size:11pt;color:${COLORS.ink};">${escapeHtml(card.title)}</h3>
      ${card.text ? `<p style="font-size:9pt;line-height:1.5;margin:4pt 0 8pt;color:#374151;">${renderRichHtml(card.text)}</p>` : ''}
      ${card.badges?.length ? `<ul style="font-size:8.5pt;color:#854d0e;padding-left:14pt;margin:4pt 0 8pt;">${card.badges.map((b) => `<li>${renderRichHtml(b)}</li>`).join('')}</ul>` : ''}
      ${card.chart ? renderHtmlSharesChart(card.chart) : ''}
      ${card.debtMaturityChart ? renderHtmlDebtMaturityChart(card.debtMaturityChart) : ''}
      ${card.debtHistoryChart ? renderHtmlDebtHistoryChart(card.debtHistoryChart) : ''}
      ${card.refinancing ? renderHtmlRefinancingBox(card.refinancing) : ''}
      ${card.dividendChart ? renderHtmlDividendChart(card.dividendChart) : ''}
      ${card.isWatchlist && card.items?.length ? `<ul style="font-size:8.5pt;color:#16a34a;padding-left:14pt;margin:4pt 0 8pt;list-style:none;">${card.items.map((it) => `<li>✓ <span style="color:#374151;">${renderRichHtml(it)}</span></li>`).join('')}</ul>` : ''}
      ${card.table ? `
        <div style="margin-top:8pt;border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
          ${card.table.title ? `<div style="padding:3pt 8pt;background:#e2e8f0;font-size:7.5pt;font-weight:800;letter-spacing:0.3pt;color:#334155;">EXTRACTO OFICIAL SEC (FORM 10-K)</div>
          <div style="padding:4pt 8pt;background:#f1f5f9;font-size:8pt;font-weight:700;color:#475569;">${escapeHtml(card.table.title)} ${card.table.summary ? `<span style="font-style:italic;color:#64748b;margin-left:8pt;">${escapeHtml(card.table.summary)}</span>` : ''}</div>` : ''}
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
  .shares-chart { margin: 8pt 0 10pt; padding: 8pt 10pt; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; page-break-inside: avoid; }
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
  const runs = parseRichSegments(text).map((seg) => docxRun(seg.text, {
    size: opts.size ?? 8.5,
    bold: seg.bold ? true : (opts.bold ?? false),
    italic: opts.italic,
    color: seg.bold ? (opts.boldColor ?? '#0f172a') : (opts.color ?? COLORS.ink),
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

function docxImageParagraph(image, relId, ids, opts = {}) {
  if (!image) return '';
  ids.image += 1;
  const id = ids.image;
  const available = 10466; // A4 (11906) menos márgenes (2 × 720)
  const cx = available * 635; // twips → EMU
  const cy = Math.round(cx * (image.height / image.width));
  return `<w:p><w:pPr><w:spacing w:before="${opts.before ?? 40}" w:after="${opts.after ?? 80}"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Grafico${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${relId}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function docxRefinancingBox(refinancing) {
  if (!refinancing) return '';
  const badges = buildDebtRefinancingBadges(refinancing);
  const tableWidth = 10046;
  const tileWidth = Math.floor((tableWidth - (badges.length - 1) * 40) / badges.length);
  const tiles = badges.map((badge) => `
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="${tileWidth}" w:type="dxa"/>
        <w:shd w:val="clear" w:color="auto" w:fill="${badge.highlight ? 'FED7AA' : 'FFEDD5'}"/>
        <w:vAlign w:val="center"/>
        <w:tcMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tcMar>
      </w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>${docxRun(badge.label, { size: 6.5, color: badge.highlight ? '#7C2D12' : '#9A3412' })}</w:p>
      <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>${docxRun(badge.val, { size: 8, bold: true, color: badge.highlight ? '#7C2D12' : '#431407' })}</w:p>
    </w:tc>`).join('');
  const noBorder = ['top', 'bottom', 'right', 'insideH', 'insideV']
    .map((side) => `<w:${side} w:val="none" w:sz="0" w:space="0" w:color="auto"/>`).join('');
  const innerTable = `<w:tbl><w:tblPr><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${noBorder}</w:tblBorders><w:tblCellMar><w:top w:w="20" w:type="dxa"/><w:left w:w="20" w:type="dxa"/><w:bottom w:w="20" w:type="dxa"/><w:right w:w="20" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${badges.map(() => `<w:gridCol w:w="${tileWidth}"/>`).join('')}</w:tblGrid><w:tr>${tiles}</w:tr></w:tbl>`;
  const content = [
    `<w:p><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr>${docxRun('Refinanciación de deuda e impacto en BPA:', { size: 8.5, bold: true, color: '#9A3412' })}</w:p>`,
    innerTable,
    refinancing.explanation ? docxRichParagraph(refinancing.explanation, { size: 8, color: '#431407', after: 40, before: 80 }) : '',
    refinancing.impactExplanation ? docxRichParagraph(refinancing.impactExplanation, { size: 8, color: '#C2410C', boldColor: '#C2410C', after: 40, before: 40 }) : '',
    '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>',
  ].join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="10466" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:shd w:val="clear" w:color="auto" w:fill="FFF7ED"/><w:tblBorders><w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="28" w:space="0" w:color="EA580C"/><w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/></w:tblBorders><w:tblCellMar><w:top w:w="120" w:type="dxa"/><w:left w:w="220" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="10466"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="10466" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="FFF7ED"/></w:tcPr>${content}</w:tc></w:tr></w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`;
}

function buildDocxXml(model, images = {}) {
  const parts = [];
  const ids = { image: 0 };
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
    model.conclusion.cards.forEach((card, cardIndex) => {
      parts.push(docxParagraph(card.title, { size: 11, bold: true, color: COLORS.ink, after: 40, before: 60, pageBreakBefore: cardIndex > 0 }));
      if (card.text) {
        parts.push(docxRichParagraph(card.text, { size: 8.5, color: COLORS.ink, after: 40 }));
      }
      if (card.badges?.length) {
        card.badges.forEach((b) => parts.push(docxRichParagraph(`• ${b}`, { size: 8, color: '#854D0E', boldColor: '#7C2D12', after: 20 })));
      }
      if (card.chart) {
        parts.push(docxParagraph(card.chart.title, { size: 8, bold: true, color: '#475569', after: 40 }));
        if (images.shares) {
          parts.push(docxImageParagraph(images.shares, CHART_IMAGE_SLOTS.shares.relId, ids));
        } else {
          const chartTable = buildSharesChartTable(card.chart);
          if (chartTable) parts.push(docxTable(chartTable));
        }
      }
      if (card.debtMaturityChart) {
        parts.push(docxParagraph(card.debtMaturityChart.title, { size: 8, bold: true, color: '#475569', after: 40, before: 60 }));
        if (images.debtMaturity) {
          parts.push(docxImageParagraph(images.debtMaturity, CHART_IMAGE_SLOTS.debtMaturity.relId, ids));
        } else {
          const matTable = buildDebtMaturityTable(card.debtMaturityChart);
          if (matTable) parts.push(docxTable(matTable));
        }
      }
      if (card.debtHistoryChart) {
        parts.push(docxParagraph(card.debtHistoryChart.title, { size: 8, bold: true, color: '#475569', after: 40, before: 60 }));
        if (images.debtHistory) {
          parts.push(docxImageParagraph(images.debtHistory, CHART_IMAGE_SLOTS.debtHistory.relId, ids));
        } else {
          const histTable = buildDebtHistoryTable(card.debtHistoryChart);
          if (histTable) parts.push(docxTable(histTable));
        }
      }
      if (card.refinancing) {
        parts.push(docxRefinancingBox(card.refinancing));
      }
      if (card.dividendChart) {
        if (images.dividend) {
          parts.push(docxImageParagraph(images.dividend, CHART_IMAGE_SLOTS.dividend.relId, ids));
        }
        if (card.dividendChart.hasReportedFallback) {
          parts.push(docxParagraph('* Años con BPA reportado (sin ajustado disponible).', { size: 7, italic: true, color: COLORS.soft, after: 40 }));
        }
      }
      if (card.isWatchlist && card.items?.length) {
        card.items.forEach((it) => parts.push(docxRichParagraph(`OK  ${it}`, { size: 8, color: COLORS.ink, after: 20 })));
      }
      if (card.table) {
        if (card.table.title) {
          parts.push(docxParagraph('EXTRACTO OFICIAL SEC (FORM 10-K)', { size: 8, bold: true, color: '#475569', highlight: '#F1F5F9', after: 20, before: 40 }));
          parts.push(docxParagraph(card.table.title, { size: 9, bold: true, color: '#0F172A', after: 20 }));
        }
        if (card.table.summary) parts.push(docxParagraph(card.table.summary, { size: 7.5, italic: true, color: '#64748B', after: 20 }));
        parts.push(docxTable(card.table));
      }
    });
  }

  if (model.rating) {
    parts.push(docxParagraph(`${model.rating.label}  (${model.rating.score} / 10)`, { size: 13, bold: true, color: COLORS.ink, after: 40, before: 100, pageBreakBefore: true }));
    parts.push(docxRichParagraph(model.rating.rationale, { size: 9, color: COLORS.ink, after: 40 }));
    parts.push(docxParagraph(model.rating.disclaimer, { size: 7.5, italic: true, color: COLORS.muted, after: 60 }));
  }

  parts.push(docxParagraph(model.footer, { size: 8, color: COLORS.soft, before: 120 }));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${parts.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
}

export async function buildReportDocx(report) {
  const model = buildReportModel(report);
  const images = buildReportChartImages(model);
  const mediaFiles = Object.entries(CHART_IMAGE_SLOTS)
    .filter(([key]) => images[key])
    .map(([key, slot]) => ({ ...slot, data: images[key].buffer }));
  const imageRels = mediaFiles
    .map((media) => `<Relationship Id="${media.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${media.file}"/>`)
    .join('');

  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  const word = zip.folder('word');
  word.folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${imageRels}</Relationships>`);
  word.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Helvetica" w:hAnsi="Helvetica" w:cs="Helvetica"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`);
  const media = word.folder('media');
  mediaFiles.forEach((file) => media.file(file.file, file.data));
  word.file('document.xml', buildDocxXml(model, images));
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

  const textStyleFor = ({ bold, italic, color, size, bg }) => {
    const key = `${bold ? 'b' : ''}${italic ? 'i' : ''}|${color ?? 'auto'}|${size ?? 7.5}|${bg ?? ''}`;
    if (!textStyles.has(key)) {
      const name = `T${textStyles.size + 1}`;
      const props = [
        color ? `fo:color="${color}"` : '',
        bg ? `fo:background-color="${bg}"` : '',
        bold ? 'fo:font-weight="bold" style:font-weight-asian="bold"' : '',
        italic ? 'fo:font-style="italic"' : '',
        size ? `fo:font-size="${size}pt"` : '',
      ].filter(Boolean).join(' ');
      textStyles.set(key, { name, props });
    }
    return textStyles.get(key).name;
  };

  const cellStyleFor = (bg, variant = 'default') => {
    const key = `${bg ?? 'none'}|${variant}`;
    if (!cellStyles.has(key)) {
      const name = `C${cellStyles.size + 1}`;
      let props;
      if (variant === 'box') {
        props = [
          'fo:background-color="#fff7ed"',
          'fo:border="none"',
          'fo:border-left="4pt solid #ea580c"',
          'fo:padding="0.07in"',
        ].join(' ');
      } else if (variant === 'tile') {
        props = [
          bg ? `fo:background-color="${bg}"` : 'fo:background-color="transparent"',
          'fo:border="none"',
          'fo:padding="0.035in"',
        ].join(' ');
      } else {
        props = [
          bg ? `fo:background-color="${bg}"` : 'fo:background-color="transparent"',
          'fo:border="0.5pt solid #d1d5db"',
          'fo:padding="0.028in"',
        ].join(' ');
      }
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

  const frameStyle = 'FG1';
  const graphicStyles = `<style:style style:name="${frameStyle}" style:family="graphic"><style:graphic-properties style:vertical-pos="top" style:vertical-rel="paragraph" style:horizontal-pos="center" style:horizontal-rel="paragraph" style:wrap="none" style:run-through="foreground" fo:margin-top="0.05in" fo:margin-bottom="0.07in"/></style:style>`;

  const automaticStyles = () => {
    const texts = [...textStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="text"><style:text-properties ${s.props}/></style:style>`).join('');
    const cells = [...cellStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="table-cell"><style:table-cell-properties ${s.props}/></style:style>`).join('');
    const columns = [...columnStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="table-column"><style:table-column-properties ${s.props}/></style:style>`).join('');
    return `${texts}${cells}${columns}${graphicStyles}<style:style style:name="PBreak" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:break-before="page"/></style:style><style:style style:name="PBody" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0.02in" fo:margin-bottom="0.04in"/></style:style><style:style style:name="TReport" style:family="table"><style:table-properties style:width="6.69in" table:align="left"/></style:style><style:style style:name="TBox" style:family="table"><style:table-properties style:width="6.35in" table:align="left"/></style:style>`;
  };

  return { textStyleFor, cellStyleFor, columnStyleFor, frameStyle, automaticStyles };
}

function buildOdtContent(model, images = {}) {
  const styles = createOdtStyleRegistry();
  const body = [];
  let tableCount = 0;

  const paragraph = (text, opts = {}) => {
    const styleName = styles.textStyleFor({ bold: opts.bold, italic: opts.italic, color: opts.color, size: opts.size, bg: opts.bg });
    const pStyle = opts.pageBreakBefore ? 'PBreak' : 'PBody';
    body.push(`<text:p text:style-name="${pStyle}"><text:span text:style-name="${styleName}">${odtEsc(text)}</text:span></text:p>`);
  };

  const richParagraphXml = (text, opts = {}) => parseRichSegments(text).map((seg) => {
    const styleName = styles.textStyleFor({
      bold: seg.bold ? true : (opts.bold ?? false),
      italic: opts.italic,
      color: seg.bold ? (opts.boldColor ?? '#0f172a') : (opts.color ?? COLORS.ink),
      size: opts.size,
      bg: opts.bg,
    });
    return `<text:span text:style-name="${styleName}">${odtEsc(seg.text)}</text:span>`;
  }).join('');

  const richParagraph = (text, opts = {}) => {
    const pStyle = opts.pageBreakBefore ? 'PBreak' : 'PBody';
    body.push(`<text:p text:style-name="${pStyle}">${richParagraphXml(text, opts)}</text:p>`);
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

  // Gráfico rasterizado como imagen incrustada (igual que en el PDF)
  const image = (key) => {
    const img = images[key];
    const slot = CHART_IMAGE_SLOTS[key];
    if (!img || !slot) return false;
    const widthIn = 6.69;
    const heightIn = (widthIn * img.height) / img.width;
    body.push(`<text:p text:style-name="PBody"><draw:frame draw:style-name="${styles.frameStyle}" draw:name="${slot.file}" text:anchor-type="as-char" svg:width="${widthIn.toFixed(3)}in" svg:height="${heightIn.toFixed(3)}in"><draw:image xlink:href="Pictures/${slot.file}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>`);
    return true;
  };

  // Caja naranja de refinanciación con las 4 métricas clave (igual que el PDF)
  const refinancingBox = (refinancing) => {
    const badges = buildDebtRefinancingBadges(refinancing);
    if (!badges.length) return;
    tableCount += 1;
    const tileWidth = (6.35 - (badges.length - 1) * 0.08) / badges.length;
    const innerCols = badges.map(() => `<table:table-column table:style-name="${styles.columnStyleFor(tileWidth)}"/>`).join('');
    const tiles = badges.map((badge) => `<table:table-cell table:style-name="${styles.cellStyleFor(badge.highlight ? '#fed7aa' : '#ffedd5', 'tile')}"><text:p text:style-name="PBody" text:align="center"><text:span text:style-name="${styles.textStyleFor({ color: badge.highlight ? '#7c2d12' : '#9a3412', size: 6.5 })}">${odtEsc(badge.label)}</text:span></text:p><text:p text:style-name="PBody" text:align="center"><text:span text:style-name="${styles.textStyleFor({ bold: true, color: badge.highlight ? '#7c2d12' : '#431407', size: 8 })}">${odtEsc(badge.val)}</text:span></text:p></table:table-cell>`).join('');
    const innerTable = `<table:table table:name="RefinBadges${tableCount}" table:style-name="TBox">${innerCols}<table:table-row>${tiles}</table:table-row></table:table>`;
    const titleStyle = styles.textStyleFor({ bold: true, color: '#9a3412', size: 8.5 });
    const bodyContent = [
      `<text:p text:style-name="PBody"><text:span text:style-name="${titleStyle}">Refinanciación de deuda e impacto en BPA:</text:span></text:p>`,
      innerTable,
      refinancing.explanation ? richParagraphXml(refinancing.explanation, { color: '#431407', size: 8 }) : '',
      refinancing.impactExplanation ? richParagraphXml(refinancing.impactExplanation, { color: '#c2410c', size: 8, boldColor: '#c2410c' }) : '',
    ].join('');
    body.push(`<table:table table:name="Refin${tableCount}" table:style-name="TReport"><table:table-column table:style-name="${styles.columnStyleFor(6.69)}"/><table:table-row><table:table-cell table:style-name="${styles.cellStyleFor(null, 'box')}">${bodyContent}</table:table-cell></table:table-row></table:table>`);
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
    model.conclusion.cards.forEach((card, cardIndex) => {
      paragraph(card.title, { bold: true, color: COLORS.ink, size: 11, pageBreakBefore: cardIndex > 0 });
      if (card.text) {
        richParagraph(card.text, { color: COLORS.ink, size: 8.5 });
      }
      if (card.badges?.length) {
        card.badges.forEach((b) => richParagraph(`• ${b}`, { color: '#854d0e', boldColor: '#7c2d12', size: 8 }));
      }
      if (card.chart) {
        paragraph(card.chart.title, { bold: true, color: '#475569', size: 8 });
        if (!image('shares')) {
          const chartTable = buildSharesChartTable(card.chart);
          if (chartTable) table(chartTable);
        }
      }
      if (card.debtMaturityChart) {
        paragraph(card.debtMaturityChart.title, { bold: true, color: '#475569', size: 8 });
        if (!image('debtMaturity')) {
          const matTable = buildDebtMaturityTable(card.debtMaturityChart);
          if (matTable) table(matTable);
        }
      }
      if (card.debtHistoryChart) {
        paragraph(card.debtHistoryChart.title, { bold: true, color: '#475569', size: 8 });
        if (!image('debtHistory')) {
          const histTable = buildDebtHistoryTable(card.debtHistoryChart);
          if (histTable) table(histTable);
        }
      }
      if (card.refinancing) {
        refinancingBox(card.refinancing);
      }
      if (card.dividendChart) {
        image('dividend');
        if (card.dividendChart.hasReportedFallback) {
          paragraph('* Años con BPA reportado (sin ajustado disponible).', { italic: true, color: COLORS.soft, size: 7 });
        }
      }
      if (card.isWatchlist && card.items?.length) {
        card.items.forEach((it) => richParagraph(`OK  ${it}`, { color: COLORS.ink, size: 8 }));
      }
      if (card.table) {
        if (card.table.title) {
          paragraph('EXTRACTO OFICIAL SEC (FORM 10-K)', { bold: true, color: '#475569', size: 8, bg: '#f1f5f9' });
          paragraph(card.table.title, { bold: true, color: '#0f172a', size: 9 });
        }
        if (card.table.summary) paragraph(card.table.summary, { italic: true, color: '#64748b', size: 7.5 });
        table(card.table);
      }
    });
  }

  if (model.rating) {
    paragraph(`${model.rating.label} (${model.rating.score} / 10)`, { bold: true, color: COLORS.ink, size: 13, pageBreakBefore: true });
    paragraph(model.rating.rationale, { color: COLORS.ink, size: 9 });
    paragraph(model.rating.disclaimer, { italic: true, color: COLORS.muted, size: 7.5 });
  }

  paragraph(model.footer, { color: COLORS.soft, size: 8 });

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.2"><office:automatic-styles>${styles.automaticStyles()}</office:automatic-styles><office:body><office:text>${body.join('')}</office:text></office:body></office:document-content>`;
}

export async function buildReportOdt(report) {
  const model = buildReportModel(report);
  const images = buildReportChartImages(model);
  const mediaFiles = Object.entries(CHART_IMAGE_SLOTS)
    .filter(([key]) => images[key])
    .map(([key, slot]) => ({ ...slot, data: images[key].buffer }));
  const mediaEntries = mediaFiles
    .map((media) => `<manifest:file-entry manifest:full-path="Pictures/${media.file}" manifest:media-type="image/png"/>`)
    .join('');

  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>${mediaEntries}</manifest:manifest>`);
  zip.file('styles.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2"><office:styles><style:default-style style:family="paragraph"><style:text-properties fo:font-size="10pt" style:font-name="Helvetica"/></style:default-style></office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="8.27in" fo:page-height="11.69in" fo:margin-top="0.79in" fo:margin-bottom="0.79in" fo:margin-left="0.79in" fo:margin-right="0.79in" style:print-orientation="portrait"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>`);
  const pictures = zip.folder('Pictures');
  mediaFiles.forEach((file) => pictures.file(file.file, file.data));
  zip.file('content.xml', buildOdtContent(model, images));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
