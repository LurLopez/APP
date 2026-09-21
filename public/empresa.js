const sidebar = document.querySelector('#sidebar');
const menuToggle = document.querySelector('#menu-toggle');
const backdrop = document.querySelector('#backdrop');
const appShell = document.querySelector('.app-shell');
const tickerSearch = document.querySelector('#ticker-search');
const searchResults = document.querySelector('#search-results');

const companyLoading = document.querySelector('#company-loading');
const companyError = document.querySelector('#company-error');

let toastTimer;
let searchDebounceTimer;
let previewLoadTimeout;

let companyTicker = getInitialCompanyTicker();
let companyData = null;
let companyAuthenticated = Boolean(window.AuthModule?.getUser?.() || window.currentUser);
let chartRange = '5y';
let chartPoints = [];
let chartMaPoints = [];
let chartMovingAveragesData = {};

let chartMaConfig = loadChartMaConfig();
let chartScale = null;
let priceChartRenderState = null;

let screenerSeries = 'annual';
let screenerStatement = 'valuation';
let screenerPrecision = 2;
let screenerHideEmpty = true;
let screenerYearMin = null;
let screenerYearMax = null;
let screenerFilings = null;
let screenerFilingsLoading = false;

let companyHoldersData = null;
let companyHoldersLoading = false;
let activeHoldersTab = 'institutions';

/* ── Módulos auxiliares de empresa ─────────────────────────── */
const { formatProfileNumber, formatProfilePrice, formatProfileCompactUsd, formatProfileCompactCount, formatProfilePercent, formatMultiple, formatProfileDate, formatMoneyUsd, formatEps, formatShares, formatCount, formatPercentage, periodLabel, periodDateLabel, seoTitleCase, setSeoMeta, updateCompanySeoMeta } = window.EmpresaFormatting || {};

const { SPANISH_MONTHS, formatTradingViewHoverDate, computeNiceStep, formatCurrencySymbol, formatPriceValue, formatSignedPriceValue, formatSignedPct, computePriceScale, getCompanyChartGeometry, getTradingViewDateTicks } = window.EmpresaChartUtils || {};

const { calculateValuationMetrics, renderValuation } = window.EmpresaValuationCards || {};

const { getRowPrice, getRowMarketCap, derivedScreenerValue, formatScreenerValue, isLockedPeriod, renderProCell, shouldRenderScreenerValueRed, rowYear, screenerVisibleIndexes, itemHasVisibleValues, filterEmptyStatementItems, renderStatementTable, initScreenerTableDrag, updateScreenerTableScroll } = window.EmpresaStatements || {};

const { loadFilings, renderFilingsTable, openFilingsPreview, closeFilingsPreview, openFilingsVersionMenu, closeFilingsVersionMenu, abortPresentations } = window.EmpresaFilings || {};

const { loadHolders, renderHolders } = window.EmpresaHolders || {};

const { renderMetricsChart, toggleChartMetric, removeChartMetric, syncMarginSelector, syncChartRowSelection, metricsChartRows, renderComparisonChips, addComparisonCompany, removeComparisonCompany, resetComparison, chartMetrics, comparisonCompanies } = window.EmpresaMetricsChart || {};

/* ── Cabecera y cotización ──────────────────────────────────── */

let defaultQuoteState = null;
let quoteSparklineValues = [];
let quoteSparklineWired = false;

/* ── Pestaña Valoración (provisto por EmpresaValuationCards) ──── */
let valPeAdjusted = true;

/* ── Gráfico de múltiplos por sesión ───────────────────────── */

let valChartMetric = 'evEbitda';
let valChartRange = '5y';
let valChartPoints = [];
let valChartAllPoints = [];
let valChartLoadedBuffer = 0;
let valMaConfig = loadValChartMaConfig();
let valMaLookup = {};
let valChartState = null;
let valChartRequested = false;

let valSliceStart = 0;
let valSliceEnd = 0;
let isValMeasureToolActive = false;
let isValMeasuring = false;
let valMeasureStartButton = 2;
let valMeasureStartSvgX = 0;
let valMeasureStartSvgY = 0;
let valMeasureCurrentSvgX = 0;
let valMeasureCurrentSvgY = 0;
let isValPanning = false;
let valPanMoved = false;
let valPanStartX = 0;
let valPanInitStart = 0;
let valPanInitEnd = 0;
let isValComparing = false;
let valCompareStartIdx = 0;
let valCompareCurrentIdx = 0;

/* ── Gráfico de cotización interactivo ──────────────────────── */

let chartSliceStart = 0;
let chartSliceEnd = 0;
let chartCurrency = 'USD';
let isMeasureToolActive = false;
let isMeasuring = false;
let measureStartButton = 0;
let measureStartSvgX = 0;
let measureStartSvgY = 0;
let measureCurrentSvgX = 0;
let measureCurrentSvgY = 0;
let isComparing = false;
let compareStartIdx = null;
let compareCurrentIdx = null;
let isPanning = false;
let panMoved = false;
let panStartX = 0;
let panInitStart = 0;
let panInitEnd = 0;

/* ── Utilidades de gráfico de cotización provistas por EmpresaChartUtils ── */

// Global hotkeys for fullscreen

const quotePanel = document.querySelector('.company-quote');
if (quotePanel) {
  quotePanel.addEventListener('click', openChartFullscreen);
  quotePanel.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openChartFullscreen();
    }
  });
}

let resizeTimer;

if (typeof ResizeObserver !== 'undefined') {
  let roTimer;
  const chartRo = new ResizeObserver(() => {
    clearTimeout(roTimer);
    roTimer = setTimeout(() => {
      const valBlock = document.querySelector('#val-chart-block');
      if (valBlock && !valBlock.hidden && valChartPoints && valChartPoints.length) {
        renderValuationChart();
      }
      const chartBlock = document.querySelector('#company-chart-block') || document.querySelector('.chart-block');
      if (chartBlock && !chartBlock.hidden && chartPoints && chartPoints.length) {
        renderPriceChart();
      }
      if (typeof renderMetricsChart === 'function' && window.chartMetrics?.size) {
        renderMetricsChart();
      }
    }, 80);
  });
  const valBody = document.querySelector('#val-chart-body');
  if (valBody) chartRo.observe(valBody);
  const priceBody = document.querySelector('#chart-body');
  if (priceBody) chartRo.observe(priceBody);
  const metricsBody = document.querySelector('#metrics-chart-body');
  if (metricsBody) chartRo.observe(metricsBody);
}

/* ── Datos financieros (tablas) ─────────────────────────────── */

const emptyTableButton = document.querySelector('[data-table-action="empty"]');
if (emptyTableButton) {
  emptyTableButton.addEventListener('click', (event) => {
    screenerHideEmpty = !screenerHideEmpty;
    event.currentTarget.classList.toggle('active', screenerHideEmpty);
    event.currentTarget.setAttribute('title', screenerHideEmpty ? 'Ocultar filas vacías (activado)' : 'Mostrar todas las filas');
    renderScreenerTables();
  });
}

let screenerTableDragController = window.EmpresaStatements?.getDragController?.() || null;

/* ── Listas de seguimiento ─────────────────────────────────── */

/* ── Secciones del menú lateral ─────────────────────────────── */

/* ── Cabecera de empresa: acciones ──────────────────────────── */

/* ── Menú lateral ───────────────────────────────────────────── */

/* ── Buscador superior ──────────────────────────────────────── */

/* ── Carga inicial ──────────────────────────────────────────── */

if (window.AuthModule?.isReady()) {
  syncAuthDependencies(Boolean(window.AuthModule.getUser()));
} else if (window.AuthModule?.whenReady) {
  window.AuthModule.whenReady().then((readyUser) => {
    syncAuthDependencies(Boolean(readyUser));
  });
} else if (window.currentUser) {
  syncAuthDependencies(true);
}

// Inicializar módulo de análisis

const currentInitialSection = resolveInitialSection();

const startupParams = new URLSearchParams(window.location.search);
const pendingTicker = (startupParams.get('analizar') ?? '').trim().toUpperCase();
const pendingAccession = startupParams.get('accession') ?? '';
if (pendingTicker && pendingAccession && window.AnalysisModule) {
  setTimeout(() => {
    window.AnalysisModule.runFilingAnalysis(pendingTicker, pendingAccession);
  }, 200);
}

bootEmpresa();

if (!companyTicker) {
  companyLoading.hidden = true;
  companyError.textContent = 'No se ha indicado ninguna empresa. Usa el buscador para elegir una.';
  companyError.hidden = false;
} else {
  loadCompany();
}
