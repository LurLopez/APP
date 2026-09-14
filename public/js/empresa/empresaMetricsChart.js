/**
 * @file empresaMetricsChart.js
 * @description Gráfico interactivo multi-métrica y multi-empresa para datos financieros (barras, líneas, CAGR y comparación).
 */

(function (window) {
  'use strict';

  const METRICS_CHART_COLORS = [
    '#4f46e5', '#3a7bd5', '#2e9e5b', '#d64545',
    '#7b5cd6', '#009aa6', '#e06fb0', '#d96a2b',
    '#6c3483', '#2874a6', '#1e8449', '#c0392b',
    '#8a8a3a', '#5f6b7a', '#d4ac0d', '#34495e',
  ];
  const chartMetrics = new Map();
  const metricsChartNumFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
  let metricsChartState = null;

  /* Multi-company comparison state */
  const comparisonCompanies = new Map(); // ticker -> { ticker, name, data }
  const comparisonCache = new Map(); // ticker -> companyData
  const seriesColorMap = new Map(); // seriesId -> hex color
  const comparisonLoadingTickers = new Set();
  let compareSearchDebounceTimer = null;
  let chartPendingSeriesId = null;

  function resetComparison() {
    comparisonCompanies.clear();
    comparisonLoadingTickers.clear();
    seriesColorMap.clear();
    if (typeof renderComparisonChips === 'function') {
      renderComparisonChips();
    }
  }

  function escapeHtml(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getActiveCompanyData() {
    return window.companyData || null;
  }

  function getActiveCompanyTicker() {
    return window.companyTicker || '';
  }

  function getBaseCompany() {
    const data = getActiveCompanyData();
    const ticker = getActiveCompanyTicker();
    return {
      ticker,
      name: data?.company?.name || ticker,
      data,
      isBase: true,
    };
  }

  function getAllChartCompanies() {
    const list = [];
    const base = getActiveCompanyData();
    if (base) {
      list.push(getBaseCompany());
    }
    comparisonCompanies.forEach((comp) => {
      if (comp.data) {
        list.push({ ...comp, isBase: false });
      }
    });
    return list;
  }

  function getSeriesColor(seriesId, indexHint) {
    if (seriesColorMap.has(seriesId)) {
      return seriesColorMap.get(seriesId);
    }
    const used = new Set(seriesColorMap.values());
    let candidate = METRICS_CHART_COLORS.find((c) => !used.has(c));
    if (!candidate) {
      candidate = METRICS_CHART_COLORS[indexHint % METRICS_CHART_COLORS.length]
        ?? `hsl(${((seriesColorMap.size + indexHint) * 53) % 360} 70% 45%)`;
    }
    seriesColorMap.set(seriesId, candidate);
    return candidate;
  }

  const MARGIN_DEFINITIONS = {
    grossProfitMargin: { key: 'grossProfitMargin', kind: 'margin', baseKey: 'grossProfit', label: '% Márgenes brutos', format: 'percent' },
    operatingIncomeMargin: { key: 'operatingIncomeMargin', kind: 'margin', baseKey: 'operatingIncome', label: '% Márgenes operativos', format: 'percent' },
    operatingIncomeAdjustedMargin: { key: 'operatingIncomeAdjustedMargin', kind: 'margin', baseKey: 'operatingIncomeAdjusted', label: 'Margen operativo ajustado %', format: 'percent', italic: true },
    netIncomeMargin: { key: 'netIncomeMargin', kind: 'margin', baseKey: 'netIncomeToCommonIncludingUnusual', label: 'Margen de beneficio neto %', format: 'percent' },
    netIncomeAdjustedMargin: { key: 'netIncomeAdjustedMargin', kind: 'margin', baseKey: 'netIncomeToCommonExcludingUnusual', label: 'Margen de beneficio neto ajustado %', format: 'percent' },
    ebitdaMargin: { key: 'ebitdaMargin', kind: 'margin', baseKey: 'ebitda', label: '% Márgenes EBITDA', format: 'percent' },
  };

  function getMarginItemByKey(key) {
    const data = getActiveCompanyData();
    const incomeItems = data?.statements?.income ?? [];
    const found = incomeItems.find((candidate) => candidate.key === key);
    if (found) return found;
    return MARGIN_DEFINITIONS[key] || null;
  }

  function syncMarginSelector() {
    const bar = document.querySelector('#screener-margins-bar');
    if (!bar) return;
    const stmt = window.screenerStatement || 'income';
    bar.hidden = stmt !== 'income';
    const ticker = getActiveCompanyTicker();
    bar.querySelectorAll('[data-margin-key]').forEach((button) => {
      const key = button.dataset.marginKey;
      const isSelected = chartMetrics.has(key);
      button.classList.toggle('active', isSelected);
      const dot = button.querySelector('.margin-chip-dot');
      if (dot) {
        const baseSeriesId = `${key}__${ticker}`;
        const color = seriesColorMap.get(baseSeriesId) || chartMetrics.get(key)?.color || '#4f46e5';
        dot.style.background = isSelected ? color : 'transparent';
        dot.style.borderColor = isSelected ? color : '#999';
      }
    });
  }

  function metricChartType(metric) {
    if (!metric) return 'bar';
    if (metric.kind === 'change' || metric.kind === 'margin' || metric.kind === 'ratio' || metric.format === 'percent' || metric.format === 'perShare' || metric.format === 'multiple') return 'line';
    return 'bar';
  }

  function toggleChartMetric(item) {
    if (!item || !item.key) return;
    const key = item.key;
    if (chartMetrics.has(key)) {
      chartMetrics.delete(key);
      getAllChartCompanies().forEach((comp) => {
        seriesColorMap.delete(`${key}__${comp.ticker}`);
      });
    } else {
      chartMetrics.set(key, { ...item, key });
    }
    syncChartRowSelection();
    renderMetricsChart();
  }

  function removeChartMetric(key) {
    chartMetrics.delete(key);
    getAllChartCompanies().forEach((comp) => {
      seriesColorMap.delete(`${key}__${comp.ticker}`);
    });
    syncChartRowSelection();
    renderMetricsChart();
  }

  function syncChartRowSelection() {
    const ticker = getActiveCompanyTicker();
    document.querySelectorAll('#screener-statement-table tbody tr[data-chart-key]').forEach((row) => {
      const key = row.dataset.chartKey;
      const isSelected = chartMetrics.has(key);
      row.classList.toggle('chart-selected', isSelected);
      const dot = row.querySelector('td:first-child .metric-chart-dot');
      if (dot) {
        const baseSeriesId = `${key}__${ticker}`;
        const color = seriesColorMap.get(baseSeriesId) || chartMetrics.get(key)?.color || '#4f46e5';
        dot.style.background = isSelected ? color : '';
      }
    });
  }

  function renderComparisonChips() {
    const container = document.querySelector('#metrics-compare-chips');
    if (!container) return;

    const currentTicker = getActiveCompanyTicker();
    const data = getActiveCompanyData();
    const html = [];
    html.push(`
      <span class="metrics-company-chip base-chip" title="Empresa actual: ${escapeHtml(data?.company?.name || currentTicker)}">
        <span class="chip-ticker">${escapeHtml(currentTicker)}</span>
        <span class="chip-badge">Base</span>
      </span>
    `);

    comparisonCompanies.forEach((comp) => {
      html.push(`
        <span class="metrics-company-chip" title="${escapeHtml(comp.name)}">
          <span class="chip-ticker">${escapeHtml(comp.ticker)}</span>
          <button type="button" class="metrics-company-chip-remove" data-remove-ticker="${escapeHtml(comp.ticker)}" title="Quitar ${escapeHtml(comp.ticker)} de la comparación" aria-label="Quitar ${escapeHtml(comp.ticker)}">×</button>
        </span>
      `);
    });

    comparisonLoadingTickers.forEach((ticker) => {
      html.push(`
        <span class="metrics-company-chip loading-chip">
          <span class="chip-ticker">${escapeHtml(ticker)}</span>
          <span class="chip-spinner">…</span>
        </span>
      `);
    });

    container.innerHTML = html.join('');

    container.querySelectorAll('[data-remove-ticker]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeComparisonCompany(btn.dataset.removeTicker);
      });
    });
  }

  async function addComparisonCompany(rawTicker) {
    const ticker = String(rawTicker ?? '').trim().toUpperCase();
    if (!ticker) return;

    const baseTicker = getActiveCompanyTicker();
    if (ticker === baseTicker) {
      showCompareFeedback(`Ya estás viendo ${ticker} como empresa base.`);
      return;
    }
    if (comparisonCompanies.has(ticker)) {
      showCompareFeedback(`${ticker} ya está añadida al gráfico.`);
      return;
    }

    closeComparePopover();

    if (comparisonCache.has(ticker)) {
      const cached = comparisonCache.get(ticker);
      comparisonCompanies.set(ticker, {
        ticker: cached.company?.ticker || ticker,
        name: cached.company?.name || ticker,
        data: cached,
      });
      renderComparisonChips();
      renderMetricsChart();
      return;
    }

    comparisonLoadingTickers.add(ticker);
    renderComparisonChips();

    try {
      const response = await fetch(`/api/screener/company/${encodeURIComponent(ticker)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.ok) {
        showCompareFeedback(`No se pudieron cargar los datos de ${ticker}.`);
        return;
      }
      comparisonCache.set(ticker, data);
      comparisonCompanies.set(ticker, {
        ticker: data.company?.ticker || ticker,
        name: data.company?.name || ticker,
        data,
      });
    } catch {
      showCompareFeedback(`Error al consultar ${ticker}.`);
    } finally {
      comparisonLoadingTickers.delete(ticker);
      renderComparisonChips();
      renderMetricsChart();
    }
  }

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

  function renderMetricsChart() {
    const block = document.querySelector('#metrics-chart-block');
    const svg = document.querySelector('#metrics-chart');
    const wrap = document.querySelector('#metrics-chart-body');
    const legend = document.querySelector('#metrics-chart-legend');
    const clearButton = document.querySelector('#metrics-chart-clear');
    if (!block || !svg || !wrap || !legend) return;
    metricsChartState = null;

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
      return;
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
      return;
    }

    wrap.querySelectorAll('.metrics-chart-placeholder').forEach((el) => el.remove());

    const companyRowsMap = new Map();
    const periodOrderMap = new Map();
    const periodMetaMap = new Map();
    const screenerSeries = window.screenerSeries || 'annual';
    const currentTicker = getActiveCompanyTicker();

    allCompanies.forEach((comp) => {
      const rawRows = [...(comp.data?.[screenerSeries] ?? [])].reverse();
      companyRowsMap.set(comp.ticker, rawRows);
      rawRows.forEach((r, idx) => {
        if (!r?.period) return;
        if (!periodOrderMap.has(r.period)) {
          let rank = 0;
          if (/^\d{4}$/.test(r.period)) {
            rank = Number(r.period) * 10;
          } else if (r.period.includes('-Q')) {
            const [y, q] = r.period.split('-Q');
            rank = Number(y) * 10 + Number(q);
          } else {
            rank = idx;
          }
          periodOrderMap.set(r.period, rank);
          periodMetaMap.set(r.period, r);
        } else if (r.periodEnd && !periodMetaMap.get(r.period)?.periodEnd) {
          periodMetaMap.set(r.period, r);
        }
      });
    });

    const baseRows = companyRowsMap.get(currentTicker) || [];
    const baseYears = baseRows.map((r) => window.rowYear ? window.rowYear(r) : null).filter((y) => y !== null);
    const low = baseYears.length ? Math.min(...baseYears) : 2016;
    const high = baseYears.length ? Math.max(...baseYears) : 2026;
    const minYear = window.screenerYearMin ?? Math.max(low, high - 9);
    const maxYear = window.screenerYearMax ?? high;

    const sortedPeriods = [...periodOrderMap.keys()]
      .filter((p) => {
        const match = String(p).match(/^(\d{4})/);
        if (!match) return true;
        const y = Number(match[1]);
        return y >= minYear && y <= maxYear;
      })
      .sort((a, b) => (periodOrderMap.get(a) ?? 0) - (periodOrderMap.get(b) ?? 0));

    const timeline = sortedPeriods.map((p) => {
      const meta = periodMetaMap.get(p) || { period: p };
      return {
        period: p,
        meta,
        label: window.periodDateLabel ? window.periodDateLabel(meta) : p,
        short: chartPeriodShort(meta),
        year: window.rowYear ? window.rowYear(meta) : null,
      };
    });

    const width = Math.max(320, wrap.clientWidth || 720);
    const height = 300;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const metrics = [...chartMetrics.values()];
    const series = [];
    let colorIndexHint = 0;

    metrics.forEach((metric) => {
      allCompanies.forEach((comp) => {
        const seriesId = `${metric.key}__${comp.ticker}`;
        const color = getSeriesColor(seriesId, colorIndexHint++);
        const isMulti = allCompanies.length > 1;
        const label = isMulti ? `${comp.ticker} · ${metric.label}` : metric.label;
        const compRows = companyRowsMap.get(comp.ticker) || [];

        const points = timeline.map((t) => {
          const rowIndex = compRows.findIndex((r) => r.period === t.period);
          if (rowIndex === -1) {
            return { label: t.label, short: t.short, year: t.year, value: null };
          }
          const row = compRows[rowIndex];
          const locked = window.isLockedPeriod ? window.isLockedPeriod(rowIndex, compRows) : false;
          const value = locked ? null : (window.derivedScreenerValue ? window.derivedScreenerValue(metric, row, rowIndex, compRows, comp.data) : row.values?.[metric.key]);
          return {
            label: t.label,
            short: t.short,
            year: t.year,
            value,
          };
        });

        series.push({
          id: seriesId,
          metric,
          company: comp,
          label,
          color,
          points,
        });
      });
    });

    legend.innerHTML = series.map((entry) => `
      <span class="metrics-legend-item">
        <button type="button" class="metrics-swatch" data-series-id="${escapeHtml(entry.id)}" aria-label="Cambiar el color de ${escapeHtml(entry.label)}" style="background:${entry.color}"></button>
        <span class="metrics-legend-label" title="${escapeHtml(entry.label)}">${escapeHtml(entry.label)}</span>
        <span class="metrics-legend-type">${metricChartType(entry.metric) === 'bar' ? 'barras' : 'línea'}</span>
        <button type="button" class="metrics-legend-remove" data-remove-key="${escapeHtml(entry.metric.key)}" aria-label="Quitar ${escapeHtml(entry.metric.label)} del gráfico">×</button>
      </span>`).join('');

    const barSeries = series.filter((entry) => metricChartType(entry.metric) === 'bar');
    const lineSeries = series.filter((entry) => metricChartType(entry.metric) === 'line');

    const allLinesAreMargins = lineSeries.length > 0 && lineSeries.every((entry) => isMarginMetric(entry.metric));
    const barScale = barSeries.length ? metricScale(barSeries.map((entry) => entry.points), true) : null;
    const lineScale = lineSeries.length
      ? (allLinesAreMargins
          ? marginScale(lineSeries.map((entry) => entry.points))
          : metricScale(lineSeries.map((entry) => entry.points), false))
      : null;
    const leftScale = barScale ?? lineScale;
    const rightScale = lineScale;

    const margin = { top: 14, right: rightScale ? 64 : 12, bottom: 26, left: 58 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const slotWidth = timeline.length ? innerWidth / timeline.length : innerWidth;
    const centers = timeline.map((_, index) => margin.left + slotWidth * (index + 0.5));
    const yLeft = metricY(leftScale, margin, innerHeight);
    const yRight = metricY(rightScale ?? leftScale, margin, innerHeight);

    const xLabelStep = Math.max(1, Math.ceil(timeline.length / 8));
    const xLabels = timeline.map((t, index) => (index % xLabelStep === 0
      ? `<text x="${centers[index].toFixed(1)}" y="${height - 8}" class="chart-label chart-label-x">${escapeHtml(t.short)}</text>`
      : '')).join('');

    const leftTicks = leftScale
      ? (leftScale.isMargin
          ? generateMarginTicks(leftScale)
          : [0, 1, 2, 3].map((step) => leftScale.min + ((leftScale.max - leftScale.min) * step) / 3))
      : [];
    const rightTicks = rightScale
      ? (rightScale.isMargin
          ? generateMarginTicks(rightScale)
          : [0, 1, 2, 3].map((step) => rightScale.min + ((rightScale.max - rightScale.min) * step) / 3))
      : [];

    const leftAxis = leftTicks.map((value) => `
      <text x="${margin.left - 8}" y="${yLeft(value) + 3}" class="chart-label" text-anchor="end">${formatChartAxis(value, barSeries[0]?.metric ?? lineSeries[0]?.metric)}</text>
      <line x1="${margin.left}" y1="${yLeft(value)}" x2="${width - margin.right}" y2="${yLeft(value)}" class="chart-grid"/>
    `).join('');
    const rightAxis = rightTicks.map((value) => `
      <text x="${width - margin.right + 8}" y="${yRight(value) + 3}" class="chart-label" text-anchor="start">${formatChartAxis(value, lineSeries[0]?.metric)}</text>
      <line x1="${width - margin.right}" y1="${yRight(value)}" x2="${width - margin.right + 4}" y2="${yRight(value)}" class="chart-grid" style="stroke-opacity:0.4;"/>
    `).join('');

    let zeroLineSvg = '';
    const zeroYScale = rightScale?.isMargin ? rightScale : (leftScale?.min < 0 && leftScale?.max > 0 ? leftScale : null);
    if (zeroYScale) {
      const yFn = zeroYScale === rightScale ? yRight : yLeft;
      const y0 = yFn(0);
      zeroLineSvg = `<line x1="${margin.left}" y1="${y0.toFixed(1)}" x2="${width - margin.right}" y2="${y0.toFixed(1)}" class="chart-zero-line" style="stroke:rgba(0,0,0,0.35);stroke-dasharray:4 3;stroke-width:1.2;"/>`;
    }

    let barsSvg = '';
    if (barScale && timeline.length) {
      const groupWidth = slotWidth * 0.75;
      const barWidth = Math.max(2, groupWidth / barSeries.length);
      const baseY = yLeft(Math.max(0, barScale.min));
      barSeries.forEach((entry, j) => {
        entry.points.forEach((point, index) => {
          const value = Number(point.value);
          if (!Number.isFinite(value)) return;
          const x0 = centers[index] - groupWidth / 2 + j * barWidth;
          const yTop = yLeft(value);
          barsSvg += `<rect x="${x0.toFixed(1)}" y="${Math.min(yTop, baseY).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, Math.abs(yTop - baseY)).toFixed(1)}" rx="1.5" class="metric-bar" style="fill:${entry.color}"/>`;
        });
      });
    }

    let linesSvg = '';
    if (lineScale) {
      const lineY = rightScale ? yRight : yLeft;
      lineSeries.forEach((entry) => {
        let d = '';
        let segmentStarted = false;
        entry.points.forEach((point, index) => {
          const value = Number(point.value);
          if (!Number.isFinite(value)) {
            segmentStarted = false;
            return;
          }
          const x = centers[index];
          const y = lineY(value);
          d += `${segmentStarted ? ' L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
          segmentStarted = true;
        });
        if (d) linesSvg += `<path d="${d}" class="metric-line" style="stroke:${entry.color}"/>`;
        entry.points.forEach((point, index) => {
          const value = Number(point.value);
          if (!Number.isFinite(value)) return;
          linesSvg += `<circle cx="${centers[index].toFixed(1)}" cy="${lineY(value).toFixed(1)}" r="3.5" class="metric-dot" style="stroke:${entry.color}"/>`;
        });
      });
    }

    const body = document.querySelector('#metrics-chart-body');
    body.querySelectorAll('.metric-cagr-label').forEach((el) => el.remove());

    let cagrLinesSvg = '';
    const cagrLabels = [];
    if (allCompanies.length === 1 && series.length === 1) {
      const entry = series[0];
      if (!entry.metric.kind || (entry.metric.kind !== 'margin' && entry.metric.kind !== 'ratio' && entry.metric.kind !== 'change' && entry.metric.format !== 'percent')) {
        const y = metricChartType(entry.metric) === 'bar' || !rightScale ? yLeft : yRight;
        let first = null;
        let last = null;
        entry.points.forEach((point, index) => {
          const value = Number(point.value);
          if (!Number.isFinite(value)) return;
          if (first === null) first = { index, value, year: point.year };
          last = { index, value, year: point.year };
        });
        if (first && last && first.index !== last.index) {
          const geometry = {
            x1: centers[first.index],
            y1: y(first.value),
            x2: centers[last.index],
            y2: y(last.value),
            t: 0.5,
          };
          cagrLinesSvg += `<line x1="${geometry.x1.toFixed(1)}" y1="${geometry.y1.toFixed(1)}" x2="${geometry.x2.toFixed(1)}" y2="${geometry.y2.toFixed(1)}" class="metric-cagr-line"/>`;
          let cagrText = 'CAGR: —';
          if (first.year !== null && last.year !== null && last.year > first.year) {
            const years = last.year - first.year;
            const ratio = last.value / first.value;
            if (Number.isFinite(ratio) && ratio > 0) {
              const cagr = (ratio ** (1 / years)) - 1;
              cagrText = `CAGR: ${cagr >= 0 ? '+' : '−'}${metricsChartNumFormat.format(Math.abs(cagr * 100))} %`;
            } else if (first.value !== 0) {
              const average = (((last.value - first.value) / Math.abs(first.value)) / years) * 100;
              cagrText = `CAGR: ${average >= 0 ? '+' : '−'}${metricsChartNumFormat.format(Math.abs(average))} %`;
            }
          }
          geometry.text = cagrText;
          cagrLabels.push(geometry);
        }
      }
    }

    svg.innerHTML = `${leftAxis}${rightAxis}${zeroLineSvg}${barsSvg}${linesSvg}${cagrLinesSvg}${xLabels}
      <g id="metrics-hover" hidden>
        <line id="metrics-hover-line" x1="0" y1="0" x2="0" y2="0" class="chart-crosshair"/>
        <g id="metrics-hover-dots"></g>
      </g>`;

    cagrLabels.forEach((geometry) => {
      const el = document.createElement('div');
      el.className = 'metric-cagr-label';
      el.textContent = geometry.text;
      body.appendChild(el);
      geometry.el = el;
      positionCagrLabel(geometry);
      attachCagrDrag(geometry);
    });

    metricsChartState = { rows: timeline, series, centers, margin, height, width, rightScale, yLeft, yRight };
  }

  function positionCagrLabel(geometry) {
    if (!geometry.el) return;
    geometry.el.style.left = `${geometry.x1 + geometry.t * (geometry.x2 - geometry.x1)}px`;
    geometry.el.style.top = `${geometry.y1 + geometry.t * (geometry.y2 - geometry.y1)}px`;
  }

  function attachCagrDrag(geometry) {
    const el = geometry.el;
    let dragging = false;
    el.addEventListener('pointerdown', (event) => {
      dragging = true;
      el.setPointerCapture(event.pointerId);
      el.classList.add('dragging');
      event.preventDefault();
    });
    el.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const bodyRect = document.querySelector('#metrics-chart-body').getBoundingClientRect();
      const x = event.clientX - bodyRect.left;
      geometry.t = Math.max(0, Math.min(1, (x - geometry.x1) / (geometry.x2 - geometry.x1)));
      positionCagrLabel(geometry);
    });
    const endDrag = () => {
      dragging = false;
      el.classList.remove('dragging');
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  }

  function hideMetricsChartTooltip() {
    const tooltip = document.querySelector('#metrics-chart-tooltip');
    if (tooltip) tooltip.hidden = true;
    const hover = document.querySelector('#metrics-hover');
    if (hover) hover.hidden = true;
  }

  function updateMetricsChartHover(event) {
    if (!metricsChartState || !metricsChartState.rows?.length) return;
    const svg = document.querySelector('#metrics-chart');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cursorX = ((event.clientX - rect.left) / rect.width) * metricsChartState.width;
    const cursorY = ((event.clientY - rect.top) / rect.height) * metricsChartState.height;
    const centers = metricsChartState.centers;
    let best = 0;
    let bestDistance = Infinity;
    centers.forEach((center, index) => {
      const distance = Math.abs(cursorX - center);
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    });

    const { rows, series, margin, height, width, rightScale, yLeft, yRight } = metricsChartState;
    const hover = svg.querySelector('#metrics-hover');
    const line = svg.querySelector('#metrics-hover-line');
    const dots = svg.querySelector('#metrics-hover-dots');
    if (hover) hover.hidden = false;
    const cx = centers[best];
    if (line) {
      line.setAttribute('x1', cx.toFixed(1));
      line.setAttribute('y1', margin.top.toFixed(1));
      line.setAttribute('x2', cx.toFixed(1));
      line.setAttribute('y2', (height - margin.bottom).toFixed(1));
    }

    let closestEntry = null;
    let closestDist = Infinity;
    const validPoints = [];

    series.forEach((entry) => {
      const value = Number(entry.points[best]?.value);
      if (!Number.isFinite(value)) return;
      const y = metricChartType(entry.metric) === 'bar' || !rightScale ? yLeft(value) : yRight(value);
      const item = { entry, value, y };
      validPoints.push(item);
      const d = Math.abs(cursorY - y);
      if (d < closestDist) {
        closestDist = d;
        closestEntry = item;
      }
    });

    if (dots) {
      dots.innerHTML = validPoints.map((item) => {
        const isClosest = closestEntry && item.entry === closestEntry.entry && validPoints.length > 1;
        const r = isClosest ? '5.5' : '4';
        const sw = isClosest ? '2.8' : '2';
        return `<circle cx="${cx.toFixed(1)}" cy="${item.y.toFixed(1)}" r="${r}" fill="#ffffff" class="metric-dot" style="stroke:${item.entry.color}; stroke-width:${sw};"/>`;
      }).join('');
    }

    const tooltip = document.querySelector('#metrics-chart-tooltip');
    if (tooltip) {
      const periodTitle = rows[best]?.label || rows[best]?.period || '';
      tooltip.innerHTML = `<strong>${escapeHtml(periodTitle)}</strong>${series.map((entry) => {
        const val = entry.points[best]?.value;
        const formatted = val !== null && Number.isFinite(Number(val)) ? formatChartAxis(val, entry.metric) : '—';
        const isClosest = closestEntry && entry === closestEntry.entry && validPoints.length > 1;
        return `
          <div class="metrics-chart-tooltip-row" style="${isClosest ? 'background: rgba(255,255,255,0.12); border-radius: 4px; padding: 2px 4px; font-weight: 700;' : ''}">
            <span class="metric-legend-dot" style="background:${entry.color}; ${isClosest ? 'transform: scale(1.3);' : ''}"></span>
            <span>${escapeHtml(entry.label)}</span>
            <b>${formatted}</b>
          </div>
        `;
      }).join('')}`;
      tooltip.hidden = false;
      const tipW = tooltip.offsetWidth || 180;
      const tipH = tooltip.offsetHeight || 120;
      let left = event.clientX + 16;
      let top = event.clientY - tipH / 2;
      if (left + tipW > window.innerWidth - 10) left = event.clientX - tipW - 16;
      if (top < 10) top = 10;
      if (top + tipH > window.innerHeight - 10) top = window.innerHeight - tipH - 10;
      tooltip.style.left = `${Math.max(10, left)}px`;
      tooltip.style.top = `${Math.max(10, top)}px`;
    }
  }

  function openMetricsPalette(swatch, seriesId) {
    chartPendingSeriesId = seriesId;
    const currentColor = seriesColorMap.get(seriesId) || swatch.style.background;
    const palette = document.querySelector('#metrics-palette');
    if (!palette) return;
    palette.innerHTML = METRICS_CHART_COLORS.map((color) => `
      <button type="button" class="metrics-palette-color${color === currentColor ? ' active' : ''}" style="background:${color}" data-color="${color}" aria-label="Usar el color ${color}"></button>`).join('');
    const blockRect = document.querySelector('#metrics-chart-block').getBoundingClientRect();
    const swatchRect = swatch.getBoundingClientRect();
    palette.style.left = `${swatchRect.left - blockRect.left}px`;
    palette.style.top = `${swatchRect.bottom - blockRect.top + 6}px`;
    palette.hidden = false;
  }

  function initMetricsChartListeners() {
    const chart = document.querySelector('#metrics-chart');
    const body = document.querySelector('#metrics-chart-body');
    if (chart) {
      chart.addEventListener('mousemove', updateMetricsChartHover);
      chart.addEventListener('mouseleave', hideMetricsChartTooltip);
    }
    if (body) {
      body.addEventListener('mouseleave', hideMetricsChartTooltip);
    }

    document.querySelector('#metrics-palette')?.addEventListener('click', (event) => {
      const colorButton = event.target.closest('.metrics-palette-color');
      if (!colorButton) return;
      const seriesId = chartPendingSeriesId;
      chartPendingSeriesId = null;
      document.querySelector('#metrics-palette').hidden = true;
      if (!seriesId) return;
      seriesColorMap.set(seriesId, colorButton.dataset.color);
      syncChartRowSelection();
      renderMetricsChart();
    });

    document.querySelector('#metrics-chart-legend')?.addEventListener('click', (event) => {
      const swatch = event.target.closest('.metrics-swatch');
      if (swatch) {
        const seriesId = swatch.dataset.seriesId;
        if (!seriesId) return;
        const palette = document.querySelector('#metrics-palette');
        if (palette && !palette.hidden && chartPendingSeriesId === seriesId) {
          palette.hidden = true;
          chartPendingSeriesId = null;
          return;
        }
        openMetricsPalette(swatch, seriesId);
        return;
      }
      const remove = event.target.closest('.metrics-legend-remove');
      if (remove) removeChartMetric(remove.dataset.removeKey);
    });

    document.addEventListener('click', (event) => {
      const palette = document.querySelector('#metrics-palette');
      if (palette && !palette.hidden) {
        if (!event.target.closest('#metrics-palette') && !event.target.closest('.metrics-swatch')) {
          palette.hidden = true;
          chartPendingSeriesId = null;
        }
      }

      const popover = document.querySelector('#metrics-compare-popover');
      if (popover && !popover.hidden) {
        if (!event.target.closest('#metrics-compare-popover') && !event.target.closest('#metrics-compare-add-btn') && !event.target.closest('#screener-compare-shortcut-btn')) {
          closeComparePopover();
        }
      }
    });

    document.querySelector('#metrics-chart-clear')?.addEventListener('click', () => {
      chartMetrics.clear();
      seriesColorMap.clear();
      syncChartRowSelection();
      renderMetricsChart();
    });

    document.querySelector('#metrics-compare-add-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const popover = document.querySelector('#metrics-compare-popover');
      if (popover && !popover.hidden) {
        closeComparePopover();
      } else {
        openComparePopover();
      }
    });

    document.querySelector('#screener-compare-shortcut-btn')?.addEventListener('click', () => {
      if (window.screenerStatement === 'valuation') {
        document.querySelectorAll('.screener-tab').forEach((item) => {
          item.classList.toggle('active', item.dataset.statement === 'income');
        });
        window.screenerStatement = 'income';
        if (typeof window.renderScreenerTables === 'function') {
          window.renderScreenerTables();
        }
      }
      const block = document.querySelector('#metrics-chart-block');
      if (block) block.hidden = false;
      renderComparisonChips();
      openComparePopover();
      block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    document.querySelector('#metrics-compare-input')?.addEventListener('input', (e) => {
      const query = e.currentTarget.value.trim();
      const results = document.querySelector('#metrics-compare-results');
      clearTimeout(compareSearchDebounceTimer);

      if (!query) {
        if (results) {
          results.innerHTML = '<div class="metrics-compare-hint">Escribe un ticker (ej: KHC, KO, PEP) o nombre...</div>';
          results.hidden = false;
        }
        return;
      }

      compareSearchDebounceTimer = setTimeout(async () => {
        if (results) {
          results.innerHTML = '<div class="metrics-compare-loading">Buscando empresas en SEC…</div>';
          results.hidden = false;
        }
        const searchFn = window.searchCompanies || (async (q) => {
          const res = await fetch(`/api/screener/search?q=${encodeURIComponent(q)}`);
          return res.ok ? (await res.json()).results : [];
        });
        const matches = await searchFn(query);
        if (!matches || !matches.length) {
          const cleanTicker = query.toUpperCase();
          if (/^[A-Z0-9.-]{1,10}$/.test(cleanTicker)) {
            results.innerHTML = `
              <button type="button" class="metrics-compare-result-item" data-ticker="${escapeHtml(cleanTicker)}">
                <span class="metrics-compare-res-name">Añadir ticker directo</span>
                <strong>${escapeHtml(cleanTicker)}</strong>
              </button>
            `;
          } else {
            results.innerHTML = '<div class="metrics-compare-empty">Sin resultados en la SEC para esta búsqueda.</div>';
          }
          results.hidden = false;
          return;
        }

        results.innerHTML = matches.map((item) => `
          <button type="button" class="metrics-compare-result-item" data-ticker="${escapeHtml(item.ticker)}">
            <span class="metrics-compare-res-name">${escapeHtml(item.name || item.ticker)}</span>
            <strong>${escapeHtml(item.ticker)}</strong>
          </button>
        `).join('');
        results.hidden = false;
      }, 220);
    });

    document.querySelector('#metrics-compare-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const firstBtn = document.querySelector('#metrics-compare-results .metrics-compare-result-item');
        if (firstBtn?.dataset.ticker) {
          addComparisonCompany(firstBtn.dataset.ticker);
          return;
        }
        const val = e.currentTarget.value.trim().toUpperCase();
        if (/^[A-Z0-9.-]{1,10}$/.test(val)) {
          addComparisonCompany(val);
        }
      } else if (e.key === 'Escape') {
        closeComparePopover();
      }
    });

    document.querySelector('#metrics-compare-results')?.addEventListener('click', (e) => {
      const item = e.target.closest('.metrics-compare-result-item');
      if (item?.dataset.ticker) {
        addComparisonCompany(item.dataset.ticker);
      }
    });

    document.querySelectorAll('#screener-margins-bar [data-margin-key]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.marginKey;
        const item = getMarginItemByKey(key);
        if (item) {
          toggleChartMetric(item);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMetricsChartListeners);
  } else {
    initMetricsChartListeners();
  }

  const EmpresaMetricsChart = {
    renderMetricsChart,
    toggleChartMetric,
    removeChartMetric,
    syncMarginSelector,
    syncChartRowSelection,
    metricsChartRows,
    renderComparisonChips,
    addComparisonCompany,
    removeComparisonCompany,
    resetComparison,
    chartMetrics,
    comparisonCompanies
  };

  window.EmpresaMetricsChart = EmpresaMetricsChart;
  window.renderMetricsChart = renderMetricsChart;
  window.toggleChartMetric = toggleChartMetric;
  window.removeChartMetric = removeChartMetric;
  window.syncMarginSelector = syncMarginSelector;
  window.metricsChartRows = metricsChartRows;
  window.chartMetrics = chartMetrics;
  window.resetComparison = resetComparison;
})(window);
