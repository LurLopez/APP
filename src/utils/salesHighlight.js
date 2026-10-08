/**
 * @fileoverview Resolución de la casilla resaltada de la tabla de Ventas: el resalte y la llamada
 * de nota deben marcar la columna donde nace el ajuste contable —«Ajustado» si es del periodo
 * actual, «Anterior Aj.» si el ajuste se sumó de vuelta en la columna del periodo comparable—.
 * Los informes guardados antes de existir `adjustedCell` se resuelven infiriendo la columna por
 * las cifras, para que el resalte se pinte donde corresponde sin regenerar el análisis.
 * @module utils/salesHighlight
 */

const MATERIAL_DIFFERENCE = 0.5;

/**
 * Convierte una cifra de la tabla de Ventas («4260M», «1.234,5M», «+648,9 %», «(267)») en número.
 * @param {unknown} value - Valor formateado o numérico.
 * @returns {number|null} Número o null si no es interpretable.
 */
export function parseHighlightNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).replace(/[^0-9.,-]/g, '');
  if (!raw || raw === '-' || raw === '—') return null;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;
  if (lastComma > lastDot) normalized = raw.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma) normalized = raw.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Resuelve en qué columnas de una fila de Ventas debe pintarse el resalte y la nota.
 * - Campo explícito `adjustedCell`: `"current"` (Ajustado), `"previous"` (Anterior Aj.) o `"both"`.
 * - Sin campo (informes antiguos): se infiere comparando Ajustado vs Normal y Anterior Aj. vs
 *   Anterior N. Si la única variación frente al normal está en la columna anterior, el resalte va
 *   a «Anterior Aj.» (caso PEP 2026-Q3: el deterioro sumado de vuelta era del año comparable).
 * @param {object} meta - Fila de Ventas con `isAdjusted`, cifras y `adjustedCell` opcional.
 * @param {{ materialDifference?: number }} [options] - Umbral de diferencia material (en millones).
 * @returns {{ current: boolean, previous: boolean }} Columnas que deben ir resaltadas.
 */
export function resolveAdjustedCells(meta, { materialDifference = MATERIAL_DIFFERENCE } = {}) {
  if (!meta || meta.isAdjusted !== true) return { current: false, previous: false };
  const declared = String(meta.adjustedCell ?? '').toLowerCase();
  if (declared === 'previous') return { current: false, previous: true };
  if (declared === 'both') return { current: true, previous: true };
  if (declared === 'current') return { current: true, previous: false };

  const adjusted = parseHighlightNumber(meta.adjusted);
  const normal = parseHighlightNumber(meta.normal);
  const prevAdjusted = parseHighlightNumber(meta.prevAdjusted);
  const prevNormal = parseHighlightNumber(meta.prevNormal);
  const currentDiffers = adjusted !== null && normal !== null && Math.abs(adjusted - normal) >= materialDifference;
  const previousDiffers = prevAdjusted !== null && prevNormal !== null && Math.abs(prevAdjusted - prevNormal) >= materialDifference;

  if (previousDiffers && !currentDiffers) return { current: false, previous: true };
  return { current: true, previous: currentDiffers && previousDiffers };
}
