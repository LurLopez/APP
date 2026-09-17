/**
 * @fileoverview Render y montaje de la sección de listas de seguimiento.
 */

(function (window) {
  const WS = window.WatchlistsState;


  async function handleCreate(input) {
    const name = input.value.trim();
    if (!name || WS.creating) return;
    WS.creating = true;
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
      WS.creating = false;
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
    WS.lists.forEach((list) => (list.tickers ?? []).forEach((item) => tickers.add(String(item.ticker).toUpperCase())));
    return tickers.size;
  }

  async function renderSection() {
    if (!WS.sectionRoot) return;
    const { countEl } = WS.sectionOptions;

    if (!WS.userLogged) {
      if (window.AuthModule && !window.AuthModule.isReady()) {
        WS.sectionRoot.innerHTML = '<div class="watch-section-empty">Cargando tus listas de seguimiento…</div>';
        WS.sectionOptions.onEmptyChange?.(false);
        if (countEl) countEl.textContent = '…';
        return;
      }
      WS.sectionRoot.innerHTML = '<div class="watch-section-empty">Inicia sesión para guardar y ver tus listas de seguimiento.</div>';
      WS.sectionOptions.onEmptyChange?.(false);
      if (countEl) countEl.textContent = 'Inicia sesión';
      return;
    }

    if (!WS.lists.length) {
      WS.sectionRoot.innerHTML = `
        <div class="watch-section-toolbar">
          <form class="watch-section-create" novalidate>
            <input class="watch-section-create-input" type="text" maxlength="40" placeholder="Nueva lista..." aria-label="Nombre de la nueva lista">
            <button class="watch-section-create-btn" type="submit" disabled>Crear lista</button>
          </form>
        </div>
        <div class="watch-section-empty">Aún no tienes listas. Crea la primera abajo.</div>
      `;
      wireSectionCreate(WS.sectionRoot.querySelector('.watch-section-create'));
      WS.sectionOptions.onEmptyChange?.(false);
      if (countEl) countEl.textContent = '—';
      return;
    }

    if (!getList(WS.selectedListId)) WS.selectedListId = defaultList().id;

    const esc = window.WatchlistsRender.escapeHtml;
    const chips = WS.lists.map((list) => {
      const active = list.id === WS.selectedListId ? ' active' : '';
      const deleteBtn = list.isDefault ? '' : `
        <span class="watch-section-chip-delete ${WS.sectionConfirmListId === list.id ? 'armed' : ''}" role="button" tabindex="0" data-delete="${list.id}" aria-label="Eliminar lista ${esc(list.name)}">
          ${WS.sectionConfirmListId === list.id ? '¿Eliminar?' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 4h4M9 7v13h6V7M10 11v5M14 11v5"/></svg>'}
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
      const response = await fetch(`/api/watchlists/${WS.selectedListId}`);
      const data = await response.json().catch(() => null);
      const items = data?.watchlist?.items ?? [];
      bodyHtml = items.length
        ? `<div class="favorites-table-wrap">${window.WatchlistsRender.renderWatchTable(data.watchlist)}</div>`
        : '<div class="watch-section-empty">Esta lista está vacía. Usa el ojo de seguimiento de una empresa para añadirla.</div>';
    } catch {
      bodyHtml = '<div class="watch-section-empty">No se pudieron cargar tus listas de seguimiento.</div>';
    }

    const total = distinctTickerCount();
    WS.sectionRoot.innerHTML = `
      <div class="watch-section-toolbar">
        <div class="watch-section-chips">${chips}</div>
        <form class="watch-section-create" novalidate>
          <input class="watch-section-create-input" type="text" maxlength="40" placeholder="Nueva lista..." aria-label="Nombre de la nueva lista">
          <button class="watch-section-create-btn" type="submit" disabled>Crear lista</button>
        </form>
      </div>
      ${bodyHtml}
    `;

    WS.sectionOptions.onEmptyChange?.(total > 0);
    if (countEl) {
      countEl.textContent = total ? (window.I18n ? window.I18n.tp(total, '{n} acción', '{n} acciones') : `${total} ${total === 1 ? 'acción' : 'acciones'}`) : '—';
    }

    bindSectionEvents();
  }

  function bindSectionEvents() {
    WS.sectionRoot.querySelectorAll('.watch-section-chip[data-select]').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        if (e.target.closest('.watch-section-chip-delete')) return;
        WS.selectedListId = Number(chip.dataset.select);
        renderSection();
      });
    });

    WS.sectionRoot.querySelectorAll('.watch-section-chip-delete[data-delete]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleSectionDelete(Number(btn.dataset.delete));
      });
    });

    wireSectionCreate(WS.sectionRoot.querySelector('.watch-section-create'));

    WS.sectionRoot.querySelectorAll('tbody tr[data-ticker]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('a, button')) return;
        WS.sectionOptions.onNavigate?.(row.dataset.ticker);
      });
    });

    WS.sectionRoot.querySelectorAll('.favorite-table-fav').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const row = button.closest('tr[data-ticker]');
        const name = row?.querySelector('.favorite-company-link')?.textContent ?? row?.dataset.ticker;
        toggle(WS.selectedListId, row.dataset.ticker, name);
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
      if (!name || WS.sectionCreating) return;
      WS.sectionCreating = true;
      input.disabled = true;
      try {
        const data = await api('/api/watchlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        window.showToast?.(`Lista "${name}" creada.`);
        WS.selectedListId = data.watchlist.id;
        await refresh();
      } catch (err) {
        window.showToast?.(err.message);
        input.disabled = false;
        input.focus();
      } finally {
        WS.sectionCreating = false;
      }
    });
  }

  function handleSectionDelete(listId) {
    if (WS.sectionConfirmListId !== listId) {
      WS.sectionConfirmListId = listId;
      clearTimeout(WS.sectionConfirmTimer);
      WS.sectionConfirmTimer = setTimeout(() => {
        WS.sectionConfirmListId = null;
        if (WS.sectionRoot) renderSection();
      }, 3000);
      return renderSection();
    }
    clearTimeout(WS.sectionConfirmTimer);
    WS.sectionConfirmListId = null;
    if (WS.selectedListId === listId) WS.selectedListId = null;
    doDelete(listId);
  }

  function mountSection(root, options = {}) {
    WS.sectionRoot = root;
    WS.sectionOptions = options;
    if (!WS.userLogged) {
      const user = window.AuthModule?.getUser?.() || window.currentUser;
      if (user) {
        WS.userLogged = true;
        refresh();
      }
    }
    if (!getList(WS.selectedListId)) WS.selectedListId = defaultList()?.id ?? null;
    renderSection();
  }

window.handleCreate = handleCreate;
window.doDelete = doDelete;
window.distinctTickerCount = distinctTickerCount;
window.renderSection = renderSection;
window.bindSectionEvents = bindSectionEvents;
window.wireSectionCreate = wireSectionCreate;
window.handleSectionDelete = handleSectionDelete;
window.mountSection = mountSection;

})(window);
