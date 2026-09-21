/**
 * @fileoverview Filtros y configuración del calendario (extraído de portfolioCalendar.js).
 */

(function (window) {
  const CS = window.PortfolioCalendarState;


  function wireCalendarFilters(scope, ctx) {
    const { renderCalendarView, onNavigate, getData, hasPosition, refresh } = ctx;
    const rerender = ctx.rerender;
    scope.querySelectorAll('[data-cal-filter-toggle]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const toggleKey = btn.dataset.calFilterToggle;
            if (toggleKey === 'all') {
              CS.calendarVisibility.earnings = true;
              CS.calendarVisibility.exdiv = true;
              CS.calendarVisibility.payout = true;
              CS.calendarVisibility.portfolio = true;
              CS.calendarVisibility.watchlist = true;
            } else if (toggleKey in CS.calendarVisibility) {
              CS.calendarVisibility[toggleKey] = !CS.calendarVisibility[toggleKey];
            }
            saveCalendarVisibility(CS.calendarVisibility);
            rerender();
          });
        });
    scope.querySelectorAll('[data-cal-kpi-toggle]').forEach((card) => {
          card.addEventListener('click', () => {
            const toggleKey = card.dataset.calKpiToggle;
            if (toggleKey === 'all') {
              CS.calendarVisibility.earnings = true;
              CS.calendarVisibility.exdiv = true;
              CS.calendarVisibility.payout = true;
              CS.calendarVisibility.portfolio = true;
              CS.calendarVisibility.watchlist = true;
            } else if (toggleKey in CS.calendarVisibility) {
              CS.calendarVisibility[toggleKey] = !CS.calendarVisibility[toggleKey];
            }
            saveCalendarVisibility(CS.calendarVisibility);
            rerender();
          });
        });
    scope.querySelectorAll('[data-cal-event-id]').forEach((el) => {
          el.addEventListener('click', (ev) => {
            if (ev.target.closest('[data-cal-goto]') || ev.target.closest('[data-cal-list-analyze]') || ev.target.closest('[data-cal-preview-doc]')) return;
            const id = el.dataset.calEventId;
            const allEvents = getPortfolioCalendarEvents(CS.calendarYear, CS.calendarMonth, getData ? getData() : null);
            const match = allEvents.find((x) => x.id === id);
            if (match) {
              CS.calendarActiveModalEvent = match;
              CS.calendarAiLoading = false;
              CS.calendarAiResult = null;
              CS.calendarAiError = null;
              rerender();
            }
          });
        });
    scope.querySelectorAll('[data-cal-goto]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            CS.calendarActiveModalEvent = null;
            CS.calendarAiLoading = false;
            CS.calendarAiResult = null;
            CS.calendarAiError = null;
            const ticker = btn.dataset.calGoto;
            if (ticker && onNavigate) onNavigate(ticker);
            else if (ticker) window.location.href = `/empresa/${encodeURIComponent(ticker)}`;
          });
        });
    scope.querySelectorAll('[data-cal-chip-ticker]').forEach((chip) => {
          chip.addEventListener('click', (ev) => {
            if (ev.target.closest('[data-cal-remove-ticker]') || ev.target.closest('[data-cal-edit-company]')) return;
            const ticker = chip.dataset.calChipTicker;
            if (ticker && onNavigate) onNavigate(ticker);
            else if (ticker) window.location.href = `/empresa/${encodeURIComponent(ticker)}`;
          });
        });
  }

  function wireCalendarConfig(scope, ctx) {
    const { renderCalendarView, onNavigate, getData, hasPosition, refresh } = ctx;
    const rerender = ctx.rerender;
    scope.querySelectorAll('[data-cal-open-config]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            CS.calendarConfigModalOpen = true;
            rerender();
          });
        });
    scope.querySelectorAll('[data-cal-close-config]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            CS.calendarConfigModalOpen = false;
            rerender();
          });
        });
    scope.querySelectorAll('[data-cal-toggle-key]').forEach((input) => {
          input.addEventListener('change', () => {
            const key = input.dataset.calToggleKey;
            if (key in CS.calendarVisibility) {
              CS.calendarVisibility[key] = input.checked;
              saveCalendarVisibility(CS.calendarVisibility);
            }
          });
        });
    scope.querySelectorAll('[data-cal-preset]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const preset = btn.dataset.calPreset;
            if (preset === 'all') {
              CS.calendarVisibility.earnings = true;
              CS.calendarVisibility.exdiv = true;
              CS.calendarVisibility.payout = true;
              CS.calendarVisibility.portfolio = true;
              CS.calendarVisibility.watchlist = true;
            } else if (preset === 'dividends') {
              CS.calendarVisibility.earnings = false;
              CS.calendarVisibility.exdiv = true;
              CS.calendarVisibility.payout = true;
              CS.calendarVisibility.portfolio = true;
              CS.calendarVisibility.watchlist = true;
            } else if (preset === 'earnings') {
              CS.calendarVisibility.earnings = true;
              CS.calendarVisibility.exdiv = false;
              CS.calendarVisibility.payout = false;
              CS.calendarVisibility.portfolio = true;
              CS.calendarVisibility.watchlist = true;
            }
            saveCalendarVisibility(CS.calendarVisibility);
            rerender();
          });
        });
    scope.querySelectorAll('[data-cal-reset-config]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            CS.calendarVisibility = { earnings: true, exdiv: true, payout: true, portfolio: true, watchlist: true };
            saveCalendarVisibility(CS.calendarVisibility);
            rerender();
          });
        });
  }

window.wireCalendarFilters = wireCalendarFilters;
window.wireCalendarConfig = wireCalendarConfig;

})(window);
