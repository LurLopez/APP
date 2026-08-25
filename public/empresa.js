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

let companyTicker = decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[1] ?? '').toUpperCase();
let companyData = null;
let companyAuthenticated = false;
let chartRange = '5y';
let chartPoints = [];
let chartMaPoints = [];
let chartShowMA = false;
let chartScale = null;

let screenerSeries = 'annual';
let screenerStatement = 'income';
let screenerPrecision = 2;
let screenerHideEmpty = false;
let screenerYearMin = null;
let screenerYearMax = null;
let screenerFilings = null;
let screenerFilingsLoading = false;

const SECTION_PLACEHOLDERS = ['alertas', 'valoracion', 'accionariado'];

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
  document.querySelector('#pf-pe').textContent = metrics.peRatio === null || metrics.peRatio === undefined ? '—' : formatProfileNumber(metrics.peRatio);
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
}

/* ── Gráfico de cotización ──────────────────────────────────── */

async function loadChart(range) {
  chartRange = range;
  const chartMessage = document.querySelector('#chart-message');
  chartMessage.hidden = true;
  try {
    const response = await fetch(`/api/screener/company/${encodeURIComponent(companyTicker)}/chart?range=${encodeURIComponent(range)}&ma=1`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.points) || !data.points.length) {
      chartMessage.textContent = data.error || 'No se pudo cargar el gráfico de cotización.';
      chartMessage.hidden = false;
      chartPoints = [];
      chartMaPoints = [];
      renderPriceChart();
      return;
    }
    chartPoints = data.points;
    chartMaPoints = Array.isArray(data.maPoints) ? data.maPoints : [];
    renderPriceChart();
  } catch {
    chartMessage.textContent = 'No se pudo conectar con el servidor para cargar el gráfico.';
    chartMessage.hidden = false;
    chartPoints = [];
    chartMaPoints = [];
    renderPriceChart();
  }
}

function computeMovingAverage(points, window) {
  if (points.length < window) return [];
  const result = [];
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    sum += points[index].v;
    if (index >= window) sum -= points[index - window].v;
    if (index >= window - 1) result.push({ t: points[index].t, v: sum / window });
  }
  return result;
}

function hideChartTooltip() {
  const tooltip = document.querySelector('#chart-tooltip');
  if (tooltip) tooltip.hidden = true;
}

function renderPriceChart() {
  const svg = document.querySelector('#price-chart');
  const wrap = document.querySelector('#chart-body');
  const chartBlock = document.querySelector('.chart-block');
  const isFullscreen = document.fullscreenElement === chartBlock;
  const width = Math.max(320, wrap.clientWidth || 720);
  const height = isFullscreen ? Math.max(300, wrap.clientHeight || 300) : 300;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  if (!chartPoints.length) {
    svg.innerHTML = '';
    chartScale = null;
    hideChartTooltip();
    return;
  }

  const margin = { top: 12, right: 64, bottom: 26, left: 6 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const values = chartPoints.map((point) => point.v);
  if (chartShowMA && chartMaPoints.length) values.push(...chartMaPoints.map((point) => point.v));
  const times = chartPoints.map((point) => point.t);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const timeSpread = maxTime - minTime || 1;

  const x = (time) => margin.left + ((time - minTime) / timeSpread) * innerWidth;
  const y = (value) => margin.top + innerHeight - ((value - min) / spread) * innerHeight;

  const linePath = chartPoints
    .map((point, index) => `${index ? 'L' : 'M'}${x(point.t).toFixed(1)} ${y(point.v).toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L${(margin.left + innerWidth).toFixed(1)} ${margin.top + innerHeight} L${margin.left} ${margin.top + innerHeight} Z`;

  const yTicks = [0, 1, 2, 3].map((step) => min + (spread * step) / 3);
  const yLabels = yTicks.map((value) => `
    <text x="${width - margin.right + 8}" y="${y(value) + 3}" class="chart-label">${Math.round(value)}</text>
    <line x1="${margin.left}" y1="${y(value)}" x2="${margin.left + innerWidth}" y2="${y(value)}" class="chart-grid"/>
  `).join('');

  const years = [...new Set(times.map((time) => new Date(time * 1000).getUTCFullYear()))];
  const yearStep = Math.max(1, Math.ceil(years.length / 6));
  const xLabels = years
    .filter((_, index) => index % yearStep === 0)
    .map((year) => {
      const firstOfYear = times.find((time) => new Date(time * 1000).getUTCFullYear() === year);
      return `<text x="${x(firstOfYear).toFixed(1)}" y="${height - 8}" class="chart-label chart-label-x">${year}</text>`;
    }).join('');

  const last = chartPoints[chartPoints.length - 1];
  const lastY = y(last.v);

  chartScale = { x, y, width, height, margin, minTime, timeSpread };

  const maPoints = chartShowMA ? chartMaPoints : [];
  const maPath = maPoints.length > 1
    ? maPoints.map((point, index) => `${index ? 'L' : 'M'}${x(point.t).toFixed(1)} ${y(point.v).toFixed(1)}`).join(' ')
    : '';

  svg.innerHTML = `
    ${yLabels}
    <path d="${areaPath}" class="chart-area"/>
    <path d="${linePath}" class="chart-line"/>
    ${maPath ? `<path d="${maPath}" class="chart-ma"/>` : ''}
    ${xLabels}
    <rect x="${width - margin.right + 4}" y="${lastY - 9}" width="${margin.right - 8}" height="18" rx="3" class="chart-tag"/>
    <text x="${width - margin.right + 8}" y="${lastY + 4}" class="chart-tag-text">${formatProfileNumber(last.v, 1)}</text>
    <g id="chart-hover" hidden>
      <line id="chart-hover-line" x1="0" y1="0" x2="0" y2="0" class="chart-crosshair"/>
      <circle id="chart-hover-dot" cx="0" cy="0" r="3.5" class="chart-dot"/>
    </g>
  `;
  hideChartTooltip();
}

function updateChartHover(event) {
  if (!chartScale || !chartPoints.length) return;
  const svg = document.querySelector('#price-chart');
  const rect = svg.getBoundingClientRect();
  const { x, y, width, height, margin, minTime, timeSpread } = chartScale;
  const cursorX = ((event.clientX - rect.left) / rect.width) * width;
  const cursorTime = minTime + ((cursorX - margin.left) / (width - margin.left - margin.right)) * timeSpread;

  let bestIndex = 0;
  let bestDistance = Infinity;
  chartPoints.forEach((point, index) => {
    const distance = Math.abs(point.t - cursorTime);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  const point = chartPoints[bestIndex];
  const px = x(point.t);
  const py = y(point.v);

  const hover = svg.querySelector('#chart-hover');
  const line = svg.querySelector('#chart-hover-line');
  const dot = svg.querySelector('#chart-hover-dot');
  hover.hidden = false;
  line.setAttribute('x1', px.toFixed(1));
  line.setAttribute('y1', margin.top.toFixed(1));
  line.setAttribute('x2', px.toFixed(1));
  line.setAttribute('y2', (height - margin.bottom).toFixed(1));
  dot.setAttribute('cx', px.toFixed(1));
  dot.setAttribute('cy', py.toFixed(1));

  const tooltip = document.querySelector('#chart-tooltip');
  const date = new Date(point.t * 1000).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  tooltip.innerHTML = `<strong>${formatProfileNumber(point.v, 2)} $</strong><span>${date}</span>`;
  tooltip.hidden = false;
  const flip = px + 160 > width;
  tooltip.style.left = `${flip ? px - 160 : px + 12}px`;
  tooltip.style.top = `${py + 12}px`;
}

document.querySelector('#price-chart').addEventListener('mousemove', updateChartHover);
document.querySelector('#price-chart').addEventListener('mouseleave', hideChartTooltip);

document.querySelector('#chart-ma-toggle').addEventListener('click', (event) => {
  chartShowMA = !chartShowMA;
  event.currentTarget.classList.toggle('active', chartShowMA);
  event.currentTarget.setAttribute('aria-pressed', String(chartShowMA));
  renderPriceChart();
});

function toggleFullscreen(element) {
  if (document.fullscreenElement === element) {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    return;
  }
  if (!element.requestFullscreen) {
    showToast('Pantalla completa no disponible en este navegador.');
    return;
  }
  element.requestFullscreen().catch(() => showToast('No se pudo activar la pantalla completa.'));
}

const chartBlock = document.querySelector('.chart-block');
document.querySelector('#chart-fullscreen').addEventListener('click', () => {
  toggleFullscreen(chartBlock);
});

const quotePanel = document.querySelector('.company-quote');
function openChartFullscreen() {
  document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === 'perfil'));
  showSection('perfil');
  toggleFullscreen(chartBlock);
}
quotePanel.addEventListener('click', openChartFullscreen);
quotePanel.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openChartFullscreen();
  }
});

document.addEventListener('fullscreenchange', () => {
  renderPriceChart();
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderPriceChart, 150);
});

document.querySelectorAll('.chart-ranges button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.chart-ranges button').forEach((item) => item.classList.toggle('active', item === button));
    loadChart(button.dataset.range);
  });
});

/* ── Datos financieros (tablas) ─────────────────────────────── */

function derivedScreenerValue(item, row, rowIndex, rows) {
  if (item.kind !== 'change' && item.kind !== 'margin' && item.kind !== 'ratio') return row.values?.[item.key];
  if (item.kind === 'ratio') {
    const numerator = Number(row.values?.[item.numeratorKey]);
    const denominator = Number(row.values?.[item.denominatorKey]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
    return ((item.absoluteNumerator ? Math.abs(numerator) : numerator) / denominator) * 100;
  }
  const value = row.values?.[item.baseKey];
  if (item.kind === 'margin') {
    const revenue = row.values?.revenue;
    return revenue ? (Number(value) / Number(revenue)) * 100 : null;
  }
  const previousIndex = screenerSeries === 'quarterly' ? rowIndex - 4 : rowIndex - 1;
  const previous = rows[previousIndex]?.values?.[item.baseKey];
  return previous ? ((Number(value) / Number(previous)) - 1) * 100 : null;
}

function formatScreenerValue(value, format, kind) {
  if (kind === 'change' || kind === 'margin' || kind === 'ratio') return formatPercentage(value);
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
  return item.tone === 'negative' || number < 0;
}

function rowYear(row) {
  const match = String(row?.period ?? '').match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function screenerVisibleIndexes(rows) {
  const years = rows.map(rowYear).filter((year) => year !== null);
  if (!years.length) return rows.map((_, index) => index);
  const min = screenerYearMin ?? Math.min(...years);
  const max = screenerYearMax ?? Math.max(...years);
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
  table.querySelector('tbody').innerHTML = items.map((item) => {
    if (item.kind === 'section') return `<tr class="section-row"><td class="sticky-col" colspan="${colspan}">${escapeHtml(item.label)}</td></tr>`;
    if (item.kind === 'note') return `<tr class="note-row"><td class="sticky-col" colspan="${colspan}">${escapeHtml(item.label)}</td></tr>`;
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
      chartMetrics.has(item.key) ? 'chart-selected' : '',
    ].filter(Boolean).join(' ');
    const dot = chartMetrics.has(item.key) ? `<span class="metric-chart-dot" style="background:${chartMetrics.get(item.key).color}"></span>` : '';
    return `<tr${rowClass ? ` class="${rowClass}"` : ''} data-metric="${escapeHtml(item.label)}" data-chart-key="${escapeHtml(item.key)}"><td class="sticky-col">${dot}${escapeHtml(item.label)}</td>${cells.join('')}</tr>`;
  }).join('');
  table.querySelectorAll('tbody tr[data-chart-key]').forEach((row) => {
    const item = items.find((candidate) => candidate.key === row.dataset.chartKey);
    row.addEventListener('click', () => toggleChartMetric(item));
  });
}

function renderScreenerTables() {
  if (!companyData) return;
  const rows = [...(companyData[screenerSeries] ?? [])].reverse();
  const visibleIndexes = screenerVisibleIndexes(rows);
  syncScreenerRange();
  const statements = companyData.statements ?? {};
  const title = document.querySelector('#screener-table-title');
  const statementNames = { income: 'Cuenta de resultados', balance: 'Balance de situación', cashflow: 'Estado de Flujo de Efectivo' };
  title.textContent = `${statementNames[screenerStatement] ?? 'Estado financiero'} | Cifra`;
  const range = document.querySelector('#screener-period-range');
  range.textContent = visibleIndexes.length
    ? `Datos financieros de ${periodDateLabel(rows[visibleIndexes[visibleIndexes.length - 1]])} a ${periodDateLabel(rows[visibleIndexes[0]])}`
    : 'Sin periodos visibles';
  const items = statements[screenerStatement] ?? [];
  const visibleItems = screenerHideEmpty
    ? items.filter((item) => item.kind || rows.some((row, rowIndex) => {
      const value = derivedScreenerValue(item, row, rowIndex, rows);
      return value !== null && value !== undefined;
    }))
    : items;
  renderStatementTable(rows, visibleIndexes, visibleItems);
  renderMetricsChart();
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
  if (screenerYearMin === null) screenerYearMin = low;
  if (screenerYearMax === null) screenerYearMax = high;
  minInput.value = screenerYearMin;
  maxInput.value = screenerYearMax;
  document.querySelector('#screener-range-values').textContent = `${screenerYearMin} – ${screenerYearMax}`;
  const pctMin = ((screenerYearMin - low) / (high - low)) * 100;
  const pctMax = ((screenerYearMax - low) / (high - low)) * 100;
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

document.querySelector('[data-table-action="empty"]').addEventListener('click', (event) => {
  screenerHideEmpty = !screenerHideEmpty;
  event.currentTarget.classList.toggle('active');
  renderScreenerTables();
});

/* ── Gráfico de métricas (datos financieros) ────────────────── */

const METRICS_CHART_COLORS = [
  '#ff9900', '#3a7bd5', '#2e9e5b', '#d64545',
  '#7b5cd6', '#009aa6', '#e06fb0', '#d96a2b',
  '#6c3483', '#2874a6', '#1e8449', '#c0392b',
  '#8a8a3a', '#5f6b7a', '#d4ac0d', '#34495e',
];
const chartMetrics = new Map();
const metricsChartNumFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
let chartPendingColorKey = null;
let metricsChartState = null;

function metricChartType(metric) {
  if (metric.kind === 'change' || metric.kind === 'margin' || metric.kind === 'ratio' || metric.format === 'perShare') return 'line';
  return 'bar';
}

function toggleChartMetric(item) {
  if (!item) return;
  if (chartMetrics.has(item.key)) {
    chartMetrics.delete(item.key);
  } else {
    const used = [...chartMetrics.values()].map((metric) => metric.color);
    const color = METRICS_CHART_COLORS.find((candidate) => !used.includes(candidate))
      ?? `hsl(${(chartMetrics.size * 47) % 360} 70% 45%)`;
    chartMetrics.set(item.key, { ...item, color });
  }
  syncChartRowSelection();
  renderMetricsChart();
}

function removeChartMetric(key) {
  chartMetrics.delete(key);
  syncChartRowSelection();
  renderMetricsChart();
}

function syncChartRowSelection() {
  document.querySelectorAll('#screener-statement-table tbody tr[data-chart-key]').forEach((row) => {
    const metric = chartMetrics.get(row.dataset.chartKey);
    row.classList.toggle('chart-selected', Boolean(metric));
    const dot = row.querySelector('td:first-child .metric-chart-dot');
    if (dot) dot.style.background = metric ? metric.color : '';
  });
}

function metricsChartRows() {
  return [...(companyData?.[screenerSeries] ?? [])].reverse();
}

function chartMetricSeries(metric) {
  const rows = metricsChartRows();
  const indexes = screenerVisibleIndexes(rows);
  return indexes.map((rowIndex) => {
    const row = rows[rowIndex];
    return {
      label: periodDateLabel(row),
      short: chartPeriodShort(row),
      year: rowYear(row),
      value: isLockedPeriod(rowIndex, rows) ? null : derivedScreenerValue(metric, row, rowIndex, rows),
    };
  });
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
  if (metric.kind === 'change' || metric.kind === 'margin' || metric.kind === 'ratio') return `${metricsChartNumFormat.format(number)} %`;
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

  if (!chartMetrics.size) {
    block.hidden = true;
    svg.innerHTML = '';
    return;
  }
  block.hidden = false;
  clearButton.hidden = false;

  const metrics = [...chartMetrics.values()];
  const allRows = metricsChartRows();
  const rows = screenerVisibleIndexes(allRows).map((index) => allRows[index]);
  const width = Math.max(320, wrap.clientWidth || 720);
  const height = 300;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const barSeries = metrics.filter((metric) => metricChartType(metric) === 'bar');
  const lineSeries = metrics.filter((metric) => metricChartType(metric) === 'line');
  const series = metrics.map((metric) => ({ metric, points: chartMetricSeries(metric) }));

  legend.innerHTML = metrics.map((metric) => `
    <span class="metrics-legend-item">
      <button type="button" class="metrics-swatch" data-color-key="${escapeHtml(metric.key)}" aria-label="Cambiar el color de ${escapeHtml(metric.label)}" style="background:${metric.color}"></button>
      <span class="metrics-legend-label" title="${escapeHtml(metric.label)}">${escapeHtml(metric.label)}</span>
      <span class="metrics-legend-type">${metricChartType(metric) === 'bar' ? 'barras' : 'puntos'}</span>
      <button type="button" class="metrics-legend-remove" data-remove-key="${escapeHtml(metric.key)}" aria-label="Quitar ${escapeHtml(metric.label)} del gráfico">×</button>
    </span>`).join('');

  const barScale = barSeries.length ? metricScale(series.filter((entry) => metricChartType(entry.metric) === 'bar').map((entry) => entry.points), true) : null;
  const lineScale = lineSeries.length ? metricScale(series.filter((entry) => metricChartType(entry.metric) === 'line').map((entry) => entry.points), false) : null;
  const leftScale = barScale ?? lineScale;
  const rightScale = barScale && lineScale ? lineScale : null;

  const margin = { top: 14, right: rightScale ? 64 : 12, bottom: 26, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const slotWidth = rows.length ? innerWidth / rows.length : innerWidth;
  const centers = rows.map((_, index) => margin.left + slotWidth * (index + 0.5));
  const yLeft = metricY(leftScale, margin, innerHeight);
  const yRight = metricY(rightScale ?? leftScale, margin, innerHeight);

  const xLabelStep = Math.max(1, Math.ceil(rows.length / 8));
  const xLabels = rows.map((row, index) => (index % xLabelStep === 0
    ? `<text x="${centers[index].toFixed(1)}" y="${height - 8}" class="chart-label chart-label-x">${escapeHtml(chartPeriodShort(row))}</text>`
    : '')).join('');

  const leftTicks = [0, 1, 2, 3].map((step) => leftScale.min + ((leftScale.max - leftScale.min) * step) / 3);
  const rightTicks = rightScale ? [0, 1, 2, 3].map((step) => rightScale.min + ((rightScale.max - rightScale.min) * step) / 3) : [];
  const leftAxis = leftTicks.map((value) => `
    <text x="${margin.left - 8}" y="${yLeft(value) + 3}" class="chart-label" text-anchor="end">${formatChartAxis(value, barSeries[0] ?? lineSeries[0])}</text>
    <line x1="${margin.left}" y1="${yLeft(value)}" x2="${width - margin.right}" y2="${yLeft(value)}" class="chart-grid"/>
  `).join('');
  const rightAxis = rightTicks.map((value) => `
    <text x="${width - margin.right + 8}" y="${yRight(value) + 3}" class="chart-label" text-anchor="start">${formatChartAxis(value, lineSeries[0])}</text>
  `).join('');

  let barsSvg = '';
  if (barScale) {
    const groupWidth = slotWidth * 0.7;
    const barWidth = Math.max(2, groupWidth / barSeries.length);
    const baseY = yLeft(Math.max(0, barScale.min));
    barSeries.forEach((metric, j) => {
      const points = series.find((entry) => entry.metric.key === metric.key).points;
      points.forEach((point, index) => {
        const value = Number(point.value);
        if (!Number.isFinite(value)) return;
        const x0 = centers[index] - groupWidth / 2 + j * barWidth;
        const yTop = yLeft(value);
        barsSvg += `<rect x="${x0.toFixed(1)}" y="${Math.min(yTop, baseY).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, Math.abs(yTop - baseY)).toFixed(1)}" rx="1.5" class="metric-bar" style="fill:${metric.color}"/>`;
      });
    });
  }

  let linesSvg = '';
  if (lineScale) {
    const lineY = rightScale ? yRight : yLeft;
    lineSeries.forEach((metric) => {
      const points = series.find((entry) => entry.metric.key === metric.key).points;
      let d = '';
      points.forEach((point, index) => {
        const value = Number(point.value);
        if (!Number.isFinite(value)) return;
        const x = centers[index];
        const y = lineY(value);
        d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      });
      if (d) linesSvg += `<path d="${d}" class="metric-line" style="stroke:${metric.color}"/>`;
      points.forEach((point, index) => {
        const value = Number(point.value);
        if (!Number.isFinite(value)) return;
        linesSvg += `<circle cx="${centers[index].toFixed(1)}" cy="${lineY(value).toFixed(1)}" r="3.5" class="metric-dot" style="stroke:${metric.color}"/>`;
      });
    });
  }

  const body = document.querySelector('#metrics-chart-body');
  body.querySelectorAll('.metric-cagr-label').forEach((el) => el.remove());

  let cagrLinesSvg = '';
  const cagrLabels = [];
  series.forEach((entry) => {
    const y = metricChartType(entry.metric) === 'bar' || !rightScale ? yLeft : yRight;
    let first = null;
    let last = null;
    entry.points.forEach((point, index) => {
      const value = Number(point.value);
      if (!Number.isFinite(value)) return;
      if (first === null) first = { index, value, year: point.year };
      last = { index, value, year: point.year };
    });
    if (!first || !last || first.index === last.index) return;
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
  });

  svg.innerHTML = `${leftAxis}${rightAxis}${barsSvg}${linesSvg}${cagrLinesSvg}${xLabels}
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

  metricsChartState = { rows, series, centers, margin, height, width, rightScale, yLeft, yRight };
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
  document.querySelector('#metrics-chart-tooltip').hidden = true;
  const hover = document.querySelector('#metrics-hover');
  if (hover) hover.hidden = true;
}

function updateMetricsChartHover(event) {
  if (!metricsChartState) return;
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
  hover.hidden = false;
  const cx = centers[best];
  line.setAttribute('x1', cx.toFixed(1));
  line.setAttribute('y1', margin.top.toFixed(1));
  line.setAttribute('x2', cx.toFixed(1));
  line.setAttribute('y2', (height - margin.bottom).toFixed(1));
  dots.innerHTML = series.map((entry) => {
    const value = Number(entry.points[best]?.value);
    if (!Number.isFinite(value)) return '';
    const y = metricChartType(entry.metric) === 'bar' || !rightScale ? yLeft(value) : yRight(value);
    return `<circle cx="${cx.toFixed(1)}" cy="${y.toFixed(1)}" r="4" class="metric-dot" style="stroke:${entry.metric.color}"/>`;
  }).join('');

  const tooltip = document.querySelector('#metrics-chart-tooltip');
  tooltip.innerHTML = `<strong>${escapeHtml(rows[best]?.period ?? '')}</strong>${series.map((entry) => `
    <div class="metrics-chart-tooltip-row">
      <span class="metric-legend-dot" style="background:${entry.metric.color}"></span>
      <span>${escapeHtml(entry.metric.label)}</span>
      <b>${formatChartAxis(entry.points[best]?.value, entry.metric)}</b>
    </div>`).join('')}`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth;
  const flip = cx + tooltipWidth + 16 > width;
  tooltip.style.left = `${flip ? cx - tooltipWidth - 14 : cx + 14}px`;
  tooltip.style.top = `${Math.max(4, margin.top)}px`;
}

document.querySelector('#metrics-chart').addEventListener('mousemove', updateMetricsChartHover);
document.querySelector('#metrics-chart').addEventListener('mouseleave', hideMetricsChartTooltip);

document.querySelector('#metrics-chart-legend').addEventListener('click', (event) => {
  const swatch = event.target.closest('.metrics-swatch');
  if (swatch) {
    const metric = chartMetrics.get(swatch.dataset.colorKey);
    if (!metric) return;
    const palette = document.querySelector('#metrics-palette');
    if (!palette.hidden && chartPendingColorKey === metric.key) {
      palette.hidden = true;
      chartPendingColorKey = null;
      return;
    }
    openMetricsPalette(swatch, metric);
    return;
  }
  const remove = event.target.closest('.metrics-legend-remove');
  if (remove) removeChartMetric(remove.dataset.removeKey);
});

function openMetricsPalette(swatch, metric) {
  chartPendingColorKey = metric.key;
  const palette = document.querySelector('#metrics-palette');
  palette.innerHTML = METRICS_CHART_COLORS.map((color) => `
    <button type="button" class="metrics-palette-color${color === metric.color ? ' active' : ''}" style="background:${color}" data-color="${color}" aria-label="Usar el color ${color}"></button>`).join('');
  const blockRect = document.querySelector('#metrics-chart-block').getBoundingClientRect();
  const swatchRect = swatch.getBoundingClientRect();
  palette.style.left = `${swatchRect.left - blockRect.left}px`;
  palette.style.top = `${swatchRect.bottom - blockRect.top + 6}px`;
  palette.hidden = false;
}

document.querySelector('#metrics-palette').addEventListener('click', (event) => {
  const colorButton = event.target.closest('.metrics-palette-color');
  if (!colorButton) return;
  const metric = chartPendingColorKey ? chartMetrics.get(chartPendingColorKey) : null;
  chartPendingColorKey = null;
  document.querySelector('#metrics-palette').hidden = true;
  if (!metric) return;
  metric.color = colorButton.dataset.color;
  syncChartRowSelection();
  renderMetricsChart();
});

document.addEventListener('click', (event) => {
  const palette = document.querySelector('#metrics-palette');
  if (palette.hidden) return;
  if (event.target.closest('#metrics-palette') || event.target.closest('.metrics-swatch')) return;
  palette.hidden = true;
  chartPendingColorKey = null;
});

document.querySelector('#metrics-chart-clear').addEventListener('click', () => {
  chartMetrics.clear();
  syncChartRowSelection();
  renderMetricsChart();
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
      window.location.href = `/?${params.toString()}`;
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

/* ── Secciones del menú lateral ─────────────────────────────── */

function showSection(key) {
  const sections = {
    perfil: document.querySelector('#section-perfil'),
    favoritos: document.querySelector('#section-favoritos'),
    cartera: document.querySelector('#section-cartera'),
    informes: document.querySelector('#section-informes'),
    datos: document.querySelector('#section-datos'),
    placeholder: document.querySelector('#section-placeholder'),
  };

  Object.values(sections).forEach((section) => { section.hidden = true; });

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
document.querySelector('#company-alert').addEventListener('click', () => showToast('Las alertas de precio estarán disponibles próximamente.'));
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

    searchResults.innerHTML = matches.map((company) => `
      <button class="search-result" type="button" data-ticker="${escapeHtml(company.ticker)}">
        <img class="search-result-logo" src="https://companiesmarketcap.com/img/company-logos/64/${escapeHtml(company.ticker)}.webp" alt="" loading="lazy" data-letter="${escapeHtml((company.name || company.ticker || '?').slice(0, 1).toUpperCase())}">
        <span>${escapeHtml(company.name)}</span><strong>${escapeHtml(company.ticker)}</strong>
      </button>
    `).join('');
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
