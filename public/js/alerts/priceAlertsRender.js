/**
 * @fileoverview Plantillas de renderizado HTML para el módulo de Alertas de Precio de Cifra.
 */

(function () {
  'use strict';

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function renderAlertItemHtml(a) {
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
  }

  function renderEmptyState(filter) {
    const msgs = {
      all: 'No tienes ninguna alerta de precio configurada.',
      pending: 'No tienes alertas pendientes.',
      triggered: 'Aún no se ha cumplido ninguna alerta.',
    };
    return `
      <div class="pa-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:#94a3b8;margin-bottom:8px"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        <p>${msgs[filter] || msgs.all}</p>
      </div>
    `;
  }

  window.PriceAlertsRender = {
    escapeHtml,
    renderFormHtml,
    renderSectionHtml,
    renderAlertItemHtml,
    renderEmptyState,
  };
})();
