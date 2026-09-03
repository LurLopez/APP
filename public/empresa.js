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

let companyTicker = (new URLSearchParams(window.location.search).get('ticker') || decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[1] ?? '')).toUpperCase();
let companyData = null;
let companyAuthenticated = false;
let chartRange = '5y';
let chartPoints = [];
let chartMaPoints = [];
let chartShowMA = false;
let chartScale = null;

let screenerSeries = 'annual';
let screenerStatement = 'valuation';
let screenerPrecision = 2;
let screenerHideEmpty = true;
let screenerYearMin = null;
let screenerYearMax = null;
let screenerFilings = null;
let screenerFilingsLoading = false;

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
  window.location.href = `/empresa/${encodeURIComponent(ticker)}`;
}

/* ── Formato de valores ─────────────────────────────────────── */

function formatProfileNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value));
}

function formatProfilePrice(value) {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? '—' : `${formatProfileNumber(value)} $`;
}

function formatProfileCompactUsd(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const absolute = Math.abs(Number(value));
  const units = absolute >= 1e9 ? [1e9, 'B'] : absolute >= 1e6 ? [1e6, 'M'] : absolute >= 1e3 ? [1e3, 'K'] : [1, ''];
  const formatted = formatProfileNumber(absolute / units[0], units[1] ? 2 : 0);
  return `${Number(value) < 0 ? '−' : ''}${formatted} ${units[1]} $`.replace('  $', ' $');
}

function formatProfileCompactCount(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const absolute = Math.abs(Number(value));
  const units = absolute >= 1e9 ? [1e9, 'B'] : absolute >= 1e6 ? [1e6, 'M'] : absolute >= 1e3 ? [1e3, 'K'] : [1, ''];
  const formatted = formatProfileNumber(absolute / units[0], units[1] ? 2 : 0);
  return `${Number(value) < 0 ? '−' : ''}${formatted} ${units[1]}`.trim();
}

function formatProfilePercent(value, signed = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const number = Number(value);
  const prefix = signed && number > 0 ? '+' : number < 0 ? '−' : '';
  return `${prefix}${formatProfileNumber(Math.abs(number), 2)} %`;
}

function formatMultiple(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const number = Number(value);
  const prefix = number < 0 ? '−' : '';
  return `${prefix}${formatProfileNumber(Math.abs(number), digits)}x`;
}

function formatProfileDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
}

function formatMoneyUsd(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const num = Number(value) / 1e6;
  const formatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: screenerPrecision, maximumFractionDigits: screenerPrecision });
  const formatted = formatter.format(Math.abs(num));
  return num < 0 ? `(${formatted})` : formatted;
}

function formatEps(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const formatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: screenerPrecision, maximumFractionDigits: screenerPrecision });
  return `${formatter.format(Number(value))} $`;
}

function formatShares(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const formatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: screenerPrecision, maximumFractionDigits: screenerPrecision });
  return formatter.format(Number(value) / 1e6);
}

function formatCount(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const formatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: screenerPrecision });
  return formatter.format(Number(value));
}

function formatPercentage(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  const formatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: screenerPrecision === 0 ? 0 : 1, maximumFractionDigits: screenerPrecision === 0 ? 0 : 1 });
  return `${num < 0 ? `(${formatter.format(Math.abs(num))})` : formatter.format(num)} %`;
}

function periodLabel(period) {
  if (!period) return '—';
  if (/^\d{4}$/.test(period)) return `${period} (FY)`;
  const [year, quarter] = period.split('-Q');
  return `Q${quarter} ${year}`;
}

function periodDateLabel(row) {
  if (!row?.periodEnd) return periodLabel(row?.period);
  const date = new Date(`${row.periodEnd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return periodLabel(row.period);
  return `${date.getUTCDate()}/${date.getUTCMonth() + 1}/${String(date.getUTCFullYear()).slice(-2)}`;
}

/* ── Cabecera y cotización ──────────────────────────────────── */

function renderQuoteSparkline(values) {
  const line = document.querySelector('#quote-sparkline-line');
  const area = document.querySelector('#quote-sparkline-area');
  const points = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
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
  comparisonCompanies.clear();
  comparisonLoadingTickers.clear();
  seriesColorMap.clear();
  companyData = data;
  companyAuthenticated = data.authenticated === true;
  const company = data.company ?? {};
  const profile = data.profile ?? {};
  const market = profile.market ?? {};
  const metrics = profile.metrics ?? {};
  const info = profile.info ?? {};

  document.title = `Cifra Terminal | ${company.name ?? companyTicker}`;
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

  const priceEl = document.querySelector('#quote-price');
  const changeEl = document.querySelector('#quote-change');
  priceEl.innerHTML = `<span class="quote-arrow" aria-hidden="true">${isPositive ? '▲' : '▼'}</span> ${hasPrice ? `${formatProfileNumber(price)} $` : '—'}`;
  changeEl.textContent = hasChange ? `${change >= 0 ? '+' : '−'}${formatProfileNumber(Math.abs(change))} $ (${formatProfilePercent(changePercent, true)})` : '—';
  priceEl.classList.toggle('positive', isPositive);
  priceEl.classList.toggle('negative', !isPositive);
  changeEl.classList.toggle('positive', isPositive);
  changeEl.classList.toggle('negative', !isPositive);
  document.querySelector('#quote-updated').textContent = market.marketTime ? `Actualizado ${formatProfileDate(market.marketTime)}` : 'Cotización no disponible';
  const sparkline = document.querySelector('#quote-sparkline');
  sparkline.classList.toggle('negative', !isPositive);
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

/* ── Pestaña Valoración ──────────────────────────────────────── */

function calculateValuationMetrics(data) {
  if (!data) return null;
  const profile = data.profile ?? {};
  const metrics = profile.metrics ?? {};
  const market = profile.market ?? {};
  const annual = data.annual ?? [];
  const quarterly = data.quarterly ?? [];

  const price = Number.isFinite(Number(market.price)) ? Number(market.price) : null;
  const shares = Number.isFinite(Number(metrics.shares)) ? Number(metrics.shares) : null;
  const marketCap = Number.isFinite(Number(metrics.marketCap))
    ? Number(metrics.marketCap)
    : (price !== null && shares !== null ? price * shares : null);

  // Calcular TTM sumando los últimos 4 trimestres reportados (ej. Q2 2026 + Q1 2026 + Q4 2025 + Q3 2025)
  const latestAnnual = annual[0]?.values ?? {};
  const latestQuarter = quarterly[0]?.values ?? {};
  const latestBalance = latestQuarter.totalDebt !== undefined ? latestQuarter : latestAnnual;
  const hasQuarters = quarterly.length >= 4;
  const q4 = hasQuarters ? quarterly.slice(0, 4) : [];

  // EBITDA TTM (suma de los 4 últimos trimestres normalizados o último año cerrado)
  let ebitda = null;
  if (hasQuarters) {
    const sumNorm = q4.reduce((acc, q) => {
      const v = Number(q.values?.ebitdaNormalized ?? q.values?.ebitda ?? (Number(q.values?.operatingIncome) + (Number(q.values?.depreciationAmortizationTotal) || Number(q.values?.depreciation) || 0)));
      return Number.isFinite(v) ? acc + v : acc;
    }, 0);
    const sumRaw = q4.reduce((acc, q) => {
      const v = Number(q.values?.ebitda ?? (Number(q.values?.operatingIncome) + (Number(q.values?.depreciationAmortizationTotal) || Number(q.values?.depreciation) || 0)));
      return Number.isFinite(v) ? acc + v : acc;
    }, 0);
    if (sumNorm > 0) ebitda = sumNorm;
    else if (sumRaw > 0) ebitda = sumRaw;
  }
  if (!ebitda) {
    ebitda = Number.isFinite(Number(latestAnnual.ebitdaNormalized ?? latestAnnual.ebitda)) && Number(latestAnnual.ebitdaNormalized ?? latestAnnual.ebitda) > 0
      ? Number(latestAnnual.ebitdaNormalized ?? latestAnnual.ebitda)
      : (Number.isFinite(Number(metrics.ebitda)) ? Number(metrics.ebitda) : null);
  }

  // Deuda y Caja del último balance disponible
  const totalDebt = Number.isFinite(Number(latestBalance.totalDebt))
    ? Number(latestBalance.totalDebt)
    : (Number.isFinite(Number(latestAnnual.totalDebt)) ? Number(latestAnnual.totalDebt) : (Number.isFinite(Number(metrics.totalDebt)) ? Number(metrics.totalDebt) : null));

  const cash = Number.isFinite(Number(latestBalance.cashAndShortTermInvestments ?? latestBalance.cash))
    ? Number(latestBalance.cashAndShortTermInvestments ?? latestBalance.cash)
    : (Number.isFinite(Number(latestAnnual.cashAndShortTermInvestments ?? latestAnnual.cash))
      ? Number(latestAnnual.cashAndShortTermInvestments ?? latestAnnual.cash)
      : (Number.isFinite(Number(metrics.cash)) ? Number(metrics.cash) : null));

  const netDebt = (totalDebt !== null && cash !== null)
    ? totalDebt - cash
    : (Number.isFinite(Number(latestBalance.netDebt))
      ? Number(latestBalance.netDebt)
      : (Number.isFinite(Number(latestAnnual.netDebt)) ? Number(latestAnnual.netDebt) : (Number.isFinite(Number(metrics.netDebt)) ? Number(metrics.netDebt) : null)));

  const enterpriseValue = (marketCap !== null && netDebt !== null)
    ? marketCap + netDebt
    : (Number.isFinite(Number(metrics.enterpriseValue)) ? Number(metrics.enterpriseValue) : marketCap);

  const evToEbitda = (enterpriseValue !== null && enterpriseValue > 0 && ebitda && ebitda > 0)
    ? enterpriseValue / ebitda
    : (Number.isFinite(Number(metrics.evToEbitda)) && Number(metrics.evToEbitda) > 0 ? Number(metrics.evToEbitda) : null);

  // BPA diluido GAAP / normal TTM (suma de los 4 trimestres)
  let eps = null;
  if (hasQuarters) {
    const epsVals = q4.map((q) => Number(q.values?.epsDiluted));
    if (epsVals.every((v) => Number.isFinite(v))) {
      eps = epsVals.reduce((acc, v) => acc + v, 0);
    }
  }
  if (eps === null) {
    eps = Number.isFinite(Number(latestAnnual.epsDiluted))
      ? Number(latestAnnual.epsDiluted)
      : (Number.isFinite(Number(metrics.eps)) ? Number(metrics.eps) : null);
  }

  // BPA diluido ajustado TTM (sumando amortizaciones de intangibles y goodwill)
  let epsNormalized = null;
  if (hasQuarters) {
    const epsNormVals = q4.map((q) => Number(q.values?.epsDilutedNormalized ?? q.values?.epsDiluted));
    if (epsNormVals.every((v) => Number.isFinite(v))) {
      epsNormalized = epsNormVals.reduce((acc, v) => acc + v, 0);
    }
  }
  if (epsNormalized === null) {
    epsNormalized = Number.isFinite(Number(latestAnnual.epsDilutedNormalized))
      ? Number(latestAnnual.epsDilutedNormalized)
      : (eps !== null ? eps : null);
  }

  const peRatio = (price !== null && eps !== null && eps > 0)
    ? price / eps
    : (Number.isFinite(Number(metrics.peRatio)) && Number(metrics.peRatio) > 0 ? Number(metrics.peRatio) : null);

  const peRatioNormalized = (price !== null && epsNormalized !== null && epsNormalized > 0)
    ? price / epsNormalized
    : null;

  const netDebtToEbitda = (netDebt !== null && ebitda && ebitda > 0)
    ? netDebt / ebitda
    : (Number.isFinite(Number(metrics.netDebtToEbitda)) ? Number(metrics.netDebtToEbitda) : null);

  // Dividendo por acción TTM (suma de los 4 trimestres)
  let dividendPerShare = null;
  if (hasQuarters) {
    const dpsVals = q4.map((q) => {
      let d = Number(q.values?.dividendPerShare);
      if (d > 2.0 && q.values?.dividendsCommon) {
        const sh = Number(q.values?.weightedSharesDiluted || q.values?.sharesOutstanding);
        if (sh > 0) d = Math.abs(Number(q.values.dividendsCommon)) / sh;
      }
      return d;
    });
    if (dpsVals.every((v) => Number.isFinite(v) && v > 0)) {
      dividendPerShare = Math.round(dpsVals.reduce((acc, v) => acc + v, 0) * 100) / 100;
    }
  }
  if (dividendPerShare === null) {
    dividendPerShare = Number.isFinite(Number(latestAnnual.dividendPerShare)) && Number(latestAnnual.dividendPerShare) > 0
      ? Number(latestAnnual.dividendPerShare)
      : (Number.isFinite(Number(metrics.dividendPerShare)) ? Number(metrics.dividendPerShare) : null);
  }

  const dividendYield = (dividendPerShare !== null && price && price > 0)
    ? (dividendPerShare / price) * 100
    : (Number.isFinite(Number(metrics.dividendYield)) ? Number(metrics.dividendYield) : null);

  const payoutRatio = (dividendPerShare !== null && eps !== null && eps > 0)
    ? (dividendPerShare / eps) * 100
    : null;

  const payoutRatioNormalized = (dividendPerShare !== null && epsNormalized !== null && epsNormalized > 0)
    ? (dividendPerShare / epsNormalized) * 100
    : null;

  // Flujo de caja libre (FCF) TTM
  let freeCashFlow = null;
  if (hasQuarters) {
    const fcfVals = q4.map((q) => Number(q.values?.freeCashFlow));
    if (fcfVals.every((v) => Number.isFinite(v))) {
      freeCashFlow = fcfVals.reduce((acc, v) => acc + v, 0);
    }
  }
  if (freeCashFlow === null) {
    freeCashFlow = Number.isFinite(Number(latestAnnual.freeCashFlow))
      ? Number(latestAnnual.freeCashFlow)
      : (Number.isFinite(Number(metrics.freeCashFlow)) ? Number(metrics.freeCashFlow) : null);
  }

  // FCF por acción TTM
  let fcfPerShare = null;
  if (freeCashFlow !== null && shares && shares > 0) {
    fcfPerShare = freeCashFlow / shares;
  } else if (hasQuarters) {
    const fcfpsVals = q4.map((q) => Number(q.values?.cashFlowPerShare));
    if (fcfpsVals.every((v) => Number.isFinite(v))) {
      fcfPerShare = fcfpsVals.reduce((acc, v) => acc + v, 0);
    }
  }
  if (fcfPerShare === null && Number.isFinite(Number(latestAnnual.cashFlowPerShare))) {
    fcfPerShare = Number(latestAnnual.cashFlowPerShare);
  } else if (fcfPerShare === null && Number.isFinite(Number(metrics.cashFlowPerShare))) {
    fcfPerShare = Number(metrics.cashFlowPerShare);
  }

  // P / FCF
  const priceToFcf = (price !== null && fcfPerShare !== null && fcfPerShare > 0)
    ? price / fcfPerShare
    : (marketCap !== null && freeCashFlow !== null && freeCashFlow > 0
      ? marketCap / freeCashFlow
      : (Number.isFinite(Number(metrics.priceToFcf)) && Number(metrics.priceToFcf) > 0 ? Number(metrics.priceToFcf) : null));

  return {
    price,
    shares,
    marketCap,
    totalDebt,
    cash,
    netDebt,
    enterpriseValue,
    ebitda,
    evToEbitda,
    eps,
    epsNormalized,
    peRatio,
    peRatioNormalized,
    freeCashFlow,
    fcfPerShare,
    priceToFcf,
    netDebtToEbitda,
    dividendPerShare,
    dividendYield,
    payoutRatio,
    payoutRatioNormalized,
    currency: data.currency || market.currency || 'USD',
  };
}

let valPeAdjusted = true;

function renderValuation(data) {
  const container = document.querySelector('#val-summary-block');
  if (!container || !data) return;

  const v = calculateValuationMetrics(data);
  if (!v) return;

  // Header meta (si existen)
  const valCurrencyEl = document.querySelector('#val-currency');
  const valPriceEl = document.querySelector('#val-price');
  const valMarketCapEl = document.querySelector('#val-market-cap');
  if (valCurrencyEl) valCurrencyEl.textContent = v.currency;
  if (valPriceEl) valPriceEl.textContent = formatProfilePrice(v.price);
  if (valMarketCapEl) valMarketCapEl.textContent = formatProfileCompactUsd(v.marketCap);

  // Tarjeta 1: EV / EBITDA (si es negativo se muestra como —)
  const evEbitdaEl = document.querySelector('#val-ev-ebitda');
  const evValEl = document.querySelector('#val-ev');
  const ebitdaValEl = document.querySelector('#val-ebitda');
  if (evEbitdaEl) evEbitdaEl.textContent = v.evToEbitda !== null && v.evToEbitda > 0 ? formatMultiple(v.evToEbitda) : '—';
  if (evValEl) evValEl.textContent = formatProfileCompactUsd(v.enterpriseValue);
  if (ebitdaValEl) ebitdaValEl.textContent = formatProfileCompactUsd(v.ebitda);

  // Tarjeta 2: PER (conmutador Ajustado vs Normal)
  const peEl = document.querySelector('#val-pe');
  const pePriceEl = document.querySelector('#val-pe-price');
  const epsEl = document.querySelector('#val-eps');
  const epsLabelEl = document.querySelector('#val-eps-label');
  const peToggleEl = document.querySelector('#val-pe-adjusted-toggle');
  const chartPeToggleEl = document.querySelector('#val-chart-adjusted-checkbox');
  const payoutToggleEl = document.querySelector('#val-payout-adjusted-toggle');

  if (peToggleEl) peToggleEl.checked = valPeAdjusted;
  if (chartPeToggleEl) chartPeToggleEl.checked = valPeAdjusted;
  if (payoutToggleEl) payoutToggleEl.checked = valPeAdjusted;

  const activePe = valPeAdjusted ? v.peRatioNormalized : v.peRatio;
  const activeEps = valPeAdjusted ? v.epsNormalized : v.eps;

  if (peEl) peEl.textContent = activePe !== null && activePe > 0 ? formatMultiple(activePe) : '—';
  if (pePriceEl) pePriceEl.textContent = formatProfilePrice(v.price);
  if (epsEl) epsEl.textContent = activeEps !== null ? formatProfilePrice(activeEps) : '—';
  if (epsLabelEl) epsLabelEl.textContent = valPeAdjusted ? 'BPA ajustado' : 'BPA normal';

  // Tarjeta 3: Deuda Neta / EBITDA
  const ndEbitdaEl = document.querySelector('#val-netdebt-ebitda');
  const ndValEl = document.querySelector('#val-netdebt');
  const ebitdaNdEl = document.querySelector('#val-ebitda-nd');
  if (ndEbitdaEl) {
    if (v.netDebtToEbitda !== null && v.netDebtToEbitda !== undefined) {
      if (v.netDebt < 0) {
        ndEbitdaEl.innerHTML = `${formatMultiple(v.netDebtToEbitda)} <small style="font-size:12px;color:#16a34a;font-weight:700;font-family:Arial,sans-serif;">(Caja neta)</small>`;
      } else {
        ndEbitdaEl.textContent = formatMultiple(v.netDebtToEbitda);
      }
    } else {
      ndEbitdaEl.textContent = '—';
    }
  }
  if (ndValEl) ndValEl.textContent = formatProfileCompactUsd(v.netDebt);
  if (ebitdaNdEl) ebitdaNdEl.textContent = formatProfileCompactUsd(v.ebitda);

  // Tarjeta 4: Yield del dividendo
  const yieldEl = document.querySelector('#val-dividend-yield');
  const dpsEl = document.querySelector('#val-dps');
  const yieldPriceEl = document.querySelector('#val-yield-price');
  if (yieldEl) yieldEl.textContent = formatProfilePercent(v.dividendYield);
  if (dpsEl) dpsEl.textContent = formatProfilePrice(v.dividendPerShare);
  if (yieldPriceEl) yieldPriceEl.textContent = formatProfilePrice(v.price);

  // Tarjeta 5: Payout del dividendo (conmutador Ajustado vs Normal)
  const payoutEl = document.querySelector('#val-payout-ratio');
  const payoutDpsEl = document.querySelector('#val-payout-dps');
  const payoutEpsEl = document.querySelector('#val-payout-eps');
  const payoutEpsLabelEl = document.querySelector('#val-payout-eps-label');

  const activePayout = valPeAdjusted ? v.payoutRatioNormalized : v.payoutRatio;

  if (payoutEl) payoutEl.textContent = activePayout !== null && activePayout >= 0 ? formatProfilePercent(activePayout) : '—';
  if (payoutDpsEl) payoutDpsEl.textContent = formatProfilePrice(v.dividendPerShare);
  if (payoutEpsEl) payoutEpsEl.textContent = activeEps !== null ? formatProfilePrice(activeEps) : '—';
  if (payoutEpsLabelEl) payoutEpsLabelEl.textContent = valPeAdjusted ? 'BPA ajustado' : 'BPA normal';

  // Tarjeta 6: P / FCF
  const pfcfEl = document.querySelector('#val-pfcf');
  const pfcfPriceEl = document.querySelector('#val-pfcf-price');
  const fcfShareEl = document.querySelector('#val-fcf-share');

  if (pfcfEl) pfcfEl.textContent = v.priceToFcf !== null && v.priceToFcf > 0 ? formatMultiple(v.priceToFcf) : '—';
  if (pfcfPriceEl) pfcfPriceEl.textContent = formatProfilePrice(v.price);
  if (fcfShareEl) fcfShareEl.textContent = v.fcfPerShare !== null ? formatProfilePrice(v.fcfPerShare) : '—';
}

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
    const color = isNegative ? '#16a34a' : (isTtm ? '#ea580c' : 'var(--orange)');
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
      sparkEl.innerHTML = `<path d="${d}" fill="none" stroke="rgba(249, 115, 22, 0.65)" stroke-width="1.4"/>`;
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
    pathsHtml += `<path d="${linePath}" fill="none" stroke="var(--orange)" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round"/>`;
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
        <stop offset="0%" stop-color="var(--orange)" stop-opacity="0.28"/>
        <stop offset="95%" stop-color="var(--orange)" stop-opacity="0.01"/>
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
    <g class="pf-chart-hover-layer" hidden>
      <line class="pf-chart-crosshair pf-chart-crosshair-v" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}"/>
      <line class="pf-chart-crosshair pf-chart-crosshair-h" x1="${pad.left}" y1="0" x2="${width - pad.right}" y2="0"/>
      <circle class="pf-chart-hover-dot" cx="0" cy="0" r="4.5" fill="#ffffff" stroke="var(--orange)" stroke-width="2.4"/>
      <g class="pf-chart-x-badge" transform="translate(0, ${height - pad.bottom})">
        <rect class="pf-chart-x-badge-bg" x="-42" y="2" width="84" height="20" rx="4" ry="4"/>
        <text class="pf-chart-x-badge-text" x="0" y="16" text-anchor="middle">--</text>
      </g>
    </g>
    <rect class="pf-chart-overlay" x="${pad.left}" y="${pad.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent" cursor="crosshair"/>
  `;

  valChartState = { isBarChart: false, points, metricKey, effectiveKey, allowNegative, allowZero, x, y, pad, height, width, scale: { min, max } };
  updateValTimelineSliderUi();
}

function updateValuationChartHover(event) {
  if (isValMeasuring) return;
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
  if (!svg || !hoverLayer || !crosshairV || !crosshairH || !hoverDot) return;

  const rect = svg.getBoundingClientRect();
  const { points, metricKey, effectiveKey, allowNegative, allowZero, x, y, pad, height, width } = valChartState;
  const keyToUse = effectiveKey || metricKey;

  const cursorSvgX = ((event.clientX - rect.left) / rect.width) * width;
  const cursorSvgY = ((event.clientY - rect.top) / rect.height) * height;
  if (cursorSvgX < pad.left || cursorSvgX > width - pad.right || cursorSvgY < pad.top || cursorSvgY > height - pad.bottom) {
    hoverLayer.hidden = true;
    hideValuationChartTooltip();
    return;
  }

  const innerWidth = width - pad.left - pad.right;
  const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));
  const best = Math.round(ratio * (points.length - 1));
  const point = points[best];
  const value = Number(point?.[keyToUse]);
  if (!Number.isFinite(value) || (!allowZero && value <= 0)) {
    hoverLayer.hidden = true;
    hideValuationChartTooltip();
    return;
  }

  const cx = x(best);
  const cy = y(value);

  hoverLayer.hidden = false;
  hoverLayer.style.display = 'inline';
  crosshairV.setAttribute('x1', cx.toFixed(1));
  crosshairV.setAttribute('x2', cx.toFixed(1));
  crosshairH.setAttribute('y1', cursorSvgY.toFixed(1));
  crosshairH.setAttribute('y2', cursorSvgY.toFixed(1));
  hoverDot.setAttribute('cx', cx.toFixed(1));
  hoverDot.setAttribute('cy', cy.toFixed(1));

  if (hoverXBadge && hoverXBadgeText) {
    hoverXBadge.setAttribute('transform', `translate(${cx.toFixed(1)}, ${height - pad.bottom})`);
    hoverXBadgeText.textContent = formatTradingViewHoverDate(point.date);
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
}

function hideValuationChartTooltip() {
  if (isValMeasuring) return;
  hideChartTooltip();
  const hover = document.querySelector('#val-chart .pf-chart-hover-layer');
  if (hover) hover.hidden = true;
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

    if (isRightClick || isShiftLeftClick || isToolActiveClick) {
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
        hoverLayer.hidden = true;
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
        if (hoverLayer) hoverLayer.hidden = true;
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
let measureStartButton = 2;
let measureStartSvgX = 0;
let measureStartSvgY = 0;
let measureCurrentSvgX = 0;
let measureCurrentSvgY = 0;
let isPanning = false;
let panMoved = false;
let panStartX = 0;
let panInitStart = 0;
let panInitEnd = 0;

const SPANISH_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatTradingViewHoverDate(isoDate) {
  if (!isoDate) return '';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  const year = parts[0];
  const mIdx = parseInt(parts[1], 10) - 1;
  const day = parts[2];
  const m = SPANISH_MONTHS[mIdx] || parts[1];
  return `${day} ${m} ${year}`;
}

function computeNiceStep(val) {
  if (!Number.isFinite(val) || val <= 0) return 1;
  const exponent = Math.floor(Math.log10(val));
  const fraction = val / Math.pow(10, exponent);
  let niceFraction;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 2.5) niceFraction = 2.5;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * Math.pow(10, exponent);
}

function formatCurrencySymbol(curr) {
  if (curr === 'EUR') return '€';
  if (curr === 'GBP') return '£';
  if (curr === 'JPY') return '¥';
  return '$';
}

function formatPriceValue(val, curr = chartCurrency) {
  if (!Number.isFinite(Number(val))) return '—';
  const sym = formatCurrencySymbol(curr);
  const num = Number(val);
  const decimals = Math.abs(num) < 10 ? 2 : (Math.abs(num) < 1000 ? 2 : 1);
  return `${sym}${num.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatSignedPriceValue(val, curr = chartCurrency) {
  if (!Number.isFinite(Number(val))) return '—';
  const sym = formatCurrencySymbol(curr);
  const num = Number(val);
  const prefix = num > 0 ? '+' : (num < 0 ? '-' : '');
  const absNum = Math.abs(num);
  const decimals = absNum < 10 ? 2 : (absNum < 1000 ? 2 : 1);
  return `${prefix}${sym}${absNum.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatSignedPct(val) {
  if (!Number.isFinite(Number(val))) return '—';
  const num = Number(val);
  const prefix = num > 0 ? '+' : (num < 0 ? '-' : '');
  return `${prefix}${Math.abs(num).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

function computePriceScale(values) {
  if (!values || !values.length) {
    return { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], step: 25 };
  }
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(0.01, rawMax - rawMin);

  const targetStep = spread / 4;
  const step = computeNiceStep(targetStep);

  const min = Math.max(0, Math.floor((rawMin - step * 0.25) / step) * step);
  let max = Math.ceil((rawMax + step * 0.25) / step) * step;
  if (max <= min) max = min + step * 2;

  const ticks = [];
  for (let val = min; val <= max + step * 0.001; val += step) {
    ticks.push(val);
  }
  return { min, max, ticks, step };
}

function getCompanyChartGeometry(block) {
  const isFs = block?.classList.contains('is-fullscreen') || document.fullscreenElement === block;
  const canvasInner = block?.querySelector('.company-chart-canvas-inner, [data-val-canvas-inner], [data-chart-canvas-inner], .val-chart-body, .chart-body');
  const svgEl = block?.querySelector('svg.pf-chart-svg, #val-chart, #price-chart');

  let clientW = 0;
  let clientH = 0;
  if (svgEl) {
    const rect = svgEl.getBoundingClientRect();
    clientW = Math.round(rect.width);
    clientH = Math.round(rect.height);
  }
  if (!clientW && canvasInner) {
    const rect = canvasInner.getBoundingClientRect();
    clientW = Math.round(rect.width);
    clientH = Math.round(rect.height);
  }
  if (!clientW && block) {
    const rect = block.getBoundingClientRect();
    clientW = Math.round(rect.width);
  }

  const defaultW = isFs ? 1200 : 960;
  const defaultH = isFs ? 540 : 380;

  const width = clientW > 200 ? clientW : defaultW;
  const height = clientH > 150 ? clientH : defaultH;

  const pad = isFs
    ? { left: 18, right: 74, top: 22, bottom: 32 }
    : { left: 16, right: 70, top: 18, bottom: 28 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  return { isFs, width, height, pad, innerWidth, innerHeight };
}

function getTradingViewDateTicks(points, x, pad, width) {
  if (!points || points.length === 0) return [];
  if (points.length === 1) {
    return [{ x: x(0), label: formatTradingViewHoverDate(points[0].date), isMajor: true }];
  }

  const firstDate = new Date(`${points[0].date}T00:00:00Z`);
  const lastDate = new Date(`${points[points.length - 1].date}T00:00:00Z`);
  const totalDays = Math.max(1, Math.round((lastDate - firstDate) / (1000 * 60 * 60 * 24)));

  const isMultiYear = totalDays > 450;
  const isMultiMonth = totalDays > 60 && totalDays <= 450;
  const isShortRange = totalDays <= 60;

  const candidates = [];
  let prevMonth = -1;
  let prevYear = -1;

  points.forEach((pt, idx) => {
    const d = new Date(`${pt.date}T00:00:00Z`);
    const m = d.getUTCMonth();
    const y = d.getUTCFullYear();
    const isYearChange = prevYear !== -1 && y !== prevYear;
    const isMonthChange = prevMonth !== -1 && m !== prevMonth;

    if (idx === 0) {
      candidates.push({ idx, x: x(idx), label: String(y), isMajor: true });
    } else if (isMultiYear && isYearChange) {
      candidates.push({ idx, x: x(idx), label: String(y), isMajor: true });
    } else if (isMultiMonth && (isMonthChange || isYearChange)) {
      const lbl = isYearChange ? String(y) : SPANISH_MONTHS[m];
      candidates.push({ idx, x: x(idx), label: lbl, isMajor: isYearChange });
    } else if (isShortRange && isMonthChange) {
      candidates.push({ idx, x: x(idx), label: SPANISH_MONTHS[m], isMajor: true });
    }
    prevMonth = m;
    prevYear = y;
  });

  const minGap = width > 700 ? 68 : 52;
  const filtered = [];
  let lastPlacedX = -Infinity;

  const majors = candidates.filter((c) => c.isMajor);
  const pool = (majors.length >= 3 || isMultiYear) ? candidates : points.map((pt, idx) => {
    const d = new Date(`${pt.date}T00:00:00Z`);
    return { idx, x: x(idx), label: `${d.getUTCDate()} ${SPANISH_MONTHS[d.getUTCMonth()]}`, isMajor: false };
  });

  const step = Math.max(1, Math.floor(pool.length / (width > 700 ? 8 : 5)));
  for (let i = 0; i < pool.length; i += step) {
    const item = pool[i];
    if (item.x >= pad.left + 16 && item.x <= width - pad.right - 16 && item.x - lastPlacedX >= minGap) {
      filtered.push(item);
      lastPlacedX = item.x;
    }
  }
  return filtered;
}

function ensureChartTooltip() {
  let tip = document.querySelector('#chart-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'chart-tooltip';
    tip.className = 'chart-tooltip';
    document.body.appendChild(tip);
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
    const response = await fetch(`/api/screener/company/${encodeURIComponent(companyTicker)}/chart?range=${encodeURIComponent(range)}&ma=1`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.points) || !data.points.length) {
      if (chartMessage) {
        chartMessage.textContent = data.error || 'No se pudo cargar el gráfico de cotización.';
        chartMessage.hidden = false;
      }
      chartPoints = [];
      chartMaPoints = [];
      renderPriceChart();
      return;
    }
    chartCurrency = data.currency || 'USD';
    chartPoints = data.points.map((pt) => ({
      t: pt.t,
      v: pt.v,
      date: new Date(pt.t * 1000).toISOString().split('T')[0],
    }));
    chartMaPoints = Array.isArray(data.maPoints) ? data.maPoints.map((pt) => ({
      t: pt.t,
      v: pt.v,
      date: new Date(pt.t * 1000).toISOString().split('T')[0],
    })) : [];

    chartSliceStart = 0;
    chartSliceEnd = chartPoints.length - 1;

    const sparkEl = document.querySelector('#chart-timeline-sparkline');
    if (sparkEl) sparkEl.innerHTML = '';

    renderPriceChart();
  } catch {
    if (chartMessage) {
      chartMessage.textContent = 'No se pudo conectar con el servidor para cargar el gráfico.';
      chartMessage.hidden = false;
    }
    chartPoints = [];
    chartMaPoints = [];
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
  if (chartShowMA && chartMaPoints.length) {
    const minT = points[0].t;
    const maxT = points[points.length - 1].t;
    chartMaPoints.forEach((m) => {
      if (m.t >= minT && m.t <= maxT && Number.isFinite(m.v)) values.push(m.v);
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

  // Build MA path
  let maPath = '';
  if (chartShowMA && chartMaPoints.length) {
    const minT = points[0].t;
    const maxT = points[points.length - 1].t;
    const tSpread = Math.max(1, maxT - minT);
    let inSeg = false;
    chartMaPoints.forEach((m) => {
      if (m.t >= minT && m.t <= maxT && Number.isFinite(m.v)) {
        const ratio = (m.t - minT) / tSpread;
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
        <stop offset="0%" stop-color="#f97316" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#f97316" stop-opacity="0.00"/>
      </linearGradient>
    </defs>
    ${gridLines}
    ${vGridLines}
    ${axisBaselines}
    <path d="${areaPath}" class="chart-area"/>
    <path d="${linePath}" class="chart-line" stroke-width="${strokeW}"/>
    ${maPath ? `<path d="${maPath}" class="chart-ma"/>` : ''}
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
    <g class="pf-chart-hover-layer" hidden>
      <line class="pf-chart-crosshair pf-chart-crosshair-v" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}"/>
      <line class="pf-chart-crosshair pf-chart-crosshair-h" x1="${pad.left}" y1="0" x2="${width - pad.right}" y2="0"/>
      <circle class="pf-chart-hover-dot" cx="0" cy="0" r="4.5" fill="#ffffff" stroke="#f97316" stroke-width="2.4"/>
      <g class="pf-chart-x-badge" transform="translate(0, ${height - pad.bottom})">
        <rect class="pf-chart-x-badge-bg" x="-42" y="2" width="84" height="20" rx="4" ry="4"/>
        <text class="pf-chart-x-badge-text" x="0" y="16" text-anchor="middle">--</text>
      </g>
    </g>
    <rect class="pf-chart-overlay" x="${pad.left}" y="${pad.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent" cursor="crosshair"/>
  `;

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
  if (event && event.button !== undefined && event.button !== measureStartButton && event.button !== 0 && event.button !== 2 && event.buttons !== 0) return;
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

    const isRightClick = event.button === 2;
    const isShiftLeftClick = event.button === 0 && event.shiftKey;
    const isToolActiveClick = event.button === 0 && isMeasureToolActive;

    if (isRightClick || isShiftLeftClick || isToolActiveClick) {
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
        hoverLayer.hidden = true;
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
        if (hoverLayer) hoverLayer.hidden = true;
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
    if (isMeasuring) return;
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
    if (!svgEl || !hoverLayer || !crosshairV || !crosshairH || !hoverDot) return;

    const rect = svgEl.getBoundingClientRect();
    const { width, height, pad, innerWidth, innerHeight } = getCompanyChartGeometry(chartBlock);

    const cursorSvgX = ((event.clientX - rect.left) / rect.width) * width;
    const cursorSvgY = ((event.clientY - rect.top) / rect.height) * height;
    if (cursorSvgX < pad.left || cursorSvgX > width - pad.right || cursorSvgY < pad.top || cursorSvgY > height - pad.bottom) {
      hoverLayer.hidden = true;
      hideChartTooltip();
      return;
    }

    const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));
    const index = Math.round(ratio * (points.length - 1));
    const point = points[index];
    if (!point) return;

    const values = points.map((p) => p.v).filter(Number.isFinite);
    const { min, max } = computePriceScale(values);

    const x = (idx) => pad.left + (idx / Math.max(1, points.length - 1)) * innerWidth;
    const y = (val) => pad.top + (1 - (val - min) / (max - min)) * innerHeight;

    const px = x(index);
    const py = y(point.v);

    hoverLayer.hidden = false;
    hoverLayer.style.display = 'inline';
    crosshairV.setAttribute('x1', px.toFixed(1));
    crosshairV.setAttribute('x2', px.toFixed(1));
    crosshairH.setAttribute('y1', cursorSvgY.toFixed(1));
    crosshairH.setAttribute('y2', cursorSvgY.toFixed(1));
    hoverDot.setAttribute('cx', px.toFixed(1));
    hoverDot.setAttribute('cy', py.toFixed(1));

    if (hoverXBadge && hoverXBadgeText) {
      hoverXBadge.setAttribute('transform', `translate(${px.toFixed(1)}, ${height - pad.bottom})`);
      hoverXBadgeText.textContent = formatTradingViewHoverDate(point.date);
    }

    // Matching MA point if enabled
    let maHtml = '';
    if (chartShowMA && chartMaPoints.length) {
      const matchedMa = chartMaPoints.find((m) => Math.abs(m.t - point.t) < 86400);
      if (matchedMa && Number.isFinite(matchedMa.v)) {
        maHtml = `
          <div class="pf-chart-tooltip-row" style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.1);">
            <span class="pf-chart-tooltip-dot" style="background:#3b82f6;"></span>
            <span class="pf-chart-tooltip-label" style="color:#93c5fd;">MA 100:</span>
            <strong class="pf-chart-tooltip-val" style="margin-left:auto; color:#ffffff;">${escapeHtml(formatPriceValue(matchedMa.v))}</strong>
          </div>`;
      }
    }

    const prevPoint = index > 0 ? points[index - 1] : null;
    let changeHtml = '';
    if (prevPoint && Number.isFinite(prevPoint.v)) {
      const diff = point.v - prevPoint.v;
      const diffPct = (diff / prevPoint.v) * 100;
      const chgClass = diff > 0 ? 'positive' : (diff < 0 ? 'negative' : '');
      changeHtml = `<span style="font-size:11px; margin-left:6px;" class="${chgClass}">(${formatSignedPct(diffPct)})</span>`;
    }

    const tip = ensureChartTooltip();
    tip.innerHTML = `
      <div class="pf-chart-tooltip-head" style="margin-bottom: 4px;">
        <span class="pf-chart-tooltip-title">${escapeHtml(companyTicker)} · Cotización</span>
        <span class="pf-chart-tooltip-date" style="display:block; color:#94a3b8; font-size:10px;">${escapeHtml(formatTradingViewHoverDate(point.date))}</span>
      </div>
      <div style="font-size: 14px; font-weight: 700; color: #ffffff; display: flex; align-items: baseline;">
        ${escapeHtml(formatPriceValue(point.v))}
        ${changeHtml}
      </div>
      ${maHtml}
    `;
    tip.hidden = false;
    positionChartTooltip(tip, event.clientX, event.clientY);
  });

  canvasInner.addEventListener('mouseleave', () => {
    if (isMeasuring) return;
    const hoverLayer = document.querySelector('#price-chart .pf-chart-hover-layer');
    if (hoverLayer) hoverLayer.hidden = true;
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

  // MA Toggle
  const maBtn = document.querySelector('#chart-ma-toggle');
  if (maBtn) {
    maBtn.addEventListener('click', () => {
      chartShowMA = !chartShowMA;
      maBtn.classList.toggle('active', chartShowMA);
      maBtn.setAttribute('aria-pressed', String(chartShowMA));
      renderPriceChart();
    });
  }

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
    if (isVal) renderValuationChart();
    else renderPriceChart();
  };
  if (document.fullscreenElement === element || element.classList.contains('is-fullscreen')) {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } else {
      element.classList.remove('is-fullscreen');
      rerender();
    }
    return;
  }
  if (element.requestFullscreen) {
    element.requestFullscreen().catch(() => {
      element.classList.toggle('is-fullscreen');
      rerender();
    });
  } else {
    element.classList.toggle('is-fullscreen');
    rerender();
  }
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
  renderPriceChart();
  renderValuationChart();
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

function getRowPrice(row, rowIndex, rows, compData = companyData) {
  if (!row) return null;
  const isBase = !compData || compData.company?.ticker === companyTicker;
  if (isBase && chartPoints && chartPoints.length && row.periodEnd) {
    const targetMs = Date.parse(`${row.periodEnd}T23:59:59Z`);
    if (Number.isFinite(targetMs)) {
      let best = null;
      let minDiff = Infinity;
      for (const pt of chartPoints) {
        const ptMs = pt.t * 1000;
        const diff = Math.abs(ptMs - targetMs);
        if (diff < minDiff && diff <= 45 * 24 * 60 * 60 * 1000) {
          minDiff = diff;
          best = pt.v;
        }
      }
      if (best !== null && best > 0) return best;
    }
  }
  const prof = compData?.profile ?? companyData?.profile;
  const isLatest = rowIndex === 0 || rowIndex === (rows ? rows.length - 1 : 0);
  if (isLatest && prof?.market?.price) {
    return Number(prof.market.price);
  }
  return null;
}

function getRowMarketCap(row, rowIndex, rows, compData = companyData) {
  const price = getRowPrice(row, rowIndex, rows, compData);
  const prof = compData?.profile ?? companyData?.profile;
  const shares = row?.values?.weightedSharesDiluted || row?.values?.sharesOutstanding || prof?.metrics?.shares;
  if (price && shares && shares > 0) {
    return price * shares;
  }
  const isLatest = rowIndex === 0 || rowIndex === (rows ? rows.length - 1 : 0);
  if (isLatest && prof?.metrics?.marketCap) {
    return Number(prof.metrics.marketCap);
  }
  return null;
}

function derivedScreenerValue(item, row, rowIndex, rows, compData = companyData) {
  if (!item || !row) return null;

  if (item.key === 'evToEbitda') {
    const ebitda = row.values?.ebitdaNormalized ?? row.values?.ebitda ?? (Number.isFinite(Number(row.values?.operatingIncome)) ? Number(row.values.operatingIncome) + (Number(row.values?.depreciationAmortizationTotal) || Number(row.values?.depreciation) || 0) : null);
    const ev = derivedScreenerValue({ key: 'enterpriseValue' }, row, rowIndex, rows, compData);
    return ev !== null && ev > 0 && ebitda !== null && ebitda > 0 ? ev / ebitda : null;
  }
  if (item.key === 'peRatio') {
    const price = getRowPrice(row, rowIndex, rows, compData);
    const eps = Number(row.values?.epsDilutedNormalized ?? row.values?.epsDiluted);
    return price !== null && price > 0 && Number.isFinite(eps) && eps > 0 ? price / eps : null;
  }
  if (item.key === 'netDebtToEbitda') {
    const ebitda = row.values?.ebitdaNormalized ?? row.values?.ebitda ?? (Number.isFinite(Number(row.values?.operatingIncome)) ? Number(row.values.operatingIncome) + (Number(row.values?.depreciationAmortizationTotal) || Number(row.values?.depreciation) || 0) : null);
    const netDebt = row.values?.netDebt !== undefined ? row.values.netDebt : (Number.isFinite(Number(row.values?.totalDebt)) ? Number(row.values.totalDebt) - (Number(row.values?.cashAndShortTermInvestments ?? row.values?.cash) || 0) : null);
    return netDebt !== null && ebitda !== null && ebitda > 0 ? netDebt / ebitda : null;
  }
  if (item.key === 'dividendYield') {
    const price = getRowPrice(row, rowIndex, rows, compData);
    const dps = Number(row.values?.dividendPerShare);
    return price !== null && price > 0 && Number.isFinite(dps) && dps > 0 ? (dps / price) * 100 : null;
  }
  if (item.key === 'marketCap') {
    return getRowMarketCap(row, rowIndex, rows, compData);
  }
  if (item.key === 'enterpriseValue') {
    const mcap = getRowMarketCap(row, rowIndex, rows, compData);
    const netDebt = row.values?.netDebt !== undefined ? row.values.netDebt : (Number.isFinite(Number(row.values?.totalDebt)) ? Number(row.values.totalDebt) - (Number(row.values?.cashAndShortTermInvestments ?? row.values?.cash) || 0) : 0);
    return mcap !== null ? mcap + (netDebt || 0) : null;
  }
  if (item.key === 'priceToFcf' || item.key === 'pToFcf') {
    const price = getRowPrice(row, rowIndex, rows, compData);
    const fcfps = Number(row.values?.cashFlowPerShare);
    if (price !== null && price > 0 && Number.isFinite(fcfps) && fcfps > 0) {
      return price / fcfps;
    }
    const mcap = getRowMarketCap(row, rowIndex, rows, compData);
    const fcf = Number(row.values?.freeCashFlow);
    return mcap !== null && mcap > 0 && Number.isFinite(fcf) && fcf > 0 ? mcap / fcf : null;
  }
  if (item.key === 'customValuation1' || item.key === 'customValuation2') {
    return null;
  }

  if (item.key === 'grossProfitMargin') {
    const rev = Number(row.values?.revenue);
    const gp = Number(row.values?.grossProfit);
    return rev && Number.isFinite(gp) ? (gp / rev) * 100 : null;
  }
  if (item.key === 'operatingIncomeMargin') {
    const rev = Number(row.values?.revenue);
    const op = Number(row.values?.operatingIncome);
    return rev && Number.isFinite(op) ? (op / rev) * 100 : null;
  }
  if (item.key === 'operatingIncomeAdjusted') {
    if (row.values?.operatingIncomeAdjusted !== undefined) return row.values.operatingIncomeAdjusted;
    const pretax = Number(row.values?.pretaxIncome);
    const ie = Math.abs(Number(row.values?.interestExpense) || 0);
    const ii = Math.abs(Number(row.values?.interestIncome) || 0);
    return Number.isFinite(pretax) ? pretax + (ie - ii) : row.values?.operatingIncome;
  }
  if (item.key === 'operatingIncomeAdjustedMargin') {
    const rev = Number(row.values?.revenue);
    if (!rev) return null;
    let adj = Number(row.values?.operatingIncomeAdjusted);
    if (!Number.isFinite(adj)) {
      const pretax = Number(row.values?.pretaxIncome);
      const ie = Math.abs(Number(row.values?.interestExpense) || 0);
      const ii = Math.abs(Number(row.values?.interestIncome) || 0);
      if (Number.isFinite(pretax)) {
        adj = pretax + (ie - ii);
      } else {
        const op = Number(row.values?.operatingIncome);
        adj = Number.isFinite(op) ? op : null;
      }
    }
    return Number.isFinite(adj) ? (adj / rev) * 100 : null;
  }
  if (item.key === 'netIncomeMargin') {
    const rev = Number(row.values?.revenue);
    const net = Number(row.values?.netIncomeToCommonIncludingUnusual ?? row.values?.netIncome);
    return rev && Number.isFinite(net) ? (net / rev) * 100 : null;
  }
  if (item.key === 'netIncomeAdjustedMargin') {
    const rev = Number(row.values?.revenue);
    const net = Number(row.values?.netIncomeToCommonExcludingUnusual ?? row.values?.netIncomeNormalized ?? row.values?.netIncome);
    return rev && Number.isFinite(net) ? (net / rev) * 100 : null;
  }
  if (item.key === 'ebitdaMargin') {
    const rev = Number(row.values?.revenue);
    const ebitda = Number(row.values?.ebitdaNormalized ?? row.values?.ebitda ?? (Number.isFinite(Number(row.values?.operatingIncome)) ? Number(row.values.operatingIncome) + (Number(row.values?.depreciationAmortizationTotal) || Number(row.values?.depreciation) || 0) : null));
    return rev && Number.isFinite(ebitda) ? (ebitda / rev) * 100 : null;
  }
  if (item.key === 'fcfMargin' || item.key === 'freeCashFlowMargin') {
    const rev = Number(row.values?.revenue);
    const fcf = Number(row.values?.freeCashFlow);
    return rev && Number.isFinite(fcf) ? (fcf / rev) * 100 : null;
  }

  if (item.kind !== 'change' && item.kind !== 'margin' && item.kind !== 'ratio') return row.values?.[item.key];
  if (item.kind === 'ratio') {
    const numerator = Number(row.values?.[item.numeratorKey]);
    const denominator = Number(row.values?.[item.denominatorKey]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
    return ((item.absoluteNumerator ? Math.abs(numerator) : numerator) / denominator) * 100;
  }
  const value = item.baseKey === 'ebitda'
    ? (row.values?.ebitdaNormalized ?? row.values?.ebitda)
    : (row.values?.[item.baseKey] ?? (item.baseKey === 'netIncomeToCommonIncludingUnusual' ? row.values?.netIncome : undefined));
  if (item.kind === 'margin') {
    const revenue = row.values?.revenue;
    return revenue && Number.isFinite(Number(value)) ? (Number(value) / Number(revenue)) * 100 : null;
  }
  const previousIndex = screenerSeries === 'quarterly' ? rowIndex - 4 : rowIndex - 1;
  const previous = rows[previousIndex]?.values?.[item.baseKey];
  return previous ? ((Number(value) / Number(previous)) - 1) * 100 : null;
}

function formatScreenerValue(value, format, kind) {
  if (kind === 'change' || kind === 'margin' || kind === 'ratio' || format === 'percent') return formatPercentage(value);
  if (format === 'multiple') {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return formatMultiple(value, screenerPrecision);
  }
  if (format === 'perShare') return formatEps(value);
  if (format === 'shares') return formatShares(value);
  if (format === 'count') return formatCount(value);
  return formatMoneyUsd(value);
}

function isLockedPeriod(rowIndex, rows) {
  if (companyAuthenticated) return false;
  return rowIndex < Math.max(0, rows.length - 4);
}

function renderProCell() {
  return '<span class="pro-pill"><i aria-hidden="true"></i>PRO</span>';
}

function shouldRenderScreenerValueRed(value, item) {
  if (value === null || value === undefined || value === '') return false;
  const number = Number(value);
  if (!Number.isFinite(number)) return false;
  if (number > 0) return false;
  return item.tone === 'negative' || number < 0;
}

function rowYear(row) {
  const match = String(row?.period ?? '').match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function screenerVisibleIndexes(rows) {
  const years = rows.map(rowYear).filter((year) => year !== null);
  if (!years.length) return rows.map((_, index) => index);
  const low = Math.min(...years);
  const high = Math.max(...years);
  const defaultMin = Math.max(low, high - 9);
  const min = screenerYearMin ?? defaultMin;
  const max = screenerYearMax ?? high;
  return rows
    .map((row, index) => {
      const year = rowYear(row);
      return year !== null && year >= min && year <= max ? index : null;
    })
    .filter((index) => index !== null);
}

function renderStatementTable(rows, visibleIndexes, items) {
  const table = document.querySelector('#screener-statement-table');
  const title = document.querySelector('#screener-table-title').textContent;
  const colspan = visibleIndexes.length + 1;
  table.querySelector('thead').innerHTML = `<tr><th class="sticky-col">${escapeHtml(title)}</th>${visibleIndexes.map((rowIndex) => `<th>${periodDateLabel(rows[rowIndex])}</th>`).join('')}</tr>`;
  table.querySelector('tbody').innerHTML = items.map((item, index) => {
    if (item.kind === 'section') return `<tr class="section-row"><td class="sticky-col" colspan="${colspan}">${escapeHtml(item.label)}</td></tr>`;
    if (item.kind === 'note') return `<tr class="note-row"><td class="sticky-col" colspan="${colspan}">${escapeHtml(item.label)}</td></tr>`;
    const itemKey = item.key
      || (item.kind === 'margin' ? `${item.baseKey}Margin` : null)
      || (item.kind === 'change' ? `${item.baseKey}Growth` : null)
      || (item.kind === 'ratio' ? `${item.numeratorKey}Ratio` : null)
      || `statement_row_${index}`;
    item.key = itemKey;
    const cells = visibleIndexes.map((rowIndex) => {
      const row = rows[rowIndex];
      if (isLockedPeriod(rowIndex, rows)) return `<td>${renderProCell()}</td>`;
      const value = derivedScreenerValue(item, row, rowIndex, rows);
      const className = shouldRenderScreenerValueRed(value, item) ? ' class="negative"' : '';
      return `<td${className}>${formatScreenerValue(value, item.format, item.kind)}</td>`;
    });
    const rowClass = [
      item.emphasis ? 'emphasis-row' : '',
      item.kind === 'change' || item.kind === 'margin' || item.kind === 'ratio' || item.italic ? 'derived-row' : '',
      chartMetrics.has(itemKey) ? 'chart-selected' : '',
    ].filter(Boolean).join(' ');
    const dot = chartMetrics.has(itemKey) ? `<span class="metric-chart-dot" style="background:${chartMetrics.get(itemKey).color}"></span>` : '';
    return `<tr${rowClass ? ` class="${rowClass}"` : ''} data-metric="${escapeHtml(item.label)}" data-chart-key="${escapeHtml(itemKey)}"><td class="sticky-col">${dot}${escapeHtml(item.label)}</td>${cells.join('')}</tr>`;
  }).join('');
  table.querySelectorAll('tbody tr[data-chart-key]').forEach((row) => {
    const item = items.find((candidate) => candidate.key === row.dataset.chartKey);
    row.addEventListener('click', () => toggleChartMetric(item));
  });
  syncMarginSelector();
}

function itemHasVisibleValues(item, rows, visibleIndexes) {
  return visibleIndexes.some((rowIndex) => {
    const row = rows[rowIndex];
    const value = derivedScreenerValue(item, row, rowIndex, rows);
    if (value === null || value === undefined || value === '') return false;
    const num = Number(value);
    return !Number.isNaN(num) && Number.isFinite(num);
  });
}

function filterEmptyStatementItems(items, rows, visibleIndexes) {
  if (!visibleIndexes.length) return items;
  const keptDataItems = new Set();
  items.forEach((item) => {
    if (item.kind !== 'section' && item.kind !== 'note') {
      if (itemHasVisibleValues(item, rows, visibleIndexes)) {
        keptDataItems.add(item);
      }
    }
  });

  const result = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'section' || item.kind === 'note') {
      let hasDataUnderneath = false;
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].kind === 'section') break;
        if (keptDataItems.has(items[j])) {
          hasDataUnderneath = true;
          break;
        }
      }
      if (hasDataUnderneath) {
        result.push(item);
      }
    } else if (keptDataItems.has(item)) {
      result.push(item);
    }
  }
  return result;
}

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
  document.querySelector('#screener-range-track').style.background = `linear-gradient(to right, #e2e2e2 0%, #e2e2e2 ${pctMin}%, var(--orange) ${pctMin}%, var(--orange) ${pctMax}%, #e2e2e2 ${pctMax}%, #e2e2e2 100%)`;
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
    renderScreenerTables();
  });
});

document.querySelectorAll('.screener-tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.screener-tab').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    screenerStatement = button.dataset.statement;
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

/* ── Gráfico de métricas (datos financieros) ────────────────── */

const METRICS_CHART_COLORS = [
  '#ff9900', '#3a7bd5', '#2e9e5b', '#d64545',
  '#7b5cd6', '#009aa6', '#e06fb0', '#d96a2b',
  '#6c3483', '#2874a6', '#1e8449', '#c0392b',
  '#8a8a3a', '#5f6b7a', '#d4ac0d', '#34495e',
];
const chartMetrics = new Map();
const metricsChartNumFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
let metricsChartState = null;

/* Multi-company comparison state */
const comparisonCompanies = new Map(); // ticker -> { ticker, name, data }
const comparisonCache = new Map(); // ticker -> companyData
const seriesColorMap = new Map(); // seriesId -> hex color
const comparisonLoadingTickers = new Set();
let compareSearchDebounceTimer = null;
let chartPendingSeriesId = null;

function getBaseCompany() {
  return {
    ticker: companyTicker,
    name: companyData?.company?.name || companyTicker,
    data: companyData,
    isBase: true,
  };
}

function getAllChartCompanies() {
  const list = [];
  if (companyData) {
    list.push(getBaseCompany());
  }
  comparisonCompanies.forEach((comp) => {
    if (comp.data) {
      list.push({ ...comp, isBase: false });
    }
  });
  return list;
}

function getSeriesColor(seriesId, indexHint) {
  if (seriesColorMap.has(seriesId)) {
    return seriesColorMap.get(seriesId);
  }
  const used = new Set(seriesColorMap.values());
  let candidate = METRICS_CHART_COLORS.find((c) => !used.has(c));
  if (!candidate) {
    candidate = METRICS_CHART_COLORS[indexHint % METRICS_CHART_COLORS.length]
      ?? `hsl(${((seriesColorMap.size + indexHint) * 53) % 360} 70% 45%)`;
  }
  seriesColorMap.set(seriesId, candidate);
  return candidate;
}

const MARGIN_DEFINITIONS = {
  grossProfitMargin: { key: 'grossProfitMargin', kind: 'margin', baseKey: 'grossProfit', label: '% Márgenes brutos', format: 'percent' },
  operatingIncomeMargin: { key: 'operatingIncomeMargin', kind: 'margin', baseKey: 'operatingIncome', label: '% Márgenes operativos', format: 'percent' },
  operatingIncomeAdjustedMargin: { key: 'operatingIncomeAdjustedMargin', kind: 'margin', baseKey: 'operatingIncomeAdjusted', label: 'Margen operativo ajustado %', format: 'percent', italic: true },
  netIncomeMargin: { key: 'netIncomeMargin', kind: 'margin', baseKey: 'netIncomeToCommonIncludingUnusual', label: 'Margen de beneficio neto %', format: 'percent' },
  netIncomeAdjustedMargin: { key: 'netIncomeAdjustedMargin', kind: 'margin', baseKey: 'netIncomeToCommonExcludingUnusual', label: 'Margen de beneficio neto ajustado %', format: 'percent' },
  ebitdaMargin: { key: 'ebitdaMargin', kind: 'margin', baseKey: 'ebitda', label: '% Márgenes EBITDA', format: 'percent' },
};

function getMarginItemByKey(key) {
  const incomeItems = companyData?.statements?.income ?? [];
  const found = incomeItems.find((candidate) => candidate.key === key);
  if (found) return found;
  return MARGIN_DEFINITIONS[key] || null;
}

function syncMarginSelector() {
  const bar = document.querySelector('#screener-margins-bar');
  if (!bar) return;
  bar.hidden = screenerStatement !== 'income';
  bar.querySelectorAll('[data-margin-key]').forEach((button) => {
    const key = button.dataset.marginKey;
    const isSelected = chartMetrics.has(key);
    button.classList.toggle('active', isSelected);
    const dot = button.querySelector('.margin-chip-dot');
    if (dot) {
      const baseSeriesId = `${key}__${companyTicker}`;
      const color = seriesColorMap.get(baseSeriesId) || chartMetrics.get(key)?.color || '#ff9900';
      dot.style.background = isSelected ? color : 'transparent';
      dot.style.borderColor = isSelected ? color : '#999';
    }
  });
}

function metricChartType(metric) {
  if (!metric) return 'bar';
  if (metric.kind === 'change' || metric.kind === 'margin' || metric.kind === 'ratio' || metric.format === 'percent' || metric.format === 'perShare' || metric.format === 'multiple') return 'line';
  return 'bar';
}

function toggleChartMetric(item) {
  if (!item) return;
  const key = item.key;
  if (!key) return;
  if (chartMetrics.has(key)) {
    chartMetrics.delete(key);
    getAllChartCompanies().forEach((comp) => {
      seriesColorMap.delete(`${key}__${comp.ticker}`);
    });
  } else {
    chartMetrics.set(key, { ...item, key });
  }
  syncChartRowSelection();
  renderMetricsChart();
}

function removeChartMetric(key) {
  chartMetrics.delete(key);
  getAllChartCompanies().forEach((comp) => {
    seriesColorMap.delete(`${key}__${comp.ticker}`);
  });
  syncChartRowSelection();
  renderMetricsChart();
}

function syncChartRowSelection() {
  document.querySelectorAll('#screener-statement-table tbody tr[data-chart-key]').forEach((row) => {
    const key = row.dataset.chartKey;
    const isSelected = chartMetrics.has(key);
    row.classList.toggle('chart-selected', isSelected);
    const dot = row.querySelector('td:first-child .metric-chart-dot');
    if (dot) {
      const baseSeriesId = `${key}__${companyTicker}`;
      const color = seriesColorMap.get(baseSeriesId) || chartMetrics.get(key)?.color || '#ff9900';
      dot.style.background = isSelected ? color : '';
    }
  });
  syncMarginSelector();
}

function renderComparisonChips() {
  const container = document.querySelector('#metrics-compare-chips');
  if (!container) return;

  const html = [];
  html.push(`
    <span class="metrics-company-chip base-chip" title="Empresa actual: ${escapeHtml(companyData?.company?.name || companyTicker)}">
      <span class="chip-ticker">${escapeHtml(companyTicker)}</span>
      <span class="chip-badge">Base</span>
    </span>
  `);

  comparisonCompanies.forEach((comp) => {
    html.push(`
      <span class="metrics-company-chip" title="${escapeHtml(comp.name)}">
        <span class="chip-ticker">${escapeHtml(comp.ticker)}</span>
        <button type="button" class="metrics-company-chip-remove" data-remove-ticker="${escapeHtml(comp.ticker)}" title="Quitar ${escapeHtml(comp.ticker)} de la comparación" aria-label="Quitar ${escapeHtml(comp.ticker)}">×</button>
      </span>
    `);
  });

  comparisonLoadingTickers.forEach((ticker) => {
    html.push(`
      <span class="metrics-company-chip loading-chip">
        <span class="chip-ticker">${escapeHtml(ticker)}</span>
        <span class="chip-spinner">…</span>
      </span>
    `);
  });

  container.innerHTML = html.join('');

  container.querySelectorAll('[data-remove-ticker]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeComparisonCompany(btn.dataset.removeTicker);
    });
  });
}

async function addComparisonCompany(rawTicker) {
  const ticker = String(rawTicker ?? '').trim().toUpperCase();
  if (!ticker) return;

  if (ticker === companyTicker) {
    showCompareFeedback(`Ya estás viendo ${ticker} como empresa base.`);
    return;
  }
  if (comparisonCompanies.has(ticker)) {
    showCompareFeedback(`${ticker} ya está añadida al gráfico.`);
    return;
  }

  closeComparePopover();

  if (comparisonCache.has(ticker)) {
    const cached = comparisonCache.get(ticker);
    comparisonCompanies.set(ticker, {
      ticker: cached.company?.ticker || ticker,
      name: cached.company?.name || ticker,
      data: cached,
    });
    renderComparisonChips();
    renderMetricsChart();
    return;
  }

  comparisonLoadingTickers.add(ticker);
  renderComparisonChips();

  try {
    const response = await fetch(`/api/screener/company/${encodeURIComponent(ticker)}`);
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || !data.ok) {
      showCompareFeedback(`No se pudieron cargar los datos de ${ticker}.`);
      return;
    }
    comparisonCache.set(ticker, data);
    comparisonCompanies.set(ticker, {
      ticker: data.company?.ticker || ticker,
      name: data.company?.name || ticker,
      data,
    });
  } catch {
    showCompareFeedback(`Error al consultar ${ticker}.`);
  } finally {
    comparisonLoadingTickers.delete(ticker);
    renderComparisonChips();
    renderMetricsChart();
  }
}

function removeComparisonCompany(ticker) {
  comparisonCompanies.delete(ticker);
  [...seriesColorMap.keys()].forEach((k) => {
    if (k.endsWith(`__${ticker}`)) seriesColorMap.delete(k);
  });
  renderComparisonChips();
  renderMetricsChart();
}

function showCompareFeedback(msg) {
  const results = document.querySelector('#metrics-compare-results');
  const popover = document.querySelector('#metrics-compare-popover');
  if (popover && !popover.hidden && results) {
    results.innerHTML = `<div class="metrics-compare-empty" style="color:var(--red);font-weight:600;">${escapeHtml(msg)}</div>`;
    results.hidden = false;
  } else {
    const msgEl = document.querySelector('#metrics-chart-message') || document.querySelector('#chart-message');
    if (msgEl) {
      msgEl.textContent = msg;
      msgEl.hidden = false;
      setTimeout(() => { msgEl.hidden = true; }, 3500);
    }
  }
}

function openComparePopover() {
  const popover = document.querySelector('#metrics-compare-popover');
  const input = document.querySelector('#metrics-compare-input');
  const results = document.querySelector('#metrics-compare-results');
  if (!popover || !input) return;
  popover.hidden = false;
  input.value = '';
  if (results) {
    results.innerHTML = '<div class="metrics-compare-hint">Escribe un ticker (ej: KHC, KO, PEP) o nombre de empresa...</div>';
    results.hidden = false;
  }
  input.focus();
}

function closeComparePopover() {
  const popover = document.querySelector('#metrics-compare-popover');
  const results = document.querySelector('#metrics-compare-results');
  if (popover) popover.hidden = true;
  if (results) results.hidden = true;
}

function metricsChartRows() {
  return [...(companyData?.[screenerSeries] ?? [])].reverse();
}

function chartPeriodShort(row) {
  if (!row?.period) return '';
  if (/^\d{4}$/.test(row.period)) return row.period;
  const [year, quarter] = row.period.split('-Q');
  return `Q${quarter} ${String(year).slice(2)}`;
}

function formatChartAxis(value, metric) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (!metric) return metricsChartNumFormat.format(number);
  if (metric.kind === 'change' || metric.kind === 'margin' || metric.kind === 'ratio' || metric.format === 'percent') return `${metricsChartNumFormat.format(number)} %`;
  if (metric.format === 'multiple') return `${metricsChartNumFormat.format(number)}x`;
  if (metric.format === 'perShare') return `${metricsChartNumFormat.format(number)} $`;
  if (metric.format === 'shares') return `${metricsChartNumFormat.format(number / 1e6)} M`;
  if (metric.format === 'count') return metricsChartNumFormat.format(number);
  return `${metricsChartNumFormat.format(number / 1e6)} M$`;
}

function metricScale(seriesList, includeZero) {
  let min = Infinity;
  let max = -Infinity;
  seriesList.forEach((points) => points.forEach((point) => {
    const value = Number(point.value);
    if (!Number.isFinite(value)) return;
    if (value < min) min = value;
    if (value > max) max = value;
  }));
  if (!Number.isFinite(min)) return null;
  if (includeZero && min > 0) min = 0;
  if (includeZero && max < 0) max = 0;
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  return { min: min - span * 0.08, max: max + span * 0.08 };
}

function isMarginMetric(metric) {
  if (!metric) return false;
  return metric.kind === 'margin' || String(metric.key).toLowerCase().includes('margin');
}

function marginScale(seriesList) {
  let min = 0;
  let max = 100;
  let lowest = 0;
  let highest = 0;
  let hasNegative = false;

  seriesList.forEach((points) => points.forEach((point) => {
    const value = Number(point.value);
    if (!Number.isFinite(value)) return;
    if (value < lowest) lowest = value;
    if (value > highest) highest = value;
    if (value < 0) hasNegative = true;
  }));

  if (highest > 100) {
    max = Math.ceil(highest / 25) * 25;
  }

  if (hasNegative) {
    const step = 25;
    min = Math.floor(lowest / step) * step;
  } else {
    min = 0;
  }

  return { min, max, isMargin: true };
}

function generateMarginTicks(scale) {
  const ticks = [];
  const step = 25;
  for (let val = scale.min; val <= scale.max + 0.001; val += step) {
    ticks.push(Math.round(val));
  }
  return ticks;
}

function metricY(scale, margin, innerHeight) {
  return (value) => margin.top + innerHeight - ((Number(value) - scale.min) / (scale.max - scale.min)) * innerHeight;
}

function renderMetricsChart() {
  const block = document.querySelector('#metrics-chart-block');
  const svg = document.querySelector('#metrics-chart');
  const wrap = document.querySelector('#metrics-chart-body');
  const legend = document.querySelector('#metrics-chart-legend');
  const clearButton = document.querySelector('#metrics-chart-clear');
  metricsChartState = null;

  renderComparisonChips();

  const allCompanies = getAllChartCompanies();
  const hasMetrics = chartMetrics.size > 0;
  const hasComparisons = comparisonCompanies.size > 0;

  if (!hasMetrics && !hasComparisons) {
    block.hidden = true;
    svg.innerHTML = '';
    legend.innerHTML = '';
    wrap.querySelectorAll('.metrics-chart-placeholder').forEach((el) => el.remove());
    wrap.querySelectorAll('.metric-cagr-label').forEach((el) => el.remove());
    return;
  }

  block.hidden = false;
  clearButton.hidden = !hasMetrics;

  if (!hasMetrics && hasComparisons) {
    svg.innerHTML = '';
    legend.innerHTML = '';
    wrap.querySelectorAll('.metrics-chart-placeholder').forEach((el) => el.remove());
    wrap.querySelectorAll('.metric-cagr-label').forEach((el) => el.remove());
    const placeholder = document.createElement('div');
    placeholder.className = 'metrics-chart-placeholder';
    const names = allCompanies.map((c) => c.ticker).join(' y ');
    placeholder.innerHTML = `
      <div class="metrics-chart-placeholder-card">
        <span class="placeholder-icon">📊</span>
        <strong>Comparación preparada (${escapeHtml(names)})</strong>
        <p>Haz clic en cualquier fila de la tabla (ej. <em>Ingresos</em>, <em>Beneficio neto</em>, <em>Activo total</em>, <em>Flujo de caja libre</em>) para ver la comparación entre las empresas en el gráfico.</p>
      </div>
    `;
    wrap.appendChild(placeholder);
    return;
  }

  wrap.querySelectorAll('.metrics-chart-placeholder').forEach((el) => el.remove());

  // Collect chronological rows for each company
  const companyRowsMap = new Map();
  const periodOrderMap = new Map();
  const periodMetaMap = new Map();

  allCompanies.forEach((comp) => {
    const rawRows = [...(comp.data?.[screenerSeries] ?? [])].reverse();
    companyRowsMap.set(comp.ticker, rawRows);
    rawRows.forEach((r, idx) => {
      if (!r?.period) return;
      if (!periodOrderMap.has(r.period)) {
        let rank = 0;
        if (/^\d{4}$/.test(r.period)) {
          rank = Number(r.period) * 10;
        } else if (r.period.includes('-Q')) {
          const [y, q] = r.period.split('-Q');
          rank = Number(y) * 10 + Number(q);
        } else {
          rank = idx;
        }
        periodOrderMap.set(r.period, rank);
        periodMetaMap.set(r.period, r);
      } else if (r.periodEnd && !periodMetaMap.get(r.period)?.periodEnd) {
        periodMetaMap.set(r.period, r);
      }
    });
  });

  const baseRows = companyRowsMap.get(companyTicker) || [];
  const baseYears = baseRows.map(rowYear).filter((y) => y !== null);
  const low = baseYears.length ? Math.min(...baseYears) : 2016;
  const high = baseYears.length ? Math.max(...baseYears) : 2026;
  const minYear = screenerYearMin ?? Math.max(low, high - 9);
  const maxYear = screenerYearMax ?? high;

  const sortedPeriods = [...periodOrderMap.keys()]
    .filter((p) => {
      const match = String(p).match(/^(\d{4})/);
      if (!match) return true;
      const y = Number(match[1]);
      return y >= minYear && y <= maxYear;
    })
    .sort((a, b) => (periodOrderMap.get(a) ?? 0) - (periodOrderMap.get(b) ?? 0));

  const timeline = sortedPeriods.map((p) => {
    const meta = periodMetaMap.get(p) || { period: p };
    return {
      period: p,
      meta,
      label: periodDateLabel(meta),
      short: chartPeriodShort(meta),
      year: rowYear(meta),
    };
  });

  const width = Math.max(320, wrap.clientWidth || 720);
  const height = 300;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const metrics = [...chartMetrics.values()];
  const series = [];
  let colorIndexHint = 0;

  metrics.forEach((metric) => {
    allCompanies.forEach((comp) => {
      const seriesId = `${metric.key}__${comp.ticker}`;
      const color = getSeriesColor(seriesId, colorIndexHint++);
      const isMulti = allCompanies.length > 1;
      const label = isMulti ? `${comp.ticker} · ${metric.label}` : metric.label;
      const compRows = companyRowsMap.get(comp.ticker) || [];

      const points = timeline.map((t) => {
        const rowIndex = compRows.findIndex((r) => r.period === t.period);
        if (rowIndex === -1) {
          return { label: t.label, short: t.short, year: t.year, value: null };
        }
        const row = compRows[rowIndex];
        const locked = isLockedPeriod(rowIndex, compRows);
        const value = locked ? null : derivedScreenerValue(metric, row, rowIndex, compRows, comp.data);
        return {
          label: t.label,
          short: t.short,
          year: t.year,
          value,
        };
      });

      series.push({
        id: seriesId,
        metric,
        company: comp,
        label,
        color,
        points,
      });
    });
  });

  legend.innerHTML = series.map((entry) => `
    <span class="metrics-legend-item">
      <button type="button" class="metrics-swatch" data-series-id="${escapeHtml(entry.id)}" aria-label="Cambiar el color de ${escapeHtml(entry.label)}" style="background:${entry.color}"></button>
      <span class="metrics-legend-label" title="${escapeHtml(entry.label)}">${escapeHtml(entry.label)}</span>
      <span class="metrics-legend-type">${metricChartType(entry.metric) === 'bar' ? 'barras' : 'línea'}</span>
      <button type="button" class="metrics-legend-remove" data-remove-key="${escapeHtml(entry.metric.key)}" aria-label="Quitar ${escapeHtml(entry.metric.label)} del gráfico">×</button>
    </span>`).join('');

  const barSeries = series.filter((entry) => metricChartType(entry.metric) === 'bar');
  const lineSeries = series.filter((entry) => metricChartType(entry.metric) === 'line');

  const allLinesAreMargins = lineSeries.length > 0 && lineSeries.every((entry) => isMarginMetric(entry.metric));
  const barScale = barSeries.length ? metricScale(barSeries.map((entry) => entry.points), true) : null;
  const lineScale = lineSeries.length
    ? (allLinesAreMargins
        ? marginScale(lineSeries.map((entry) => entry.points))
        : metricScale(lineSeries.map((entry) => entry.points), false))
    : null;
  const leftScale = barScale ?? lineScale;
  const rightScale = lineScale;

  const margin = { top: 14, right: rightScale ? 64 : 12, bottom: 26, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const slotWidth = timeline.length ? innerWidth / timeline.length : innerWidth;
  const centers = timeline.map((_, index) => margin.left + slotWidth * (index + 0.5));
  const yLeft = metricY(leftScale, margin, innerHeight);
  const yRight = metricY(rightScale ?? leftScale, margin, innerHeight);

  const xLabelStep = Math.max(1, Math.ceil(timeline.length / 8));
  const xLabels = timeline.map((t, index) => (index % xLabelStep === 0
    ? `<text x="${centers[index].toFixed(1)}" y="${height - 8}" class="chart-label chart-label-x">${escapeHtml(t.short)}</text>`
    : '')).join('');

  const leftTicks = leftScale
    ? (leftScale.isMargin
        ? generateMarginTicks(leftScale)
        : [0, 1, 2, 3].map((step) => leftScale.min + ((leftScale.max - leftScale.min) * step) / 3))
    : [];
  const rightTicks = rightScale
    ? (rightScale.isMargin
        ? generateMarginTicks(rightScale)
        : [0, 1, 2, 3].map((step) => rightScale.min + ((rightScale.max - rightScale.min) * step) / 3))
    : [];

  const leftAxis = leftTicks.map((value) => `
    <text x="${margin.left - 8}" y="${yLeft(value) + 3}" class="chart-label" text-anchor="end">${formatChartAxis(value, barSeries[0]?.metric ?? lineSeries[0]?.metric)}</text>
    <line x1="${margin.left}" y1="${yLeft(value)}" x2="${width - margin.right}" y2="${yLeft(value)}" class="chart-grid"/>
  `).join('');
  const rightAxis = rightTicks.map((value) => `
    <text x="${width - margin.right + 8}" y="${yRight(value) + 3}" class="chart-label" text-anchor="start">${formatChartAxis(value, lineSeries[0]?.metric)}</text>
    <line x1="${width - margin.right}" y1="${yRight(value)}" x2="${width - margin.right + 4}" y2="${yRight(value)}" class="chart-grid" style="stroke-opacity:0.4;"/>
  `).join('');

  let zeroLineSvg = '';
  const zeroYScale = rightScale?.isMargin ? rightScale : (leftScale?.min < 0 && leftScale?.max > 0 ? leftScale : null);
  if (zeroYScale) {
    const yFn = zeroYScale === rightScale ? yRight : yLeft;
    const y0 = yFn(0);
    zeroLineSvg = `<line x1="${margin.left}" y1="${y0.toFixed(1)}" x2="${width - margin.right}" y2="${y0.toFixed(1)}" class="chart-zero-line" style="stroke:rgba(0,0,0,0.35);stroke-dasharray:4 3;stroke-width:1.2;"/>`;
  }

  let barsSvg = '';
  if (barScale && timeline.length) {
    const groupWidth = slotWidth * 0.75;
    const barWidth = Math.max(2, groupWidth / barSeries.length);
    const baseY = yLeft(Math.max(0, barScale.min));
    barSeries.forEach((entry, j) => {
      entry.points.forEach((point, index) => {
        const value = Number(point.value);
        if (!Number.isFinite(value)) return;
        const x0 = centers[index] - groupWidth / 2 + j * barWidth;
        const yTop = yLeft(value);
        barsSvg += `<rect x="${x0.toFixed(1)}" y="${Math.min(yTop, baseY).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, Math.abs(yTop - baseY)).toFixed(1)}" rx="1.5" class="metric-bar" style="fill:${entry.color}"/>`;
      });
    });
  }

  let linesSvg = '';
  if (lineScale) {
    const lineY = rightScale ? yRight : yLeft;
    lineSeries.forEach((entry) => {
      let d = '';
      let segmentStarted = false;
      entry.points.forEach((point, index) => {
        const value = Number(point.value);
        if (!Number.isFinite(value)) {
          segmentStarted = false;
          return;
        }
        const x = centers[index];
        const y = lineY(value);
        d += `${segmentStarted ? ' L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        segmentStarted = true;
      });
      if (d) linesSvg += `<path d="${d}" class="metric-line" style="stroke:${entry.color}"/>`;
      entry.points.forEach((point, index) => {
        const value = Number(point.value);
        if (!Number.isFinite(value)) return;
        linesSvg += `<circle cx="${centers[index].toFixed(1)}" cy="${lineY(value).toFixed(1)}" r="3.5" class="metric-dot" style="stroke:${entry.color}"/>`;
      });
    });
  }

  const body = document.querySelector('#metrics-chart-body');
  body.querySelectorAll('.metric-cagr-label').forEach((el) => el.remove());

  let cagrLinesSvg = '';
  const cagrLabels = [];
  if (allCompanies.length === 1 && series.length === 1) {
    const entry = series[0];
    if (!entry.metric.kind || (entry.metric.kind !== 'margin' && entry.metric.kind !== 'ratio' && entry.metric.kind !== 'change' && entry.metric.format !== 'percent')) {
      const y = metricChartType(entry.metric) === 'bar' || !rightScale ? yLeft : yRight;
      let first = null;
      let last = null;
      entry.points.forEach((point, index) => {
        const value = Number(point.value);
        if (!Number.isFinite(value)) return;
        if (first === null) first = { index, value, year: point.year };
        last = { index, value, year: point.year };
      });
      if (first && last && first.index !== last.index) {
        const geometry = {
          x1: centers[first.index],
          y1: y(first.value),
          x2: centers[last.index],
          y2: y(last.value),
          t: 0.5,
        };
        cagrLinesSvg += `<line x1="${geometry.x1.toFixed(1)}" y1="${geometry.y1.toFixed(1)}" x2="${geometry.x2.toFixed(1)}" y2="${geometry.y2.toFixed(1)}" class="metric-cagr-line"/>`;
        let cagrText = 'CAGR: —';
        if (first.year !== null && last.year !== null && last.year > first.year) {
          const years = last.year - first.year;
          const ratio = last.value / first.value;
          if (Number.isFinite(ratio) && ratio > 0) {
            const cagr = (ratio ** (1 / years)) - 1;
            cagrText = `CAGR: ${cagr >= 0 ? '+' : '−'}${metricsChartNumFormat.format(Math.abs(cagr * 100))} %`;
          } else if (first.value !== 0) {
            const average = (((last.value - first.value) / Math.abs(first.value)) / years) * 100;
            cagrText = `CAGR: ${average >= 0 ? '+' : '−'}${metricsChartNumFormat.format(Math.abs(average))} %`;
          }
        }
        geometry.text = cagrText;
        cagrLabels.push(geometry);
      }
    }
  }

  svg.innerHTML = `${leftAxis}${rightAxis}${zeroLineSvg}${barsSvg}${linesSvg}${cagrLinesSvg}${xLabels}
    <g id="metrics-hover" hidden>
      <line id="metrics-hover-line" x1="0" y1="0" x2="0" y2="0" class="chart-crosshair"/>
      <g id="metrics-hover-dots"></g>
    </g>`;

  cagrLabels.forEach((geometry) => {
    const el = document.createElement('div');
    el.className = 'metric-cagr-label';
    el.textContent = geometry.text;
    body.appendChild(el);
    geometry.el = el;
    positionCagrLabel(geometry);
    attachCagrDrag(geometry);
  });

  metricsChartState = { rows: timeline, series, centers, margin, height, width, rightScale, yLeft, yRight };
}

function positionCagrLabel(geometry) {
  geometry.el.style.left = `${geometry.x1 + geometry.t * (geometry.x2 - geometry.x1)}px`;
  geometry.el.style.top = `${geometry.y1 + geometry.t * (geometry.y2 - geometry.y1)}px`;
}

function attachCagrDrag(geometry) {
  const el = geometry.el;
  let dragging = false;
  el.addEventListener('pointerdown', (event) => {
    dragging = true;
    el.setPointerCapture(event.pointerId);
    el.classList.add('dragging');
    event.preventDefault();
  });
  el.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const bodyRect = document.querySelector('#metrics-chart-body').getBoundingClientRect();
    const x = event.clientX - bodyRect.left;
    geometry.t = Math.max(0, Math.min(1, (x - geometry.x1) / (geometry.x2 - geometry.x1)));
    positionCagrLabel(geometry);
  });
  const endDrag = () => {
    dragging = false;
    el.classList.remove('dragging');
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
}

function hideMetricsChartTooltip() {
  const tooltip = document.querySelector('#metrics-chart-tooltip');
  if (tooltip) tooltip.hidden = true;
  const hover = document.querySelector('#metrics-hover');
  if (hover) hover.hidden = true;
}

function updateMetricsChartHover(event) {
  if (!metricsChartState || !metricsChartState.rows?.length) return;
  const svg = document.querySelector('#metrics-chart');
  const rect = svg.getBoundingClientRect();
  const cursorX = ((event.clientX - rect.left) / rect.width) * metricsChartState.width;
  const centers = metricsChartState.centers;
  let best = 0;
  let bestDistance = Infinity;
  centers.forEach((center, index) => {
    const distance = Math.abs(cursorX - center);
    if (distance < bestDistance) { bestDistance = distance; best = index; }
  });

  const { rows, series, margin, height, width, rightScale, yLeft, yRight } = metricsChartState;
  const hover = svg.querySelector('#metrics-hover');
  const line = svg.querySelector('#metrics-hover-line');
  const dots = svg.querySelector('#metrics-hover-dots');
  if (hover) hover.hidden = false;
  const cx = centers[best];
  if (line) {
    line.setAttribute('x1', cx.toFixed(1));
    line.setAttribute('y1', margin.top.toFixed(1));
    line.setAttribute('x2', cx.toFixed(1));
    line.setAttribute('y2', (height - margin.bottom).toFixed(1));
  }
  if (dots) {
    dots.innerHTML = series.map((entry) => {
      const value = Number(entry.points[best]?.value);
      if (!Number.isFinite(value)) return '';
      const y = metricChartType(entry.metric) === 'bar' || !rightScale ? yLeft(value) : yRight(value);
      return `<circle cx="${cx.toFixed(1)}" cy="${y.toFixed(1)}" r="4" class="metric-dot" style="stroke:${entry.color}"/>`;
    }).join('');
  }

  const tooltip = document.querySelector('#metrics-chart-tooltip');
  if (tooltip) {
    const periodTitle = rows[best]?.label || rows[best]?.period || '';
    tooltip.innerHTML = `<strong>${escapeHtml(periodTitle)}</strong>${series.map((entry) => {
      const val = entry.points[best]?.value;
      const formatted = val !== null && Number.isFinite(Number(val)) ? formatChartAxis(val, entry.metric) : '—';
      return `
        <div class="metrics-chart-tooltip-row">
          <span class="metric-legend-dot" style="background:${entry.color}"></span>
          <span>${escapeHtml(entry.label)}</span>
          <b>${formatted}</b>
        </div>
      `;
    }).join('')}`;
    tooltip.hidden = false;
    positionChartTooltip(tooltip, event.clientX, event.clientY);
  }
}

document.querySelector('#metrics-chart').addEventListener('mousemove', updateMetricsChartHover);
document.querySelector('#metrics-chart').addEventListener('mouseleave', hideMetricsChartTooltip);
document.querySelector('#metrics-chart-body')?.addEventListener('mouseleave', hideMetricsChartTooltip);

function openMetricsPalette(swatch, seriesId) {
  chartPendingSeriesId = seriesId;
  const currentColor = seriesColorMap.get(seriesId) || swatch.style.background;
  const palette = document.querySelector('#metrics-palette');
  palette.innerHTML = METRICS_CHART_COLORS.map((color) => `
    <button type="button" class="metrics-palette-color${color === currentColor ? ' active' : ''}" style="background:${color}" data-color="${color}" aria-label="Usar el color ${color}"></button>`).join('');
  const blockRect = document.querySelector('#metrics-chart-block').getBoundingClientRect();
  const swatchRect = swatch.getBoundingClientRect();
  palette.style.left = `${swatchRect.left - blockRect.left}px`;
  palette.style.top = `${swatchRect.bottom - blockRect.top + 6}px`;
  palette.hidden = false;
}

document.querySelector('#metrics-palette')?.addEventListener('click', (event) => {
  const colorButton = event.target.closest('.metrics-palette-color');
  if (!colorButton) return;
  const seriesId = chartPendingSeriesId;
  chartPendingSeriesId = null;
  document.querySelector('#metrics-palette').hidden = true;
  if (!seriesId) return;
  seriesColorMap.set(seriesId, colorButton.dataset.color);
  syncChartRowSelection();
  renderMetricsChart();
});

document.querySelector('#metrics-chart-legend')?.addEventListener('click', (event) => {
  const swatch = event.target.closest('.metrics-swatch');
  if (swatch) {
    const seriesId = swatch.dataset.seriesId;
    if (!seriesId) return;
    const palette = document.querySelector('#metrics-palette');
    if (!palette.hidden && chartPendingSeriesId === seriesId) {
      palette.hidden = true;
      chartPendingSeriesId = null;
      return;
    }
    openMetricsPalette(swatch, seriesId);
    return;
  }
  const remove = event.target.closest('.metrics-legend-remove');
  if (remove) removeChartMetric(remove.dataset.removeKey);
});

document.addEventListener('click', (event) => {
  const palette = document.querySelector('#metrics-palette');
  if (palette && !palette.hidden) {
    if (!event.target.closest('#metrics-palette') && !event.target.closest('.metrics-swatch')) {
      palette.hidden = true;
      chartPendingSeriesId = null;
    }
  }

  const popover = document.querySelector('#metrics-compare-popover');
  if (popover && !popover.hidden) {
    if (!event.target.closest('#metrics-compare-popover') && !event.target.closest('#metrics-compare-add-btn') && !event.target.closest('#screener-compare-shortcut-btn')) {
      closeComparePopover();
    }
  }
});

document.querySelector('#metrics-chart-clear')?.addEventListener('click', () => {
  chartMetrics.clear();
  seriesColorMap.clear();
  syncChartRowSelection();
  renderMetricsChart();
});

document.querySelector('#metrics-compare-add-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const popover = document.querySelector('#metrics-compare-popover');
  if (popover && !popover.hidden) {
    closeComparePopover();
  } else {
    openComparePopover();
  }
});

document.querySelector('#screener-compare-shortcut-btn')?.addEventListener('click', () => {
  if (screenerStatement === 'valuation') {
    document.querySelectorAll('.screener-tab').forEach((item) => {
      item.classList.toggle('active', item.dataset.statement === 'income');
    });
    screenerStatement = 'income';
    renderScreenerTables();
  }
  const block = document.querySelector('#metrics-chart-block');
  if (block) block.hidden = false;
  renderComparisonChips();
  openComparePopover();
  block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

document.querySelector('#metrics-compare-input')?.addEventListener('input', (e) => {
  const query = e.currentTarget.value.trim();
  const results = document.querySelector('#metrics-compare-results');
  clearTimeout(compareSearchDebounceTimer);

  if (!query) {
    if (results) {
      results.innerHTML = '<div class="metrics-compare-hint">Escribe un ticker (ej: KHC, KO, PEP) o nombre...</div>';
      results.hidden = false;
    }
    return;
  }

  compareSearchDebounceTimer = setTimeout(async () => {
    if (results) {
      results.innerHTML = '<div class="metrics-compare-loading">Buscando empresas en SEC…</div>';
      results.hidden = false;
    }
    const matches = await searchCompanies(query);
    if (!matches || !matches.length) {
      const cleanTicker = query.toUpperCase();
      if (/^[A-Z0-9.-]{1,10}$/.test(cleanTicker)) {
        results.innerHTML = `
          <button type="button" class="metrics-compare-result-item" data-ticker="${escapeHtml(cleanTicker)}">
            <span class="metrics-compare-res-name">Añadir ticker directo</span>
            <strong>${escapeHtml(cleanTicker)}</strong>
          </button>
        `;
      } else {
        results.innerHTML = '<div class="metrics-compare-empty">Sin resultados en la SEC para esta búsqueda.</div>';
      }
      results.hidden = false;
      return;
    }

    results.innerHTML = matches.map((item) => `
      <button type="button" class="metrics-compare-result-item" data-ticker="${escapeHtml(item.ticker)}">
        <span class="metrics-compare-res-name">${escapeHtml(item.name || item.ticker)}</span>
        <strong>${escapeHtml(item.ticker)}</strong>
      </button>
    `).join('');
    results.hidden = false;
  }, 220);
});

document.querySelector('#metrics-compare-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const firstBtn = document.querySelector('#metrics-compare-results .metrics-compare-result-item');
    if (firstBtn?.dataset.ticker) {
      addComparisonCompany(firstBtn.dataset.ticker);
      return;
    }
    const val = e.currentTarget.value.trim().toUpperCase();
    if (/^[A-Z0-9.-]{1,10}$/.test(val)) {
      addComparisonCompany(val);
    }
  } else if (e.key === 'Escape') {
    closeComparePopover();
  }
});

document.querySelector('#metrics-compare-results')?.addEventListener('click', (e) => {
  const item = e.target.closest('.metrics-compare-result-item');
  if (item?.dataset.ticker) {
    addComparisonCompany(item.dataset.ticker);
  }
});

document.querySelectorAll('#screener-margins-bar [data-margin-key]').forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.dataset.marginKey;
    const item = getMarginItemByKey(key);
    if (item) {
      toggleChartMetric(item);
    }
  });
});

/* ── Informes (filings) ─────────────────────────────────────── */

function formatFilingDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('es-ES');
}

function renderFilingsTable() {
  const table = document.querySelector('#filings-table');
  const filings = screenerFilings?.filings ?? [];
  document.querySelector('#filings-count').textContent = filings.length
    ? `${filings.length} informes · ordenados por fecha de presentación`
    : 'Sin informes 10-Q ni 10-K disponibles';
  table.querySelector('thead').innerHTML = '<tr><th>Formulario</th><th>Periodo</th><th>Periodo que cubre</th><th>Fecha de presentación</th><th>Acciones</th></tr>';
  table.querySelector('tbody').innerHTML = filings.map((filing) => {
    const badgeClass = filing.formType === '10-K' ? 'filing-badge-10k' : 'filing-badge-10q';
    const documentUrl = `/api/screener/company/${encodeURIComponent(companyTicker)}/filings/${encodeURIComponent(filing.accession)}/document`;
    return `<tr>
      <td><span class="filing-badge ${badgeClass}">${escapeHtml(filing.formType)}</span></td>
      <td class="filing-period">${escapeHtml(filing.periodLabel ?? '—')}</td>
      <td class="filing-date">${escapeHtml(filing.period ?? '—')}</td>
      <td class="filing-date">${escapeHtml(formatFilingDate(filing.filedAt))}</td>
      <td class="filing-actions">
        <button type="button" class="filing-action" data-action="preview" data-doc="${escapeHtml(documentUrl)}" data-name="${escapeHtml(filing.documentName)}">Vista previa</button>
        <a class="filing-action filing-action-download" href="${escapeHtml(documentUrl)}?download=1" download>Descargar</a>
        <button type="button" class="filing-action filing-action-analyze" data-action="analyze" data-ticker="${escapeHtml(companyTicker)}" data-accession="${escapeHtml(filing.accession)}">Analizar con IA</button>
      </td>
    </tr>`;
  }).join('');
  table.querySelectorAll('button[data-action="preview"]').forEach((button) => {
    button.addEventListener('click', () => openFilingsPreview(button.dataset.doc, button.dataset.name));
  });
  table.querySelectorAll('button[data-action="analyze"]').forEach((button) => {
    button.addEventListener('click', () => {
      const params = new URLSearchParams({ analizar: button.dataset.ticker, accession: button.dataset.accession });
      window.location.href = `/analisis?${params.toString()}`;
    });
  });
}

async function loadFilings() {
  if (screenerFilingsLoading || !companyTicker) return;
  screenerFilingsLoading = true;
  try {
    const response = await fetch(`/api/screener/company/${encodeURIComponent(companyTicker)}/filings`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast(data.error || 'No se pudieron cargar los informes.');
      return;
    }
    screenerFilings = data;
    renderFilingsTable();
  } catch {
    showToast('No se pudieron cargar los informes. Comprueba la conexión.');
  } finally {
    screenerFilingsLoading = false;
  }
}

function openFilingsPreview(url, name) {
  const title = document.querySelector('#filings-preview-title');
  const loading = document.querySelector('#filings-preview-loading');
  const pages = document.querySelector('#filings-preview-pages');
  clearTimeout(previewLoadTimeout);
  title.textContent = `Vista previa · ${name}`;
  document.querySelector('#filings-preview-open').href = url;
  pages.hidden = true;
  pages.innerHTML = '';
  loading.hidden = false;
  loading.textContent = 'Generando páginas del documento…';
  document.querySelector('#filings-preview-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  previewLoadTimeout = setTimeout(() => {
    if (!loading.hidden) loading.textContent = 'La vista previa tarda demasiado. Puedes abrir el documento en una pestaña nueva.';
  }, 30000);
  const previewUrl = url.replace(/\/document$/, '/preview');
  fetch(previewUrl)
    .then((response) => response.json().catch(() => ({})))
    .then((data) => {
      clearTimeout(previewLoadTimeout);
      if (!data || data.ok !== true || !data.pages) {
        loading.textContent = 'No se pudo generar la vista previa. Abre el documento en una pestaña nueva.';
        return;
      }
      loading.hidden = true;
      const pageWord = data.pages === 1 ? 'página' : 'páginas';
      title.textContent = `Vista previa · ${name} · ${data.pages} ${pageWord}`;
      const base = previewUrl.replace(/\/preview$/, '/preview/pages');
      pages.innerHTML = Array.from({ length: data.pages }, (_, index) => (
        `<img src="${base}/${index + 1}" alt="Página ${index + 1}" loading="lazy">`
      )).join('');
      pages.hidden = false;
    })
    .catch(() => {
      clearTimeout(previewLoadTimeout);
      loading.textContent = 'No se pudo conectar con el servidor. Abre el documento en una pestaña nueva.';
    });
}

function closeFilingsPreview() {
  clearTimeout(previewLoadTimeout);
  document.querySelector('#filings-preview-backdrop').hidden = true;
  document.querySelector('#filings-preview-pages').innerHTML = '';
  document.body.style.overflow = '';
}

document.querySelector('#filings-preview-close').addEventListener('click', closeFilingsPreview);
document.querySelector('#filings-preview-backdrop').addEventListener('click', (event) => {
  if (event.target === document.querySelector('#filings-preview-backdrop')) closeFilingsPreview();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.querySelector('#filings-preview-backdrop').hidden) closeFilingsPreview();
});

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

/* ── Accionariado ────────────────────────────────────────────── */

async function loadHolders() {
  const loadingEl = document.querySelector('#accionariado-loading');
  const errorEl = document.querySelector('#accionariado-error');
  const tableWrap = document.querySelector('#accionariado-table-wrap');

  if (loadingEl) loadingEl.hidden = false;
  if (errorEl) errorEl.hidden = true;
  if (tableWrap) tableWrap.hidden = true;

  companyHoldersLoading = true;
  try {
    const res = await fetch(`/api/screener/company/${encodeURIComponent(companyTicker)}/holders`);
    if (!res.ok) {
      throw new Error(`Error ${res.status}: no se pudieron obtener los datos de accionariado.`);
    }
    const data = await res.json();
    companyHoldersData = data;
    renderHolders();
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'No fue posible cargar el accionariado.';
      errorEl.hidden = false;
    }
  } finally {
    companyHoldersLoading = false;
    if (loadingEl) loadingEl.hidden = true;
  }
}

function renderHolders() {
  if (!companyHoldersData) return;

  const titleEl = document.querySelector('#accionariado-company-name');
  if (titleEl) {
    titleEl.textContent = companyData?.company?.name || companyTicker;
  }

  const institutions = companyHoldersData.institutions || [];
  const top10Pct = institutions.reduce((sum, item) => sum + (Number(item.percentage) || 0), 0);

  const bk = companyHoldersData.breakdown || {};
  const kpiInstPct = document.querySelector('#kpi-institutions-pct');
  const kpiInstCount = document.querySelector('#kpi-institutions-count');
  const kpiInsidersPct = document.querySelector('#kpi-insiders-pct');

  if (kpiInstPct) {
    kpiInstPct.textContent = top10Pct > 0
      ? `${formatProfileNumber(top10Pct * 100, 2)} %`
      : '—';
  }
  if (kpiInsidersPct) {
    kpiInsidersPct.textContent = bk.insidersPercent !== null && bk.insidersPercent !== undefined
      ? `${formatProfileNumber(bk.insidersPercent * 100, 2)} %`
      : '—';
  }
  if (kpiInstCount) {
    kpiInstCount.textContent = bk.institutionsCount ? `${formatProfileNumber(bk.institutionsCount, 0)} entidades` : '—';
  }

  const thead = document.querySelector('#accionariado-thead');
  const tbody = document.querySelector('#accionariado-tbody');
  const tableWrap = document.querySelector('#accionariado-table-wrap');
  if (tableWrap) tableWrap.hidden = false;

  if (activeHoldersTab === 'insiders') {
    thead.innerHTML = `
      <tr>
        <th style="width: 32%;">Nombre</th>
        <th style="width: 24%;">Cargo / Relación</th>
        <th style="text-align: right; width: 16%;">Acciones directas</th>
        <th style="width: 16%;">Operación</th>
        <th style="text-align: right; width: 12%;">Fecha</th>
      </tr>
    `;
    const list = companyHoldersData.insiders || [];
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 24px;">No hay datos de directivos reportados.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map((item) => `
      <tr>
        <td>
          <span style="font-size: 16px; margin-right: 6px;" aria-hidden="true">👤</span>
          <strong style="color: var(--ink); font-size: 12.5px;">${escapeHtml(item.name || '—')}</strong>
        </td>
        <td style="color: var(--muted); font-size: 12px;">${escapeHtml(item.relation || 'Directivo')}</td>
        <td style="text-align: right; font-family: monospace; font-size: 12.5px; font-weight: 600; color: var(--ink);">
          ${formatProfileNumber(item.position, 0)}
        </td>
        <td style="color: var(--muted); font-size: 11.5px;">${escapeHtml(item.transactionDescription || '—')}</td>
        <td style="text-align: right; color: var(--muted); font-size: 11.5px;">${escapeHtml(item.reportDate || '—')}</td>
      </tr>
    `).join('');
    return;
  }

  const isFunds = activeHoldersTab === 'funds';
  const list = isFunds ? (companyHoldersData.funds || []) : (companyHoldersData.institutions || []);

  thead.innerHTML = `
    <tr>
      <th style="width: 38%;">Nombre</th>
      <th style="text-align: right; width: 18%;">Acciones</th>
      <th style="text-align: right; width: 14%;">%</th>
      <th style="text-align: right; width: 16%;">Valoración</th>
      <th style="text-align: right; width: 14%;">Variación</th>
    </tr>
  `;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 24px;">No se encontraron posiciones para esta categoría.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((item) => {
    const flag = item.country?.flag || '🇺🇸';
    const countryName = item.country?.name || 'Estados Unidos';
    const sharesStr = formatProfileNumber(item.shares, 0);
    const pctStr = item.percentage !== null && item.percentage !== undefined
      ? `${formatProfileNumber(item.percentage * 100, 2)} %`
      : '—';
    const valStr = formatProfileCompactUsd(item.value);

    let changeHtml = '<span style="color: var(--muted);">—</span>';
    if (item.changePercent !== null && item.changePercent !== undefined) {
      const chg = item.changePercent * 100;
      const isPos = chg > 0;
      const isNeg = chg < 0;
      const sign = isPos ? '+' : '';
      const colorClass = isPos ? 'positive' : isNeg ? 'negative' : '';
      changeHtml = `<span class="td-change ${colorClass}">${sign}${formatProfileNumber(chg, 2)} %</span>`;
    }

    return `
      <tr>
        <td>
          <span style="font-size: 16px; margin-right: 6px;" title="${escapeHtml(countryName)}">${flag}</span>
          <strong style="color: var(--ink); font-size: 12.5px;">${escapeHtml(item.name || '—')}</strong>
        </td>
        <td style="text-align: right; font-family: monospace; font-size: 12.5px; font-weight: 600; color: var(--ink);">
          ${sharesStr}
        </td>
        <td style="text-align: right; font-family: monospace; font-size: 12px; color: var(--ink);">
          ${pctStr}
        </td>
        <td style="text-align: right; font-family: monospace; font-size: 12px; font-weight: 600; color: var(--ink);">
          ${valStr}
        </td>
        <td style="text-align: right;">
          ${changeHtml}
        </td>
      </tr>
    `;
  }).join('');
}

document.querySelectorAll('[data-holders-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-holders-tab]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeHoldersTab = btn.dataset.holdersTab;
    renderHolders();
  });
});

/* ── Secciones del menú lateral ─────────────────────────────── */

function showSection(key) {
  const sections = {
    perfil: document.querySelector('#section-perfil'),
    favoritos: document.querySelector('#section-favoritos'),
    cartera: document.querySelector('#section-cartera'),
    informes: document.querySelector('#section-informes'),
    datos: document.querySelector('#section-datos'),
    accionariado: document.querySelector('#section-accionariado'),
    alertas: document.querySelector('#section-alertas'),
    placeholder: document.querySelector('#section-placeholder'),
  };

  Object.values(sections).forEach((section) => { if (section) section.hidden = true; });

  if (key === 'favoritos') {
    sections.favoritos.hidden = false;
    return;
  }
  if (key === 'cartera') {
    sections.cartera.hidden = false;
    const root = document.querySelector('#portfolio-company-section');
    if (root && !root.dataset.ticker) {
      root.dataset.ticker = companyTicker;
      root.dataset.name = companyData?.company?.name ?? companyTicker;
      Portfolio.registerCompanyPanel(root);
    }
    return;
  }
  if (key === 'informes') {
    sections.informes.hidden = false;
    if (!screenerFilings && !screenerFilingsLoading) loadFilings();
    return;
  }
  if (key === 'datos') {
    sections.datos.hidden = false;
    renderScreenerTables();
    return;
  }
  if (key === 'accionariado') {
    if (sections.accionariado) sections.accionariado.hidden = false;
    if (!companyHoldersData && !companyHoldersLoading) {
      loadHolders();
    } else if (companyHoldersData) {
      renderHolders();
    }
    return;
  }
  if (key === 'alertas') {
    if (sections.alertas) sections.alertas.hidden = false;
    const container = document.querySelector('#company-price-alerts-container');
    if (container && !container.dataset.mounted) {
      container.dataset.mounted = '1';
      PriceAlerts.mountSection(container, {
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
  if (SECTION_PLACEHOLDERS.includes(key)) {
    const label = document.querySelector(`.nav-link[data-section="${key}"] span`)?.textContent ?? 'Sección';
    document.querySelector('#placeholder-title').textContent = label;
    sections.placeholder.hidden = false;
    return;
  }
  sections.perfil.hidden = false;
}

document.querySelectorAll('.nav-link[data-section]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.remove('active'));
    link.classList.add('active');
    showSection(link.dataset.section);
    closeSidebar();
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

window.addEventListener('auth:change', (event) => {
  companyAuthenticated = Boolean(event.detail?.user);
  Watchlists.setAuthenticated(companyAuthenticated);
  if (companyAuthenticated) Watchlists.refresh();
  Portfolio.setAuthenticated(companyAuthenticated);
  if (companyData && !document.querySelector('#section-datos').hidden) renderScreenerTables();
});

async function loadCompany() {
  companyLoading.hidden = false;
  companyError.hidden = true;
  companyBody.hidden = true;

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
    const urlParams = new URLSearchParams(window.location.search);
    const initialSec = urlParams.get('seccion') || urlParams.get('section') || window.location.hash.replace('#', '');
    if (initialSec && initialSec !== 'perfil') {
      document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === initialSec));
      showSection(initialSec);
    }
    const initialVmetric = urlParams.get('vmetric');
    if (initialVmetric) {
      valChartMetric = initialVmetric;
      document.querySelectorAll('.val-chart-metrics button').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.vmetric === initialVmetric);
      });
      if (typeof renderValuationChart === 'function') renderValuationChart();
    }
  } catch {
    companyError.textContent = 'No se pudo conectar con el servidor. Comprueba que esté en marcha.';
    companyError.hidden = false;
  } finally {
    companyLoading.hidden = true;
  }
}

if (!companyTicker) {
  companyLoading.hidden = true;
  companyError.textContent = 'No se ha indicado ninguna empresa. Usa el buscador para elegir una.';
  companyError.hidden = false;
} else {
  loadCompany();
}
