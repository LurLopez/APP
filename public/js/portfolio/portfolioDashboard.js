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
    const isGrupos = PS.positionsTab === 'grupos';
    const views = [
      ['current', 'Actual'],
      ['sold', 'Vendido'],
      ['all', 'Todo'],
    ];
    const currentView = isGrupos ? (PS.groupsView ?? 'current') : (PS.positionsView ?? 'current');
    const positions = positionsForView(currentView);
    const valoresCount = positions.length;
    const groupsCount = (typeof groupPillsForActiveTab === 'function') ? groupPillsForActiveTab().length : 0;
    const subText = isGrupos
      ? ((typeof activeTabDescription === 'function') ? activeTabDescription() : 'Detalle de grupos de la cartera.')
      : (window.I18n ? window.I18n.t('Detalle de tus posiciones y de los dividendos previstos.') : 'Detalle de tus posiciones y de los dividendos previstos.');

    const showAllTitle = isGrupos
      ? (window.I18n ? window.I18n.t('Mostrar todos los grupos principales de esta pestaña en el gráfico') : 'Mostrar todos los grupos principales de esta pestaña en el gráfico')
      : (window.I18n ? window.I18n.t('Mostrar todas las acciones principales en el gráfico') : 'Mostrar todas las acciones principales en el gráfico');

    const contentHtml = isGrupos
      ? gruposSectionHtml()
      : positionsTableHtml(currentView);

    return `
      <div class="pf-broker-panel">
        <div class="pf-card-head pf-table-card-head">
          <div class="pf-table-head-left">
            <div class="pf-table-main-tabs" role="tablist" aria-label="Pestañas de la cartera">
              <button type="button" class="pf-table-main-tab ${!isGrupos ? 'active' : ''}" data-pf-table-tab="valores" role="tab" aria-selected="${!isGrupos}">
                <span>${window.I18n ? window.I18n.t('Valores') : 'Valores'}</span>
                <span class="pf-table-tab-pill">${valoresCount}</span>
              </button>
              <button type="button" class="pf-table-main-tab ${isGrupos ? 'active' : ''}" data-pf-table-tab="grupos" role="tab" aria-selected="${isGrupos}">
                <span>${window.I18n ? window.I18n.t('Grupos') : 'Grupos'}</span>
                <span class="pf-table-tab-pill">${groupsCount}</span>
              </button>
            </div>
            <p class="pf-table-head-desc">${subText}</p>
          </div>
          <div class="pf-positions-head-actions">
            <button class="pf-outline-button pf-show-all-btn" type="button" data-pf-chart-show-all="${isGrupos ? 'grupos' : 'valores'}" title="${showAllTitle}">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg>
              <span>${window.I18n ? window.I18n.t('Mostrar todo') : 'Mostrar todo'}</span>
            </button>
            <button class="pf-outline-button pf-toggle-chart-btn" type="button" data-pf-chart-toggle title="${PS.chartOpen ? (window.I18n ? window.I18n.t('Ocultar gráfico comparativo') : 'Ocultar gráfico comparativo') : (window.I18n ? window.I18n.t('Mostrar gráfico comparativo') : 'Mostrar gráfico comparativo')}">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg>
              <span>${PS.chartOpen ? (window.I18n ? window.I18n.t('Ocultar gráfico') : 'Ocultar gráfico') : (window.I18n ? window.I18n.t('Mostrar gráfico') : 'Mostrar gráfico')}</span>
            </button>
            <div class="pf-positions-views" role="group" aria-label="Vista de posiciones">
              ${views.map(([key, label]) => `
                <button class="pf-positions-view-btn ${currentView === key ? 'active' : ''}" type="button"
                  data-pf-view="${key}" aria-pressed="${currentView === key}">
                  ${window.I18n ? window.I18n.t(label) : label}
                </button>`).join('')}
            </div>
          </div>
        </div>
        ${contentHtml}
        <div class="pf-card-footer">
          <button class="pf-footer-link" type="button" data-pf-export>${window.I18n ? window.I18n.t('⇩ Exportar CSV') : '⇩ Exportar CSV'}</button>
        </div>
      </div>`;
  }

  async function savePortfolioPreferences(patch) {
    try {
      const payload = await api('/api/watchlists/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (PS.data) {
        PS.data.userPreferences = { ...(PS.data.userPreferences ?? {}), ...(payload?.preferences ?? patch) };
      }
      window.showToast?.('Preferencia guardada.');
      rerenderKeepingScroll();
    } catch (error) {
      window.showToast?.(error.message || 'No se pudo guardar la preferencia.');
    }
  }

  function portfolioContentHtml() {
    const valueChartHtml = PS.valueChartOpen ? (window.PortfolioValueChart?.valueChartPanelHtml?.() ?? '') : '';
    if (PS.portfolioTab === 'cartera') return `${allocationPanelHtml()}${valueChartHtml}${PS.chartOpen ? chartPanelHtml() : ''}${positionsPanelHtml()}`;
    if (PS.portfolioTab === 'dividendos') return dividendPanelHtml();
    if (PS.portfolioTab === 'operaciones') return operationsPanelHtml();
    return `${allocationPanelHtml()}${valueChartHtml}${PS.chartOpen ? chartPanelHtml() : ''}${positionsPanelHtml()}`;
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
    scope.querySelectorAll('[data-pf-table-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.pfTableTab;
        if (tab === PS.positionsTab) return;
        PS.positionsTab = tab;
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('[data-pf-view]').forEach((button) => {
      button.addEventListener('click', () => {
        PS.positionsView = button.dataset.pfView;
        PS.groupsView = button.dataset.pfView;
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('.pf-broker-table:not(.pf-g-members-table):not(.pf-g-groups-table) th[data-sort-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
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

    scope.querySelectorAll('[data-pf-value-chart-toggle]').forEach((el) => {
      const activate = (event) => {
        if (event.type === 'keydown') {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
        }
        event.stopPropagation();
        const chartModule = window.PortfolioValueChart;
        const existing = PS.sectionRoot?.querySelector('[data-pf-value-chart]');
        if (existing && chartModule?.isValueFullscreen?.(existing)) {
          chartModule.toggleValueChartFullscreen(existing);
          return;
        }
        PS.valueChartOpen = true;
        PS.portfolioTab = 'cartera';
        if (!existing) rerenderKeepingScroll();
        const panel = PS.sectionRoot?.querySelector('[data-pf-value-chart]');
        chartModule?.toggleValueChartFullscreen?.(panel);
      };
      el.addEventListener('click', activate);
      el.addEventListener('keydown', activate);
    });

    scope.querySelectorAll('[data-pf-net-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const prefs = PS.data?.userPreferences ?? {};
        savePortfolioPreferences({ dividendNetEnabled: !Boolean(prefs.dividendNetEnabled) });
      });
    });
    scope.querySelectorAll('[data-pf-net-pct]').forEach((input) => {
      input.addEventListener('click', (event) => event.stopPropagation());
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          input.blur();
        }
      });
      input.addEventListener('change', () => {
        const raw = Number(input.value);
        const fallback = Number(PS.data?.userPreferences?.dividendWithholdingPct);
        const value = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : (Number.isFinite(fallback) ? fallback : 20);
        input.value = value;
        savePortfolioPreferences({ dividendWithholdingPct: value });
      });
    });

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
          const tickerChoices = allChoices.filter((c) => c.kind === 'ticker');
          if (PS.positionsView === 'sold') {
            PS.chartSelectedIds = tickerChoices.filter((c) => c.id.endsWith(':sell')).slice(0, 20).map((c) => c.id);
          } else if (PS.positionsView === 'current') {
            PS.chartSelectedIds = tickerChoices.filter((c) => c.id.endsWith(':buy')).slice(0, 20).map((c) => c.id);
          } else {
            const chosen = [];
            const seenTickers = new Set();
            for (const c of tickerChoices) {
              if (c.id.endsWith(':all') && c.ticker && !seenTickers.has(c.ticker)) {
                chosen.push(c.id);
                seenTickers.add(c.ticker);
              }
            }
            for (const c of tickerChoices) {
              if (c.ticker && !seenTickers.has(c.ticker)) {
                chosen.push(c.id);
                seenTickers.add(c.ticker);
              }
            }
            PS.chartSelectedIds = chosen.slice(0, 20);
          }
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
    window.PortfolioValueChart?.wireValueChart?.(scope);
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
