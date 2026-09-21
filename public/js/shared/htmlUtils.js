/**
 * @fileoverview Utilidades HTML compartidas por todos los módulos de la interfaz.
 * @module HtmlUtils
 */

(function (window) {
  'use strict';

  /**
   * Escapa las entidades HTML de un valor para insertarlo de forma segura en plantillas.
   * @param {unknown} value - Valor a escapar (se convierte a cadena).
   * @returns {string} Cadena HTML segura.
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.HtmlUtils = { escapeHtml };
})(window);
