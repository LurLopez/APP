/**
 * @fileoverview Orquestador del estado compartido de Listas de Seguimiento y Notificaciones.
 * Gestiona la sincronización de listas con el servidor y la sección de favoritos en el dashboard.
 * @module Watchlists
 */

const Watchlists = (() => {
  let userLogged = Boolean(window.AuthModule?.getUser?.() || window.currentUser);
  let lists = [];
  let byId = new Map();
  let membership = new Map();
  let calendarTickers = new Set();
  let emailAlerts = new Map();
  let sectionRoot = null;
  let sectionOptions = {};
  let selectedListId = null;
  let sectionConfirmListId = null;
  let sectionConfirmTimer = null;
  let sectionCreating = false;
  let creating = false;
  const emailAlertDebounceMap = new Map();

  function emitChange() {
    window.dispatchEvent(new CustomEvent('watchlists:change'));
  }

  function rebuildState(data) {
    lists = Array.isArray(data?.watchlists) ? data.watchlists : [];
    byId = new Map(lists.map((list) => [list.id, list]));
    membership = new Map();
    lists.forEach((list) => {
      (list.tickers ?? []).forEach((item) => {
        const ticker = String(item.ticker ?? '').toUpperCase();
        if (!membership.has(ticker)) membership.set(ticker, new Set());
        membership.get(ticker).add(list.id);
      });
    });
    calendarTickers = new Set((data?.calendarTickers ?? []).map((t) => String(t).toUpperCase()));
    emailAlerts = new Map();
    if (data?.emailAlerts && typeof data.emailAlerts === 'object') {
      Object.entries(data.emailAlerts).forEach(([t, alert]) => {
        emailAlerts.set(t.toUpperCase(), {
          enabled: Boolean(alert.enabled),
          notifyEarnings: Boolean(alert.notifyEarnings),
          notifyExdiv: Boolean(alert.notifyExdiv),
          notifyPayout: Boolean(alert.notifyPayout),
        });
      });
    }
  }

  async function api(path, options) {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Error del servidor.');
    return data;
  }

  function reset() {
    lists = [];
    byId = new Map();
    membership = new Map();
    calendarTickers = new Set();
    emailAlerts = new Map();
    window.WatchlistsPopover.close();
    emitChange();
  }

  async function refresh() {
    if (!userLogged) return reset();
    try {
      const response = await fetch('/api/watchlists');
      if (!response.ok) throw new Error('No se pudieron cargar las listas.');
      const data = await response.json().catch(() => null);
      rebuildState(data);
      emitChange();
      if (window.WatchlistsPopover.isOpen()) window.WatchlistsPopover.renderPopover();
    } catch {
      reset();
    }
  }

  function setAuthenticated(value) {
    userLogged = Boolean(value);
    if (!userLogged) reset();
    else refresh();
  }

  function isInAnyList(ticker) {
    const ids = membership.get(String(ticker ?? '').toUpperCase());
    return Boolean(ids && ids.size);
  }

  function listsContaining(ticker) {
    return membership.get(String(ticker ?? '').toUpperCase()) ?? new Set();
  }

  function isInCalendar(ticker) {
    return calendarTickers.has(String(ticker ?? '').toUpperCase());
  }

  function getEmailAlert(ticker) {
    const t = String(ticker ?? '').toUpperCase();
    return emailAlerts.get(t) || {
      enabled: false,
      notifyEarnings: true,
      notifyExdiv: true,
      notifyPayout: true,
    };
  }

  function getList(listId) {
    return byId.get(Number(listId));
  }

  function defaultList() {
    return lists.find((list) => list.isDefault) ?? null;
  }

  function listItems(listId) {
    const list = getList(listId);
    if (!list) return new Set();
    return new Set(list.tickers.map((item) => String(item.ticker).toUpperCase()));
  }

  async function toggleCalendar(ticker, companyName) {
    if (!userLogged) {
      window.showToast?.('Inicia sesión para gestionar el calendario.');
      return window.openModal?.('login');
    }
    ticker = String(ticker).toUpperCase();
    if (typeof Portfolio !== 'undefined' && Portfolio.hasPosition?.(ticker)) {
      return window.showToast?.(`${ticker} está en tu cartera y siempre aparece en el calendario.`);
    }
    const adding = !calendarTickers.has(ticker);
    if (adding) calendarTickers.add(ticker);
    else calendarTickers.delete(ticker);

    emitChange();
    if (window.WatchlistsPopover.isOpen()) window.WatchlistsPopover.renderPopover();
    window.dispatchEvent(new CustomEvent('portfolio:change'));

    try {
      if (adding) {
        await api('/api/watchlists/calendar/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, companyName }),
        });
        window.showToast?.(`${ticker} añadida al calendario.`);
      } else {
        await api(`/api/watchlists/calendar/items/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
        window.showToast?.(`${ticker} quitada del calendario.`);
      }
      await refresh();
      window.dispatchEvent(new CustomEvent('portfolio:change'));
    } catch (error) {
      await refresh();
      window.showToast?.(error.message);
    }
  }

  function saveEmailAlert(ticker, companyName, newAlert) {
    if (!userLogged) {
      window.showToast?.('Inicia sesión para configurar alertas por email.');
      return window.openModal?.('login');
    }
    const t = String(ticker).toUpperCase();
    emailAlerts.set(t, newAlert);
    emitChange();
    if (window.WatchlistsPopover.isOpen()) window.WatchlistsPopover.renderPopover();

    if (emailAlertDebounceMap.has(t)) clearTimeout(emailAlertDebounceMap.get(t));
    const timer = setTimeout(async () => {
      emailAlertDebounceMap.delete(t);
      try {
        await api('/api/watchlists/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker: t,
            companyName,
            enabled: newAlert.enabled,
            notifyEarnings: newAlert.notifyEarnings,
            notifyExdiv: newAlert.notifyExdiv,
            notifyPayout: newAlert.notifyPayout,
          }),
        });
      } catch (error) {
        console.error('Error al guardar alertas:', error);
      }
    }, 250);
    emailAlertDebounceMap.set(t, timer);
  }

  async function toggleEmailMain(ticker, companyName) {
    const current = getEmailAlert(ticker);
    const newEnabled = !current.enabled;
    const allSubsOff = !current.notifyEarnings && !current.notifyExdiv && !current.notifyPayout;
    saveEmailAlert(ticker, companyName, {
      enabled: newEnabled,
      notifyEarnings: newEnabled ? (allSubsOff ? true : current.notifyEarnings) : current.notifyEarnings,
      notifyExdiv: newEnabled ? (allSubsOff ? true : current.notifyExdiv) : current.notifyExdiv,
      notifyPayout: newEnabled ? (allSubsOff ? true : current.notifyPayout) : current.notifyPayout,
    });
  }

  async function toggleEmailSub(ticker, companyName, subType) {
    const current = getEmailAlert(ticker);
    const newAlert = { ...current };
    if (subType === 'earnings') newAlert.notifyEarnings = !newAlert.notifyEarnings;
    if (subType === 'exdiv') newAlert.notifyExdiv = !newAlert.notifyExdiv;
    if (subType === 'payout') newAlert.notifyPayout = !newAlert.notifyPayout;
    newAlert.enabled = Boolean(newAlert.notifyEarnings || newAlert.notifyExdiv || newAlert.notifyPayout);
    saveEmailAlert(ticker, companyName, newAlert);
  }

  async function toggle(listId, ticker, companyName) {
    if (!userLogged) {
      window.showToast?.('Inicia sesión para guardar acciones en listas de seguimiento.');
      return window.openModal?.('login');
    }
    ticker = String(ticker).toUpperCase();
    listId = Number(listId);
    const ids = listsContaining(ticker);
    const adding = !ids.has(listId);

    if (adding) {
      ids.add(listId);
      if (!calendarTickers.has(ticker)) calendarTickers.add(ticker);
      if (!emailAlerts.has(ticker)) {
        emailAlerts.set(ticker, { enabled: true, notifyEarnings: true, notifyExdiv: true, notifyPayout: true });
      }
    } else {
      ids.delete(listId);
    }
    emitChange();
    if (window.WatchlistsPopover.isOpen()) window.WatchlistsPopover.renderPopover();

    try {
      if (adding) {
        await api(`/api/watchlists/${listId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, companyName }),
        });
      } else {
        await api(`/api/watchlists/${listId}/items/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
      }
      await refresh();
      window.dispatchEvent(new CustomEvent('portfolio:change'));
    } catch (error) {
      await refresh();
      window.showToast?.(error.message);
    }
  }

  async function handleCreate(input) {
    const name = input.value.trim();
    if (!name || creating) return;
    creating = true;
    input.disabled = true;
    try {
      await api('/api/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      window.showToast?.(`Lista "${name}" creada.`);
      await refresh();
      const newInput = document.querySelector('.watch-popover-create-input');
      if (newInput) {
        newInput.value = '';
        newInput.disabled = false;
        newInput.focus();
      }
    } catch (error) {
      window.showToast?.(error.message);
      input.disabled = false;
      input.focus();
    } finally {
      creating = false;
    }
  }

  async function doDelete(listId) {
    const list = getList(listId);
    try {
      await api(`/api/watchlists/${listId}`, { method: 'DELETE' });
      window.showToast?.(`Lista "${list?.name ?? ''}" eliminada.`);
      await refresh();
    } catch (error) {
      window.showToast?.(error.message);
    }
  }

  function distinctTickerCount() {
    const tickers = new Set();
    lists.forEach((list) => (list.tickers ?? []).forEach((item) => tickers.add(String(item.ticker).toUpperCase())));
    return tickers.size;
  }

  async function renderSection() {
    if (!sectionRoot) return;
    const { countEl } = sectionOptions;

    if (!userLogged) {
      if (window.AuthModule && !window.AuthModule.isReady()) {
        sectionRoot.innerHTML = '<div class="watch-section-empty">Cargando tus listas de seguimiento…</div>';
        sectionOptions.onEmptyChange?.(false);
        if (countEl) countEl.textContent = '…';
        return;
      }
      sectionRoot.innerHTML = '<div class="watch-section-empty">Inicia sesión para guardar y ver tus listas de seguimiento.</div>';
      sectionOptions.onEmptyChange?.(false);
      if (countEl) countEl.textContent = 'Inicia sesión';
      return;
    }

    if (!lists.length) {
      sectionRoot.innerHTML = `
        <div class="watch-section-toolbar">
          <form class="watch-section-create" novalidate>
            <input class="watch-section-create-input" type="text" maxlength="40" placeholder="Nueva lista..." aria-label="Nombre de la nueva lista">
            <button class="watch-section-create-btn" type="submit" disabled>Crear lista</button>
          </form>
        </div>
        <div class="watch-section-empty">Aún no tienes listas. Crea la primera abajo.</div>
      `;
      wireSectionCreate(sectionRoot.querySelector('.watch-section-create'));
      sectionOptions.onEmptyChange?.(false);
      if (countEl) countEl.textContent = '—';
      return;
    }

    if (!getList(selectedListId)) selectedListId = defaultList().id;

    const esc = window.WatchlistsRender.escapeHtml;
    const chips = lists.map((list) => {
      const active = list.id === selectedListId ? ' active' : '';
      const deleteBtn = list.isDefault ? '' : `
        <span class="watch-section-chip-delete ${sectionConfirmListId === list.id ? 'armed' : ''}" role="button" tabindex="0" data-delete="${list.id}" aria-label="Eliminar lista ${esc(list.name)}">
          ${sectionConfirmListId === list.id ? '¿Eliminar?' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 4h4M9 7v13h6V7M10 11v5M14 11v5"/></svg>'}
        </span>`;
      return `
        <div class="watch-section-chip${active}" role="button" tabindex="0" data-select="${list.id}" aria-pressed="${active ? 'true' : 'false'}">
          <span class="watch-section-chip-name">${esc(list.name)}</span>
          <span class="watch-section-chip-count">${list.count}</span>
          ${deleteBtn}
        </div>`;
    }).join('');

    let bodyHtml;
    try {
      const response = await fetch(`/api/watchlists/${selectedListId}`);
      const data = await response.json().catch(() => null);
      const items = data?.watchlist?.items ?? [];
      bodyHtml = items.length
        ? `<div class="favorites-table-wrap">${window.WatchlistsRender.renderWatchTable(data.watchlist)}</div>`
        : '<div class="watch-section-empty">Esta lista está vacía. Usa el ojo de seguimiento de una empresa para añadirla.</div>';
    } catch {
      bodyHtml = '<div class="watch-section-empty">No se pudieron cargar tus listas de seguimiento.</div>';
    }

    const total = distinctTickerCount();
    sectionRoot.innerHTML = `
      <div class="watch-section-toolbar">
        <div class="watch-section-chips">${chips}</div>
        <form class="watch-section-create" novalidate>
          <input class="watch-section-create-input" type="text" maxlength="40" placeholder="Nueva lista..." aria-label="Nombre de la nueva lista">
          <button class="watch-section-create-btn" type="submit" disabled>Crear lista</button>
        </form>
      </div>
      ${bodyHtml}
    `;

    sectionOptions.onEmptyChange?.(total > 0);
    if (countEl) countEl.textContent = total ? `${total} ${total === 1 ? 'acción' : 'acciones'}` : '—';

    bindSectionEvents();
  }

  function bindSectionEvents() {
    sectionRoot.querySelectorAll('.watch-section-chip[data-select]').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        if (e.target.closest('.watch-section-chip-delete')) return;
        selectedListId = Number(chip.dataset.select);
        renderSection();
      });
    });

    sectionRoot.querySelectorAll('.watch-section-chip-delete[data-delete]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleSectionDelete(Number(btn.dataset.delete));
      });
    });

    wireSectionCreate(sectionRoot.querySelector('.watch-section-create'));

    sectionRoot.querySelectorAll('tbody tr[data-ticker]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('a, button')) return;
        sectionOptions.onNavigate?.(row.dataset.ticker);
      });
    });

    sectionRoot.querySelectorAll('.favorite-table-fav').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const row = button.closest('tr[data-ticker]');
        const name = row?.querySelector('.favorite-company-link')?.textContent ?? row?.dataset.ticker;
        toggle(selectedListId, row.dataset.ticker, name);
      });
    });
  }

  function wireSectionCreate(form) {
    if (!form) return;
    const input = form.querySelector('.watch-section-create-input');
    const createBtn = form.querySelector('.watch-section-create-btn');
    input.addEventListener('input', () => { createBtn.disabled = !input.value.trim(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name || sectionCreating) return;
      sectionCreating = true;
      input.disabled = true;
      try {
        const data = await api('/api/watchlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        window.showToast?.(`Lista "${name}" creada.`);
        selectedListId = data.watchlist.id;
        await refresh();
      } catch (err) {
        window.showToast?.(err.message);
        input.disabled = false;
        input.focus();
      } finally {
        sectionCreating = false;
      }
    });
  }

  function handleSectionDelete(listId) {
    if (sectionConfirmListId !== listId) {
      sectionConfirmListId = listId;
      clearTimeout(sectionConfirmTimer);
      sectionConfirmTimer = setTimeout(() => {
        sectionConfirmListId = null;
        if (sectionRoot) renderSection();
      }, 3000);
      return renderSection();
    }
    clearTimeout(sectionConfirmTimer);
    sectionConfirmListId = null;
    if (selectedListId === listId) selectedListId = null;
    doDelete(listId);
  }

  function mountSection(root, options = {}) {
    sectionRoot = root;
    sectionOptions = options;
    if (!userLogged) {
      const user = window.AuthModule?.getUser?.() || window.currentUser;
      if (user) {
        userLogged = true;
        refresh();
      }
    }
    if (!getList(selectedListId)) selectedListId = defaultList()?.id ?? null;
    renderSection();
  }

  window.addEventListener('watchlists:change', () => {
    if (sectionRoot) renderSection();
  });

  window.addEventListener('auth:change', (event) => {
    setAuthenticated(Boolean(event.detail?.user));
  });

  if (window.AuthModule?.isReady()) {
    setAuthenticated(Boolean(window.AuthModule.getUser()));
  } else if (window.AuthModule?.whenReady) {
    window.AuthModule.whenReady().then((user) => {
      setAuthenticated(Boolean(user));
    });
  } else if (window.currentUser) {
    setAuthenticated(true);
  }

  const apiObj = {
    refresh,
    reset,
    setAuthenticated,
    open: (...args) => window.WatchlistsPopover.open(...args),
    close: () => window.WatchlistsPopover.close(),
    toggle,
    isInAnyList,
    listsContaining,
    isInCalendar,
    getCalendarTickers: () => [...calendarTickers],
    toggleCalendar,
    getEmailAlert,
    saveEmailAlert,
    toggleEmailMain,
    toggleEmailSub,
    listItems,
    getList,
    getLists: () => lists,
    defaultList,
    mountSection,
    isLogged: () => userLogged,
    handleCreate,
    doDelete,
  };

  window.WatchlistsPopover.init(apiObj);
  return apiObj;
})();
