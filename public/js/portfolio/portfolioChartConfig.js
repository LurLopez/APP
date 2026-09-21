/**
 * @fileoverview Módulo extraído de portfolioChart.js.
 */

(function (window) {
  const PCS = window.PortfolioChartState;

  function tabForPosition(item, key) {
    if (!item) return null;
    if (key === 'sector') return item.sector || 'Sin sector';
    if (key === 'type') return item.type || 'Sin tipo';
    if (key === 'country') return item.country || 'Sin país';
    if (key === 'region') return item.region || 'Sin región';
    return null;
  }

  function chartChoices(pfData) {
    const currentData = pfData || (PCS.dataGetter ? PCS.dataGetter() : null);
    const choices = [];
    const positions = currentData?.positions ?? [];

    // 1. Tickers (Valores)
    for (const item of positions) {
      const held = (Number(item.shares) || 0) > 0;
      const sold = (Number(item.sharesSold) || 0) > 0;
      if (held && sold) {
        choices.push({
          id: `ticker:${item.ticker}:all`,
          label: `${item.companyName || item.ticker} (Total)`,
          sub: `${item.ticker} · Total (${fmtShares(item.shares)} en cartera + ${fmtShares(item.sharesSold)} vendidas)`,
          ticker: item.ticker,
          kind: 'ticker',
          category: 'valores',
          categoryLabel: 'Valores',
        });
      }
      if (held) {
        choices.push({
          id: `ticker:${item.ticker}:buy`,
          label: `${item.companyName || item.ticker}${held && sold ? ' (Compra)' : ''}`,
          sub: `${item.ticker} · Compra (${fmtShares(item.shares)} acc)`,
          ticker: item.ticker,
          kind: 'ticker',
          category: 'valores',
          categoryLabel: 'Valores',
        });
      }
      if (sold) {
        choices.push({
          id: `ticker:${item.ticker}:sell`,
          label: `${item.companyName || item.ticker}${held && sold ? ' (Venta)' : ''}`,
          sub: `${item.ticker} · Venta (${fmtShares(item.sharesSold)} acc vendidas)`,
          ticker: item.ticker,
          kind: 'ticker',
          category: 'valores',
          categoryLabel: 'Valores',
        });
      }
      if (!held && !sold) {
        choices.push({
          id: `ticker:${item.ticker}`,
          label: item.companyName || item.ticker,
          sub: item.ticker,
          ticker: item.ticker,
          kind: 'ticker',
          category: 'valores',
          categoryLabel: 'Valores',
        });
      }
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

    // 4. Lotes de compra y venta
    for (const item of positions) {
      for (const lot of item.lots ?? []) {
        if ((lot.remaining ?? 0) > 0) {
          choices.push({
            id: `lot:${lot.id}:buy`,
            label: `${item.companyName || item.ticker} (Compra) · Compra ${fmtDate(lot.date)}`,
            sub: `${item.ticker} · ${fmtShares(lot.remaining)} acc @ ${fmtPrice(lot.price)}`,
            ticker: item.ticker,
            kind: 'lot',
            category: 'lotes',
            categoryLabel: 'Lotes de compra',
          });
        }
        for (const sale of lot.sales ?? []) {
          choices.push({
            id: `lot:${lot.id}:sell:${sale.date}`,
            label: `${item.companyName || item.ticker} (Venta) · Venta ${fmtDate(sale.date)}`,
            sub: `${item.ticker} · ${fmtShares(sale.shares)} acc @ ${fmtPrice(sale.price)}`,
            ticker: item.ticker,
            kind: 'lot',
            category: 'lotes',
            categoryLabel: 'Lotes vendidos',
          });
        }
      }
    }

    return choices;
  }

  function chartButtonHtml(id) {
    const isGroup = String(id).startsWith('group:');
    const isLot = String(id).startsWith('lot:');
    const isBuy = String(id).includes(':buy');
    const isSell = String(id).includes(':sell');
    const isAll = String(id).includes(':all');
    let label = isGroup ? 'grupo' : isLot ? 'lote' : 'valor';
    if (isBuy) label += ' (compra)';
    else if (isSell) label += ' (venta)';
    else if (isAll) label += ' (total)';
    const isSelected = PCS.selectedIds.includes(String(id));
    const title = isSelected ? `Quitar ${label} del gráfico` : `Mostrar ${label} en el gráfico`;
    const iconSvg = isSelected
      ? `<svg viewBox="0 0 20 20" aria-hidden="true" class="pf-icon-remove"><path d="M5 5l10 10M15 5L5 15"/></svg>`
      : `<svg viewBox="0 0 20 20" aria-hidden="true" class="pf-icon-add"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg>`;
    const extraClass = isBuy ? 'pf-chart-trigger-buy' : isSell ? 'pf-chart-trigger-sell' : '';
    return `<button class="pf-chart-trigger ${extraClass} ${isSelected ? 'active' : ''}" type="button" data-pf-chart-trigger="${escapeHtml(id)}" aria-pressed="${isSelected}" aria-label="${title}" title="${title}">${iconSvg}</button>`;
  }

  function syncChartTriggerButtons(scope = document) {
    let root = (scope && scope.querySelectorAll) ? scope : document;
    let buttons = root.querySelectorAll('[data-pf-chart-trigger]');
    if (!buttons.length && root !== document) {
      buttons = document.querySelectorAll('[data-pf-chart-trigger]');
    }
    const selectedSet = new Set(PCS.selectedIds);
    buttons.forEach((button) => {
      const id = button.dataset.pfChartTrigger;
      if (!id) return;
      const isSelected = selectedSet.has(id);
      const isGroup = id.startsWith('group:');
      const isLot = id.startsWith('lot:');
      const isBuy = id.includes(':buy');
      const isSell = id.includes(':sell');
      const isAll = id.includes(':all');
      let label = isGroup ? 'grupo' : isLot ? 'lote' : 'valor';
      if (isBuy) label += ' (compra)';
      else if (isSell) label += ' (venta)';
      else if (isAll) label += ' (total)';
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
    const selected = new Set(PCS.selectedIds);
    const valoresCount = choices.filter((c) => c.category === 'valores').length;
    const gruposCount = choices.filter((c) => c.category === 'grupos').length;
    const lotesCount = choices.filter((c) => c.category === 'lotes').length;

    const rangePillsHtml = CHART_RANGES.map(([key, label]) => `
      <button class="pf-range-pill ${PCS.range === key ? 'active' : ''}" type="button" data-pf-range="${key}">${label}</button>
    `).join('');

    const choicesHtml = choices.map((choice) => {
      const isChecked = selected.has(choice.id);
      const dotColor = choice.color || (choice.kind === 'ticker' ? '#2563eb' : '#64748b');
      let badgeText = choice.category === 'valores' ? 'Valor' : choice.category === 'grupos' ? 'Grupo' : 'Lote';
      if (choice.id.endsWith(':buy') || choice.id.includes(':buy')) {
        badgeText += ' (Compra)';
      } else if (choice.id.endsWith(':sell') || choice.id.includes(':sell')) {
        badgeText += ' (Venta)';
      } else if (choice.id.endsWith(':all') || choice.id.includes(':all')) {
        badgeText += ' (Total)';
      }
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

    const baseMetric = (PCS.metric === 'gainWithDividendsPct' || PCS.metric === 'gainPct')
      ? 'gainPct'
      : (PCS.metric === 'gainWithDividendsAmount' || PCS.metric === 'gainAmount')
        ? 'gainAmount'
        : PCS.metric;
    const isGainMetric = baseMetric === 'gainPct' || baseMetric === 'gainAmount';
    const isDividendsIncluded = Boolean(PCS.includeDividends || PCS.metric === 'gainWithDividendsPct' || PCS.metric === 'gainWithDividendsAmount');

    return `<div class="pf-chart-panel">
      <div class="pf-card-head pf-chart-head">
        <div class="pf-chart-title-wrap">
          <h4>Evolución de la cartera</h4>
          <p>Serie temporal comparativa de valores, lotes y grupos según tus compras y ventas.</p>
        </div>
        <div class="pf-chart-controls">
          <div class="pf-metric-wrap">
            <select class="pf-select pf-chart-metric-select" data-pf-chart-metric aria-label="Métrica del gráfico">
              ${CHART_METRICS.map(([key, label]) => `<option value="${key}" ${baseMetric === key ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
          <label class="pf-chart-checkbox ${isDividendsIncluded ? 'checked' : ''}" data-pf-include-dividends-wrap title="Incluir dividendos cobrados en la rentabilidad" style="${isGainMetric ? '' : 'display:none;'}">
            <input type="checkbox" data-pf-include-dividends ${isDividendsIncluded ? 'checked' : ''}>
            <span>Incluir dividendos</span>
          </label>
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
          <div class="pf-chart-legend-header">
            <div class="pf-chart-legend-title">Elementos en el gráfico</div>
            <button type="button" class="pf-legend-clear-all" data-pf-chart-clear title="Quitar todos los elementos del gráfico" aria-label="Quitar todo" style="${selected.size > 0 ? '' : 'display:none;'}">Quitar todo</button>
          </div>
          <ul class="pf-chart-legend" data-pf-chart-legend></ul>
        </div>
      </div>

      <p class="pf-chart-note">Las líneas completamente vendidas mantienen constante su ganancia realizada desde la fecha de venta. Días sin cotización usan el último cierre disponible.</p>
    </div>`;
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

  const CHART_METRICS = [
    ['gainPct', 'Ganancia (%)'],
    ['gainAmount', 'Ganancia ($)'],
    ['dividendYield', 'Div. yield sobre cotización (%)'],
    ['dividendYoc', 'Div. yield sobre coste (%)'],
    ['weight', 'Peso de cartera (%)'],
  ];

  const CHART_RANGES = [['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1y', '1A'], ['2y', '2A'], ['3y', '3A'], ['5y', '5A'], ['all', 'Todo']];

  const CHART_PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#4f46e5', '#6366f1', '#14b8a6', '#e11d48'];

  const RANGE_DAYS = { '1m': 31, '3m': 93, '6m': 186, '1y': 365, '2y': 730, '3y': 1095, '5y': 1825 };

  const SPANISH_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
window.tabForPosition = tabForPosition;
window.chartChoices = chartChoices;
window.chartButtonHtml = chartButtonHtml;
window.syncChartTriggerButtons = syncChartTriggerButtons;
window.chartPanelHtml = chartPanelHtml;
window.PREDEFINED_TABS = PREDEFINED_TABS;
window.COLORS = COLORS;
window.CHART_METRICS = CHART_METRICS;
window.CHART_RANGES = CHART_RANGES;
window.CHART_PALETTE = CHART_PALETTE;
window.RANGE_DAYS = RANGE_DAYS;
window.SPANISH_MONTHS = SPANISH_MONTHS;

})(window);
