/**
 * @fileoverview Filtro de las filas visibles de la tabla de Asignación de Capital.
 * Las filas sin importe (0) no se muestran; "Libre" y "En total" siempre están presentes.
 * @module utils/capitalRows
 */

/**
 * ¿La fila debe mostrarse en la tabla de asignación de capital?
 * @param {object} row - Fila con "name" y "value".
 * @returns {boolean} true si la fila tiene importe o es Libre/En total.
 */
export function isVisibleCapitalRow(row) {
  const name = String(row?.name ?? '').replace(/\*\d+/g, '').trim().toLowerCase();
  if (/^(libre|free)\b/.test(name) || name.includes('total')) return true;
  const raw = String(row?.value ?? '').trim().replace(/[$€£\s+]/g, '');
  if (!raw || raw === '—') return true;
  return !/^-?0+(?:[.,]0+)?$/.test(raw);
}

/**
 * Filtra las filas visibles de una tabla de asignación de capital.
 * @param {Array<object>} rows - Filas de la tabla.
 * @returns {Array<object>} Filas visibles.
 */
export function visibleCapitalRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter(isVisibleCapitalRow);
}
