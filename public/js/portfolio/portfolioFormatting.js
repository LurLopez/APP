/**
 * @file portfolioFormatting.js
 * @description Utilidades de formateo numérico, monetario y fechas para el módulo de Cartera.
 */

(function (window) {
  'use strict';

  function escapeHtml(value) {
    return window.HtmlUtils.escapeHtml(value);
  }

  function activeLocale() {
    return window.I18n?.getLanguage?.() === 'en' ? 'en-US' : 'es-ES';
  }

  function formatNumber(value, options) {
    if (activeLocale() === 'en-US') {
      return new Intl.NumberFormat('en-US', options).format(Number(value));
    }
    const formatted = new Intl.NumberFormat('es-ES', options).format(Number(value));
    const [integer, decimals] = formatted.split(',');
    const sign = integer.startsWith('-') ? '-' : '';
    const absoluteInteger = integer.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${absoluteInteger}${decimals ? `,${decimals}` : ''}`;
  }

  function maxDecimals(value) {
    return Math.abs(Number(value)) > 0.1 ? 2 : 4;
  }

  function fmtMoney(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `$${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals(value) })}`;
  }

  function fmtSigned(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const formatted = formatNumber(Math.abs(Number(value)), { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals(value) });
    return `${Number(value) < 0 ? '−' : '+'}$${formatted}`;
  }

  function fmtPct(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals(value) })} %`;
  }

  function fmtSignedPct(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const formatted = formatNumber(Math.abs(Number(value)), { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals(value) });
    return `${Number(value) < 0 ? '−' : '+'}${formatted} %`;
  }

  function fmtShares(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return formatNumber(value, { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals(value) });
  }

  function fmtPrice(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `$${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals(value) })}`;
  }

  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '—';
    if (window.I18n?.formatDate) return window.I18n.formatDate(date);
    return new Intl.DateTimeFormat(activeLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  function fmtEur(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }

  function fmtEurInt(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `${formatNumber(Math.round(value), { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  function changeClass(value) {
    return Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : '';
  }

  /**
   * Aplica una retención porcentual (0-100) a un importe bruto de dividendos.
   * @param {number} gross - Importe bruto.
   * @param {number} withholdingPct - Porcentaje de retención.
   * @param {number} [defaultPct=20] - Porcentaje usado si el valor no es válido.
   * @returns {number} Importe neto resultante.
   */
  function netDividends(gross, withholdingPct, defaultPct = 20) {
    const amount = Number(gross);
    const hasPct = withholdingPct !== null && withholdingPct !== undefined && withholdingPct !== '';
    const raw = hasPct ? Number(withholdingPct) : NaN;
    const pct = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : defaultPct;
    return (Number.isFinite(amount) ? amount : 0) * (1 - pct / 100);
  }

  function cell(value, { signed = false, pct = false } = {}) {
    const classes = [changeClass(value)];
    if (value === null || value === undefined || Number.isNaN(Number(value))) return `<td class="${classes.join(' ')}">—</td>`;
    const text = pct ? fmtSignedPct(value) : signed ? fmtSigned(value) : fmtMoney(value);
    return `<td class="${classes.join(' ')}">${text}</td>`;
  }

  const PortfolioFormatting = {
    escapeHtml,
    formatNumber,
    maxDecimals,
    fmtMoney,
    fmtSigned,
    fmtPct,
    fmtSignedPct,
    fmtShares,
    fmtPrice,
    fmtDate,
    fmtEur,
    fmtEurInt,
    changeClass,
    cell,
    netDividends
  };

  window.PortfolioFormatting = PortfolioFormatting;
})(window);
