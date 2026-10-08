/**
 * @fileoverview Marcado ligero de las notas del informe: subrayado de las cifras ajustadas con el
 * marcador `__…__`, que los renderizados (web, SSR, PDF y exportaciones) convierten en subrayado.
 * @module utils/noteText
 */

/**
 * Subraya todas las apariciones exactas de una cifra dentro de un texto de nota, sin tocar
 * coincidencias parciales dentro de cifras mayores (p. ej. «0M» no debe afectar a «100M»).
 * @param {string} text - Texto de la nota.
 * @param {string} figure - Cifra formateada tal y como aparece (ej. «-816M», «+2,2M»).
 * @returns {string} Texto con la cifra envuelta en `__…__`.
 */
export function underlineFigure(text, figure) {
  if (!text || !figure) return text;
  const target = String(figure);
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // El guardia final solo se aplica si la cifra termina en dígito o separador (evita coincidir
  // dentro de una cifra mayor); si termina en unidad («M») un punto o paréntesis detrás es válido.
  const trailingGuard = /[\d.,]$/.test(target) ? '(?![\\d.,])' : '';
  const pattern = new RegExp(`(?<![\\d.,])${escaped}${trailingGuard}`, 'g');
  return String(text).replace(pattern, `__${target}__`);
}
