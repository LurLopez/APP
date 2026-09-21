/**
 * @fileoverview Núcleo del gráfico de métricas: empresas y comparaciones (extraído de empresaMetricsChart.js).
 */

(function (window) {
  const EMS = window.EmpresaMetricsState;
    const METRICS_CHART_COLORS = [
    '#4f46e5', '#3a7bd5', '#2e9e5b', '#d64545',
    '#7b5cd6', '#009aa6', '#e06fb0', '#d96a2b',
    '#6c3483', '#2874a6', '#1e8449', '#c0392b',
    '#8a8a3a', '#5f6b7a', '#d4ac0d', '#34495e',
  ];
    const comparisonCache = new Map(); // ticker -> companyData
    const seriesColorMap = new Map(); // seriesId -> hex color
    const comparisonLoadingTickers = new Set();
    const HIDDEN_SERIES_STORAGE_KEY = 'cifra_hidden_chart_series_v1';
    const hiddenSeries = loadHiddenSeries(); // seriesId ocultos sin quitarlos del gráfico
    const MARGIN_DEFINITIONS = {
    grossProfitMargin: { key: 'grossProfitMargin', kind: 'margin', baseKey: 'grossProfit', label: '% Márgenes brutos', format: 'percent' },
    operatingIncomeMargin: { key: 'operatingIncomeMargin', kind: 'margin', baseKey: 'operatingIncome', label: '% Márgenes operativos', format: 'percent' },
    operatingIncomeAdjustedMargin: { key: 'operatingIncomeAdjustedMargin', kind: 'margin', baseKey: 'operatingIncomeAdjusted', label: 'Margen operativo ajustado %', format: 'percent', italic: true },
    netIncomeMargin: { key: 'netIncomeMargin', kind: 'margin', baseKey: 'netIncomeToCommonIncludingUnusual', label: 'Margen de beneficio neto %', format: 'percent' },
    netIncomeAdjustedMargin: { key: 'netIncomeAdjustedMargin', kind: 'margin', baseKey: 'netIncomeToCommonExcludingUnusual', label: 'Margen de beneficio neto ajustado %', format: 'percent' },
    ebitdaMargin: { key: 'ebitdaMargin', kind: 'margin', baseKey: 'ebitda', label: '% Márgenes EBITDA', format: 'percent' },
  };

  function resetComparison() {
    comparisonCompanies.forEach((comp) => pruneHiddenSeriesForCompany(comp.ticker));
    comparisonCompanies.clear();
    comparisonLoadingTickers.clear();
    seriesColorMap.clear();
    if (typeof renderComparisonChips === 'function') {
      renderComparisonChips();
    }
  }

  function escapeHtml(value) {
    return window.HtmlUtils.escapeHtml(value);
  }

  function loadHiddenSeries() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(HIDDEN_SERIES_STORAGE_KEY) ?? '[]');
      return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
    } catch {
      return new Set();
    }
  }

  function persistHiddenSeries() {
    try {
      if (hiddenSeries.size) window.localStorage.setItem(HIDDEN_SERIES_STORAGE_KEY, JSON.stringify([...hiddenSeries]));
      else window.localStorage.removeItem(HIDDEN_SERIES_STORAGE_KEY);
    } catch {}
  }

  function notifyHiddenSeriesChange() {
    window.dispatchEvent(new CustomEvent('chart:hidden-series-change'));
  }

  function saveHiddenSeries() {
    persistHiddenSeries();
    notifyHiddenSeriesChange();
  }

  function replaceHiddenSeries(seriesIds) {
    hiddenSeries.clear();
    (Array.isArray(seriesIds) ? seriesIds : []).forEach((id) => {
      if (typeof id === 'string' && id) hiddenSeries.add(id);
    });
    persistHiddenSeries();
  }

  function isSeriesHidden(seriesId) {
    return hiddenSeries.has(seriesId);
  }

  function toggleSeriesVisibility(seriesId) {
    if (!seriesId) return;
    if (hiddenSeries.has(seriesId)) hiddenSeries.delete(seriesId);
    else hiddenSeries.add(seriesId);
    saveHiddenSeries();
    renderMetricsChart();
  }

  function getRenderedSeriesIds() {
    return [...document.querySelectorAll('#metrics-chart-legend .metrics-legend-visibility')]
      .map((button) => button.dataset.seriesId)
      .filter(Boolean);
  }

  function toggleAllSeriesVisibility() {
    const seriesIds = getRenderedSeriesIds();
    if (!seriesIds.length) return;
    const allHidden = seriesIds.every((seriesId) => hiddenSeries.has(seriesId));
    seriesIds.forEach((seriesId) => {
      if (allHidden) hiddenSeries.delete(seriesId);
      else hiddenSeries.add(seriesId);
    });
    saveHiddenSeries();
    renderMetricsChart();
  }

  function pruneHiddenSeries(predicate) {
    let changed = false;
    [...hiddenSeries].forEach((seriesId) => {
      if (predicate(seriesId)) {
        hiddenSeries.delete(seriesId);
        changed = true;
      }
    });
    if (changed) saveHiddenSeries();
  }

  function pruneHiddenSeriesForMetric(metricKey) {
    pruneHiddenSeries((seriesId) => seriesId.split('__')[0] === metricKey);
  }

  function pruneHiddenSeriesForCompany(ticker) {
    pruneHiddenSeries((seriesId) => seriesId.endsWith(`__${ticker}`));
  }

  function clearHiddenSeries() {
    hiddenSeries.clear();
    saveHiddenSeries();
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
      pruneHiddenSeriesForMetric(key);
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
    pruneHiddenSeriesForMetric(key);
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

window.resetComparison = resetComparison;
window.escapeHtml = escapeHtml;
window.getActiveCompanyData = getActiveCompanyData;
window.getActiveCompanyTicker = getActiveCompanyTicker;
window.getBaseCompany = getBaseCompany;
window.getAllChartCompanies = getAllChartCompanies;
window.getSeriesColor = getSeriesColor;
window.getMarginItemByKey = getMarginItemByKey;
window.syncMarginSelector = syncMarginSelector;
window.metricChartType = metricChartType;
window.toggleChartMetric = toggleChartMetric;
window.removeChartMetric = removeChartMetric;
window.syncChartRowSelection = syncChartRowSelection;
window.renderComparisonChips = renderComparisonChips;
window.addComparisonCompany = addComparisonCompany;
window.METRICS_CHART_COLORS = METRICS_CHART_COLORS;
window.comparisonCache = comparisonCache;
window.seriesColorMap = seriesColorMap;
window.comparisonLoadingTickers = comparisonLoadingTickers;
window.MARGIN_DEFINITIONS = MARGIN_DEFINITIONS;
window.chartHiddenSeries = hiddenSeries;
window.isSeriesHidden = isSeriesHidden;
window.toggleSeriesVisibility = toggleSeriesVisibility;
window.toggleAllSeriesVisibility = toggleAllSeriesVisibility;
window.replaceHiddenSeries = replaceHiddenSeries;
window.pruneHiddenSeriesForMetric = pruneHiddenSeriesForMetric;
window.pruneHiddenSeriesForCompany = pruneHiddenSeriesForCompany;
window.clearHiddenSeries = clearHiddenSeries;

})(window);
