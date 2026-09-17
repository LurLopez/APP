/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;
  const { wireDonutTooltips, wireAllocationHover, wirePortfolioLogos } = window.PortfolioDonuts;

  function operationsPanelHtml() {
    return `
      <div class="pf-panel pf-operations-form-panel">
        <div class="pf-card-head"><div><h4>Nueva operación</h4><p>Registra compras y ventas para recalcular tu cartera con FIFO.</p></div></div>
        <div class="pf-form-block">${transactionFormHtml()}</div>
      </div>
      ${(PS.data?.transactions ?? []).length ? historyWidgetHtml() : ''}`;
  }

  function portfolioTabsHtml() {
    const tabs = [
      ['cartera', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>', 'Cartera'],
      ['dividendos', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>', 'Dividendos'],
      ['operaciones', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10M6 14h6"/></svg>', 'Operaciones'],
    ];
    return `
      <nav class="pf-dashboard-tabs" role="tablist" aria-label="Secciones de la cartera">
        <div class="pf-tab-list">
          ${tabs.map(([key, icon, label]) => `
            <button class="pf-dashboard-tab ${PS.portfolioTab === key ? 'active' : ''}" type="button"
              role="tab" aria-selected="${PS.portfolioTab === key}" data-pf-tab="${key}">
              <span class="pf-tab-icon" aria-hidden="true">${icon}</span>${label}
            </button>`).join('')}
        </div>
        <button class="pf-dashboard-add" type="button" data-pf-add>+ Añadir operación</button>
      </nav>`;
  }

  function positionsPanelHtml() {
    const views = [
      ['current', 'Actual'],
      ['sold', 'Vendido'],
      ['all', 'Todo'],
    ];
    return `
      <div class="pf-broker-panel">
        <div class="pf-card-head">
          <div><h4>Valores</h4><p>Detalle de tus posiciones y de los dividendos previstos.</p></div>
          <div class="pf-positions-head-actions">
            <button class="pf-outline-button pf-show-all-btn" type="button" data-pf-chart-show-all="valores" title="Mostrar todas las acciones principales en el gráfico">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg>
              <span>Mostrar todo</span>
            </button>
            <button class="pf-outline-button pf-toggle-chart-btn" type="button" data-pf-chart-toggle title="${PS.chartOpen ? 'Ocultar gráfico comparativo' : 'Mostrar gráfico comparativo'}">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg>
              <span>${PS.chartOpen ? 'Ocultar gráfico' : 'Mostrar gráfico'}</span>
            </button>
            <div class="pf-positions-views" role="group" aria-label="Vista de posiciones">
              ${views.map(([key, label]) => `
                <button class="pf-positions-view-btn ${PS.positionsView === key ? 'active' : ''}" type="button"
                  data-pf-view="${key}" aria-pressed="${PS.positionsView === key}">
                  ${label}
                </button>`).join('')}
            </div>
          </div>
        </div>
        ${positionsTableHtml(PS.positionsView)}
        ${gruposSectionHtml()}
        <div class="pf-card-footer">
          <button class="pf-footer-link" type="button" data-pf-export>${window.I18n ? window.I18n.t('⇩ Exportar CSV') : '⇩ Exportar CSV'}</button>
        </div>
      </div>`;
  }

  function portfolioContentHtml() {
    if (PS.portfolioTab === 'cartera') return `${allocationPanelHtml()}${PS.chartOpen ? chartPanelHtml() : ''}${positionsPanelHtml()}`;
    if (PS.portfolioTab === 'dividendos') return dividendPanelHtml();
    if (PS.portfolioTab === 'operaciones') return operationsPanelHtml();
    return `${allocationPanelHtml()}${PS.chartOpen ? chartPanelHtml() : ''}${positionsPanelHtml()}`;
  }

  function wirePortfolioDashboard(scope) {
    scope.querySelectorAll('[data-pf-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        PS.portfolioTab = button.dataset.pfTab;
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-add]').forEach((button) => {
      button.addEventListener('click', () => {
        PS.portfolioTab = 'operaciones';
        PS.formExpanded = true;
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-export]').forEach((button) => {
      button.addEventListener('click', exportPortfolioCsv);
    });
    scope.querySelectorAll('[data-pf-cost-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        PS.allocationBasis = PS.allocationBasis === 'cost' ? 'value' : 'cost';
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-allocation-mode]').forEach((select) => {
      select.addEventListener('change', () => {
        PS.allocationGroup = select.value;
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-view]').forEach((button) => {
      button.addEventListener('click', () => {
        PS.positionsView = button.dataset.pfView;
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('.pf-broker-table:not(.pf-g-members-table):not(.pf-g-groups-table) th[data-sort-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.PS.sortKey;
        if (PS.sortKey === key) {
          PS.sortDir = PS.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
          PS.sortKey = key;
          PS.sortDir = key === 'valor' ? 'asc' : 'desc';
        }
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('[data-mode-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const key = button.dataset.modeToggle;
        if (TOTAL_MEDIO_TOGGLES[key]) {
          PS.displayMode[key] = (PS.displayMode[key] ?? TOTAL_MEDIO_DEFAULT[key] ?? 'medio') === 'medio' ? 'total' : 'medio';
        } else {
          PS.displayMode[key] = modeIsPct(key) ? 'amt' : 'pct';
        }
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('[data-pf-expand]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleLotsRow(button.closest('tr'));
      });
    });
    scope.querySelectorAll('.pf-broker-table:not(.pf-g-members-table):not(.pf-g-groups-table) tbody tr[data-ticker]').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('a, button')) return;
        toggleLotsRow(row);
      });
      row.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('a, button')) {
          event.preventDefault();
          toggleLotsRow(row);
        }
      });
    });
    function updateChartLive(targetId) {
      if (targetId) {
        PS.chartSelectedIds = PS.chartSelectedIds.includes(targetId)
          ? PS.chartSelectedIds.filter((id) => id !== targetId)
          : [...PS.chartSelectedIds, targetId].slice(-20);
      }
      if (window.PortfolioChart) {
        window.PortfolioChart.selectedIds = PS.chartSelectedIds;
        window.PortfolioChart.syncChartTriggerButtons?.(scope);
      }
      const chartPanel = PS.sectionRoot?.querySelector('.pf-chart-panel');
      if (PS.chartOpen && chartPanel && PS.portfolioTab === 'cartera') {
        if (window.PortfolioChart) {
          window.PortfolioChart.syncPickerChecked?.(chartPanel);
          window.PortfolioChart.loadPortfolioChart?.(chartPanel);
        }
        return true;
      }
      return false;
    }

    scope.querySelectorAll('[data-pf-chart-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        PS.chartOpen = !PS.chartOpen;
        if (window.PortfolioChart) window.PortfolioChart.open = PS.chartOpen;
        rerenderKeepingScroll();
        if (PS.chartOpen) {
          requestAnimationFrame(() => PS.sectionRoot?.querySelector('.pf-chart-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }
      });
    });
    scope.querySelectorAll('[data-pf-chart-show-all]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const mode = button.dataset.pfChartShowAll;
        const allChoices = chartChoices();
        if (mode === 'valores') {
          PS.chartSelectedIds = allChoices.filter((c) => c.kind === 'ticker').slice(0, 20).map((c) => c.id);
        } else if (mode === 'grupos') {
          const isCustom = PS.activeTab?.type === 'custom';
          const isPredefined = PS.activeTab?.type === 'predefined';
          let tabChoices = null;
          if (isPredefined) {
            tabChoices = allChoices.filter((c) => c.kind === 'group' && c.tabKey === PS.activeTab.key);
          } else if (isCustom) {
            const currentTabObj = tabById(PS.activeTab.id);
            const groupIds = new Set((currentTabObj?.groups ?? []).map((g) => g.id));
            tabChoices = allChoices.filter((c) => c.kind === 'group' && groupIds.has(c.groupId));
          }
          if (!tabChoices || !tabChoices.length) {
            tabChoices = allChoices.filter((c) => c.kind === 'group');
          }
          PS.chartSelectedIds = tabChoices.slice(0, 20).map((c) => c.id);
        }
        if (!updateChartLive()) {
          PS.chartOpen = true;
          PS.portfolioTab = 'cartera';
          rerenderKeepingScroll();
        }
      });
    });
    scope.querySelectorAll('[data-pf-chart-trigger]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = button.dataset.pfChartTrigger;
        if (!id) return;
        updateChartLive(id);
      });
    });
    wirePortfolioLogos(scope);
    wireTransactionForm(scope.querySelector('.pf-form'));
    wireHistoryWidget(scope);
    wireDonutTooltips(scope);
    wireAllocationHover(scope);
    wireGroupFeatures(scope);
    wirePortfolioChart(scope);
    wireDividendDashboard(scope);
    wireCalendarDashboard(scope);
  }

  function rerenderKeepingScroll() {
    const wraps = Array.from(PS.sectionRoot?.querySelectorAll('.pf-broker-table-wrap') ?? []);
    const scrolls = wraps.map((wrap) => wrap.scrollLeft);
    const scrollTop = window.scrollY;
    const expanded = getExpandedTickers(PS.sectionRoot);
    renderSection();
    restoreExpandedTickers(PS.sectionRoot, expanded);
    requestAnimationFrame(() => {
      const wraps2 = Array.from(PS.sectionRoot?.querySelectorAll('.pf-broker-table-wrap') ?? []);
      wraps2.forEach((wrap, index) => {
        if (scrolls[index] > 0) wrap.scrollLeft = scrolls[index];
      });
      if (scrollTop > 0) window.scrollTo(0, scrollTop);
    });
  }
window.operationsPanelHtml = operationsPanelHtml;
window.portfolioTabsHtml = portfolioTabsHtml;
window.positionsPanelHtml = positionsPanelHtml;
window.portfolioContentHtml = portfolioContentHtml;
window.wirePortfolioDashboard = wirePortfolioDashboard;
window.rerenderKeepingScroll = rerenderKeepingScroll;

})(window);
