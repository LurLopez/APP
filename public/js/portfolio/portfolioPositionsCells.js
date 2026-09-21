/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;
  const { portfolioLogoHtml } = window.PortfolioDonuts;

  function positionsForView(view) {
    const all = PS.data?.positions ?? [];
    if (view === 'sold') return all.filter((item) => (item.sharesSold ?? 0) > 0);
    if (view === 'all') return all;
    return all.filter((item) => (item.shares ?? 0) > 0);
  }

  function sortPositions(positions, getters) {
    const getter = getters?.[PS.sortKey];
    if (!getter) return positions;
    const factor = PS.sortDir === 'desc' ? -1 : 1;
    return [...positions].sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      const aNull = va === null || va === undefined || (typeof va === 'number' && !Number.isFinite(va));
      const bNull = vb === null || vb === undefined || (typeof vb === 'number' && !Number.isFinite(vb));
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb, undefined, { sensitivity: 'base' }) * factor;
      }
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  }

  function positionCompanyCell(item, view = 'current') {
    const isSold = view === 'sold';
    const chartId = isSold ? `ticker:${item.ticker}:sell` : `ticker:${item.ticker}:buy`;
    return `
      <td class="pf-broker-company">
        ${portfolioLogoHtml(item)}
        <span class="pf-broker-company-copy">
          <strong>${escapeHtml(item.companyName || item.ticker)}</strong>
          <small>${escapeHtml(item.ticker)}</small>
        </span>
        ${chartButtonHtml(chartId)}
      </td>`;
  }

  function positionExpandCell(item) {
    return `
      <td class="pf-expand-cell">
        <button class="pf-expand-btn" type="button" data-pf-expand aria-expanded="false"
          aria-label="Ver compras y ventas de ${escapeHtml(item.ticker)}" title="Ver compras y ventas"></button>
      </td>`;
  }

  function lotDateCell(date, badge, chartId) {
    return `<td class="pf-lot-date">${fmtDate(date)}${badge ? ` <span class="pf-lot-badge ${badge === 'sell' ? 'sell' : ''}">${escapeHtml(badge)}</span>` : ''}${chartId ? chartButtonHtml(chartId) : ''}</td>`;
  }

  function lotSoldDateCell(lotDate, saleDate, chartId) {
    return `
      <td class="pf-lot-date">
        <span class="pf-lot-date-line">${fmtDate(lotDate)} <span class="pf-lot-badge">Compra</span></span>
        <span class="pf-lot-date-line">${fmtDate(saleDate)} <span class="pf-lot-badge sell">Venta</span></span>
        ${chartId ? chartButtonHtml(chartId) : ''}
      </td>`;
  }

  function titleAmount(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
    return fmtSigned(value);
  }

  function costeCellHtml(costValue, priceValue, key = 'coste') {
    const showTotal = (PS.displayMode[key] ?? TOTAL_MEDIO_DEFAULT[key] ?? 'medio') === 'total';
    const hasCost = costValue !== null && costValue !== undefined && Number.isFinite(Number(costValue));
    const hasPrice = priceValue !== null && priceValue !== undefined && Number.isFinite(Number(priceValue));
    const visible = !hasCost && !hasPrice ? '—' : showTotal ? fmtMoney(costValue) : fmtPrice(priceValue);
    const hover = showTotal ? (hasPrice ? fmtPrice(priceValue) : '') : (hasCost ? fmtMoney(costValue) : '');
    return `<td title="${escapeHtml(hover)}">${visible}</td>`;
  }

  function modeToggleHtml(key) {
    const cfg = TOTAL_MEDIO_TOGGLES[key];
    if (cfg) {
      const showTotal = (PS.displayMode[key] ?? TOTAL_MEDIO_DEFAULT[key] ?? 'medio') === 'total';
      const action = showTotal ? cfg.titleTotal : cfg.titleMedio;
      return `<button class="pf-mode-toggle pf-mode-toggle-text${showTotal ? ' active' : ''}" type="button" data-mode-toggle="${key}"
        title="${action}" aria-label="${action}">${showTotal ? cfg.total : cfg.medio}</button>`;
    }
    const showPct = modeIsPct(key);
    return `<button class="pf-mode-toggle${showPct ? '' : ' active'}" type="button" data-mode-toggle="${key}"
      title="${showPct ? 'Mostrar importe en lugar del %' : 'Mostrar % en lugar del importe'}"
      aria-label="${showPct ? 'Cambiar a importe' : 'Cambiar a porcentaje'}">${showPct ? '%' : '$'}</button>`;
  }

  function toggleCellHtml(key, pct, amount, formatAmount) {
    const showPct = modeIsPct(key);
    const hasValue = amount !== null && amount !== undefined;
    const visible = !hasValue ? '—' : showPct ? fmtSignedPct(pct) : formatAmount(amount);
    const hover = !hasValue ? '' : showPct ? formatAmount(amount) : fmtSignedPct(pct);
    return `<td class="${changeClass(amount)}" title="${escapeHtml(hover)}">${visible}</td>`;
  }
window.positionsForView = positionsForView;
window.sortPositions = sortPositions;
window.positionCompanyCell = positionCompanyCell;
window.positionExpandCell = positionExpandCell;
window.lotDateCell = lotDateCell;
window.lotSoldDateCell = lotSoldDateCell;
window.titleAmount = titleAmount;
window.costeCellHtml = costeCellHtml;
window.modeToggleHtml = modeToggleHtml;
window.toggleCellHtml = toggleCellHtml;

})(window);
