/**
 * @fileoverview Utilidad de escape HTML compartida por los módulos de contenido de Guías.
 * @module guiasHtml
 */

function escapeHtml(value) {
  if (typeof window !== 'undefined' && window.HtmlUtils && typeof window.HtmlUtils.escapeHtml === 'function') {
    return window.HtmlUtils.escapeHtml(value);
  }
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
export { escapeHtml };
