/**
 * @fileoverview Núcleo de la página de empresa: estado, avisos y cotización (extraído de empresa.js).
 */

(function (window) {
  const toast = document.querySelector('#toast');
  const SAVED_TICKER_KEY = 'cifra_last_company';
  const MA_PALETTE = ['#3b82f6', '#8b5cf6', '#10b981', '#ec4899', '#06b6d4', '#eab308', '#4f46e5'];
  const MA_STORAGE_KEY = 'cifra_chart_ma_config_v1';
  const { formatProfileNumber, formatProfilePercent } = window.EmpresaFormatting || {};
  const { formatPriceValue } = window.EmpresaChartUtils || {};

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

function escapeHtml(value) {
  return window.HtmlUtils.escapeHtml(value);
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

window.getInitialCompanyTicker = getInitialCompanyTicker;
window.loadChartMaConfig = loadChartMaConfig;
window.saveChartMaConfig = saveChartMaConfig;
window.escapeHtml = escapeHtml;
window.showToast = showToast;
window.goToCompany = goToCompany;
window.setQuoteDisplay = setQuoteDisplay;
window.restoreQuoteDisplay = restoreQuoteDisplay;
window.wireQuoteSparklineHover = wireQuoteSparklineHover;
window.renderQuoteSparkline = renderQuoteSparkline;
window.renderCompanyLogo = renderCompanyLogo;
window.toast = toast;
window.SAVED_TICKER_KEY = SAVED_TICKER_KEY;
window.MA_PALETTE = MA_PALETTE;
window.MA_STORAGE_KEY = MA_STORAGE_KEY;

})(window);
