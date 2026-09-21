/**
 * @fileoverview Constantes de estilo, colores, utilidades de saneamiento y formateo
 * para la exportación de informes financieros en múltiples formatos (HTML, DOCX, ODT).
 * @module services/reportExport/exportColors
 */

import { escapeXml } from '../../utils/escapeXml.js';

/**
 * Paleta de colores para notas al pie (*1 a *6), sincronizada con la paleta de PDFKit.
 * @type {Array<{bg: string, text: string}>}
 */
export const HIGHLIGHT_PALETTE = [
  { bg: '#fef08a', text: '#854d0e' }, // 1: Amarillo
  { bg: '#fed7aa', text: '#c2410c' }, // 2: Naranja
  { bg: '#bbf7d0', text: '#15803d' }, // 3: Verde lima
  { bg: '#e9d5ff', text: '#7e22ce' }, // 4: Morado / Malva
  { bg: '#bae6fd', text: '#0369a1' }, // 5: Celeste pastel
  { bg: '#fbcfe8', text: '#be185d' }, // 6: Rosa pastel
];

/**
 * Paleta semántica corporativa para informes financieros.
 * @type {Record<string, string>}
 */
export const COLORS = {
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

/**
 * Configuración de imágenes para gráficos integrados en DOCX y ODT.
 * @type {Record<string, {relId: string, file: string}>}
 */
export const CHART_IMAGE_SLOTS = {
  shares: { relId: 'rIdChart1', file: 'grafico-acciones.png' },
  debtMaturity: { relId: 'rIdChart2', file: 'grafico-vencimientos-deuda.png' },
  debtHistory: { relId: 'rIdChart3', file: 'grafico-evolucion-deuda.png' },
  dividend: { relId: 'rIdChart4', file: 'grafico-dividendos.png' },
};

/**
 * Sanea un valor textual eliminando marcadores de negrita markdown y caracteres no seguros.
 * @param {unknown} value - Valor a sanear.
 * @returns {string} Cadena saneada sin marcadores de formato.
 */
export function sanitize(value) {
  if (value === null || value === undefined) return '—';
  return String(value)
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/\*\*/g, '')
    .replaceAll('−', '-');
}

/**
 * Descompone un texto en segmentos normales y resaltados (negrita o cifras autodetectadas).
 * @param {string} text - Texto fuente en formato Markdown simple.
 * @returns {Array<{text: string, bold: boolean}>} Lista de segmentos contiguos.
 */
export function parseRichSegments(text) {
  if (!text) return [];
  const rawParts = String(text).split(/(\*\*.*?\*\*)/g).filter(Boolean);
  const result = [];

  for (const part of rawParts) {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      result.push({ text: part.slice(2, -2), bold: true });
    } else {
      const autoRegex = /(\bflat\s*(?:[±+\-/]+|\+\/-)\s*\d+(?:[\.,]\d+)?\s*%?|\b[~±+\-]?\s*\$?\d+(?:[\.,]\d+)?\s*(?:M|B|k|%)?\s*(?:al?|to|-)\s*[~±+\-]?\s*\$?\d+(?:[\.,]\d+)?\s*(?:M|B|k|%|\$|€)?|[~±+\-]?\s*\$?\d+(?:[\.,]\d+)*\s*(?:M|B|k|%|\$|€)(?:\s*(?:[±+\-/]+|\+\/-)\s*\d+(?:[\.,]\d+)?\s*%)?|\b20\d\d\s*-\s*20\d\d\b)/gi;
      let last = 0;
      let match;
      while ((match = autoRegex.exec(part)) !== null) {
        if (match.index > last) {
          result.push({ text: part.slice(last, match.index), bold: false });
        }
        result.push({ text: match[0], bold: true });
        last = match.index + match[0].length;
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

/**
 * Obtiene el esquema de color asignado a una nota al pie.
 * @param {string|number} noteNumber - Número identificador de la nota.
 * @returns {{bg: string, text: string}} Esquema de colores de fondo y texto.
 */
export function getHighlight(noteNumber) {
  const num = parseInt(noteNumber, 10);
  if (Number.isNaN(num) || num < 1) return HIGHLIGHT_PALETTE[0];
  return HIGHLIGHT_PALETTE[(num - 1) % HIGHLIGHT_PALETTE.length];
}

/**
 * Extrae el número de nota a partir de una cadena tipo '*3'.
 * @param {string} value - Cadena con marcador de nota.
 * @returns {string} Dígitos de la nota o '1' por defecto.
 */
export function noteNumberOf(value) {
  const match = String(value ?? '').match(/\*?(\d+)/);
  return match ? match[1] : '1';
}

/**
 * Parsea un número de estados financieros SEC soportando formatos español y anglosajón.
 * @param {string|number} str - Cadena o número a interpretar.
 * @returns {number} Número decimal o NaN si es inválido.
 */
export function parseSecNumber(str) {
  if (str == null) return NaN;
  let s = String(str).replace(/[$€£\s]/g, '').trim();
  if (!s) return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(/,/g, '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length > 2 || parts[1]?.length === 3) {
      s = parts.join('');
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

/**
 * Genera un objeto celda saneado con opciones visuales.
 * @param {string} text - Contenido textual de la celda.
 * @param {object} [opts={}] - Opciones de celda (color, bold, bg).
 * @returns {object} Modelo de celda para tablas de exportación.
 */
export function cell(text, opts = {}) {
  return { text: sanitize(text), ...opts };
}

/**
 * Genera una celda de encabezado con resaltado si contiene llamada a nota (*N).
 * @param {string} text - Texto del encabezado.
 * @returns {object} Celda de cabecera formateada.
 */
export function headerCell(text) {
  const noteMatch = String(text).match(/\*(\d+)/);
  if (noteMatch) {
    const scheme = getHighlight(noteMatch[1]);
    return cell(text, { bold: true, color: scheme.text, bg: scheme.bg });
  }
  return cell(text, { bold: true, color: COLORS.headerColor, bg: COLORS.headerBg });
}

/**
 * Escapa caracteres especiales para inclusión en XML (DOCX/ODT).
 * @param {unknown} value - Valor a escapar.
 * @returns {string} Cadena XML segura.
 */
export function esc(value) {
  return escapeXml(value);
}

/**
 * Escapa entidades HTML.
 * @param {unknown} value - Valor a escapar.
 * @returns {string} Cadena HTML segura.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Convierte un código de color hexadecimal a formato sin almohadilla en mayúsculas.
 * @param {string} color - Código de color (ej. '#ea580c').
 * @returns {string} Código hexadecimal para DOCX (ej. 'EA580C').
 */
export const hex = (color) => String(color ?? '').replace('#', '').toUpperCase();
