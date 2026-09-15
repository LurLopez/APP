/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;

  function groupPillsHtml(groups) {
    return (groups ?? []).map((group) => `
      <span class="pf-g-pill" title="${escapeHtml(group.name)}">
        <span class="pf-g-dot" style="background:${escapeHtml(group.color)}"></span>${escapeHtml(group.name)}
      </span>`).join('');
  }

  function groupsCellHtml(groups) {
    return `
      <td class="pf-groups-cell">
        <span class="pf-g-pills">${groupPillsHtml(groups)}</span>
        <button class="pf-g-add" type="button" aria-label="Añadir o quitar grupos" title="Añadir o quitar grupos">＋</button>
      </td>`;
  }

  function ensureGroupPopover() {
    if (PS.groupPopover) return PS.groupPopover;
    PS.groupPopover = document.createElement('div');
    PS.groupPopover.className = 'pf-g-popover';
    PS.groupPopover.setAttribute('role', 'dialog');
    PS.groupPopover.setAttribute('aria-label', 'Grupos');
    PS.groupPopover.hidden = true;
    document.body.appendChild(PS.groupPopover);
    return PS.groupPopover;
  }

  function positionGroupPopover() {
    const pop = ensureGroupPopover();
    const trigger = PS.groupPopoverContext?.trigger;
    if (!trigger) return;
    const width = pop.offsetWidth || 270;
    const height = pop.offsetHeight || 320;
    const rect = trigger.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + width > document.documentElement.clientWidth - 8) left = document.documentElement.clientWidth - width - 8;
    if (top + height > document.documentElement.clientHeight - 8) top = rect.top - height - 8;
    pop.style.left = `${Math.max(8, left)}px`;
    pop.style.top = `${Math.max(8, top)}px`;
  }

  function openGroupPopover(trigger, context) {
    closeGroupPopover();
    PS.groupPopoverContext = { ...context, trigger };
    renderGroupPopover();
    const pop = ensureGroupPopover();
    pop.hidden = false;
    positionGroupPopover();
  }

  function closeGroupPopover() {
    if (PS.groupPopover) PS.groupPopover.hidden = true;
    PS.groupPopoverContext = null;
  }

  function renderGroupPopover() {
    const pop = ensureGroupPopover();
    const context = PS.groupPopoverContext;
    if (!context) return;
    const groups = userGroups();
    const isLot = context.scope === 'lot';
    const title = isLot ? `Lote · ${fmtDate(context.date)}` : `Acción · ${context.ticker}`;
    const rows = groups.map((group) => {
      const byRule = (group.ruleTickers ?? []).includes(context.ticker);
      const member = isLot ? byRule || (group.lotTransactionIds ?? []).includes(context.buyId) : byRule;
      const disabled = isLot && byRule;
      const hint = disabled ? `Viene del grupo de la acción ${context.ticker}. Quítalo desde la fila de la acción.` : '';
      return `
        <div class="watch-popover-row pf-g-popover-row ${member ? 'checked' : ''}${disabled ? ' disabled' : ''}"
          data-group-id="${group.id}" data-member="${member}" data-disabled="${disabled}" role="checkbox"
          aria-checked="${member}" tabindex="${disabled ? -1 : 0}" title="${escapeHtml(hint)}">
          <span class="watch-popover-check" aria-hidden="true">${member ? '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>' : ''}</span>
          <span class="pf-g-dot" style="background:${escapeHtml(group.color)}"></span>
          <span class="watch-popover-name">${escapeHtml(group.name)}</span>
          <span class="watch-popover-count">${(group.ruleTickers?.length || 0) + (group.lotTransactionIds?.length || 0)}</span>
        </div>`;
    }).join('');
    pop.innerHTML = `
      <div class="watch-popover-head">
        <div><strong>Grupos</strong><span class="watch-popover-sub">${escapeHtml(title)}</span></div>
        <button class="watch-popover-close" type="button" aria-label="Cerrar">×</button>
      </div>
      <div class="watch-popover-list">
        ${groups.length ? rows : '<div class="watch-popover-empty">Aún no hay grupos. Crea una pestaña y un grupo debajo de la tabla.</div>'}
      </div>`;
    pop.querySelector('.watch-popover-close').addEventListener('click', closeGroupPopover);
    pop.querySelectorAll('.pf-g-popover-row').forEach((row) => {
      if (row.dataset.disabled === 'true') return;
      row.addEventListener('click', () => toggleGroupMember(row));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleGroupMember(row);
        }
      });
    });
  }

  async function toggleGroupMember(row) {
    const context = PS.groupPopoverContext;
    if (!context) return;
    const groupId = Number(row.dataset.groupId);
    const wasMember = row.dataset.member === 'true';
    const method = wasMember ? 'DELETE' : 'POST';
    try {
      await api(`/api/portfolio/groups/${groupId}/members`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context.scope === 'lot' ? { transactionId: context.buyId } : { ticker: context.ticker }),
      });
      showToast?.(wasMember ? 'Quitado del grupo.' : 'Añadido al grupo.');
      closeGroupPopover();
      await refresh();
    } catch (error) {
      showToast?.(error.message);
    }
  }
window.groupPillsHtml = groupPillsHtml;
window.groupsCellHtml = groupsCellHtml;
window.ensureGroupPopover = ensureGroupPopover;
window.positionGroupPopover = positionGroupPopover;
window.openGroupPopover = openGroupPopover;
window.closeGroupPopover = closeGroupPopover;
window.renderGroupPopover = renderGroupPopover;
window.toggleGroupMember = toggleGroupMember;

})(window);
