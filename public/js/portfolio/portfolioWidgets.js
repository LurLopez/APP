/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell, netDividends } = window.PortfolioFormatting;

  function historyWidgetHtml() {
    return window.PortfolioHistory.historyWidgetHtml(PS.data?.transactions ?? []);
  }

  function wireHistoryWidget(scope) {
    window.PortfolioHistory.wireHistoryWidget(scope, {
      getTransactions: () => PS.data?.transactions ?? [],
      refresh,
      showToast: (msg) => (typeof showToast === 'function' ? showToast(msg) : window.showToast?.(msg))
    });
  }

  function renderSummaryCards() {
    const s = PS.data?.summary ?? {};
    const returnClass = Number(s.totalReturnPct) < 0 ? 'negative' : 'positive';
    const prefs = PS.data?.userPreferences ?? {};
    const netEnabled = Boolean(prefs.dividendNetEnabled);
    const withholdingPct = Number.isFinite(Number(prefs.dividendWithholdingPct)) ? Number(prefs.dividendWithholdingPct) : 20;
    const grossDividends = Number(s.projectedAnnualDividends) || 0;
    const netValue = netEnabled ? netDividends(grossDividends, withholdingPct) : grossDividends;
    return `
      <div class="pf-metric-strip">
        <article class="pf-metric-card pf-metric-card-interactive" data-pf-value-chart-toggle role="button" tabindex="0" title="Ver la evolución del valor de la cartera y aportaciones a pantalla completa" aria-label="Ver la evolución del valor de la cartera y aportaciones a pantalla completa">
          <div class="pf-metric-label">
            <span>Valor de la cartera <i title="Valor actual de todas tus posiciones">i</i></span>
          </div>
          <div class="pf-metric-value-row">
            <strong>${fmtMoney(s.totalValue)}</strong>
            <span class="pf-metric-trend ${returnClass}">${trendPct(s.totalReturnPct)}</span>
          </div>
        </article>
        <article class="pf-metric-card">
          <div class="pf-metric-label"><span>Rentabilidad por dividendo de la cartera <i title="Dividendos anuales previstos divididos por el valor actual">i</i></span></div>
          <div class="pf-metric-value-row"><strong>${fmtPct(s.dividendYield)}</strong></div>
          <span class="pf-metric-action" aria-hidden="true">⇄</span>
        </article>
        <article class="pf-metric-card">
          <div class="pf-metric-label">
            <span>Dividendos anuales ${netEnabled ? 'netos' : 'brutos'} previstos <i title="${netEnabled ? `Después de aplicar una retención del ${withholdingPct} %` : 'Antes de impuestos y retenciones'}">i</i></span>
            <div class="pf-net-controls">
              <label class="pf-net-toggle" title="Calcular los dividendos después de la retención">
                <span>Neto</span>
                <button class="pf-switch ${netEnabled ? 'on' : ''}" type="button" role="switch" aria-checked="${netEnabled}" aria-label="Mostrar dividendos netos" data-pf-net-toggle><span></span></button>
              </label>
              <label class="pf-net-pct ${netEnabled ? '' : 'is-hidden'}" title="Porcentaje de retención aplicado al calcular el neto">
                <span class="pf-net-pct-sign">−</span>
                <input class="pf-net-pct-input" type="number" min="0" max="100" step="0.5" inputmode="decimal" value="${withholdingPct}" data-pf-net-pct aria-label="Porcentaje de retención de dividendos" />
                <span class="pf-net-pct-sign">%</span>
              </label>
            </div>
          </div>
          <div class="pf-metric-value-row">
            <strong>${fmtMoney(netValue)}</strong>
            ${netEnabled ? `<span class="pf-metric-net-note" title="Importe bruto antes de retención">bruto ${fmtMoney(grossDividends)}</span>` : ''}
          </div>
        </article>
      </div>`;
  }

  function createTooltip() {
    let tooltip = document.querySelector('#pf-chart-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'pf-chart-tooltip';
      tooltip.className = 'pf-chart-tooltip';
      tooltip.hidden = true;
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }

  function exportPortfolioCsv() {
    const view = PS.positionsView;
    const positions = positionsForView(view);
    const base = (item) => [item.companyName, item.ticker, item.sector, item.type, item.country, item.region];
    let headers;
    let rows;
    if (view === 'sold') {
      headers = ['Empresa', 'Ticker', 'Sector', 'Tipo', 'País', 'Región', 'Vendidas', 'Coste', 'Ingresos venta', 'Ganancia realizada', 'Ganancia + div.', 'Div. cobrados'];
      rows = positions.map((item) => [
        ...base(item),
        item.sharesSold,
        (Number(item.soldProceeds) || 0) - (Number(item.realizedGross) || 0),
        item.soldProceeds,
        item.realizedGross,
        (Number(item.realizedGross) || 0) + (Number(item.dividendsTotal) || 0),
        item.dividendsTotal,
      ]);
    } else if (view === 'all') {
      headers = ['Empresa', 'Ticker', 'Sector', 'Tipo', 'País', 'Región', 'Estado', 'Acciones', 'Coste', 'No real.', 'No real. + div.', 'Real.', 'Real. + div.', 'Total'];
      rows = positions.map((item) => {
        const held = (item.shares ?? 0) > 0;
        const sold = (item.sharesSold ?? 0) > 0;
        return [
          ...base(item),
          !held && sold ? 'Vendida' : held && sold ? 'Vendida parcial' : 'En cartera',
          (Number(item.shares) || 0) + (Number(item.sharesSold) || 0),
          item.totalInvested,
          held ? item.unrealizedGross : null,
          held ? item.unrealizedWithDividends : null,
          sold ? item.realizedGross : null,
          sold ? (Number(item.realizedGross) || 0) + (Number(item.dividendsTotal) || 0) : null,
          item.totalReturn,
        ];
      });
    } else {
      headers = ['Empresa', 'Ticker', 'Sector', 'Tipo', 'País', 'Región', 'Acciones', 'Coste', 'Mercado', 'Ganancia', 'Mercado %', 'Dividendo %', 'Dividendo YoC', 'Dividendos anuales'];
      rows = positions.map((item) => {
        const value = Number(item.value);
        const cost = Number(item.costBasis);
        const annual = Number(item.projectedAnnualDividends) || 0;
        return [
          ...base(item),
          item.shares,
          item.costBasis,
          item.value,
          item.unrealizedGross,
          PS.data.summary.totalValue > 0 ? (value / PS.data.summary.totalValue) * 100 : null,
          value > 0 ? (annual / value) * 100 : null,
          cost > 0 ? (annual / cost) * 100 : null,
          annual,
        ];
      });
    }
    const csvValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(csvValue).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cartera-cifra.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function getDividendData() {
    return window.PortfolioDividendsData.getDividendData(PS.data);
  }

  function dividendPanelHtml() {
    return window.PortfolioDividends.dividendPanelHtml(PS.data);
  }

  function wireDividendDashboard(scope) {
    window.PortfolioDividends.wireDividendDashboard(scope, {
      renderSection,
      onNavigate: (ticker) => PS.sectionOptions.onNavigate?.(ticker),
      getData: () => PS.data
    });
  }

  function calendarPanelHtml() {
    return window.PortfolioCalendar.calendarPanelHtml(PS.data);
  }

  function wireCalendarDashboard(scope) {
    window.PortfolioCalendar.wireCalendarDashboard(scope, {
      renderCalendarView: () => {
        if (PS.calendarSectionRoot) renderCalendarSection();
        else if (PS.sectionRoot) renderSection();
      },
      onNavigate: (ticker) => (PS.calendarSectionOptions.onNavigate || PS.sectionOptions.onNavigate || window.goToCompany)?.(ticker),
      getData: () => PS.data,
      hasPosition,
      refresh
    });
  }
window.historyWidgetHtml = historyWidgetHtml;
window.wireHistoryWidget = wireHistoryWidget;
window.renderSummaryCards = renderSummaryCards;
window.createTooltip = createTooltip;
window.exportPortfolioCsv = exportPortfolioCsv;
window.getDividendData = getDividendData;
window.dividendPanelHtml = dividendPanelHtml;
window.wireDividendDashboard = wireDividendDashboard;
window.calendarPanelHtml = calendarPanelHtml;
window.wireCalendarDashboard = wireCalendarDashboard;

})(window);
