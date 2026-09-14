/**
 * @file portfolioHistory.js
 * @description Gestión y renderizado del historial de operaciones de cartera, modal a pantalla completa y filtros.
 */

(function (window) {
  'use strict';

  const HISTORY_MODAL_ID = 'pf-history-modal';

  const fmt = () => window.PortfolioFormatting || {};

  function transactionsSortedDesc(list) {
    return [...(list ?? [])].sort((a, b) => {
      const byDate = String(b.tradeDate).localeCompare(String(a.tradeDate));
      return byDate || Number(b.id ?? 0) - Number(a.id ?? 0);
    });
  }

  function transactionRowHtml(item, { withDelete = true } = {}) {
    const f = fmt();
    const escapeHtml = f.escapeHtml || ((s) => s);
    const fmtDate = f.fmtDate || ((s) => s);
    const fmtShares = f.fmtShares || ((s) => s);
    const fmtPrice = f.fmtPrice || ((s) => `$${s}`);
    const fmtMoney = f.fmtMoney || ((s) => `$${s}`);
    const fmtSigned = f.fmtSigned || ((s) => s);
    const changeClass = f.changeClass || (() => '');

    return `
      <tr>
        <td>${fmtDate(item.tradeDate)}</td>
        <td><span class="pf-type-badge ${item.type === 'buy' ? 'buy' : 'sell'}">${item.type === 'buy' ? 'Compra' : 'Venta'}</span></td>
        <td>${escapeHtml(item.companyName)} <span class="td-ticker">${escapeHtml(item.ticker)}</span></td>
        <td>${fmtShares(item.shares)}</td>
        <td>${fmtPrice(item.price)}</td>
        <td>${fmtMoney(Number(item.shares) * Number(item.price))}</td>
        <td class="${changeClass(item.realizedGain)}">${item.type === 'sell' ? fmtSigned(item.realizedGain) : '—'}</td>
        ${withDelete ? `
        <td>
          <button class="row-action pf-delete-tx" type="button" data-id="${item.id}" aria-label="Eliminar operación de ${escapeHtml(item.ticker)}" title="Eliminar operación">×</button>
        </td>` : ''}
      </tr>`;
  }

  function historyTableHtml(transactions, { withDelete = true } = {}) {
    const rows = transactions.map((item) => transactionRowHtml(item, { withDelete })).join('');
    return `
      <div class="table-wrap">
        <table class="pf-transactions-table">
          <thead><tr>
            <th scope="col">Fecha</th>
            <th scope="col">Tipo</th>
            <th scope="col">Empresa</th>
            <th scope="col">Acciones</th>
            <th scope="col">Precio</th>
            <th scope="col">Importe</th>
            <th scope="col" title="Ganancia realizada según el método FIFO (first in, first out)">Ganancia</th>
            ${withDelete ? '<th scope="col" aria-label="Acciones"></th>' : ''}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function wireDeleteButtons(scope, { onDelete, refresh, showToast } = {}) {
    if (!scope) return;
    scope.querySelectorAll('.pf-delete-tx').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (!window.confirm('¿Eliminar esta operación? Se recalculará toda la cartera.')) return;
        try {
          if (typeof onDelete === 'function') {
            await onDelete(button.dataset.id);
          } else {
            const res = await fetch(`/api/portfolio/transactions/${button.dataset.id}`, { method: 'DELETE' });
            if (!res.ok) {
              const payload = await res.json().catch(() => ({}));
              throw new Error(payload.error || 'Error al eliminar');
            }
          }
          if (typeof showToast === 'function') showToast('Operación eliminada.');
          if (typeof refresh === 'function') await refresh();
          const modal = document.getElementById(HISTORY_MODAL_ID);
          if (modal && !modal.hidden && window.PortfolioHistory?.renderHistoryModal) {
            window.PortfolioHistory.renderHistoryModal();
          }
        } catch (error) {
          if (typeof showToast === 'function') showToast(error.message);
        }
      });
    });
  }

  function historyModalElement(handlers = {}) {
    let modal = document.getElementById(HISTORY_MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'pf-history-backdrop';
    modal.id = HISTORY_MODAL_ID;
    modal.hidden = true;
    modal.innerHTML = `
      <div class="pf-history-modal" role="dialog" aria-modal="true" aria-labelledby="pf-history-title">
        <div class="pf-history-head">
          <h4 id="pf-history-title">Historial de operaciones</h4>
          <span class="pf-history-count"></span>
          <button class="pf-history-close" type="button" aria-label="Cerrar">×</button>
        </div>
        <div class="pf-history-filters">
          <label class="pf-history-filter"><span>Tipo</span>
            <select class="pf-input pf-history-filter-type">
              <option value="">Todas</option>
              <option value="buy">Compra</option>
              <option value="sell">Venta</option>
            </select>
          </label>
          <label class="pf-history-filter"><span>Empresa</span>
            <select class="pf-input pf-history-filter-company"><option value="">Todas las empresas</option></select>
          </label>
          <label class="pf-history-filter"><span>Cantidad mínima (acciones)</span>
            <input class="pf-input pf-history-filter-shares" type="number" min="0" step="any" inputmode="decimal" placeholder="Ej. 10">
          </label>
        </div>
        <div class="pf-history-modal-body"></div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeHistoryModal();
    });
    modal.querySelector('.pf-history-close').addEventListener('click', closeHistoryModal);
    modal.querySelector('.pf-history-filter-type').addEventListener('change', () => renderHistoryModal(handlers));
    modal.querySelector('.pf-history-filter-company').addEventListener('change', () => renderHistoryModal(handlers));
    modal.querySelector('.pf-history-filter-shares').addEventListener('input', () => renderHistoryModal(handlers));
    return modal;
  }

  function populateHistoryCompanies(modal, transactions = []) {
    const select = modal.querySelector('.pf-history-filter-company');
    const current = select.value;
    const companies = new Map();
    transactions.forEach((item) => companies.set(item.ticker, item.companyName));
    const escapeHtml = fmt().escapeHtml || ((s) => s);
    select.innerHTML = '<option value="">Todas las empresas</option>' + [...companies.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([ticker, name]) => `<option value="${escapeHtml(ticker)}">${escapeHtml(name)} (${escapeHtml(ticker)})</option>`)
      .join('');
    select.value = [...companies.keys()].includes(current) ? current : '';
  }

  let activeHandlers = {};

  function renderHistoryModal(handlers = activeHandlers) {
    if (handlers) activeHandlers = handlers;
    const modal = document.getElementById(HISTORY_MODAL_ID);
    if (!modal || modal.hidden) return;
    const transactions = activeHandlers.getTransactions ? activeHandlers.getTransactions() : [];
    populateHistoryCompanies(modal, transactions);
    const type = modal.querySelector('.pf-history-filter-type').value;
    const company = modal.querySelector('.pf-history-filter-company').value;
    const minShares = Number(modal.querySelector('.pf-history-filter-shares').value);
    const filtered = transactionsSortedDesc(transactions).filter((item) => {
      if (type && item.type !== type) return false;
      if (company && item.ticker !== company) return false;
      if (Number.isFinite(minShares) && Number(item.shares) < minShares) return false;
      return true;
    });
    modal.querySelector('.pf-history-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'operación' : 'operaciones'}`;
    const body = modal.querySelector('.pf-history-modal-body');
    body.innerHTML = filtered.length
      ? historyTableHtml(filtered, { withDelete: true })
      : '<div class="pf-history-empty">No hay operaciones que coincidan con los filtros.</div>';
    wireDeleteButtons(body, activeHandlers);
  }

  function openHistoryModal(handlers = {}) {
    activeHandlers = handlers;
    const transactions = handlers.getTransactions ? handlers.getTransactions() : [];
    if (!transactions.length) return;
    const modal = historyModalElement(handlers);
    document.body.style.overflow = 'hidden';
    modal.hidden = false;
    renderHistoryModal(handlers);
  }

  function closeHistoryModal() {
    const modal = document.getElementById(HISTORY_MODAL_ID);
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeHistoryModal();
  });

  function historyWidgetHtml(transactions = []) {
    const list = transactionsSortedDesc(transactions);
    const lastTen = list.slice(0, 10);
    return `
      <div class="pf-panel">
        <div class="pf-panel-head">
          <h4>Historial de operaciones</h4>
          <button class="text-button pf-history-open" type="button">Pantalla completa <span>⛶</span></button>
        </div>
        ${historyTableHtml(lastTen, { withDelete: true })}
        <p class="pf-hint">Mostrando las ${lastTen.length} últimas operaciones. Usa «Pantalla completa» para ver todas y filtrarlas por tipo, empresa o cantidad.</p>
      </div>`;
  }

  function wireHistoryWidget(scope, handlers = {}) {
    if (!scope) return;
    scope.querySelectorAll('.pf-history-open').forEach((button) => {
      button.addEventListener('click', () => openHistoryModal(handlers));
    });
    wireDeleteButtons(scope, handlers);
  }

  const PortfolioHistory = {
    HISTORY_MODAL_ID,
    transactionsSortedDesc,
    transactionRowHtml,
    historyTableHtml,
    wireDeleteButtons,
    historyModalElement,
    populateHistoryCompanies,
    renderHistoryModal,
    openHistoryModal,
    closeHistoryModal,
    historyWidgetHtml,
    wireHistoryWidget
  };

  window.PortfolioHistory = PortfolioHistory;
})(window);
