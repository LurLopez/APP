/**
 * @fileoverview Utilidades de limpieza de tablas de extractos SEC (columnas sin datos).
 * @module agents/analyst/snippetHelpers
 */

const EMPTY_CELL_RE = /^(?:—|–|-+|n\/?a|none|null|unknown|desconocid[oa]|sin datos|no disponible|no se dispone|not available|not disclosed)[\s.]*$/i;

/**
 * Indica si una celda de tabla SEC no contiene información real.
 * @param {*} value - Valor de la celda.
 * @returns {boolean} Verdadero si está vacía o es un marcador de "sin datos".
 */
export function isSnippetCellEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'object') return false;
  const text = String(value).trim();
  if (!text) return true;
  return EMPTY_CELL_RE.test(text);
}

/**
 * Elimina de una tabla SEC las columnas que no contienen ningún dato real
 * (p. ej. una columna «Año anterior» llena de «—»). La primera columna
 * (métrica) nunca se elimina.
 * @param {object} snippet - Tabla con "headers" y "rows" en formato array.
 * @returns {object} Tabla sin las columnas vacías.
 */
export function stripEmptySnippetColumns(snippet) {
  if (!snippet || !Array.isArray(snippet.rows) || !snippet.rows.length) return snippet;
  if (!snippet.rows.every(Array.isArray)) return snippet;
  const headers = Array.isArray(snippet.headers) ? snippet.headers : [];
  const colCount = Math.max(headers.length, ...snippet.rows.map((row) => row.length));
  if (colCount <= 2) return snippet;

  const keep = [];
  for (let i = 0; i < colCount; i += 1) {
    if (i === 0) {
      keep.push(true);
      continue;
    }
    keep.push(snippet.rows.some((row) => !isSnippetCellEmpty(row[i])));
  }
  if (keep.every(Boolean)) return snippet;

  const remap = (cells) => cells.filter((_, i) => keep[i] !== false);
  return {
    ...snippet,
    ...(headers.length ? { headers: remap(headers) } : {}),
    rows: snippet.rows.map(remap),
  };
}
