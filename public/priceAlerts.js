/**
 * @fileoverview Módulo de Alertas de Precio para Cifra Terminal.
 * Gestiona el ciclo de vida, llamadas a la API y eventos de alertas de precio.
 */

const PriceAlerts = (() => {
  let alerts = [];
  let currentFilter = 'all'; // 'all' | 'pending' | 'triggered'
  let searchDebounceTimer = null;
  let selectedCompany = null; // { ticker, name, price }
  let mountedContainers = [];

  const render = window.PriceAlertsRender || {};

  async function fetchLivePriceForTicker(ticker) {
    try {
      const res = await fetch(`/api/screener/company/${encodeURIComponent(ticker)}`);
      if (res.ok) {
        const data = await res.json();
        return data?.profile?.market?.price ?? data?.profile?.price ?? null;
      }
    } catch {}
    return null;
  }

  function setReferenceCompany(company, price, container = document) {
    selectedCompany = {
      ticker: company.ticker.toUpperCase(),
      name: company.name || company.ticker,
      price: price ?? null,
    };

    const refRow = container.querySelector('#pa-ref-row');
    const refTicker = container.querySelector('#pa-ref-ticker');
    const refCompany = container.querySelector('#pa-ref-company');
    const refPrice = container.querySelector('#pa-ref-price');
    const targetPriceInput = container.querySelector('#pa-target-price');

    if (refTicker) refTicker.textContent = selectedCompany.ticker;
    if (refCompany) refCompany.textContent = `(${selectedCompany.name})`;
    if (refPrice) {
      refPrice.textContent = selectedCompany.price ? `$${Number(selectedCompany.price).toFixed(2)}` : 'Consultando…';
    }
    if (refRow) refRow.hidden = false;
    if (selectedCompany.price && targetPriceInput && !targetPriceInput.value) {
      targetPriceInput.placeholder = Number(selectedCompany.price).toFixed(2);
    }
  }

  function updateCounts() {
    const all = alerts.length;
    const pending = alerts.filter((a) => a.status === 'pending').length;
    const triggered = alerts.filter((a) => a.status === 'triggered').length;

    document.querySelectorAll('.pa-count-all').forEach((el) => { el.textContent = all; });
    document.querySelectorAll('.pa-count-pending').forEach((el) => { el.textContent = pending; });
    document.querySelectorAll('.pa-count-triggered').forEach((el) => { el.textContent = triggered; });

    const badgeScope = document.querySelector('#price-alerts-count');
    if (badgeScope) badgeScope.textContent = pending;
  }

  function renderAlertsList() {
    const listContainers = document.querySelectorAll('#pa-list-container');
    if (!listContainers.length) return;

    const filtered = alerts.filter((a) => {
      if (currentFilter === 'pending') return a.status === 'pending';
      if (currentFilter === 'triggered') return a.status === 'triggered';
      return true;
    });

    listContainers.forEach((listContainer) => {
      if (!filtered.length) {
        listContainer.innerHTML = render.renderEmptyState?.(currentFilter) || '<div class="pa-empty"><p>No hay alertas.</p></div>';
        return;
      }
      listContainer.innerHTML = filtered.map((a) => render.renderAlertItemHtml?.(a) || '').join('');

      listContainer.querySelectorAll('.pa-delete-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.deleteId;
          if (!id) return;
          btn.disabled = true;
          try {
            const res = await fetch(`/api/price-alerts/${id}`, { method: 'DELETE' });
            if (res.ok) {
              alerts = alerts.filter((a) => String(a.id) !== String(id));
              updateCounts();
              renderAlertsList();
              window.showToast?.('Alerta eliminada');
            }
          } catch (err) {
            console.error('Error al borrar alerta:', err);
          }
        });
      });
    });
  }

  async function loadAlerts() {
    try {
      const res = await fetch('/api/price-alerts');
      const data = await res.json();
      if (res.ok && data.ok) {
        alerts = data.alerts || [];
        updateCounts();
        renderAlertsList();
      } else {
        if (res.status === 401) {
          document.querySelectorAll('#pa-list-container').forEach((c) => {
            c.innerHTML = '<div class="pa-empty"><p>Inicia sesión para gestionar alertas de precio.</p></div>';
          });
          return;
        }
        throw new Error(data.error || 'Error cargando alertas');
      }
    } catch (err) {
      document.querySelectorAll('#pa-list-container').forEach((c) => {
        c.innerHTML = `<div class="pa-error">Error al cargar alertas: ${err.message}</div>`;
      });
    }
  }

  function handleSearchInput(container, tickerInput, resultsBox) {
    const query = tickerInput.value.trim();
    const errEl = container.querySelector('#pa-form-error');
    if (errEl) errEl.hidden = true;

    if (selectedCompany && selectedCompany.ticker !== query.toUpperCase()) {
      selectedCompany = null;
      const refRow = container.querySelector('#pa-ref-row');
      if (refRow) refRow.hidden = true;
    }

    clearTimeout(searchDebounceTimer);
    if (!query || query.length < 1) {
      resultsBox.hidden = true;
      resultsBox.innerHTML = '';
      return;
    }

    searchDebounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/screener/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const payload = await res.json().catch(() => null);
        const matches = payload?.companies ?? [];

        if (!matches.length) {
          resultsBox.innerHTML = '<div class="pa-ticker-empty">No se encontraron empresas.</div>';
          resultsBox.hidden = false;
          return;
        }

        resultsBox.innerHTML = matches.slice(0, 8).map((company) => {
          const letter = (company.name || company.ticker || '?').slice(0, 1).toUpperCase();
          return `
            <button class="pa-ticker-option" type="button" data-ticker="${render.escapeHtml?.(company.ticker)}" data-name="${render.escapeHtml?.(company.name)}">
              <span class="pa-option-logo">${letter}</span>
              <span class="pa-option-name">${render.escapeHtml?.(company.name)}</span>
              <strong class="pa-option-ticker">${render.escapeHtml?.(company.ticker)}</strong>
            </button>
          `;
        }).join('');

        resultsBox.hidden = false;

        resultsBox.querySelectorAll('.pa-ticker-option').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const ticker = btn.dataset.ticker;
            const name = btn.dataset.name;
            tickerInput.value = `${ticker} · ${name}`;
            resultsBox.hidden = true;

            setReferenceCompany({ ticker, name }, null, container);
            const livePrice = await fetchLivePriceForTicker(ticker);
            if (livePrice) setReferenceCompany({ ticker, name }, livePrice, container);
          });
        });
      } catch {
        resultsBox.hidden = true;
      }
    }, 200);
  }

  function wireSectionEvents(container) {
    const form = container.querySelector('#pa-create-form');
    const tickerInput = container.querySelector('#pa-ticker');
    const resultsBox = container.querySelector('#pa-ticker-results');
    const tabs = container.querySelectorAll('.pa-tab');

    document.addEventListener('click', (e) => {
      if (resultsBox && !resultsBox.contains(e.target) && e.target !== tickerInput) {
        resultsBox.hidden = true;
      }
    });

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.pa-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter || 'all';
        renderAlertsList();
      });
    });

    tickerInput?.addEventListener('input', () => handleSearchInput(container, tickerInput, resultsBox));

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = container.querySelector('#pa-form-error');
      const submitBtn = container.querySelector('#pa-submit-btn');
      if (errEl) errEl.hidden = true;

      const condition = container.querySelector('#pa-condition')?.value;
      const targetPrice = parseFloat(container.querySelector('#pa-target-price')?.value);

      if (!selectedCompany) {
        if (errEl) { errEl.textContent = 'Debes elegir una acción.'; errEl.hidden = false; }
        tickerInput?.focus();
        return;
      }
      if (!targetPrice || targetPrice <= 0) {
        if (errEl) { errEl.textContent = 'Indica un precio objetivo válido.'; errEl.hidden = false; }
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando…';

      try {
        const res = await fetch('/api/price-alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker: selectedCompany.ticker,
            condition,
            targetPrice,
            companyName: selectedCompany.name || selectedCompany.ticker,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo crear la alerta');

        form.reset();
        selectedCompany = null;
        container.querySelector('#pa-ref-row').hidden = true;
        await loadAlerts();
        window.showToast?.('Alerta de precio creada');
      } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.hidden = false; }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crear alerta';
      }
    });
  }

  function mountSection(container, options = {}) {
    if (!container) return;
    mountedContainers.push(container);
    container.innerHTML = render.renderSectionHtml?.(options.initialCompany) || '';
    wireSectionEvents(container);
    if (options.initialCompany?.ticker) {
      setReferenceCompany(options.initialCompany, options.initialCompany.price, container);
    }
    loadAlerts();
  }

  return { mountSection, loadAlerts };
})();

window.PriceAlerts = PriceAlerts;
