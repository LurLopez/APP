/**
 * @fileoverview Plantillas de renderizado HTML para el módulo de Alertas de Precio de Cifra.
 */

(function () {
  'use strict';

  function escapeHtml(value) {
    return window.HtmlUtils.escapeHtml(value);
  }

  function t(text, params) {
    return window.I18n?.t ? window.I18n.t(text, params) : text;
  }

  function renderFormHtml(initialCompany = null) {
    const hasInitial = Boolean(initialCompany?.ticker);
    const tickerVal = hasInitial ? `${initialCompany.ticker} · ${initialCompany.name || initialCompany.ticker}` : '';
    const initialPrice = initialCompany?.price ? Number(initialCompany.price).toFixed(2) : '';

    return `
      <form class="pa-form" id="pa-create-form">
        <div class="pa-form-grid">
          <div class="pa-field pa-ticker-field">
            <label for="pa-ticker">${t('Buscar Acción / Empresa')}</label>
            <div class="pa-ticker-wrap">
              <input id="pa-ticker" type="text" value="${escapeHtml(tickerVal)}" placeholder="${t('Escribe para buscar (ej: Apple, KO...)')}" maxlength="40" required autocomplete="off">
              <div class="pa-ticker-results" id="pa-ticker-results" hidden></div>
            </div>
          </div>
          <div class="pa-field">
            <label for="pa-condition">${t('Condición')}</label>
            <select id="pa-condition" required>
              <option value="gte">${t('≥ Igual o superior a ($)')}</option>
              <option value="lte">${t('≤ Igual o inferior a ($)')}</option>
            </select>
          </div>
          <div class="pa-field">
            <label for="pa-target-price">${t('Precio objetivo ($)')}</label>
            <input id="pa-target-price" type="number" step="0.01" min="0.01" placeholder="${initialPrice || '0.00'}" required>
          </div>
        </div>
        <div class="pa-ref-row" id="pa-ref-row" ${hasInitial ? '' : 'hidden'}>
          <span class="pa-ref-label">${t('Acción seleccionada:')}</span>
          <strong class="pa-ref-ticker" id="pa-ref-ticker">${escapeHtml(initialCompany?.ticker || '—')}</strong>
          <span class="pa-ref-company" id="pa-ref-company">${initialCompany?.name ? `(${escapeHtml(initialCompany.name)})` : ''}</span>
          <span class="pa-ref-divider">|</span>
          <span class="pa-ref-label">${t('Precio actual:')}</span>
          <strong class="pa-ref-price" id="pa-ref-price">${initialCompany?.price ? `$${Number(initialCompany.price).toFixed(2)}` : t('Consultando…')}</strong>
        </div>
        <div class="pa-form-actions">
          <p class="pa-form-error" id="pa-form-error" hidden></p>
          <button class="primary-button pa-submit-btn" id="pa-submit-btn" type="submit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><path d="M12 5v14M5 12h14"/></svg>
            ${t('Crear alerta')}
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
            <h4 class="pa-list-title">${t('Tus alertas')}</h4>
            <div class="pa-tabs" id="pa-filter-tabs">
              <button type="button" class="pa-tab active" data-filter="all">${t('Todas')} (<span class="pa-count-all">0</span>)</button>
              <button type="button" class="pa-tab" data-filter="pending">⏳ ${t('Pendientes')} (<span class="pa-count-pending">0</span>)</button>
              <button type="button" class="pa-tab" data-filter="triggered">✅ ${t('Cumplidas')} (<span class="pa-count-triggered">0</span>)</button>
            </div>
          </div>
          <div class="pa-list" id="pa-list-container">
            <div class="pa-loading"><span class="loading-spinner"></span> ${t('Cargando alertas…')}</div>
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
      const diffText = diffPct > 0 ? t('+{0}% restando', { 0: diffPct.toFixed(1) }) : t('{0}% restando', { 0: diffPct.toFixed(1) });
      diffHtml = `<span class="pa-item-diff">${diffText}</span>`;
    }

    const currentLang = window.I18n?.getLanguage ? window.I18n.getLanguage() : 'es';
    const dateLocale = currentLang === 'en' ? 'en-US' : 'es-ES';
    const dateStr = a.triggeredAt
      ? new Date(a.triggeredAt).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' })
      : new Date(a.createdAt).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' });

    const statusBadge = isPending
      ? `<span class="pa-status-badge pending">⏳ ${t('Pendiente')}</span>`
      : `<span class="pa-status-badge triggered" title="${t('Alcanzado a {0} el {1}', { 0: '$' + Number(a.triggeredPrice || a.targetPrice).toFixed(2), 1: dateStr })}">✅ ${t('Cumplida')} ($${Number(a.triggeredPrice || a.targetPrice).toFixed(2)} · ${dateStr})</span>`;

    return `
      <div class="pa-item ${isPending ? 'pending' : 'triggered'}" data-id="${a.id}">
        <div class="pa-item-main">
          <div class="pa-item-ticker-wrap">
            <a href="/empresa/${encodeURIComponent(a.ticker)}" class="pa-item-ticker" title="${t('Ver ficha')}">${a.ticker}</a>
            <span class="pa-item-company">${escapeHtml(a.companyName || a.ticker)}</span>
          </div>
          <div class="pa-item-cond">
            <span class="pa-cond-pill ${a.condition}">
              <strong>${condSymbol} ${targetPriceFormatted}</strong>
            </span>
            <div class="pa-current-wrap">
              <small>${t('Actual:')} <strong>${currentPriceFormatted}</strong></small>
              ${diffHtml}
            </div>
          </div>
        </div>

        <div class="pa-item-aside">
          ${statusBadge}
          <button class="pa-delete-btn" type="button" data-delete-id="${a.id}" aria-label="${t('Eliminar alerta')}" title="${t('Eliminar alerta')}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  function renderEmptyState(filter) {
    const msgs = {
      all: t('No tienes ninguna alerta de precio configurada.'),
      pending: t('No tienes alertas pendientes.'),
      triggered: t('Aún no se ha cumplido ninguna alerta.'),
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
