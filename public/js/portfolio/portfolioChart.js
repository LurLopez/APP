/**
 * @file portfolioChart.js
 * @description Módulo de gráfico interactivo y comparativo de cartera con escala temporal estilo TradingView.
 */

(function (window) {
  'use strict';

  let chartMetric = 'gainPct';
  let chartRange = '1y';
  let chartSelectedIds = [];
  let chartRequestId = 0;
  let chartOpen = true;
  let chartSliceStart = 0;
  let chartSliceEnd = null;
  let chartCachedData = null;
  let chartRedrawRaf = null;

  let chartDataGetter = null;
  let chartApiFetcher = null;
  let chartSectionRenderer = null;
  let chartCloseCallback = null;
  let chartSelectedIdsCallback = null;
  let chartRangeCallback = null;
  let chartMetricCallback = null;

  const fmtMod = () => window.PortfolioFormatting || {};
  const donutsMod = () => window.PortfolioDonuts || {};

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

  const PREDEFINED_TABS = [
    ['sector', 'Sectores'],
    ['type', 'Tipos'],
    ['country', 'Países'],
    ['region', 'Regiones'],
  ];

  const COLORS = [
    '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#e11d48',
    '#4f46e5', '#16a34a', '#ca8a04', '#9333ea', '#0d9488', '#db2777',
    '#6366f1', '#64748b'
  ];

  function tabForPosition(item, key) {
    if (!item) return null;
    if (key === 'sector') return item.sector || 'Sin sector';
    if (key === 'type') return item.type || 'Sin tipo';
    if (key === 'country') return item.country || 'Sin país';
    if (key === 'region') return item.region || 'Sin región';
    return null;
  }

  async function fetchApi(path, options) {
    if (chartApiFetcher) return chartApiFetcher(path, options);
    const response = await fetch(path, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Error del servidor.');
    return payload;
  }

  const CHART_METRICS = [
    ['gainPct', 'Ganancia (%)'],
    ['gainAmount', 'Ganancia ($)'],
    ['dividendYield', 'Div. yield sobre cotización (%)'],
    ['dividendYoc', 'Div. yield sobre coste (%)'],
    ['weight', 'Peso de cartera (%)'],
  ];
  const CHART_RANGES = [['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1y', '1A'], ['2y', '2A'], ['3y', '3A'], ['5y', '5A'], ['all', 'Todo']];
  const CHART_PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#4f46e5', '#6366f1', '#14b8a6', '#e11d48'];

  function chartChoices(pfData) {
    const currentData = pfData || (chartDataGetter ? chartDataGetter() : null);
    const choices = [];
    const positions = currentData?.positions ?? [];

    // 1. Tickers (Valores)
    for (const item of positions) {
      choices.push({
        id: `ticker:${item.ticker}`,
        label: item.companyName || item.ticker,
        sub: `${item.ticker} · ${fmtShares(item.shares)} acc`,
        ticker: item.ticker,
        kind: 'ticker',
        category: 'valores',
        categoryLabel: 'Valores',
      });
    }

    // 2. Grupos personalizados
    for (const group of currentData?.groups ?? []) {
      const count = (group.ruleTickers?.length || 0) + (group.lotTransactionIds?.length || 0);
      choices.push({
        id: `group:${group.id}`,
        label: group.name,
        sub: `Grupo personalizado · ${count} ${count === 1 ? 'asignación' : 'asignaciones'}`,
        color: group.color,
        kind: 'group',
        groupId: group.id,
        category: 'grupos',
        categoryLabel: 'Grupos personalizados',
      });
    }

    // 3. Grupos predefinidos (Sectores, Países, Tipos, Regiones)
    for (const [tabKey, tabTitle] of PREDEFINED_TABS) {
      const seen = new Map();
      let colorIdx = 0;
      for (const item of positions) {
        const label = tabForPosition(item, tabKey);
        if (!label) continue;
        if (!seen.has(label)) {
          seen.set(label, { count: 0, color: COLORS[colorIdx++ % COLORS.length] });
        }
        seen.get(label).count += 1;
      }
      for (const [label, meta] of seen) {
        choices.push({
          id: `group:pre:${tabKey}:${label}`,
          label,
          sub: `${tabTitle} · ${meta.count} ${meta.count === 1 ? 'acción' : 'acciones'}`,
          color: meta.color,
          kind: 'group',
          tabKey,
          category: 'grupos',
          categoryLabel: `Grupos (${tabTitle})`,
        });
      }
    }

    // 4. Lotes de compra
    for (const item of positions) {
      for (const lot of item.lots ?? []) {
        choices.push({
          id: `lot:${lot.id}`,
          label: `${item.companyName || item.ticker} · Compra ${fmtDate(lot.date)}`,
          sub: `${item.ticker} · ${fmtShares(lot.shares)} acc @ ${fmtPrice(lot.price)}`,
          ticker: item.ticker,
          kind: 'lot',
          category: 'lotes',
          categoryLabel: 'Lotes de compra',
        });
      }
    }

    return choices;
  }

  function chartButtonHtml(id) {
    const isGroup = String(id).startsWith('group:');
    const isLot = String(id).startsWith('lot:');
    const label = isGroup ? 'grupo' : isLot ? 'lote' : 'valor';
    const isSelected = chartSelectedIds.includes(String(id));
    const title = isSelected ? `Quitar ${label} del gráfico` : `Mostrar ${label} en el gráfico`;
    const iconSvg = isSelected
      ? `<svg viewBox="0 0 20 20" aria-hidden="true" class="pf-icon-remove"><path d="M5 5l10 10M15 5L5 15"/></svg>`
      : `<svg viewBox="0 0 20 20" aria-hidden="true" class="pf-icon-add"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg>`;
    return `<button class="pf-chart-trigger ${isSelected ? 'active' : ''}" type="button" data-pf-chart-trigger="${escapeHtml(id)}" aria-pressed="${isSelected}" aria-label="${title}" title="${title}">${iconSvg}</button>`;
  }

  function syncChartTriggerButtons(scope = document) {
    if (!scope) return;
    const selectedSet = new Set(chartSelectedIds);
    scope.querySelectorAll('[data-pf-chart-trigger]').forEach((button) => {
      const id = button.dataset.pfChartTrigger;
      if (!id) return;
      const isSelected = selectedSet.has(id);
      const isGroup = id.startsWith('group:');
      const isLot = id.startsWith('lot:');
      const label = isGroup ? 'grupo' : isLot ? 'lote' : 'valor';
      const title = isSelected ? `Quitar ${label} del gráfico` : `Mostrar ${label} en el gráfico`;

      button.classList.toggle('active', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
      button.setAttribute('aria-label', title);
      button.setAttribute('title', title);

      button.innerHTML = isSelected
        ? `<svg viewBox="0 0 20 20" aria-hidden="true" class="pf-icon-remove"><path d="M5 5l10 10M15 5L5 15"/></svg>`
        : `<svg viewBox="0 0 20 20" aria-hidden="true" class="pf-icon-add"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg>`;
    });
  }

  function chartPanelHtml(pfData) {
    const choices = chartChoices(pfData);
    const selected = new Set(chartSelectedIds);
    const valoresCount = choices.filter((c) => c.category === 'valores').length;
    const gruposCount = choices.filter((c) => c.category === 'grupos').length;
    const lotesCount = choices.filter((c) => c.category === 'lotes').length;

    const rangePillsHtml = CHART_RANGES.map(([key, label]) => `
      <button class="pf-range-pill ${chartRange === key ? 'active' : ''}" type="button" data-pf-range="${key}">${label}</button>
    `).join('');

    const choicesHtml = choices.map((choice) => {
      const isChecked = selected.has(choice.id);
      const dotColor = choice.color || (choice.kind === 'ticker' ? '#2563eb' : '#64748b');
      const badgeText = choice.category === 'valores' ? 'Valor' : choice.category === 'grupos' ? 'Grupo' : 'Lote';
      return `
        <label class="pf-chart-choice ${isChecked ? 'selected' : ''}" data-choice-category="${choice.category}" data-choice-search="${escapeHtml((choice.label + ' ' + (choice.sub || '')).toLowerCase())}">
          <input type="checkbox" value="${escapeHtml(choice.id)}" ${isChecked ? 'checked' : ''}>
          <span class="pf-choice-indicator" style="background:${dotColor}"></span>
          <span class="pf-choice-content">
            <strong>${escapeHtml(choice.label)}</strong>
            <small>${escapeHtml(choice.sub)}</small>
          </span>
          <span class="pf-choice-badge ${choice.category}">${badgeText}</span>
        </label>`;
    }).join('');

    return `<div class="pf-chart-panel">
      <div class="pf-card-head pf-chart-head">
        <div class="pf-chart-title-wrap">
          <h4>Evolución de la cartera</h4>
          <p>Serie temporal comparativa de valores, lotes y grupos según tus compras y ventas.</p>
        </div>
        <div class="pf-chart-controls">
          <div class="pf-metric-wrap">
            <select class="pf-select pf-chart-metric-select" data-pf-chart-metric aria-label="Métrica del gráfico">
              ${CHART_METRICS.map(([key, label]) => `<option value="${key}" ${chartMetric === key ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
          <div class="pf-range-pills" role="group" aria-label="Rango temporal">
            ${rangePillsHtml}
          </div>
          <div class="pf-chart-zoom-group" role="group" aria-label="Zoom del gráfico">
            <button class="pf-zoom-btn" type="button" data-pf-zoom="in" title="Acercar zoom (+)" aria-label="Acercar zoom">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="6"/><path d="M13.5 13.5 18 18M9 6v6M6 9h6"/></svg>
            </button>
            <button class="pf-zoom-btn" type="button" data-pf-zoom="out" title="Alejar zoom (−)" aria-label="Alejar zoom">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="6"/><path d="M13.5 13.5 18 18M6 9h6"/></svg>
            </button>
            <button class="pf-zoom-btn pf-zoom-reset" type="button" data-pf-zoom="reset" title="Restablecer vista completa" aria-label="Restablecer vista">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a7 7 0 1 0 2-4.9L3 7"/><path d="M3 3v4h4"/></svg>
            </button>
          </div>
          <button class="pf-outline-button pf-measure-tool-btn" type="button" data-pf-chart-measure title="Regla / Cuadrícula de medición (clic y arrastrar en el gráfico, o Shift + clic izquierdo)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.3 15.3 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4l12.6 12.6a2.41 2.41 0 0 0 3.4 0l2.6-2.6a2.41 2.41 0 0 0 0-3.4Z"/><path d="m14.5 5.5 2 2M11.5 8.5l2 2M8.5 11.5l2 2M5.5 14.5l2 2"/></svg>
            <span>Medir</span>
          </button>
          <button class="pf-outline-button pf-chart-picker-btn" type="button" data-pf-chart-picker aria-expanded="false">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1"></rect><rect x="11" y="3" width="6" height="6" rx="1"></rect><rect x="11" y="11" width="6" height="6" rx="1"></rect><rect x="3" y="11" width="6" height="6" rx="1"></rect></svg>
            <span>Elementos (${selected.size})</span>
          </button>
          <button class="pf-outline-button pf-chart-fullscreen-btn" type="button" data-pf-chart-fullscreen title="Pantalla completa (F o clic)" aria-label="Pantalla completa">
            <svg class="pf-icon-maximize" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4"/></svg>
            <svg class="pf-icon-minimize" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none"><path d="M7 3v4H3M13 3v4h4M7 17v-4H3M13 17v-4h4"/></svg>
          </button>
          <button class="pf-outline-button pf-chart-close-btn" type="button" data-pf-chart-close title="Ocultar gráfico" aria-label="Cerrar gráfico">×</button>
        </div>
      </div>

      <div class="pf-chart-picker-panel" data-pf-chart-picker-box hidden>
        <div class="pf-picker-topbar">
          <div class="pf-picker-tabs" role="tablist">
            <button type="button" class="pf-picker-tab active" data-picker-tab="all">Todos <span class="pf-picker-pill">${choices.length}</span></button>
            <button type="button" class="pf-picker-tab" data-picker-tab="valores">Valores <span class="pf-picker-pill">${valoresCount}</span></button>
            <button type="button" class="pf-picker-tab" data-picker-tab="grupos">Grupos <span class="pf-picker-pill">${gruposCount}</span></button>
            <button type="button" class="pf-picker-tab" data-picker-tab="lotes">Lotes <span class="pf-picker-pill">${lotesCount}</span></button>
          </div>
          <div class="pf-picker-search-wrap">
            <input type="search" class="pf-picker-search-input" placeholder="Buscar valor, grupo o lote…" data-picker-search aria-label="Buscar elementos">
          </div>
          <div class="pf-picker-actions">
            <button type="button" class="pf-picker-act-btn" data-picker-quick="top">Valores</button>
            <button type="button" class="pf-picker-act-btn" data-picker-quick="groups">Grupos</button>
            <button type="button" class="pf-picker-act-btn" data-picker-quick="clear">Desmarcar</button>
            <span class="pf-picker-count-badge" data-picker-counter>${selected.size} / 20 seleccionados</span>
          </div>
        </div>
        <div class="pf-chart-choice-list" data-picker-choice-list>
          ${choicesHtml}
        </div>
      </div>

      <div class="pf-chart-status-bar">
        <span class="pf-chart-status-info" data-pf-chart-status>Cargando datos…</span>
        <span class="pf-chart-source-tag">Yahoo Finance · Cotizaciones ajustadas</span>
      </div>

      <div class="pf-chart-layout">
        <div class="pf-chart-main">
          <div class="pf-chart-canvas-wrap" data-pf-chart></div>
        </div>
        <div class="pf-chart-sidebar">
          <div class="pf-chart-legend-title">Elementos en el gráfico</div>
          <ul class="pf-chart-legend" data-pf-chart-legend></ul>
        </div>
      </div>

      <p class="pf-chart-note">Las líneas completamente vendidas mantienen constante su ganancia realizada desde la fecha de venta. Días sin cotización usan el último cierre disponible.</p>
    </div>`;
  }

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

  function computeChartScale(values, isCenteredMetric, metric) {
    if (!values || !values.length) {
      return { min: -10, max: 10, ticks: [-10, -5, 0, 5, 10], step: 5 };
    }
    if (isCenteredMetric) {
      const minVal = Math.min(...values, 0);
      const maxVal = Math.max(...values, 0);
      const span = Math.max(maxVal - minVal, 0.001);
      if (span <= 0.001) {
        const bound = metric === 'gainAmount' ? 50 : 5;
        return { min: -bound, max: bound, ticks: [-bound, -bound / 2, 0, bound / 2, bound], step: bound / 2 };
      }
      const targetStep = (span * 1.08) / 5;
      const step = computeNiceStep(targetStep);
      const negSteps = minVal < 0 ? Math.max(1, Math.ceil((Math.abs(minVal) * 1.04) / step)) : 0;
      const posSteps = maxVal > 0 ? Math.max(1, Math.ceil((maxVal * 1.04) / step)) : 0;

      const finalNegSteps = Math.max(negSteps, 0);
      const finalPosSteps = Math.max(posSteps, 0);
      const min = -finalNegSteps * step;
      const max = finalPosSteps * step;

      if (min === max) {
        return { min: -step, max: step, ticks: [-step, 0, step], step };
      }

      const ticks = [];
      for (let i = -finalNegSteps; i <= finalPosSteps; i++) {
        ticks.push(i * step);
      }
      return { min, max, ticks, step };
    } else {
      const maxVal = Math.max(...values, 0);
      if (maxVal <= 0.001) {
        const bound = metric === 'weight' ? 10 : 5;
        return { min: 0, max: bound, ticks: [0, bound / 4, bound / 2, bound * 0.75, bound], step: bound / 4 };
      }
      const targetStep = (maxVal * 1.08) / 4;
      const step = computeNiceStep(targetStep);
      const numSteps = Math.max(1, Math.ceil((maxVal * 1.04) / step));
      const bound = step * numSteps;
      const ticks = [];
      for (let i = 0; i <= numSteps; i++) {
        ticks.push(i * step);
      }
      return { min: 0, max: bound, ticks, step };
    }
  }

  function getActiveChartGeometry(panel) {
    const isFs = panel?.classList.contains('is-fullscreen') || document.fullscreenElement === panel;
    const width = isFs ? 1120 : 860;
    const height = isFs ? 560 : 430;
    const pad = isFs ? { left: 70, right: 20, top: 24, bottom: 34 } : { left: 62, right: 18, top: 20, bottom: 30 };
    const innerWidth = width - pad.left - pad.right;
    const innerHeight = height - pad.top - pad.bottom;
    return { isFs, width, height, pad, innerWidth, innerHeight };
  }

  function chartFormat(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    if (chartMetric === 'gainPct') return fmtSignedPct(value);
    if (chartMetric === 'gainAmount') return fmtSigned(value);
    return fmtPct(value);
  }

  function chartAxisFormat(value) {
    if (!Number.isFinite(Number(value))) return '—';
    const num = Math.abs(value) < 1e-9 ? 0 : Number(value);
    const formatted = formatNumber(Math.abs(num), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (chartMetric === 'gainAmount') {
      if (num > 0) return `+$${formatted}`;
      if (num < 0) return `-$${formatted}`;
      return `$${formatted}`;
    }
    if (chartMetric === 'gainPct') {
      if (num > 0) return `+${formatted} %`;
      if (num < 0) return `-${formatted} %`;
      return `${formatted} %`;
    }
    return `${formatted} %`;
  }

  const RANGE_DAYS = { '1m': 31, '3m': 93, '6m': 186, '1y': 365, '2y': 730, '3y': 1095, '5y': 1825 };
  const SPANISH_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  function formatTradingViewHoverDate(isoDate) {
    if (!isoDate) return '';
    const parts = String(isoDate).split('-');
    if (parts.length !== 3) return isoDate;
    const year = parts[0];
    const mIdx = parseInt(parts[1], 10) - 1;
    const day = parts[2];
    const m = SPANISH_MONTHS[mIdx] || parts[1];
    return `${day} ${m} ${year}`;
  }

  function fmtDateDisplay(isoDate) {
    if (!isoDate) return '—';
    return formatTradingViewHoverDate(isoDate);
  }

  function getTradingViewDateTicks(points, xFunc, pad, width) {
    if (!points || !points.length) return [];
    const n = points.length;
    if (n === 1) {
      return [{ index: 0, x: xFunc(0), label: formatTradingViewHoverDate(points[0].date), isMajor: true, date: points[0].date }];
    }

    const parsed = points.map((p, i) => {
      const [y, m, d] = String(p.date).split('-').map(Number);
      return { index: i, date: p.date, year: y, month: m - 1, day: d };
    });

    const first = parsed[0];
    const last = parsed[n - 1];
    const startDate = new Date(`${first.date}T00:00:00Z`);
    const endDate = new Date(`${last.date}T00:00:00Z`);
    const totalDays = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));

    const ticks = [];
    const minSpacing = 58;

    if (totalDays > 1000) {
      // Multi-year (> 3 years): Major ticks on Years (e.g. 2021, 2022, 2023, 2024, 2025)
      const yearStep = totalDays > 3650 ? 3 : totalDays > 2000 ? 2 : 1;
      let lastRecordedYear = null;

      parsed.forEach((pt) => {
        if (lastRecordedYear === null || pt.year !== lastRecordedYear) {
          if (lastRecordedYear === null || (pt.year - lastRecordedYear) >= yearStep) {
            ticks.push({
              index: pt.index,
              x: xFunc(pt.index),
              label: String(pt.year),
              isMajor: true,
              date: pt.date,
            });
            lastRecordedYear = pt.year;
          }
        }
      });

      if (ticks.length <= 3 && totalDays <= 2200) {
        parsed.forEach((pt) => {
          if (pt.month === 6 && pt.day <= 10) {
            ticks.push({
              index: pt.index,
              x: xFunc(pt.index),
              label: `Jul '${String(pt.year).slice(2)}`,
              isMajor: false,
              date: pt.date,
            });
          }
        });
        ticks.sort((a, b) => a.index - b.index);
      }
    } else if (totalDays > 240) {
      // 8 months to 3 years: Month or bi-monthly ticks
      const monthStep = totalDays > 600 ? 3 : totalDays > 400 ? 2 : 1;
      let prevYear = null;
      let lastMonthDiff = -999;

      parsed.forEach((pt, i) => {
        const monthDiff = (pt.year - first.year) * 12 + pt.month;
        const isNewMonth = i === 0 || pt.month !== parsed[i - 1].month;
        if (isNewMonth) {
          if (monthDiff - lastMonthDiff >= monthStep || pt.month === 0) {
            const isYearStart = pt.month === 0 || (prevYear !== null && pt.year !== prevYear);
            const label = isYearStart ? String(pt.year) : SPANISH_MONTHS[pt.month];
            ticks.push({
              index: pt.index,
              x: xFunc(pt.index),
              label,
              isMajor: isYearStart,
              date: pt.date,
            });
            lastMonthDiff = monthDiff;
            prevYear = pt.year;
          }
        }
      });
    } else if (totalDays > 45) {
      // 1.5 to 8 months: 1st of month and 15th
      let addedMidForMonth = null;

      parsed.forEach((pt, i) => {
        const isNewMonth = i === 0 || pt.month !== parsed[i - 1].month;
        if (isNewMonth) {
          const isYearStart = pt.month === 0;
          const label = isYearStart ? String(pt.year) : SPANISH_MONTHS[pt.month];
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label,
            isMajor: true,
            date: pt.date,
          });
        } else if (pt.day >= 15 && addedMidForMonth !== pt.month) {
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label: totalDays > 120 ? '15' : `15 ${SPANISH_MONTHS[pt.month]}`,
            isMajor: false,
            date: pt.date,
          });
          addedMidForMonth = pt.month;
        }
      });
    } else if (totalDays > 14) {
      // 2 weeks to 1.5 months: Weekly ticks
      let lastDay = -999;
      parsed.forEach((pt, i) => {
        const isNewMonth = i === 0 || pt.month !== parsed[i - 1].month;
        if (isNewMonth) {
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label: SPANISH_MONTHS[pt.month],
            isMajor: true,
            date: pt.date,
          });
          lastDay = pt.day;
        } else if (Math.abs(pt.day - lastDay) >= 6) {
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label: `${pt.day} ${SPANISH_MONTHS[pt.month]}`,
            isMajor: false,
            date: pt.date,
          });
          lastDay = pt.day;
        }
      });
    } else {
      // Very short range (< 14 days): Every 2-3 trading days
      const step = n > 8 ? 2 : 1;
      parsed.forEach((pt, i) => {
        if (i % step === 0 || i === n - 1) {
          const isNewMonth = i === 0 || pt.month !== parsed[i - 1]?.month;
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label: `${pt.day} ${SPANISH_MONTHS[pt.month]}`,
            isMajor: isNewMonth,
            date: pt.date,
          });
        }
      });
    }

    if (ticks.length < 2) {
      const step = Math.max(1, Math.floor(n / 4));
      for (let i = 0; i < n; i += step) {
        const pt = parsed[i];
        ticks.push({
          index: pt.index,
          x: xFunc(pt.index),
          label: `${pt.day} ${SPANISH_MONTHS[pt.month]}`,
          isMajor: i === 0,
          date: pt.date,
        });
      }
      if (ticks[ticks.length - 1].index !== n - 1) {
        const pt = parsed[n - 1];
        ticks.push({
          index: pt.index,
          x: xFunc(pt.index),
          label: `${pt.day} ${SPANISH_MONTHS[pt.month]}`,
          isMajor: false,
          date: pt.date,
        });
      }
    }

    // Filter overlapping ticks
    const filtered = [];
    ticks.forEach((t) => {
      if (!filtered.length) {
        filtered.push(t);
        return;
      }
      const prev = filtered[filtered.length - 1];
      if (t.x - prev.x >= minSpacing) {
        filtered.push(t);
      } else if (t.isMajor && !prev.isMajor) {
        filtered[filtered.length - 1] = t;
      }
    });

    return filtered;
  }

  function computeSliceIndicesForRange(allPoints, rangeKey) {
    if (!allPoints || !allPoints.length) return { start: 0, end: 0 };
    const total = allPoints.length;
    if (rangeKey === 'all' || !RANGE_DAYS[rangeKey]) {
      return { start: 0, end: total - 1 };
    }
    const days = RANGE_DAYS[rangeKey];
    const lastDateStr = allPoints[total - 1].date;
    const lastDate = new Date(`${lastDateStr}T00:00:00Z`);
    const cutoff = new Date(lastDate);
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    let startIdx = allPoints.findIndex((pt) => pt.date >= cutoffStr);
    if (startIdx < 0) startIdx = 0;
    return { start: startIdx, end: total - 1 };
  }

  function updateQuickRangeButtonsUi(panel) {
    if (!chartCachedData?.points?.length) return;
    const total = chartCachedData.points.length;
    let matchingKey = null;
    if (chartSliceStart === 0 && chartSliceEnd === total - 1) {
      matchingKey = 'all';
    } else {
      for (const [key] of CHART_RANGES) {
        if (key === 'all') continue;
        const { start, end } = computeSliceIndicesForRange(chartCachedData.points, key);
        if (Math.abs(start - chartSliceStart) <= 1 && Math.abs(end - chartSliceEnd) <= 1) {
          matchingKey = key;
          break;
        }
      }
    }
    panel.querySelectorAll('[data-pf-range]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.pfRange === matchingKey);
    });
  }

  function updateTimelineSliderUi(panel) {
    if (!chartCachedData?.points?.length) return;
    const total = chartCachedData.points.length;
    const pStart = chartSliceStart / Math.max(1, total - 1);
    const pEnd = chartSliceEnd / Math.max(1, total - 1);

    const windowEl = panel.querySelector('[data-timeline-window]');
    const maskLeft = panel.querySelector('[data-timeline-mask-left]');
    const maskRight = panel.querySelector('[data-timeline-mask-right]');
    const fromDateEl = panel.querySelector('[data-timeline-from-date]');
    const toDateEl = panel.querySelector('[data-timeline-to-date]');

    if (windowEl) {
      windowEl.style.left = `${(pStart * 100).toFixed(3)}%`;
      windowEl.style.width = `${Math.max(0.5, (pEnd - pStart) * 100).toFixed(3)}%`;
    }
    if (maskLeft) {
      maskLeft.style.width = `${(pStart * 100).toFixed(3)}%`;
    }
    if (maskRight) {
      maskRight.style.left = `${(pEnd * 100).toFixed(3)}%`;
      maskRight.style.width = `${Math.max(0, (1 - pEnd) * 100).toFixed(3)}%`;
    }
    if (fromDateEl && chartCachedData.points[chartSliceStart]) {
      fromDateEl.textContent = fmtDateDisplay(chartCachedData.points[chartSliceStart].date);
    }
    if (toDateEl && chartCachedData.points[chartSliceEnd]) {
      toDateEl.textContent = fmtDateDisplay(chartCachedData.points[chartSliceEnd].date);
    }
  }

  function scheduleChartRedraw(panel) {
    if (chartRedrawRaf) return;
    chartRedrawRaf = requestAnimationFrame(() => {
      chartRedrawRaf = null;
      renderChartMainSvg(panel);
      updateTimelineSliderUi(panel);
    });
  }

  function renderTimelineSparkline(panel, allPoints, labels) {
    const sparklineSvg = panel.querySelector('[data-timeline-sparkline]');
    if (!sparklineSvg || !allPoints.length) return;

    const vals = allPoints.map((pt) => {
      const v = pt.series?.find((val) => val !== null && val !== undefined && Number.isFinite(Number(val)));
      return v !== undefined ? Number(v) : null;
    });

    const validVals = vals.filter((v) => v !== null);
    if (!validVals.length) return;

    const isCenteredMetric = chartMetric === 'gainPct' || chartMetric === 'gainAmount';
    let min;
    let max;

    if (isCenteredMetric) {
      const maxAbs = Math.max(...validVals.map((v) => Math.abs(v)), 0);
      const bound = maxAbs > 0 ? maxAbs * 1.1 : 10;
      min = -bound;
      max = bound;
    } else {
      const maxVal = Math.max(...validVals, 0);
      min = 0;
      max = maxVal > 0 ? maxVal * 1.1 : 5;
    }

    const w = 760;
    const h = 32;
    let d = '';
    let areaD = '';
    let inSeg = false;
    let lastX = 0;
    const baseY = (h - 2 - ((Math.max(0, min) - min) / (max - min)) * (h - 6)).toFixed(1);

    vals.forEach((v, i) => {
      const px = ((i / Math.max(1, vals.length - 1)) * w).toFixed(1);
      if (v !== null) {
        const py = (h - 2 - ((v - min) / (max - min)) * (h - 6)).toFixed(1);
        if (!inSeg) {
          d += `${d ? ' ' : ''}M${px},${py}`;
          areaD += `${areaD ? ' ' : ''}M${px},${baseY} L${px},${py}`;
          inSeg = true;
        } else {
          d += ` L${px},${py}`;
          areaD += ` L${px},${py}`;
        }
        lastX = px;
      } else {
        if (inSeg) {
          areaD += ` L${lastX},${baseY} Z`;
          inSeg = false;
        }
      }
    });
    if (inSeg) {
      areaD += ` L${lastX},${baseY} Z`;
    }

    sparklineSvg.innerHTML = `
      <defs>
        <linearGradient id="pf-spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.30"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.05"/>
        </linearGradient>
      </defs>
      ${areaD ? `<path d="${areaD}" fill="url(#pf-spark-grad)"/>` : ''}
      ${d ? `<path d="${d}" fill="none" stroke="#93c5fd" stroke-width="1.2" stroke-linejoin="round"/>` : ''}`;
  }

  function renderChartMainSvg(panel) {
    if (!chartCachedData) return;
    const canvasInner = panel.querySelector('[data-pf-chart-canvas-inner]');
    const legend = panel.querySelector('[data-pf-chart-legend]');
    if (!canvasInner) return;

    const allPoints = chartCachedData.points ?? [];
    if (!allPoints.length) return;

    const points = allPoints.slice(chartSliceStart, chartSliceEnd + 1);
    if (!points.length) return;

    const values = points.flatMap((point) => point.series).filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number);
    if (!values.length) {
      canvasInner.innerHTML = '<div class="pf-chart-empty"><p>No hay cotizaciones para el rango seleccionado.</p></div>';
      return;
    }

    const isCenteredMetric = chartMetric === 'gainPct' || chartMetric === 'gainAmount';
    const { isFs, width, height, pad, innerWidth, innerHeight } = getActiveChartGeometry(panel);
    const { min, max, ticks } = computeChartScale(values, isCenteredMetric, chartMetric);

    const x = (index) => pad.left + (index / Math.max(1, points.length - 1)) * innerWidth;
    const y = (value) => pad.top + (1 - (value - min) / (max - min)) * innerHeight;

    const seriesColors = chartCachedData.labels.map((label, idx) => label.color || CHART_PALETTE[idx % CHART_PALETTE.length]);

    const svgGradients = chartCachedData.labels.map((_, i) => `
      <linearGradient id="pf-chart-grad-${i}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${seriesColors[i]}" stop-opacity="0.20"/>
        <stop offset="100%" stop-color="${seriesColors[i]}" stop-opacity="0.00"/>
      </linearGradient>
    `).join('');

    const pathsSvg = chartCachedData.labels.map((label, seriesIdx) => {
      let d = '';
      let areaD = '';
      let inSeg = false;
      let lastValidIdx = 0;

      points.forEach((point, index) => {
        const val = point.series?.[seriesIdx];
        if (val !== null && val !== undefined && Number.isFinite(Number(val))) {
          const px = x(index).toFixed(1);
          const py = y(Number(val)).toFixed(1);
          if (!inSeg) {
            d += `${d ? ' ' : ''}M${px},${py}`;
            const baseY = y(Math.max(0, min)).toFixed(1);
            areaD += `${areaD ? ' ' : ''}M${px},${baseY} L${px},${py}`;
            inSeg = true;
          } else {
            d += ` L${px},${py}`;
            areaD += ` L${px},${py}`;
          }
          lastValidIdx = index;
        } else {
          if (inSeg) {
            const lastPx = x(lastValidIdx).toFixed(1);
            const baseY = y(Math.max(0, min)).toFixed(1);
            areaD += ` L${lastPx},${baseY} Z`;
            inSeg = false;
          }
        }
      });

      if (inSeg) {
        const lastPx = x(lastValidIdx).toFixed(1);
        const baseY = y(Math.max(0, min)).toFixed(1);
        areaD += ` L${lastPx},${baseY} Z`;
      }

      const color = seriesColors[seriesIdx];
      const isSingle = chartCachedData.labels.length === 1;
      const strokeW = isFs ? '2.8' : '2.2';
      const areaEl = isSingle && areaD ? `<path d="${areaD}" fill="url(#pf-chart-grad-${seriesIdx})" class="pf-chart-area" data-series-index="${seriesIdx}"/>` : '';
      const lineEl = d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round" class="pf-chart-line" data-series-index="${seriesIdx}"/>` : '';

      return `${areaEl}${lineEl}`;
    }).join('');

    const yLabelFontSize = isFs ? '11px' : '9.5px';
    const xLabelFontSize = isFs ? '11px' : '10px';

    const gridLines = ticks.map((value) => {
      const tickY = y(value);
      return `
        <line x1="${pad.left}" y1="${tickY.toFixed(1)}" x2="${width - pad.right}" y2="${tickY.toFixed(1)}" class="pf-chart-grid-line"/>
        <text x="${pad.left - 8}" y="${(tickY + 3.5).toFixed(1)}" class="pf-chart-y-label" font-size="${yLabelFontSize}" text-anchor="end">${escapeHtml(chartAxisFormat(value))}</text>`;
    }).join('');

    const zeroLine = (min <= 0 && max >= 0 && isCenteredMetric)
      ? `<line x1="${pad.left}" y1="${y(0).toFixed(1)}" x2="${width - pad.right}" y2="${y(0).toFixed(1)}" class="pf-chart-zero"/>`
      : '';

    const dateTicks = getTradingViewDateTicks(points, x, pad, width);

    const vGridLines = dateTicks.map((tick) => `
      <line x1="${tick.x.toFixed(1)}" y1="${pad.top}" x2="${tick.x.toFixed(1)}" y2="${height - pad.bottom}" class="pf-chart-vgrid-line"/>
      <line x1="${tick.x.toFixed(1)}" y1="${height - pad.bottom}" x2="${tick.x.toFixed(1)}" y2="${(height - pad.bottom + 4).toFixed(1)}" class="pf-chart-tick-mark"/>
      <text x="${tick.x.toFixed(1)}" y="${height - 8}" class="pf-chart-x-label ${tick.isMajor ? 'major' : ''}" font-size="${xLabelFontSize}" text-anchor="middle">${escapeHtml(tick.label)}</text>
    `).join('');

    const axisBaselines = `
      <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="pf-chart-axis-baseline"/>
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="pf-chart-axis-baseline"/>
    `;

    canvasInner.innerHTML = `
      <svg class="pf-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Evolución histórica">
        <defs>
          ${svgGradients}
        </defs>
        ${gridLines}
        ${vGridLines}
        ${axisBaselines}
        ${zeroLine}
        ${pathsSvg}
        <g class="pf-chart-compare-layer" style="display:none;">
          <rect class="pf-chart-compare-band" x="0" y="${pad.top}" width="0" height="${innerHeight}" fill="rgba(34, 197, 94, 0.13)"/>
          <line class="pf-chart-compare-v1" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}" stroke="rgba(255, 255, 255, 0.45)" stroke-width="1.2" stroke-dasharray="3 3"/>
          <line class="pf-chart-compare-v2" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}" stroke="rgba(255, 255, 255, 0.45)" stroke-width="1.2" stroke-dasharray="3 3"/>
          <line class="pf-chart-compare-baseline" x1="0" y1="0" x2="0" y2="0" stroke="rgba(255, 255, 255, 0.3)" stroke-width="1" stroke-dasharray="2 2"/>
          <g class="pf-chart-compare-conns"></g>
          <g class="pf-chart-compare-pts1"></g>
          <g class="pf-chart-compare-pts2"></g>
          <g class="pf-chart-compare-badge" transform="translate(0, 0)">
            <rect class="pf-chart-compare-badge-bg" x="-60" y="-13" width="120" height="26" rx="6" ry="6" fill="#18181b" fill-opacity="0.95" stroke="#16a34a" stroke-width="1.2"/>
            <text class="pf-chart-compare-badge-text" x="0" y="4" text-anchor="middle" fill="#16a34a" font-size="12" font-weight="700">--</text>
          </g>
        </g>
        <g class="pf-chart-measure-layer" style="display:none;">
          <rect class="pf-chart-measure-box" x="0" y="0" width="0" height="0" fill="rgba(239, 68, 68, 0.08)" stroke="rgba(220, 38, 38, 0.65)" stroke-width="1.4" stroke-dasharray="4 3" rx="2" ry="2"/>
          <line class="pf-chart-measure-diagonal" x1="0" y1="0" x2="0" y2="0" stroke="rgba(220, 38, 38, 0.85)" stroke-width="1.8" stroke-dasharray="5 3"/>
          <circle class="pf-chart-measure-pt1" cx="0" cy="0" r="4" fill="#dc2626" stroke="#ffffff" stroke-width="1.4"/>
          <circle class="pf-chart-measure-pt2" cx="0" cy="0" r="4" fill="#dc2626" stroke="#ffffff" stroke-width="1.4"/>
          <g class="pf-chart-measure-badge" transform="translate(0, 0)">
            <rect class="pf-chart-measure-badge-bg" x="-54" y="-12" width="108" height="24" rx="5" ry="5" fill="#1e1b1b" fill-opacity="0.94" stroke="rgba(239, 68, 68, 0.35)" stroke-width="0.9"/>
            <text class="pf-chart-measure-badge-text" x="0" y="4" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="600">--</text>
          </g>
        </g>
        <g class="pf-chart-hover-layer" style="display:none;">
          <line class="pf-chart-crosshair pf-chart-crosshair-v" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}"/>
          <line class="pf-chart-crosshair pf-chart-crosshair-h" x1="${pad.left}" y1="0" x2="${width - pad.right}" y2="0"/>
          <g class="pf-chart-hover-dots"></g>
          <g class="pf-chart-x-badge" transform="translate(0, ${height - pad.bottom})">
            <rect class="pf-chart-x-badge-bg" x="-42" y="2" width="84" height="20" rx="4" ry="4"/>
            <text class="pf-chart-x-badge-text" x="0" y="16" text-anchor="middle">--</text>
          </g>
          <g class="pf-chart-y-badge" transform="translate(4, 0)">
            <rect class="pf-chart-y-badge-bg" x="0" y="-10" width="${pad.left - 8}" height="20" rx="3"/>
            <path class="pf-chart-y-badge-arrow" d="M ${pad.left - 8},0 L ${pad.left - 3},-6 L ${pad.left - 3},6 Z" fill="#0f172a"/>
            <text class="pf-chart-y-badge-text" x="${(pad.left - 8) / 2}" y="0" text-anchor="middle">--</text>
          </g>
        </g>
        <rect class="pf-chart-overlay" x="${pad.left}" y="${pad.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent" cursor="crosshair"/>
      </svg>`;

    // Update legend chips
    if (legend) {
      legend.innerHTML = chartCachedData.labels.map((label, index) => {
        const color = seriesColors[index];
        let latestVal = null;
        for (let i = points.length - 1; i >= 0; i--) {
          const v = points[i]?.series?.[index];
          if (v !== null && v !== undefined && Number.isFinite(Number(v))) {
            latestVal = Number(v);
            break;
          }
        }
        const valClass = latestVal !== null ? (latestVal > 0 ? 'positive' : latestVal < 0 ? 'negative' : '') : '';
        return `
          <li class="pf-legend-chip" data-legend-series="${index}">
            <span class="pf-legend-dot" style="background:${color}"></span>
            <span class="pf-legend-name" title="${escapeHtml(label.label)}">${escapeHtml(label.label)}</span>
            ${latestVal !== null ? `<span class="pf-legend-val ${valClass}">${escapeHtml(chartFormat(latestVal))}</span>` : ''}
            <button type="button" class="pf-legend-remove" data-remove-id="${escapeHtml(label.id)}" title="Quitar ${escapeHtml(label.label)}" aria-label="Quitar">×</button>
          </li>`;
      }).join('');

      // Wire legend hover
      legend.querySelectorAll('.pf-legend-chip').forEach((chip) => {
        const sIdx = chip.dataset.legendSeries;
        chip.addEventListener('mouseenter', () => {
          canvasInner.querySelectorAll('.pf-chart-line, .pf-chart-area').forEach((line) => {
            if (line.dataset.seriesIndex === sIdx) {
              line.style.opacity = '1';
              line.style.strokeWidth = '3.2';
            } else {
              line.style.opacity = '0.18';
            }
          });
        });
        chip.addEventListener('mouseleave', () => {
          canvasInner.querySelectorAll('.pf-chart-line, .pf-chart-area').forEach((line) => {
            line.style.opacity = '1';
            line.style.strokeWidth = '2.2';
          });
        });
      });

      // Wire legend remove
      legend.querySelectorAll('.pf-legend-remove').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const removeId = btn.dataset.removeId;
          chartSelectedIds = chartSelectedIds.filter((id) => id !== removeId);
          if (chartSelectedIdsCallback) chartSelectedIdsCallback(chartSelectedIds);
          syncPickerChecked(panel);
          loadPortfolioChart(panel);
        });
      });
    }
  }

  function zoomChartByStep(panel, direction) {
    if (!chartCachedData?.points?.length) return;
    const total = chartCachedData.points.length;
    if (total <= 3) return;

    if (direction === 'reset') {
      chartSliceStart = 0;
      chartSliceEnd = total - 1;
      chartRange = 'all';
      scheduleChartRedraw(panel);
      updateTimelineSliderUi(panel);
      updateQuickRangeButtonsUi(panel);
      return;
    }

    const currentSpan = chartSliceEnd - chartSliceStart;
    const factor = direction === 'in' ? 0.70 : 1.40;
    let newSpan = Math.round(currentSpan * factor);
    if (direction === 'in' && newSpan >= currentSpan) newSpan = currentSpan - 1;
    if (direction === 'out' && newSpan <= currentSpan) newSpan = currentSpan + 1;

    const minSpan = Math.min(3, total - 1);
    const maxSpan = total - 1;
    newSpan = Math.max(minSpan, Math.min(maxSpan, newSpan));

    if (newSpan === currentSpan) return;

    const centerIdx = chartSliceStart + currentSpan / 2;
    let newStart = Math.round(centerIdx - newSpan / 2);
    let newEnd = newStart + newSpan;

    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(total - 1, newSpan);
    } else if (newEnd > total - 1) {
      newEnd = total - 1;
      newStart = Math.max(0, total - 1 - newSpan);
    }

    chartSliceStart = newStart;
    chartSliceEnd = newEnd;
    scheduleChartRedraw(panel);
    updateTimelineSliderUi(panel);
    updateQuickRangeButtonsUi(panel);
  }

  function attachChartCanvasInteractions(panel) {
    const canvasInner = panel.querySelector('[data-pf-chart-canvas-inner]');
    if (!canvasInner) return;

    let isPanning = false;
    let panStartX = 0;
    let panInitStart = 0;
    let panInitEnd = 0;
    let panMoved = false;

    // Accumulator-based progressive Wheel Zoom (in / out) centered around cursor
    let zoomAccumulator = 0;
    let zoomResetTimer = null;

    canvasInner.addEventListener('wheel', (event) => {
      if (!chartCachedData?.points?.length) return;
      const total = chartCachedData.points.length;
      if (total <= 3) return;

      event.preventDefault();
      event.stopPropagation();

      const rect = canvasInner.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const width = 760;
      const pad = { left: 58, right: 16 };
      const innerWidth = width - pad.left - pad.right;

      const cursorSvgX = ((event.clientX - rect.left) / rect.width) * width;
      const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));

      // Normalize delta across input devices (mouse wheel vs trackpad)
      let rawDelta = event.deltaY;
      if (event.deltaMode === 1) rawDelta *= 16;
      else if (event.deltaMode === 2) rawDelta *= 100;

      zoomAccumulator += rawDelta;
      if (zoomResetTimer) clearTimeout(zoomResetTimer);
      zoomResetTimer = setTimeout(() => { zoomAccumulator = 0; }, 140);

      // Only step once accumulated delta reaches threshold
      const threshold = 35;
      if (Math.abs(zoomAccumulator) < threshold) return;

      const steps = Math.trunc(zoomAccumulator / threshold);
      zoomAccumulator -= steps * threshold;

      const currentSpan = chartSliceEnd - chartSliceStart;
      // 4% zoom change per step
      const factor = Math.pow(1.04, steps);
      let newSpan = Math.round(currentSpan * factor);

      if (steps < 0 && newSpan >= currentSpan) newSpan = currentSpan - 1;
      if (steps > 0 && newSpan <= currentSpan) newSpan = currentSpan + 1;

      const minSpan = Math.min(3, total - 1);
      const maxSpan = total - 1;
      newSpan = Math.max(minSpan, Math.min(maxSpan, newSpan));

      if (newSpan === currentSpan) return;

      const pivotIdx = chartSliceStart + ratio * currentSpan;
      let newStart = Math.round(pivotIdx - ratio * newSpan);
      let newEnd = newStart + newSpan;

      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, newSpan);
      } else if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, total - 1 - newSpan);
      }

      if (newStart !== chartSliceStart || newEnd !== chartSliceEnd) {
        chartSliceStart = newStart;
        chartSliceEnd = newEnd;
        scheduleChartRedraw(panel);
        updateTimelineSliderUi(panel);
        updateQuickRangeButtonsUi(panel);
      }
    }, { passive: false });

    // Double-click on chart to zoom in or reset
    canvasInner.addEventListener('dblclick', (event) => {
      event.preventDefault();
      if (!chartCachedData?.points?.length) return;
      const total = chartCachedData.points.length;
      if (chartSliceStart === 0 && chartSliceEnd === total - 1) {
        const rect = canvasInner.getBoundingClientRect();
        const width = 760;
        const pad = { left: 58, right: 16 };
        const innerWidth = width - pad.left - pad.right;
        const cursorSvgX = ((event.clientX - rect.left) / rect.width) * width;
        const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));
        const newSpan = Math.max(10, Math.round(total * 0.4));
        const pivotIdx = Math.round(ratio * (total - 1));
        let newStart = Math.round(pivotIdx - newSpan / 2);
        let newEnd = newStart + newSpan;
        if (newStart < 0) { newStart = 0; newEnd = Math.min(total - 1, newSpan); }
        else if (newEnd > total - 1) { newEnd = total - 1; newStart = Math.max(0, total - 1 - newSpan); }
        chartSliceStart = newStart;
        chartSliceEnd = newEnd;
      } else {
        chartSliceStart = 0;
        chartSliceEnd = total - 1;
        chartRange = 'all';
      }
      scheduleChartRedraw(panel);
      updateTimelineSliderUi(panel);
      updateQuickRangeButtonsUi(panel);
    });

    // Prevent context menu on chart canvas
    canvasInner.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    panel.addEventListener('contextmenu', (event) => {
      if (isMeasuring || isMeasureToolActive || event.target.closest('.pf-chart-svg, .pf-chart-canvas-wrap, [data-pf-chart-canvas-inner]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    canvasInner.addEventListener('mousedown', (event) => {
      if (event.button === 2) {
        event.preventDefault();
      }
    });

    let isMeasureToolActive = false;
    const measureBtn = panel.querySelector('[data-pf-chart-measure]');
    if (measureBtn) {
      measureBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isMeasureToolActive = !isMeasureToolActive;
        measureBtn.classList.toggle('active', isMeasureToolActive);
        measureBtn.setAttribute('aria-pressed', isMeasureToolActive ? 'true' : 'false');
        canvasInner.classList.toggle('measuring-active', isMeasureToolActive);
      });
    }

    let isMeasuring = false;
    let measureStartButton = 2;
    let measureStartSvgX = 0;
    let measureStartSvgY = 0;
    let measureCurrentSvgX = 0;
    let measureCurrentSvgY = 0;

    function updateMeasurementView(clientX, clientY) {
      if (!isMeasuring || !chartCachedData?.points?.length) return;

      const allPoints = chartCachedData.points;
      const points = allPoints.slice(chartSliceStart, chartSliceEnd + 1);
      if (!points.length) return;

      const svgEl = canvasInner.querySelector('.pf-chart-svg');
      const measureLayer = canvasInner.querySelector('.pf-chart-measure-layer');
      if (!svgEl || !measureLayer) return;

      const rect = svgEl.getBoundingClientRect();
      const { width, height, pad, innerWidth, innerHeight } = getActiveChartGeometry(panel);

      if (clientX !== undefined && clientY !== undefined && rect.width > 0 && rect.height > 0) {
        const curX = ((clientX - rect.left) / rect.width) * width;
        const curY = ((clientY - rect.top) / rect.height) * height;
        measureCurrentSvgX = Math.max(pad.left, Math.min(width - pad.right, curX));
        measureCurrentSvgY = Math.max(pad.top, Math.min(height - pad.bottom, curY));
      }

      const values = points.flatMap((p) => p.series).filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
      const isCenteredMetric = chartMetric === 'gainPct' || chartMetric === 'gainAmount';
      const { min, max } = computeChartScale(values, isCenteredMetric, chartMetric);

      const x1 = measureStartSvgX;
      const y1 = measureStartSvgY;
      const x2 = measureCurrentSvgX;
      const y2 = measureCurrentSvgY;

      const leftX = Math.min(x1, x2);
      const rightX = Math.max(x1, x2);
      const topY = Math.min(y1, y2);
      const bottomY = Math.max(y1, y2);
      const boxW = Math.max(1, rightX - leftX);
      const boxH = Math.max(1, bottomY - topY);

      // Convert Y coordinates to Metric Values (spatial Y1 to Y2)
      const ratioY1 = Math.max(0, Math.min(1, (y1 - pad.top) / innerHeight));
      const ratioY2 = Math.max(0, Math.min(1, (y2 - pad.top) / innerHeight));
      const val1 = max - ratioY1 * (max - min);
      const val2 = max - ratioY2 * (max - min);
      const deltaVal = val2 - val1;

      // Convert X coordinates to Dates & Indices (spatial X1 to X2)
      const ratioX1 = Math.max(0, Math.min(1, (x1 - pad.left) / innerWidth));
      const ratioX2 = Math.max(0, Math.min(1, (x2 - pad.left) / innerWidth));
      const idx1 = Math.max(0, Math.min(points.length - 1, Math.round(ratioX1 * (points.length - 1))));
      const idx2 = Math.max(0, Math.min(points.length - 1, Math.round(ratioX2 * (points.length - 1))));
      const pt1 = points[idx1] || points[0];
      const pt2 = points[idx2] || points[points.length - 1];

      const d1 = new Date(`${pt1.date}T00:00:00Z`);
      const d2 = new Date(`${pt2.date}T00:00:00Z`);
      const diffDays = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
      const sessions = Math.abs(idx2 - idx1) + 1;

      // Update measure box & diagonal line (single clean rectangle, discreet styling)
      const boxEl = measureLayer.querySelector('.pf-chart-measure-box');
      const diagEl = measureLayer.querySelector('.pf-chart-measure-diagonal');
      const pt1El = measureLayer.querySelector('.pf-chart-measure-pt1');
      const pt2El = measureLayer.querySelector('.pf-chart-measure-pt2');
      const badge = measureLayer.querySelector('.pf-chart-measure-badge');
      const badgeBg = measureLayer.querySelector('.pf-chart-measure-badge-bg');
      const badgeText = measureLayer.querySelector('.pf-chart-measure-badge-text');

      if (boxEl) {
        boxEl.setAttribute('x', leftX.toFixed(1));
        boxEl.setAttribute('y', topY.toFixed(1));
        boxEl.setAttribute('width', boxW.toFixed(1));
        boxEl.setAttribute('height', boxH.toFixed(1));
      }
      if (diagEl) {
        diagEl.setAttribute('x1', x1.toFixed(1));
        diagEl.setAttribute('y1', y1.toFixed(1));
        diagEl.setAttribute('x2', x2.toFixed(1));
        diagEl.setAttribute('y2', y2.toFixed(1));
      }
      if (pt1El) {
        pt1El.setAttribute('cx', x1.toFixed(1));
        pt1El.setAttribute('cy', y1.toFixed(1));
      }
      if (pt2El) {
        pt2El.setAttribute('cx', x2.toFixed(1));
        pt2El.setAttribute('cy', y2.toFixed(1));
      }

      // Badge on SVG
      if (badge && badgeBg && badgeText) {
        let badgeStr = '';
        if (chartMetric === 'gainPct') {
          badgeStr = `${fmtSignedPct(deltaVal)} · ${diffDays}d`;
        } else if (chartMetric === 'gainAmount') {
          badgeStr = `${fmtSigned(deltaVal)} · ${diffDays}d`;
        } else {
          badgeStr = `${fmtSignedPct(deltaVal)} · ${diffDays}d`;
        }

        const badgeW = Math.max(86, badgeStr.length * 7 + 18);
        const midBadgeX = Math.max(pad.left + badgeW / 2 + 4, Math.min(width - pad.right - badgeW / 2 - 4, (x1 + x2) / 2));
        const badgeY = Math.max(pad.top + 14, Math.min(height - pad.bottom - 14, topY - 10 < pad.top + 8 ? bottomY + 12 : topY - 10));

        badge.setAttribute('transform', `translate(${midBadgeX.toFixed(1)}, ${badgeY.toFixed(1)})`);
        badgeBg.setAttribute('x', (-badgeW / 2).toFixed(1));
        badgeBg.setAttribute('width', badgeW.toFixed(1));
        badgeText.textContent = badgeStr;
      }

      measureLayer.style.display = 'inline';
      measureLayer.removeAttribute('hidden');

      // Update floating detailed tooltip
      const tip = ensureChartTooltip();
      const startStr = formatTradingViewHoverDate(pt1.date);
      const endStr = formatTradingViewHoverDate(pt2.date);
      const daysLabel = diffDays === 1 ? '1 día' : `${diffDays} días`;
      const sessionsLabel = sessions === 1 ? '1 sesión' : `${sessions} sesiones`;

      const valClass = deltaVal > 0 ? 'positive' : deltaVal < 0 ? 'negative' : '';
      let deltaFormatted = '';
      if (chartMetric === 'gainPct') deltaFormatted = fmtSignedPct(deltaVal);
      else if (chartMetric === 'gainAmount') deltaFormatted = fmtSigned(deltaVal);
      else deltaFormatted = fmtSignedPct(deltaVal);

      tip.innerHTML = `
        <div class="pf-measure-tooltip-head">
          <div class="pf-measure-badge-tag negative">📏 Medición de rango</div>
          <div class="pf-measure-period">${escapeHtml(startStr)} → ${escapeHtml(endStr)}</div>
          <div class="pf-measure-sub">${daysLabel} naturales · ${sessionsLabel}</div>
        </div>
        <div class="pf-measure-tooltip-body">
          <div class="pf-measure-row">
            <div class="pf-measure-row-left">
              <span class="pf-chart-tooltip-dot" style="background:#ef4444"></span>
              <span class="pf-measure-name">Nivel inicial</span>
            </div>
            <div class="pf-measure-row-right">
              <strong class="pf-measure-diff">${escapeHtml(chartAxisFormat(val1))}</strong>
            </div>
          </div>
          <div class="pf-measure-row">
            <div class="pf-measure-row-left">
              <span class="pf-chart-tooltip-dot" style="background:#ef4444"></span>
              <span class="pf-measure-name">Nivel actual</span>
            </div>
            <div class="pf-measure-row-right">
              <strong class="pf-measure-diff">${escapeHtml(chartAxisFormat(val2))}</strong>
            </div>
          </div>
          <div class="pf-measure-row" style="border-top: 1px solid rgba(255,255,255,0.12); padding-top: 5px; margin-top: 2px;">
            <div class="pf-measure-row-left">
              <span class="pf-measure-name" style="font-weight: 700; color: #ffffff;">Variación (Δ)</span>
            </div>
            <div class="pf-measure-row-right">
              <strong class="pf-measure-diff ${valClass}" style="font-size: 12.5px;">${escapeHtml(deltaFormatted)}</strong>
            </div>
          </div>
        </div>`;
      tip.hidden = false;
      if (clientX !== undefined && clientY !== undefined) {
        positionChartTooltip(tip, clientX, clientY);
      }
    }

    function onMeasurePointerMove(event) {
      if (!isMeasuring) return;
      if (event.buttons === 0) {
        onMeasurePointerUp(event);
        return;
      }
      updateMeasurementView(event.clientX, event.clientY);
    }

    function onMeasurePointerUp(event) {
      if (!isMeasuring) return;
      if (event && event.button !== undefined && event.button !== measureStartButton && event.button !== 0 && event.button !== 2 && event.buttons !== 0) return;
      isMeasuring = false;
      canvasInner.classList.remove('measuring');
      window.removeEventListener('pointermove', onMeasurePointerMove);
      window.removeEventListener('mousemove', onMeasurePointerMove);
      window.removeEventListener('pointerup', onMeasurePointerUp);
      window.removeEventListener('mouseup', onMeasurePointerUp);

      const measureLayer = canvasInner.querySelector('.pf-chart-measure-layer');
      if (measureLayer) {
        measureLayer.style.display = 'none';
        measureLayer.setAttribute('hidden', '');
      }
      const hoverLayerAfterMeasure = canvasInner.querySelector('.pf-chart-hover-layer');
      if (hoverLayerAfterMeasure) {
        hoverLayerAfterMeasure.style.display = 'none';
      }
      hideChartTooltip();
    }

    // ── Comparación estilo Cotización: clic derecho mantenido (inicio → fin) ──
    let isComparing = false;
    let compareStartIdx = 0;
    let compareCurrentIdx = 0;

    function getChartPointIndexFromClientX(clientX) {
      const svgEl = canvasInner.querySelector('.pf-chart-svg');
      if (!svgEl) return 0;
      const rect = svgEl.getBoundingClientRect();
      if (!rect.width) return 0;
      const points = chartCachedData.points.slice(chartSliceStart, chartSliceEnd + 1);
      if (!points.length) return 0;
      const { width, pad, innerWidth } = getActiveChartGeometry(panel);
      const curSvgX = ((clientX - rect.left) / rect.width) * width;
      const clampedX = Math.max(pad.left, Math.min(width - pad.right, curSvgX));
      const ratio = Math.max(0, Math.min(1, (clampedX - pad.left) / innerWidth));
      return Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
    }

    function updatePortfolioComparisonView(clientX, clientY) {
      if (!isComparing || !chartCachedData?.points?.length) return;
      const points = chartCachedData.points.slice(chartSliceStart, chartSliceEnd + 1);
      if (!points.length) return;

      const svgEl = canvasInner.querySelector('.pf-chart-svg');
      const compareLayer = canvasInner.querySelector('.pf-chart-compare-layer');
      if (!svgEl || !compareLayer) return;

      const { width, height, pad, innerWidth, innerHeight } = getActiveChartGeometry(panel);
      const values = points.flatMap((p) => p.series).filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
      const isCenteredMetric = chartMetric === 'gainPct' || chartMetric === 'gainAmount';
      const { min, max } = computeChartScale(values, isCenteredMetric, chartMetric);

      const x = (idx) => pad.left + (idx / Math.max(1, points.length - 1)) * innerWidth;
      const y = (val) => pad.top + (1 - (val - min) / (max - min)) * innerHeight;
      const seriesColors = chartCachedData.labels.map((label, i) => label.color || CHART_PALETTE[i % CHART_PALETTE.length]);

      const idx1 = Math.max(0, Math.min(points.length - 1, compareStartIdx ?? 0));
      const idx2 = Math.max(0, Math.min(points.length - 1, compareCurrentIdx ?? idx1));
      const pt1 = points[idx1] || points[0];
      const pt2 = points[idx2] || points[points.length - 1];
      const x1 = x(idx1);
      const x2 = x(idx2);

      const rows = [];
      chartCachedData.labels.forEach((label, sIdx) => {
        const v1 = pt1.series?.[sIdx];
        const v2 = pt2.series?.[sIdx];
        if (v1 === null || v1 === undefined || v2 === null || v2 === undefined) return;
        if (!Number.isFinite(Number(v1)) || !Number.isFinite(Number(v2))) return;
        rows.push({
          sIdx,
          label: label.label,
          color: seriesColors[sIdx],
          val1: Number(v1),
          val2: Number(v2),
          y1: y(Number(v1)),
          y2: y(Number(v2)),
          delta: Number(v2) - Number(v1),
        });
      });

      if (!rows.length) {
        compareLayer.style.display = 'none';
        compareLayer.setAttribute('hidden', '');
        hideChartTooltip();
        return;
      }

      const globalDelta = rows.reduce((acc, r) => acc + r.delta, 0);
      const isPositive = globalDelta >= 0;
      const themeColor = isPositive ? '#16a34a' : '#dc2626';
      const bandFill = isPositive ? 'rgba(34, 197, 94, 0.13)' : 'rgba(239, 68, 68, 0.13)';

      const leftX = Math.min(x1, x2);
      const rightX = Math.max(x1, x2);
      const bandW = Math.max(1, rightX - leftX);

      const bandEl = compareLayer.querySelector('.pf-chart-compare-band');
      const v1El = compareLayer.querySelector('.pf-chart-compare-v1');
      const v2El = compareLayer.querySelector('.pf-chart-compare-v2');
      const baseEl = compareLayer.querySelector('.pf-chart-compare-baseline');
      const connsEl = compareLayer.querySelector('.pf-chart-compare-conns');
      const pts1El = compareLayer.querySelector('.pf-chart-compare-pts1');
      const pts2El = compareLayer.querySelector('.pf-chart-compare-pts2');
      const badge = compareLayer.querySelector('.pf-chart-compare-badge');
      const badgeBg = compareLayer.querySelector('.pf-chart-compare-badge-bg');
      const badgeText = compareLayer.querySelector('.pf-chart-compare-badge-text');

      if (bandEl) {
        bandEl.setAttribute('x', leftX.toFixed(1));
        bandEl.setAttribute('y', pad.top.toFixed(1));
        bandEl.setAttribute('width', bandW.toFixed(1));
        bandEl.setAttribute('height', innerHeight.toFixed(1));
        bandEl.setAttribute('fill', bandFill);
      }
      if (v1El) {
        v1El.setAttribute('x1', x1.toFixed(1));
        v1El.setAttribute('x2', x1.toFixed(1));
      }
      if (v2El) {
        v2El.setAttribute('x1', x2.toFixed(1));
        v2El.setAttribute('x2', x2.toFixed(1));
      }
      if (baseEl) {
        if (rows.length === 1) {
          baseEl.style.display = 'inline';
          baseEl.setAttribute('x1', leftX.toFixed(1));
          baseEl.setAttribute('y1', rows[0].y1.toFixed(1));
          baseEl.setAttribute('x2', rightX.toFixed(1));
          baseEl.setAttribute('y2', rows[0].y1.toFixed(1));
        } else {
          baseEl.style.display = 'none';
        }
      }
      if (connsEl) {
        connsEl.innerHTML = rows.map((r) => `
          <line x1="${x1.toFixed(1)}" y1="${r.y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${r.y2.toFixed(1)}" stroke="${r.color}" stroke-width="1.8" stroke-dasharray="4 2"/>
        `).join('');
      }
      if (pts1El) {
        pts1El.innerHTML = rows.map((r) => `
          <circle cx="${x1.toFixed(1)}" cy="${r.y1.toFixed(1)}" r="8" fill="${r.color}" fill-opacity="0.22"/>
          <circle cx="${x1.toFixed(1)}" cy="${r.y1.toFixed(1)}" r="4" fill="${r.color}" stroke="#ffffff" stroke-width="1.8"/>
        `).join('');
      }
      if (pts2El) {
        pts2El.innerHTML = rows.map((r) => `
          <circle cx="${x2.toFixed(1)}" cy="${r.y2.toFixed(1)}" r="9" fill="${r.color}" fill-opacity="0.22"/>
          <circle cx="${x2.toFixed(1)}" cy="${r.y2.toFixed(1)}" r="4.5" fill="${r.color}" stroke="#ffffff" stroke-width="2"/>
        `).join('');
      }

      if (badge && badgeBg && badgeText) {
        const parts = rows.map((r) => {
          const arrow = r.delta > 0 ? '▲ ' : r.delta < 0 ? '▼ ' : '';
          return arrow + chartAxisFormat(r.delta);
        });
        const badgeW = Math.max(96, parts.join(' · ').length * 7 + 24);
        const midX = Math.max(pad.left + badgeW / 2 + 6, Math.min(width - pad.right - badgeW / 2 - 6, (x1 + x2) / 2));
        const topY = Math.min(...rows.map((r) => Math.min(r.y1, r.y2)));
        const bottomY = Math.max(...rows.map((r) => Math.max(r.y1, r.y2)));
        let badgeY = topY - 18;
        if (badgeY < pad.top + 16) {
          badgeY = bottomY + 24;
        }
        if (badgeY > height - pad.bottom - 14) {
          badgeY = pad.top + 20;
        }
        badge.setAttribute('transform', `translate(${midX.toFixed(1)}, ${badgeY.toFixed(1)})`);
        badgeBg.setAttribute('x', (-badgeW / 2).toFixed(1));
        badgeBg.setAttribute('width', badgeW.toFixed(1));
        badgeBg.setAttribute('stroke', themeColor);
        badgeText.innerHTML = rows.map((r, i) => {
          const color = r.delta > 0 ? '#22c55e' : r.delta < 0 ? '#ef4444' : '#e2e8f0';
          const arrow = r.delta > 0 ? '▲ ' : r.delta < 0 ? '▼ ' : '';
          const sep = i < rows.length - 1 ? '<tspan fill="#64748b"> · </tspan>' : '';
          return `<tspan fill="${color}">${escapeHtml(arrow + chartAxisFormat(r.delta))}</tspan>${sep}`;
        }).join('');
      }

      compareLayer.style.display = 'inline';
      compareLayer.removeAttribute('hidden');

      // Floating detailed tooltip
      const tip = ensureChartTooltip();
      const d1 = new Date(`${pt1.date}T00:00:00Z`);
      const d2 = new Date(`${pt2.date}T00:00:00Z`);
      const diffDays = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
      const sessions = Math.abs(idx2 - idx1) + 1;
      const startStr = formatTradingViewHoverDate(pt1.date);
      const endStr = formatTradingViewHoverDate(pt2.date);
      const sessionsLabel = sessions === 1 ? '1 sesión' : `${sessions} sesiones`;
      const daysLabel = diffDays === 1 ? '1 día' : `${diffDays} días`;

      tip.innerHTML = `
        <div class="pf-compare-tooltip-head" style="margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 5px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span style="font-size: 11px; font-weight: 700; color: ${themeColor}; text-transform: uppercase; letter-spacing: 0.5px;">
              ${isPositive ? '▲ Subida' : '▼ Caída'} · Comparación
            </span>
            <span style="font-size: 10.5px; color: #94a3b8;">${sessionsLabel} · ${daysLabel}</span>
          </div>
          <div style="font-size: 11px; color: #cbd5e1; margin-top: 3px;">
            ${escapeHtml(startStr)} → ${escapeHtml(endStr)}
          </div>
        </div>
        <div class="pf-compare-tooltip-body" style="font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
          ${rows.map((r) => {
            const deltaColor = r.delta > 0 ? '#22c55e' : r.delta < 0 ? '#ef4444' : '#e2e8f0';
            const arrow = r.delta > 0 ? '▲ ' : r.delta < 0 ? '▼ ' : '';
            return `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
              <span style="color: #94a3b8; display: flex; align-items: center; gap: 5px; min-width: 0;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${r.color}; flex-shrink: 0;"></span>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px;">${escapeHtml(r.label)}</span>
              </span>
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #cbd5e1; font-size: 11px;">${escapeHtml(chartFormat(r.val1))} → ${escapeHtml(chartFormat(r.val2))}</span>
                <strong style="color: ${deltaColor};">${escapeHtml(arrow + chartAxisFormat(r.delta))}</strong>
              </span>
            </div>`;
          }).join('')}
        </div>`;
      tip.hidden = false;
      if (clientX !== undefined && clientY !== undefined) {
        positionChartTooltip(tip, clientX, clientY);
      }
    }

    function startPortfolioComparison(event) {
      if (!chartCachedData?.points?.length) return;
      const points = chartCachedData.points.slice(chartSliceStart, chartSliceEnd + 1);
      if (!points.length) return;

      isComparing = true;
      compareStartIdx = getChartPointIndexFromClientX(event.clientX);
      compareCurrentIdx = compareStartIdx;

      canvasInner.classList.add('comparing');

      const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
      if (hoverLayer) {
        hoverLayer.style.display = 'none';
      }

      updatePortfolioComparisonView(event.clientX, event.clientY);

      window.addEventListener('pointermove', onPortfolioComparePointerMove);
      window.addEventListener('mousemove', onPortfolioComparePointerMove);
      window.addEventListener('pointerup', onPortfolioComparePointerUp);
      window.addEventListener('mouseup', onPortfolioComparePointerUp);
    }

    function onPortfolioComparePointerMove(event) {
      if (!isComparing) return;
      if (event.buttons !== undefined && (event.buttons & 2) === 0 && event.buttons === 0) {
        onPortfolioComparePointerUp(event);
        return;
      }
      compareCurrentIdx = getChartPointIndexFromClientX(event.clientX);
      updatePortfolioComparisonView(event.clientX, event.clientY);
    }

    function onPortfolioComparePointerUp(event) {
      if (!isComparing) return;
      if (event && event.button !== undefined && event.button !== 2 && event.buttons !== 0 && (event.buttons & 2) !== 0) return;
      clearPortfolioComparison();
    }

    function clearPortfolioComparison() {
      isComparing = false;
      canvasInner.classList.remove('comparing');

      window.removeEventListener('pointermove', onPortfolioComparePointerMove);
      window.removeEventListener('mousemove', onPortfolioComparePointerMove);
      window.removeEventListener('pointerup', onPortfolioComparePointerUp);
      window.removeEventListener('mouseup', onPortfolioComparePointerUp);

      const compareLayer = canvasInner.querySelector('.pf-chart-compare-layer');
      if (compareLayer) {
        compareLayer.style.display = 'none';
        compareLayer.setAttribute('hidden', '');
      }
      hideChartTooltip();
    }

    // Pointer Pan (drag left / right with left button) & Measurement (right button, shift+left, or measure tool)
    canvasInner.addEventListener('pointerdown', (event) => {
      if (!chartCachedData?.points?.length) return;
      const total = chartCachedData.points.length;
      if (total <= 1) return;

      const isRightClick = event.button === 2;
      const isShiftLeftClick = event.button === 0 && event.shiftKey;
      const isToolActiveClick = event.button === 0 && isMeasureToolActive;

      // 1. Clic derecho mantenido -> Comparación (punto inicial vs punto final, por serie)
      if (isRightClick) {
        event.preventDefault();
        event.stopPropagation();
        startPortfolioComparison(event);
        return;
      }

      // 2. Herramienta Medir activa o Shift + clic izquierdo -> Regla / Cuadrícula
      if (isShiftLeftClick || isToolActiveClick) {
        event.preventDefault();
        event.stopPropagation();
        if (event.button === 0) {
          try { event.target.setPointerCapture(event.pointerId); } catch {}
        }

        const allPoints = chartCachedData.points;
        const points = allPoints.slice(chartSliceStart, chartSliceEnd + 1);
        if (!points.length) return;

        const svgEl = canvasInner.querySelector('.pf-chart-svg');
        if (!svgEl) return;
        const rect = svgEl.getBoundingClientRect();
        const { width, height, pad } = getActiveChartGeometry(panel);

        const curX = ((event.clientX - rect.left) / rect.width) * width;
        const curY = ((event.clientY - rect.top) / rect.height) * height;
        const startX = Math.max(pad.left, Math.min(width - pad.right, curX));
        const startY = Math.max(pad.top, Math.min(height - pad.bottom, curY));

        isMeasuring = true;
        measureStartButton = event.button;
        measureStartSvgX = startX;
        measureStartSvgY = startY;
        measureCurrentSvgX = startX;
        measureCurrentSvgY = startY;
        canvasInner.classList.add('measuring');

        const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
        if (hoverLayer) {
          hoverLayer.style.display = 'none';
        }

        updateMeasurementView(event.clientX, event.clientY);

        window.addEventListener('pointermove', onMeasurePointerMove);
        window.addEventListener('mousemove', onMeasurePointerMove);
        window.addEventListener('pointerup', onMeasurePointerUp);
        window.addEventListener('mouseup', onMeasurePointerUp);
        return;
      }

      if (event.button !== 0) return;

      isPanning = true;
      panMoved = false;
      panStartX = event.clientX;
      panInitStart = chartSliceStart;
      panInitEnd = chartSliceEnd;
      canvasInner.classList.add('panning');

      window.addEventListener('pointermove', onWindowPointerMove);
      window.addEventListener('pointerup', onWindowPointerUp);
      window.addEventListener('pointercancel', onWindowPointerUp);
    });

    function onWindowPointerMove(event) {
      if (!isPanning || !chartCachedData?.points?.length) return;
      const deltaX = event.clientX - panStartX;
      if (Math.abs(deltaX) > 4) {
        panMoved = true;
        const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
        if (hoverLayer) hoverLayer.style.display = 'none';
        hideChartTooltip();
      }
      if (!panMoved) return;

      const total = chartCachedData.points.length;
      const rect = canvasInner.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const { width, pad, innerWidth } = getActiveChartGeometry(panel);
      const innerWidthPx = rect.width * (innerWidth / width);

      const span = panInitEnd - panInitStart;
      const deltaRatio = deltaX / Math.max(1, innerWidthPx);
      const deltaIdx = Math.round(deltaRatio * span);

      // Drag left (deltaX < 0) => move forward in time (newStart increases)
      // Drag right (deltaX > 0) => move back in time (newStart decreases)
      let newStart = panInitStart - deltaIdx;
      let newEnd = panInitEnd - deltaIdx;

      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, span);
      } else if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, total - 1 - span);
      }

      if (newStart !== chartSliceStart || newEnd !== chartSliceEnd) {
        chartSliceStart = newStart;
        chartSliceEnd = newEnd;
        scheduleChartRedraw(panel);
        updateTimelineSliderUi(panel);
        updateQuickRangeButtonsUi(panel);
      }
    }

    function onWindowPointerUp(event) {
      if (!isPanning) return;
      isPanning = false;
      canvasInner.classList.remove('panning');
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    }

    // Hover tooltip & crosshair (active when not dragging and not measuring)
    canvasInner.addEventListener('mousemove', (event) => {
      if (isMeasuring || isComparing) return;
      if (isPanning && panMoved) return;
      if (!chartCachedData?.points?.length) return;

      const allPoints = chartCachedData.points;
      const points = allPoints.slice(chartSliceStart, chartSliceEnd + 1);
      if (!points.length) return;

      const svgEl = canvasInner.querySelector('.pf-chart-svg');
      const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
      const crosshair = canvasInner.querySelector('.pf-chart-crosshair');
      const hoverDots = canvasInner.querySelector('.pf-chart-hover-dots');
      if (!svgEl || !hoverLayer || !crosshair || !hoverDots) return;

      const rect = svgEl.getBoundingClientRect();
      const { width, height, pad, innerWidth, innerHeight } = getActiveChartGeometry(panel);

      const rawSvgX = ((event.clientX - rect.left) / rect.width) * width;
      const rawSvgY = ((event.clientY - rect.top) / rect.height) * height;
      if (rawSvgX < pad.left - 20 || rawSvgX > width - pad.right + 20 || rawSvgY < pad.top - 30 || rawSvgY > height - pad.bottom + 30) {
        hoverLayer.style.display = 'none';
        hideChartTooltip();
        return;
      }

      const cursorSvgX = Math.max(pad.left, Math.min(width - pad.right, rawSvgX));
      const cursorSvgY = Math.max(pad.top, Math.min(height - pad.bottom, rawSvgY));

      const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));
      const index = Math.round(ratio * (points.length - 1));
      const point = points[index];
      if (!point) return;

      const values = points.flatMap((p) => p.series).filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
      const isCenteredMetric = chartMetric === 'gainPct' || chartMetric === 'gainAmount';
      const { min, max } = computeChartScale(values, isCenteredMetric, chartMetric);

      const x = (idx) => pad.left + (idx / Math.max(1, points.length - 1)) * innerWidth;
      const y = (val) => pad.top + (1 - (val - min) / (max - min)) * innerHeight;
      const seriesColors = chartCachedData.labels.map((label, idx) => label.color || CHART_PALETTE[idx % CHART_PALETTE.length]);

      const crosshairV = canvasInner.querySelector('.pf-chart-crosshair-v') || crosshair;
      const crosshairH = canvasInner.querySelector('.pf-chart-crosshair-h');
      const hoverXBadge = hoverLayer.querySelector('.pf-chart-x-badge');
      const hoverXBadgeBg = hoverLayer.querySelector('.pf-chart-x-badge-bg');
      const hoverXBadgeText = hoverLayer.querySelector('.pf-chart-x-badge-text');
      const hoverYBadge = hoverLayer.querySelector('.pf-chart-y-badge');
      const hoverYBadgeBg = hoverLayer.querySelector('.pf-chart-y-badge-bg');
      const hoverYBadgeText = hoverLayer.querySelector('.pf-chart-y-badge-text');

      const cx = x(index);
      const candidates = [];
      const tooltipRows = [];

      chartCachedData.labels.forEach((label, sIdx) => {
        const val = point.series?.[sIdx];
        const color = seriesColors[sIdx];
        if (val !== null && val !== undefined && Number.isFinite(Number(val))) {
          const sy = y(Number(val));
          candidates.push({
            sIdx,
            label: label.label,
            val: Number(val),
            color,
            y: sy,
          });
          tooltipRows.push({
            sIdx,
            label: label.label,
            val: Number(val),
            color,
          });
        }
      });

      if (!candidates.length) {
        hoverLayer.style.display = 'none';
        hideChartTooltip();
        return;
      }

      // Pick the series closest to the cursor Y
      let closest = candidates[0];
      if (candidates.length > 1) {
        let minDist = Math.abs(cursorSvgY - closest.y);
        for (let i = 1; i < candidates.length; i++) {
          const d = Math.abs(cursorSvgY - candidates[i].y);
          if (d < minDist) {
            minDist = d;
            closest = candidates[i];
          }
        }
      }

      const selectedPy = closest.y;
      const selectedVal = closest.val;
      const selectedColor = closest.color;

      hoverLayer.style.display = 'inline';
      crosshairV.setAttribute('x1', cx.toFixed(1));
      crosshairV.setAttribute('x2', cx.toFixed(1));
      if (crosshairH) {
        crosshairH.setAttribute('y1', selectedPy.toFixed(1));
        crosshairH.setAttribute('y2', selectedPy.toFixed(1));
      }

      if (hoverXBadge && hoverXBadgeBg && hoverXBadgeText) {
        const badgeText = formatTradingViewHoverDate(point.date);
        const badgeWidth = Math.max(76, badgeText.length * 7 + 16);
        const clampedX = Math.max(pad.left + badgeWidth / 2, Math.min(width - pad.right - badgeWidth / 2, cx));
        hoverXBadge.setAttribute('transform', `translate(${clampedX.toFixed(1)}, ${height - pad.bottom})`);
        hoverXBadgeBg.setAttribute('x', (-badgeWidth / 2).toFixed(1));
        hoverXBadgeBg.setAttribute('width', badgeWidth.toFixed(1));
        hoverXBadgeText.textContent = badgeText;
      }

      if (hoverYBadge && hoverYBadgeText) {
        const badgeText = chartAxisFormat(selectedVal);
        const badgeWidth = Math.max(pad.left - 8, badgeText.length * 7 + 14);
        const clampedY = Math.max(pad.top + 10, Math.min(height - pad.bottom - 10, selectedPy));
        const bx = Math.max(2, pad.left - badgeWidth - 6);
        hoverYBadge.setAttribute('transform', `translate(${bx.toFixed(1)}, ${clampedY.toFixed(1)})`);
        if (hoverYBadgeBg) {
          hoverYBadgeBg.setAttribute('width', badgeWidth.toFixed(1));
          hoverYBadgeBg.setAttribute('fill', selectedColor);
        }
        const arrowEl = hoverYBadge.querySelector('.pf-chart-y-badge-arrow');
        if (arrowEl) {
          arrowEl.setAttribute('d', `M ${badgeWidth.toFixed(1)},0 L ${(badgeWidth + 5).toFixed(1)},-6 L ${(badgeWidth + 5).toFixed(1)},6 Z`);
          arrowEl.setAttribute('fill', selectedColor);
        }
        hoverYBadgeText.setAttribute('x', (badgeWidth / 2).toFixed(1));
        hoverYBadgeText.textContent = badgeText;
      }

      // Render dots for every series at this date (closest to cursor highlighted)
      const dotsHtml = candidates.map((c) => {
        const isClosest = c === closest;
        const rHalo = isClosest ? 10 : 7;
        const rDot = isClosest ? 5 : 4;
        const dotStroke = isClosest ? '2.6' : '2';
        const haloOpacity = isClosest ? '0.25' : '0.14';
        return `
          <circle cx="${cx.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${rHalo}" fill="${c.color}" fill-opacity="${haloOpacity}" class="pf-chart-hover-dot-halo"/>
          <circle cx="${cx.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${rDot}" fill="#ffffff" stroke="${c.color}" stroke-width="${dotStroke}" class="pf-chart-dot"/>`;
      }).join('');
      hoverDots.innerHTML = dotsHtml;

      if (tooltipRows.length > 0) {
        const tip = ensureChartTooltip();
        const formattedDate = formatTradingViewHoverDate(point.date);
        tip.innerHTML = `
          <div class="pf-chart-tooltip-header">${escapeHtml(formattedDate)}</div>
          <div class="pf-chart-tooltip-rows">
            ${tooltipRows.map((r) => {
              const isClosest = r.sIdx === closest.sIdx && candidates.length > 1;
              return `
              <div class="pf-chart-tooltip-row" style="${isClosest ? 'background: rgba(255,255,255,0.12); border-radius: 4px; padding: 2px 4px; font-weight: 700;' : ''}">
                <span class="pf-chart-tooltip-dot" style="background:${r.color}; ${isClosest ? 'transform: scale(1.3);' : ''}"></span>
                <span class="pf-chart-tooltip-name">${escapeHtml(r.label)}</span>
                <span class="pf-chart-tooltip-val ${r.val > 0 ? 'positive' : r.val < 0 ? 'negative' : ''}">${escapeHtml(chartFormat(r.val))}</span>
              </div>`;
            }).join('')}
          </div>`;
        tip.hidden = false;
        positionChartTooltip(tip, event.clientX, event.clientY);
      }
    });

    canvasInner.addEventListener('mouseleave', () => {
      if (isMeasuring || isComparing) return;
      const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
      if (hoverLayer) hoverLayer.style.display = 'none';
      hideChartTooltip();
    });
  }

  function attachTimelineEvents(panel) {
    const track = panel.querySelector('[data-timeline-track]');
    const windowEl = panel.querySelector('[data-timeline-window]');
    const handleLeft = panel.querySelector('[data-timeline-handle="left"]');
    const handleRight = panel.querySelector('[data-timeline-handle="right"]');
    const windowBody = panel.querySelector('[data-timeline-window-body]');
    if (!track || !windowEl || !handleLeft || !handleRight) return;

    let dragMode = null; // 'left' | 'right' | 'window'
    let dragStartX = 0;
    let initStartIdx = 0;
    let initEndIdx = 0;

    function onPointerDown(mode, event) {
      if (event.button !== 0) return;
      dragMode = mode;
      dragStartX = event.clientX;
      initStartIdx = chartSliceStart;
      initEndIdx = chartSliceEnd;
      event.target.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      windowEl.classList.add('dragging');
      if (mode === 'left') handleLeft.classList.add('active');
      if (mode === 'right') handleRight.classList.add('active');
    }

    handleLeft.addEventListener('pointerdown', (e) => onPointerDown('left', e));
    handleRight.addEventListener('pointerdown', (e) => onPointerDown('right', e));
    windowBody?.addEventListener('pointerdown', (e) => onPointerDown('window', e));

    function onPointerMove(event) {
      if (!dragMode || !chartCachedData?.points?.length) return;
      const total = chartCachedData.points.length;
      if (total <= 1) return;

      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;

      if (dragMode === 'left') {
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const targetIdx = Math.round(ratio * (total - 1));
        const maxStart = Math.max(0, chartSliceEnd - 2);
        const newStart = Math.max(0, Math.min(maxStart, targetIdx));
        if (newStart !== chartSliceStart) {
          chartSliceStart = newStart;
          scheduleChartRedraw(panel);
          updateTimelineSliderUi(panel);
          updateQuickRangeButtonsUi(panel);
        }
      } else if (dragMode === 'right') {
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const targetIdx = Math.round(ratio * (total - 1));
        const minEnd = Math.min(total - 1, chartSliceStart + 2);
        const newEnd = Math.min(total - 1, Math.max(minEnd, targetIdx));
        if (newEnd !== chartSliceEnd) {
          chartSliceEnd = newEnd;
          scheduleChartRedraw(panel);
          updateTimelineSliderUi(panel);
          updateQuickRangeButtonsUi(panel);
        }
      } else if (dragMode === 'window') {
        const deltaX = event.clientX - dragStartX;
        const deltaRatio = deltaX / rect.width;
        const deltaIdx = Math.round(deltaRatio * (total - 1));
        const span = initEndIdx - initStartIdx;
        let newStart = initStartIdx + deltaIdx;
        let newEnd = initEndIdx + deltaIdx;

        if (newStart < 0) {
          newStart = 0;
          newEnd = Math.min(total - 1, span);
        } else if (newEnd > total - 1) {
          newEnd = total - 1;
          newStart = Math.max(0, total - 1 - span);
        }

        if (newStart !== chartSliceStart || newEnd !== chartSliceEnd) {
          chartSliceStart = newStart;
          chartSliceEnd = newEnd;
          scheduleChartRedraw(panel);
          updateTimelineSliderUi(panel);
          updateQuickRangeButtonsUi(panel);
        }
      }
    }

    function onPointerEnd(event) {
      if (!dragMode) return;
      try {
        event.target.releasePointerCapture(event.pointerId);
      } catch {}
      dragMode = null;
      windowEl.classList.remove('dragging');
      handleLeft.classList.remove('active');
      handleRight.classList.remove('active');
    }

    handleLeft.addEventListener('pointermove', onPointerMove);
    handleRight.addEventListener('pointermove', onPointerMove);
    windowBody?.addEventListener('pointermove', onPointerMove);

    handleLeft.addEventListener('pointerup', onPointerEnd);
    handleRight.addEventListener('pointerup', onPointerEnd);
    windowBody?.addEventListener('pointerup', onPointerEnd);

    handleLeft.addEventListener('pointercancel', onPointerEnd);
    handleRight.addEventListener('pointercancel', onPointerEnd);
    windowBody?.addEventListener('pointercancel', onPointerEnd);

    // Track click to shift window
    track.addEventListener('click', (event) => {
      if (event.target.closest('[data-timeline-window]')) return;
      const total = chartCachedData?.points?.length;
      if (!total || total <= 1) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const clickIdx = Math.round(ratio * (total - 1));
      const span = chartSliceEnd - chartSliceStart;
      let newStart = Math.round(clickIdx - span / 2);
      let newEnd = newStart + span;
      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, span);
      } else if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, total - 1 - span);
      }
      chartSliceStart = newStart;
      chartSliceEnd = newEnd;
      scheduleChartRedraw(panel);
      updateTimelineSliderUi(panel);
      updateQuickRangeButtonsUi(panel);
    });
  }

  function drawPortfolioChart(scope, chart) {
    const panel = scope.querySelector('.pf-chart-panel') || scope;
    const root = panel.querySelector('[data-pf-chart]');
    const legend = panel.querySelector('[data-pf-chart-legend]');
    if (!root || !legend) return;

    chartCachedData = chart;
    const allPoints = chart.points ?? [];
    if (!allPoints.length) {
      root.innerHTML = '<div class="pf-chart-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg><p>No hay datos históricos disponibles para la selección.</p></div>';
      legend.innerHTML = '';
      return;
    }

    const total = allPoints.length;
    if (chartSliceEnd === null || chartSliceEnd >= total || chartSliceStart < 0 || chartSliceStart >= total || chartSliceStart >= chartSliceEnd) {
      const { start, end } = computeSliceIndicesForRange(allPoints, chartRange);
      chartSliceStart = start;
      chartSliceEnd = end;
    }

    root.innerHTML = `
      <div data-pf-chart-canvas-inner></div>
      <div class="pf-timeline-bar-wrap" data-timeline-wrap>
        <div class="pf-timeline-info">
          <div class="pf-timeline-date-chip">
            <span class="pf-timeline-chip-title">Desde</span>
            <strong data-timeline-from-date>—</strong>
          </div>
          <div class="pf-timeline-hint">Rueda: zoom · Arrastrar: desplazar · <strong>Clic derecho: comparar ganancia/pérdida</strong></div>
          <div class="pf-timeline-date-chip">
            <span class="pf-timeline-chip-title">Hasta</span>
            <strong data-timeline-to-date>—</strong>
          </div>
        </div>
        <div class="pf-timeline-track" data-timeline-track>
          <svg class="pf-timeline-sparkline" viewBox="0 0 760 32" preserveAspectRatio="none" data-timeline-sparkline></svg>
          <div class="pf-timeline-mask left" data-timeline-mask-left></div>
          <div class="pf-timeline-window" data-timeline-window>
            <div class="pf-timeline-handle left" data-timeline-handle="left" title="Arrastra para ajustar fecha de inicio">
              <span class="pf-handle-grip"></span>
            </div>
            <div class="pf-timeline-window-body" data-timeline-window-body title="Arrastra para desplazar el período"></div>
            <div class="pf-timeline-handle right" data-timeline-handle="right" title="Arrastra para ajustar fecha de fin">
              <span class="pf-handle-grip"></span>
            </div>
          </div>
          <div class="pf-timeline-mask right" data-timeline-mask-right></div>
        </div>
      </div>`;

    renderTimelineSparkline(panel, allPoints, chart.labels);
    renderChartMainSvg(panel);
    updateTimelineSliderUi(panel);
    attachChartCanvasInteractions(panel);
    attachTimelineEvents(panel);
  }

  function syncPickerChecked(panel) {
    const pickerBox = panel.querySelector('[data-pf-chart-picker-box]');
    if (!pickerBox) return;
    const selected = new Set(chartSelectedIds);
    pickerBox.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      const isChecked = selected.has(input.value);
      input.checked = isChecked;
      input.closest('.pf-chart-choice')?.classList.toggle('selected', isChecked);
    });
    const pickerBtn = panel.querySelector('[data-pf-chart-picker]');
    if (pickerBtn) pickerBtn.querySelector('span').textContent = `Elementos (${chartSelectedIds.length})`;
    const counterBadge = pickerBox.querySelector('[data-picker-counter]');
    if (counterBadge) counterBadge.textContent = `${chartSelectedIds.length} / 20 seleccionados`;
  }

  async function loadPortfolioChart(scope) {
    const panel = scope.querySelector('.pf-chart-panel') || scope;
    const status = panel.querySelector('[data-pf-chart-status]');
    if (!status) return;
    if (!chartSelectedIds.length) {
      status.textContent = 'Sin elementos seleccionados';
      const root = panel.querySelector('[data-pf-chart]');
      const legend = panel.querySelector('[data-pf-chart-legend]');
      if (root) root.innerHTML = `
        <div class="pf-chart-empty pf-chart-empty-clean">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          <p><strong>El gráfico no tiene elementos seleccionados.</strong></p>
          <p class="pf-chart-empty-sub">Pulsa el icono <span class="pf-inline-chart-icon"><svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg></span> en cualquier valor o grupo de la tabla para compararlo, o pulsa <strong>«Mostrar todo»</strong> en la cabecera.</p>
        </div>`;
      if (legend) legend.innerHTML = '<li class="pf-legend-empty-hint">Ninguna línea seleccionada</li>';
      return;
    }
    const requestId = ++chartRequestId;
    status.textContent = 'Cargando histórico…';
    try {
      const query = new URLSearchParams({ ids: chartSelectedIds.join(','), metric: chartMetric, range: 'all' });
      const payload = await fetchApi(`/api/portfolio/chart?${query}`);
      if (requestId !== chartRequestId) return;
      chartCachedData = payload.chart;
      const { start, end } = computeSliceIndicesForRange(chartCachedData.points, chartRange);
      chartSliceStart = start;
      chartSliceEnd = end;
      drawPortfolioChart(panel, payload.chart);
      status.textContent = `Yahoo Finance · ${payload.chart.points.length} sesiones`;
    } catch (error) {
      if (requestId === chartRequestId) status.textContent = error.message || 'No se pudo cargar el histórico.';
    }
  }

  function wirePortfolioChart(scope, options = {}) {
    if (options.getData) chartDataGetter = options.getData;
    if (options.api) chartApiFetcher = options.api;
    if (options.renderSection) chartSectionRenderer = options.renderSection;
    if (options.onClose) chartCloseCallback = options.onClose;
    if (options.onSelectedIdsChange) chartSelectedIdsCallback = options.onSelectedIdsChange;
    if (options.onRangeChange) chartRangeCallback = options.onRangeChange;
    if (options.onMetricChange) chartMetricCallback = options.onMetricChange;
    if (Array.isArray(options.selectedIds)) chartSelectedIds = options.selectedIds;
    if (options.open !== undefined) chartOpen = Boolean(options.open);
    if (options.metric) chartMetric = options.metric;
    if (options.range) chartRange = options.range;
    const panel = scope.querySelector('.pf-chart-panel');
    if (!panel) return;
    const picker = panel.querySelector('[data-pf-chart-picker]');
    const pickerBox = panel.querySelector('[data-pf-chart-picker-box]');

    picker?.addEventListener('click', () => {
      const isOpen = !pickerBox.hidden;
      pickerBox.hidden = isOpen;
      picker.setAttribute('aria-expanded', String(!isOpen));
      picker.classList.toggle('active', !isOpen);
    });

    const fsBtn = panel.querySelector('[data-pf-chart-fullscreen]');
    const maxIcon = fsBtn?.querySelector('.pf-icon-maximize');
    const minIcon = fsBtn?.querySelector('.pf-icon-minimize');

    function syncFullscreenUi(isFs) {
      if (maxIcon) maxIcon.style.display = isFs ? 'none' : 'inline-block';
      if (minIcon) minIcon.style.display = isFs ? 'inline-block' : 'none';
      if (fsBtn) {
        fsBtn.title = isFs ? 'Salir de pantalla completa (Esc o F)' : 'Pantalla completa (F o clic)';
        fsBtn.classList.toggle('active', isFs);
      }
    }

    async function toggleFullscreen() {
      const isCurrentlyFs = document.fullscreenElement === panel || panel.classList.contains('is-fullscreen');
      if (!isCurrentlyFs) {
        try {
          if (panel.requestFullscreen) {
            await panel.requestFullscreen();
          } else {
            panel.classList.add('is-fullscreen');
          }
        } catch {
          panel.classList.add('is-fullscreen');
        }
        syncFullscreenUi(true);
      } else {
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
          }
        } catch {}
        panel.classList.remove('is-fullscreen');
        syncFullscreenUi(false);
      }
      setTimeout(() => {
        scheduleChartRedraw(panel);
        updateTimelineSliderUi(panel);
      }, 80);
    }

    fsBtn?.addEventListener('click', () => {
      toggleFullscreen();
    });

    const onFullscreenChange = () => {
      const isFs = document.fullscreenElement === panel || panel.classList.contains('is-fullscreen');
      panel.classList.toggle('is-fullscreen', isFs);
      syncFullscreenUi(isFs);
      scheduleChartRedraw(panel);
      updateTimelineSliderUi(panel);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    const onKeyDownFs = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === 'f' || e.key === 'F') {
        const isHovered = panel.matches(':hover') || panel.classList.contains('is-fullscreen');
        if (isHovered) {
          e.preventDefault();
          toggleFullscreen();
        }
      } else if (e.key === 'Escape' && panel.classList.contains('is-fullscreen')) {
        panel.classList.remove('is-fullscreen');
        syncFullscreenUi(false);
        scheduleChartRedraw(panel);
        updateTimelineSliderUi(panel);
      }
    };
    window.addEventListener('keydown', onKeyDownFs);

    panel.querySelector('[data-pf-chart-close]')?.addEventListener('click', () => {
      if (panel.classList.contains('is-fullscreen')) {
        try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
        panel.classList.remove('is-fullscreen');
      }
      chartOpen = false;
      if (chartCloseCallback) {
        chartCloseCallback();
      } else if (chartSectionRenderer) {
        chartSectionRenderer();
      }
    });

    panel.querySelector('[data-pf-chart-metric]')?.addEventListener('change', (event) => {
      chartMetric = event.target.value;
      if (chartMetricCallback) chartMetricCallback(chartMetric);
      loadPortfolioChart(panel);
    });

    panel.querySelectorAll('[data-pf-range]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.pfRange;
        chartRange = key;
        panel.querySelectorAll('[data-pf-range]').forEach((b) => b.classList.toggle('active', b === btn));
        if (chartCachedData?.points?.length) {
          const { start, end } = computeSliceIndicesForRange(chartCachedData.points, key);
          chartSliceStart = start;
          chartSliceEnd = end;
          scheduleChartRedraw(panel);
          updateTimelineSliderUi(panel);
        } else {
          loadPortfolioChart(panel);
        }
      });
    });

    panel.querySelectorAll('[data-pf-zoom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = btn.dataset.pfZoom;
        zoomChartByStep(panel, dir);
      });
    });

    // Picker Category Tabs
    pickerBox?.querySelectorAll('[data-picker-tab]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const cat = tabBtn.dataset.pickerTab;
        pickerBox.querySelectorAll('[data-picker-tab]').forEach((b) => b.classList.toggle('active', b === tabBtn));
        const searchVal = (pickerBox.querySelector('[data-picker-search]')?.value || '').toLowerCase().trim();
        filterPickerChoices(pickerBox, cat, searchVal);
      });
    });

    // Picker Search Input
    pickerBox?.querySelector('[data-picker-search]')?.addEventListener('input', (event) => {
      const searchVal = (event.target.value || '').toLowerCase().trim();
      const activeTab = pickerBox.querySelector('[data-picker-tab].active')?.dataset.pickerTab || 'all';
      filterPickerChoices(pickerBox, activeTab, searchVal);
    });

    function filterPickerChoices(box, cat, search) {
      box.querySelectorAll('.pf-chart-choice').forEach((choice) => {
        const matchCat = cat === 'all' || choice.dataset.choiceCategory === cat;
        const matchSearch = !search || choice.dataset.choiceSearch.includes(search);
        choice.hidden = !(matchCat && matchSearch);
      });
    }

    // Picker Quick Action Buttons
    pickerBox?.querySelector('[data-picker-quick="top"]')?.addEventListener('click', () => {
      const allChoices = chartChoices();
      chartSelectedIds = allChoices.filter((c) => c.category === 'valores').slice(0, 10).map((c) => c.id);
      syncPickerChecked(panel);
      loadPortfolioChart(panel);
    });

    pickerBox?.querySelector('[data-picker-quick="groups"]')?.addEventListener('click', () => {
      const allChoices = chartChoices();
      chartSelectedIds = allChoices.filter((c) => c.category === 'grupos').slice(0, 10).map((c) => c.id);
      syncPickerChecked(panel);
      loadPortfolioChart(panel);
    });

    pickerBox?.querySelector('[data-picker-quick="clear"]')?.addEventListener('click', () => {
      chartSelectedIds = [];
      if (chartSelectedIdsCallback) chartSelectedIdsCallback(chartSelectedIds);
      syncPickerChecked(panel);
      loadPortfolioChart(panel);
    });

    // Checkbox change listener
    pickerBox?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', () => {
        chartSelectedIds = [...pickerBox.querySelectorAll('input:checked')].map((item) => item.value).slice(0, 20);
        if (chartSelectedIdsCallback) chartSelectedIdsCallback(chartSelectedIds);
        syncPickerChecked(panel);
        loadPortfolioChart(panel);
      });
    });

    loadPortfolioChart(panel);
  }

  const PortfolioChart = {
    CHART_METRICS,
    CHART_RANGES,
    CHART_PALETTE,
    RANGE_DAYS,
    SPANISH_MONTHS,
    PREDEFINED_TABS,
    tabForPosition,
    chartChoices,
    chartButtonHtml,
    syncChartTriggerButtons,
    chartPanelHtml,
    computeNiceStep,
    computeChartScale,
    getActiveChartGeometry,
    chartFormat,
    chartAxisFormat,
    formatTradingViewHoverDate,
    fmtDateDisplay,
    getTradingViewDateTicks,
    computeSliceIndicesForRange,
    renderTimelineSparkline,
    renderChartMainSvg,
    zoomChartByStep,
    drawPortfolioChart,
    syncPickerChecked,
    loadPortfolioChart,
    wirePortfolioChart,
    reset() {
      chartSelectedIds = [];
      chartOpen = true;
      chartMetric = 'gainPct';
      chartRange = '1y';
      chartRequestId = 0;
      chartSliceStart = 0;
      chartSliceEnd = null;
      chartCachedData = null;
      chartRedrawRaf = null;
    },
    get selectedIds() { return chartSelectedIds; },
    set selectedIds(ids) { chartSelectedIds = Array.isArray(ids) ? ids : []; },
    get open() { return chartOpen; },
    set open(v) { chartOpen = Boolean(v); },
    get metric() { return chartMetric; },
    set metric(v) { chartMetric = v; },
    get range() { return chartRange; },
    set range(v) { chartRange = v; },
    get cachedData() { return chartCachedData; },
    set cachedData(v) { chartCachedData = v; }
  };

  window.PortfolioChart = PortfolioChart;
})(window);
