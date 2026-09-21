/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;

  function tabCreateFormHtml() {
    return `
      <form class="pf-g-form pf-g-form-inline" data-pf-tab-form novalidate>
        <input class="pf-input pf-g-name" type="text" maxlength="40" placeholder="Nombre de la pestaña" aria-label="Nombre de la pestaña" required>
        <input class="pf-input pf-g-color" type="color" value="#2563eb" title="Color de la pestaña" aria-label="Color de la pestaña">
        <button class="primary-button" type="submit">Crear</button>
        <button class="pf-outline-button" type="button" data-pf-g-cancel>Cancelar</button>
      </form>`;
  }

  function tabEditFormHtml(tab) {
    if (!tab) return '';
    return `
      <form class="pf-g-form pf-g-form-inline" data-pf-tab-edit-form novalidate>
        <input class="pf-input pf-g-name" type="text" maxlength="40" value="${escapeHtml(tab.name)}" aria-label="Nombre de la pestaña" required>
        <input class="pf-input pf-g-color" type="color" value="${escapeHtml(tab.color)}" title="Color de la pestaña" aria-label="Color de la pestaña">
        <button class="primary-button" type="submit">Guardar</button>
        <button class="pf-outline-button" type="button" data-pf-g-cancel>Cancelar</button>
      </form>`;
  }

  function groupMembersCheckboxesHtml(positions) {
    return positions.map((item) => {
      const lots = (item.lots ?? []).filter((lot) => (lot.remaining ?? 0) > 0);
      return `
        <div class="pf-g-member-item" data-member-ticker="${escapeHtml(item.ticker)}">
          <label class="pf-g-action-check">
            <input type="checkbox" data-member-kind="ticker" data-ticker="${escapeHtml(item.ticker)}">
            <span>Toda la acción <strong>${escapeHtml(item.ticker)}</strong> — <small>${escapeHtml(item.companyName || '')}</small></span>
          </label>
          <div class="pf-g-sublines">
            ${lots.map((lot) => `
              <label class="pf-g-subline-check">
                <input type="checkbox" data-member-kind="lot" data-transaction-id="${lot.id}" data-ticker="${escapeHtml(item.ticker)}">
                <span>${fmtDate(lot.date)} · ${fmtShares(lot.remaining)} acc · ${fmtPrice(lot.price)}</span>
              </label>`).join('')}
          </div>
        </div>`;
    }).join('');
  }

  function groupCreateFormHtml(tab) {
    const positions = positionsForView('current');
    return `
      <form class="pf-g-form" data-pf-group-form novalidate>
        <div class="pf-g-form-head">
          <span class="pf-g-form-title">Nuevo grupo en «${escapeHtml(tab.name)}»</span>
        </div>
        <div class="pf-g-form-fields">
          <input class="pf-input pf-g-name" type="text" maxlength="40" placeholder="Nombre del grupo" aria-label="Nombre del grupo" required>
          <input class="pf-input pf-g-color" type="color" value="#2563eb" title="Color del grupo" aria-label="Color del grupo">
        </div>
        <div class="pf-g-members">
          <p class="pf-g-members-title">Acciones y sublíneas a añadir:</p>
          <div class="pf-g-members-list">${groupMembersCheckboxesHtml(positions)}</div>
        </div>
        <div class="pf-g-form-actions">
          <button class="primary-button" type="submit">Crear grupo</button>
          <button class="pf-outline-button" type="button" data-pf-g-cancel>Cancelar</button>
        </div>
      </form>`;
  }

  function groupEditFormHtml(group) {
    return `
      <form class="pf-g-form pf-g-form-inline" data-pf-group-edit-form novalidate>
        <input class="pf-input pf-g-name" type="text" maxlength="40" value="${escapeHtml(group.name)}" aria-label="Nombre del grupo" required>
        <input class="pf-input pf-g-color" type="color" value="${escapeHtml(group.color)}" title="Color del grupo" aria-label="Color del grupo">
        <button class="primary-button" type="submit">Guardar</button>
        <button class="pf-outline-button" type="button" data-pf-g-cancel>Cancelar</button>
      </form>`;
  }

  function toggleGroupRow(groupKey, forceExpanded) {
    const key = String(groupKey);
    const isExpanded = PS.expandedGroups.has(key);
    const willExpand = forceExpanded !== undefined ? Boolean(forceExpanded) : !isExpanded;

    if (willExpand) {
      PS.expandedGroups.add(key);
    } else {
      PS.expandedGroups.delete(key);
    }

    const row = PS.sectionRoot?.querySelector(`tr[data-pf-group-row="${CSS.escape(key)}"]`);
    if (!row) return;

    const button = row.querySelector('[data-pf-group-expand]');
    button?.classList.toggle('open', willExpand);
    button?.setAttribute('aria-expanded', String(willExpand));
    row.classList.toggle('pf-row-expanded', willExpand);

    const sublines = PS.sectionRoot?.querySelectorAll(`tr[data-pf-group-subline="${CSS.escape(key)}"]`);
    sublines?.forEach((subline) => {
      subline.hidden = !willExpand;
    });
  }

  function toggleGroupExpanded(key) {
    toggleGroupRow(key);
  }
window.tabCreateFormHtml = tabCreateFormHtml;
window.tabEditFormHtml = tabEditFormHtml;
window.groupMembersCheckboxesHtml = groupMembersCheckboxesHtml;
window.groupCreateFormHtml = groupCreateFormHtml;
window.groupEditFormHtml = groupEditFormHtml;
window.toggleGroupRow = toggleGroupRow;
window.toggleGroupExpanded = toggleGroupExpanded;

})(window);
