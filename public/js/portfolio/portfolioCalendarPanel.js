/**
 * @fileoverview Panel del calendario y navegación (extraído de portfolioCalendar.js).
 */

(function (window) {
  const CS = window.PortfolioCalendarState;


  function calendarPanelHtml(data) {
    const allEvents = getPortfolioCalendarEvents(CS.calendarYear, CS.calendarMonth, data);
    const earningsCount = allEvents.filter((e) => e.type === 'earnings').length;
    const exdivCount = allEvents.filter((e) => e.type === 'exdiv').length;
    const payoutEvents = allEvents.filter((e) => e.type === 'payout');
    const payoutCount = payoutEvents.length;
    const totalPayoutAmount = payoutEvents.reduce((acc, e) => acc + (e.amount || 0), 0);

    const filteredEvents = allEvents.filter((e) => {
      if (e.type === 'earnings' && !CS.calendarVisibility.earnings) return false;
      if (e.type === 'exdiv' && !CS.calendarVisibility.exdiv) return false;
      if (e.type === 'payout' && !CS.calendarVisibility.payout) return false;

      if (e.isPortfolio && !CS.calendarVisibility.portfolio) return false;
      if (!e.isPortfolio && !CS.calendarVisibility.watchlist) return false;

      const ticker = (e.ticker || '').toUpperCase();
      const compVis = getCompanyVisibility(ticker, data);
      if (e.type === 'earnings' && !compVis.earnings) return false;
      if (e.type === 'exdiv' && !compVis.exdiv) return false;
      if (e.type === 'payout' && !compVis.payout) return false;

      return true;
    });

    const isCustom = hasCustomCalendarFilters();
    const monthName = MONTH_NAMES_ES[CS.calendarMonth];

    return `
      <div class="pf-calendar-dashboard">
        ${calendarCompaniesPanelHtml(data)}

        <div class="pf-cal-kpis-grid">
          <article class="pf-cal-kpi-card pf-cal-kpi-interactive" data-cal-kpi-toggle="all" title="Clic para restablecer y mostrar todos los eventos">
            <div class="pf-cal-kpi-icon icon-all">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            </div>
            <div class="pf-cal-kpi-body">
              <div class="pf-cal-kpi-head-line">
                <span class="pf-cal-kpi-label">Eventos en ${monthName}</span>
                ${isCustom ? '<span class="pf-cal-kpi-pill filter-note">Filtro activo</span>' : ''}
              </div>
              <strong class="pf-cal-kpi-value">${filteredEvents.length}</strong>
              <small class="pf-cal-kpi-sub">${isCustom ? `${allEvents.length} eventos en total` : 'Total cartera y seguimiento'}</small>
            </div>
          </article>

          <article class="pf-cal-kpi-card pf-cal-kpi-interactive ${!CS.calendarVisibility.earnings ? 'kpi-dimmed' : ''}" data-cal-kpi-toggle="earnings" title="Clic para ${CS.calendarVisibility.earnings ? 'ocultar' : 'mostrar'} resultados empresariales">
            <div class="pf-cal-kpi-icon icon-earnings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
            </div>
            <div class="pf-cal-kpi-body">
              <div class="pf-cal-kpi-head-line">
                <span class="pf-cal-kpi-label">Resultados empresariales</span>
                <span class="pf-cal-kpi-pill ${CS.calendarVisibility.earnings ? 'visible' : 'hidden'}">${CS.calendarVisibility.earnings ? 'Visible' : 'Oculto'}</span>
              </div>
              <strong class="pf-cal-kpi-value">${earningsCount}</strong>
              <small class="pf-cal-kpi-sub">Informes 10-Q / 10-K</small>
            </div>
          </article>

          <article class="pf-cal-kpi-card pf-cal-kpi-interactive ${!CS.calendarVisibility.exdiv ? 'kpi-dimmed' : ''}" data-cal-kpi-toggle="exdiv" title="Clic para ${CS.calendarVisibility.exdiv ? 'ocultar' : 'mostrar'} fechas ex-dividend">
            <div class="pf-cal-kpi-icon icon-exdiv">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="pf-cal-kpi-body">
              <div class="pf-cal-kpi-head-line">
                <span class="pf-cal-kpi-label">Fechas Ex-Dividend</span>
                <span class="pf-cal-kpi-pill ${CS.calendarVisibility.exdiv ? 'visible' : 'hidden'}">${CS.calendarVisibility.exdiv ? 'Visible' : 'Oculto'}</span>
              </div>
              <strong class="pf-cal-kpi-value">${exdivCount}</strong>
              <small class="pf-cal-kpi-sub">Corte con derecho a cobro</small>
            </div>
          </article>

          <article class="pf-cal-kpi-card pf-cal-kpi-interactive ${!CS.calendarVisibility.payout ? 'kpi-dimmed' : ''}" data-cal-kpi-toggle="payout" title="Clic para ${CS.calendarVisibility.payout ? 'ocultar' : 'mostrar'} pagos de dividendos">
            <div class="pf-cal-kpi-icon icon-payout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>
            </div>
            <div class="pf-cal-kpi-body">
              <div class="pf-cal-kpi-head-line">
                <span class="pf-cal-kpi-label">Total a cobrar en el mes</span>
                <span class="pf-cal-kpi-pill ${CS.calendarVisibility.payout ? 'visible' : 'hidden'}">${CS.calendarVisibility.payout ? 'Visible' : 'Oculto'}</span>
              </div>
              <strong class="pf-cal-kpi-value ${CS.calendarVisibility.payout ? 'text-emerald' : ''}">${fmtEur(totalPayoutAmount)}</strong>
              <small class="pf-cal-kpi-sub">${payoutCount} pagos previstos</small>
            </div>
          </article>
        </div>

        <div class="pf-dividend-card pf-cal-card">
          <div class="pf-card-head pf-cal-card-head">
            <div class="pf-cal-month-nav">
              <button class="pf-outline-button pf-cal-nav-btn" type="button" data-cal-nav="prev" title="Mes anterior">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <h3 class="pf-cal-month-title">${monthName} <span class="pf-cal-year-dim">${CS.calendarYear}</span></h3>
              <button class="pf-outline-button pf-cal-nav-btn" type="button" data-cal-nav="next" title="Mes siguiente">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <button class="pf-outline-button pf-cal-today-btn" type="button" data-cal-today>Hoy</button>
            </div>

            <div class="pf-cal-toolbar-actions">
              <div class="pf-cal-filters" role="group" aria-label="Filtrar eventos">
                <button class="pf-cal-filter-btn ${!isCustom ? 'active' : ''}" type="button" data-cal-filter-toggle="all" title="Mostrar todos los eventos">
                  Todos <span class="pf-filter-badge">${allEvents.length}</span>
                </button>
                <button class="pf-cal-filter-btn filter-earnings ${CS.calendarVisibility.earnings ? 'active' : 'inactive'}" type="button" data-cal-filter-toggle="earnings" title="${CS.calendarVisibility.earnings ? 'Ocultar Resultados' : 'Mostrar Resultados'}">
                  <span class="pf-filter-dot dot-earnings"></span>Resultados <span class="pf-filter-badge">${earningsCount}</span>
                </button>
                <button class="pf-cal-filter-btn filter-exdiv ${CS.calendarVisibility.exdiv ? 'active' : 'inactive'}" type="button" data-cal-filter-toggle="exdiv" title="${CS.calendarVisibility.exdiv ? 'Ocultar Ex-Dividend' : 'Mostrar Ex-Dividend'}">
                  <span class="pf-filter-dot dot-exdiv"></span>Ex-Dividend <span class="pf-filter-badge">${exdivCount}</span>
                </button>
                <button class="pf-cal-filter-btn filter-payout ${CS.calendarVisibility.payout ? 'active' : 'inactive'}" type="button" data-cal-filter-toggle="payout" title="${CS.calendarVisibility.payout ? 'Ocultar Cobros' : 'Mostrar Cobros'}">
                  <span class="pf-filter-dot dot-payout"></span>Cobro <span class="pf-filter-badge">${payoutCount}</span>
                </button>
              </div>

              <button class="pf-outline-button pf-cal-config-trigger-btn ${isCustom ? 'has-active-filters' : ''}" type="button" data-cal-open-config title="Editar qué tipos de eventos y empresas mostrar en el calendario">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="21" y2="21"/><line x1="4" x2="20" y1="14" y2="14"/><line x1="4" x2="20" y1="7" y2="7"/><circle cx="8" cy="7" r="2"/><circle cx="16" cy="14" r="2"/><circle cx="10" cy="21" r="2"/></svg>
                <span>Editar qué mostrar</span>
                ${isCustom ? '<span class="pf-cal-config-active-dot" title="Filtros personalizados activos"></span>' : ''}
              </button>

              <div class="pf-segmented-toggle" role="group" aria-label="Modo de visualización">
                <button class="pf-seg-btn ${CS.calendarViewMode === 'grid' ? 'active' : ''}" type="button" data-cal-view="grid" title="Vista Cuadrícula">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
                  <span>Calendario</span>
                </button>
                <button class="pf-seg-btn ${CS.calendarViewMode === 'list' ? 'active' : ''}" type="button" data-cal-view="list" title="Vista Lista">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
                  <span>Lista</span>
                </button>
              </div>
            </div>
          </div>

          <div class="pf-cal-content-wrap">
            ${CS.calendarViewMode === 'grid' ? calendarGridViewHtml(filteredEvents, CS.calendarYear, CS.calendarMonth, data) : calendarListViewHtml(filteredEvents, data)}
          </div>
        </div>

        ${calendarModalHtml()}
        ${calendarConfigModalHtml()}
        ${calendarCompanyEditModalHtml(data)}
      </div>`;
  }

  function wireCalendarNavigation(scope, ctx) {
    const { renderCalendarView, onNavigate, getData, hasPosition, refresh } = ctx;
    const rerender = ctx.rerender;
    scope.querySelectorAll('[data-cal-nav="prev"]').forEach((btn) => {
          btn.addEventListener('click', () => {
            CS.calendarMonth--;
            if (CS.calendarMonth < 0) {
              CS.calendarMonth = 11;
              CS.calendarYear--;
            }
            rerender();
          });
        });
    scope.querySelectorAll('[data-cal-nav="next"]').forEach((btn) => {
          btn.addEventListener('click', () => {
            CS.calendarMonth++;
            if (CS.calendarMonth > 11) {
              CS.calendarMonth = 0;
              CS.calendarYear++;
            }
            rerender();
          });
        });
    scope.querySelectorAll('[data-cal-today]').forEach((btn) => {
          btn.addEventListener('click', () => {
            CS.calendarYear = 2026;
            CS.calendarMonth = 7;
            rerender();
          });
        });
    scope.querySelectorAll('[data-cal-view]').forEach((btn) => {
          btn.addEventListener('click', () => {
            CS.calendarViewMode = btn.dataset.calView;
            rerender();
          });
        });
    scope.querySelectorAll('[data-cal-open-day]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            CS.calendarViewMode = 'list';
            rerender();
          });
        });
  }

window.calendarPanelHtml = calendarPanelHtml;
window.wireCalendarNavigation = wireCalendarNavigation;

})(window);
