const toast = document.querySelector('#toast');
const sidebar = document.querySelector('#sidebar');
const menuToggle = document.querySelector('#menu-toggle');
const backdrop = document.querySelector('#backdrop');
const appShell = document.querySelector('.app-shell');
const tickerSearch = document.querySelector('#ticker-search');
const searchResults = document.querySelector('#search-results');

const companyLoading = document.querySelector('#company-loading');
const companyError = document.querySelector('#company-error');
const companyBody = document.querySelector('#company-body');

let toastTimer;
let searchDebounceTimer;
let previewLoadTimeout;

const SAVED_TICKER_KEY = 'cifra_last_company';

function getInitialCompanyTicker() {
  const urlParams = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split('/').filter(Boolean);

  let tickerFromUrl = '';
  if (pathParts[0] === 'empresa' && pathParts[1]) {
    tickerFromUrl = decodeURIComponent(pathParts[1]).trim().toUpperCase();
  } else if (pathParts[0] === 'informe' && pathParts[1] && !/^\d+$/.test(pathParts[1])) {
    tickerFromUrl = decodeURIComponent(pathParts[1]).trim().toUpperCase();
  } else if (urlParams.get('ticker')) {
    tickerFromUrl = urlParams.get('ticker').trim().toUpperCase();
  }

  if (tickerFromUrl && /^[A-Z0-9.-]{1,10}$/.test(tickerFromUrl)) {
    localStorage.setItem(SAVED_TICKER_KEY, tickerFromUrl);
    return tickerFromUrl;
  }

  const initialReportEl = document.querySelector('#cifra-initial-report');
  if (initialReportEl) {
    try {
      const parsed = JSON.parse(initialReportEl.textContent);
      if (parsed?.ticker && /^[A-Z0-9.-]{1,10}$/.test(parsed.ticker)) {
        return parsed.ticker.toUpperCase();
      }
    } catch {}
  }

  const saved = localStorage.getItem(SAVED_TICKER_KEY);
  if (saved && /^[A-Z0-9.-]{1,10}$/.test(saved.trim().toUpperCase())) {
    return saved.trim().toUpperCase();
  }

  return 'KHC'; // Empresa típica
}

let companyTicker = getInitialCompanyTicker();
window.companyTicker = companyTicker;
let companyData = null;
window.companyData = companyData;
let companyAuthenticated = Boolean(window.AuthModule?.getUser?.() || window.currentUser);
let chartRange = '5y';
let chartPoints = [];
window.chartPoints = chartPoints;
let chartMaPoints = [];
let chartMovingAveragesData = {};
const MA_PALETTE = ['#3b82f6', '#8b5cf6', '#10b981', '#ec4899', '#06b6d4', '#eab308', '#4f46e5'];
const MA_STORAGE_KEY = 'cifra_chart_ma_config_v1';

function loadChartMaConfig() {
  try {
    const raw = localStorage.getItem(MA_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((item, idx) => ({
          id: item.id || `ma-${Date.now()}-${idx}`,
          period: Math.max(1, Math.min(5000, parseInt(item.period, 10) || 100)),
          active: Boolean(item.active),
          color: item.color || MA_PALETTE[idx % MA_PALETTE.length],
        }));
      }
    }
  } catch {}
  return [
    { id: 'ma-100', period: 100, active: true, color: MA_PALETTE[0] },
  ];
}

function saveChartMaConfig(config) {
  try {
    localStorage.setItem(MA_STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

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

const SECTION_PLACEHOLDERS = [];
let companyHoldersData = null;
let companyHoldersLoading = false;
let activeHoldersTab = 'institutions';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function goToCompany(ticker) {
  if (!ticker) return;
  const clean = String(ticker).trim().toUpperCase();
  localStorage.setItem(SAVED_TICKER_KEY, clean);
  window.location.href = `/empresa/${encodeURIComponent(clean)}`;
}

/* ── Módulos auxiliares de empresa ─────────────────────────── */
const {
  formatProfileNumber,
  formatProfilePrice,
  formatProfileCompactUsd,
  formatProfileCompactCount,
  formatProfilePercent,
  formatMultiple,
  formatProfileDate,
  formatMoneyUsd,
  formatEps,
  formatShares,
  formatCount,
  formatPercentage,
  periodLabel,
  periodDateLabel,
  seoTitleCase,
  setSeoMeta,
  updateCompanySeoMeta,
} = window.EmpresaFormatting || {};

const {
  SPANISH_MONTHS,
  formatTradingViewHoverDate,
  computeNiceStep,
  formatCurrencySymbol,
  formatPriceValue,
  formatSignedPriceValue,
  formatSignedPct,
  computePriceScale,
  getCompanyChartGeometry,
  getTradingViewDateTicks,
} = window.EmpresaChartUtils || {};

const {
  calculateValuationMetrics,
  renderValuation,
} = window.EmpresaValuationCards || {};

const {
  getRowPrice,
  getRowMarketCap,
  derivedScreenerValue,
  formatScreenerValue,
  isLockedPeriod,
  renderProCell,
  shouldRenderScreenerValueRed,
  rowYear,
  screenerVisibleIndexes,
  itemHasVisibleValues,
  filterEmptyStatementItems,
  renderStatementTable,
  initScreenerTableDrag,
  updateScreenerTableScroll,
} = window.EmpresaStatements || {};

const {
  loadFilings,
  renderFilingsTable,
  openFilingsPreview,
  closeFilingsPreview,
  openFilingsVersionMenu,
  closeFilingsVersionMenu,
  abortPresentations,
} = window.EmpresaFilings || {};

const {
  loadHolders,
  renderHolders,
} = window.EmpresaHolders || {};

const {
  renderMetricsChart,
  toggleChartMetric,
  removeChartMetric,
  syncMarginSelector,
  syncChartRowSelection,
  metricsChartRows,
  renderComparisonChips,
  addComparisonCompany,
  removeComparisonCompany,
  resetComparison,
  chartMetrics,
  comparisonCompanies,
} = window.EmpresaMetricsChart || {};


/* ── Cabecera y cotización ──────────────────────────────────── */

let defaultQuoteState = null;
let quoteSparklineValues = [];
let quoteSparklineWired = false;

function setQuoteDisplay({ price, change, changePercent, dateText, isHover = false, maValue = null, maLabel = null, maColor = null }) {
  const hasP = Number.isFinite(price);
  const hasC = Number.isFinite(change);
  const isPositive = hasC ? change >= 0 : (defaultQuoteState ? defaultQuoteState.isPositive : true);

  const formattedPrice = hasP ? `${formatProfileNumber(price)} $` : '—';
  const formattedChange = hasC
    ? `${change >= 0 ? '+' : '−'}${formatProfileNumber(Math.abs(change))} $${Number.isFinite(changePercent) ? ` (${formatProfilePercent(changePercent, true)})` : ''}`
    : (hasP ? '' : '—');

  // 1. Actualizar tarjeta de cotización principal (.company-quote) solo si NO es hover del gráfico
  if (!isHover) {
    const priceEl = document.querySelector('#quote-price');
    const changeEl = document.querySelector('#quote-change');
    const updatedEl = document.querySelector('#quote-updated');
    if (priceEl) {
      priceEl.innerHTML = `<span class="quote-arrow" aria-hidden="true">${isPositive ? '▲' : '▼'}</span> ${formattedPrice}`;
      priceEl.classList.toggle('positive', isPositive);
      priceEl.classList.toggle('negative', !isPositive);
    }
    if (changeEl) {
      changeEl.textContent = formattedChange || '—';
      changeEl.classList.toggle('positive', isPositive);
      changeEl.classList.toggle('negative', !isPositive);
    }
    if (updatedEl) {
      updatedEl.textContent = dateText || 'Cotización';
      updatedEl.classList.toggle('quote-hovering', false);
    }
  }

  // 2. Actualizar indicador de cotización en la cabecera del gráfico (#chart-quote-badge)
  const chartQuoteBadge = document.querySelector('#chart-quote-badge');
  const chartQuotePrice = document.querySelector('#chart-quote-price');
  const chartQuoteChange = document.querySelector('#chart-quote-change');
  const chartQuoteDate = document.querySelector('#chart-quote-date');
  const chartQuoteMa = document.querySelector('#chart-quote-ma');

  if (chartQuoteBadge) {
    chartQuoteBadge.classList.toggle('is-hovering', isHover);
  }
  if (chartQuotePrice) {
    chartQuotePrice.innerHTML = `<span class="quote-arrow" aria-hidden="true">${isPositive ? '▲' : '▼'}</span> ${formattedPrice}`;
    chartQuotePrice.className = `chart-quote-badge-price ${isPositive ? 'positive' : 'negative'}`;
  }
  if (chartQuoteChange) {
    chartQuoteChange.textContent = formattedChange || '';
    chartQuoteChange.className = `chart-quote-badge-change ${isPositive ? 'positive' : 'negative'}`;
    chartQuoteChange.style.display = formattedChange ? 'inline' : 'none';
  }
  if (chartQuoteDate) {
    chartQuoteDate.textContent = dateText ? `· ${dateText}` : '';
  }
  if (chartQuoteMa) {
    if (Number.isFinite(maValue)) {
      chartQuoteMa.textContent = `${maLabel || 'MA'}: ${formatPriceValue(maValue)}`;
      chartQuoteMa.style.display = 'inline-block';
      if (maColor) chartQuoteMa.style.color = maColor;
    } else {
      chartQuoteMa.style.display = 'none';
    }
  }
}

function restoreQuoteDisplay() {
  if (defaultQuoteState) {
    setQuoteDisplay({
      ...defaultQuoteState,
      isHover: false,
      maValue: null,
      maLabel: null,
      maColor: null,
    });
  }
}

function wireQuoteSparklineHover() {
  if (quoteSparklineWired) return;
  const quoteEl = document.querySelector('#company-quote');
  const sparkline = document.querySelector('#quote-sparkline');
  if (!quoteEl || !sparkline) return;
  quoteSparklineWired = true;

  quoteEl.addEventListener('mousemove', (event) => {
    if (!quoteSparklineValues.length) return;
    const rect = sparkline.getBoundingClientRect();
    if (!rect.width) return;
    if (event.clientX < rect.left - 10 || event.clientX > rect.right + 10) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * (quoteSparklineValues.length - 1));
    const val = quoteSparklineValues[idx];
    const prev = idx > 0 ? quoteSparklineValues[idx - 1] : val;
    const diff = val - prev;
    const diffPct = prev > 0 ? (diff / prev) * 100 : 0;
    setQuoteDisplay({
      price: val,
      change: diff,
      changePercent: diffPct,
      dateText: `Punto ${idx + 1} de ${quoteSparklineValues.length}`,
      isHover: true,
      maValue: null,
    });
  });

  quoteEl.addEventListener('mouseleave', () => {
    restoreQuoteDisplay();
  });
}

function renderQuoteSparkline(values) {
  const line = document.querySelector('#quote-sparkline-line');
  const area = document.querySelector('#quote-sparkline-area');
  const points = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  quoteSparklineValues = points;
  if (!points.length) {
    line.removeAttribute('d');
    area.removeAttribute('d');
    return;
  }
  const width = 360;
  const height = 92;
  const padding = 5;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const spread = max - min || 1;
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - padding - ((point - min) / spread) * (height - (padding * 2));
    return [x, y];
  });
  const path = coordinates.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  line.setAttribute('d', path);
  area.setAttribute('d', `${path} L${width} ${height} L0 ${height} Z`);
  wireQuoteSparklineHover();
}

function renderCompanyLogo(el, ticker, fallbackLetter) {
  if (!el) return;
  const img = document.createElement('img');
  img.className = 'company-logo-img';
  img.src = `https://companiesmarketcap.com/img/company-logos/64/${escapeHtml(ticker)}.webp`;
  img.alt = '';
  img.addEventListener('error', () => { el.textContent = fallbackLetter; });
  el.textContent = '';
  el.appendChild(img);
}


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
  document.querySelector('#pf-description').textContent = profile.description || 'No hay descripción pública disponible.';

  renderValuation(data);
}

/* ── Pestaña Valoración (provisto por EmpresaValuationCards) ──── */
let valPeAdjusted = true;
window.valPeAdjusted = valPeAdjusted;


/* ── Gráfico de múltiplos por sesión ───────────────────────── */

let valChartMetric = 'evEbitda';
let valChartRange = '5y';
let valChartPoints = [];
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

const VAL_CHART_METRICS = {
  evEbitda: { label: 'EV / EBITDA', format: 'multiple' },
  peRatio: { label: 'PER', format: 'multiple' },
  priceToFcf: { label: 'P / FCF', format: 'multiple' },
  dividendYield: { label: 'Yield del dividendo', format: 'ratio' },
  payoutRatio: { label: 'Payout del dividendo', format: 'ratio' },
  netDebtToEbitda: { label: 'Deuda Neta / EBITDA', format: 'multiple' },
};

function formatValChartAxis(value, metricKey) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const metric = VAL_CHART_METRICS[metricKey] ?? VAL_CHART_METRICS.evEbitda;
  if (metric.format === 'ratio') return `${number.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`;
  return `${number.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
}

function formatValChartDate(dateString) {
  if (!dateString) return '';
  const [year, month, day] = String(dateString).split('-');
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
}

function renderAnnualNetDebtEbitdaChart() {
  const svg = document.querySelector('#val-chart');
  const wrap = document.querySelector('#val-chart-body');
  const message = document.querySelector('#val-chart-message');
  if (!svg || !wrap) return;

  const width = Math.max(320, wrap.clientWidth || 720);
  const height = 300;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const annualRows = [...(companyData?.annual ?? [])].reverse();
  const quarterly = companyData?.quarterly ?? [];
  let limit = annualRows.length;
  if (valChartRange === '1m' || valChartRange === '3m' || valChartRange === '6m' || valChartRange === '1y' || valChartRange === '3y') limit = 3;
  else if (valChartRange === '5y') limit = 5;
  else if (valChartRange === '10y') limit = 10;
  const rows = annualRows.slice(-limit);

  const items = [];
  rows.forEach((row) => {
    const year = row.period || (row.periodEnd ? String(row.periodEnd).slice(0, 4) : '');
    const netDebt = Number(row.values?.netDebt);
    const totalDebt = Number(row.values?.totalDebt);
    const cash = Number(row.values?.cashAndShortTermInvestments ?? row.values?.cash);
    const calcNetDebt = Number.isFinite(netDebt) ? netDebt : (Number.isFinite(totalDebt) && Number.isFinite(cash) ? totalDebt - cash : null);

    // Sum the 4 fiscal quarters of the year if available for maximum accuracy and normalization
    const yrQuarters = quarterly.filter((q) => q.period && q.period.startsWith(year) && q.period.includes('-Q'));
    let ebitda = null;
    if (yrQuarters.length === 4) {
      ebitda = yrQuarters.reduce((s, q) => s + (Number(q.values?.ebitdaNormalized ?? q.values?.ebitda) || 0), 0);
    }
    if (!ebitda || ebitda <= 0) {
      ebitda = Number(row.values?.ebitdaNormalized ?? row.values?.ebitda ?? (Number(row.values?.operatingIncome) + (Number(row.values?.depreciationAmortizationTotal) || Number(row.values?.depreciation) || 0)));
    }

    if (!year || !Number.isFinite(ebitda) || ebitda <= 0 || calcNetDebt === null) return;
    const ratio = calcNetDebt / ebitda;
    if (Number.isFinite(ratio)) {
      items.push({
        year,
        periodEnd: row.periodEnd,
        netDebt: calcNetDebt,
        ebitda,
        ratio: Math.round(ratio * 100) / 100,
      });
    }
  });

  // TTM bar if latest reported quarter is newer than latest annual row
  const latestAnnualEnd = annualRows[annualRows.length - 1]?.periodEnd;
  const latestQuarterEnd = quarterly[0]?.periodEnd;
  if (latestQuarterEnd && (!latestAnnualEnd || latestQuarterEnd > latestAnnualEnd) && quarterly.length >= 4) {
    const q4 = quarterly.slice(0, 4);
    const sumNorm = q4.reduce((s, q) => s + (Number(q.values?.ebitdaNormalized ?? q.values?.ebitda) || 0), 0);
    const sumRaw = q4.reduce((s, q) => s + (Number(q.values?.ebitda) || 0), 0);
    const ebitdaTtm = sumNorm > 0 ? sumNorm : (sumRaw > 0 ? sumRaw : null);
    const latestQ = quarterly[0]?.values ?? {};
    const totalDebt = Number(latestQ.totalDebt);
    const cash = Number(latestQ.cashAndShortTermInvestments ?? latestQ.cash);
    const netDebtTtm = Number.isFinite(Number(latestQ.netDebt)) ? Number(latestQ.netDebt) : (Number.isFinite(totalDebt) && Number.isFinite(cash) ? totalDebt - cash : null);
    if (ebitdaTtm && ebitdaTtm > 0 && netDebtTtm !== null) {
      items.push({
        year: 'TTM',
        periodEnd: latestQuarterEnd,
        netDebt: netDebtTtm,
        ebitda: ebitdaTtm,
        ratio: Math.round((netDebtTtm / ebitdaTtm) * 100) / 100,
      });
    }
  }

  if (!items.length) {
    svg.innerHTML = '';
    if (message) {
      message.textContent = 'No hay datos anuales disponibles de Deuda Neta y EBITDA.';
      message.hidden = false;
    }
    valChartState = null;
    return;
  }
  if (message) message.hidden = true;

  const currentVal = items[items.length - 1]?.ratio;
  const minVal = Math.min(...items.map((it) => it.ratio));
  const maxVal = Math.max(...items.map((it) => it.ratio));
  const avgVal = items.reduce((sum, it) => sum + it.ratio, 0) / items.length;

  const currentEl = document.querySelector('#val-stat-current');
  const avgEl = document.querySelector('#val-stat-avg');
  const minEl = document.querySelector('#val-stat-min');
  const maxEl = document.querySelector('#val-stat-max');
  if (currentEl) currentEl.textContent = Number.isFinite(currentVal) ? `${currentVal.toFixed(2)}x` : '—';
  if (avgEl) avgEl.textContent = Number.isFinite(avgVal) ? `${avgVal.toFixed(2)}x` : '—';
  if (minEl) minEl.textContent = Number.isFinite(minVal) ? `${minVal.toFixed(2)}x` : '—';
  if (maxEl) maxEl.textContent = Number.isFinite(maxVal) ? `${maxVal.toFixed(2)}x` : '—';

  const margin = { top: 38, right: 28, bottom: 42, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  let min = Math.min(0, minVal);
  let max = Math.max(1, maxVal);
  const span = max - min;
  const scale = {
    min: min < 0 ? min * 1.25 : 0,
    max: max + Math.max(0.6, span * 0.22),
  };

  const y = (value) => margin.top + innerHeight - ((Number(value) - scale.min) / (scale.max - scale.min)) * innerHeight;
  const zeroY = y(0);

  const ticks = [scale.min, scale.min + (scale.max - scale.min) * 0.33, scale.min + (scale.max - scale.min) * 0.66, scale.max];
  const axis = ticks.map((val) => `
    <text x="${margin.left - 8}" y="${y(val) + 3}" class="chart-label" text-anchor="end">${val.toFixed(1)}x</text>
    <line x1="${margin.left}" y1="${y(val)}" x2="${width - margin.right}" y2="${y(val)}" class="chart-grid"/>
  `).join('');

  const avgY = y(avgVal);
  const avgLine = `
    <line x1="${margin.left}" y1="${avgY.toFixed(1)}" x2="${(width - margin.right).toFixed(1)}" y2="${avgY.toFixed(1)}" stroke="#64748b" stroke-dasharray="4,4" stroke-width="1.2" opacity="0.7"/>
    <text x="${(width - margin.right).toFixed(1)}" y="${(avgY - 6).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="10.5" font-weight="600">Media: ${avgVal.toFixed(2)}x</text>
  `;

  const N = items.length;
  const step = innerWidth / Math.max(1, N);
  const barWidth = Math.min(54, Math.max(22, step * 0.60));

  let barsHtml = '';
  items.forEach((it, idx) => {
    const barX = margin.left + idx * step + (step - barWidth) / 2;
    const isNegative = it.ratio < 0;
    const barY = isNegative ? zeroY : y(it.ratio);
    const barH = Math.max(3, Math.abs(y(it.ratio) - zeroY));
    const isTtm = it.year === 'TTM';
    const color = isNegative ? '#16a34a' : (isTtm ? '#4338ca' : 'var(--accent)');
    const labelY = isNegative ? (barY + barH + 14) : (barY - 8);

    barsHtml += `
      <g class="val-bar-group" onmousemove="window.showValBarTooltip(event, ${idx})" onmouseleave="window.hideChartTooltip()">
        <rect x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" fill="${color}" rx="3" class="val-bar-rect"/>
        <text x="${(barX + barWidth / 2).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#1e293b">${it.ratio.toFixed(2)}x</text>
        <text x="${(barX + barWidth / 2).toFixed(1)}" y="${height - 12}" class="chart-label chart-label-x" text-anchor="middle">${escapeHtml(it.year)}</text>
      </g>
    `;
  });

  svg.innerHTML = `
    ${axis}
    ${avgLine}
    ${barsHtml}
  `;

  valChartState = { isBarChart: true, items };
}

window.showValBarTooltip = function showValBarTooltip(event, idx) {
  if (!valChartState?.isBarChart) return;
  const item = valChartState.items?.[idx];
  if (!item) return;
  const tooltip = ensureChartTooltip();
  const isNetCash = item.netDebt < 0;
  const isTtm = item.year === 'TTM';
  tooltip.innerHTML = `<strong>${isTtm ? 'Últimos 12 Meses (TTM)' : `Año ${escapeHtml(item.year)}`} ${item.periodEnd ? `(${escapeHtml(item.periodEnd)})` : ''}</strong>
    <span style="color:#94a3b8;font-size:11px;">Deuda Neta / EBITDA</span>
    <b style="font-size:16px;color:#fff;margin:2px 0;">${item.ratio.toFixed(2)}x ${isNetCash ? '<span style="color:#4ade80;font-size:11px;">(Caja Neta)</span>' : ''}</b>
    <span style="color:#cbd5e1;font-size:11px;">Deuda Neta: ${formatProfileCompactUsd(item.netDebt)}</span>
    <span style="color:#cbd5e1;font-size:11px;">EBITDA${isTtm ? ' (TTM)' : ''}: ${formatProfileCompactUsd(item.ebitda)}</span>`;
  tooltip.hidden = false;
  positionChartTooltip(tooltip, event.clientX, event.clientY);
};

function computeValuationScale(values, allowNegative = false) {
  if (!values || !values.length) {
    return { min: 0, max: 10, ticks: [0, 2.5, 5, 7.5, 10], step: 2.5 };
  }
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(0.01, rawMax - rawMin);

  const targetStep = spread / 4;
  const step = computeNiceStep(targetStep);

  const min = allowNegative ? Math.floor((rawMin - step * 0.25) / step) * step : Math.max(0, Math.floor((rawMin - step * 0.25) / step) * step);
  let max = Math.ceil((rawMax + step * 0.25) / step) * step;
  if (max <= min) max = min + step * 2;

  const ticks = [];
  for (let val = min; val <= max + step * 0.001; val += step) {
    ticks.push(val);
  }
  return { min, max, ticks, step };
}

function updateValTimelineSliderUi() {
  const track = document.querySelector('#val-timeline-track');
  const win = document.querySelector('#val-timeline-window');
  const maskL = document.querySelector('#val-timeline-mask-l');
  const maskR = document.querySelector('#val-timeline-mask-r');
  const startEl = document.querySelector('#val-timeline-start');
  const endEl = document.querySelector('#val-timeline-end');
  const spanEl = document.querySelector('#val-timeline-span');
  const sparkEl = document.querySelector('#val-timeline-sparkline');
  if (!track || !win || !maskL || !maskR || !valChartPoints.length) return;

  const total = valChartPoints.length;
  const leftPct = (valSliceStart / Math.max(1, total - 1)) * 100;
  const rightPct = (valSliceEnd / Math.max(1, total - 1)) * 100;
  const widthPct = Math.max(2, rightPct - leftPct);

  win.style.left = `${leftPct.toFixed(2)}%`;
  win.style.width = `${widthPct.toFixed(2)}%`;
  maskL.style.width = `${leftPct.toFixed(2)}%`;
  maskR.style.left = `${rightPct.toFixed(2)}%`;
  maskR.style.width = `${(100 - rightPct).toFixed(2)}%`;

  const ptStart = valChartPoints[valSliceStart];
  const ptEnd = valChartPoints[valSliceEnd];
  if (startEl && ptStart) startEl.textContent = formatTradingViewHoverDate(ptStart.date);
  if (endEl && ptEnd) endEl.textContent = formatTradingViewHoverDate(ptEnd.date);

  if (spanEl && ptStart && ptEnd) {
    const d1 = new Date(`${ptStart.date}T00:00:00Z`);
    const d2 = new Date(`${ptEnd.date}T00:00:00Z`);
    const diffDays = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
    spanEl.textContent = `${diffDays} días seleccionados (${valSliceEnd - valSliceStart + 1} sesiones)`;
  }

  // Draw sparkline for current metric
  if (sparkEl && !sparkEl.hasChildNodes() && valChartPoints.length > 1) {
    let effectiveKey = valChartMetric;
    if (valChartMetric === 'peRatio') effectiveKey = valPeAdjusted ? 'peRatioNormalized' : 'peRatio';
    else if (valChartMetric === 'payoutRatio') effectiveKey = valPeAdjusted ? 'payoutRatioNormalized' : 'payoutRatio';
    const allowNegative = valChartMetric === 'netDebtToEbitda';
    const allowZero = valChartMetric === 'payoutRatio' || valChartMetric === 'dividendYield' || allowNegative;

    const rawVals = valChartPoints.map((p) => Number(p[effectiveKey])).filter((v) => Number.isFinite(v) && (allowZero ? (allowNegative ? true : v >= 0) : v > 0));
    if (rawVals.length) {
      const minV = Math.min(...rawVals);
      const maxV = Math.max(...rawVals);
      const spV = maxV - minV || 1;
      let d = '';
      valChartPoints.forEach((p, i) => {
        const v = Number(p[effectiveKey]);
        if (Number.isFinite(v) && (allowZero ? (allowNegative ? true : v >= 0) : v > 0)) {
          const sx = (i / (valChartPoints.length - 1)) * 100;
          const sy = 30 - ((v - minV) / spV) * 26;
          d += `${d ? ' L' : 'M'}${sx.toFixed(1)} ${sy.toFixed(1)}`;
        }
      });
      sparkEl.innerHTML = `<path d="${d}" fill="none" stroke="rgba(79, 70, 229, 0.65)" stroke-width="1.4"/>`;
    }
  }
}

function zoomValChartByStep(direction, centerFraction = 0.5) {
  if (!valChartPoints.length) return;
  const total = valChartPoints.length;
  const currentSpan = valSliceEnd - valSliceStart;
  const zoomFactor = direction === 'in' ? 0.72 : (direction === 'out' ? 1.38 : 1);

  if (direction === 'reset') {
    valSliceStart = 0;
    valSliceEnd = total - 1;
    renderValuationChart();
    return;
  }

  let newSpan = Math.round(currentSpan * zoomFactor);
  newSpan = Math.max(6, Math.min(total, newSpan));
  const spanDiff = newSpan - currentSpan;
  let newStart = Math.round(valSliceStart - spanDiff * centerFraction);
  let newEnd = newStart + newSpan - 1;

  if (newStart < 0) {
    newStart = 0;
    newEnd = Math.min(total - 1, newSpan - 1);
  }
  if (newEnd >= total) {
    newEnd = total - 1;
    newStart = Math.max(0, total - newSpan);
  }
  valSliceStart = newStart;
  valSliceEnd = newEnd;
  renderValuationChart();
}

function updateValuationMeasurementView(clientX, clientY) {
  if (!isValMeasuring || !valChartPoints.length) return;
  const points = valChartPoints.slice(valSliceStart, valSliceEnd + 1);
  if (!points.length) return;

  const svgEl = document.querySelector('#val-chart');
  const valBlock = document.querySelector('#val-chart-block');
  const measureLayer = svgEl?.querySelector('.pf-chart-measure-layer');
  if (!svgEl || !measureLayer) return;

  const rect = svgEl.getBoundingClientRect();
  const { width, height, pad, innerWidth, innerHeight } = getCompanyChartGeometry(valBlock);

  if (clientX !== undefined && clientY !== undefined && rect.width > 0 && rect.height > 0) {
    const curX = ((clientX - rect.left) / rect.width) * width;
    const curY = ((clientY - rect.top) / rect.height) * height;
    valMeasureCurrentSvgX = Math.max(pad.left, Math.min(width - pad.right, curX));
    valMeasureCurrentSvgY = Math.max(pad.top, Math.min(height - pad.bottom, curY));
  }

  const metricKey = valChartMetric;
  let effectiveKey = metricKey;
  if (metricKey === 'peRatio') effectiveKey = valPeAdjusted ? 'peRatioNormalized' : 'peRatio';
  else if (metricKey === 'payoutRatio') effectiveKey = valPeAdjusted ? 'payoutRatioNormalized' : 'payoutRatio';
  const allowNegative = metricKey === 'netDebtToEbitda';
  const allowZero = metricKey === 'payoutRatio' || metricKey === 'dividendYield' || allowNegative;

  const values = points.map((p) => Number(p[effectiveKey])).filter((v) => Number.isFinite(v) && (allowZero ? (allowNegative ? true : v >= 0) : v > 0));
  if (!values.length) return;
  const { min, max } = computeValuationScale(values, allowNegative);

  const x1 = valMeasureStartSvgX;
  const y1 = valMeasureStartSvgY;
  const x2 = valMeasureCurrentSvgX;
  const y2 = valMeasureCurrentSvgY;

  const leftX = Math.min(x1, x2);
  const rightX = Math.max(x1, x2);
  const topY = Math.min(y1, y2);
  const bottomY = Math.max(y1, y2);
  const boxW = Math.max(1, rightX - leftX);
  const boxH = Math.max(1, bottomY - topY);

  // Convert Y coordinates to Metric Values
  const ratioY1 = Math.max(0, Math.min(1, (y1 - pad.top) / innerHeight));
  const ratioY2 = Math.max(0, Math.min(1, (y2 - pad.top) / innerHeight));
  const val1 = max - ratioY1 * (max - min);
  const val2 = max - ratioY2 * (max - min);
  const deltaVal = val2 - val1;
  const deltaPct = val1 !== 0 ? ((val2 - val1) / Math.abs(val1)) * 100 : 0;

  // Convert X coordinates to Dates & Indices
  const ratioX1 = Math.max(0, Math.min(1, (x1 - pad.left) / innerWidth));
  const ratioX2 = Math.max(0, Math.min(1, (x2 - pad.left) / innerWidth));
  const idx1 = Math.max(0, Math.min(points.length - 1, Math.round(ratioX1 * (points.length - 1))));
  const idx2 = Math.max(0, Math.min(points.length - 1, Math.round(ratioX2 * (points.length - 1))));
  const pt1 = points[idx1] || points[0];
  const pt2 = points[idx2] || points[points.length - 1];

  const d1 = new Date(`${pt1.date}T00:00:00Z`);
  const d2 = new Date(`${pt2.date}T00:00:00Z`);
  const diffDays = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
  const sessions = Math.abs(idx2 - idx1) + 1;

  // Update measure box & diagonal line
  const boxEl = measureLayer.querySelector('.pf-chart-measure-box');
  const diagEl = measureLayer.querySelector('.pf-chart-measure-diagonal');
  const pt1El = measureLayer.querySelector('.pf-chart-measure-pt1');
  const pt2El = measureLayer.querySelector('.pf-chart-measure-pt2');
  const badge = measureLayer.querySelector('.pf-chart-measure-badge');
  const badgeBg = measureLayer.querySelector('.pf-chart-measure-badge-bg');
  const badgeText = measureLayer.querySelector('.pf-chart-measure-badge-text');

  if (boxEl) {
    boxEl.setAttribute('x', leftX.toFixed(1));
    boxEl.setAttribute('y', topY.toFixed(1));
    boxEl.setAttribute('width', boxW.toFixed(1));
    boxEl.setAttribute('height', boxH.toFixed(1));
  }
  if (diagEl) {
    diagEl.setAttribute('x1', x1.toFixed(1));
    diagEl.setAttribute('y1', y1.toFixed(1));
    diagEl.setAttribute('x2', x2.toFixed(1));
    diagEl.setAttribute('y2', y2.toFixed(1));
  }
  if (pt1El) {
    pt1El.setAttribute('cx', x1.toFixed(1));
    pt1El.setAttribute('cy', y1.toFixed(1));
  }
  if (pt2El) {
    pt2El.setAttribute('cx', x2.toFixed(1));
    pt2El.setAttribute('cy', y2.toFixed(1));
  }

  const isRatio = VAL_CHART_METRICS[metricKey]?.format === 'ratio';
  const formatSignedVal = (v) => {
    const s = v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
    return isRatio ? `${s}%` : `${s}x`;
  };

  // Badge on SVG
  if (badge && badgeBg && badgeText) {
    const badgeStr = `${formatSignedVal(deltaVal)} (${formatSignedPct(deltaPct)}) · ${diffDays}d`;
    const badgeW = Math.max(96, badgeStr.length * 6.8 + 20);
    const midBadgeX = Math.max(pad.left + badgeW / 2 + 4, Math.min(width - pad.right - badgeW / 2 - 4, (x1 + x2) / 2));
    const badgeY = Math.max(pad.top + 14, Math.min(height - pad.bottom - 14, topY - 10 < pad.top + 8 ? bottomY + 12 : topY - 10));

    badge.setAttribute('transform', `translate(${midBadgeX.toFixed(1)}, ${badgeY.toFixed(1)})`);
    badgeBg.setAttribute('x', (-badgeW / 2).toFixed(1));
    badgeBg.setAttribute('width', badgeW.toFixed(1));
    badgeText.textContent = badgeStr;
  }

  measureLayer.style.display = 'inline';
  measureLayer.removeAttribute('hidden');

  // Floating detailed tooltip
  const tip = ensureChartTooltip();
  const startStr = formatTradingViewHoverDate(pt1.date);
  const endStr = formatTradingViewHoverDate(pt2.date);
  const daysLabel = diffDays === 1 ? '1 día' : `${diffDays} días`;
  const sessionsLabel = sessions === 1 ? '1 sesión' : `${sessions} sesiones`;
  const valClass = deltaVal > 0 ? 'positive' : deltaVal < 0 ? 'negative' : '';
  const metricLabel = VAL_CHART_METRICS[metricKey]?.label || 'Valoración';

  tip.innerHTML = `
    <div class="pf-measure-tooltip-head">
      <div class="pf-measure-badge-tag negative">📏 Medición de ${escapeHtml(metricLabel)}</div>
      <div class="pf-measure-period">${escapeHtml(startStr)} → ${escapeHtml(endStr)}</div>
      <div class="pf-measure-sub">${daysLabel} naturales · ${sessionsLabel}</div>
    </div>
    <div class="pf-measure-tooltip-body">
      <div class="pf-measure-row">
        <div class="pf-measure-row-left">
          <span class="pf-chart-tooltip-dot" style="background:#ef4444"></span>
          <span class="pf-measure-name">Nivel inicial</span>
        </div>
        <div class="pf-measure-row-right">
          <strong class="pf-measure-diff">${escapeHtml(formatValChartAxis(val1, metricKey))}</strong>
        </div>
      </div>
      <div class="pf-measure-row">
        <div class="pf-measure-row-left">
          <span class="pf-chart-tooltip-dot" style="background:#ef4444"></span>
          <span class="pf-measure-name">Nivel actual</span>
        </div>
        <div class="pf-measure-row-right">
          <strong class="pf-measure-diff">${escapeHtml(formatValChartAxis(val2, metricKey))}</strong>
        </div>
      </div>
      <div class="pf-measure-row" style="border-top: 1px solid rgba(255,255,255,0.12); padding-top: 5px; margin-top: 2px;">
        <div class="pf-measure-row-left">
          <span class="pf-measure-name" style="font-weight: 700; color: #ffffff;">Variación (Δ)</span>
        </div>
        <div class="pf-measure-row-right">
          <strong class="pf-measure-diff ${valClass}" style="font-size: 12.5px;">${escapeHtml(formatSignedVal(deltaVal))} (${formatSignedPct(deltaPct)})</strong>
        </div>
      </div>
    </div>`;
  tip.hidden = false;
  if (clientX !== undefined && clientY !== undefined) {
    positionChartTooltip(tip, clientX, clientY);
  }
}

function onValMeasurePointerMove(event) {
  if (!isValMeasuring) return;
  if (event.buttons === 0) {
    onValMeasurePointerUp(event);
    return;
  }
  updateValuationMeasurementView(event.clientX, event.clientY);
}

function onValMeasurePointerUp(event) {
  if (!isValMeasuring) return;
  if (event && event.button !== undefined && event.button !== valMeasureStartButton && event.button !== 0 && event.button !== 2 && event.buttons !== 0) return;
  isValMeasuring = false;
  const canvasInner = document.querySelector('[data-val-canvas-inner]');
  if (canvasInner) canvasInner.classList.remove('measuring');
  window.removeEventListener('pointermove', onValMeasurePointerMove);
  window.removeEventListener('mousemove', onValMeasurePointerMove);
  window.removeEventListener('pointerup', onValMeasurePointerUp);
  window.removeEventListener('mouseup', onValMeasurePointerUp);

  const measureLayer = document.querySelector('#val-chart .pf-chart-measure-layer');
  if (measureLayer) {
    measureLayer.style.display = 'none';
    measureLayer.setAttribute('hidden', '');
  }
  hideValuationChartTooltip();
}

function renderValuationChart() {
  const peAdjustToggleEl = document.querySelector('#val-chart-pe-adjust-toggle');
  if (peAdjustToggleEl) {
    peAdjustToggleEl.style.display = (valChartMetric === 'peRatio' || valChartMetric === 'payoutRatio') ? 'inline-flex' : 'none';
  }

  const timelineWrap = document.querySelector('#val-timeline-wrap');
  const zoomGroup = document.querySelector('#val-zoom-group');
  const measureBtn = document.querySelector('#val-measure-btn');

  if (valChartMetric === 'netDebtToEbitda') {
    if (timelineWrap) timelineWrap.hidden = true;
    if (zoomGroup) zoomGroup.style.display = 'none';
    if (measureBtn) measureBtn.style.display = 'none';
    renderAnnualNetDebtEbitdaChart();
    return;
  }
  if (timelineWrap) timelineWrap.hidden = false;
  if (zoomGroup) zoomGroup.style.display = '';
  if (measureBtn) measureBtn.style.display = '';

  const svg = document.querySelector('#val-chart');
  const wrap = document.querySelector('#val-chart-body');
  const valBlock = document.querySelector('#val-chart-block');
  const message = document.querySelector('#val-chart-message');
  if (!svg || !wrap) return;

  const { isFs, width, height, pad, innerWidth, innerHeight } = getCompanyChartGeometry(valBlock);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  if (!valChartPoints.length) {
    svg.innerHTML = '';
    if (message) {
      message.textContent = 'No se pudo cargar la evolución de múltiplos.';
      message.hidden = false;
    }
    valChartState = null;
    hideValuationChartTooltip();
    return;
  }
  if (message) message.hidden = true;

  if (valSliceEnd === 0 && valChartPoints.length > 0) {
    valSliceEnd = valChartPoints.length - 1;
  }
  const points = valChartPoints.slice(valSliceStart, valSliceEnd + 1);
  if (!points.length) {
    svg.innerHTML = '';
    valChartState = null;
    hideValuationChartTooltip();
    return;
  }

  const metricKey = valChartMetric;
  let effectiveKey = metricKey;
  if (metricKey === 'peRatio') {
    effectiveKey = valPeAdjusted ? 'peRatioNormalized' : 'peRatio';
  } else if (metricKey === 'payoutRatio') {
    effectiveKey = valPeAdjusted ? 'payoutRatioNormalized' : 'payoutRatio';
  }
  const allowNegative = metricKey === 'netDebtToEbitda';
  const allowZero = metricKey === 'payoutRatio' || metricKey === 'dividendYield' || allowNegative;

  const values = points.map((point) => Number(point[effectiveKey]))
    .filter((value) => Number.isFinite(value) && value !== null && (allowZero ? (allowNegative ? true : value >= 0) : value > 0));

  const allVisibleValues = values.length ? values : [0];
  const currentVal = allVisibleValues[allVisibleValues.length - 1];
  const minVal = Math.min(...allVisibleValues);
  const maxVal = Math.max(...allVisibleValues);
  const avgVal = allVisibleValues.reduce((sum, v) => sum + v, 0) / allVisibleValues.length;

  const currentEl = document.querySelector('#val-stat-current');
  const avgEl = document.querySelector('#val-stat-avg');
  const minEl = document.querySelector('#val-stat-min');
  const maxEl = document.querySelector('#val-stat-max');
  if (currentEl) currentEl.textContent = formatValChartAxis(currentVal, metricKey);
  if (avgEl) avgEl.textContent = formatValChartAxis(avgVal, metricKey);
  if (minEl) minEl.textContent = formatValChartAxis(minVal, metricKey);
  if (maxEl) maxEl.textContent = formatValChartAxis(maxVal, metricKey);

  const { min, max, ticks } = computeValuationScale(allVisibleValues, allowNegative);

  const x = (index) => pad.left + (index / Math.max(1, points.length - 1)) * innerWidth;
  const y = (value) => pad.top + (1 - (value - min) / (max - min)) * innerHeight;

  const yLabelFontSize = isFs ? '11px' : '10px';
  const xLabelFontSize = isFs ? '11px' : '10.5px';
  const strokeW = isFs ? '2.8' : '2.2';

  const gridLines = ticks.map((value) => {
    const tickY = y(value);
    return `
      <line x1="${pad.left}" y1="${tickY.toFixed(1)}" x2="${width - pad.right}" y2="${tickY.toFixed(1)}" class="chart-grid"/>
      <text x="${(width - pad.right + 8).toFixed(1)}" y="${(tickY + 3.5).toFixed(1)}" class="chart-label" font-size="${yLabelFontSize}" text-anchor="start">${escapeHtml(formatValChartAxis(value, metricKey))}</text>`;
  }).join('');

  const dateTicks = getTradingViewDateTicks(points, x, pad, width);
  const vGridLines = dateTicks.map((tick) => `
    <line x1="${tick.x.toFixed(1)}" y1="${pad.top}" x2="${tick.x.toFixed(1)}" y2="${height - pad.bottom}" class="chart-grid"/>
    <text x="${tick.x.toFixed(1)}" y="${height - 8}" class="chart-label chart-label-x ${tick.isMajor ? 'major' : ''}" font-size="${xLabelFontSize}" text-anchor="middle">${escapeHtml(tick.label)}</text>
  `).join('');

  const axisBaselines = `
    <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="pf-chart-axis-baseline"/>
    <line x1="${width - pad.right}" y1="${pad.top}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="pf-chart-axis-baseline"/>
  `;

  // Línea de la media del periodo
  const avgY = y(avgVal);
  const avgLine = Number.isFinite(avgVal) ? `
    <line x1="${pad.left}" y1="${avgY.toFixed(1)}" x2="${(width - pad.right).toFixed(1)}" y2="${avgY.toFixed(1)}" stroke="#64748b" stroke-dasharray="4,4" stroke-width="1.2" opacity="0.6"/>
    <text x="${(width - pad.right - 8).toFixed(1)}" y="${(avgY - 5).toFixed(1)}" text-anchor="end" fill="#64748b" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10.5" font-weight="600">Media: ${formatValChartAxis(avgVal, metricKey)}</text>
  ` : '';

  let lineSegments = [];
  let currentSegment = [];

  points.forEach((point, index) => {
    const value = Number(point[effectiveKey]);
    if (Number.isFinite(value) && (allowZero ? (allowNegative ? true : value >= 0) : value > 0)) {
      currentSegment.push({ x: x(index), y: y(value) });
    } else if (currentSegment.length) {
      lineSegments.push(currentSegment);
      currentSegment = [];
    }
  });
  if (currentSegment.length) lineSegments.push(currentSegment);

  let pathsHtml = '';
  const baselineY = allowNegative && min < 0 && max > 0 ? y(0) : (height - pad.bottom);
  lineSegments.forEach((segment) => {
    if (!segment.length) return;
    const linePath = segment.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${segment[segment.length - 1].x.toFixed(1)} ${baselineY.toFixed(1)} L${segment[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
    pathsHtml += `<path d="${areaPath}" fill="url(#val-area-gradient)"/>`;
    pathsHtml += `<path d="${linePath}" fill="none" stroke="var(--accent)" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round"/>`;
  });

  const lastPoint = points[points.length - 1];
  const lastPointVal = Number(lastPoint?.[effectiveKey]);
  let lastTag = '';
  if (Number.isFinite(lastPointVal) && (allowZero ? (allowNegative ? true : lastPointVal >= 0) : lastPointVal > 0)) {
    const lastY = y(lastPointVal);
    lastTag = `
      <rect x="${width - pad.right + 4}" y="${(lastY - 9).toFixed(1)}" width="${pad.right - 8}" height="18" rx="3" class="chart-tag"/>
      <text x="${width - pad.right + 8}" y="${(lastY + 4).toFixed(1)}" class="chart-tag-text">${escapeHtml(formatValChartAxis(lastPointVal, metricKey))}</text>
    `;
  }

  svg.innerHTML = `
    <defs>
      <linearGradient id="val-area-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28"/>
        <stop offset="95%" stop-color="var(--accent)" stop-opacity="0.01"/>
      </linearGradient>
    </defs>
    ${gridLines}
    ${vGridLines}
    ${axisBaselines}
    ${avgLine}
    ${pathsHtml}
    ${lastTag}
    <g class="pf-chart-measure-layer" style="display:none;">
      <rect class="pf-chart-measure-box" x="0" y="0" width="0" height="0" fill="rgba(239, 68, 68, 0.08)" stroke="rgba(220, 38, 38, 0.65)" stroke-width="1.4" stroke-dasharray="4 3" rx="2" ry="2"/>
      <line class="pf-chart-measure-diagonal" x1="0" y1="0" x2="0" y2="0" stroke="rgba(220, 38, 38, 0.85)" stroke-width="1.8" stroke-dasharray="5 3"/>
      <circle class="pf-chart-measure-pt1" cx="0" cy="0" r="4" fill="#dc2626" stroke="#ffffff" stroke-width="1.4"/>
      <circle class="pf-chart-measure-pt2" cx="0" cy="0" r="4" fill="#dc2626" stroke="#ffffff" stroke-width="1.4"/>
      <g class="pf-chart-measure-badge" transform="translate(0, 0)">
        <rect class="pf-chart-measure-badge-bg" x="-54" y="-12" width="108" height="24" rx="5" ry="5" fill="#1e1b1b" fill-opacity="0.94" stroke="rgba(239, 68, 68, 0.35)" stroke-width="0.9"/>
        <text class="pf-chart-measure-badge-text" x="0" y="4" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="600">--</text>
      </g>
    </g>
    <g class="pf-chart-compare-layer" style="display:none; pointer-events:none;">
      <rect class="pf-chart-compare-band" x="0" y="${pad.top}" width="0" height="${innerHeight}" fill="rgba(34, 197, 94, 0.13)"/>
      <line class="pf-chart-compare-v1" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}" stroke="rgba(255, 255, 255, 0.45)" stroke-width="1.2" stroke-dasharray="3 3"/>
      <line class="pf-chart-compare-v2" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}" stroke="rgba(255, 255, 255, 0.45)" stroke-width="1.2" stroke-dasharray="3 3"/>
      <line class="pf-chart-compare-baseline" x1="0" y1="0" x2="0" y2="0" stroke="rgba(255, 255, 255, 0.3)" stroke-width="1" stroke-dasharray="2 2"/>
      <line class="pf-chart-compare-connector" x1="0" y1="0" x2="0" y2="0" stroke="#16a34a" stroke-width="1.8" stroke-dasharray="4 2"/>
      <circle class="pf-chart-compare-pt1-halo" cx="0" cy="0" r="9" fill="#16a34a" fill-opacity="0.25"/>
      <circle class="pf-chart-compare-pt1" cx="0" cy="0" r="4.5" fill="#16a34a" stroke="#ffffff" stroke-width="2"/>
      <circle class="pf-chart-compare-pt2-halo" cx="0" cy="0" r="9" fill="#16a34a" fill-opacity="0.25"/>
      <circle class="pf-chart-compare-pt2" cx="0" cy="0" r="5" fill="#16a34a" stroke="#ffffff" stroke-width="2"/>
      <g class="pf-chart-compare-badge" transform="translate(0, 0)">
        <rect class="pf-chart-compare-badge-bg" x="-60" y="-13" width="120" height="26" rx="6" ry="6" fill="#18181b" fill-opacity="0.95" stroke="#16a34a" stroke-width="1.2"/>
        <text class="pf-chart-compare-badge-text" x="0" y="4" text-anchor="middle" fill="#16a34a" font-size="12" font-weight="700">--</text>
      </g>
    </g>
    <g class="pf-chart-hover-layer" style="display: none; pointer-events: none;">
      <line class="pf-chart-crosshair pf-chart-crosshair-v" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}"/>
      <line class="pf-chart-crosshair pf-chart-crosshair-h" x1="${pad.left}" y1="0" x2="${width - pad.right}" y2="0"/>
      <g class="pf-chart-hover-dot-wrap" transform="translate(0, 0)">
        <circle class="pf-chart-hover-dot-halo" r="10" fill="var(--accent)" fill-opacity="0.25"/>
        <circle class="pf-chart-hover-dot" r="5" fill="#ffffff" stroke="var(--accent)" stroke-width="2.6"/>
      </g>
      <g class="pf-chart-x-badge" transform="translate(0, ${height - pad.bottom})">
        <rect class="pf-chart-x-badge-bg" x="-42" y="2" width="84" height="20" rx="4" ry="4"/>
        <text class="pf-chart-x-badge-text" x="0" y="16" text-anchor="middle">--</text>
      </g>
      <g class="pf-chart-y-badge" transform="translate(${width - pad.right + 6}, 0)">
        <path class="pf-chart-y-badge-arrow" d="M -5,0 L 0,-6 L 0,6 Z" fill="var(--accent)"/>
        <rect class="pf-chart-y-badge-bg" x="0" y="-10" width="${pad.right - 8}" height="20" rx="3" fill="var(--accent)"/>
        <text class="pf-chart-y-badge-text" x="${(pad.right - 8) / 2}" y="0" text-anchor="middle">--</text>
      </g>
    </g>
    <rect class="pf-chart-overlay" x="${pad.left}" y="${pad.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent" cursor="crosshair"/>
  `;

  valChartState = { isBarChart: false, points, metricKey, effectiveKey, allowNegative, allowZero, x, y, pad, height, width, scale: { min, max } };
  updateValTimelineSliderUi();
}

function updateValuationChartHover(event) {
  if (isValMeasuring || isValComparing) return;
  if (isValPanning && valPanMoved) return;
  if (!valChartState || valChartState.isBarChart) return;
  const svg = document.querySelector('#val-chart');
  const valBlock = document.querySelector('#val-chart-block');
  const hoverLayer = svg?.querySelector('.pf-chart-hover-layer');
  const crosshairV = svg?.querySelector('.pf-chart-crosshair-v');
  const crosshairH = svg?.querySelector('.pf-chart-crosshair-h');
  const hoverDot = svg?.querySelector('.pf-chart-hover-dot');
  const hoverXBadge = svg?.querySelector('.pf-chart-x-badge');
  const hoverXBadgeText = svg?.querySelector('.pf-chart-x-badge-text');
  const hoverYBadge = svg?.querySelector('.pf-chart-y-badge');
  const hoverYBadgeBg = svg?.querySelector('.pf-chart-y-badge-bg');
  const hoverYBadgeText = svg?.querySelector('.pf-chart-y-badge-text');
  if (!svg || !hoverLayer || !crosshairV || !crosshairH || !hoverDot) return;

  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const { points, metricKey, effectiveKey, allowNegative, allowZero, x, y, pad, height, width } = valChartState;
  const keyToUse = effectiveKey || metricKey;

  const rawSvgX = ((event.clientX - rect.left) / rect.width) * width;
  const rawSvgY = ((event.clientY - rect.top) / rect.height) * height;

  if (rawSvgX < pad.left - 20 || rawSvgX > width - pad.right + 20 || rawSvgY < pad.top - 30 || rawSvgY > height - pad.bottom + 30) {
    hoverLayer.style.display = 'none';
    hideValuationChartTooltip();
    return;
  }

  const cursorSvgX = Math.max(pad.left, Math.min(width - pad.right, rawSvgX));
  const innerWidth = width - pad.left - pad.right;
  const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));
  const best = Math.round(ratio * (points.length - 1));
  const point = points[best];
  const value = Number(point?.[keyToUse]);
  if (!Number.isFinite(value) || (!allowZero && value <= 0)) {
    hoverLayer.style.display = 'none';
    hideValuationChartTooltip();
    return;
  }

  const cx = x(best);
  const cy = y(value);

  hoverLayer.removeAttribute('hidden');
  hoverLayer.style.display = 'inline';
  crosshairV.setAttribute('x1', cx.toFixed(1));
  crosshairV.setAttribute('x2', cx.toFixed(1));
  crosshairH.setAttribute('y1', cy.toFixed(1));
  crosshairH.setAttribute('y2', cy.toFixed(1));

  const dotWrap = svg.querySelector('.pf-chart-hover-dot-wrap');
  if (dotWrap) {
    dotWrap.setAttribute('transform', `translate(${cx.toFixed(1)}, ${cy.toFixed(1)})`);
  } else {
    hoverDot.setAttribute('cx', cx.toFixed(1));
    hoverDot.setAttribute('cy', cy.toFixed(1));
  }

  if (hoverXBadge && hoverXBadgeText) {
    hoverXBadge.setAttribute('transform', `translate(${cx.toFixed(1)}, ${height - pad.bottom})`);
    hoverXBadgeText.textContent = formatTradingViewHoverDate(point.date);
  }

  if (hoverYBadge && hoverYBadgeText) {
    const formatted = formatValChartAxis(value, metricKey);
    const badgeW = Math.max(pad.right - 8, formatted.length * 7 + 14);
    const clampedY = Math.max(pad.top + 10, Math.min(height - pad.bottom - 10, cy));
    const bx = width - pad.right + 6;
    hoverYBadge.setAttribute('transform', `translate(${bx.toFixed(1)}, ${clampedY.toFixed(1)})`);
    if (hoverYBadgeBg) {
      hoverYBadgeBg.setAttribute('width', badgeW.toFixed(1));
      hoverYBadgeBg.setAttribute('fill', 'var(--accent)');
    }
    const arrowEl = hoverYBadge.querySelector('.pf-chart-y-badge-arrow');
    if (arrowEl) arrowEl.setAttribute('fill', 'var(--accent)');
    hoverYBadgeText.setAttribute('x', (badgeW / 2).toFixed(1));
    hoverYBadgeText.textContent = formatted;
    hoverYBadge.hidden = false;
    hoverYBadge.style.display = 'inline';
  }

  const tooltip = ensureChartTooltip();
  const metric = VAL_CHART_METRICS[metricKey] ?? VAL_CHART_METRICS.evEbitda;
  const label = (metricKey === 'peRatio')
    ? (valPeAdjusted ? 'PER (Ajustado)' : 'PER (Normal)')
    : (metricKey === 'payoutRatio'
      ? (valPeAdjusted ? 'Payout (Ajustado)' : 'Payout (Normal)')
      : metric.label);
  const isNetCash = metricKey === 'netDebtToEbitda' && value < 0;
  let extraInfo = '';
  if (metricKey === 'netDebtToEbitda') {
    if (Number.isFinite(Number(point?.netDebt))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">Deuda Neta: ${formatProfileCompactUsd(point.netDebt)}</span>`;
    if (Number.isFinite(Number(point?.ebitdaTtm))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">EBITDA (TTM): ${formatProfileCompactUsd(point.ebitdaTtm)}</span>`;
  } else if (metricKey === 'evEbitda') {
    if (Number.isFinite(Number(point?.enterpriseValue))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">EV: ${formatProfileCompactUsd(point.enterpriseValue)}</span>`;
    if (Number.isFinite(Number(point?.ebitdaTtm))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">EBITDA (TTM): ${formatProfileCompactUsd(point.ebitdaTtm)}</span>`;
  } else if (metricKey === 'peRatio') {
    const epsVal = valPeAdjusted ? point?.epsNormalizedTtm : point?.epsTtm;
    if (Number.isFinite(Number(epsVal))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">${valPeAdjusted ? 'BPA ajustado' : 'BPA normal'}: ${formatProfilePrice(epsVal)}</span>`;
  } else if (metricKey === 'priceToFcf') {
    if (Number.isFinite(Number(point?.fcfPerShareTtm))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">FCF / acción (TTM): ${formatProfilePrice(point.fcfPerShareTtm)}</span>`;
    else if (Number.isFinite(Number(point?.fcfTtm))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">FCF (TTM): ${formatProfileCompactUsd(point.fcfTtm)}</span>`;
  } else if (metricKey === 'payoutRatio') {
    if (Number.isFinite(Number(point?.dpsTtm))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">Dividendo / acción (TTM): ${formatProfilePrice(point.dpsTtm)}</span>`;
    const epsVal = valPeAdjusted ? point?.epsNormalizedTtm : point?.epsTtm;
    if (Number.isFinite(Number(epsVal))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">${valPeAdjusted ? 'BPA ajustado' : 'BPA normal'}: ${formatProfilePrice(epsVal)}</span>`;
  }
  tooltip.innerHTML = `<strong>${escapeHtml(formatValChartDate(point?.date))}</strong>
    <span style="color:#94a3b8;font-size:11px;">${escapeHtml(label)}</span>
    <b style="font-size:15px;color:#fff;margin:2px 0;">${escapeHtml(formatValChartAxis(value, metricKey))} ${isNetCash ? '<small style="color:#4ade80;font-size:11px;">(Caja Neta)</small>' : ''}</b>
    ${extraInfo}
    <span style="color:#cbd5e1;font-size:11px;">Cotización: ${formatProfilePrice(point?.price)}</span>`;
  tooltip.hidden = false;
  positionChartTooltip(tooltip, event.clientX, event.clientY);

  if (Number.isFinite(Number(point?.price))) {
    setQuoteDisplay({
      price: Number(point.price),
      change: null,
      changePercent: null,
      dateText: `Sesión ${formatTradingViewHoverDate(point?.date)}`,
      isHover: true,
      maValue: null,
    });
  }

  const valQuoteBadge = document.querySelector('#val-chart-quote-badge');
  const valQuotePrice = document.querySelector('#val-chart-quote-price');
  const valQuoteMetric = document.querySelector('#val-chart-quote-metric');
  const valQuoteDate = document.querySelector('#val-chart-quote-date');
  if (valQuoteBadge) {
    valQuoteBadge.style.display = 'inline-flex';
    if (valQuotePrice) valQuotePrice.textContent = Number.isFinite(Number(point?.price)) ? `${formatProfileNumber(point.price)} $` : '—';
    if (valQuoteMetric) valQuoteMetric.textContent = `${label}: ${formatValChartAxis(value, metricKey)}`;
    if (valQuoteDate) valQuoteDate.textContent = `· ${formatTradingViewHoverDate(point?.date)}`;
  }
}

function hideValuationChartTooltip() {
  if (isValMeasuring || isValComparing) return;
  hideChartTooltip();
  const hover = document.querySelector('#val-chart .pf-chart-hover-layer');
  if (hover) hover.style.display = 'none';
  const valQuoteBadge = document.querySelector('#val-chart-quote-badge');
  if (valQuoteBadge) valQuoteBadge.style.display = 'none';
  restoreQuoteDisplay();
}

function getValChartPointIndex(clientX) {
  if (!valChartPoints.length) return 0;
  const points = valChartPoints.slice(valSliceStart, valSliceEnd + 1);
  if (!points.length) return 0;
  const svgEl = document.querySelector('#val-chart');
  if (!svgEl) return 0;
  const rect = svgEl.getBoundingClientRect();
  if (!rect.width) return 0;
  const valBlock = document.querySelector('#val-chart-block');
  const { width, pad, innerWidth } = getCompanyChartGeometry(valBlock);
  const curSvgX = ((clientX - rect.left) / rect.width) * width;
  const clampedX = Math.max(pad.left, Math.min(width - pad.right, curSvgX));
  const ratio = Math.max(0, Math.min(1, (clampedX - pad.left) / innerWidth));
  return Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
}

function startValComparison(event) {
  if (!valChartPoints.length || !valChartState || valChartState.isBarChart) return;
  const points = valChartPoints.slice(valSliceStart, valSliceEnd + 1);
  if (!points.length) return;

  isValComparing = true;
  valCompareStartIdx = getValChartPointIndex(event.clientX);
  valCompareCurrentIdx = valCompareStartIdx;

  const canvasInner = document.querySelector('[data-val-canvas-inner]');
  if (canvasInner) canvasInner.classList.add('comparing');

  const hoverLayer = document.querySelector('#val-chart .pf-chart-hover-layer');
  if (hoverLayer) hoverLayer.style.display = 'none';
  hideValuationChartTooltip();

  updateValComparisonView(event.clientX, event.clientY);

  window.addEventListener('pointermove', onValComparePointerMove);
  window.addEventListener('mousemove', onValComparePointerMove);
  window.addEventListener('pointerup', onValComparePointerUp);
  window.addEventListener('mouseup', onValComparePointerUp);
}

function onValComparePointerMove(event) {
  if (!isValComparing) return;
  if (event.buttons !== undefined && (event.buttons & 2) === 0 && event.buttons === 0) {
    onValComparePointerUp(event);
    return;
  }
  valCompareCurrentIdx = getValChartPointIndex(event.clientX);
  updateValComparisonView(event.clientX, event.clientY);
}

function onValComparePointerUp(event) {
  if (!isValComparing) return;
  if (event && event.button !== undefined && event.button !== 2 && event.buttons !== 0 && (event.buttons & 2) !== 0) return;
  clearValComparison();
}

function clearValComparison() {
  isValComparing = false;
  const canvasInner = document.querySelector('[data-val-canvas-inner]');
  if (canvasInner) canvasInner.classList.remove('comparing');

  window.removeEventListener('pointermove', onValComparePointerMove);
  window.removeEventListener('mousemove', onValComparePointerMove);
  window.removeEventListener('pointerup', onValComparePointerUp);
  window.removeEventListener('mouseup', onValComparePointerUp);

  const compareLayer = document.querySelector('#val-chart .pf-chart-compare-layer');
  if (compareLayer) {
    compareLayer.style.display = 'none';
    compareLayer.setAttribute('hidden', '');
  }
  hideChartTooltip();
}

function updateValComparisonView(clientX, clientY) {
  if (!isValComparing || !valChartState || valChartState.isBarChart) return;
  const points = valChartState.points;
  if (!points?.length) return;

  const svgEl = document.querySelector('#val-chart');
  const compareLayer = svgEl?.querySelector('.pf-chart-compare-layer');
  if (!svgEl || !compareLayer) return;

  const { metricKey, effectiveKey, allowNegative, allowZero, x, y, pad, height, width, scale } = valChartState;
  const keyToUse = effectiveKey || metricKey;
  const { min, max } = scale || { min: 0, max: 1 };

  const idx1 = Math.max(0, Math.min(points.length - 1, valCompareStartIdx ?? 0));
  const idx2 = Math.max(0, Math.min(points.length - 1, valCompareCurrentIdx ?? idx1));

  const pt1 = points[idx1] || points[0];
  const pt2 = points[idx2] || points[points.length - 1];
  const val1 = Number(pt1?.[keyToUse]);
  const val2 = Number(pt2?.[keyToUse]);
  if (!Number.isFinite(val1) || !Number.isFinite(val2)) return;

  const deltaVal = val2 - val1;
  const deltaPct = val1 !== 0 ? ((val2 - val1) / Math.abs(val1)) * 100 : 0;

  const x1 = x(idx1);
  const y1 = y(val1);
  const x2 = x(idx2);
  const y2 = y(val2);

  const leftX = Math.min(x1, x2);
  const rightX = Math.max(x1, x2);
  const bandW = Math.max(1, rightX - leftX);
  const innerHeight = height - pad.top - pad.bottom;

  const isPositive = deltaVal >= 0;
  const themeColor = isPositive ? '#16a34a' : '#dc2626';
  const bandFill = isPositive ? 'rgba(34, 197, 94, 0.13)' : 'rgba(239, 68, 68, 0.13)';
  const haloColor = isPositive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)';

  const bandEl = compareLayer.querySelector('.pf-chart-compare-band');
  const v1El = compareLayer.querySelector('.pf-chart-compare-v1');
  const v2El = compareLayer.querySelector('.pf-chart-compare-v2');
  const baseEl = compareLayer.querySelector('.pf-chart-compare-baseline');
  const connEl = compareLayer.querySelector('.pf-chart-compare-connector');
  const pt1El = compareLayer.querySelector('.pf-chart-compare-pt1');
  const pt1Halo = compareLayer.querySelector('.pf-chart-compare-pt1-halo');
  const pt2El = compareLayer.querySelector('.pf-chart-compare-pt2');
  const pt2Halo = compareLayer.querySelector('.pf-chart-compare-pt2-halo');
  const badge = compareLayer.querySelector('.pf-chart-compare-badge');
  const badgeBg = compareLayer.querySelector('.pf-chart-compare-badge-bg');
  const badgeText = compareLayer.querySelector('.pf-chart-compare-badge-text');

  if (bandEl) {
    bandEl.setAttribute('x', leftX.toFixed(1));
    bandEl.setAttribute('y', pad.top.toFixed(1));
    bandEl.setAttribute('width', bandW.toFixed(1));
    bandEl.setAttribute('height', innerHeight.toFixed(1));
    bandEl.setAttribute('fill', bandFill);
  }
  if (v1El) {
    v1El.setAttribute('x1', x1.toFixed(1));
    v1El.setAttribute('y1', pad.top.toFixed(1));
    v1El.setAttribute('x2', x1.toFixed(1));
    v1El.setAttribute('y2', (height - pad.bottom).toFixed(1));
  }
  if (v2El) {
    v2El.setAttribute('x1', x2.toFixed(1));
    v2El.setAttribute('y1', pad.top.toFixed(1));
    v2El.setAttribute('x2', x2.toFixed(1));
    v2El.setAttribute('y2', (height - pad.bottom).toFixed(1));
  }
  if (baseEl) {
    baseEl.setAttribute('x1', leftX.toFixed(1));
    baseEl.setAttribute('y1', y1.toFixed(1));
    baseEl.setAttribute('x2', rightX.toFixed(1));
    baseEl.setAttribute('y2', y1.toFixed(1));
  }
  if (connEl) {
    connEl.setAttribute('x1', x1.toFixed(1));
    connEl.setAttribute('y1', y1.toFixed(1));
    connEl.setAttribute('x2', x2.toFixed(1));
    connEl.setAttribute('y2', y2.toFixed(1));
    connEl.setAttribute('stroke', themeColor);
  }
  if (pt1El) {
    pt1El.setAttribute('cx', x1.toFixed(1));
    pt1El.setAttribute('cy', y1.toFixed(1));
    pt1El.setAttribute('fill', themeColor);
  }
  if (pt1Halo) {
    pt1Halo.setAttribute('cx', x1.toFixed(1));
    pt1Halo.setAttribute('cy', y1.toFixed(1));
    pt1Halo.setAttribute('fill', haloColor);
  }
  if (pt2El) {
    pt2El.setAttribute('cx', x2.toFixed(1));
    pt2El.setAttribute('cy', y2.toFixed(1));
    pt2El.setAttribute('fill', themeColor);
  }
  if (pt2Halo) {
    pt2Halo.setAttribute('cx', x2.toFixed(1));
    pt2Halo.setAttribute('cy', y2.toFixed(1));
    pt2Halo.setAttribute('fill', haloColor);
  }

  const arrow = deltaVal > 0 ? '▲ ' : (deltaVal < 0 ? '▼ ' : '');
  const deltaStr = `${arrow}${formatValChartAxis(deltaVal, metricKey)} (${formatSignedPct(deltaPct)})`;

  if (badge && badgeBg && badgeText) {
    const badgeW = Math.max(116, deltaStr.length * 7.5 + 24);
    const midX = Math.max(pad.left + badgeW / 2 + 6, Math.min(width - pad.right - badgeW / 2 - 6, (x1 + x2) / 2));
    const topY = Math.min(y1, y2);
    let badgeY = topY - 18;
    if (badgeY < pad.top + 16) {
      badgeY = Math.max(y1, y2) + 24;
    }
    if (badgeY > height - pad.bottom - 14) {
      badgeY = pad.top + 20;
    }

    badge.setAttribute('transform', `translate(${midX.toFixed(1)}, ${badgeY.toFixed(1)})`);
    badgeBg.setAttribute('x', (-badgeW / 2).toFixed(1));
    badgeBg.setAttribute('width', badgeW.toFixed(1));
    badgeBg.setAttribute('stroke', themeColor);
    badgeText.setAttribute('fill', themeColor);
    badgeText.textContent = deltaStr;
  }

  compareLayer.style.display = 'inline';
  compareLayer.removeAttribute('hidden');

  // Floating detailed tooltip (igual que la comparación del gráfico de cotización)
  const tip = ensureChartTooltip();
  const metric = VAL_CHART_METRICS[metricKey] ?? VAL_CHART_METRICS.evEbitda;
  const label = (metricKey === 'peRatio')
    ? (valPeAdjusted ? 'PER (Ajustado)' : 'PER (Normal)')
    : (metricKey === 'payoutRatio'
      ? (valPeAdjusted ? 'Payout (Ajustado)' : 'Payout (Normal)')
      : metric.label);
  const d1 = new Date(`${pt1.date}T00:00:00Z`);
  const d2 = new Date(`${pt2.date}T00:00:00Z`);
  const diffDays = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
  const sessions = Math.abs(idx2 - idx1) + 1;
  const startStr = formatTradingViewHoverDate(pt1.date);
  const endStr = formatTradingViewHoverDate(pt2.date);
  const sessionsLabel = sessions === 1 ? '1 sesión' : `${sessions} sesiones`;
  const daysLabel = diffDays === 1 ? '1 día' : `${diffDays} días`;

  tip.innerHTML = `
    <div class="pf-compare-tooltip-head" style="margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 5px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <span style="font-size: 11px; font-weight: 700; color: ${themeColor}; text-transform: uppercase; letter-spacing: 0.5px;">
          ${isPositive ? '▲ Subida' : '▼ Caída'} · Comparación de ${escapeHtml(label)}
        </span>
        <span style="font-size: 10.5px; color: #94a3b8;">${sessionsLabel} · ${daysLabel}</span>
      </div>
      <div style="font-size: 11px; color: #cbd5e1; margin-top: 3px;">
        ${escapeHtml(startStr)} → ${escapeHtml(endStr)}
      </div>
    </div>
    <div class="pf-compare-tooltip-body" style="font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #94a3b8;">Inicio (${escapeHtml(pt1.date)}):</span>
        <strong style="color: #ffffff;">${escapeHtml(formatValChartAxis(val1, metricKey))}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #94a3b8;">Final (${escapeHtml(pt2.date)}):</span>
        <strong style="color: #ffffff;">${escapeHtml(formatValChartAxis(val2, metricKey))}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.12); padding-top: 5px; margin-top: 2px;">
        <span style="font-weight: 700; color: #ffffff;">Variación:</span>
        <strong style="color: ${themeColor}; font-size: 13.5px; font-weight: 800;">${escapeHtml(deltaStr)}</strong>
      </div>
    </div>
  `;
  tip.hidden = false;
  if (clientX !== undefined && clientY !== undefined) {
    positionChartTooltip(tip, clientX, clientY);
  }
}

function setPeAdjusted(adjusted) {
  valPeAdjusted = Boolean(adjusted);
  const c1 = document.querySelector('#val-pe-adjusted-toggle');
  const c2 = document.querySelector('#val-chart-adjusted-checkbox');
  const c3 = document.querySelector('#val-payout-adjusted-toggle');
  if (c1) c1.checked = valPeAdjusted;
  if (c2) c2.checked = valPeAdjusted;
  if (c3) c3.checked = valPeAdjusted;
  if (companyData) renderValuation(companyData);
  const sparkEl = document.querySelector('#val-timeline-sparkline');
  if (sparkEl) sparkEl.innerHTML = '';
  if (valChartMetric === 'peRatio' || valChartMetric === 'payoutRatio') renderValuationChart();
}

document.querySelector('#val-pe-adjusted-toggle')?.addEventListener('change', (e) => setPeAdjusted(e.target.checked));
document.querySelector('#val-chart-adjusted-checkbox')?.addEventListener('change', (e) => setPeAdjusted(e.target.checked));
document.querySelector('#val-payout-adjusted-toggle')?.addEventListener('change', (e) => setPeAdjusted(e.target.checked));

async function loadValuationChart(range) {
  valChartRange = range;
  const message = document.querySelector('#val-chart-message');
  if (message) message.hidden = true;
  document.querySelectorAll('.val-chart-ranges button').forEach((button) => {
    button.classList.toggle('active', button.dataset.vrange === range);
  });
  try {
    const response = await fetch(`/api/screener/company/${encodeURIComponent(companyTicker)}/valuation?range=${encodeURIComponent(range)}`);
    const data = await response.json().catch(() => ({}));
    valChartPoints = response.ok && Array.isArray(data.points) ? data.points : [];
  } catch {
    valChartPoints = [];
  }
  valSliceStart = 0;
  valSliceEnd = Math.max(0, valChartPoints.length - 1);
  const sparkEl = document.querySelector('#val-timeline-sparkline');
  if (sparkEl) sparkEl.innerHTML = '';
  renderValuationChart();
}

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

function wireValuationChartInteractions() {
  const canvasInner = document.querySelector('[data-val-canvas-inner]');
  const valBlock = document.querySelector('#val-chart-block');
  const measureBtn = document.querySelector('#val-measure-btn');
  const fsBtn = document.querySelector('#val-fullscreen');
  const zoomInBtn = document.querySelector('#val-zoom-in');
  const zoomOutBtn = document.querySelector('#val-zoom-out');
  const zoomResetBtn = document.querySelector('#val-zoom-reset');
  if (!canvasInner) return;

  // Prevent context menu
  canvasInner.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  if (valBlock) {
    valBlock.addEventListener('contextmenu', (event) => {
      if (isValMeasuring || isValMeasureToolActive || event.target.closest('#val-chart, [data-val-canvas-inner]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  canvasInner.addEventListener('mousedown', (event) => {
    if (event.button === 2) event.preventDefault();
  });

  // Measure button toggle
  if (measureBtn) {
    measureBtn.addEventListener('click', () => {
      isValMeasureToolActive = !isValMeasureToolActive;
      measureBtn.classList.toggle('active', isValMeasureToolActive);
      canvasInner.classList.toggle('measuring-active', isValMeasureToolActive);
    });
  }

  // Mouse wheel zoom
  let valZoomAccumulator = 0;
  let valZoomResetTimer = null;
  canvasInner.addEventListener('wheel', (event) => {
    if (!valChartPoints.length || valChartMetric === 'netDebtToEbitda') return;
    event.preventDefault();
    const rawDelta = event.deltaY || 0;
    const threshold = event.deltaMode === 1 ? 2 : 45;
    valZoomAccumulator += rawDelta;
    if (valZoomResetTimer) clearTimeout(valZoomResetTimer);
    valZoomResetTimer = setTimeout(() => { valZoomAccumulator = 0; }, 140);
    if (Math.abs(valZoomAccumulator) < threshold) return;
    const steps = Math.trunc(valZoomAccumulator / threshold);
    valZoomAccumulator -= steps * threshold;

    const svgEl = document.querySelector('#val-chart');
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const { width, pad, innerWidth } = getCompanyChartGeometry(valBlock);
    const cursorSvgX = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));

    const total = valChartPoints.length;
    const curSpan = valSliceEnd - valSliceStart;
    const zoomPct = 0.04 * steps;
    const spanDelta = Math.round(curSpan * zoomPct);
    let newSpan = curSpan + spanDelta;
    newSpan = Math.max(6, Math.min(total, newSpan));
    const spanChange = newSpan - curSpan;

    let newStart = Math.round(valSliceStart - spanChange * ratio);
    let newEnd = newStart + newSpan - 1;
    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(total - 1, newSpan - 1);
    }
    if (newEnd >= total) {
      newEnd = total - 1;
      newStart = Math.max(0, total - newSpan);
    }
    if (newStart !== valSliceStart || newEnd !== valSliceEnd) {
      valSliceStart = newStart;
      valSliceEnd = newEnd;
      renderValuationChart();
    }
  }, { passive: false });

  // Pointerdown (Pan or Measure)
  canvasInner.addEventListener('pointerdown', (event) => {
    if (!valChartPoints.length || valChartMetric === 'netDebtToEbitda') return;
    const total = valChartPoints.length;
    if (total <= 1) return;

    const isRightClick = event.button === 2;
    const isShiftLeftClick = event.button === 0 && event.shiftKey;
    const isToolActiveClick = event.button === 0 && isValMeasureToolActive;

    // 1. Clic derecho mantenido -> Comparación Google Finance (punto inicial vs punto final), igual que en el gráfico de cotización
    if (isRightClick) {
      event.preventDefault();
      event.stopPropagation();
      startValComparison(event);
      return;
    }

    if (isShiftLeftClick || isToolActiveClick) {
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 0) {
        try { event.target.setPointerCapture(event.pointerId); } catch {}
      }

      const svgEl = document.querySelector('#val-chart');
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const { width, height, pad } = getCompanyChartGeometry(valBlock);

      const curX = ((event.clientX - rect.left) / rect.width) * width;
      const curY = ((event.clientY - rect.top) / rect.height) * height;
      const startX = Math.max(pad.left, Math.min(width - pad.right, curX));
      const startY = Math.max(pad.top, Math.min(height - pad.bottom, curY));

      isValMeasuring = true;
      valMeasureStartButton = event.button;
      valMeasureStartSvgX = startX;
      valMeasureStartSvgY = startY;
      valMeasureCurrentSvgX = startX;
      valMeasureCurrentSvgY = startY;
      canvasInner.classList.add('measuring');

      const hoverLayer = document.querySelector('#val-chart .pf-chart-hover-layer');
      if (hoverLayer) {
        hoverLayer.style.display = 'none';
      }

      updateValuationMeasurementView(event.clientX, event.clientY);

      window.addEventListener('pointermove', onValMeasurePointerMove);
      window.addEventListener('mousemove', onValMeasurePointerMove);
      window.addEventListener('pointerup', onValMeasurePointerUp);
      window.addEventListener('mouseup', onValMeasurePointerUp);
      return;
    }

    if (event.button !== 0) return;

    isValPanning = true;
    valPanMoved = false;
    valPanStartX = event.clientX;
    valPanInitStart = valSliceStart;
    valPanInitEnd = valSliceEnd;
    canvasInner.classList.add('panning');

    function onValPanMove(e) {
      if (!isValPanning || !valChartPoints.length) return;
      const deltaX = e.clientX - valPanStartX;
      if (Math.abs(deltaX) > 4) {
        valPanMoved = true;
        const hoverLayer = document.querySelector('#val-chart .pf-chart-hover-layer');
        if (hoverLayer) hoverLayer.style.display = 'none';
        hideValuationChartTooltip();
      }
      if (!valPanMoved) return;

      const rect = canvasInner.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const { width, pad, innerWidth } = getCompanyChartGeometry(valBlock);
      const innerWidthPx = rect.width * (innerWidth / width);
      const span = valPanInitEnd - valPanInitStart;
      const deltaRatio = deltaX / Math.max(1, innerWidthPx);
      const deltaIdx = Math.round(deltaRatio * span);

      let newStart = valPanInitStart - deltaIdx;
      let newEnd = valPanInitEnd - deltaIdx;

      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, span);
      } else if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, total - 1 - span);
      }

      if (newStart !== valSliceStart || newEnd !== valSliceEnd) {
        valSliceStart = newStart;
        valSliceEnd = newEnd;
        renderValuationChart();
      }
    }

    function onValPanUp() {
      if (!isValPanning) return;
      isValPanning = false;
      canvasInner.classList.remove('panning');
      window.removeEventListener('pointermove', onValPanMove);
      window.removeEventListener('pointerup', onValPanUp);
      window.removeEventListener('pointercancel', onValPanUp);
    }

    window.addEventListener('pointermove', onValPanMove);
    window.addEventListener('pointerup', onValPanUp);
    window.addEventListener('pointercancel', onValPanUp);
  });

  // Mousemove for hover
  canvasInner.addEventListener('mousemove', updateValuationChartHover);
  canvasInner.addEventListener('mouseleave', hideValuationChartTooltip);

  // Timeline handles & window
  const track = document.querySelector('#val-timeline-track');
  const win = document.querySelector('#val-timeline-window');
  const handleL = document.querySelector('#val-handle-l');
  const handleR = document.querySelector('#val-handle-r');

  function wireValTimelineHandle(handleEl, isLeft) {
    if (!handleEl) return;
    handleEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { e.target.setPointerCapture(e.pointerId); } catch {}
      handleEl.classList.add('active');

      const total = valChartPoints.length;
      const trackRect = track.getBoundingClientRect();

      function onHandleMove(mv) {
        if (!trackRect.width) return;
        const ratio = Math.max(0, Math.min(1, (mv.clientX - trackRect.left) / trackRect.width));
        const idx = Math.round(ratio * (total - 1));
        if (isLeft) {
          valSliceStart = Math.min(idx, valSliceEnd - 4);
        } else {
          valSliceEnd = Math.max(idx, valSliceStart + 4);
        }
        renderValuationChart();
      }

      function onHandleUp() {
        handleEl.classList.remove('active');
        window.removeEventListener('pointermove', onHandleMove);
        window.removeEventListener('pointerup', onHandleUp);
        window.removeEventListener('pointercancel', onHandleUp);
      }

      window.addEventListener('pointermove', onHandleMove);
      window.addEventListener('pointerup', onHandleUp);
      window.addEventListener('pointercancel', onHandleUp);
    });
  }

  wireValTimelineHandle(handleL, true);
  wireValTimelineHandle(handleR, false);

  if (win) {
    win.addEventListener('pointerdown', (e) => {
      if (e.target === handleL || e.target === handleR || handleL?.contains(e.target) || handleR?.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      try { e.target.setPointerCapture(e.pointerId); } catch {}
      win.classList.add('dragging');

      const total = valChartPoints.length;
      const trackRect = track.getBoundingClientRect();
      const startClientX = e.clientX;
      const initStart = valSliceStart;
      const initEnd = valSliceEnd;
      const span = initEnd - initStart;

      function onWinMove(mv) {
        if (!trackRect.width) return;
        const deltaX = mv.clientX - startClientX;
        const deltaRatio = deltaX / trackRect.width;
        const deltaIdx = Math.round(deltaRatio * (total - 1));

        let newStart = initStart + deltaIdx;
        let newEnd = initEnd + deltaIdx;

        if (newStart < 0) {
          newStart = 0;
          newEnd = Math.min(total - 1, span);
        } else if (newEnd > total - 1) {
          newEnd = total - 1;
          newStart = Math.max(0, total - 1 - span);
        }

        if (newStart !== valSliceStart || newEnd !== valSliceEnd) {
          valSliceStart = newStart;
          valSliceEnd = newEnd;
          renderValuationChart();
        }
      }

      function onWinUp() {
        win.classList.remove('dragging');
        window.removeEventListener('pointermove', onWinMove);
        window.removeEventListener('pointerup', onWinUp);
        window.removeEventListener('pointercancel', onWinUp);
      }

      window.addEventListener('pointermove', onWinMove);
      window.addEventListener('pointerup', onWinUp);
      window.addEventListener('pointercancel', onWinUp);
    });
  }

  // Zoom buttons
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoomValChartByStep('in'));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoomValChartByStep('out'));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => zoomValChartByStep('reset'));

  // Fullscreen button
  if (fsBtn) {
    fsBtn.addEventListener('click', () => toggleFullscreen(valBlock));
  }
}

wireValuationChartInteractions();

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


function ensureChartTooltip() {
  let tip = document.querySelector('#chart-tooltip');
  const targetParent = document.fullscreenElement || document.body;
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'chart-tooltip';
    tip.className = 'chart-tooltip';
    targetParent.appendChild(tip);
  } else if (tip.parentNode !== targetParent) {
    targetParent.appendChild(tip);
  }
  return tip;
}

function hideChartTooltip() {
  const tooltip = document.querySelector('#chart-tooltip');
  if (tooltip) tooltip.hidden = true;
}

function positionChartTooltip(tip, clientX, clientY) {
  const pad = 14;
  const tipW = tip.offsetWidth || 230;
  const tipH = tip.offsetHeight || 130;
  let left = clientX + pad;
  let top = clientY - tipH / 2;

  if (left + tipW > window.innerWidth - 10) {
    left = clientX - tipW - pad;
  }
  if (top < 10) top = 10;
  if (top + tipH > window.innerHeight - 10) {
    top = window.innerHeight - tipH - 10;
  }
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

async function loadChart(range) {
  chartRange = range;
  const chartMessage = document.querySelector('#chart-message');
  if (chartMessage) chartMessage.hidden = true;
  try {
    const configuredWindows = chartMaConfig.map((m) => m.period);
    const maParam = configuredWindows.length ? `&ma=${encodeURIComponent(configuredWindows.join(','))}` : '';
    const response = await fetch(`/api/screener/company/${encodeURIComponent(companyTicker)}/chart?range=${encodeURIComponent(range)}${maParam}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.points) || !data.points.length) {
      if (chartMessage) {
        chartMessage.textContent = data.error || 'No se pudo cargar el gráfico de cotización.';
        chartMessage.hidden = false;
      }
      chartPoints = [];
      chartMaPoints = [];
      chartMovingAveragesData = {};
      renderMaControlsUi();
      renderPriceChart();
      return;
    }
    chartCurrency = data.currency || 'USD';
    chartPoints = data.points.map((pt) => ({
      t: pt.t,
      v: pt.v,
      date: new Date(pt.t * 1000).toISOString().split('T')[0],
    }));

    chartMovingAveragesData = {};
    if (Array.isArray(data.movingAverages) && data.movingAverages.length) {
      data.movingAverages.forEach((item) => {
        if (item && item.window && Array.isArray(item.points)) {
          chartMovingAveragesData[item.window] = item.points.map((pt) => ({
            t: pt.t,
            v: pt.v,
            date: new Date(pt.t * 1000).toISOString().split('T')[0],
          }));
        }
      });
    } else if (Array.isArray(data.maPoints)) {
      const defPeriod = chartMaConfig[0]?.period || 100;
      chartMovingAveragesData[defPeriod] = data.maPoints.map((pt) => ({
        t: pt.t,
        v: pt.v,
        date: new Date(pt.t * 1000).toISOString().split('T')[0],
      }));
    }
    chartMaPoints = chartMovingAveragesData[chartMaConfig[0]?.period] || (Array.isArray(data.maPoints) ? data.maPoints : []);

    chartSliceStart = 0;
    chartSliceEnd = chartPoints.length - 1;

    const sparkEl = document.querySelector('#chart-timeline-sparkline');
    if (sparkEl) sparkEl.innerHTML = '';

    renderMaControlsUi();
    renderPriceChart();
  } catch {
    if (chartMessage) {
      chartMessage.textContent = 'No se pudo conectar con el servidor para cargar el gráfico.';
      chartMessage.hidden = false;
    }
    chartPoints = [];
    chartMaPoints = [];
    chartMovingAveragesData = {};
    renderMaControlsUi();
    renderPriceChart();
  }
}

function updateTimelineSliderUi() {
  const track = document.querySelector('#chart-timeline-track');
  const win = document.querySelector('#chart-timeline-window');
  const maskL = document.querySelector('#chart-timeline-mask-l');
  const maskR = document.querySelector('#chart-timeline-mask-r');
  const startEl = document.querySelector('#chart-timeline-start');
  const endEl = document.querySelector('#chart-timeline-end');
  const spanEl = document.querySelector('#chart-timeline-span');
  const sparkEl = document.querySelector('#chart-timeline-sparkline');
  if (!track || !win || !maskL || !maskR || !chartPoints.length) return;

  const total = chartPoints.length;
  const leftPct = (chartSliceStart / Math.max(1, total - 1)) * 100;
  const rightPct = (chartSliceEnd / Math.max(1, total - 1)) * 100;
  const widthPct = Math.max(2, rightPct - leftPct);

  win.style.left = `${leftPct.toFixed(2)}%`;
  win.style.width = `${widthPct.toFixed(2)}%`;
  maskL.style.width = `${leftPct.toFixed(2)}%`;
  maskR.style.left = `${rightPct.toFixed(2)}%`;
  maskR.style.width = `${(100 - rightPct).toFixed(2)}%`;

  const ptStart = chartPoints[chartSliceStart];
  const ptEnd = chartPoints[chartSliceEnd];
  if (startEl && ptStart) startEl.textContent = formatTradingViewHoverDate(ptStart.date);
  if (endEl && ptEnd) endEl.textContent = formatTradingViewHoverDate(ptEnd.date);

  if (spanEl && ptStart && ptEnd) {
    const d1 = new Date(`${ptStart.date}T00:00:00Z`);
    const d2 = new Date(`${ptEnd.date}T00:00:00Z`);
    const diffDays = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
    spanEl.textContent = `${diffDays} días seleccionados (${chartSliceEnd - chartSliceStart + 1} sesiones)`;
  }

  // Draw sparkline once
  if (sparkEl && !sparkEl.hasChildNodes() && chartPoints.length > 1) {
    const rawVals = chartPoints.map((p) => p.v).filter(Number.isFinite);
    const minV = Math.min(...rawVals);
    const maxV = Math.max(...rawVals);
    const spV = maxV - minV || 1;
    let d = '';
    chartPoints.forEach((p, i) => {
      const sx = (i / (chartPoints.length - 1)) * 100;
      const sy = 30 - ((p.v - minV) / spV) * 26;
      d += `${i ? ' L' : 'M'}${sx.toFixed(1)} ${sy.toFixed(1)}`;
    });
    sparkEl.innerHTML = `<path d="${d}" fill="none" stroke="rgba(37, 99, 235, 0.65)" stroke-width="1.4"/>`;
  }
}

function zoomChartByStep(direction, centerFraction = 0.5) {
  if (!chartPoints.length) return;
  const total = chartPoints.length;
  const currentSpan = chartSliceEnd - chartSliceStart;
  const zoomFactor = direction === 'in' ? 0.72 : (direction === 'out' ? 1.38 : 1);

  if (direction === 'reset') {
    chartSliceStart = 0;
    chartSliceEnd = total - 1;
    renderPriceChart();
    return;
  }

  let newSpan = Math.round(currentSpan * zoomFactor);
  newSpan = Math.max(6, Math.min(total, newSpan));
  const spanDiff = newSpan - currentSpan;
  let newStart = Math.round(chartSliceStart - spanDiff * centerFraction);
  let newEnd = newStart + newSpan - 1;

  if (newStart < 0) {
    newStart = 0;
    newEnd = Math.min(total - 1, newSpan - 1);
  }
  if (newEnd >= total) {
    newEnd = total - 1;
    newStart = Math.max(0, total - newSpan);
  }
  chartSliceStart = newStart;
  chartSliceEnd = newEnd;
  renderPriceChart();
}

function renderPriceChart() {
  const svg = document.querySelector('#price-chart');
  const chartBlock = document.querySelector('#company-chart-block') || document.querySelector('.chart-block');
  if (!svg) return;

  const { isFs, width, height, pad, innerWidth, innerHeight } = getCompanyChartGeometry(chartBlock);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  if (!chartPoints.length) {
    svg.innerHTML = '';
    chartScale = null;
    hideChartTooltip();
    return;
  }

  const points = chartPoints.slice(chartSliceStart, chartSliceEnd + 1);
  if (!points.length) {
    svg.innerHTML = '';
    chartScale = null;
    hideChartTooltip();
    return;
  }

  const values = points.map((point) => point.v).filter(Number.isFinite);
  const activeMAs = chartMaConfig.filter((m) => m.active && chartMovingAveragesData[m.period]?.length);
  const chartShowMA = activeMAs.length > 0;

  if (chartShowMA) {
    activeMAs.forEach((ma) => {
      const maPts = chartMovingAveragesData[ma.period] || [];
      if (!maPts.length) return;
      const isMatchingSeries = chartPoints.length === maPts.length && chartPoints[0]?.t === maPts[0]?.t;
      if (isMatchingSeries) {
        const maSlice = maPts.slice(chartSliceStart, chartSliceEnd + 1);
        maSlice.forEach((m) => {
          if (m && Number.isFinite(m.v)) values.push(m.v);
        });
      } else {
        const minT = points[0].t;
        const maxT = Math.max(points[points.length - 1].t, maPts[maPts.length - 1]?.t || points[points.length - 1].t);
        maPts.forEach((m) => {
          if (m.t >= minT && m.t <= maxT && Number.isFinite(m.v)) values.push(m.v);
        });
      }
    });
  }

  const { min, max, ticks } = computePriceScale(values);

  const x = (index) => pad.left + (index / Math.max(1, points.length - 1)) * innerWidth;
  const y = (value) => pad.top + (1 - (value - min) / (max - min)) * innerHeight;

  // Build Price line & area paths
  let linePath = '';
  let areaPath = '';
  points.forEach((point, index) => {
    const px = x(index).toFixed(1);
    const py = y(point.v).toFixed(1);
    if (!index) {
      linePath += `M${px},${py}`;
      areaPath += `M${px},${(pad.top + innerHeight).toFixed(1)} L${px},${py}`;
    } else {
      linePath += ` L${px},${py}`;
      areaPath += ` L${px},${py}`;
    }
  });
  if (points.length) {
    const lastPx = x(points.length - 1).toFixed(1);
    const baseY = (pad.top + innerHeight).toFixed(1);
    areaPath += ` L${lastPx},${baseY} Z`;
  }

  // Build MA paths
  let allMaPaths = '';
  if (chartShowMA) {
    activeMAs.forEach((ma) => {
      const maPts = chartMovingAveragesData[ma.period] || [];
      if (!maPts.length) return;
      let maPath = '';
      const isMatchingSeries = chartPoints.length === maPts.length && chartPoints[0]?.t === maPts[0]?.t;
      if (isMatchingSeries) {
        const maSlice = maPts.slice(chartSliceStart, chartSliceEnd + 1);
        let inSeg = false;
        maSlice.forEach((m, index) => {
          if (m && Number.isFinite(m.v)) {
            const px = x(index).toFixed(1);
            const py = y(m.v).toFixed(1);
            if (!inSeg) {
              maPath += `M${px},${py}`;
              inSeg = true;
            } else {
              maPath += ` L${px},${py}`;
            }
          } else {
            inSeg = false;
          }
        });
      } else {
        const minT = points[0].t;
        const maxT = Math.max(points[points.length - 1].t, maPts[maPts.length - 1]?.t || points[points.length - 1].t);
        const tSpread = Math.max(1, maxT - minT);
        let inSeg = false;
        maPts.forEach((m) => {
          if (m.t >= minT && m.t <= maxT && Number.isFinite(m.v)) {
            const ratio = Math.max(0, Math.min(1, (m.t - minT) / tSpread));
            const px = (pad.left + ratio * innerWidth).toFixed(1);
            const py = y(m.v).toFixed(1);
            if (!inSeg) {
              maPath += `M${px},${py}`;
              inSeg = true;
            } else {
              maPath += ` L${px},${py}`;
            }
          }
        });
      }
      if (maPath) {
        allMaPaths += `<path d="${maPath}" class="chart-ma" style="--ma-stroke: ${ma.color}; stroke: ${ma.color};"/>`;
      }
    });
  }

  // Horizontal price grid lines & labels on the right
  const yLabelFontSize = isFs ? '11px' : '9.5px';
  const xLabelFontSize = isFs ? '11px' : '10px';
  const strokeW = isFs ? '2.8' : '2.2';

  const gridLines = ticks.map((value) => {
    const tickY = y(value);
    return `
      <line x1="${pad.left}" y1="${tickY.toFixed(1)}" x2="${width - pad.right}" y2="${tickY.toFixed(1)}" class="chart-grid"/>
      <text x="${(width - pad.right + 8).toFixed(1)}" y="${(tickY + 3.5).toFixed(1)}" class="chart-label" font-size="${yLabelFontSize}" text-anchor="start">${escapeHtml(formatPriceValue(value))}</text>`;
  }).join('');

  const dateTicks = getTradingViewDateTicks(points, x, pad, width);
  const vGridLines = dateTicks.map((tick) => `
    <line x1="${tick.x.toFixed(1)}" y1="${pad.top}" x2="${tick.x.toFixed(1)}" y2="${height - pad.bottom}" class="chart-grid"/>
    <text x="${tick.x.toFixed(1)}" y="${height - 8}" class="chart-label chart-label-x ${tick.isMajor ? 'major' : ''}" font-size="${xLabelFontSize}" text-anchor="middle">${escapeHtml(tick.label)}</text>
  `).join('');

  const axisBaselines = `
    <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="pf-chart-axis-baseline"/>
    <line x1="${width - pad.right}" y1="${pad.top}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="pf-chart-axis-baseline"/>
  `;

  const lastPoint = points[points.length - 1];
  const lastY = y(lastPoint.v);
  const lastTag = `
    <rect x="${width - pad.right + 4}" y="${(lastY - 9).toFixed(1)}" width="${pad.right - 8}" height="18" rx="3" class="chart-tag"/>
    <text x="${width - pad.right + 8}" y="${(lastY + 4).toFixed(1)}" class="chart-tag-text">${escapeHtml(formatPriceValue(lastPoint.v))}</text>
  `;

  svg.innerHTML = `
    <defs>
      <linearGradient id="company-chart-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#4f46e5" stop-opacity="0.00"/>
      </linearGradient>
    </defs>
    ${gridLines}
    ${vGridLines}
    ${axisBaselines}
    <path d="${areaPath}" class="chart-area"/>
    <path d="${linePath}" class="chart-line" stroke-width="${strokeW}"/>
    ${allMaPaths}
    ${lastTag}
    <g class="pf-chart-measure-layer" style="display:none;">
      <rect class="pf-chart-measure-box" x="0" y="0" width="0" height="0" fill="rgba(239, 68, 68, 0.08)" stroke="rgba(220, 38, 38, 0.65)" stroke-width="1.4" stroke-dasharray="4 3" rx="2" ry="2"/>
      <line class="pf-chart-measure-diagonal" x1="0" y1="0" x2="0" y2="0" stroke="rgba(220, 38, 38, 0.85)" stroke-width="1.8" stroke-dasharray="5 3"/>
      <circle class="pf-chart-measure-pt1" cx="0" cy="0" r="4" fill="#dc2626" stroke="#ffffff" stroke-width="1.4"/>
      <circle class="pf-chart-measure-pt2" cx="0" cy="0" r="4" fill="#dc2626" stroke="#ffffff" stroke-width="1.4"/>
      <g class="pf-chart-measure-badge" transform="translate(0, 0)">
        <rect class="pf-chart-measure-badge-bg" x="-54" y="-12" width="108" height="24" rx="5" ry="5" fill="#1e1b1b" fill-opacity="0.94" stroke="rgba(239, 68, 68, 0.35)" stroke-width="0.9"/>
        <text class="pf-chart-measure-badge-text" x="0" y="4" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="600">--</text>
      </g>
    </g>
    <g class="pf-chart-compare-layer" style="display:none; pointer-events:none;">
      <rect class="pf-chart-compare-band" x="0" y="${pad.top}" width="0" height="${innerHeight}" fill="rgba(34, 197, 94, 0.13)"/>
      <line class="pf-chart-compare-v1" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}" stroke="rgba(255, 255, 255, 0.45)" stroke-width="1.2" stroke-dasharray="3 3"/>
      <line class="pf-chart-compare-v2" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}" stroke="rgba(255, 255, 255, 0.45)" stroke-width="1.2" stroke-dasharray="3 3"/>
      <line class="pf-chart-compare-baseline" x1="0" y1="0" x2="0" y2="0" stroke="rgba(255, 255, 255, 0.3)" stroke-width="1" stroke-dasharray="2 2"/>
      <line class="pf-chart-compare-connector" x1="0" y1="0" x2="0" y2="0" stroke="#16a34a" stroke-width="1.8" stroke-dasharray="4 2"/>
      <circle class="pf-chart-compare-pt1-halo" cx="0" cy="0" r="9" fill="#16a34a" fill-opacity="0.25"/>
      <circle class="pf-chart-compare-pt1" cx="0" cy="0" r="4.5" fill="#16a34a" stroke="#ffffff" stroke-width="2"/>
      <circle class="pf-chart-compare-pt2-halo" cx="0" cy="0" r="9" fill="#16a34a" fill-opacity="0.25"/>
      <circle class="pf-chart-compare-pt2" cx="0" cy="0" r="5" fill="#16a34a" stroke="#ffffff" stroke-width="2"/>
      <g class="pf-chart-compare-badge" transform="translate(0, 0)">
        <rect class="pf-chart-compare-badge-bg" x="-60" y="-13" width="120" height="26" rx="6" ry="6" fill="#18181b" fill-opacity="0.95" stroke="#16a34a" stroke-width="1.2"/>
        <text class="pf-chart-compare-badge-text" x="0" y="4" text-anchor="middle" fill="#16a34a" font-size="12" font-weight="700">--</text>
      </g>
    </g>
    <rect class="pf-chart-overlay" x="${pad.left}" y="${pad.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent" cursor="crosshair"/>
    <g class="pf-chart-hover-layer" style="display: none; pointer-events: none;">
      <line class="pf-chart-crosshair pf-chart-crosshair-v" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}"/>
      <line class="pf-chart-crosshair pf-chart-crosshair-h" x1="${pad.left}" y1="0" x2="${width - pad.right}" y2="0"/>
      <g class="pf-chart-hover-dot-wrap" transform="translate(0, 0)">
        <circle class="pf-chart-hover-dot-halo" cx="0" cy="0" r="10" fill="#4f46e5" fill-opacity="0.3"/>
        <circle class="pf-chart-hover-dot" cx="0" cy="0" r="5.5" fill="#4f46e5" stroke="#ffffff" stroke-width="2.2"/>
      </g>
      <g class="pf-chart-hover-ma-dots"></g>
      <g class="pf-chart-x-badge" transform="translate(0, ${height - pad.bottom})">
        <rect class="pf-chart-x-badge-bg" x="-42" y="2" width="84" height="20" rx="4" ry="4"/>
        <text class="pf-chart-x-badge-text" x="0" y="16" text-anchor="middle">--</text>
      </g>
      <g class="pf-chart-y-badge" transform="translate(${width - pad.right + 6}, 0)">
        <path class="pf-chart-y-badge-arrow" d="M -5,0 L 0,-6 L 0,6 Z" fill="#4f46e5"/>
        <rect class="pf-chart-y-badge-bg" x="0" y="-10" width="${pad.right - 8}" height="20" rx="3" fill="#4f46e5"/>
        <text class="pf-chart-y-badge-text" x="${(pad.right - 8) / 2}" y="0" text-anchor="middle">--</text>
      </g>
    </g>
  `;

  priceChartRenderState = {
    isFs,
    width,
    height,
    pad,
    innerWidth,
    innerHeight,
    points,
    min,
    max,
    x,
    y,
  };

  updateTimelineSliderUi();
}

function updateCompanyMeasurementView(clientX, clientY) {
  if (!isMeasuring || !chartPoints.length) return;
  const points = chartPoints.slice(chartSliceStart, chartSliceEnd + 1);
  if (!points.length) return;

  const svgEl = document.querySelector('#price-chart');
  const chartBlock = document.querySelector('#company-chart-block') || document.querySelector('.chart-block');
  const measureLayer = svgEl?.querySelector('.pf-chart-measure-layer');
  if (!svgEl || !measureLayer) return;

  const rect = svgEl.getBoundingClientRect();
  const { width, height, pad, innerWidth, innerHeight } = getCompanyChartGeometry(chartBlock);

  if (clientX !== undefined && clientY !== undefined && rect.width > 0 && rect.height > 0) {
    const curX = ((clientX - rect.left) / rect.width) * width;
    const curY = ((clientY - rect.top) / rect.height) * height;
    measureCurrentSvgX = Math.max(pad.left, Math.min(width - pad.right, curX));
    measureCurrentSvgY = Math.max(pad.top, Math.min(height - pad.bottom, curY));
  }

  const values = points.map((p) => p.v).filter(Number.isFinite);
  const { min, max } = computePriceScale(values);

  const x1 = measureStartSvgX;
  const y1 = measureStartSvgY;
  const x2 = measureCurrentSvgX;
  const y2 = measureCurrentSvgY;

  const leftX = Math.min(x1, x2);
  const rightX = Math.max(x1, x2);
  const topY = Math.min(y1, y2);
  const bottomY = Math.max(y1, y2);
  const boxW = Math.max(1, rightX - leftX);
  const boxH = Math.max(1, bottomY - topY);

  // Convert Y coordinates to Metric Values (spatial Y1 to Y2)
  const ratioY1 = Math.max(0, Math.min(1, (y1 - pad.top) / innerHeight));
  const ratioY2 = Math.max(0, Math.min(1, (y2 - pad.top) / innerHeight));
  const val1 = max - ratioY1 * (max - min);
  const val2 = max - ratioY2 * (max - min);
  const deltaVal = val2 - val1;
  const deltaPct = val1 > 0 ? ((val2 - val1) / val1) * 100 : 0;

  // Convert X coordinates to Dates & Indices (spatial X1 to X2)
  const ratioX1 = Math.max(0, Math.min(1, (x1 - pad.left) / innerWidth));
  const ratioX2 = Math.max(0, Math.min(1, (x2 - pad.left) / innerWidth));
  const idx1 = Math.max(0, Math.min(points.length - 1, Math.round(ratioX1 * (points.length - 1))));
  const idx2 = Math.max(0, Math.min(points.length - 1, Math.round(ratioX2 * (points.length - 1))));
  const pt1 = points[idx1] || points[0];
  const pt2 = points[idx2] || points[points.length - 1];

  const d1 = new Date(`${pt1.date}T00:00:00Z`);
  const d2 = new Date(`${pt2.date}T00:00:00Z`);
  const diffDays = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
  const sessions = Math.abs(idx2 - idx1) + 1;

  // Update measure box & diagonal line
  const boxEl = measureLayer.querySelector('.pf-chart-measure-box');
  const diagEl = measureLayer.querySelector('.pf-chart-measure-diagonal');
  const pt1El = measureLayer.querySelector('.pf-chart-measure-pt1');
  const pt2El = measureLayer.querySelector('.pf-chart-measure-pt2');
  const badge = measureLayer.querySelector('.pf-chart-measure-badge');
  const badgeBg = measureLayer.querySelector('.pf-chart-measure-badge-bg');
  const badgeText = measureLayer.querySelector('.pf-chart-measure-badge-text');

  if (boxEl) {
    boxEl.setAttribute('x', leftX.toFixed(1));
    boxEl.setAttribute('y', topY.toFixed(1));
    boxEl.setAttribute('width', boxW.toFixed(1));
    boxEl.setAttribute('height', boxH.toFixed(1));
  }
  if (diagEl) {
    diagEl.setAttribute('x1', x1.toFixed(1));
    diagEl.setAttribute('y1', y1.toFixed(1));
    diagEl.setAttribute('x2', x2.toFixed(1));
    diagEl.setAttribute('y2', y2.toFixed(1));
  }
  if (pt1El) {
    pt1El.setAttribute('cx', x1.toFixed(1));
    pt1El.setAttribute('cy', y1.toFixed(1));
  }
  if (pt2El) {
    pt2El.setAttribute('cx', x2.toFixed(1));
    pt2El.setAttribute('cy', y2.toFixed(1));
  }

  // Badge on SVG
  if (badge && badgeBg && badgeText) {
    const badgeStr = `${formatSignedPriceValue(deltaVal)} (${formatSignedPct(deltaPct)}) · ${diffDays}d`;
    const badgeW = Math.max(96, badgeStr.length * 6.8 + 20);
    const midBadgeX = Math.max(pad.left + badgeW / 2 + 4, Math.min(width - pad.right - badgeW / 2 - 4, (x1 + x2) / 2));
    const badgeY = Math.max(pad.top + 14, Math.min(height - pad.bottom - 14, topY - 10 < pad.top + 8 ? bottomY + 12 : topY - 10));

    badge.setAttribute('transform', `translate(${midBadgeX.toFixed(1)}, ${badgeY.toFixed(1)})`);
    badgeBg.setAttribute('x', (-badgeW / 2).toFixed(1));
    badgeBg.setAttribute('width', badgeW.toFixed(1));
    badgeText.textContent = badgeStr;
  }

  measureLayer.style.display = 'inline';
  measureLayer.removeAttribute('hidden');

  // Update floating detailed tooltip
  const tip = ensureChartTooltip();
  const startStr = formatTradingViewHoverDate(pt1.date);
  const endStr = formatTradingViewHoverDate(pt2.date);
  const daysLabel = diffDays === 1 ? '1 día' : `${diffDays} días`;
  const sessionsLabel = sessions === 1 ? '1 sesión' : `${sessions} sesiones`;

  const valClass = deltaVal > 0 ? 'positive' : deltaVal < 0 ? 'negative' : '';
  const deltaFormatted = `${formatSignedPriceValue(deltaVal)} (${formatSignedPct(deltaPct)})`;

  tip.innerHTML = `
    <div class="pf-measure-tooltip-head">
      <div class="pf-measure-badge-tag negative">📏 Medición de cotización</div>
      <div class="pf-measure-period">${escapeHtml(startStr)} → ${escapeHtml(endStr)}</div>
      <div class="pf-measure-sub">${daysLabel} naturales · ${sessionsLabel}</div>
    </div>
    <div class="pf-measure-tooltip-body">
      <div class="pf-measure-row">
        <div class="pf-measure-row-left">
          <span class="pf-chart-tooltip-dot" style="background:#ef4444"></span>
          <span class="pf-measure-name">Nivel inicial</span>
        </div>
        <div class="pf-measure-row-right">
          <strong class="pf-measure-diff">${escapeHtml(formatPriceValue(val1))}</strong>
        </div>
      </div>
      <div class="pf-measure-row">
        <div class="pf-measure-row-left">
          <span class="pf-chart-tooltip-dot" style="background:#ef4444"></span>
          <span class="pf-measure-name">Nivel actual</span>
        </div>
        <div class="pf-measure-row-right">
          <strong class="pf-measure-diff">${escapeHtml(formatPriceValue(val2))}</strong>
        </div>
      </div>
      <div class="pf-measure-row" style="border-top: 1px solid rgba(255,255,255,0.12); padding-top: 5px; margin-top: 2px;">
        <div class="pf-measure-row-left">
          <span class="pf-measure-name" style="font-weight: 700; color: #ffffff;">Variación (Δ)</span>
        </div>
        <div class="pf-measure-row-right">
          <strong class="pf-measure-diff ${valClass}" style="font-size: 12.5px;">${escapeHtml(deltaFormatted)}</strong>
        </div>
      </div>
    </div>`;
  tip.hidden = false;
  if (clientX !== undefined && clientY !== undefined) {
    positionChartTooltip(tip, clientX, clientY);
  }
}

function onCompanyMeasurePointerMove(event) {
  if (!isMeasuring) return;
  if (event.buttons === 0) {
    onCompanyMeasurePointerUp(event);
    return;
  }
  updateCompanyMeasurementView(event.clientX, event.clientY);
}

function onCompanyMeasurePointerUp(event) {
  if (!isMeasuring) return;
  if (event && event.button !== undefined && event.button !== 0 && event.buttons !== 0) return;
  isMeasuring = false;
  const canvasInner = document.querySelector('[data-chart-canvas-inner]');
  if (canvasInner) canvasInner.classList.remove('measuring');
  window.removeEventListener('pointermove', onCompanyMeasurePointerMove);
  window.removeEventListener('mousemove', onCompanyMeasurePointerMove);
  window.removeEventListener('pointerup', onCompanyMeasurePointerUp);
  window.removeEventListener('mouseup', onCompanyMeasurePointerUp);

  const measureLayer = document.querySelector('#price-chart .pf-chart-measure-layer');
  if (measureLayer) {
    measureLayer.style.display = 'none';
    measureLayer.setAttribute('hidden', '');
  }
  hideChartTooltip();
}

function getCompanyChartPointIndex(clientX) {
  if (!chartPoints.length) return 0;
  const points = chartPoints.slice(chartSliceStart, chartSliceEnd + 1);
  if (!points.length) return 0;
  const svgEl = document.querySelector('#price-chart');
  const chartBlock = document.querySelector('#company-chart-block') || document.querySelector('.chart-block');
  if (!svgEl) return 0;
  const rect = svgEl.getBoundingClientRect();
  if (!rect.width) return 0;
  const { width, pad, innerWidth } = getCompanyChartGeometry(chartBlock);
  const curSvgX = ((clientX - rect.left) / rect.width) * width;
  const clampedX = Math.max(pad.left, Math.min(width - pad.right, curSvgX));
  const ratio = Math.max(0, Math.min(1, (clampedX - pad.left) / innerWidth));
  return Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
}

function updateCompanyComparisonView(clientX, clientY) {
  if (!isComparing || !chartPoints.length) return;
  const points = chartPoints.slice(chartSliceStart, chartSliceEnd + 1);
  if (!points.length) return;

  const svgEl = document.querySelector('#price-chart');
  const chartBlock = document.querySelector('#company-chart-block') || document.querySelector('.chart-block');
  const compareLayer = svgEl?.querySelector('.pf-chart-compare-layer');
  if (!svgEl || !compareLayer) return;

  const { width, height, pad, innerWidth, innerHeight } = getCompanyChartGeometry(chartBlock);
  const values = points.map((p) => p.v).filter(Number.isFinite);
  const activeMAs = chartMaConfig.filter((m) => m.active && chartMovingAveragesData[m.period]?.length);
  if (activeMAs.length) {
    activeMAs.forEach((ma) => {
      const maPts = chartMovingAveragesData[ma.period] || [];
      if (!maPts.length) return;
      const isMatchingSeries = chartPoints.length === maPts.length && chartPoints[0]?.t === maPts[0]?.t;
      if (isMatchingSeries) {
        const maSlice = maPts.slice(chartSliceStart, chartSliceEnd + 1);
        maSlice.forEach((m) => {
          if (m && Number.isFinite(m.v)) values.push(m.v);
        });
      } else {
        const minT = points[0].t;
        const maxT = Math.max(points[points.length - 1].t, maPts[maPts.length - 1]?.t || points[points.length - 1].t);
        maPts.forEach((m) => {
          if (m.t >= minT && m.t <= maxT && Number.isFinite(m.v)) values.push(m.v);
        });
      }
    });
  }
  const { min, max } = computePriceScale(values);

  const x = (idx) => pad.left + (idx / Math.max(1, points.length - 1)) * innerWidth;
  const y = (val) => pad.top + (1 - (val - min) / (max - min)) * innerHeight;

  const idx1 = Math.max(0, Math.min(points.length - 1, compareStartIdx ?? 0));
  const idx2 = Math.max(0, Math.min(points.length - 1, compareCurrentIdx ?? idx1));

  const pt1 = points[idx1] || points[0];
  const pt2 = points[idx2] || points[points.length - 1];

  const val1 = pt1.v;
  const val2 = pt2.v;
  const deltaVal = val2 - val1;
  const deltaPct = val1 > 0 ? ((val2 - val1) / val1) * 100 : 0;

  const x1 = x(idx1);
  const y1 = y(val1);
  const x2 = x(idx2);
  const y2 = y(val2);

  const leftX = Math.min(x1, x2);
  const rightX = Math.max(x1, x2);
  const bandW = Math.max(1, rightX - leftX);

  const isPositive = deltaVal >= 0;
  const themeColor = isPositive ? '#16a34a' : '#dc2626';
  const bandFill = isPositive ? 'rgba(34, 197, 94, 0.13)' : 'rgba(239, 68, 68, 0.13)';
  const haloColor = isPositive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)';

  const bandEl = compareLayer.querySelector('.pf-chart-compare-band');
  const v1El = compareLayer.querySelector('.pf-chart-compare-v1');
  const v2El = compareLayer.querySelector('.pf-chart-compare-v2');
  const baseEl = compareLayer.querySelector('.pf-chart-compare-baseline');
  const connEl = compareLayer.querySelector('.pf-chart-compare-connector');
  const pt1El = compareLayer.querySelector('.pf-chart-compare-pt1');
  const pt1Halo = compareLayer.querySelector('.pf-chart-compare-pt1-halo');
  const pt2El = compareLayer.querySelector('.pf-chart-compare-pt2');
  const pt2Halo = compareLayer.querySelector('.pf-chart-compare-pt2-halo');
  const badge = compareLayer.querySelector('.pf-chart-compare-badge');
  const badgeBg = compareLayer.querySelector('.pf-chart-compare-badge-bg');
  const badgeText = compareLayer.querySelector('.pf-chart-compare-badge-text');

  if (bandEl) {
    bandEl.setAttribute('x', leftX.toFixed(1));
    bandEl.setAttribute('y', pad.top.toFixed(1));
    bandEl.setAttribute('width', bandW.toFixed(1));
    bandEl.setAttribute('height', innerHeight.toFixed(1));
    bandEl.setAttribute('fill', bandFill);
  }
  if (v1El) {
    v1El.setAttribute('x1', x1.toFixed(1));
    v1El.setAttribute('y1', pad.top.toFixed(1));
    v1El.setAttribute('x2', x1.toFixed(1));
    v1El.setAttribute('y2', (height - pad.bottom).toFixed(1));
  }
  if (v2El) {
    v2El.setAttribute('x1', x2.toFixed(1));
    v2El.setAttribute('y1', pad.top.toFixed(1));
    v2El.setAttribute('x2', x2.toFixed(1));
    v2El.setAttribute('y2', (height - pad.bottom).toFixed(1));
  }
  if (baseEl) {
    baseEl.setAttribute('x1', leftX.toFixed(1));
    baseEl.setAttribute('y1', y1.toFixed(1));
    baseEl.setAttribute('x2', rightX.toFixed(1));
    baseEl.setAttribute('y2', y1.toFixed(1));
  }
  if (connEl) {
    connEl.setAttribute('x1', x1.toFixed(1));
    connEl.setAttribute('y1', y1.toFixed(1));
    connEl.setAttribute('x2', x2.toFixed(1));
    connEl.setAttribute('y2', y2.toFixed(1));
    connEl.setAttribute('stroke', themeColor);
  }
  if (pt1El) {
    pt1El.setAttribute('cx', x1.toFixed(1));
    pt1El.setAttribute('cy', y1.toFixed(1));
    pt1El.setAttribute('fill', themeColor);
  }
  if (pt1Halo) {
    pt1Halo.setAttribute('cx', x1.toFixed(1));
    pt1Halo.setAttribute('cy', y1.toFixed(1));
    pt1Halo.setAttribute('fill', haloColor);
  }
  if (pt2El) {
    pt2El.setAttribute('cx', x2.toFixed(1));
    pt2El.setAttribute('cy', y2.toFixed(1));
    pt2El.setAttribute('fill', themeColor);
  }
  if (pt2Halo) {
    pt2Halo.setAttribute('cx', x2.toFixed(1));
    pt2Halo.setAttribute('cy', y2.toFixed(1));
    pt2Halo.setAttribute('fill', haloColor);
  }

  const arrow = deltaVal > 0 ? '▲ ' : (deltaVal < 0 ? '▼ ' : '');
  const deltaStr = `${arrow}${formatSignedPriceValue(deltaVal)} (${formatSignedPct(deltaPct)})`;

  if (badge && badgeBg && badgeText) {
    const badgeW = Math.max(116, deltaStr.length * 7.5 + 24);
    const midX = Math.max(pad.left + badgeW / 2 + 6, Math.min(width - pad.right - badgeW / 2 - 6, (x1 + x2) / 2));
    const topY = Math.min(y1, y2);
    let badgeY = topY - 18;
    if (badgeY < pad.top + 16) {
      badgeY = Math.max(y1, y2) + 24;
    }
    if (badgeY > height - pad.bottom - 14) {
      badgeY = pad.top + 20;
    }

    badge.setAttribute('transform', `translate(${midX.toFixed(1)}, ${badgeY.toFixed(1)})`);
    badgeBg.setAttribute('x', (-badgeW / 2).toFixed(1));
    badgeBg.setAttribute('width', badgeW.toFixed(1));
    badgeBg.setAttribute('stroke', themeColor);
    badgeText.setAttribute('fill', themeColor);
    badgeText.textContent = deltaStr;
  }

  compareLayer.style.display = 'inline';
  compareLayer.removeAttribute('hidden');

  // Floating detailed tooltip
  const tip = ensureChartTooltip();
  const d1 = new Date(`${pt1.date}T00:00:00Z`);
  const d2 = new Date(`${pt2.date}T00:00:00Z`);
  const diffDays = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
  const sessions = Math.abs(idx2 - idx1) + 1;
  const startStr = formatTradingViewHoverDate(pt1.date);
  const endStr = formatTradingViewHoverDate(pt2.date);
  const sessionsLabel = sessions === 1 ? '1 sesión' : `${sessions} sesiones`;
  const daysLabel = diffDays === 1 ? '1 día' : `${diffDays} días`;

  tip.innerHTML = `
    <div class="pf-compare-tooltip-head" style="margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 5px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <span style="font-size: 11px; font-weight: 700; color: ${themeColor}; text-transform: uppercase; letter-spacing: 0.5px;">
          ${isPositive ? '▲ Subida' : '▼ Caída'} · Comparación
        </span>
        <span style="font-size: 10.5px; color: #94a3b8;">${sessionsLabel} · ${daysLabel}</span>
      </div>
      <div style="font-size: 11px; color: #cbd5e1; margin-top: 3px;">
        ${escapeHtml(startStr)} → ${escapeHtml(endStr)}
      </div>
    </div>
    <div class="pf-compare-tooltip-body" style="font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #94a3b8;">Inicio (${escapeHtml(pt1.date)}):</span>
        <strong style="color: #ffffff;">${escapeHtml(formatPriceValue(val1))}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #94a3b8;">Final (${escapeHtml(pt2.date)}):</span>
        <strong style="color: #ffffff;">${escapeHtml(formatPriceValue(val2))}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.12); padding-top: 5px; margin-top: 2px;">
        <span style="font-weight: 700; color: #ffffff;">Variación:</span>
        <strong style="color: ${themeColor}; font-size: 13.5px; font-weight: 800;">${escapeHtml(deltaStr)}</strong>
      </div>
    </div>
  `;
  tip.hidden = false;
  if (clientX !== undefined && clientY !== undefined) {
    positionChartTooltip(tip, clientX, clientY);
  }
}

function startCompanyComparison(event) {
  if (!chartPoints.length) return;
  const points = chartPoints.slice(chartSliceStart, chartSliceEnd + 1);
  if (!points.length) return;

  isComparing = true;
  compareStartIdx = getCompanyChartPointIndex(event.clientX);
  compareCurrentIdx = compareStartIdx;

  const canvasInner = document.querySelector('[data-chart-canvas-inner]');
  if (canvasInner) canvasInner.classList.add('comparing');

  const hoverLayer = document.querySelector('#price-chart .pf-chart-hover-layer');
  if (hoverLayer) hoverLayer.style.display = 'none';

  updateCompanyComparisonView(event.clientX, event.clientY);

  window.addEventListener('pointermove', onCompanyComparePointerMove);
  window.addEventListener('mousemove', onCompanyComparePointerMove);
  window.addEventListener('pointerup', onCompanyComparePointerUp);
  window.addEventListener('mouseup', onCompanyComparePointerUp);
}

function onCompanyComparePointerMove(event) {
  if (!isComparing) return;
  if (event.buttons !== undefined && (event.buttons & 2) === 0 && event.buttons === 0) {
    onCompanyComparePointerUp(event);
    return;
  }
  compareCurrentIdx = getCompanyChartPointIndex(event.clientX);
  updateCompanyComparisonView(event.clientX, event.clientY);
}

function onCompanyComparePointerUp(event) {
  if (!isComparing) return;
  if (event && event.button !== undefined && event.button !== 2 && event.buttons !== 0 && (event.buttons & 2) !== 0) return;
  clearCompanyComparison();
}

function clearCompanyComparison() {
  isComparing = false;
  const canvasInner = document.querySelector('[data-chart-canvas-inner]');
  if (canvasInner) canvasInner.classList.remove('comparing');

  window.removeEventListener('pointermove', onCompanyComparePointerMove);
  window.removeEventListener('mousemove', onCompanyComparePointerMove);
  window.removeEventListener('pointerup', onCompanyComparePointerUp);
  window.removeEventListener('mouseup', onCompanyComparePointerUp);

  const compareLayer = document.querySelector('#price-chart .pf-chart-compare-layer');
  if (compareLayer) {
    compareLayer.style.display = 'none';
    compareLayer.setAttribute('hidden', '');
  }
  hideChartTooltip();
}

function wireCompanyChartInteractions() {
  const canvasInner = document.querySelector('[data-chart-canvas-inner]');
  const chartBlock = document.querySelector('#company-chart-block') || document.querySelector('.chart-block');
  const measureBtn = document.querySelector('#chart-measure-btn');
  if (!canvasInner) return;

  // Prevent context menu on chart canvas and block
  canvasInner.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  if (chartBlock) {
    chartBlock.addEventListener('contextmenu', (event) => {
      if (isMeasuring || isMeasureToolActive || event.target.closest('#price-chart, .company-chart-canvas-inner, [data-chart-canvas-inner]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  canvasInner.addEventListener('mousedown', (event) => {
    if (event.button === 2) {
      event.preventDefault();
    }
  });

  // Measure button toggle
  if (measureBtn) {
    measureBtn.addEventListener('click', () => {
      isMeasureToolActive = !isMeasureToolActive;
      measureBtn.classList.toggle('active', isMeasureToolActive);
      canvasInner.classList.toggle('measuring-active', isMeasureToolActive);
    });
  }

  // Mouse wheel zoom
  let zoomAccumulator = 0;
  let zoomResetTimer = null;
  canvasInner.addEventListener('wheel', (event) => {
    if (!chartPoints.length) return;
    event.preventDefault();
    const rawDelta = event.deltaY || 0;
    const threshold = event.deltaMode === 1 ? 2 : 45;
    zoomAccumulator += rawDelta;
    if (zoomResetTimer) clearTimeout(zoomResetTimer);
    zoomResetTimer = setTimeout(() => { zoomAccumulator = 0; }, 140);
    if (Math.abs(zoomAccumulator) < threshold) return;
    const steps = Math.trunc(zoomAccumulator / threshold);
    zoomAccumulator -= steps * threshold;

    const svgEl = document.querySelector('#price-chart');
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const { width, pad, innerWidth } = getCompanyChartGeometry(chartBlock);
    const cursorSvgX = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));

    const total = chartPoints.length;
    const curSpan = chartSliceEnd - chartSliceStart;
    const zoomPct = 0.04 * steps;
    const spanDelta = Math.round(curSpan * zoomPct);
    let newSpan = curSpan + spanDelta;
    newSpan = Math.max(6, Math.min(total, newSpan));
    const spanChange = newSpan - curSpan;

    let newStart = Math.round(chartSliceStart - spanChange * ratio);
    let newEnd = newStart + newSpan - 1;
    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(total - 1, newSpan - 1);
    }
    if (newEnd >= total) {
      newEnd = total - 1;
      newStart = Math.max(0, total - newSpan);
    }
    if (newStart !== chartSliceStart || newEnd !== chartSliceEnd) {
      chartSliceStart = newStart;
      chartSliceEnd = newEnd;
      renderPriceChart();
    }
  }, { passive: false });

  // Pointer Down (Pan or Measure)
  canvasInner.addEventListener('pointerdown', (event) => {
    if (!chartPoints.length) return;
    const total = chartPoints.length;
    if (total <= 1) return;

    // 1. Clic derecho mantenido -> Comparación Google Finance (punto inicial vs punto final)
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      startCompanyComparison(event);
      return;
    }

    // 2. Herramienta Medir activa (solo al presionar el botón de Medir con clic izquierdo)
    const isToolActiveClick = event.button === 0 && isMeasureToolActive;

    if (isToolActiveClick) {
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 0) {
        try { event.target.setPointerCapture(event.pointerId); } catch {}
      }

      const svgEl = document.querySelector('#price-chart');
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const { width, height, pad } = getCompanyChartGeometry(chartBlock);

      const curX = ((event.clientX - rect.left) / rect.width) * width;
      const curY = ((event.clientY - rect.top) / rect.height) * height;
      const startX = Math.max(pad.left, Math.min(width - pad.right, curX));
      const startY = Math.max(pad.top, Math.min(height - pad.bottom, curY));

      isMeasuring = true;
      measureStartButton = event.button;
      measureStartSvgX = startX;
      measureStartSvgY = startY;
      measureCurrentSvgX = startX;
      measureCurrentSvgY = startY;
      canvasInner.classList.add('measuring');

      const hoverLayer = document.querySelector('#price-chart .pf-chart-hover-layer');
      if (hoverLayer) {
        hoverLayer.style.display = 'none';
      }

      updateCompanyMeasurementView(event.clientX, event.clientY);

      window.addEventListener('pointermove', onCompanyMeasurePointerMove);
      window.addEventListener('mousemove', onCompanyMeasurePointerMove);
      window.addEventListener('pointerup', onCompanyMeasurePointerUp);
      window.addEventListener('mouseup', onCompanyMeasurePointerUp);
      return;
    }

    if (event.button !== 0) return;

    isPanning = true;
    panMoved = false;
    panStartX = event.clientX;
    panInitStart = chartSliceStart;
    panInitEnd = chartSliceEnd;
    canvasInner.classList.add('panning');

    function onPanMove(e) {
      if (!isPanning || !chartPoints.length) return;
      const deltaX = e.clientX - panStartX;
      if (Math.abs(deltaX) > 4) {
        panMoved = true;
        const hoverLayer = document.querySelector('#price-chart .pf-chart-hover-layer');
        if (hoverLayer) hoverLayer.style.display = 'none';
        hideChartTooltip();
      }
      if (!panMoved) return;

      const rect = canvasInner.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const { width, pad, innerWidth } = getCompanyChartGeometry(chartBlock);
      const innerWidthPx = rect.width * (innerWidth / width);
      const span = panInitEnd - panInitStart;
      const deltaRatio = deltaX / Math.max(1, innerWidthPx);
      const deltaIdx = Math.round(deltaRatio * span);

      let newStart = panInitStart - deltaIdx;
      let newEnd = panInitEnd - deltaIdx;

      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, span);
      } else if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, total - 1 - span);
      }

      if (newStart !== chartSliceStart || newEnd !== chartSliceEnd) {
        chartSliceStart = newStart;
        chartSliceEnd = newEnd;
        renderPriceChart();
      }
    }

    function onPanUp() {
      if (!isPanning) return;
      isPanning = false;
      canvasInner.classList.remove('panning');
      window.removeEventListener('pointermove', onPanMove);
      window.removeEventListener('pointerup', onPanUp);
      window.removeEventListener('pointercancel', onPanUp);
    }

    window.addEventListener('pointermove', onPanMove);
    window.addEventListener('pointerup', onPanUp);
    window.addEventListener('pointercancel', onPanUp);
  });

  // Hover crosshair & tooltip
  canvasInner.addEventListener('mousemove', (event) => {
    if (isMeasuring || isComparing) return;
    if (isPanning && panMoved) return;
    if (!chartPoints.length) return;

    const points = chartPoints.slice(chartSliceStart, chartSliceEnd + 1);
    if (!points.length) return;

    const svgEl = document.querySelector('#price-chart');
    const hoverLayer = svgEl?.querySelector('.pf-chart-hover-layer');
    const crosshairV = svgEl?.querySelector('.pf-chart-crosshair-v');
    const crosshairH = svgEl?.querySelector('.pf-chart-crosshair-h');
    const hoverDot = svgEl?.querySelector('.pf-chart-hover-dot');
    const hoverXBadge = svgEl?.querySelector('.pf-chart-x-badge');
    const hoverXBadgeText = svgEl?.querySelector('.pf-chart-x-badge-text');
    const hoverYBadge = svgEl?.querySelector('.pf-chart-y-badge');
    const hoverYBadgeBg = svgEl?.querySelector('.pf-chart-y-badge-bg');
    const hoverYBadgeText = svgEl?.querySelector('.pf-chart-y-badge-text');
    if (!svgEl || !hoverLayer || !crosshairV || !crosshairH || !hoverDot) return;

    const rect = svgEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const geom = priceChartRenderState || getCompanyChartGeometry(chartBlock);
    const { width, height, pad, innerWidth, innerHeight } = geom;

    const rawSvgX = ((event.clientX - rect.left) / rect.width) * width;
    const rawSvgY = ((event.clientY - rect.top) / rect.height) * height;

    if (rawSvgX < pad.left - 20 || rawSvgX > width - pad.right + 20 || rawSvgY < pad.top - 30 || rawSvgY > height - pad.bottom + 30) {
      hoverLayer.style.display = 'none';
      hideChartTooltip();
      return;
    }

    const cursorSvgX = Math.max(pad.left, Math.min(width - pad.right, rawSvgX));
    const cursorSvgY = Math.max(pad.top, Math.min(height - pad.bottom, rawSvgY));

    const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));
    const index = Math.round(ratio * (points.length - 1));
    const point = points[index];
    if (!point) return;

    const values = points.map((p) => p.v).filter(Number.isFinite);
    const activeMAs = chartMaConfig.filter((m) => m.active && chartMovingAveragesData[m.period]?.length);
    if (activeMAs.length) {
      activeMAs.forEach((ma) => {
        const maPts = chartMovingAveragesData[ma.period] || [];
        if (!maPts.length) return;
        const isMatchingSeries = chartPoints.length === maPts.length && chartPoints[0]?.t === maPts[0]?.t;
        if (isMatchingSeries) {
          const maSlice = maPts.slice(chartSliceStart, chartSliceEnd + 1);
          maSlice.forEach((m) => {
            if (m && Number.isFinite(m.v)) values.push(m.v);
          });
        } else {
          const minT = points[0].t;
          const maxT = Math.max(points[points.length - 1].t, maPts[maPts.length - 1]?.t || points[points.length - 1].t);
          maPts.forEach((m) => {
            if (m.t >= minT && m.t <= maxT && Number.isFinite(m.v)) values.push(m.v);
          });
        }
      });
    }
    const { min, max } = computePriceScale(values);

    const x = (idx) => pad.left + (idx / Math.max(1, points.length - 1)) * innerWidth;
    const y = (val) => pad.top + (1 - (val - min) / (max - min)) * innerHeight;

    const px = x(index);
    const pyPrice = y(point.v);

    // Build candidate curves (Price, and each active MA)
    const candidates = [
      {
        id: 'price',
        label: companyTicker || 'Precio',
        value: point.v,
        py: pyPrice,
        color: '#4f46e5',
      }
    ];

    const matchedMAs = [];
    if (activeMAs.length) {
      activeMAs.forEach((ma) => {
        const maPts = chartMovingAveragesData[ma.period] || [];
        let matchedMa = null;
        if (chartPoints.length === maPts.length && chartPoints[0]?.t === maPts[0]?.t) {
          matchedMa = maPts[chartSliceStart + index];
        } else {
          const candleWindow = points.length > 1
            ? Math.max(86400, Math.abs(points[1].t - points[0].t) * 0.9)
            : 86400;
          let bestDiff = Infinity;
          for (let i = 0; i < maPts.length; i++) {
            const diff = Math.abs(maPts[i].t - point.t);
            if (diff < bestDiff && diff <= candleWindow) {
              bestDiff = diff;
              matchedMa = maPts[i];
            }
          }
        }
        if (matchedMa && Number.isFinite(matchedMa.v)) {
          const item = {
            id: `ma-${ma.period}`,
            label: `MA ${ma.period}`,
            period: ma.period,
            value: matchedMa.v,
            py: y(matchedMa.v),
            color: ma.color,
          };
          candidates.push(item);
          matchedMAs.push(item);
        }
      });
    }

    // Pick the curve closest to the cursor's Y
    let closest = candidates[0];
    if (candidates.length > 1) {
      let minDist = Math.abs(cursorSvgY - closest.py);
      for (let i = 1; i < candidates.length; i++) {
        const d = Math.abs(cursorSvgY - candidates[i].py);
        if (d < minDist) {
          minDist = d;
          closest = candidates[i];
        }
      }
    }

    const selectedPy = closest.py;
    const selectedValue = closest.value;
    const selectedColor = closest.color;

    hoverLayer.removeAttribute('hidden');
    hoverLayer.style.display = 'inline';
    crosshairV.setAttribute('x1', px.toFixed(1));
    crosshairV.setAttribute('x2', px.toFixed(1));
    crosshairH.setAttribute('y1', selectedPy.toFixed(1));
    crosshairH.setAttribute('y2', selectedPy.toFixed(1));

    // 1. Puntito en la cotización: SIEMPRE en (px, pyPrice) sobre la línea de cotización (estilo Google Finance)
    const dotWrap = svgEl.querySelector('.pf-chart-hover-dot-wrap');
    if (dotWrap) {
      dotWrap.setAttribute('transform', `translate(${px.toFixed(1)}, ${pyPrice.toFixed(1)})`);
      dotWrap.style.display = 'inline';
      if (hoverDot) {
        hoverDot.setAttribute('stroke', '#ffffff');
        hoverDot.setAttribute('fill', '#4f46e5');
      }
    }

    // 2. Puntitos en las medias móviles activas en esa sesión: cada una en su curva (px, pyMA)
    const maDotsContainer = svgEl.querySelector('.pf-chart-hover-ma-dots');
    if (maDotsContainer) {
      if (matchedMAs.length) {
        maDotsContainer.innerHTML = matchedMAs.map((ma) => {
          const isClosest = closest.id === ma.id;
          return `
            ${isClosest ? `<circle cx="${px.toFixed(1)}" cy="${ma.py.toFixed(1)}" r="7.5" fill="${ma.color}" fill-opacity="0.3"/>` : ''}
            <circle cx="${px.toFixed(1)}" cy="${ma.py.toFixed(1)}" r="${isClosest ? '4.5' : '3.6'}" fill="${ma.color}" stroke="#ffffff" stroke-width="1.6" class="pf-chart-hover-ma-dot"/>
          `;
        }).join('');
      } else {
        maDotsContainer.innerHTML = '';
      }
    }

    if (hoverXBadge && hoverXBadgeText) {
      hoverXBadge.setAttribute('transform', `translate(${px.toFixed(1)}, ${height - pad.bottom})`);
      hoverXBadgeText.textContent = formatTradingViewHoverDate(point.date);
    }

    if (hoverYBadge && hoverYBadgeText) {
      const formatted = formatPriceValue(selectedValue);
      const badgeW = Math.max(pad.right - 8, formatted.length * 7 + 14);
      const clampedY = Math.max(pad.top + 10, Math.min(height - pad.bottom - 10, selectedPy));
      const bx = width - pad.right + 6;
      hoverYBadge.setAttribute('transform', `translate(${bx.toFixed(1)}, ${clampedY.toFixed(1)})`);
      if (hoverYBadgeBg) {
        hoverYBadgeBg.setAttribute('width', badgeW.toFixed(1));
        hoverYBadgeBg.setAttribute('fill', selectedColor);
      }
      const arrowEl = hoverYBadge.querySelector('.pf-chart-y-badge-arrow');
      if (arrowEl) arrowEl.setAttribute('fill', selectedColor);
      hoverYBadgeText.setAttribute('x', (badgeW / 2).toFixed(1));
      hoverYBadgeText.textContent = formatted;
      hoverYBadge.hidden = false;
      hoverYBadge.style.display = 'inline';
    }

    // Matching MA points if enabled
    let maHtml = '';
    if (matchedMAs.length) {
      maHtml = matchedMAs.map((item) => {
        const isMaActive = closest.id === item.id;
        return `
          <div class="pf-chart-tooltip-row" style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 6px; ${isMaActive && candidates.length > 1 ? `background: ${item.color}25; border-radius: 4px; padding: 2px 6px;` : ''}">
            <span class="pf-chart-tooltip-dot" style="width: 7px; height: 7px; border-radius: 50%; background:${item.color}; display: inline-block; flex-shrink: 0;"></span>
            <span class="pf-chart-tooltip-label" style="color:${item.color}; ${isMaActive && candidates.length > 1 ? 'font-weight:700;' : ''}">${escapeHtml(item.label)}:</span>
            <strong class="pf-chart-tooltip-val" style="margin-left:auto; color:#ffffff;">${escapeHtml(formatPriceValue(item.value))}</strong>
          </div>`;
      }).join('');
    }

    const prevPoint = index > 0 ? points[index - 1] : null;
    let diff = 0;
    let diffPct = 0;
    if (prevPoint && Number.isFinite(prevPoint.v) && prevPoint.v > 0) {
      diff = point.v - prevPoint.v;
      diffPct = (diff / prevPoint.v) * 100;
    }
    const chgClass = diff > 0 ? 'positive' : (diff < 0 ? 'negative' : '');
    const changeHtml = prevPoint ? `<span style="font-size:11px; margin-left:6px;" class="${chgClass}">(${formatSignedPct(diffPct)})</span>` : '';
    const liveDateStr = formatTradingViewHoverDate(point.date);

    // Actualizar dinámicamente la cotización en tiempo real
    const closestMa = closest.id.startsWith('ma-') ? closest : (matchedMAs[0] || null);
    setQuoteDisplay({
      price: point.v,
      change: diff,
      changePercent: diffPct,
      dateText: liveDateStr,
      isHover: true,
      maValue: closestMa ? closestMa.value : null,
      maLabel: closestMa ? closestMa.label : null,
      maColor: closestMa ? closestMa.color : null,
    });

    const isPriceActive = closest.id === 'price';
    const tip = ensureChartTooltip();
    tip.innerHTML = `
      <div class="pf-chart-tooltip-head" style="margin-bottom: 4px;">
        <span class="pf-chart-tooltip-title">${escapeHtml(companyTicker)} · Cotización</span>
        <span class="pf-chart-tooltip-date" style="display:block; color:#94a3b8; font-size:10px;">${escapeHtml(formatTradingViewHoverDate(point.date))}</span>
      </div>
      <div style="font-size: 14px; font-weight: 700; color: #ffffff; display: flex; align-items: baseline; ${isPriceActive && candidates.length > 1 ? 'background: rgba(79, 70, 229,0.15); border-radius: 4px; padding: 2px 4px;' : ''}">
        ${escapeHtml(formatPriceValue(point.v))}
        ${changeHtml}
      </div>
      ${maHtml}
    `;
    tip.hidden = false;
    positionChartTooltip(tip, event.clientX, event.clientY);
  });

  canvasInner.addEventListener('mouseleave', () => {
    if (isMeasuring || isComparing) return;
    const hoverLayer = document.querySelector('#price-chart .pf-chart-hover-layer');
    if (hoverLayer) {
      hoverLayer.style.display = 'none';
    }
    const maDotsContainer = document.querySelector('#price-chart .pf-chart-hover-ma-dots');
    if (maDotsContainer) maDotsContainer.innerHTML = '';
    restoreQuoteDisplay();
    hideChartTooltip();
  });

  // Timeline brush interaction
  const track = document.querySelector('#chart-timeline-track');
  const win = document.querySelector('#chart-timeline-window');
  const handleL = document.querySelector('#chart-handle-l');
  const handleR = document.querySelector('#chart-handle-r');

  function wireTimelineHandle(handleEl, isLeft) {
    if (!handleEl) return;
    handleEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { e.target.setPointerCapture(e.pointerId); } catch {}
      handleEl.classList.add('active');

      const total = chartPoints.length;
      const trackRect = track.getBoundingClientRect();

      function onHandleMove(mv) {
        if (!trackRect.width) return;
        const ratio = Math.max(0, Math.min(1, (mv.clientX - trackRect.left) / trackRect.width));
        const idx = Math.round(ratio * (total - 1));
        if (isLeft) {
          chartSliceStart = Math.min(idx, chartSliceEnd - 4);
        } else {
          chartSliceEnd = Math.max(idx, chartSliceStart + 4);
        }
        renderPriceChart();
      }

      function onHandleUp() {
        handleEl.classList.remove('active');
        window.removeEventListener('pointermove', onHandleMove);
        window.removeEventListener('pointerup', onHandleUp);
        window.removeEventListener('pointercancel', onHandleUp);
      }

      window.addEventListener('pointermove', onHandleMove);
      window.addEventListener('pointerup', onHandleUp);
      window.addEventListener('pointercancel', onHandleUp);
    });
  }

  wireTimelineHandle(handleL, true);
  wireTimelineHandle(handleR, false);

  if (win) {
    win.addEventListener('pointerdown', (e) => {
      if (e.target === handleL || e.target === handleR || handleL?.contains(e.target) || handleR?.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      try { e.target.setPointerCapture(e.pointerId); } catch {}
      win.classList.add('dragging');

      const total = chartPoints.length;
      const trackRect = track.getBoundingClientRect();
      const startClientX = e.clientX;
      const initStart = chartSliceStart;
      const initEnd = chartSliceEnd;
      const span = initEnd - initStart;

      function onWinMove(mv) {
        if (!trackRect.width) return;
        const deltaX = mv.clientX - startClientX;
        const deltaRatio = deltaX / trackRect.width;
        const deltaIdx = Math.round(deltaRatio * (total - 1));

        let newStart = initStart + deltaIdx;
        let newEnd = initEnd + deltaIdx;

        if (newStart < 0) {
          newStart = 0;
          newEnd = Math.min(total - 1, span);
        } else if (newEnd > total - 1) {
          newEnd = total - 1;
          newStart = Math.max(0, total - 1 - span);
        }

        if (newStart !== chartSliceStart || newEnd !== chartSliceEnd) {
          chartSliceStart = newStart;
          chartSliceEnd = newEnd;
          renderPriceChart();
        }
      }

      function onWinUp() {
        win.classList.remove('dragging');
        window.removeEventListener('pointermove', onWinMove);
        window.removeEventListener('pointerup', onWinUp);
        window.removeEventListener('pointercancel', onWinUp);
      }

      window.addEventListener('pointermove', onWinMove);
      window.addEventListener('pointerup', onWinUp);
      window.addEventListener('pointercancel', onWinUp);
    });
  }

  // Zoom buttons
  const zoomInBtn = document.querySelector('#chart-zoom-in');
  const zoomOutBtn = document.querySelector('#chart-zoom-out');
  const zoomResetBtn = document.querySelector('#chart-zoom-reset');
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoomChartByStep('in'));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoomChartByStep('out'));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => zoomChartByStep('reset'));

  // MA Controls wiring
  wireMaControls();

  // Fullscreen button
  const fsBtn = document.querySelector('#chart-fullscreen');
  if (fsBtn) {
    fsBtn.addEventListener('click', () => toggleFullscreen(chartBlock));
  }
}

function toggleFullscreen(element) {
  if (!element) return;
  const isVal = element.id === 'val-chart-block' || element.classList.contains('val-chart-block');
  const rerender = () => {
    requestAnimationFrame(() => {
      if (isVal) renderValuationChart();
      else renderPriceChart();
    });
    setTimeout(() => {
      if (isVal) renderValuationChart();
      else renderPriceChart();
    }, 60);
    setTimeout(() => {
      if (isVal) renderValuationChart();
      else renderPriceChart();
    }, 180);
  };
  if (document.fullscreenElement === element || element.classList.contains('is-fullscreen')) {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(rerender).catch(() => {
          rerender();
        });
      }
    } else {
      element.classList.remove('is-fullscreen');
      rerender();
    }
    return;
  }
  if (element.requestFullscreen) {
    element.requestFullscreen().then(() => {
      rerender();
    }).catch(() => {
      element.classList.toggle('is-fullscreen');
      rerender();
    });
  } else {
    element.classList.toggle('is-fullscreen');
    rerender();
  }
}

function renderMaControlsUi() {
  const chipsContainer = document.querySelector('#chart-ma-chips');
  const listContainer = document.querySelector('#chart-ma-list');

  // 1. Render Chips
  if (chipsContainer) {
    chipsContainer.innerHTML = chartMaConfig.map((ma) => {
      const activeClass = ma.active ? 'active' : '';
      return `
        <button type="button" class="chart-ma-chip ${activeClass}" data-ma-id="${escapeHtml(ma.id)}" title="Alternar MA ${ma.period} sesiones" aria-pressed="${ma.active ? 'true' : 'false'}">
          <span class="ma-chip-dot" style="background:${ma.color};"></span>
          <span>MA ${ma.period}</span>
        </button>
      `;
    }).join('');

    // Wire chip click handlers
    chipsContainer.querySelectorAll('.chart-ma-chip').forEach((chip) => {
      chip.addEventListener('click', async (e) => {
        e.stopPropagation();
        const maId = chip.getAttribute('data-ma-id');
        const target = chartMaConfig.find((m) => m.id === maId);
        if (!target) return;
        target.active = !target.active;
        saveChartMaConfig(chartMaConfig);
        renderMaControlsUi();
        if (target.active && (!chartMovingAveragesData[target.period] || !chartMovingAveragesData[target.period].length)) {
          await loadChart(chartRange);
        } else {
          renderPriceChart();
        }
      });
    });
  }

  // 2. Render List in Popover
  if (listContainer) {
    listContainer.innerHTML = chartMaConfig.map((ma) => `
      <div class="chart-ma-item" data-ma-id="${escapeHtml(ma.id)}">
        <input type="checkbox" class="chart-ma-item-check" ${ma.active ? 'checked' : ''} title="Mostrar/ocultar en el gráfico" />
        <span class="chart-ma-item-dot" style="background:${ma.color};"></span>
        <span class="chart-ma-item-label">MA</span>
        <input type="number" min="2" max="5000" step="1" class="chart-ma-item-input" value="${ma.period}" title="Editar número de sesiones" />
        <button type="button" class="chart-ma-item-del" title="Eliminar media móvil">&times;</button>
      </div>
    `).join('');

    // Wire list item interactions
    listContainer.querySelectorAll('.chart-ma-item').forEach((itemEl) => {
      const maId = itemEl.getAttribute('data-ma-id');
      const target = chartMaConfig.find((m) => m.id === maId);
      if (!target) return;

      const chk = itemEl.querySelector('.chart-ma-item-check');
      if (chk) {
        chk.addEventListener('change', async () => {
          target.active = chk.checked;
          saveChartMaConfig(chartMaConfig);
          renderMaControlsUi();
          if (target.active && (!chartMovingAveragesData[target.period] || !chartMovingAveragesData[target.period].length)) {
            await loadChart(chartRange);
          } else {
            renderPriceChart();
          }
        });
      }

      const input = itemEl.querySelector('.chart-ma-item-input');
      if (input) {
        const handlePeriodChange = async () => {
          const rawVal = parseInt(input.value, 10);
          if (isNaN(rawVal) || rawVal < 2 || rawVal > 5000) {
            input.value = target.period;
            return;
          }
          if (rawVal === target.period) return;
          const isDuplicate = chartMaConfig.some((m) => m.id !== target.id && m.period === rawVal);
          if (isDuplicate) {
            input.value = target.period;
            return;
          }
          target.period = rawVal;
          saveChartMaConfig(chartMaConfig);
          renderMaControlsUi();
          await loadChart(chartRange);
        };
        input.addEventListener('change', handlePeriodChange);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
          }
        });
      }

      const delBtn = itemEl.querySelector('.chart-ma-item-del');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          chartMaConfig = chartMaConfig.filter((m) => m.id !== maId);
          saveChartMaConfig(chartMaConfig);
          renderMaControlsUi();
          renderPriceChart();
        });
      }
    });
  }
}

let maControlsWired = false;
function wireMaControls() {
  renderMaControlsUi();
  if (maControlsWired) return;
  maControlsWired = true;

  const configBtn = document.querySelector('#chart-ma-config-btn');
  const popover = document.querySelector('#chart-ma-popover');
  const closeBtn = document.querySelector('#chart-ma-popover-close');
  const addForm = document.querySelector('#chart-ma-add-form');
  const addInput = document.querySelector('#chart-ma-add-input');
  const controlWrap = document.querySelector('#chart-ma-control');

  if (!configBtn || !popover) return;

  const togglePopover = (show) => {
    const isHidden = popover.hidden;
    const nextShow = typeof show === 'boolean' ? show : isHidden;
    popover.hidden = !nextShow;
    configBtn.classList.toggle('is-open', nextShow);
    configBtn.setAttribute('aria-expanded', String(nextShow));
    if (nextShow && addInput) {
      setTimeout(() => addInput.focus(), 50);
    }
  };

  configBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePopover(false);
    });
  }

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!popover.hidden && controlWrap && !controlWrap.contains(e.target)) {
      togglePopover(false);
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popover.hidden) {
      togglePopover(false);
    }
  });

  // Form submission: Add new MA
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!addInput) return;
      const val = parseInt(addInput.value, 10);
      if (isNaN(val) || val < 2 || val > 5000) return;

      const existing = chartMaConfig.find((m) => m.period === val);
      if (existing) {
        existing.active = true;
      } else {
        const usedColors = new Set(chartMaConfig.map((m) => m.color));
        const nextColor = MA_PALETTE.find((c) => !usedColors.has(c)) || MA_PALETTE[chartMaConfig.length % MA_PALETTE.length];
        chartMaConfig.push({
          id: `ma-${val}-${Date.now()}`,
          period: val,
          active: true,
          color: nextColor,
        });
      }
      saveChartMaConfig(chartMaConfig);
      addInput.value = '';
      renderMaControlsUi();
      await loadChart(chartRange);
    });
  }

  // Quick preset buttons
  const presetBtns = popover.querySelectorAll('[data-preset]');
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const val = parseInt(btn.getAttribute('data-preset'), 10);
      if (!val || val < 2) return;

      const existing = chartMaConfig.find((m) => m.period === val);
      if (existing) {
        existing.active = true;
      } else {
        const usedColors = new Set(chartMaConfig.map((m) => m.color));
        const nextColor = MA_PALETTE.find((c) => !usedColors.has(c)) || MA_PALETTE[chartMaConfig.length % MA_PALETTE.length];
        chartMaConfig.push({
          id: `ma-${val}-${Date.now()}`,
          period: val,
          active: true,
          color: nextColor,
        });
      }
      saveChartMaConfig(chartMaConfig);
      renderMaControlsUi();
      await loadChart(chartRange);
    });
  });
}

// Global hotkeys for fullscreen
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

const quotePanel = document.querySelector('.company-quote');
function openChartFullscreen() {
  document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === 'perfil'));
  showSection('perfil');
  const chartBlock = document.querySelector('#company-chart-block') || document.querySelector('.chart-block');
  toggleFullscreen(chartBlock);
}
if (quotePanel) {
  quotePanel.addEventListener('click', openChartFullscreen);
  quotePanel.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openChartFullscreen();
    }
  });
}

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

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderPriceChart();
    renderValuationChart();
  }, 100);
});

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
    }, 80);
  });
  const valBody = document.querySelector('#val-chart-body');
  if (valBody) chartRo.observe(valBody);
  const priceBody = document.querySelector('#chart-body');
  if (priceBody) chartRo.observe(priceBody);
}

document.querySelectorAll('.chart-ranges button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.chart-ranges button').forEach((item) => item.classList.toggle('active', item === button));
    loadChart(button.dataset.range);
  });
});

wireCompanyChartInteractions();

/* ── Datos financieros (tablas) ─────────────────────────────── */


function renderScreenerTables() {
  if (!companyData) return;
  const rows = [...(companyData[screenerSeries] ?? [])].reverse();
  const visibleIndexes = screenerVisibleIndexes(rows);
  syncScreenerRange();
  const statements = companyData.statements ?? {};
  const title = document.querySelector('#screener-table-title');
  const statementNames = {
    valuation: 'Valoración',
    income: 'Cuenta de resultados',
    balance: 'Balance de situación',
    cashflow: 'Estado de Flujo de Efectivo',
  };
  title.textContent = `${statementNames[screenerStatement] ?? 'Estado financiero'} | Cifra`;
  const range = document.querySelector('#screener-period-range');
  range.textContent = visibleIndexes.length
    ? `Datos financieros de ${periodDateLabel(rows[visibleIndexes[visibleIndexes.length - 1]])} a ${periodDateLabel(rows[visibleIndexes[0]])}`
    : 'Sin periodos visibles';

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
screenerFilings = window.EmpresaFilings?.getFilings?.() || null;


/* ── Listas de seguimiento ─────────────────────────────────── */

function renderCompanyWatchState() {
  const button = document.querySelector('#company-watch');
  if (!button || !companyTicker) return;
  const tracked = Watchlists.isInAnyList(companyTicker);
  button.classList.toggle('active', tracked);
  button.setAttribute('aria-label', tracked
    ? `${companyTicker} está en tus listas de seguimiento`
    : `Añadir ${companyTicker} a listas de seguimiento`);
}

window.addEventListener('watchlists:change', () => {
  renderCompanyWatchState();
});

Watchlists.mountSection(document.querySelector('#watchlists-section'), {
  countEl: document.querySelector('#favorites-count'),
  onNavigate: goToCompany,
});



/* ── Secciones del menú lateral ─────────────────────────────── */

function showSection(key) {
  restoreQuoteDisplay();
  const companyHeadRow = document.querySelector('.company-head-row');
  const sections = {
    perfil: document.querySelector('#section-perfil'),
    favoritos: document.querySelector('#section-favoritos'),
    cartera: document.querySelector('#section-cartera'),
    calendario: document.querySelector('#section-calendario'),
    analisis: document.querySelector('#section-analisis'),
    novedades: document.querySelector('#section-novedades'),
    guias: document.querySelector('#section-guias'),
    reportes: document.querySelector('#section-reportes'),
    informes: document.querySelector('#section-informes'),
    datos: document.querySelector('#section-datos'),
    accionariado: document.querySelector('#section-accionariado'),
    foros: document.querySelector('#section-foros'),
    alertas: document.querySelector('#section-alertas'),
    placeholder: document.querySelector('#section-placeholder'),
  };

  Object.values(sections).forEach((section) => { if (section) section.hidden = true; });

  const isGlobalSection = ['favoritos', 'alertas', 'cartera', 'calendario', 'analisis', 'novedades', 'guias', 'reportes'].includes(key);
  if (companyHeadRow) {
    companyHeadRow.hidden = isGlobalSection;
  }
  if (isGlobalSection) {
    if (companyLoading) companyLoading.hidden = true;
    if (companyBody) companyBody.hidden = false;
  }

  if (key === 'favoritos') {
    if (sections.favoritos) sections.favoritos.hidden = false;
    Watchlists.mountSection(document.querySelector('#watchlists-section'), {
      countEl: document.querySelector('#favorites-count'),
      onNavigate: goToCompany,
    });
    Watchlists.refresh();
    return;
  }

  if (key === 'alertas') {
    if (sections.alertas) sections.alertas.hidden = false;
    const container = document.querySelector('#price-alerts-section');
    if (container && !container.dataset.mounted) {
      container.dataset.mounted = '1';
      PriceAlerts.mountSection(container, {
        countEl: document.querySelector('#price-alerts-count'),
        onNavigate: goToCompany,
        initialCompany: {
          ticker: companyTicker,
          name: companyData?.company?.name || companyTicker,
          price: companyData?.market?.price || null,
        },
      });
    } else if (container) {
      PriceAlerts.loadAlerts?.();
    }
    return;
  }

  if (key === 'cartera') {
    if (sections.cartera) sections.cartera.hidden = false;
    const root = document.querySelector('#portfolio-section');
    if (root) {
      Portfolio.mountSection(root, {
        onNavigate: goToCompany,
      });
    }
    return;
  }

  if (key === 'calendario') {
    if (sections.calendario) sections.calendario.hidden = false;
    const root = document.querySelector('#calendar-section');
    if (root) {
      Portfolio.mountCalendarSection(root, {
        onNavigate: goToCompany,
      });
    }
    return;
  }

  if (key === 'analisis') {
    if (sections.analisis) sections.analisis.hidden = false;
    window.AnalysisModule?.fetchAnalyses();
    return;
  }

  if (key === 'novedades') {
    if (sections.novedades) sections.novedades.hidden = false;
    window.NovedadesModule?.render();
    return;
  }

  if (key === 'guias') {
    if (sections.guias) sections.guias.hidden = false;
    document.title = 'Cifra | Guías';
    window.GuiasModule?.init();
    return;
  }

  if (key === 'reportes') {
    if (sections.reportes) sections.reportes.hidden = false;
    window.ReportsModule?.render();
    return;
  }

  if (key === 'informes') {
    if (sections.informes) sections.informes.hidden = false;
    if (!screenerFilings && !screenerFilingsLoading) loadFilings(companyTicker);
    return;
  }

  if (key === 'datos') {
    if (sections.datos) sections.datos.hidden = false;
    renderScreenerTables();
    return;
  }

  if (key === 'accionariado') {
    if (sections.accionariado) sections.accionariado.hidden = false;
    if (!companyHoldersData && !companyHoldersLoading) {
      loadHolders(companyTicker);
    } else if (companyHoldersData) {
      renderHolders(companyTicker);
    }
    return;
  }

  if (key === 'foros') {
    if (sections.foros) sections.foros.hidden = false;
    if (window.Forum) {
      window.Forum.load(companyTicker, companyData?.company?.name);
    }
    return;
  }

  if (SECTION_PLACEHOLDERS.includes(key)) {
    const label = document.querySelector(`.nav-link[data-section="${key}"] span`)?.textContent ?? 'Sección';
    document.querySelector('#placeholder-title').textContent = label;
    if (sections.placeholder) sections.placeholder.hidden = false;
    return;
  }

  if (sections.perfil) sections.perfil.hidden = false;
}

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

/* ── Cabecera de empresa: acciones ──────────────────────────── */

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

/* ── Menú lateral ───────────────────────────────────────────── */

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

function closeSidebar() {
  sidebar.classList.remove('open');
  backdrop.classList.remove('visible');
  menuToggle.setAttribute('aria-expanded', 'false');
}

/* ── Buscador superior ──────────────────────────────────────── */

async function searchCompanies(query) {
  const response = await fetch(`/api/screener/search?q=${encodeURIComponent(query.trim())}`);
  if (!response.ok) return [];
  const data = await response.json().catch(() => null);
  return data?.companies ?? [];
}

function renderSearchResults(query) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(async () => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      searchResults.hidden = true;
      searchResults.innerHTML = '';
      return;
    }

    const matches = await searchCompanies(query);
    if (!matches.length) {
      searchResults.innerHTML = '<div class="search-empty">Sin resultados en EDGAR para esta búsqueda.</div>';
      searchResults.hidden = false;
      return;
    }

    searchResults.innerHTML = matches.map((company) => {
      const inPortfolio = typeof Portfolio !== 'undefined' && Boolean(Portfolio.hasPosition?.(company.ticker));
      return `
      <button class="search-result" type="button" data-ticker="${escapeHtml(company.ticker)}">
        <img class="search-result-logo" src="https://companiesmarketcap.com/img/company-logos/64/${escapeHtml(company.ticker)}.webp" alt="" loading="lazy" data-letter="${escapeHtml((company.name || company.ticker || '?').slice(0, 1).toUpperCase())}">
        <span class="search-result-name">${escapeHtml(company.name)}</span>
        ${inPortfolio ? '<span class="search-result-pf-badge" title="En tu cartera">💼 Cartera</span>' : ''}
        <strong>${escapeHtml(company.ticker)}</strong>
      </button>`;
    }).join('');
    searchResults.hidden = false;

    searchResults.querySelectorAll('.search-result').forEach((result) => {
      result.addEventListener('click', () => goToCompany(result.dataset.ticker));
    });
    searchResults.querySelectorAll('.search-result-logo').forEach((logo) => {
      logo.addEventListener('error', () => {
        const letter = document.createElement('span');
        letter.className = 'search-result-logo search-result-logo-fallback';
        letter.textContent = logo.dataset.letter || '?';
        logo.replaceWith(letter);
      });
    });
  }, 250);
}

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

/* ── Carga inicial ──────────────────────────────────────────── */

function syncAuthDependencies(isAuth) {
  companyAuthenticated = isAuth;
  Watchlists?.setAuthenticated?.(companyAuthenticated);
  if (companyAuthenticated) Watchlists?.refresh?.();
  Portfolio?.setAuthenticated?.(companyAuthenticated);
  if (companyData && !document.querySelector('#section-datos')?.hidden) {
    renderScreenerTables();
  }
}

window.addEventListener('auth:change', (event) => {
  syncAuthDependencies(Boolean(event.detail?.user));
});

if (window.AuthModule?.isReady()) {
  syncAuthDependencies(Boolean(window.AuthModule.getUser()));
} else if (window.AuthModule?.whenReady) {
  window.AuthModule.whenReady().then((readyUser) => {
    syncAuthDependencies(Boolean(readyUser));
  });
} else if (window.currentUser) {
  syncAuthDependencies(true);
}

async function loadCompany() {
  screenerFilings = null;
  screenerFilingsLoading = false;
  window.EmpresaFilings?.abortPresentations?.();
  const currentActiveSection = resolveInitialSection();
  const isGlobal = ['favoritos', 'alertas', 'cartera', 'calendario', 'analisis', 'novedades', 'guias', 'reportes'].includes(currentActiveSection);
  if (!isGlobal) {
    companyLoading.hidden = false;
    companyBody.hidden = true;
  }
  companyError.hidden = true;

  try {
    const response = await fetch(`/api/screener/company/${encodeURIComponent(companyTicker)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      companyError.textContent = data.error || 'No se pudo consultar la empresa.';
      companyError.hidden = false;
      return;
    }
    renderCompany(data);
    companyBody.hidden = false;
    renderCompanyWatchState();
    renderPriceChart();
    loadChart(chartRange);
    const portfolioRoot = document.querySelector('#portfolio-company-section');
    if (portfolioRoot?.dataset.ticker) {
      portfolioRoot.dataset.name = data.company?.name ?? companyTicker;
      Portfolio.registerCompanyPanel(portfolioRoot);
    }
    if (window.Forum) {
      window.Forum.updateCompany(companyTicker, data.company?.name);
    }
    if (data.company?.ticker) {
      companyTicker = data.company.ticker.toUpperCase();
      window.companyTicker = companyTicker;
      localStorage.setItem(SAVED_TICKER_KEY, companyTicker);
    }
    const currentActiveSection = resolveInitialSection();
    if (currentActiveSection && currentActiveSection !== 'perfil') {
      document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === currentActiveSection));
      showSection(currentActiveSection);
    }
    const searchParams = new URLSearchParams(window.location.search);
    const initialVmetric = searchParams.get('vmetric');
    if (initialVmetric) {
      valChartMetric = initialVmetric;
      document.querySelectorAll('.val-chart-metrics button').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.vmetric === initialVmetric);
      });
      if (typeof renderValuationChart === 'function') renderValuationChart();
    }
  } catch (err) {
    console.error('[loadCompany error]:', err);
    companyError.textContent = 'No se pudo conectar con el servidor o cargar los datos de la empresa.';
    companyError.hidden = false;
  } finally {
    companyLoading.hidden = true;
  }
}

function resolveInitialSection() {
  const path = window.location.pathname.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);

  if (path.startsWith('/cartera') || searchParams.get('cartera') === '1') {
    return 'cartera';
  }
  if (path.startsWith('/calendario') || searchParams.get('calendario') === '1') {
    return 'calendario';
  }
  if (path.startsWith('/seguimiento') || path.startsWith('/favoritos')) {
    return 'favoritos';
  }
  if (path.startsWith('/alerta')) {
    return 'alertas';
  }
  if (path.startsWith('/analisi') || path.startsWith('/informe') || searchParams.get('analizar')) {
    return 'analisis';
  }
  if (path.startsWith('/novedad')) {
    return 'novedades';
  }
  if (path.startsWith('/guia')) {
    return 'guias';
  }
  if (path.startsWith('/reporte') || path.startsWith('/admin')) {
    return 'reportes';
  }
  const urlSec = searchParams.get('seccion') || searchParams.get('section') || window.location.hash.replace('#', '');
  if (urlSec && ['perfil', 'favoritos', 'alertas', 'cartera', 'calendario', 'analisis', 'novedades', 'guias', 'reportes', 'informes', 'datos', 'accionariado', 'foros'].includes(urlSec)) {
    return urlSec;
  }
  return 'perfil';
}

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

// Inicializar módulo de análisis
window.AnalysisModule?.init();

const currentInitialSection = resolveInitialSection();
document.querySelectorAll('.nav-link[data-section]').forEach((item) => {
  item.classList.toggle('active', item.dataset.section === currentInitialSection);
});
showSection(currentInitialSection);

const startupParams = new URLSearchParams(window.location.search);
const pendingTicker = (startupParams.get('analizar') ?? '').trim().toUpperCase();
const pendingAccession = startupParams.get('accession') ?? '';
if (pendingTicker && pendingAccession && window.AnalysisModule) {
  setTimeout(() => {
    window.AnalysisModule.runFilingAnalysis(pendingTicker, pendingAccession);
  }, 200);
}

if (!companyTicker) {
  companyLoading.hidden = true;
  companyError.textContent = 'No se ha indicado ninguna empresa. Usa el buscador para elegir una.';
  companyError.hidden = false;
} else {
  loadCompany();
}

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
