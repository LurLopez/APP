/**
 * @fileoverview Módulo extraído de portfolio.js.
 */

(function (window) {
  const PS = window.PortfolioState; const { escapeHtml, formatNumber, maxDecimals, fmtMoney, fmtSigned, fmtPct, fmtSignedPct, fmtShares, fmtPrice, fmtDate, fmtEur, fmtEurInt, changeClass, cell } = window.PortfolioFormatting;

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
    return `
      <div class="pf-metric-strip">
        <article class="pf-metric-card">
          <div class="pf-metric-label">
            <span>Valor de la cartera <i title="Valor actual de todas tus posiciones">i</i></span>
            <select class="pf-period-select" aria-label="Periodo de la cartera">
              <option>MAX</option><option>1A</option><option>YTD</option>
            </select>
          </div>
          <div class="pf-metric-value-row">
            <strong>${fmtMoney(s.totalValue)}</strong>
            <span class="pf-metric-trend ${returnClass}">${trendPct(s.totalReturnPct)}</span>
          </div>
          <span class="pf-metric-action" aria-hidden="true">⇄</span>
        </article>
        <article class="pf-metric-card">
          <div class="pf-metric-label"><span>Rentabilidad por dividendo de la cartera <i title="Dividendos anuales previstos divididos por el valor actual">i</i></span></div>
          <div class="pf-metric-value-row"><strong>${fmtPct(s.dividendYield)}</strong></div>
          <span class="pf-metric-action" aria-hidden="true">⇄</span>
        </article>
        <article class="pf-metric-card">
          <div class="pf-metric-label"><span>Dividendos anuales brutos previstos</span><label class="pf-net-toggle"><span>Neto</span><button class="pf-switch" type="button" disabled title="El cálculo neto estará disponible próximamente"><span></span></button></label></div>
          <div class="pf-metric-value-row"><strong>${fmtMoney(s.projectedAnnualDividends)}</strong></div>
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
