/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;
  const { donutSvg } = window.PortfolioDonuts;

  function allocationItems(group = PS.allocationGroup) {
    const positions = PS.data?.positions ?? [];
    const amountFor = (item) => PS.allocationBasis === 'cost' ? Number(item.costBasis) : Number(item.value);
    const groups = new Map();

    for (const item of positions) {
      const amount = amountFor(item);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const { label, labelKey } = allocationGroupLabel(item, group);
      const entry = groups.get(labelKey) ?? { label, labelKey, amount: 0, tickers: [] };
      entry.amount += amount;
      entry.tickers.push(item.ticker);
      groups.set(labelKey, entry);
    }

    const total = [...groups.values()].reduce((sum, entry) => sum + entry.amount, 0);
    return [...groups.values()]
      .sort((a, b) => b.amount - a.amount)
      .map((entry) => ({
        ...entry,
        percent: total > 0 ? (entry.amount / total) * 100 : 0,
      }));
  }

  function trendPct(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const number = Number(value);
    return `${number < 0 ? '↓' : '↑'} ${formatNumber(Math.abs(number), {
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDecimals(number),
    })} %`;
  }

  function doubleValueHtml(primary, secondary, className = '') {
    return `<div class="pf-double-value ${className}"><strong>${primary}</strong><small>${secondary}</small></div>`;
  }

  function allocationPanelHtml() {
    const items = allocationItems();
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    const groupTitle = ALLOCATION_GROUP_TITLES[PS.allocationGroup] ?? ALLOCATION_GROUP_TITLES.company;
    const basisLabel = PS.allocationBasis === 'cost' ? 'Coste de la cartera' : 'Valor de la cartera';
    const colors = new Map(items.map((item, index) => [item.labelKey, PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length]]));
    const legend = items.map((item) => `
      <li class="pf-allocation-legend-item" data-label-key="${escapeHtml(item.labelKey)}">
        <span class="pf-allocation-swatch" style="background:${colors.get(item.labelKey)}"></span>
        <span class="pf-allocation-legend-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
        <strong>${fmtPct(item.percent)}</strong>
      </li>`).join('');

    return `
      <div class="pf-allocation-card">
        <div class="pf-card-head pf-allocation-head">
          <div>
            <h4>${escapeHtml(groupTitle)}</h4>
            <p>Distribución de tu cartera según el ${PS.allocationBasis === 'cost' ? 'coste' : 'valor'} actual.</p>
          </div>
          <div class="pf-allocation-controls">
            <label class="pf-control-toggle">
              <span>Coste</span>
              <button class="pf-switch ${PS.allocationBasis === 'cost' ? 'on' : ''}" type="button"
                data-pf-cost-toggle aria-pressed="${PS.allocationBasis === 'cost'}" title="Calcular sobre el coste en lugar del valor">
                <span></span>
              </button>
            </label>
            <select class="pf-select" data-pf-allocation-mode aria-label="Agrupar la asignación por">
              ${ALLOCATION_GROUPS.map(([key, label]) => `
                <option value="${key}" ${PS.allocationGroup === key ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="pf-allocation-layout">
          <div class="pf-allocation-visual">
            ${donutSvg(items.map((item) => ({ ...item, color: colors.get(item.labelKey) })), {
              className: 'pf-allocation-donut',
              ariaLabel: groupTitle,
            })}
            <div class="pf-allocation-center">
              <span>${escapeHtml(basisLabel)}</span>
              <strong>${fmtMoney(total)}</strong>
            </div>
          </div>
          <ul class="pf-allocation-legend">${legend}</ul>
        </div>
        <div class="pf-card-footer">
          <span class="pf-footer-hint">${window.I18n ? window.I18n.t('El gráfico de evolución y el detalle de cada posición están abajo.') : 'El gráfico de evolución y el detalle de cada posición están abajo.'}</span>
          <button class="pf-footer-link" type="button" data-pf-export>${window.I18n ? window.I18n.t('⇩ Exportar CSV') : '⇩ Exportar CSV'}</button>
        </div>
      </div>`;
  }
window.allocationItems = allocationItems;
window.trendPct = trendPct;
window.doubleValueHtml = doubleValueHtml;
window.allocationPanelHtml = allocationPanelHtml;

})(window);
