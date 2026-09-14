/**
 * @fileoverview Controlador del popover interactivo de listas de seguimiento y notificaciones.
 * @module WatchlistsPopover
 */

(function () {
  'use strict';

  let popover = null;
  let openContext = null;
  let confirmListId = null;
  let confirmTimer = null;
  let manager = null;

  function init(watchlistManager) {
    manager = watchlistManager;
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
    if (!popover || !openContext || !manager) return;
    const listContainer = popover.querySelector('.watch-popover-list');
    const previousScrollTop = listContainer?.scrollTop ?? 0;
    const previousInputValue = popover.querySelector('.watch-popover-create-input')?.value ?? '';

    const { ticker, companyName } = openContext;
    const inListIds = manager.listsContaining(ticker);
    const isHeld = typeof Portfolio !== 'undefined' && Boolean(Portfolio.hasPosition?.(ticker));
    const inCal = isHeld || manager.isInCalendar(ticker);
    const alertSettings = manager.getEmailAlert(ticker);

    popover.innerHTML = window.WatchlistsRender.renderPopoverHtml({
      ticker,
      companyName,
      lists: manager.getLists(),
      inListIds,
      isHeld,
      inCal,
      alertSettings,
      confirmListId,
    });

    const newListContainer = popover.querySelector('.watch-popover-list');
    if (newListContainer && previousScrollTop) newListContainer.scrollTop = previousScrollTop;

    if (previousInputValue) {
      const input = popover.querySelector('.watch-popover-create-input');
      const createButton = popover.querySelector('.watch-popover-create-btn');
      if (input) input.value = previousInputValue;
      if (createButton) createButton.disabled = !previousInputValue.trim();
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
    manager.doDelete(listId);
  }

  function attachPopoverEvents() {
    if (!popover) return;

    popover.addEventListener('click', (e) => {
      if (!openContext) return;
      const { ticker, companyName } = openContext;

      if (e.target.closest('.watch-popover-close')) return close();
      if (e.target.closest('[data-action="toggle-calendar"]')) return manager.toggleCalendar(ticker, companyName);
      if (e.target.closest('[data-action="toggle-email-main"]')) return manager.toggleEmailMain(ticker, companyName);
      if (e.target.closest('[data-action="toggle-sub-earnings"]')) return manager.toggleEmailSub(ticker, companyName, 'earnings');
      if (e.target.closest('[data-action="toggle-sub-exdiv"]')) return manager.toggleEmailSub(ticker, companyName, 'exdiv');
      if (e.target.closest('[data-action="toggle-sub-payout"]')) return manager.toggleEmailSub(ticker, companyName, 'payout');

      const deleteBtn = e.target.closest('.watch-popover-delete');
      if (deleteBtn) return handleDelete(deleteBtn);

      const row = e.target.closest('.watch-popover-row');
      if (row && !e.target.closest('button')) manager.toggle(row.dataset.listId, ticker, companyName);
    });

    popover.addEventListener('keydown', (e) => {
      if (!openContext) return;
      const { ticker, companyName } = openContext;
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('[data-action="toggle-calendar"]')) { e.preventDefault(); return manager.toggleCalendar(ticker, companyName); }
        if (e.target.closest('[data-action="toggle-email-main"]')) { e.preventDefault(); return manager.toggleEmailMain(ticker, companyName); }
        if (e.target.closest('[data-action="toggle-sub-earnings"]')) { e.preventDefault(); return manager.toggleEmailSub(ticker, companyName, 'earnings'); }
        if (e.target.closest('[data-action="toggle-sub-exdiv"]')) { e.preventDefault(); return manager.toggleEmailSub(ticker, companyName, 'exdiv'); }
        if (e.target.closest('[data-action="toggle-sub-payout"]')) { e.preventDefault(); return manager.toggleEmailSub(ticker, companyName, 'payout'); }
        const row = e.target.closest('.watch-popover-row');
        if (row && !e.target.closest('button')) { e.preventDefault(); manager.toggle(row.dataset.listId, ticker, companyName); }
      }
    });

    popover.addEventListener('submit', (e) => {
      const form = e.target.closest('.watch-popover-create');
      if (form) {
        e.preventDefault();
        const input = form.querySelector('.watch-popover-create-input');
        if (input) manager.handleCreate(input);
      }
    });

    popover.addEventListener('input', (e) => {
      const input = e.target.closest('.watch-popover-create-input');
      if (input) {
        const createBtn = popover.querySelector('.watch-popover-create-btn');
        if (createBtn) createBtn.disabled = !input.value.trim();
      }
    });
  }

  function open(anchor, ticker, companyName) {
    if (!manager.isLogged()) {
      window.showToast?.('Inicia sesión para guardar acciones en listas de seguimiento.');
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

    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onDocKeydown);
    window.addEventListener('scroll', onDocScroll, true);
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
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onDocKeydown);
    window.removeEventListener('scroll', onDocScroll, true);
    window.removeEventListener('resize', close);
  }

  const onDocClick = (e) => { if (popover && !popover.contains(e.target)) close(); };
  const onDocKeydown = (e) => { if (e.key === 'Escape' && popover) close(); };
  const onDocScroll = (e) => { if (popover && !popover.contains(e.target)) close(); };

  window.WatchlistsPopover = {
    init,
    open,
    close,
    renderPopover,
    isOpen: () => Boolean(popover),
  };
})();
