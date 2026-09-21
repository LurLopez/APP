/**
 * @file empresaChartUtils.js
 * @description Utilidades de cálculo geométrico, escalas y formateo para gráficos interactivos (SVG/TradingView-style).
 */

(function (window) {
  'use strict';

  const SPANISH_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  /**
   * Formatea una fecha ISO a "Día Mes Año" en español.
   * @param {string} isoDate
   * @returns {string}
   */
  function formatTradingViewHoverDate(isoDate) {
    if (!isoDate) return '';
    const parts = String(isoDate).split('-');
    if (parts.length !== 3) return isoDate;
    const year = parts[0];
    const mIdx = parseInt(parts[1], 10) - 1;
    const day = parts[2];
    const m = (window.I18n && window.I18n.shortMonth && window.I18n.shortMonth(mIdx)) || SPANISH_MONTHS[mIdx] || parts[1];
    return `${day} ${m} ${year}`;
  }

  /**
   * Calcula un paso agradable y legible (1, 2, 2.5, 5, 10...) para ejes numéricos.
   * @param {number} val
   * @returns {number}
   */
  function computeNiceStep(val) {
    if (!Number.isFinite(val) || val <= 0) return 1;
    const exponent = Math.floor(Math.log10(val));
    const fraction = val / Math.pow(10, exponent);
    let niceFraction;
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 2.5) niceFraction = 2.5;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
    return niceFraction * Math.pow(10, exponent);
  }

  /**
   * Obtiene el símbolo correspondiente a una moneda.
   * @param {string} curr
   * @returns {string}
   */
  function formatCurrencySymbol(curr) {
    if (curr === 'EUR') return '€';
    if (curr === 'GBP') return '£';
    if (curr === 'JPY') return '¥';
    return '$';
  }

  /**
   * Formatea un valor monetario de cotización.
   * @param {number|string} val
   * @param {string} [curr='USD']
   * @returns {string}
   */
  function formatPriceValue(val, curr = (window.chartCurrency || 'USD')) {
    if (!Number.isFinite(Number(val))) return '—';
    const sym = formatCurrencySymbol(curr);
    const num = Number(val);
    const decimals = Math.abs(num) < 10 ? 2 : (Math.abs(num) < 1000 ? 2 : 1);
    const locale = (window.I18n && window.I18n.localeFor && window.I18n.localeFor()) || 'es-ES';
    return `${sym}${num.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }

  /**
   * Formatea un valor monetario de variación con signo explícito.
   * @param {number|string} val
   * @param {string} [curr='USD']
   * @returns {string}
   */
  function formatSignedPriceValue(val, curr = (window.chartCurrency || 'USD')) {
    if (!Number.isFinite(Number(val))) return '—';
    const sym = formatCurrencySymbol(curr);
    const num = Number(val);
    const prefix = num > 0 ? '+' : (num < 0 ? '-' : '');
    const absNum = Math.abs(num);
    const decimals = absNum < 10 ? 2 : (absNum < 1000 ? 2 : 1);
    const locale = (window.I18n && window.I18n.localeFor && window.I18n.localeFor()) || 'es-ES';
    return `${prefix}${sym}${absNum.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }

  /**
   * Formatea un porcentaje firmado.
   * @param {number|string} val
   * @returns {string}
   */
  function formatSignedPct(val) {
    if (!Number.isFinite(Number(val))) return '—';
    const num = Number(val);
    const prefix = num > 0 ? '+' : (num < 0 ? '-' : '');
    const locale = (window.I18n && window.I18n.localeFor && window.I18n.localeFor()) || 'es-ES';
    return `${prefix}${Math.abs(num).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
  }

  /**
   * Calcula la escala de precios para el eje Y.
   * @param {number[]} values
   * @returns {{ min: number, max: number, ticks: number[], step: number }}
   */
  function computePriceScale(values) {
    if (!values || !values.length) {
      return { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], step: 25 };
    }
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const spread = Math.max(0.01, rawMax - rawMin);

    const targetStep = spread / 4;
    const step = computeNiceStep(targetStep);

    const min = Math.max(0, Math.floor((rawMin - step * 0.25) / step) * step);
    let max = Math.ceil((rawMax + step * 0.25) / step) * step;
    if (max <= min) max = min + step * 2;

    const ticks = [];
    for (let val = min; val <= max + step * 0.001; val += step) {
      ticks.push(val);
    }
    return { min, max, ticks, step };
  }

  /**
   * Obtiene las dimensiones geométricas y padding interno del contenedor del gráfico.
   * @param {HTMLElement} block
   * @returns {{ isFs: boolean, width: number, height: number, pad: Object, innerWidth: number, innerHeight: number }}
   */
  function getCompanyChartGeometry(block) {
    const isFs = block?.classList.contains('is-fullscreen') || document.fullscreenElement === block;
    const canvasInner = block?.querySelector('.company-chart-canvas-inner, [data-val-canvas-inner], [data-chart-canvas-inner], .val-chart-body, .chart-body');
    const svgEl = block?.querySelector('svg.pf-chart-svg, #val-chart, #price-chart');

    let clientW = 0;
    let clientH = 0;
    if (svgEl) {
      const rect = svgEl.getBoundingClientRect();
      clientW = Math.round(rect.width);
      clientH = Math.round(rect.height);
    }
    if (!clientW && canvasInner) {
      const rect = canvasInner.getBoundingClientRect();
      clientW = Math.round(rect.width);
      clientH = Math.round(rect.height);
    }
    if (!clientW && block) {
      const rect = block.getBoundingClientRect();
      clientW = Math.round(rect.width);
    }

    const defaultW = isFs ? 1200 : 960;
    const defaultH = isFs ? 540 : 380;

    const width = clientW > 200 ? clientW : defaultW;
    const height = clientH > 150 ? clientH : defaultH;

    const pad = isFs
      ? { left: 18, right: 74, top: 22, bottom: 32 }
      : { left: 16, right: 70, top: 18, bottom: 28 };
    const innerWidth = width - pad.left - pad.right;
    const innerHeight = height - pad.top - pad.bottom;
    return { isFs, width, height, pad, innerWidth, innerHeight };
  }

  /**
   * Genera marcas temporales en el eje X para vista TradingView.
   * @param {Array<{ date: string }>} points
   * @param {Function} x
   * @param {Object} pad
   * @param {number} width
   * @returns {Array<{ x: number, label: string, isMajor: boolean }>}
   */
  function getTradingViewDateTicks(points, x, pad, width) {
    if (!points || points.length === 0) return [];
    if (points.length === 1) {
      return [{ x: x(0), label: formatTradingViewHoverDate(points[0].date), isMajor: true }];
    }

    const count = points.length;
    const maxTicks = Math.max(2, Math.floor((width - pad.left - pad.right) / 95));
    const step = Math.max(1, Math.floor(count / maxTicks));
    const ticks = [];

    for (let i = 0; i < count; i += step) {
      ticks.push({
        x: x(i),
        label: formatTradingViewHoverDate(points[i].date),
        isMajor: i === 0 || i + step >= count
      });
    }
    return ticks;
  }

  const EmpresaChartUtils = {
    SPANISH_MONTHS,
    formatTradingViewHoverDate,
    computeNiceStep,
    formatCurrencySymbol,
    formatPriceValue,
    formatSignedPriceValue,
    formatSignedPct,
    computePriceScale,
    getCompanyChartGeometry,
    getTradingViewDateTicks
  };

  window.EmpresaChartUtils = EmpresaChartUtils;
  Object.assign(window, EmpresaChartUtils);
})(window);
