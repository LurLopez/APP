/**
 * @fileoverview Render de la ficha de empresa y del screener (extraído de empresa.js).
 */

(function (window) {
  const { formatProfileNumber, formatProfilePrice, formatProfileCompactUsd, formatProfileCompactCount, formatProfilePercent, formatProfileDate, periodDateLabel, updateCompanySeoMeta } = window.EmpresaFormatting || {};
  const { renderValuation } = window.EmpresaValuationCards || {};
  const { rowYear, screenerVisibleIndexes, filterEmptyStatementItems, renderStatementTable } = window.EmpresaStatements || {};
  const { renderMetricsChart, syncMarginSelector, metricsChartRows, resetComparison } = window.EmpresaMetricsChart || {};

function renderCompany(data) {
  screenerYearMin = null;
  screenerYearMax = null;
  window.EmpresaMetricsChart?.resetComparison?.();
  companyData = data;
  window.companyData = data;
  companyAuthenticated = data.authenticated === true;
  if (companyAuthenticated) {
    Watchlists?.setAuthenticated?.(true);
    Portfolio?.setAuthenticated?.(true);
  }
  const company = data.company ?? {};
  const profile = data.profile ?? {};
  const market = profile.market ?? {};
  const metrics = profile.metrics ?? {};
  const info = profile.info ?? {};

  updateCompanySeoMeta(data);
  const companyLogo = (company.name ?? companyTicker).slice(0, 1).toUpperCase();
  renderCompanyLogo(document.querySelector('#company-logo'), company.ticker ?? companyTicker, companyLogo);
  document.querySelector('#company-name').textContent = company.name ?? '—';
  document.querySelector('#company-meta').textContent = `· ${info.exchange ?? market.exchange ?? '—'} · ${info.industry ?? info.sector ?? '—'}`;
  document.querySelector('#company-ticker-chip').textContent = `🇺🇸 ${company.ticker ?? companyTicker}`;

  const sidebarHead = document.querySelector('#sidebar-company-head');
  renderCompanyLogo(document.querySelector('#sidebar-company-logo'), company.ticker ?? companyTicker, companyLogo);
  document.querySelector('#sidebar-company-name').textContent = company.name ?? '—';
  document.querySelector('#sidebar-company-ticker').textContent = company.ticker ?? companyTicker;
  sidebarHead.hidden = false;

  const price = Number(market.price);
  const change = Number(market.change);
  const changePercent = Number(market.changePercent);
  const hasPrice = Number.isFinite(price);
  const hasChange = Number.isFinite(change) && Number.isFinite(changePercent);
  const isPositive = hasChange ? change >= 0 : true;

  defaultQuoteState = {
    price: hasPrice ? price : null,
    change: hasChange ? change : null,
    changePercent: hasChange ? changePercent : null,
    dateText: market.marketTime ? `Actualizado ${formatProfileDate(market.marketTime)}` : 'Cotización en directo',
    isPositive,
  };
  restoreQuoteDisplay();

  const sparkline = document.querySelector('#quote-sparkline');
  if (sparkline) sparkline.classList.toggle('negative', !isPositive);
  renderQuoteSparkline(market.sparkline);

  document.querySelector('#pf-market-cap').textContent = formatProfileCompactUsd(metrics.marketCap);
  document.querySelector('#pf-week-range').textContent = Number.isFinite(Number(metrics.week52Low)) && Number.isFinite(Number(metrics.week52High))
    ? `${formatProfileNumber(metrics.week52Low)} - ${formatProfileNumber(metrics.week52High)} $`
    : '—';
  document.querySelector('#pf-beta').textContent = formatProfileNumber(metrics.beta);
  document.querySelector('#pf-dividend').textContent = metrics.dividendPerShare !== null && metrics.dividendPerShare !== undefined
    ? `${formatProfileNumber(metrics.dividendPerShare)} (${formatProfilePercent(metrics.dividendYield)})`
    : '—';
  document.querySelector('#pf-next-earnings').textContent = '—';
  document.querySelector('#pf-volume').textContent = formatProfileCompactCount(metrics.volume);
  document.querySelector('#pf-revenue').textContent = formatProfileCompactUsd(metrics.revenue);
  document.querySelector('#pf-eps').textContent = metrics.eps !== null && metrics.eps !== undefined ? formatProfileNumber(metrics.eps) : '—';
  document.querySelector('#pf-pe').textContent = metrics.peRatio === null || metrics.peRatio === undefined || Number(metrics.peRatio) <= 0 ? '—' : formatProfileNumber(metrics.peRatio);
  document.querySelector('#pf-day-range').textContent = Number.isFinite(Number(metrics.dayLow)) && Number.isFinite(Number(metrics.dayHigh))
    ? `${formatProfileNumber(metrics.dayLow)} - ${formatProfileNumber(metrics.dayHigh)} $`
    : '—';
  document.querySelector('#pf-shares').textContent = formatProfileCompactCount(metrics.shares);
  document.querySelector('#pf-year-change').textContent = formatProfilePercent(metrics.yearChangePercent, true);
  document.querySelector('#pf-previous-close').textContent = formatProfilePrice(metrics.previousClose);
  document.querySelector('#pf-ipo-date').textContent = formatProfileDate(metrics.ipoDate);
  document.querySelector('#pf-address').textContent = info.address ?? '—';

  document.querySelector('#pf-country').textContent = info.country ?? '—';
  document.querySelector('#pf-sector').textContent = info.sector ?? '—';
  document.querySelector('#pf-industry').textContent = info.industry ?? '—';
  document.querySelector('#pf-exchange').textContent = info.exchange ?? market.exchange ?? '—';
  document.querySelector('#pf-rivals').textContent = '—';
  const isEn = window.I18n?.getLanguage?.() === 'en' || window.location.pathname === '/en' || window.location.pathname.startsWith('/en/');
  if (isEn) {
    const exchange = info.exchange ?? market.exchange ?? null;
    const descParts = [
      exchange ? `${data.company?.name || 'The company'} is listed on ${exchange}.` : `${data.company?.name || 'The company'} is a publicly traded company.`,
      info.industry && info.industry !== '—' ? `Classified by the SEC in ${info.industry.toLowerCase()}.` : null,
      info.address && info.address !== '—' ? `Registered address: ${info.address}.` : null,
    ].filter(Boolean);
    document.querySelector('#pf-description').textContent = descParts.length ? descParts.join(' ') : 'No public description available.';
  } else {
    document.querySelector('#pf-description').textContent = profile.description || 'No hay descripción pública disponible.';
  }

  renderValuation(data);
}

function renderScreenerTables() {
  if (!companyData) return;
  const rows = [...(companyData[screenerSeries] ?? [])].reverse();
  const visibleIndexes = screenerVisibleIndexes(rows);
  syncScreenerRange();
  const statements = companyData.statements ?? {};
  const title = document.querySelector('#screener-table-title');
  const statementNames = {
    valuation: window.I18n ? window.I18n.t('Valoración') : 'Valoración',
    favorites: window.I18n ? window.I18n.t('Favoritos') : 'Favoritos',
    income: window.I18n ? window.I18n.t('Cuenta de resultados') : 'Cuenta de resultados',
    balance: window.I18n ? window.I18n.t('Balance de situación') : 'Balance de situación',
    cashflow: window.I18n ? window.I18n.t('Estado de Flujo de Efectivo') : 'Estado de Flujo de Efectivo',
  };
  const defTitle = window.I18n ? window.I18n.t('Estado financiero') : 'Estado financiero';
  title.textContent = `${statementNames[screenerStatement] ?? defTitle} | Cifra`;
  const range = document.querySelector('#screener-period-range');
  range.textContent = visibleIndexes.length
    ? (window.I18n
        ? window.I18n.t('Datos financieros de {0} a {1}', { '0': periodDateLabel(rows[visibleIndexes[visibleIndexes.length - 1]]), '1': periodDateLabel(rows[visibleIndexes[0]]) })
        : `Datos financieros de ${periodDateLabel(rows[visibleIndexes[visibleIndexes.length - 1]])} a ${periodDateLabel(rows[visibleIndexes[0]])}`)
    : (window.I18n ? window.I18n.t('Sin periodos visibles') : 'Sin periodos visibles');

  const valSummaryBlock = document.querySelector('#val-summary-block');
  if (valSummaryBlock) {
    valSummaryBlock.hidden = screenerStatement !== 'valuation';
    if (screenerStatement === 'valuation') {
      renderValuation(companyData);
    }
  }
  const valChartBlock = document.querySelector('#val-chart-block');
  if (valChartBlock) {
    valChartBlock.hidden = screenerStatement !== 'valuation';
    if (screenerStatement === 'valuation') {
      if (!valChartRequested) {
        valChartRequested = true;
        loadValuationChart(valChartRange);
      } else {
        renderValuationChart();
      }
    }
  }

  /* Ocultar tabla por años y slider de rango en pestaña Valoración */
  const screenerBlock = document.querySelector('#screener-block');
  const screenerRange = document.querySelector('#screener-range');
  const isValuation = screenerStatement === 'valuation';
  if (screenerBlock) screenerBlock.hidden = isValuation;
  if (screenerRange) screenerRange.hidden = isValuation;

  const marginsBar = document.querySelector('#screener-margins-bar');
  if (marginsBar) screenerStatement === 'income' ? (marginsBar.hidden = false) : (marginsBar.hidden = true);

  if (isValuation) {
    renderMetricsChart();
    return;
  }

  if (screenerStatement === 'favorites') {
    const favoriteItems = window.EmpresaFavoriteMetrics?.buildFavoriteItems?.(statements)
      ?? [{ kind: 'note', label: 'Aún no tienes métricas favoritas. Pulsa el corazón de cualquier fila para guardarla aquí y verla en el gráfico.' }];
    renderStatementTable(rows, visibleIndexes, favoriteItems);
    renderMetricsChart();
    syncMarginSelector();
    return;
  }

  const items = statements[screenerStatement] ?? [];
  const visibleItems = screenerHideEmpty
    ? filterEmptyStatementItems(items, rows, visibleIndexes)
    : items;
  renderStatementTable(rows, visibleIndexes, visibleItems);
  renderMetricsChart();
  syncMarginSelector();
}

function syncScreenerRange() {
  const control = document.querySelector('#screener-range');
  const rows = metricsChartRows();
  const years = rows.map(rowYear).filter((year) => year !== null);
  if (years.length < 2) {
    control.hidden = true;
    return;
  }
  control.hidden = false;
  const low = Math.min(...years);
  const high = Math.max(...years);
  const minInput = document.querySelector('#screener-range-min');
  const maxInput = document.querySelector('#screener-range-max');
  minInput.min = low;
  minInput.max = high;
  maxInput.min = low;
  maxInput.max = high;
  if (screenerYearMin === null) screenerYearMin = Math.max(low, high - 9);
  if (screenerYearMax === null) screenerYearMax = high;
  minInput.value = screenerYearMin;
  maxInput.value = screenerYearMax;
  document.querySelector('#screener-range-values').textContent = `${screenerYearMin} – ${screenerYearMax}`;
  const span = high - low;
  const pctMin = span > 0 ? ((screenerYearMin - low) / span) * 100 : 0;
  const pctMax = span > 0 ? ((screenerYearMax - low) / span) * 100 : 100;
  document.querySelector('#screener-range-track').style.background = `linear-gradient(to right, #e2e2e2 0%, #e2e2e2 ${pctMin}%, var(--accent) ${pctMin}%, var(--accent) ${pctMax}%, #e2e2e2 ${pctMax}%, #e2e2e2 100%)`;
}

function renderCompanyWatchState() {
  const button = document.querySelector('#company-watch');
  if (!button || !companyTicker) return;
  const tracked = Watchlists.isInAnyList(companyTicker);
  button.classList.toggle('active', tracked);
  button.setAttribute('aria-label', tracked
    ? `${companyTicker} está en tus listas de seguimiento`
    : `Añadir ${companyTicker} a listas de seguimiento`);
}

window.renderCompany = renderCompany;
window.renderScreenerTables = renderScreenerTables;
window.syncScreenerRange = syncScreenerRange;
window.renderCompanyWatchState = renderCompanyWatchState;

})(window);
