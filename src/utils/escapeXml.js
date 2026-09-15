/**
 * @fileoverview Escapado de entidades XML/HTML compartido por exportadores y generadores de marcado.
 * @module utils/escapeXml
 */

/**
 * Escapa los caracteres reservados de XML/HTML para insertar valores no confiables en documentos.
 * @param {unknown} value - Valor a escapar.
 * @returns {string} Cadena XML segura.
 */
export function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
