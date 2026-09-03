/* ── Listas de seguimiento: estado compartido y popover ────── */

const Watchlists = (() => {
  let userLogged = false;
  let lists = [];
  let byId = new Map();
  let membership = new Map();
  let calendarTickers = new Set();
  let emailAlerts = new Map();
  let popover = null;
  let openContext = null;
  let confirmListId = null;
  let confirmTimer = null;
  let creating = false;

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
    close();
    emitChange();
  }

  async function refresh() {
    if (!userLogged) {
      reset();
      return;
    }
    try {
      const response = await fetch('/api/watchlists');
      if (!response.ok) throw new Error('No se pudieron cargar las listas.');
      const data = await response.json().catch(() => null);
      rebuildState(data);
      emitChange();
      if (popover) renderPopover();
    } catch {
      reset();
    }
  }

  function setAuthenticated(value) {
    userLogged = Boolean(value);
    if (!userLogged) reset();
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
    if (emailAlerts.has(t)) {
      return emailAlerts.get(t);
    }
    return {
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
      showToast?.('Inicia sesión para gestionar el calendario.');
      window.openModal?.('login');
      return;
    }
    ticker = String(ticker).toUpperCase();
    if (typeof Portfolio !== 'undefined' && Portfolio.hasPosition?.(ticker)) {
      showToast?.(`${ticker} está en tu cartera y siempre aparece en el calendario.`);
      return;
    }
    const adding = !calendarTickers.has(ticker);
    if (adding) calendarTickers.add(ticker);
    else calendarTickers.delete(ticker);

    emitChange();
    if (popover) renderPopover();
    window.dispatchEvent(new CustomEvent('portfolio:change'));

    try {
      if (adding) {
        await api('/api/watchlists/calendar/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, companyName }),
        });
        showToast?.(`${ticker} añadida al calendario.`);
      } else {
        await api(`/api/watchlists/calendar/items/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
        showToast?.(`${ticker} quitada del calendario.`);
      }
      await refresh();
      window.dispatchEvent(new CustomEvent('portfolio:change'));
    } catch (error) {
      await refresh();
      showToast?.(error.message);
    }
  }

  let emailAlertDebounceMap = new Map();
  function saveEmailAlert(ticker, companyName, newAlert) {
    if (!userLogged) {
      showToast?.('Inicia sesión para configurar alertas por email.');
      window.openModal?.('login');
      return;
    }
    const t = String(ticker).toUpperCase();
    emailAlerts.set(t, newAlert);
    emitChange();
    if (popover) renderPopover();

    if (emailAlertDebounceMap.has(t)) {
      clearTimeout(emailAlertDebounceMap.get(t));
    }
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
    const newAlert = {
      enabled: newEnabled,
      notifyEarnings: newEnabled ? (allSubsOff ? true : current.notifyEarnings) : current.notifyEarnings,
      notifyExdiv: newEnabled ? (allSubsOff ? true : current.notifyExdiv) : current.notifyExdiv,
      notifyPayout: newEnabled ? (allSubsOff ? true : current.notifyPayout) : current.notifyPayout,
    };
    saveEmailAlert(ticker, companyName, newAlert);
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
      showToast?.('Inicia sesión para guardar acciones en listas de seguimiento.');
      window.openModal?.('login');
      return;
    }
    ticker = String(ticker).toUpperCase();
    listId = Number(listId);
    const ids = listsContaining(ticker);
    const adding = !ids.has(listId);

    if (adding) {
      ids.add(listId);
      // Al añadir a cualquier lista, por defecto se activa el calendario
      if (!calendarTickers.has(ticker)) {
        calendarTickers.add(ticker);
      }
      // Y por defecto se activan las alertas por email con las 3 subcasillas
      if (!emailAlerts.has(ticker)) {
        emailAlerts.set(ticker, {
          enabled: true,
          notifyEarnings: true,
          notifyExdiv: true,
          notifyPayout: true,
        });
      }
    } else {
      ids.delete(listId);
    }
    emitChange();
    if (popover) renderPopover();

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
      showToast?.(error.message);
    }
  }

  /* ── Popover ─────────────────────────────────────────────── */

  function attachPopoverEvents() {
    if (!popover) return;

    popover.addEventListener('click', (event) => {
      if (!openContext) return;
      const { ticker, companyName } = openContext;

      if (event.target.closest('.watch-popover-close')) {
        close();
        return;
      }
      const calRow = event.target.closest('[data-action="toggle-calendar"]');
      if (calRow) {
        toggleCalendar(ticker, companyName);
        return;
      }
      const emailMain = event.target.closest('[data-action="toggle-email-main"]');
      if (emailMain) {
        toggleEmailMain(ticker, companyName);
        return;
      }
      const subEarn = event.target.closest('[data-action="toggle-sub-earnings"]');
      if (subEarn) {
        toggleEmailSub(ticker, companyName, 'earnings');
        return;
      }
      const subEx = event.target.closest('[data-action="toggle-sub-exdiv"]');
      if (subEx) {
        toggleEmailSub(ticker, companyName, 'exdiv');
        return;
      }
      const subPay = event.target.closest('[data-action="toggle-sub-payout"]');
      if (subPay) {
        toggleEmailSub(ticker, companyName, 'payout');
        return;
      }
      const deleteButton = event.target.closest('.watch-popover-delete');
      if (deleteButton) {
        handleDelete(deleteButton);
        return;
      }
      const row = event.target.closest('.watch-popover-row');
      if (row && !event.target.closest('button')) toggle(row.dataset.listId, ticker, companyName);
    });

    popover.addEventListener('keydown', (event) => {
      if (!openContext) return;
      const { ticker, companyName } = openContext;

      if (event.key === 'Enter' || event.key === ' ') {
        const calRow = event.target.closest('[data-action="toggle-calendar"]');
        if (calRow) {
          event.preventDefault();
          toggleCalendar(ticker, companyName);
          return;
        }
        const emailMain = event.target.closest('[data-action="toggle-email-main"]');
        if (emailMain) {
          event.preventDefault();
          toggleEmailMain(ticker, companyName);
          return;
        }
        const subEarn = event.target.closest('[data-action="toggle-sub-earnings"]');
        if (subEarn) {
          event.preventDefault();
          toggleEmailSub(ticker, companyName, 'earnings');
          return;
        }
        const subEx = event.target.closest('[data-action="toggle-sub-exdiv"]');
        if (subEx) {
          event.preventDefault();
          toggleEmailSub(ticker, companyName, 'exdiv');
          return;
        }
        const subPay = event.target.closest('[data-action="toggle-sub-payout"]');
        if (subPay) {
          event.preventDefault();
          toggleEmailSub(ticker, companyName, 'payout');
          return;
        }
        const row = event.target.closest('.watch-popover-row');
        if (row && !event.target.closest('button')) {
          event.preventDefault();
          toggle(row.dataset.listId, ticker, companyName);
        }
      }
    });

    popover.addEventListener('submit', (event) => {
      const form = event.target.closest('.watch-popover-create');
      if (form) {
        event.preventDefault();
        const input = form.querySelector('.watch-popover-create-input');
        if (input) handleCreate(input);
      }
    });

    popover.addEventListener('input', (event) => {
      const input = event.target.closest('.watch-popover-create-input');
      if (input) {
        const createButton = popover.querySelector('.watch-popover-create-btn');
        if (createButton) createButton.disabled = !input.value.trim();
      }
    });
  }

  function open(anchor, ticker, companyName) {
    if (!userLogged) {
      showToast?.('Inicia sesión para guardar acciones en listas de seguimiento.');
      window.openModal?.('login');
      return;
    }
    close();
    openContext = { anchor, ticker: String(ticker).toUpperCase(), companyName: String(companyName ?? '') };
    popover = document.createElement('div');
    popover.className = 'watch-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Listas y Notificaciones');
    attachPopoverEvents();
    document.body.appendChild(popover);
    renderPopover();
    positionPopover();
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', onDocumentKeydown);
    window.addEventListener('scroll', onWindowScroll, true);
    window.addEventListener('resize', close);
  }

  function close() {
    openContext = null;
    if (popover) {
      popover.remove();
      popover = null;
    }
    clearTimeout(confirmTimer);
    confirmListId = null;
    document.removeEventListener('click', onDocumentClick, true);
    document.removeEventListener('keydown', onDocumentKeydown);
    window.removeEventListener('scroll', onWindowScroll, true);
    window.removeEventListener('resize', close);
  }

  function onDocumentClick(event) {
    if (popover && !popover.contains(event.target)) close();
  }

  function onDocumentKeydown(event) {
    if (event.key === 'Escape' && popover) close();
  }

  function onWindowScroll(event) {
    if (popover && !popover.contains(event.target)) close();
  }

  function positionPopover() {
    if (!popover || !openContext) return;
    const rect = openContext.anchor.getBoundingClientRect();
    const width = popover.offsetWidth || 280;
    const height = popover.offsetHeight || 320;
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, document.documentElement.clientWidth - width - 8));
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function renderPopover() {
    if (!popover || !openContext) return;
    const listContainer = popover.querySelector('.watch-popover-list');
    const previousScrollTop = listContainer?.scrollTop ?? 0;
    const previousInputValue = popover.querySelector('.watch-popover-create-input')?.value ?? '';
    const { ticker, companyName } = openContext;
    const inListIds = listsContaining(ticker);
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

    const isHeld = typeof Portfolio !== 'undefined' && Boolean(Portfolio.hasPosition?.(ticker));
    const inCal = isHeld || isInCalendar(ticker);
    const alertSettings = getEmailAlert(ticker);

    popover.innerHTML = `
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

    const newListContainer = popover.querySelector('.watch-popover-list');
    if (newListContainer && previousScrollTop) newListContainer.scrollTop = previousScrollTop;

    if (previousInputValue) {
      const input = popover.querySelector('.watch-popover-create-input');
      const createButton = popover.querySelector('.watch-popover-create-btn');
      if (input) input.value = previousInputValue;
      if (createButton) createButton.disabled = !previousInputValue.trim();
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
      showToast?.(`Lista "${name}" creada.`);
      await refresh();
      const newInput = popover?.querySelector('.watch-popover-create-input');
      if (newInput) {
        newInput.value = '';
        newInput.disabled = false;
        newInput.focus();
      }
    } catch (error) {
      showToast?.(error.message);
      input.disabled = false;
      input.focus();
    } finally {
      creating = false;
    }
  }

  function handleDelete(button) {
    const listId = Number(button.dataset.deleteList);
    if (confirmListId !== listId) {
      confirmListId = listId;
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => {
        confirmListId = null;
        if (popover) renderPopover();
      }, 3000);
      renderPopover();
      return;
    }
    clearTimeout(confirmTimer);
    confirmListId = null;
    doDelete(listId);
  }

  async function doDelete(listId) {
    const list = getList(listId);
    try {
      await api(`/api/watchlists/${listId}`, { method: 'DELETE' });
      showToast?.(`Lista "${list?.name ?? ''}" eliminada.`);
      await refresh();
    } catch (error) {
      showToast?.(error.message);
    }
  }

  /* ── Sección de listas de seguimiento ─────────────────────── */

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

  function renderWatchTable(watchlist) {
    const items = Array.isArray(watchlist.items) ? watchlist.items : [];
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

  function distinctTickerCount() {
    const tickers = new Set();
    lists.forEach((list) => (list.tickers ?? []).forEach((item) => tickers.add(String(item.ticker).toUpperCase())));
    return tickers.size;
  }

  let sectionRoot = null;
  let sectionOptions = {};
  let selectedListId = null;
  let sectionConfirmListId = null;
  let sectionConfirmTimer = null;
  let sectionCreating = false;

  async function renderSection() {
    if (!sectionRoot) return;
    const { countEl } = sectionOptions;

    if (!userLogged) {
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

    const chips = lists.map((list) => {
      const active = list.id === selectedListId ? ' active' : '';
      const deleteButton = list.isDefault ? '' : `
        <span class="watch-section-chip-delete ${sectionConfirmListId === list.id ? 'armed' : ''}" role="button" tabindex="0" data-delete="${list.id}" aria-label="Eliminar lista ${escapeHtml(list.name)}">
          ${sectionConfirmListId === list.id ? '¿Eliminar?' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 4h4M9 7v13h6V7M10 11v5M14 11v5"/></svg>'}
        </span>`;
      return `
        <div class="watch-section-chip${active}" role="button" tabindex="0" data-select="${list.id}" aria-pressed="${active ? 'true' : 'false'}">
          <span class="watch-section-chip-name">${escapeHtml(list.name)}</span>
          <span class="watch-section-chip-count">${list.count}</span>
          ${deleteButton}
        </div>`;
    }).join('');

    let bodyHtml;
    try {
      const response = await fetch(`/api/watchlists/${selectedListId}`);
      const data = await response.json().catch(() => null);
      const items = data?.watchlist?.items ?? [];
      if (items.length) {
        bodyHtml = `<div class="favorites-table-wrap">${renderWatchTable(data.watchlist)}</div>`;
      } else {
        bodyHtml = '<div class="watch-section-empty">Esta lista está vacía. Usa el ojo de seguimiento de una empresa para añadirla.</div>';
      }
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

    sectionRoot.querySelectorAll('.watch-section-chip[data-select]').forEach((chip) => {
      chip.addEventListener('click', (event) => {
        if (event.target.closest('.watch-section-chip-delete')) return;
        selectedListId = Number(chip.dataset.select);
        renderSection();
      });
      chip.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('.watch-section-chip-delete')) {
          event.preventDefault();
          selectedListId = Number(chip.dataset.select);
          renderSection();
        }
      });
    });
    sectionRoot.querySelectorAll('.watch-section-chip-delete[data-delete]').forEach((deleteControl) => {
      deleteControl.addEventListener('click', (event) => {
        event.stopPropagation();
        handleSectionDelete(Number(deleteControl.dataset.delete));
      });
      deleteControl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          handleSectionDelete(Number(deleteControl.dataset.delete));
        }
      });
    });
    wireSectionCreate(sectionRoot.querySelector('.watch-section-create'));

    sectionRoot.querySelectorAll('tbody tr[data-ticker]').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('a, button')) return;
        sectionOptions.onNavigate?.(row.dataset.ticker);
      });
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.target.closest('a, button')) sectionOptions.onNavigate?.(row.dataset.ticker);
      });
    });
    sectionRoot.querySelectorAll('.favorite-table-fav').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const row = button.closest('tr[data-ticker]');
        const name = row?.querySelector('.favorite-company-link')?.textContent ?? row?.dataset.ticker;
        toggle(selectedListId, row.dataset.ticker, name);
      });
    });
  }

  function wireSectionCreate(form) {
    if (!form) return;
    const input = form.querySelector('.watch-section-create-input');
    const createButton = form.querySelector('.watch-section-create-btn');
    input.addEventListener('input', () => { createButton.disabled = !input.value.trim(); });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      handleSectionCreate(input);
    });
  }

  async function handleSectionCreate(input) {
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
      showToast?.(`Lista "${name}" creada.`);
      selectedListId = data.watchlist.id;
      await refresh();
    } catch (error) {
      showToast?.(error.message);
      input.disabled = false;
      input.focus();
    } finally {
      sectionCreating = false;
    }
  }

  function handleSectionDelete(listId) {
    if (sectionConfirmListId !== listId) {
      sectionConfirmListId = listId;
      clearTimeout(sectionConfirmTimer);
      sectionConfirmTimer = setTimeout(() => {
        sectionConfirmListId = null;
        if (sectionRoot) renderSection();
      }, 3000);
      renderSection();
      return;
    }
    clearTimeout(sectionConfirmTimer);
    sectionConfirmListId = null;
    if (selectedListId === listId) selectedListId = null;
    doDelete(listId);
  }

  function mountSection(root, options = {}) {
    sectionRoot = root;
    sectionOptions = options;
    if (!getList(selectedListId)) selectedListId = defaultList()?.id ?? null;
    renderSection();
  }

  window.addEventListener('watchlists:change', () => {
    if (sectionRoot) renderSection();
  });

  return {
    refresh,
    reset,
    setAuthenticated,
    open,
    close,
    toggle,
    isInAnyList,
    listsContaining,
    isInCalendar,
    toggleCalendar,
    getEmailAlert,
    saveEmailAlert,
    toggleEmailMain,
    toggleEmailSub,
    listItems,
    getList,
    defaultList,
    mountSection,
  };
})();
