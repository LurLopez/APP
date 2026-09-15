/**
 * @fileoverview Añadir tickers, atajos y orquestación del calendario (extraído de portfolioCalendar.js).
 */

(function (window) {
  const CS = window.PortfolioCalendarState;


  function wireCalendarAddTicker(scope, ctx) {
    const { renderCalendarView, onNavigate, getData, hasPosition, refresh } = ctx;
    const rerender = ctx.rerender || (() => ctx.renderCalendarView?.());
    const addInput = scope.querySelector('.pf-cal-add-input');
    const addResults = scope.querySelector('.pf-cal-add-results');
    let calSearchTimer = null;
    if (addInput && addResults) {
          addInput.addEventListener('input', () => {
            clearTimeout(calSearchTimer);
            const query = addInput.value.trim();
            if (!query) {
              addResults.hidden = true;
              addResults.innerHTML = '';
              return;
            }
            calSearchTimer = setTimeout(async () => {
              try {
                const res = await fetch(`/api/screener/search?q=${encodeURIComponent(query)}`);
                if (!res.ok) return;
                const payload = await res.json().catch(() => null);
                const matches = payload?.companies ?? [];
                if (!matches.length) {
                  addResults.innerHTML = '<div class="pf-ticker-empty">Sin resultados en EDGAR.</div>';
                  addResults.hidden = false;
                  return;
                }
                const existingTickers = new Set(getCalendarCompanies(getData ? getData() : null).map((c) => c.ticker.toUpperCase()));
                addResults.innerHTML = matches.map((comp) => {
                  const already = existingTickers.has(comp.ticker.toUpperCase());
                  return `
                    <button class="pf-ticker-result" type="button" data-add-ticker="${escapeHtml(comp.ticker)}" data-add-name="${escapeHtml(comp.name)}">
                      <img class="search-result-logo" src="https://companiesmarketcap.com/img/company-logos/64/${encodeURIComponent(comp.ticker)}.webp" alt="" loading="lazy" data-letter="${escapeHtml((comp.name || comp.ticker || '?').slice(0, 1).toUpperCase())}">
                      <span>${escapeHtml(comp.name)}</span>
                      ${already ? '<span class="pf-cal-result-already">En calendario</span>' : ''}
                      <strong>${escapeHtml(comp.ticker)}</strong>
                    </button>
                  `;
                }).join('');
                addResults.hidden = false;
    
                addResults.querySelectorAll('.pf-ticker-result').forEach((item) => {
                  item.addEventListener('click', async () => {
                    const t = item.dataset.addTicker;
                    const n = item.dataset.addName;
                    addInput.value = '';
                    addResults.hidden = true;
                    addResults.innerHTML = '';
                    await addCalendarTickerAction(t, n);
                  });
                });
    
                addResults.querySelectorAll('.search-result-logo').forEach((logo) => {
                  logo.addEventListener('error', () => {
                    const letter = document.createElement('span');
                    letter.className = 'search-result-logo search-result-logo-fallback';
                    letter.textContent = logo.dataset.letter || '?';
                    logo.replaceWith(letter);
                  });
                });
              } catch {
                // Silencioso
              }
            }, 250);
          });
    
          addInput.addEventListener('keydown', async (ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              const val = addInput.value.trim().toUpperCase();
              if (val) {
                addInput.value = '';
                addResults.hidden = true;
                addResults.innerHTML = '';
                await addCalendarTickerAction(val, val);
              }
            } else if (ev.key === 'Escape') {
              addResults.hidden = true;
              addInput.blur();
            }
          });
    
          document.addEventListener('click', (ev) => {
            if (!ev.target.closest('.pf-cal-add-company-wrap')) {
              addResults.hidden = true;
            }
          });
        }
    async function addCalendarTickerAction(ticker, name) {
          ticker = String(ticker || '').trim().toUpperCase();
          if (!ticker) return;
          if (hasPosition && hasPosition(ticker)) {
            window.showToast?.(`${ticker} ya está en tu cartera y siempre aparece en el calendario.`);
            return;
          }
          const current = getCalendarCompanies(getData ? getData() : null);
          if (current.some((c) => c.ticker === ticker)) {
            window.showToast?.(`${ticker} ya está en el calendario.`);
            return;
          }
          try {
            const res = await fetch('/api/watchlists/calendar/items', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticker, companyName: name || ticker }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || 'No se pudo añadir al calendario.');
            window.showToast?.(`${ticker} añadida al calendario.`);
            if (typeof refresh === 'function') await refresh();
            if (typeof window.Watchlists !== 'undefined') await window.Watchlists.refresh();
          } catch (err) {
            window.showToast?.(err.message);
          }
        }
  }

  function wireCalendarModalAndKeys(scope, ctx) {
    const { renderCalendarView, onNavigate, getData, hasPosition, refresh } = ctx;
    const rerender = ctx.rerender;
    const previewCloseBtn = document.querySelector('#filings-preview-close');
    const previewBackdrop = document.querySelector('#filings-preview-backdrop');
    if (previewCloseBtn) previewCloseBtn.onclick = closeCalendarFilingPreview;
    if (previewBackdrop) {
      previewBackdrop.onclick = (event) => {
        if (event.target === previewBackdrop) closeCalendarFilingPreview();
      };
    }
    document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            const bd = document.querySelector('#filings-preview-backdrop');
            if (bd && !bd.hidden) closeCalendarFilingPreview();
            if (CS.calendarEditingCompanyTicker) {
              CS.calendarEditingCompanyTicker = null;
              rerender();
            } else if (CS.calendarConfigModalOpen) {
              CS.calendarConfigModalOpen = false;
              rerender();
            } else if (CS.calendarActiveModalEvent) {
              CS.calendarActiveModalEvent = null;
              CS.calendarAiLoading = false;
              CS.calendarAiResult = null;
              CS.calendarAiError = null;
              rerender();
            }
          }
        });
  }

  function wireCalendarDashboard(scope, opts = {}) {
    if (!scope) return;
    const ctx = { ...opts };
    ctx.rerender = () => {
      if (typeof ctx.renderCalendarView === 'function') ctx.renderCalendarView();
    };

    wireCalendarNavigation(scope, ctx);
    wireCalendarFilters(scope, ctx);
    wireCalendarConfig(scope, ctx);
    wireCalendarCompanyFilters(scope, ctx);
    wireCalendarAiActions(scope, ctx);
    wireCalendarAddTicker(scope, ctx);
    wireCalendarModalAndKeys(scope, ctx);
  }

window.wireCalendarAddTicker = wireCalendarAddTicker;
window.wireCalendarModalAndKeys = wireCalendarModalAndKeys;
window.wireCalendarDashboard = wireCalendarDashboard;

})(window);
