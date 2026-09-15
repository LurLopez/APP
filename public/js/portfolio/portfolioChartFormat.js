/**
 * @fileoverview Módulo extraído de portfolioChart.js.
 */

(function (window) {
  const PCS = window.PortfolioChartState;

  function escapeHtml(value) {
    return fmtMod().escapeHtml ? fmtMod().escapeHtml(value) : String(value ?? '');
  }

  function formatNumber(value, options) {
    return fmtMod().formatNumber ? fmtMod().formatNumber(value, options) : String(value ?? '');
  }

  function fmtShares(value) {
    return fmtMod().fmtShares ? fmtMod().fmtShares(value) : String(value ?? '');
  }

  function fmtPrice(value) {
    return fmtMod().fmtPrice ? fmtMod().fmtPrice(value) : String(value ?? '');
  }

  function fmtDate(value) {
    return fmtMod().fmtDate ? fmtMod().fmtDate(value) : String(value ?? '');
  }

  function fmtSigned(value) {
    return fmtMod().fmtSigned ? fmtMod().fmtSigned(value) : String(value ?? '');
  }

  function fmtPct(value) {
    return fmtMod().fmtPct ? fmtMod().fmtPct(value) : `${value} %`;
  }

  function fmtSignedPct(value) {
    return fmtMod().fmtSignedPct ? fmtMod().fmtSignedPct(value) : `${value} %`;
  }

  function ensureChartTooltip() {
    return donutsMod().ensureChartTooltip ? donutsMod().ensureChartTooltip() : null;
  }

  function positionChartTooltip(event, content, options) {
    return donutsMod().positionChartTooltip ? donutsMod().positionChartTooltip(event, content, options) : null;
  }

  function hideChartTooltip() {
    return donutsMod().hideChartTooltip ? donutsMod().hideChartTooltip() : null;
  }

  const fmtMod = () => window.PortfolioFormatting || {};

  const donutsMod = () => window.PortfolioDonuts || {};
window.escapeHtml = escapeHtml;
window.formatNumber = formatNumber;
window.fmtShares = fmtShares;
window.fmtPrice = fmtPrice;
window.fmtDate = fmtDate;
window.fmtSigned = fmtSigned;
window.fmtPct = fmtPct;
window.fmtSignedPct = fmtSignedPct;
window.ensureChartTooltip = ensureChartTooltip;
window.positionChartTooltip = positionChartTooltip;
window.hideChartTooltip = hideChartTooltip;

})(window);
