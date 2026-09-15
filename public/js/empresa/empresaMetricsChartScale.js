/**
 * @fileoverview Escalas y series del gráfico de métricas (extraído de empresaMetricsChart.js).
 */

(function (window) {
  const EMS = window.EmpresaMetricsState;
    const metricsChartNumFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

  function removeComparisonCompany(ticker) {
    comparisonCompanies.delete(ticker);
    [...seriesColorMap.keys()].forEach((k) => {
      if (k.endsWith(`__${ticker}`)) seriesColorMap.delete(k);
    });
    renderComparisonChips();
    renderMetricsChart();
  }

  function showCompareFeedback(msg) {
    const results = document.querySelector('#metrics-compare-results');
    const popover = document.querySelector('#metrics-compare-popover');
    if (popover && !popover.hidden && results) {
      results.innerHTML = `<div class="metrics-compare-empty" style="color:var(--red);font-weight:600;">${escapeHtml(msg)}</div>`;
      results.hidden = false;
    } else {
      const msgEl = document.querySelector('#metrics-chart-message') || document.querySelector('#chart-message');
      if (msgEl) {
        msgEl.textContent = msg;
        msgEl.hidden = false;
        setTimeout(() => { msgEl.hidden = true; }, 3500);
      }
    }
  }

  function openComparePopover() {
    const popover = document.querySelector('#metrics-compare-popover');
    const input = document.querySelector('#metrics-compare-input');
    const results = document.querySelector('#metrics-compare-results');
    if (!popover || !input) return;
    popover.hidden = false;
    input.value = '';
    if (results) {
      results.innerHTML = '<div class="metrics-compare-hint">Escribe un ticker (ej: KHC, KO, PEP) o nombre de empresa...</div>';
      results.hidden = false;
    }
    input.focus();
  }

  function closeComparePopover() {
    const popover = document.querySelector('#metrics-compare-popover');
    const results = document.querySelector('#metrics-compare-results');
    if (popover) popover.hidden = true;
    if (results) results.hidden = true;
  }

  function metricsChartRows() {
    const compData = getActiveCompanyData();
    const series = window.screenerSeries || 'annual';
    return [...(compData?.[series] ?? [])].reverse();
  }

  function chartPeriodShort(row) {
    if (!row?.period) return '';
    if (/^\d{4}$/.test(row.period)) return row.period;
    const [year, quarter] = row.period.split('-Q');
    return `Q${quarter} ${String(year).slice(2)}`;
  }

  function formatChartAxis(value, metric) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    if (!metric) return metricsChartNumFormat.format(number);
    if (metric.kind === 'change' || metric.kind === 'margin' || metric.kind === 'ratio' || metric.format === 'percent') return `${metricsChartNumFormat.format(number)} %`;
    if (metric.format === 'multiple') return `${metricsChartNumFormat.format(number)}x`;
    if (metric.format === 'perShare') return `${metricsChartNumFormat.format(number)} $`;
    if (metric.format === 'shares') return `${metricsChartNumFormat.format(number / 1e6)} M`;
    if (metric.format === 'count') return metricsChartNumFormat.format(number);
    return `${metricsChartNumFormat.format(number / 1e6)} M$`;
  }

  function metricScale(seriesList, includeZero) {
    let min = Infinity;
    let max = -Infinity;
    seriesList.forEach((points) => points.forEach((point) => {
      const value = Number(point.value);
      if (!Number.isFinite(value)) return;
      if (value < min) min = value;
      if (value > max) max = value;
    }));
    if (!Number.isFinite(min)) return null;
    if (includeZero && min > 0) min = 0;
    if (includeZero && max < 0) max = 0;
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    return { min: min - span * 0.08, max: max + span * 0.08 };
  }

  function isMarginMetric(metric) {
    if (!metric) return false;
    return metric.kind === 'margin' || String(metric.key).toLowerCase().includes('margin');
  }

  function marginScale(seriesList) {
    let min = 0;
    let max = 100;
    let lowest = 0;
    let highest = 0;
    let hasNegative = false;

    seriesList.forEach((points) => points.forEach((point) => {
      const value = Number(point.value);
      if (!Number.isFinite(value)) return;
      if (value < lowest) lowest = value;
      if (value > highest) highest = value;
      if (value < 0) hasNegative = true;
    }));

    if (highest > 100) {
      max = Math.ceil(highest / 25) * 25;
    }

    if (hasNegative) {
      const step = 25;
      min = Math.floor(lowest / step) * step;
    } else {
      min = 0;
    }

    return { min, max, isMargin: true };
  }

  function generateMarginTicks(scale) {
    const ticks = [];
    const step = 25;
    for (let val = scale.min; val <= scale.max + 0.001; val += step) {
      ticks.push(Math.round(val));
    }
    return ticks;
  }

  function metricY(scale, margin, innerHeight) {
    return (value) => margin.top + innerHeight - ((Number(value) - scale.min) / (scale.max - scale.min)) * innerHeight;
  }

  function setupMetricsChartBlock() {
    const block = document.querySelector('#metrics-chart-block');
    const svg = document.querySelector('#metrics-chart');
    const wrap = document.querySelector('#metrics-chart-body');
    const legend = document.querySelector('#metrics-chart-legend');
    const clearButton = document.querySelector('#metrics-chart-clear');
    if (!block || !svg || !wrap || !legend) return null;
    EMS.metricsChartState = null;

    renderComparisonChips();

    const allCompanies = getAllChartCompanies();
    const hasMetrics = chartMetrics.size > 0;
    const hasComparisons = comparisonCompanies.size > 0;

    if (!hasMetrics && !hasComparisons) {
      block.hidden = true;
      svg.innerHTML = '';
      legend.innerHTML = '';
      wrap.querySelectorAll('.metrics-chart-placeholder').forEach((el) => el.remove());
      wrap.querySelectorAll('.metric-cagr-label').forEach((el) => el.remove());
      return null;
    }

    block.hidden = false;
    if (clearButton) clearButton.hidden = !hasMetrics;

    if (!hasMetrics && hasComparisons) {
      svg.innerHTML = '';
      legend.innerHTML = '';
      wrap.querySelectorAll('.metrics-chart-placeholder').forEach((el) => el.remove());
      wrap.querySelectorAll('.metric-cagr-label').forEach((el) => el.remove());
      const placeholder = document.createElement('div');
      placeholder.className = 'metrics-chart-placeholder';
      const names = allCompanies.map((c) => c.ticker).join(' y ');
      placeholder.innerHTML = `
        <div class="metrics-chart-placeholder-card">
          <span class="placeholder-icon">📊</span>
          <strong>Comparación preparada (${escapeHtml(names)})</strong>
          <p>Haz clic en cualquier fila de la tabla (ej. <em>Ingresos</em>, <em>Beneficio neto</em>, <em>Activo total</em>, <em>Flujo de caja libre</em>) para ver la comparación entre las empresas en el gráfico.</p>
        </div>
      `;
      wrap.appendChild(placeholder);
      return null;
    }

    wrap.querySelectorAll('.metrics-chart-placeholder').forEach((el) => el.remove());
    return { block, svg, wrap, legend, allCompanies };
  }

window.removeComparisonCompany = removeComparisonCompany;
window.showCompareFeedback = showCompareFeedback;
window.openComparePopover = openComparePopover;
window.closeComparePopover = closeComparePopover;
window.metricsChartRows = metricsChartRows;
window.chartPeriodShort = chartPeriodShort;
window.formatChartAxis = formatChartAxis;
window.metricScale = metricScale;
window.isMarginMetric = isMarginMetric;
window.marginScale = marginScale;
window.generateMarginTicks = generateMarginTicks;
window.metricY = metricY;
window.setupMetricsChartBlock = setupMetricsChartBlock;
window.metricsChartNumFormat = metricsChartNumFormat;

})(window);
