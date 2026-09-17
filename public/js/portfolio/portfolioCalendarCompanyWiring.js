/**
 * @fileoverview Filtros por empresa y acciones de IA del calendario (extraído de portfolioCalendar.js).
 */

(function (window) {
  const CS = window.PortfolioCalendarState;


  function wireCalendarCompanyFilters(scope, ctx) {
    const { renderCalendarView, onNavigate, getData, hasPosition, refresh } = ctx;
    const rerender = ctx.rerender;
    scope.querySelectorAll('[data-cal-toggle-companies]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            CS.calendarCompaniesHidden = !CS.calendarCompaniesHidden;
            saveCalendarCompaniesHidden(CS.calendarCompaniesHidden);
            rerender();
          });
        });
    scope.querySelectorAll('[data-cal-edit-company]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            CS.calendarEditingCompanyTicker = btn.dataset.calEditCompany;
            rerender();
          });
        });
    scope.querySelectorAll('[data-cal-close-company-modal]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            CS.calendarEditingCompanyTicker = null;
            rerender();
          });
        });
    scope.querySelectorAll('[data-cal-company-toggle]').forEach((input) => {
          input.addEventListener('change', () => {
            if (!CS.calendarEditingCompanyTicker) return;
            const key = input.dataset.calCompanyToggle;
            const up = CS.calendarEditingCompanyTicker.toUpperCase();
            if (!CS.calendarCompanyVisibility[up]) {
              CS.calendarCompanyVisibility[up] = { ...getCompanyDefaultVisibility(up, getData ? getData() : null) };
            }
            CS.calendarCompanyVisibility[up][key] = input.checked;
            const def = getCompanyDefaultVisibility(up, getData ? getData() : null);
            if (
              CS.calendarCompanyVisibility[up].earnings === def.earnings &&
              CS.calendarCompanyVisibility[up].exdiv === def.exdiv &&
              CS.calendarCompanyVisibility[up].payout === def.payout
            ) {
              delete CS.calendarCompanyVisibility[up];
            }
            saveCalendarCompanyVisibility(CS.calendarCompanyVisibility);
          });
        });
    scope.querySelectorAll('[data-cal-company-preset]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!CS.calendarEditingCompanyTicker) return;
            const up = CS.calendarEditingCompanyTicker.toUpperCase();
            const preset = btn.dataset.calCompanyPreset;
            if (preset === 'all') {
              CS.calendarCompanyVisibility[up] = { earnings: true, exdiv: true, payout: true };
            } else if (preset === 'dividends') {
              CS.calendarCompanyVisibility[up] = { earnings: false, exdiv: true, payout: true };
            } else if (preset === 'earnings') {
              CS.calendarCompanyVisibility[up] = { earnings: true, exdiv: false, payout: false };
            } else if (preset === 'default') {
              delete CS.calendarCompanyVisibility[up];
            }
            if (CS.calendarCompanyVisibility[up]) {
              const def = getCompanyDefaultVisibility(up, getData ? getData() : null);
              if (
                CS.calendarCompanyVisibility[up].earnings === def.earnings &&
                CS.calendarCompanyVisibility[up].exdiv === def.exdiv &&
                CS.calendarCompanyVisibility[up].payout === def.payout
              ) {
                delete CS.calendarCompanyVisibility[up];
              }
            }
            saveCalendarCompanyVisibility(CS.calendarCompanyVisibility);
            rerender();
          });
        });
    scope.querySelectorAll('[data-cal-company-reset]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!CS.calendarEditingCompanyTicker) return;
            const up = CS.calendarEditingCompanyTicker.toUpperCase();
            delete CS.calendarCompanyVisibility[up];
            saveCalendarCompanyVisibility(CS.calendarCompanyVisibility);
            rerender();
          });
        });
    scope.querySelectorAll('.pf-cal-chip-logo').forEach((logo) => {
          logo.addEventListener('error', () => {
            const letter = document.createElement('span');
            letter.className = 'pf-cal-chip-fallback';
            letter.textContent = logo.dataset.letter || '?';
            logo.replaceWith(letter);
          });
        });
    scope.querySelectorAll('[data-cal-remove-ticker]').forEach((btn) => {
          btn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const ticker = btn.dataset.calRemoveTicker;
            if (hasPosition && hasPosition(ticker)) {
              window.showToast?.(`No se puede eliminar ${ticker} porque está en tu cartera.`);
              return;
            }
            btn.disabled = true;
            try {
              const res = await fetch(`/api/watchlists/calendar/items/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
              const payload = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(payload.error || 'No se pudo eliminar del calendario.');
              window.showToast?.(`${ticker} eliminada del calendario.`);
              if (typeof refresh === 'function') await refresh();
              if (typeof window.Watchlists !== 'undefined') await window.Watchlists.refresh();
            } catch (err) {
              window.showToast?.(err.message);
              btn.disabled = false;
            }
          });
        });
  }

  function wireCalendarAiActions(scope, ctx) {
    const { renderCalendarView, onNavigate, getData, hasPosition, refresh } = ctx;
    const rerender = ctx.rerender;
    scope.querySelectorAll('[data-cal-run-ai], [data-cal-list-analyze]').forEach((btn) => {
          btn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const ticker = btn.dataset.calRunAi || btn.dataset.calListAnalyze;
            const accession = btn.dataset.calAccession;
            if (!CS.calendarActiveModalEvent && btn.dataset.calListAnalyze) {
              const allEvents = getPortfolioCalendarEvents(CS.calendarYear, CS.calendarMonth, getData ? getData() : null);
              const match = allEvents.find((x) => x.ticker === ticker && x.type === 'earnings');
              if (match) CS.calendarActiveModalEvent = match;
            }
            await runCalendarFilingAnalysis(ticker, accession, rerender);
          });
        });
    scope.querySelectorAll('[data-cal-preview-doc]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const url = btn.dataset.calPreviewDoc;
            const name = btn.dataset.calPreviewName;
            openCalendarFilingPreview(url, name);
          });
        });
    scope.querySelectorAll('[data-cal-close-modal]').forEach((btn) => {
          btn.addEventListener('click', () => {
            CS.calendarActiveModalEvent = null;
            CS.calendarAiLoading = false;
            CS.calendarAiResult = null;
            CS.calendarAiError = null;
            rerender();
          });
        });
  }

window.wireCalendarCompanyFilters = wireCalendarCompanyFilters;
window.wireCalendarAiActions = wireCalendarAiActions;

})(window);
