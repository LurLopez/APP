/**
 * @fileoverview Panel de dividendos: gráficos, matriz y resumen.
 */

(function (window) {
  const DS = window.PortfolioDividendsState;


  function dividendStackedChartHtml(d) {
    const months = d.ttmStackedMonths || [];
    const maxStackedVal = Math.max(10, ...months.map((m) => m.total || 0));
    const stackedYAxis = dataMod().calcNiceYAxis ? dataMod().calcNiceYAxis(maxStackedVal, 4) : { max: 100 };
    const avg = d.averageMonthly || 0;
    const avgTopPct = Math.max(0, Math.min(100, 100 - (avg / stackedYAxis.max) * 100));

    const barsHtml = months.map((m) => {
      const barHeightPct = Math.min(100, Math.max(2, (m.total / stackedYAxis.max) * 100));
      const segmentsHtml = (m.items || []).map((item) => {
        const segHeightPct = m.total > 0 ? (item.amount / m.total) * 100 : 0;
        return `
          <div class="pf-stacked-seg"
            style="height:${segHeightPct}%; background-color:${item.color};"
            data-seg-name="${escapeHtml(item.name)}"
            data-seg-amount="${fmtEur(item.amount)}"
            data-seg-month="${m.label}">
          </div>`;
      }).reverse().join('');

      return `
        <div class="pf-stacked-col">
          <span class="pf-stacked-top-val">${m.displayTotal}</span>
          <div class="pf-stacked-bar-wrap">
            <div class="pf-stacked-bar" style="height: ${barHeightPct}%;">${segmentsHtml}</div>
          </div>
          <span class="pf-stacked-month-label">${m.label}</span>
        </div>`;
    }).join('');

    return `
      <div class="pf-dividend-card pf-stacked-card">
        <div class="pf-stacked-chart-area">
          ${DS.dividendShowMonthlyAverage ? `
            <div class="pf-stacked-avg-line-wrap" style="top:${avgTopPct}%;">
              <span class="pf-stacked-avg-pill">${fmtEur(avg)}</span>
              <div class="pf-stacked-avg-dashed"></div>
            </div>` : ''}

          <div class="pf-stacked-columns">${barsHtml}</div>
        </div>

        <div class="pf-stacked-footer">
          <label class="pf-stacked-avg-toggle">
            <input type="checkbox" id="pf-stacked-avg-check" ${DS.dividendShowMonthlyAverage ? 'checked' : ''}>
            <span>mostrar promedio mensual de dividendos.</span>
          </label>
        </div>
      </div>`;
  }

  function dividendMatrixHtml(d) {
    const holdings = d.holdings || [];
    const years = [2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];

    const rowsHtml = holdings.map((h) => {
      const yearCellsHtml = years.map((y) => {
        const val = h.years ? h.years[y] : undefined;
        return `<td>${val !== undefined ? fmtEur(val) : '—'}</td>`;
      }).join('');

      return `
        <tr data-ticker="${escapeHtml(h.ticker)}">
          <td class="pf-matrix-sticky-company">
            <div class="pf-broker-company">
              ${portfolioLogoHtml({ ticker: h.ticker, companyName: h.name })}
              <span class="pf-broker-company-copy">
                <strong>${escapeHtml(h.name)}</strong>
                <small>${escapeHtml(h.ticker)}</small>
              </span>
            </div>
          </td>
          <td class="pf-matrix-sticky-sum">
            <span class="pf-matrix-sum-row">
              <span class="pf-matrix-growth-icon" aria-hidden="true">↗</span>
              <strong>${fmtEur(h.sum)}</strong>
            </span>
          </td>
          ${yearCellsHtml}
        </tr>`;
    }).join('');

    return `
      <div class="pf-dividend-card pf-matrix-card">
        <div class="pf-card-head">
          <div>
            <h4>${window.I18n ? window.I18n.t('Matriz de dividendos') : 'Matriz de dividendos'}</h4>
          </div>
        </div>
        <div class="pf-matrix-table-wrap">
          <table class="pf-matrix-table">
            <thead>
              <tr>
                <th class="pf-matrix-sticky-company">${window.I18n ? window.I18n.t('Valor') : 'Valor'}</th>
                <th class="pf-matrix-sticky-sum">${window.I18n ? window.I18n.t('Suma') : 'Suma'}</th>
                ${years.map((y) => `<th>${y}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function dividendSummaryCardsHtml(d) {
    const summary = d.summary || {};
    const cards = d.monthlySummaryCards || [];

    const cardsHtml = cards.map((card) => {
      const paymentRowsHtml = (card.payments || []).map((p) => `
        <div class="pf-month-payment-row" data-ticker="${escapeHtml(p.ticker)}">
          <div class="pf-month-payment-left">
            ${portfolioLogoHtml({ ticker: p.ticker, companyName: p.name })}
            <div class="pf-month-payment-desc">
              <strong>${p.day}. ${escapeHtml(p.name)}</strong>
              <small>${p.shares} x ${fmtEur(p.perShare)}</small>
            </div>
          </div>
          <strong class="pf-month-payment-amount">${fmtEur(p.amount)}</strong>
        </div>
      `).join('');

      return `
        <div class="pf-month-card">
          <div class="pf-month-card-head">
            <div class="pf-month-card-title">
              <strong>${escapeHtml(card.title)}</strong>
              <span class="pf-month-card-count">${window.I18n ? window.I18n.tp(card.paymentCount, '{n} pago', '{n} pagos') : `${card.paymentCount} pagos`}</span>
            </div>
            <strong class="pf-month-card-total">${fmtEur(card.totalAmount)}</strong>
          </div>
          <div class="pf-month-card-body">
            ${paymentRowsHtml}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="pf-dividend-card pf-summary-grid-card">
        <div class="pf-card-head">
          <div>
            <h4>${window.I18n ? window.I18n.t('Resumen de dividendos') : 'Resumen de dividendos'}</h4>
            <p>${window.I18n
              ? window.I18n.t(
                  'Has recibido dividendos brutos de {0} en los últimos 12 meses, distribuidos en {1} pagos y {2} fechas de pago.',
                  { 0: fmtEur(summary.ttmTotal), 1: summary.paymentCount, 2: summary.payDatesCount }
                )
              : `Has recibido dividendos brutos de ${fmtEur(summary.ttmTotal)} en los últimos 12 meses, distribuidos en ${summary.paymentCount} pagos y ${summary.payDatesCount} fechas de pago.`
            }</p>
          </div>
          <div class="pf-summary-head-controls">
            <button class="pf-summary-toggle-btn" type="button" data-div-summary-collapse title="${DS.dividendSummaryCollapsed ? (window.I18n ? window.I18n.t('Expandir') : 'Expandir') : (window.I18n ? window.I18n.t('Plegar') : 'Plegar')}">
              ${DS.dividendSummaryCollapsed ? '⌄' : '⌃'}
            </button>
            <select class="pf-select pf-summary-period-select" data-div-summary-period>
              <option value="TTM" ${DS.dividendSummaryPeriod === 'TTM' ? 'selected' : ''}>TTM</option>
              <option value="2026" ${DS.dividendSummaryPeriod === '2026' ? 'selected' : ''}>2026</option>
              <option value="2025" ${DS.dividendSummaryPeriod === '2025' ? 'selected' : ''}>2025</option>
              <option value="2024" ${DS.dividendSummaryPeriod === '2024' ? 'selected' : ''}>2024</option>
            </select>
          </div>
        </div>

        ${!DS.dividendSummaryCollapsed ? `
          <div class="pf-month-cards-grid">
            ${cardsHtml}
          </div>` : ''}

        <div class="pf-card-footer pf-summary-footer">
          <button class="pf-footer-link pf-export-csv-btn" type="button" data-div-export-csv>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            ${window.I18n ? window.I18n.t('Exportar CSV') : 'Exportar CSV'}
          </button>
        </div>
      </div>`;
  }

  function exportDividendsCsv(pfData) {
    const d = getDividendData(pfData);
    const headers = ['Mes / Periodo', 'Día', 'Empresa', 'Ticker', 'Acciones', 'Dividendo por acción (€)', 'Total cobrado (€)'];
    const rows = [];

    for (const card of d.monthlySummaryCards || []) {
      for (const p of card.payments || []) {
        rows.push([
          card.title,
          p.day,
          p.name,
          p.ticker,
          p.shares,
          p.perShare.toFixed(2).replace('.', ','),
          p.amount.toFixed(2).replace('.', ','),
        ]);
      }
    }

    const csvValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(csvValue).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dividendos-cifra.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function dividendPanelHtml(pfData) {
    const d = getDividendData(pfData);
    return `
      <div class="pf-dividend-dashboard">
        ${dividendDistributionHtml(d)}
        ${dividendStackedChartHtml(d)}
        ${dividendMatrixHtml(d)}
        ${dividendSummaryCardsHtml(d)}
      </div>`;
  }

window.dividendStackedChartHtml = dividendStackedChartHtml;
window.dividendMatrixHtml = dividendMatrixHtml;
window.dividendSummaryCardsHtml = dividendSummaryCardsHtml;
window.exportDividendsCsv = exportDividendsCsv;
window.dividendPanelHtml = dividendPanelHtml;

})(window);
