/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;
  const { donutBlock, hideChartTooltip, wireDonutTooltips } = window.PortfolioDonuts;

  async function renderSection() {
    if (!PS.sectionRoot) return;
    hideChartTooltip();

    if (!PS.userLogged) {
      if (isAuthPending()) {
        PS.sectionRoot.innerHTML = '<div class="watch-section-empty">Cargando tu cartera…</div>';
        PS.sectionOptions.onEmptyChange?.(false);
        return;
      }
      PS.sectionRoot.innerHTML = '<div class="watch-section-empty">Inicia sesión para gestionar tu cartera.</div>';
      PS.sectionOptions.onEmptyChange?.(false);
      return;
    }

    if (!PS.data) {
      PS.sectionRoot.innerHTML = '<div class="watch-section-empty">Cargando tu cartera…</div>';
      PS.sectionOptions.onEmptyChange?.(false);
      return;
    }

    const hasTransactions = Array.isArray(PS.data.transactions) && PS.data.transactions.length > 0;
    PS.sectionOptions.onEmptyChange?.(hasTransactions);

    if (!hasTransactions && PS.portfolioTab === 'operaciones' && PS.formExpanded) {
      PS.sectionRoot.innerHTML = `
        <div class="pf-dashboard">
          ${operationsPanelHtml()}
        </div>`;
      wirePortfolioDashboard(PS.sectionRoot);
      return;
    }

    if (!hasTransactions) {
      PS.sectionRoot.innerHTML = `
        <div class="pf-dashboard">
          <div class="pf-empty-state">
            <p>Tu cartera está vacía. Añade tus primeras compras para ver el precio medio, los dividendos acumulados y la rentabilidad real.</p>
            <button class="primary-button pf-dashboard-empty-add" type="button" data-pf-add>Añadir operación</button>
          </div>
        </div>`;
      wirePortfolioDashboard(PS.sectionRoot);
      return;
    }

    PS.sectionRoot.innerHTML = `
      <div class="pf-dashboard">
        ${renderSummaryCards()}
        ${portfolioTabsHtml()}
        ${portfolioContentHtml()}
      </div>
    `;

    wirePortfolioDashboard(PS.sectionRoot);
  }

  function mountSection(root, options = {}) {
    PS.sectionRoot = root;
    PS.sectionOptions = options;
    if (!PS.userLogged) {
      const user = window.AuthModule?.getUser?.() || window.currentUser;
      if (user) PS.userLogged = true;
    }
    if (!PS.data && PS.userLogged) {
      refresh();
    } else {
      renderSection();
    }
  }

  function renderCalendarSection() {
    if (!PS.calendarSectionRoot) return;

    if (!PS.userLogged) {
      if (isAuthPending()) {
        PS.calendarSectionRoot.innerHTML = '<div class="watch-section-empty">Cargando tu calendario…</div>';
        return;
      }
      PS.calendarSectionRoot.innerHTML = `
        <div class="pf-dashboard pf-calendar-page">
          <div class="pf-empty-state">
            <div style="font-size:32px;margin-bottom:12px;">📅</div>
            <h3>Calendario de Resultados y Dividendos</h3>
            <p>Inicia sesión para consultar las fechas oficiales de resultados (10-Q / 10-K) y dividendos de tus empresas.</p>
            <button class="primary-button" type="button" data-cal-login-btn>Iniciar sesión</button>
          </div>
        </div>`;
      PS.calendarSectionRoot.querySelector('[data-cal-login-btn]')?.addEventListener('click', () => {
        window.openModal?.('login');
      });
      return;
    }

    if (!PS.data) {
      PS.calendarSectionRoot.innerHTML = '<div class="watch-section-empty">Cargando tu calendario…</div>';
      return;
    }

    PS.calendarSectionRoot.innerHTML = `
      <div class="pf-dashboard pf-calendar-page">
        ${calendarPanelHtml()}
      </div>
    `;

    wireCalendarDashboard(PS.calendarSectionRoot);
  }

  function mountCalendarSection(root, options = {}) {
    PS.calendarSectionRoot = root;
    PS.calendarSectionOptions = options;
    if (!PS.userLogged) {
      const user = window.AuthModule?.getUser?.() || window.currentUser;
      if (user) PS.userLogged = true;
    }
    if (!PS.data && PS.userLogged) {
      refresh();
    } else {
      renderCalendarSection();
    }
  }

  function registerCompanyPanel(root) {
    if (!root) return;
    companyPanels.add(root);
    renderCompanyPanel(root);
  }

  async function renderCompanyPanel(root) {
    const ticker = root?.dataset?.ticker;
    if (!ticker) return;

    if (!PS.userLogged) {
      root.innerHTML = '<div class="watch-section-empty">Inicia sesión para gestionar tu cartera.</div>';
      return;
    }

    if (!PS.data) {
      root.innerHTML = '<div class="watch-section-empty">Cargando tu cartera…</div>';
      return;
    }

    const companyName = root.dataset.name ?? ticker;
    const position = getPosition(ticker);
    const hasPositions = (PS.data.positions ?? []).length > 0;

    const byCompany = (PS.data.allocations?.byCompany ?? []).map((item) => ({ label: item.companyName || item.ticker, labelKey: item.ticker, value: item.value, percent: item.percent }));
    const companyColors = new Map(byCompany.map((item, index) => [item.labelKey, PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length]]));
    const bySector = (PS.data.allocations?.bySector ?? []).map((item) => ({ label: item.sector, labelKey: item.sector, value: item.value, percent: item.percent }));
    const sectorColors = new Map(bySector.map((item, index) => [item.labelKey, PORTFOLIO_COLORS[(index * 3 + 1) % PORTFOLIO_COLORS.length]]));

    const positionHtml = position
      ? `<div class="pf-summary-grid pf-company-grid">
          <div class="pf-summary-card"><span>Acciones</span><strong>${fmtShares(position.shares)}</strong></div>
          <div class="pf-summary-card"><span>Coste medio</span><strong>${fmtPrice(position.avgCost)}</strong></div>
          <div class="pf-summary-card"><span>Precio actual</span><strong>${fmtPrice(position.price)}</strong></div>
          <div class="pf-summary-card"><span>Valor</span><strong>${fmtMoney(position.value)}</strong></div>
          <div class="pf-summary-card"><span>No realizada</span><strong class="${changeClass(position.unrealizedGross)}">${fmtSigned(position.unrealizedGross)}</strong></div>
          <div class="pf-summary-card"><span>Dividendos acumulados (est.)</span><strong>${fmtSigned(position.dividendsTotal)}</strong></div>
          <div class="pf-summary-card"><span>Dividendos anuales previstos</span><strong>${fmtMoney(position.projectedAnnualDividends)}</strong></div>
          <div class="pf-summary-card"><span>Rentabilidad total</span><strong class="${changeClass(position.totalReturn)}">${fmtSigned(position.totalReturn)}</strong></div>
        </div>`
      : '<div class="watch-section-empty">Aún no tienes acciones de esta empresa en tu cartera.</div>';

    root.innerHTML = `
      <div class="pf-panel">
        <div class="pf-panel-head">
          <h4>Tu posición en ${escapeHtml(ticker)}</h4>
          <a class="text-button" href="/cartera">Ver cartera completa <span>↗</span></a>
        </div>
        ${positionHtml}
        <div class="pf-panel-head pf-sub-head"><h5>Nueva operación</h5></div>
        ${transactionFormHtml({ ticker, companyName })}
      </div>
      ${hasPositions ? `
        <div class="pf-panel">
          <div class="pf-panel-head"><h4>Distribución de la cartera</h4></div>
          <div class="pf-donuts">
            ${donutBlock('Por empresa', byCompany, companyColors)}
            ${donutBlock('Por sector', bySector, sectorColors)}
          </div>
        </div>` : ''}
      ${(PS.data.transactions ?? []).length ? historyWidgetHtml() : ''}
    `;
    wireTransactionForm(root.querySelector('.pf-form'));
    wireHistoryWidget(root);
    wireDonutTooltips(root);
  }

  function renderCompanyPanels() {
    companyPanels.forEach((root) => renderCompanyPanel(root));
  }

  const companyPanels = new Set();
window.renderSection = renderSection;
window.mountSection = mountSection;
window.renderCalendarSection = renderCalendarSection;
window.mountCalendarSection = mountCalendarSection;
window.registerCompanyPanel = registerCompanyPanel;
window.renderCompanyPanel = renderCompanyPanel;
window.renderCompanyPanels = renderCompanyPanels;

})(window);
