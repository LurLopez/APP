/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;
  const { wirePortfolioLogos } = window.PortfolioDonuts;

  function wireGroupFeatures(scope) {
    if (!scope) return;
    scope.querySelectorAll('[data-pf-groups-tab-select]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.pfGroupsTabSelect;
        if (value.startsWith('pre:')) PS.activeTab = { type: 'predefined', key: value.slice(4) };
        else if (value.startsWith('tab:')) PS.activeTab = { type: 'custom', id: Number(value.slice(4)) };
        else PS.activeTab = null;
        PS.groupFormOpen = false;
        PS.editingGroupId = null;
        PS.editingTabId = null;
        PS.expandedGroups.clear();
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-groups-view]').forEach((button) => {
      button.addEventListener('click', () => {
        PS.groupsView = button.dataset.pfGroupsView;
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('.pf-g-groups-table th[data-sort-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.PS.sortKey;
        if (PS.groupsSortKey === key) {
          PS.groupsSortDir = PS.groupsSortDir === 'desc' ? 'asc' : 'desc';
        } else {
          PS.groupsSortKey = key;
          PS.groupsSortDir = key === 'valor' ? 'asc' : 'desc';
        }
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('[data-groups-mode-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const key = button.dataset.groupsModeToggle;
        if (TOTAL_MEDIO_TOGGLES[key]) {
          PS.groupsDisplayMode[key] = (PS.groupsDisplayMode[key] ?? TOTAL_MEDIO_DEFAULT[key] ?? 'medio') === 'medio' ? 'total' : 'medio';
        } else {
          PS.groupsDisplayMode[key] = groupsModeIsPct(key) ? 'amt' : 'pct';
        }
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('[data-pf-group-expand]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleGroupRow(button.dataset.pfGroupExpand);
      });
    });
    scope.querySelectorAll('[data-pf-group-row]').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('a, button')) return;
        toggleGroupRow(row.dataset.pfGroupRow);
      });
      row.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('a, button')) {
          event.preventDefault();
          toggleGroupRow(row.dataset.pfGroupRow);
        }
      });
    });
    scope.querySelectorAll('[data-pf-tab-create]').forEach((button) => {
      button.addEventListener('click', () => {
        PS.tabFormOpen = !PS.tabFormOpen;
        PS.editingTabId = null;
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-tab-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        PS.editingTabId = PS.activeTab?.type === 'custom' ? PS.activeTab.id : null;
        PS.tabFormOpen = false;
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-tab-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (PS.activeTab?.type !== 'custom') return;
        const tab = tabById(PS.activeTab.id);
        if (!tab) return;
        if (!window.confirm(`¿Eliminar la pestaña «${tab.name}» y sus grupos?`)) return;
        try {
          await api(`/api/portfolio/tabs/${tab.id}`, { method: 'DELETE' });
          showToast?.('Pestaña eliminada.');
          PS.activeTab = null;
          PS.activeGroup = null;
          PS.expandedGroups.clear();
          PS.editingTabId = null;
          await refresh();
        } catch (error) {
          showToast?.(error.message);
        }
      });
    });
    scope.querySelectorAll('[data-pf-group-create]').forEach((button) => {
      button.addEventListener('click', () => {
        PS.groupFormOpen = !PS.groupFormOpen;
        PS.editingGroupId = null;
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-group-edit]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        PS.editingGroupId = PS.editingGroupId === Number(button.dataset.pfGroupEdit) ? null : Number(button.dataset.pfGroupEdit);
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-group-delete]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const id = Number(button.dataset.pfGroupDelete);
        const group = groupById(id);
        if (!group) return;
        if (!window.confirm(`¿Eliminar el grupo «${group.name}»?`)) return;
        try {
          await api(`/api/portfolio/groups/${id}`, { method: 'DELETE' });
          showToast?.('Grupo eliminado.');
          PS.expandedGroups.delete(String(id));
          PS.editingGroupId = null;
          await refresh();
        } catch (error) {
          showToast?.(error.message);
        }
      });
    });
    scope.querySelectorAll('[data-pf-g-cancel]').forEach((button) => {
      button.addEventListener('click', () => {
        PS.tabFormOpen = false;
        PS.groupFormOpen = false;
        PS.editingGroupId = null;
        PS.editingTabId = null;
        renderSection();
      });
    });
    const tabForm = scope.querySelector('[data-pf-tab-form]');
    tabForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = (tabForm.querySelector('.pf-g-name')?.value ?? '').trim();
      const color = tabForm.querySelector('.pf-g-color')?.value ?? '#2563eb';
      if (!name) return;
      try {
        const payload = await api('/api/portfolio/tabs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color }),
        });
        PS.tabFormOpen = false;
        PS.activeTab = { type: 'custom', id: payload.tab.id };
        PS.activeGroup = null;
        PS.expandedGroups.clear();
        showToast?.('Pestaña creada.');
        await refresh();
      } catch (error) {
        showToast?.(error.message);
      }
    });
    const tabEditForm = scope.querySelector('[data-pf-tab-edit-form]');
    tabEditForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!PS.editingTabId) return;
      const name = (tabEditForm.querySelector('.pf-g-name')?.value ?? '').trim();
      const color = tabEditForm.querySelector('.pf-g-color')?.value ?? '#2563eb';
      if (!name) return;
      try {
        await api(`/api/portfolio/tabs/${PS.editingTabId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color }),
        });
        PS.editingTabId = null;
        showToast?.('Pestaña actualizada.');
        await refresh();
      } catch (error) {
        showToast?.(error.message);
      }
    });
    const groupForm = scope.querySelector('[data-pf-group-form]');
    groupForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const tab = PS.activeTab?.type === 'custom' ? tabById(PS.activeTab.id) : null;
      if (!tab) return;
      const name = (groupForm.querySelector('.pf-g-name')?.value ?? '').trim();
      const color = groupForm.querySelector('.pf-g-color')?.value ?? '#2563eb';
      if (!name) return;
      const tickers = [];
      const lotIds = [];
      groupForm.querySelectorAll('input[data-member-kind="ticker"]:checked').forEach((input) => {
        tickers.push(input.dataset.ticker);
      });
      groupForm.querySelectorAll('input[data-member-kind="lot"]:checked').forEach((input) => {
        if (tickers.includes(input.dataset.ticker)) return;
        lotIds.push(Number(input.dataset.transactionId));
      });
      try {
        await api('/api/portfolio/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tabId: tab.id, name, color, tickers, lotTransactionIds: lotIds }),
        });
        PS.groupFormOpen = false;
        showToast?.('Grupo creado.');
        await refresh();
      } catch (error) {
        showToast?.(error.message);
      }
    });
    const editForm = scope.querySelector('[data-pf-group-edit-form]');
    editForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!PS.editingGroupId) return;
      const name = (editForm.querySelector('.pf-g-name')?.value ?? '').trim();
      const color = editForm.querySelector('.pf-g-color')?.value ?? '#2563eb';
      if (!name) return;
      try {
        await api(`/api/portfolio/groups/${PS.editingGroupId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color }),
        });
        PS.editingGroupId = null;
        showToast?.('Grupo actualizado.');
        await refresh();
      } catch (error) {
        showToast?.(error.message);
      }
    });
    scope.querySelectorAll('.pf-g-action-check input').forEach((input) => {
      input.addEventListener('change', () => {
        const item = input.closest('[data-member-ticker]');
        item?.querySelectorAll('input[data-member-kind="lot"]').forEach((sub) => { sub.checked = input.checked; });
      });
    });
    scope.querySelectorAll('.pf-g-add').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const row = button.closest('tr');
        const ticker = row?.dataset.ticker;
        const buyId = row?.dataset.buyId;
        if (!ticker) return;
        const position = (PS.data?.positions ?? []).find((p) => p.ticker === ticker);
        const lot = buyId ? (position?.lots ?? []).find((l) => String(l.id) === String(buyId)) : null;
        openGroupPopover(button, {
          scope: buyId ? 'lot' : 'ticker',
          ticker,
          buyId: buyId ? Number(buyId) : null,
          date: lot?.date ?? null,
        });
      });
    });
    wirePortfolioLogos(scope);
  }
window.wireGroupFeatures = wireGroupFeatures;

})(window);
