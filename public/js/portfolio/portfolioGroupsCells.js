/**
 * @fileoverview Módulo extraído de portfolioGroupsSection.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;

  function groupsModeToggleHtml(key) {
    const cfg = TOTAL_MEDIO_TOGGLES[key];
    if (cfg) {
      const showTotal = (PS.groupsDisplayMode[key] ?? TOTAL_MEDIO_DEFAULT[key] ?? 'medio') === 'total';
      const action = showTotal ? cfg.titleTotal : cfg.titleMedio;
      return `<button class="pf-mode-toggle pf-mode-toggle-text${showTotal ? ' active' : ''}" type="button" data-groups-mode-toggle="${key}"
        title="${action}" aria-label="${action}">${showTotal ? cfg.total : cfg.medio}</button>`;
    }
    const showPct = groupsModeIsPct(key);
    return `<button class="pf-mode-toggle${showPct ? '' : ' active'}" type="button" data-groups-mode-toggle="${key}"
      title="${showPct ? 'Mostrar importe en lugar del %' : 'Mostrar % en lugar del importe'}"
      aria-label="${showPct ? 'Cambiar a importe' : 'Cambiar a porcentaje'}">${showPct ? '%' : '$'}</button>`;
  }

  function groupsCostCellHtml(cost) {
    const hasCost = cost !== null && cost !== undefined && Number.isFinite(Number(cost));
    return `<td>${hasCost ? fmtMoney(cost) : '—'}</td>`;
  }

  function groupsDividendsCellHtml(dividends, shares) {
    const hasValue = dividends !== null && dividends !== undefined && Number.isFinite(Number(dividends));
    if (!hasValue) return '<td>—</td>';
    const showTotal = (PS.groupsDisplayMode.divcobrados ?? 'total') === 'total';
    const perShare = (Number(shares) || 0) > 0 ? dividends / Number(shares) : null;
    const visible = showTotal ? fmtMoney(dividends) : fmtMoney(perShare);
    const hover = showTotal ? (perShare != null ? fmtMoney(perShare) : '') : fmtMoney(dividends);
    return `<td title="${escapeHtml(hover)}">${visible}</td>`;
  }

  function groupsToggleCellHtml(key, pct, amount, formatAmount) {
    const showPct = groupsModeIsPct(key);
    const hasValue = amount !== null && amount !== undefined;
    const visible = !hasValue ? '—' : showPct ? fmtSignedPct(pct) : formatAmount(amount);
    const hover = !hasValue ? '' : showPct ? formatAmount(amount) : fmtSignedPct(pct);
    return `<td class="${changeClass(amount)}" title="${escapeHtml(hover)}">${visible}</td>`;
  }

  function groupSublineActions(tab, group, view) {
    const byTicker = new Map();
    for (const unit of groupUnits(tab, group, view)) {
      const ticker = unit.item.ticker;
      const entry = byTicker.get(ticker) ?? { item: unit.item, units: [] };
      entry.units.push(unit);
      byTicker.set(ticker, entry);
    }
    return [...byTicker.values()].map(({ item, units }) => ({ item, totals: aggregateUnits(units), units }));
  }
window.groupsModeToggleHtml = groupsModeToggleHtml;
window.groupsCostCellHtml = groupsCostCellHtml;
window.groupsDividendsCellHtml = groupsDividendsCellHtml;
window.groupsToggleCellHtml = groupsToggleCellHtml;
window.groupSublineActions = groupSublineActions;

})(window);
