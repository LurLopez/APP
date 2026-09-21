/**
 * @fileoverview Propagación de acciones en circulación y armonización de splits bursátiles entre series anuales y trimestrales.
 * @module services/edgar/sharesHarmonizer
 */

const SHARE_SCALE_KEYS = ['weightedSharesDiluted', 'weightedSharesBasic', 'sharesOutstanding'];
const SCALE_TOLERANCE = 0.35;
const ABSOLUTE_SHARE_FLOOR = 1e6;
const NEIGHBOR_WINDOW = 4;

function shareCount(values, key) {
  const value = Number(values?.[key]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function maxShareCount(values) {
  return SHARE_SCALE_KEYS.reduce((max, key) => Math.max(max, shareCount(values, key) ?? 0), 0);
}

/**
 * Devuelve el factor de escala XBRL (10^3 o 10^6) si la relación entre dos recuentos de acciones
 * de la misma fila se explica por una escala de miles o millones; null en caso contrario.
 * @param {number} ratio - Cociente entre el recuento mayor y el menor.
 * @returns {number|null} Factor multiplicador o null.
 */
function scaleFactorFor(ratio) {
  for (const factor of [1e3, 1e6]) {
    if (Math.abs(ratio / factor - 1) <= SCALE_TOLERANCE) return factor;
  }
  return null;
}

function scaleShares(row, keys, factor) {
  for (const key of keys) {
    const value = Number(row.values?.[key]);
    if (Number.isFinite(value) && value > 0) row.values[key] = Math.round(value * factor);
    const ytd = Number(row.ytdValues?.[key]);
    if (Number.isFinite(ytd) && ytd > 0) row.ytdValues[key] = Math.round(ytd * factor);
  }
}

/**
 * Normaliza los recuentos de acciones a unidades absolutas.
 * Algunas empresas (p. ej. MCD desde 2023) reportan el promedio ponderado de acciones en millones
 * (711.1) mientras el resto de partidas va en dólares absolutos; sin normalizar, la capitalización,
 * el EV y todas las métricas por acción quedan desviadas por un factor de un millón.
 * @param {Array<object>} annual - Series anuales.
 * @param {Array<object>} quarterly - Series trimestrales.
 */
export function normalizeShareUnits(annual, quarterly) {
  const rows = [...quarterly, ...annual];

  for (const row of rows) {
    const present = SHARE_SCALE_KEYS
      .map((key) => ({ key, value: shareCount(row.values, key) }))
      .filter((entry) => entry.value !== null);
    if (present.length < 2) continue;
    const max = Math.max(...present.map((entry) => entry.value));
    const scaled = new Map();
    for (const entry of present) {
      const factor = scaleFactorFor(max / entry.value);
      if (factor) scaled.set(factor, [...(scaled.get(factor) ?? []), entry.key]);
    }
    for (const [factor, keys] of scaled) scaleShares(row, keys, factor);
  }

  const ordered = [...rows].sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0));
  const absolute = ordered.map((row) => maxShareCount(row.values) >= ABSOLUTE_SHARE_FLOOR);
  ordered.forEach((row, index) => {
    const counts = SHARE_SCALE_KEYS
      .map((key) => ({ key, value: shareCount(row.values, key) }))
      .filter((entry) => entry.value !== null);
    const rowMax = maxShareCount(row.values);
    if (!counts.length || rowMax >= ABSOLUTE_SHARE_FLOOR) return;
    let anchor = 0;
    for (let offset = 1; offset <= NEIGHBOR_WINDOW && !anchor; offset += 1) {
      for (const candidate of [index - offset, index + offset]) {
        if (candidate < 0 || candidate >= ordered.length) continue;
        if (!absolute[candidate]) continue;
        anchor = maxShareCount(ordered[candidate].values);
        break;
      }
    }
    if (!anchor) return;
    const scaled = rowMax * 1e6;
    if (scaled >= anchor / 4 && scaled <= anchor * 4) {
      scaleShares(row, counts.map((entry) => entry.key), 1e6);
    }
  });
}

/**
 * Propaga el número de acciones a trimestres donde la empresa no lo reportó directamente en XBRL.
 * @param {Array<object>} annual - Series anuales.
 * @param {Array<object>} quarterly - Series trimestrales.
 */
export function propagateMissingShares(annual, quarterly) {
  const annualMap = new Map();
  for (const ann of annual) {
    const sh = Number(ann.values?.weightedSharesDiluted || ann.values?.sharesOutstanding || ann.values?.weightedSharesBasic);
    if (sh > 0) {
      const year = ann.sortKey ? Math.floor(ann.sortKey / 10) : null;
      if (year) annualMap.set(year, sh);
      if (ann.periodEnd) annualMap.set(ann.periodEnd.slice(0, 4), sh);
    }
  }

  const baselineRow = quarterly.find((q) => Number(q.values?.weightedSharesDiluted) > 0 || Number(q.values?.sharesOutstanding) > 0)
    ?? annual.find((a) => Number(a.values?.weightedSharesDiluted) > 0 || Number(a.values?.sharesOutstanding) > 0);
  const baselineShares = Number(baselineRow?.values?.weightedSharesDiluted || baselineRow?.values?.sharesOutstanding || 0);

  const sortedQuarters = [...quarterly].sort((a, b) => a.sortKey - b.sortKey);
  for (let i = 0; i < sortedQuarters.length; i += 1) {
    const q = sortedQuarters[i];
    const existing = Number(q.values?.weightedSharesDiluted || q.values?.sharesOutstanding || q.values?.weightedSharesBasic);
    if (existing > 0) continue;

    const year = q.sortKey ? Math.floor(q.sortKey / 10) : null;
    let targetShares = (year ? annualMap.get(year) : null)
      || (q.periodEnd ? annualMap.get(q.periodEnd.slice(0, 4)) : null);

    if (!targetShares || targetShares <= 0) {
      for (let offset = 1; offset < sortedQuarters.length; offset += 1) {
        const next = sortedQuarters[i + offset];
        const nextSh = Number(next?.values?.weightedSharesDiluted || next?.values?.sharesOutstanding);
        if (nextSh > 0) { targetShares = nextSh; break; }
        const prev = sortedQuarters[i - offset];
        const prevSh = Number(prev?.values?.weightedSharesDiluted || prev?.values?.sharesOutstanding);
        if (prevSh > 0) { targetShares = prevSh; break; }
      }
    }

    if (!targetShares || targetShares <= 0) {
      targetShares = baselineShares > 0 ? baselineShares : null;
    }

    if (targetShares > 0) {
      q.values.weightedSharesDiluted = targetShares;
      q.values.sharesOutstanding = targetShares;
    }
  }
}

/**
 * Ajusta retrospectivamente métricas per-share y recuentos de acciones ante splits o contrasplits (reverse splits).
 * @param {Array<object>} annual - Series anuales.
 * @param {Array<object>} quarterly - Series trimestrales.
 */
export function harmonizeSeriesSplits(annual, quarterly) {
  const allRows = [...quarterly, ...annual];
  const baselineRow = quarterly.find((q) => Number(q.values?.weightedSharesDiluted) > 0 || Number(q.values?.sharesOutstanding) > 0)
    ?? annual.find((a) => Number(a.values?.weightedSharesDiluted) > 0 || Number(a.values?.sharesOutstanding) > 0);
  const baselineShares = Number(baselineRow?.values?.weightedSharesDiluted || baselineRow?.values?.sharesOutstanding);
  if (!baselineShares || baselineShares <= 0) return;

  for (const row of allRows) {
    const rawShares = Number(row.values?.weightedSharesDiluted || row.values?.sharesOutstanding);
    if (!rawShares || rawShares <= 0) continue;
    const ratio = baselineShares / rawShares;
    let factor = 1;
    if (ratio > 1.6) {
      for (const cand of [100, 50, 40, 30, 28, 25, 20, 15, 14, 10, 8, 7, 6, 5, 4, 3, 2]) {
        if (Math.abs(ratio / cand - 1) < 0.28) {
          factor = cand;
          break;
        }
      }
    } else if (ratio < 0.6) {
      for (const cand of [0.5, 0.333, 0.25, 0.2, 0.1, 0.05]) {
        if (Math.abs(ratio / cand - 1) < 0.28) {
          factor = cand;
          break;
        }
      }
    }
    if (factor !== 1) {
      if (row.values.weightedSharesDiluted) row.values.weightedSharesDiluted *= factor;
      if (row.values.weightedSharesBasic) row.values.weightedSharesBasic *= factor;
      if (row.values.sharesOutstanding) row.values.sharesOutstanding *= factor;
      if (row.values.epsDiluted) row.values.epsDiluted = Math.round((row.values.epsDiluted / factor) * 1000) / 1000;
      if (row.values.epsBasic) row.values.epsBasic = Math.round((row.values.epsBasic / factor) * 1000) / 1000;
      if (row.values.epsDilutedNormalized) row.values.epsDilutedNormalized = Math.round((row.values.epsDilutedNormalized / factor) * 1000) / 1000;
      if (row.values.dividendPerShare) row.values.dividendPerShare = Math.round((row.values.dividendPerShare / factor) * 10000) / 10000;
      if (row.values.bookValuePerShare) row.values.bookValuePerShare = Math.round((row.values.bookValuePerShare / factor) * 100) / 100;
      if (row.values.tangibleBookValuePerShare) row.values.tangibleBookValuePerShare = Math.round((row.values.tangibleBookValuePerShare / factor) * 100) / 100;
      if (row.values.cashFlowPerShare) row.values.cashFlowPerShare = Math.round((row.values.cashFlowPerShare / factor) * 1000) / 1000;
      if (row.ytdValues) {
        if (row.ytdValues.weightedSharesDiluted) row.ytdValues.weightedSharesDiluted *= factor;
        if (row.ytdValues.weightedSharesBasic) row.ytdValues.weightedSharesBasic *= factor;
        if (row.ytdValues.epsDiluted) row.ytdValues.epsDiluted = Math.round((row.ytdValues.epsDiluted / factor) * 1000) / 1000;
        if (row.ytdValues.epsBasic) row.ytdValues.epsBasic = Math.round((row.ytdValues.epsBasic / factor) * 1000) / 1000;
        if (row.ytdValues.dividendPerShare) row.ytdValues.dividendPerShare = Math.round((row.ytdValues.dividendPerShare / factor) * 10000) / 10000;
      }
    }
  }
}
