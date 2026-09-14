/**
 * @file portfolioFormatting.js
 * @description Utilidades de formateo numérico, monetario y fechas para el módulo de Cartera.
 */

(function (window) {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function formatNumber(value, options) {
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
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
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
    cell
  };

  window.PortfolioFormatting = PortfolioFormatting;
})(window);
