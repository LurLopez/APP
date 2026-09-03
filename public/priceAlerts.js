/**
 * Módulo de Alertas de Precio para Cifra Terminal
 */
const PriceAlerts = (() => {
  let alerts = [];
  let currentFilter = 'all'; // 'all' | 'pending' | 'triggered'
  let searchDebounceTimer = null;
  let selectedCompany = null; // { ticker, name, price }
  let mountedContainers = [];

  async function fetchLivePriceForTicker(ticker) {
    try {
      const res = await fetch(`/api/screener/company/${encodeURIComponent(ticker)}`);
      if (res.ok) {
        const data = await res.json();
        return data?.profile?.market?.price ?? data?.profile?.price ?? null;
      }
    } catch {
      // Ignorar error
    }
    return null;
  }

  function renderFormHtml(initialCompany = null) {
    const hasInitial = Boolean(initialCompany?.ticker);
    const tickerVal = hasInitial ? `${initialCompany.ticker} · ${initialCompany.name || initialCompany.ticker}` : '';
    const initialPrice = initialCompany?.price ? Number(initialCompany.price).toFixed(2) : '';

    return `
      <form class="pa-form" id="pa-create-form">
        <div class="pa-form-grid">
          <div class="pa-field pa-ticker-field">
            <label for="pa-ticker">Buscar Acción / Empresa</label>
            <div class="pa-ticker-wrap">
              <input id="pa-ticker" type="text" value="${escapeHtml(tickerVal)}" placeholder="Escribe para buscar (ej: Apple, KO...)" maxlength="40" required autocomplete="off">
              <div class="pa-ticker-results" id="pa-ticker-results" hidden></div>
            </div>
          </div>
          <div class="pa-field">
            <label for="pa-condition">Condición</label>
            <select id="pa-condition" required>
              <option value="gte">≥ Igual o superior a ($)</option>
              <option value="lte">≤ Igual o inferior a ($)</option>
            </select>
          </div>
          <div class="pa-field">
            <label for="pa-target-price">Precio objetivo ($)</label>
            <input id="pa-target-price" type="number" step="0.01" min="0.01" placeholder="${initialPrice || '0.00'}" required>
          </div>
        </div>
        <div class="pa-ref-row" id="pa-ref-row" ${hasInitial ? '' : 'hidden'}>
          <span class="pa-ref-label">Acción seleccionada:</span>
          <strong class="pa-ref-ticker" id="pa-ref-ticker">${escapeHtml(initialCompany?.ticker || '—')}</strong>
          <span class="pa-ref-company" id="pa-ref-company">${initialCompany?.name ? `(${escapeHtml(initialCompany.name)})` : ''}</span>
          <span class="pa-ref-divider">|</span>
          <span class="pa-ref-label">Precio actual:</span>
          <strong class="pa-ref-price" id="pa-ref-price">${initialCompany?.price ? `$${Number(initialCompany.price).toFixed(2)}` : '—'}</strong>
        </div>
        <div class="pa-form-actions">
          <p class="pa-form-error" id="pa-form-error" hidden></p>
          <button class="primary-button pa-submit-btn" id="pa-submit-btn" type="submit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><path d="M12 5v14M5 12h14"/></svg>
            Crear alerta
          </button>
        </div>
      </form>
    `;
  }

  function renderSectionHtml(initialCompany = null) {
    return `
      <div class="pa-dashboard-view">
        ${renderFormHtml(initialCompany)}

        <div class="pa-list-section">
          <div class="pa-list-head">
            <h4 class="pa-list-title">Tus alertas</h4>
            <div class="pa-tabs" id="pa-filter-tabs">
              <button type="button" class="pa-tab active" data-filter="all">Todas (<span class="pa-count-all">0</span>)</button>
              <button type="button" class="pa-tab" data-filter="pending">⏳ Pendientes (<span class="pa-count-pending">0</span>)</button>
              <button type="button" class="pa-tab" data-filter="triggered">✅ Cumplidas (<span class="pa-count-triggered">0</span>)</button>
            </div>
          </div>

          <div class="pa-list" id="pa-list-container">
            <div class="pa-loading"><span class="loading-spinner"></span> Cargando alertas…</div>
          </div>
        </div>
      </div>
    `;
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

  function wireSectionEvents(container) {
    const form = container.querySelector('#pa-create-form');
    const tickerInput = container.querySelector('#pa-ticker');
    const resultsBox = container.querySelector('#pa-ticker-results');
    const tabs = container.querySelectorAll('.pa-tab');

    // Cerrar desplegable al hacer clic fuera
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

    // Búsqueda autocompletada con selector de empresa
    tickerInput?.addEventListener('input', () => {
      const query = tickerInput.value.trim();
      const errEl = container.querySelector('#pa-form-error');
      if (errEl) errEl.hidden = true;

      // Si el usuario edita el texto, invalidar la selección previa
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
            resultsBox.innerHTML = '<div class="pa-ticker-empty">No se encontraron empresas en EDGAR.</div>';
            resultsBox.hidden = false;
            return;
          }

          resultsBox.innerHTML = matches.slice(0, 8).map((company) => {
            const letter = (company.name || company.ticker || '?').slice(0, 1).toUpperCase();
            return `
              <button class="pa-ticker-option" type="button" data-ticker="${escapeHtml(company.ticker)}" data-name="${escapeHtml(company.name)}">
                <span class="pa-option-logo">${letter}</span>
                <span class="pa-option-name">${escapeHtml(company.name)}</span>
                <strong class="pa-option-ticker">${escapeHtml(company.ticker)}</strong>
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
              if (livePrice) {
                setReferenceCompany({ ticker, name }, livePrice, container);
              }
            });
          });
        } catch {
          resultsBox.hidden = true;
        }
      }, 200);
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = container.querySelector('#pa-form-error');
      const submitBtn = container.querySelector('#pa-submit-btn');
      if (errEl) errEl.hidden = true;

      const condition = container.querySelector('#pa-condition')?.value;
      const targetPrice = parseFloat(container.querySelector('#pa-target-price')?.value);

      if (!selectedCompany) {
        if (errEl) {
          errEl.textContent = 'Debes elegir una acción de la lista desplegable.';
          errEl.hidden = false;
        }
        tickerInput?.focus();
        return;
      }

      if (!targetPrice || targetPrice <= 0) {
        if (errEl) {
          errEl.textContent = 'Indica un precio objetivo válido.';
          errEl.hidden = false;
        }
        return;
      }

      const tickerToUse = selectedCompany.ticker;
      const companyNameToUse = selectedCompany.name;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando…';

      try {
        const res = await fetch('/api/price-alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker: tickerToUse,
            condition,
            targetPrice,
            companyName: companyNameToUse || tickerToUse,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'No se pudo crear la alerta');
        }

        form.reset();
        selectedCompany = null;
        container.querySelector('#pa-ref-row').hidden = true;
        await loadAlerts();
        showToast?.(`Alerta de precio creada para ${tickerToUse}`);
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><path d="M12 5v14M5 12h14"/></svg>
          Crear alerta
        `;
      }
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
            c.innerHTML = `
              <div class="pa-empty">
                <p>Inicia sesión para gestionar y recibir alertas de precio por correo.</p>
              </div>
            `;
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
        const msgs = {
          all: 'No tienes ninguna alerta de precio configurada.',
          pending: 'No tienes alertas pendientes.',
          triggered: 'Aún no se ha cumplido ninguna alerta.',
        };
        listContainer.innerHTML = `
          <div class="pa-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:#94a3b8;margin-bottom:8px"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            <p>${msgs[currentFilter] || msgs.all}</p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = filtered
        .map((a) => {
          const isPending = a.status === 'pending';
          const isGte = a.condition === 'gte';
          const condSymbol = isGte ? '≥' : '≤';
          const targetPriceFormatted = `$${Number(a.targetPrice).toFixed(2)}`;
          const currentPriceFormatted = a.currentPrice !== null && a.currentPrice !== undefined
            ? `$${Number(a.currentPrice).toFixed(2)}`
            : '—';

          let diffHtml = '';
          if (isPending && a.currentPrice && a.targetPrice) {
            const diffPct = ((a.targetPrice - a.currentPrice) / a.currentPrice) * 100;
            const diffText = diffPct > 0 ? `+${diffPct.toFixed(1)}% restando` : `${diffPct.toFixed(1)}% restando`;
            diffHtml = `<span class="pa-item-diff">${diffText}</span>`;
          }

          const dateStr = a.triggeredAt
            ? new Date(a.triggeredAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
            : new Date(a.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

          const statusBadge = isPending
            ? `<span class="pa-status-badge pending">⏳ Pendiente</span>`
            : `<span class="pa-status-badge triggered" title="Alcanzado a $${Number(a.triggeredPrice || a.targetPrice).toFixed(2)} el ${dateStr}">✅ Cumplida ($${Number(a.triggeredPrice || a.targetPrice).toFixed(2)} · ${dateStr})</span>`;

          return `
            <div class="pa-item ${isPending ? 'pending' : 'triggered'}" data-id="${a.id}">
              <div class="pa-item-main">
                <div class="pa-item-ticker-wrap">
                  <a href="/empresa/${encodeURIComponent(a.ticker)}" class="pa-item-ticker" title="Ver ficha">${a.ticker}</a>
                  <span class="pa-item-company">${escapeHtml(a.companyName || a.ticker)}</span>
                </div>
                <div class="pa-item-cond">
                  <span class="pa-cond-pill ${a.condition}">
                    <strong>${condSymbol} ${targetPriceFormatted}</strong>
                  </span>
                  <div class="pa-current-wrap">
                    <small>Actual: <strong>${currentPriceFormatted}</strong></small>
                    ${diffHtml}
                  </div>
                </div>
              </div>

              <div class="pa-item-aside">
                ${statusBadge}
                <button class="pa-delete-btn" type="button" data-delete-id="${a.id}" aria-label="Eliminar alerta" title="Eliminar alerta">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
                </button>
              </div>
            </div>
          `;
        })
        .join('');

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
              showToast?.('Alerta eliminada');
            }
          } catch (err) {
            console.error('Error al borrar alerta:', err);
          }
        });
      });
    });
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Monta la sección completa de Alertas de Precio dentro de un contenedor en la página.
   */
  function mountSection(container, options = {}) {
    if (!container) return;
    mountedContainers.push(container);
    container.innerHTML = renderSectionHtml(options.initialCompany);
    wireSectionEvents(container);

    if (options.initialCompany?.ticker) {
      setReferenceCompany(options.initialCompany, options.initialCompany.price, container);
    }

    loadAlerts();
  }

  return {
    mountSection,
    loadAlerts,
  };
})();

window.PriceAlerts = PriceAlerts;
