/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;
  const { portfolioLogoHtml } = window.PortfolioDonuts;

  function gruposTabOptions() {
    const pre = PORTFOLIO_PREDEFINED_TABS.map(([key, label]) => ({ type: 'predefined', key, label }));
    const custom = userTabs().map((tab) => ({ type: 'custom', id: tab.id, label: tab.name }));
    return [...pre, ...custom];
  }

  function tabOptionValue(opt) {
    return opt.type === 'predefined' ? `pre:${opt.key}` : `tab:${opt.id}`;
  }

  function selectedTabValue() {
    if (PS.activeTab?.type === 'predefined') return `pre:${PS.activeTab.key}`;
    if (PS.activeTab?.type === 'custom') return `tab:${PS.activeTab.id}`;
    return '';
  }

  function groupPillsForActiveTab() {
    if (PS.activeTab?.type === 'predefined') {
      const seen = new Map();
      let index = 0;
      for (const item of PS.data?.positions ?? []) {
        const label = tabForPosition(item, PS.activeTab.key);
        if (!seen.has(label)) seen.set(label, { id: label, label, count: 0, color: PORTFOLIO_COLORS[index++ % PORTFOLIO_COLORS.length], kind: 'predefined' });
        seen.get(label).count += 1;
      }
      return [...seen.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
    }
    if (PS.activeTab?.type === 'custom') {
      return groupsOfTab(PS.activeTab.id).map((group) => ({
        id: group.id,
        label: group.name,
        count: (group.ruleTickers?.length || 0) + (group.lotTransactionIds?.length || 0),
        color: group.color,
        kind: 'custom',
        groupId: group.id,
      }));
    }
    return [];
  }

  function gruposSectionHtml() {
    const options = gruposTabOptions();
    const selected = selectedTabValue();
    const isCustom = PS.activeTab?.type === 'custom';
    const tab = isCustom ? tabById(PS.activeTab.id) : null;
    const activeTabLabel = PS.activeTab?.type === 'predefined'
      ? (PORTFOLIO_PREDEFINED_TABS.find(([key]) => key === PS.activeTab.key)?.[1] ?? PS.activeTab.key)
      : (tab?.name ?? '');
    const tabsHtml = options.map((opt) => {
      const value = tabOptionValue(opt);
      const active = selected === value;
      const color = opt.type === 'custom' ? (tabById(opt.id)?.color ?? '') : '';
      return `
        <button class="pf-groups-tab ${active ? 'active' : ''}" type="button" data-pf-groups-tab-select="${escapeHtml(value)}"
          role="tab" aria-selected="${active}">
          ${color ? `<span class="pf-g-dot" style="background:${escapeHtml(color)}"></span>` : ''}${escapeHtml(opt.label)}
        </button>`;
    }).join('');
    const viewsHtml = ['current', 'sold', 'all'].map((key) => {
      const label = key === 'current' ? 'Actual' : key === 'sold' ? 'Vendido' : 'Todo';
      return `
        <button class="pf-view-button ${PS.groupsView === key ? 'active' : ''}" type="button"
          data-pf-groups-view="${key}" aria-pressed="${PS.groupsView === key}">${label}</button>`;
    }).join('');
    return `
      <div class="pf-groups-section">
        <div class="pf-card-head">
          <div>
            <h4>Grupos</h4>
            <p>${PS.activeTab
              ? `Pestaña «${escapeHtml(activeTabLabel)}» — pulsa un grupo para ver sus sublíneas.`
              : 'Elige una pestaña arriba para ver sus grupos.'}</p>
          </div>
          <div class="pf-groups-head-actions">
            <button class="pf-outline-button pf-show-all-btn" type="button" data-pf-chart-show-all="grupos" title="Mostrar todos los grupos principales de esta pestaña en el gráfico">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg>
              <span>Mostrar todo</span>
            </button>
            <div class="pf-positions-views" role="group" aria-label="Vista de grupos">${viewsHtml}</div>
            ${isCustom ? `
              <div class="pf-groups-controls">
                <button class="pf-outline-button" type="button" data-pf-tab-edit title="Renombrar o cambiar color">✎</button>
                <button class="pf-outline-button" type="button" data-pf-tab-delete title="Eliminar pestaña">×</button>
              </div>` : ''}
          </div>
        </div>
        <div class="pf-groups-tabs" role="tablist" aria-label="Pestañas de grupos">
          <div class="pf-groups-tab-list">${tabsHtml}</div>
          <div class="pf-groups-tab-actions">
            ${isCustom ? `<button class="pf-outline-button" type="button" data-pf-group-create>${PS.groupFormOpen ? 'Cerrar' : '＋ Crear grupo'}</button>` : ''}
            <button class="pf-outline-button" type="button" data-pf-tab-create>${PS.tabFormOpen ? 'Cerrar' : '＋ Nueva pestaña'}</button>
          </div>
        </div>
        ${PS.tabFormOpen ? tabCreateFormHtml() : ''}
        ${PS.editingTabId ? tabEditFormHtml(tabById(PS.editingTabId)) : ''}
        ${isCustom && PS.groupFormOpen ? groupCreateFormHtml(tab) : ''}
        ${PS.editingGroupId ? groupEditFormHtml(groupById(PS.editingGroupId)) : ''}
        ${gruposTableHtml()}
      </div>`;
  }


  function gruposTableHtml() {
    if (!PS.activeTab) return '<p class="pf-groups-empty">Elige una pestaña arriba para ver sus grupos.</p>';
    const groups = groupPillsForActiveTab();
    if (!groups.length) {
      if (PS.activeTab?.type === 'custom') return '<p class="pf-groups-empty">Esta pestaña aún no tiene grupos. Pulsa «＋ Crear grupo» para crear el primero.</p>';
      return '<p class="pf-groups-empty">No hay posiciones para agrupar por este criterio.</p>';
    }
    return groupRowsTableHtml(groups);
  }

  function groupRowsTableHtml(groups) {
    const summary = PS.data?.summary ?? {};
    const totalValue = Number(summary.totalValue) || 0;
    const items = sortGroupItems(groups.map((group) => ({ group, totals: computeGroupTotals(PS.activeTab, group, PS.groupsView) })));
    const grand = items.reduce((acc, { totals }) => {
      acc.shares += totals.shares;
      acc.cost += totals.cost;
      acc.value += totals.value;
      acc.gain += totals.gain;
      acc.dividends += totals.dividends;
      acc.annual += totals.annual || 0;
      return acc;
    }, { shares: 0, cost: 0, value: 0, gain: 0, dividends: 0, annual: 0 });

    const body = items.map(({ group, totals }) => groupRowHtml(group, totals, totalValue)).join('');

    const grandGainPct = grand.cost > 0 ? (grand.gain / grand.cost) * 100 : null;
    const grandGainWithDiv = grand.gain + grand.dividends;
    const grandGainWithDivPct = grand.cost > 0 ? (grandGainWithDiv / grand.cost) * 100 : null;
    const grandYield = grand.value > 0 ? (grand.annual / grand.value) * 100 : null;
    const grandYoc = grand.cost > 0 ? (grand.annual / grand.cost) * 100 : null;

    const totalsRow = `
      <tr class="pf-broker-totals-row">
        <td></td>
        <td class="pf-broker-company"><strong>Total</strong></td>
        <td>${fmtShares(grand.shares)}</td>
        ${groupsCostCellHtml(grand.cost)}
        ${groupsToggleCellHtml('ganancia', grandGainPct, grand.gain, fmtSigned)}
        ${groupsToggleCellHtml('gananciadiv', grandGainWithDivPct, grandGainWithDiv, fmtSigned)}
        <td>${fmtPct(totalValue > 0 ? (grand.value / totalValue) * 100 : null)}</td>
        ${groupsToggleCellHtml('divpct', grandYield, grand.annual, fmtMoney)}
        ${groupsToggleCellHtml('divyoc', grandYoc, grand.annual, fmtMoney)}
        ${groupsDividendsCellHtml(grand.dividends, grand.shares)}
        <td></td>
      </tr>`;

    const headers = [
      ['valor', 'Grupo', 'Grupo y número de acciones'],
      ['acciones', 'Acciones', 'Número total de acciones del grupo'],
      ['coste', 'Coste', 'Coste total del grupo'],
      ['ganancia', 'Ganancia', 'Ganancia o pérdida (no realizada o realizada según la vista)'],
      ['gananciadiv', 'Gan. + div.', 'Ganancia + dividendos cobrados'],
      ['peso', 'Peso cartera', 'Peso del grupo sobre el valor total de la cartera'],
      ['divpct', 'Div. %', 'Rentabilidad por dividendo sobre el valor actual'],
      ['divyoc', 'Div. YoC', 'Rentabilidad por dividendo sobre el coste'],
      ['divcobrados', 'Div. cobrados', 'Dividendos cobrados (total o por acción)'],
      ['grupos', 'Grupos', 'Grupos a los que pertenece cada acción'],
    ];
    return wrapGroupsTable(headers, body, totalsRow, { wideOpt: true });
  }

  function wrapGroupsTable(headers, rows, totalsRow, { wideOpt = false } = {}) {
    const headerHtml = `<th scope="col" class="pf-expand-head" aria-label="Sublíneas"></th>` + headers.map(([key, label, hint], index) => {
      const active = PS.groupsSortKey === key;
      const mark = active ? (PS.groupsSortDir === 'desc' ? '↓' : '↑') : '↕';
      const toggle = TOGGLEABLE_SORT_KEYS.has(key) && key !== 'coste' ? groupsModeToggleHtml(key) : '';
      return `
        <th scope="col" data-sort-key="${key}" class="${index === 0 ? 'pf-broker-first-head' : ''}${active ? ' pf-sort-active' : ''}" title="${escapeHtml(hint)}">
          ${escapeHtml(label)} ${toggle}<span class="pf-sort-mark">${mark}</span>
        </th>`;
    }).join('');
    const wideClass = wideOpt ? ' pf-table-wide' : '';
    return `
      <div class="table-wrap pf-broker-table-wrap">
        <table class="pf-broker-table pf-g-groups-table${wideClass}">
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${rows}${totalsRow}</tbody>
        </table>
      </div>`;
  }





  function groupRowHtml(group, totals, totalValue) {
    const key = String(group.id);
    const expanded = PS.expandedGroups.has(key);
    const actionCount = groupSublineActions(PS.activeTab, group, PS.groupsView).length;
    const weight = totalValue > 0 ? (totals.value / totalValue) * 100 : null;
    const dividendYield = totals.value > 0 ? (totals.annual / totals.value) * 100 : null;
    const dividendYoc = totals.cost > 0 ? (totals.annual / totals.cost) * 100 : null;
    const gainPercent = totals.cost > 0 ? (totals.gain / totals.cost) * 100 : null;
    const gainWithDividends = totals.gain + totals.dividends;
    const gainWithDividendsPct = totals.cost > 0 ? (gainWithDividends / totals.cost) * 100 : null;
    const editDelete = group.kind === 'custom' ? `
      <button class="pf-g-pill-edit" type="button" data-pf-group-edit="${escapeHtml(group.groupId)}" title="Renombrar o cambiar color" aria-label="Editar grupo ${escapeHtml(group.label)}">✎</button>
      <button class="pf-g-pill-del" type="button" data-pf-group-delete="${escapeHtml(group.groupId)}" title="Eliminar grupo" aria-label="Eliminar grupo ${escapeHtml(group.label)}">×</button>` : '';
    const sublines = groupSublinesHtml(group, expanded);
    const chartId = group.kind === 'custom'
      ? `group:${group.groupId ?? group.id}`
      : `group:pre:${PS.activeTab?.key ?? 'sector'}:${group.label ?? group.id}`;
    return `
      <tr data-pf-group-row="${escapeHtml(key)}" tabindex="0" class="${expanded ? 'pf-row-expanded' : ''}">
        <td class="pf-expand-cell">
          <button class="pf-expand-btn ${expanded ? 'open' : ''}" type="button" data-pf-group-expand="${escapeHtml(key)}"
            aria-expanded="${expanded}" aria-label="Ver sublíneas de ${escapeHtml(group.label)}" title="Ver sublíneas"></button>
        </td>
        <td class="pf-broker-company">
          <span class="pf-g-dot" style="background:${escapeHtml(group.color)}"></span>
           <span class="pf-broker-company-copy">
             <strong>${escapeHtml(group.label)}</strong>
             <small>${actionCount} ${actionCount === 1 ? 'acción' : 'acciones'}</small>
           </span>
           ${chartButtonHtml(chartId)}
           <span class="pf-g-row-actions">${editDelete}</span>
        </td>
        <td>${fmtShares(totals.shares)}</td>
        ${groupsCostCellHtml(totals.cost)}
        ${groupsToggleCellHtml('ganancia', gainPercent, totals.gain, fmtSigned)}
        ${groupsToggleCellHtml('gananciadiv', gainWithDividendsPct, gainWithDividends, fmtSigned)}
        <td>${fmtPct(weight)}</td>
        ${groupsToggleCellHtml('divpct', dividendYield, totals.annual, fmtMoney)}
        ${groupsToggleCellHtml('divyoc', dividendYoc, totals.annual, fmtMoney)}
        ${groupsDividendsCellHtml(totals.dividends, totals.shares)}
        <td class="pf-groups-cell"></td>
      </tr>
      ${sublines}`;
  }

  function groupSublinesHtml(group, expanded = false) {
    const key = String(group.id);
    const actions = groupSublineActions(PS.activeTab, group, PS.groupsView);
    const totalValue = Number(PS.data?.summary?.totalValue) || 0;
    return actions.map(({ item, totals }) => {
      const gainPercent = totals.cost > 0 ? (totals.gain / totals.cost) * 100 : null;
      const gainWithDividends = totals.gain + totals.dividends;
      const gainWithDividendsPct = totals.cost > 0 ? (gainWithDividends / totals.cost) * 100 : null;
      const weight = totalValue > 0 ? (totals.value / totalValue) * 100 : null;
      const dividendYield = totals.value > 0 ? (totals.annual / totals.value) * 100 : null;
      const dividendYoc = totals.cost > 0 ? (totals.annual / totals.cost) * 100 : null;
      return `
        <tr class="pf-lot-row pf-group-subline" data-pf-group-subline="${escapeHtml(key)}" data-ticker="${escapeHtml(item.ticker)}" ${expanded ? '' : 'hidden'}>
          <td class="pf-expand-cell"></td>
          <td class="pf-broker-company">
            ${portfolioLogoHtml(item)}
           <span class="pf-broker-company-copy">
             <strong>${escapeHtml(item.companyName || item.ticker)}</strong>
             <small>${escapeHtml(item.ticker)}</small>
           </span>
           ${chartButtonHtml(`ticker:${item.ticker}`)}
         </td>
          <td>${fmtShares(totals.shares)}</td>
          ${groupsCostCellHtml(totals.cost)}
          ${groupsToggleCellHtml('ganancia', gainPercent, totals.gain, fmtSigned)}
          ${groupsToggleCellHtml('gananciadiv', gainWithDividendsPct, gainWithDividends, fmtSigned)}
          <td>${fmtPct(weight)}</td>
          ${groupsToggleCellHtml('divpct', dividendYield, totals.annual, fmtMoney)}
          ${groupsToggleCellHtml('divyoc', dividendYoc, totals.annual, fmtMoney)}
          ${groupsDividendsCellHtml(totals.dividends, totals.shares)}
          ${groupsCellHtml(item.groups)}
        </tr>`;
    }).join('');
  }
window.gruposTabOptions = gruposTabOptions;
window.tabOptionValue = tabOptionValue;
window.selectedTabValue = selectedTabValue;
window.groupPillsForActiveTab = groupPillsForActiveTab;
window.gruposSectionHtml = gruposSectionHtml;
window.gruposTableHtml = gruposTableHtml;
window.groupRowsTableHtml = groupRowsTableHtml;
window.wrapGroupsTable = wrapGroupsTable;
window.groupRowHtml = groupRowHtml;
window.groupSublinesHtml = groupSublinesHtml;

})(window);
