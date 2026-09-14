/**
 * @fileoverview Funciones de formateo numérico y generación de plantillas HTML para listas de seguimiento.
 * @module WatchlistsRender
 */

(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function watchNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatWatchNumber(value, digits = 2) {
    const number = watchNumber(value);
    if (number === null) return '—';
    return new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(number);
  }

  function formatWatchSigned(value) {
    const number = watchNumber(value);
    if (number === null) return '—';
    const sign = number > 0 ? '+' : number < 0 ? '−' : '';
    return `${sign}${formatWatchNumber(Math.abs(number))}`;
  }

  function formatWatchPercent(value) {
    const number = watchNumber(value);
    if (number === null) return '—';
    return `${formatWatchSigned(number)} %`;
  }

  function formatWatchVolume(value) {
    const number = watchNumber(value);
    if (number === null) return '—';
    const absolute = Math.abs(number);
    const [unit, suffix] = absolute >= 1e9 ? [1e9, 'B']
      : absolute >= 1e6 ? [1e6, 'M']
        : absolute >= 1e3 ? [1e3, 'K']
          : [1, ''];
    return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(number / unit)}${suffix}`;
  }

  function formatWatchTime(timestamp) {
    const number = watchNumber(timestamp);
    if (number === null || number <= 0) return '—';
    return new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(number * 1000));
  }

  function watchChangeClass(value) {
    const number = watchNumber(value);
    return number === null ? '' : number >= 0 ? 'positive' : 'negative';
  }

  /**
   * Genera el HTML de la tabla de cotizaciones de una lista.
   * @param {Object} watchlist
   * @returns {string}
   */
  function renderWatchTable(watchlist) {
    const items = Array.isArray(watchlist?.items) ? watchlist.items : [];
    return `
      <table class="favorites-market-table">
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Símbolo</th>
            <th scope="col">Último</th>
            <th scope="col">Apertura</th>
            <th scope="col">Máximo</th>
            <th scope="col">Mínimo</th>
            <th scope="col">Var.</th>
            <th scope="col">% var.</th>
            <th scope="col">Vol.</th>
            <th scope="col">Fecha/Hora</th>
            <th scope="col" aria-label="Acciones"></th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const ticker = String(item.ticker ?? '').toUpperCase();
            const name = String(item.companyName || ticker);
            const quote = item.quote ?? {};
            const changeClass = watchChangeClass(quote.change);
            const time = formatWatchTime(quote.marketTimestamp);
            const statusClass = quote.marketState === 'REGULAR' ? 'open'
              : quote.marketState ? 'closed' : 'unknown';
            return `
              <tr data-ticker="${escapeHtml(ticker)}" tabindex="0">
                <td class="favorite-name-cell">
                  <span class="favorite-flag" aria-hidden="true">🇺🇸</span>
                  <a class="favorite-company-link" href="/empresa/${encodeURIComponent(ticker)}">${escapeHtml(name)}</a>
                </td>
                <td><a class="favorite-symbol-link" href="/empresa/${encodeURIComponent(ticker)}">${escapeHtml(ticker)}</a></td>
                <td class="favorite-last ${changeClass}">${formatWatchNumber(quote.price)}</td>
                <td>${formatWatchNumber(quote.open)}</td>
                <td>${formatWatchNumber(quote.dayHigh)}</td>
                <td>${formatWatchNumber(quote.dayLow)}</td>
                <td class="${changeClass}">${formatWatchSigned(quote.change)}</td>
                <td class="${changeClass}">${formatWatchPercent(quote.changePercent)}</td>
                <td>${formatWatchVolume(quote.volume)}</td>
                <td><span class="favorite-time"><i class="favorite-market-dot ${statusClass}"></i>${time}</span></td>
                <td>
                  <button class="favorite-table-fav active" type="button" data-ticker="${escapeHtml(ticker)}" aria-label="Quitar ${escapeHtml(name)} de la lista" title="Quitar de la lista">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  /**
   * Genera el contenido HTML del popover flotante de gestión de seguimiento.
   */
  function renderPopoverHtml({ ticker, companyName, lists, inListIds, isHeld, inCal, alertSettings, confirmListId }) {
    const rows = lists.map((list) => {
      const checked = inListIds.has(list.id);
      const deleteButton = list.isDefault ? '' : `
        <button class="watch-popover-delete ${confirmListId === list.id ? 'armed' : ''}" type="button" data-delete-list="${list.id}" aria-label="Eliminar lista ${escapeHtml(list.name)}">
          ${confirmListId === list.id ? '¿Eliminar?' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 4h4M9 7v13h6V7M10 11v5M14 11v5"/></svg>'}
        </button>`;
      return `
        <div class="watch-popover-row ${checked ? 'checked' : ''}" data-list-id="${list.id}" role="button" tabindex="0" aria-pressed="${checked}">
          <span class="watch-popover-check" aria-hidden="true">${checked ? '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>' : ''}</span>
          <span class="watch-popover-name">${escapeHtml(list.name)}</span>
          <span class="watch-popover-count">${list.count} ${list.count === 1 ? 'acción' : 'acciones'}</span>
          ${deleteButton}
        </div>`;
    }).join('');

    return `
      <div class="watch-popover-head">
        <div>
          <strong>Listas y Notificaciones</strong>
          <span class="watch-popover-sub">${escapeHtml(ticker)}${companyName ? ` · ${escapeHtml(companyName)}` : ''}</span>
        </div>
        <button class="watch-popover-close" type="button" aria-label="Cerrar">×</button>
      </div>
      <div class="watch-popover-list">
        ${lists.length ? rows : '<div class="watch-popover-empty">Aún no tienes listas. Crea la primera abajo.</div>'}
      </div>
      <div class="watch-popover-calendar-section">
        <div class="watch-popover-calendar-row ${inCal ? 'checked' : ''} ${isHeld ? 'locked' : ''}" data-action="toggle-calendar" role="button" tabindex="0" aria-pressed="${inCal}" ${isHeld ? 'aria-disabled="true" title="Esta empresa está en tu cartera y siempre aparece en el calendario"' : ''}>
          <span class="watch-popover-check" aria-hidden="true">${inCal ? '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>' : ''}</span>
          <div class="watch-popover-calendar-copy">
            <span class="watch-popover-calendar-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
              ${isHeld ? 'Incluido en calendario' : 'Añadir a calendario'}
              ${isHeld ? '<span class="watch-popover-cal-badge-held">💼 En Cartera</span>' : ''}
            </span>
            <small class="watch-popover-calendar-desc">${isHeld ? 'Activo automáticamente por estar en tu cartera' : 'Resultados trimestrales y dividendos'}</small>
          </div>
          ${isHeld ? '<span class="watch-popover-lock-icon" title="Bloqueado: Incluido por cartera">🔒</span>' : ''}
        </div>
      </div>
      <div class="watch-popover-email-section">
        <div class="watch-popover-email-main ${alertSettings.enabled ? 'checked' : ''}" data-action="toggle-email-main" role="button" tabindex="0" aria-pressed="${alertSettings.enabled}">
          <span class="watch-popover-check" aria-hidden="true">${alertSettings.enabled ? '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>' : ''}</span>
          <div class="watch-popover-calendar-copy">
            <span class="watch-popover-calendar-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              Avisos al email
            </span>
            <small class="watch-popover-calendar-desc">Notificaciones automáticas a tu correo</small>
          </div>
        </div>
        <div class="watch-popover-email-subs ${alertSettings.enabled ? 'expanded' : 'collapsed'}">
          <div class="watch-popover-sub-item ${alertSettings.notifyEarnings ? 'checked' : ''}" data-action="toggle-sub-earnings" role="checkbox" aria-checked="${alertSettings.notifyEarnings}" tabindex="0">
            <span class="watch-popover-sub-check" aria-hidden="true">${alertSettings.notifyEarnings ? '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>' : ''}</span>
            <span class="watch-popover-sub-label">📊 Resultados 10-Q / 10-K</span>
          </div>
          <div class="watch-popover-sub-item ${alertSettings.notifyExdiv ? 'checked' : ''}" data-action="toggle-sub-exdiv" role="checkbox" aria-checked="${alertSettings.notifyExdiv}" tabindex="0">
            <span class="watch-popover-sub-check" aria-hidden="true">${alertSettings.notifyExdiv ? '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>' : ''}</span>
            <span class="watch-popover-sub-label">⏳ Fecha Ex-Dividend (Corte)</span>
          </div>
          <div class="watch-popover-sub-item ${alertSettings.notifyPayout ? 'checked' : ''}" data-action="toggle-sub-payout" role="checkbox" aria-checked="${alertSettings.notifyPayout}" tabindex="0">
            <span class="watch-popover-sub-check" aria-hidden="true">${alertSettings.notifyPayout ? '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>' : ''}</span>
            <span class="watch-popover-sub-label">💰 Pago de Dividendos</span>
          </div>
        </div>
      </div>
      <form class="watch-popover-create" novalidate>
        <input class="watch-popover-create-input" type="text" maxlength="40" placeholder="Nueva lista..." aria-label="Nombre de la nueva lista">
        <button class="watch-popover-create-btn" type="submit" disabled>Crear</button>
      </form>
    `;
  }

  window.WatchlistsRender = {
    escapeHtml,
    renderWatchTable,
    renderPopoverHtml,
  };
})();
