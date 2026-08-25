/* ── Listas de seguimiento: estado compartido y popover ────── */

const Watchlists = (() => {
  let userLogged = false;
  let lists = [];
  let byId = new Map();
  let membership = new Map();
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

    if (adding) ids.add(listId);
    else ids.delete(listId);
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
      showToast?.(adding ? `${ticker} añadida a la lista.` : `${ticker} quitada de la lista.`);
      await refresh();
    } catch (error) {
      await refresh();
      showToast?.(error.message);
    }
  }

  /* ── Popover ─────────────────────────────────────────────── */

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
    popover.setAttribute('aria-label', 'Listas de seguimiento');
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

    popover.innerHTML = `
      <div class="watch-popover-head">
        <div>
          <strong>Listas de seguimiento</strong>
          <span class="watch-popover-sub">${escapeHtml(ticker)}${companyName ? ` · ${escapeHtml(companyName)}` : ''}</span>
        </div>
        <button class="watch-popover-close" type="button" aria-label="Cerrar">×</button>
      </div>
      <div class="watch-popover-list">
        ${lists.length ? rows : '<div class="watch-popover-empty">Aún no tienes listas. Crea la primera abajo.</div>'}
      </div>
      <form class="watch-popover-create" novalidate>
        <input class="watch-popover-create-input" type="text" maxlength="40" placeholder="Nueva lista..." aria-label="Nombre de la nueva lista">
        <button class="watch-popover-create-btn" type="submit" disabled>Crear</button>
      </form>
    `;

    const newListContainer = popover.querySelector('.watch-popover-list');
    if (newListContainer && previousScrollTop) newListContainer.scrollTop = previousScrollTop;

    popover.addEventListener('click', (event) => {
      if (event.target.closest('.watch-popover-close')) {
        close();
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
      const row = event.target.closest('.watch-popover-row');
      if (row && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        toggle(row.dataset.listId, ticker, companyName);
      }
    });

    const form = popover.querySelector('.watch-popover-create');
    const input = popover.querySelector('.watch-popover-create-input');
    const createButton = popover.querySelector('.watch-popover-create-btn');
    input.addEventListener('input', () => { createButton.disabled = !input.value.trim(); });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      handleCreate(input);
    });
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
    listItems,
    getList,
    defaultList,
    mountSection,
  };
})();
