/**
 * @fileoverview Arranque y cableado de la página de empresa (extraído de empresa.js).
 */

(function (window) {

function bootEmpresa() {
window.companyTicker = companyTicker;
window.companyData = companyData;
window.chartPoints = chartPoints;
Object.defineProperty(window, 'screenerYearMin', {
  get: () => screenerYearMin,
  set: (v) => { screenerYearMin = v; },
  configurable: true,
});
Object.defineProperty(window, 'screenerYearMax', {
  get: () => screenerYearMax,
  set: (v) => { screenerYearMax = v; },
  configurable: true,
});
Object.defineProperty(window, 'screenerSeries', {
  get: () => screenerSeries,
  set: (v) => { screenerSeries = v; },
  configurable: true,
});
Object.defineProperty(window, 'screenerStatement', {
  get: () => screenerStatement,
  set: (v) => { screenerStatement = v; },
  configurable: true,
});
Object.defineProperty(window, 'screenerPrecision', {
  get: () => screenerPrecision,
  set: (v) => { screenerPrecision = v; },
  configurable: true,
});
Object.defineProperty(window, 'companyAuthenticated', {
  get: () => companyAuthenticated,
  set: (v) => { companyAuthenticated = v; },
  configurable: true,
});
window.valPeAdjusted = valPeAdjusted;
document.querySelector('#val-pe-adjusted-toggle')?.addEventListener('change', (e) => setPeAdjusted(e.target.checked));
document.querySelector('#val-chart-adjusted-checkbox')?.addEventListener('change', (e) => setPeAdjusted(e.target.checked));
document.querySelector('#val-payout-adjusted-toggle')?.addEventListener('change', (e) => setPeAdjusted(e.target.checked));
document.querySelectorAll('.val-chart-metrics button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.val-chart-metrics button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    valChartMetric = button.dataset.vmetric;
    valSliceStart = 0;
    valSliceEnd = Math.max(0, valChartPoints.length - 1);
    const sparkEl = document.querySelector('#val-timeline-sparkline');
    if (sparkEl) sparkEl.innerHTML = '';
    renderValuationChart();
  });
});
document.querySelectorAll('.val-chart-ranges button').forEach((button) => {
  button.addEventListener('click', () => {
    loadValuationChart(button.dataset.vrange);
  });
});
wireValuationChartInteractions();
document.addEventListener('keydown', (event) => {
  if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
  if (event.key === 'f' || event.key === 'F') {
    const valBlock = document.querySelector('#val-chart-block');
    const isValActive = valBlock && !valBlock.hidden && (valBlock.matches(':hover') || valBlock.classList.contains('is-fullscreen') || document.fullscreenElement === valBlock);
    if (isValActive) {
      event.preventDefault();
      toggleFullscreen(valBlock);
      return;
    }
    const chartBlock = document.querySelector('#company-chart-block') || document.querySelector('.chart-block');
    if (chartBlock) {
      event.preventDefault();
      toggleFullscreen(chartBlock);
    }
  } else if (event.key === 'Escape') {
    const valBlock = document.querySelector('#val-chart-block');
    if (valBlock && (valBlock.classList.contains('is-fullscreen') || document.fullscreenElement === valBlock)) {
      toggleFullscreen(valBlock);
    }
  }
});
document.addEventListener('fullscreenchange', () => {
  requestAnimationFrame(() => {
    renderPriceChart();
    renderValuationChart();
  });
  setTimeout(() => {
    renderPriceChart();
    renderValuationChart();
  }, 60);
  setTimeout(() => {
    renderPriceChart();
    renderValuationChart();
  }, 180);
});
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderPriceChart();
    renderValuationChart();
  }, 100);
});
document.querySelectorAll('.chart-ranges button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.chart-ranges button').forEach((item) => item.classList.toggle('active', item === button));
    loadChart(button.dataset.range);
  });
});
wireCompanyChartInteractions();
document.querySelector('#screener-range-min').addEventListener('input', (event) => {
  const minInput = event.currentTarget;
  const maxInput = document.querySelector('#screener-range-max');
  if (Number(minInput.value) > Number(maxInput.value)) maxInput.value = minInput.value;
  screenerYearMin = Number(minInput.value);
  screenerYearMax = Number(maxInput.value);
  renderScreenerTables();
});
document.querySelector('#screener-range-max').addEventListener('input', (event) => {
  const maxInput = event.currentTarget;
  const minInput = document.querySelector('#screener-range-min');
  if (Number(maxInput.value) < Number(minInput.value)) minInput.value = maxInput.value;
  screenerYearMax = Number(maxInput.value);
  screenerYearMin = Number(minInput.value);
  renderScreenerTables();
});
document.querySelectorAll('.screener-period-toggle button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.screener-period-toggle button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    screenerSeries = button.dataset.series;
    screenerYearMin = null;
    screenerYearMax = null;
    screenerTableDragController?.resetScroll();
    renderScreenerTables();
  });
});
document.querySelectorAll('.screener-tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.screener-tab').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    screenerStatement = button.dataset.statement;
    screenerTableDragController?.resetScroll();
    renderScreenerTables();
  });
});
document.querySelectorAll('[data-precision]').forEach((button) => {
  button.addEventListener('click', () => {
    screenerPrecision = Number(button.dataset.precision);
    document.querySelectorAll('[data-precision]').forEach((item) => item.classList.toggle('active', item === button));
    renderScreenerTables();
  });
});
document.querySelector('[data-table-action="transpose"]').addEventListener('click', () => {
  document.querySelector('#screener-statement-table').classList.toggle('table-compact');
});
screenerFilings = window.EmpresaFilings?.getFilings?.() || null;
window.addEventListener('watchlists:change', () => {
  renderCompanyWatchState();
});
Watchlists.mountSection(document.querySelector('#watchlists-section'), {
  countEl: document.querySelector('#favorites-count'),
  onNavigate: goToCompany,
});
document.querySelectorAll('.nav-link[data-section]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const sectionKey = link.dataset.section;
    document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.remove('active'));
    link.classList.add('active');
    showSection(sectionKey);
    closeSidebar();

    if (sectionKey === 'favoritos') {
      history.pushState(null, '', '/seguimiento');
    } else if (sectionKey === 'cartera') {
      history.pushState(null, '', '/cartera');
    } else if (sectionKey === 'calendario') {
      history.pushState(null, '', '/calendario');
    } else if (sectionKey === 'alertas') {
      history.pushState(null, '', '/alertas');
    } else if (sectionKey === 'analisis') {
      history.pushState(null, '', '/analisis');
    } else if (sectionKey === 'novedades') {
      history.pushState(null, '', '/novedades');
    } else if (sectionKey === 'guias') {
      history.pushState(null, '', '/guias');
    } else if (sectionKey === 'reportes') {
      history.pushState(null, '', '/reportes');
    } else {
      history.pushState(null, '', `/empresa/${encodeURIComponent(companyTicker)}`);
    }
  });
});
document.querySelector('#company-watch').addEventListener('click', (event) => {
  event.stopPropagation();
  Watchlists.open(event.currentTarget, companyTicker, companyData?.company?.name);
});
document.querySelector('#company-alert').addEventListener('click', (event) => {
  event.stopPropagation();
  document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === 'alertas'));
  showSection('alertas');
});
document.querySelector('#company-filings-shortcut').addEventListener('click', () => {
  document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === 'informes'));
  showSection('informes');
});
menuToggle.addEventListener('click', () => {
  if (window.matchMedia('(max-width: 900px)').matches) {
    const isOpen = sidebar.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    backdrop.classList.toggle('visible', isOpen);
    return;
  }

  const isCollapsed = appShell.classList.toggle('sidebar-collapsed');
  menuToggle.setAttribute('aria-expanded', String(!isCollapsed));
});
backdrop.addEventListener('click', closeSidebar);
tickerSearch.addEventListener('input', (event) => renderSearchResults(event.target.value));
tickerSearch.addEventListener('keydown', async (event) => {
  if (event.key === 'Escape') {
    searchResults.hidden = true;
    tickerSearch.blur();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const query = tickerSearch.value.trim();
    if (!query) return;
    if (/^[A-Z0-9.-]{1,10}$/i.test(query)) {
      goToCompany(query.toUpperCase());
      return;
    }
    const matches = await searchCompanies(query);
    if (!matches.length) {
      showToast('Sin resultados en EDGAR para esta búsqueda.');
      return;
    }
    goToCompany(matches[0].ticker);
  }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-wrap')) searchResults.hidden = true;
});
window.addEventListener('auth:change', (event) => {
  syncAuthDependencies(Boolean(event.detail?.user));
});
document.querySelector('.brand-lockup, .brand')?.addEventListener('click', (event) => {
  event.preventDefault();
  document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === 'perfil'));
  showSection('perfil');
  history.pushState(null, '', `/empresa/${encodeURIComponent(companyTicker)}`);
});
document.querySelector('#sidebar-company-head')?.addEventListener('click', () => {
  document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === 'perfil'));
  showSection('perfil');
  history.pushState(null, '', `/empresa/${encodeURIComponent(companyTicker)}`);
});
window.addEventListener('popstate', () => {
  const targetSection = resolveInitialSection();
  document.querySelectorAll('.nav-link[data-section]').forEach((item) => {
    item.classList.toggle('active', item.dataset.section === targetSection);
  });
  showSection(targetSection);
});
window.AnalysisModule?.init();
document.querySelectorAll('.nav-link[data-section]').forEach((item) => {
  item.classList.toggle('active', item.dataset.section === currentInitialSection);
});
showSection(currentInitialSection);
window.addEventListener('auth:change', () => {
  const filingsSec = document.querySelector('#section-informes');
  if (filingsSec && !filingsSec.hidden) {
    renderFilingsTable();
  }
  const reportesSec = document.querySelector('#section-reportes');
  if (reportesSec && (!reportesSec.hidden || resolveInitialSection() === 'reportes')) {
    reportesSec.hidden = false;
    window.ReportsModule?.render();
  }
});
  window.sidebar = sidebar;
  window.menuToggle = menuToggle;
  window.backdrop = backdrop;
  window.searchResults = searchResults;
  window.companyLoading = companyLoading;
  window.companyError = companyError;
}
window.bootEmpresa = bootEmpresa;

})(window);
