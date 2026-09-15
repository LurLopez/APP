/**
 * @fileoverview Módulo extraído de empresaValuationChart.js.
 */

(function (window) {

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

const VAL_CHART_METRICS = {
  evEbitda: { label: 'EV / EBITDA', format: 'multiple' },
  peRatio: { label: 'PER', format: 'multiple' },
  priceToFcf: { label: 'P / FCF', format: 'multiple' },
  dividendYield: { label: 'Yield del dividendo', format: 'ratio' },
  payoutRatio: { label: 'Payout del dividendo', format: 'ratio' },
  netDebtToEbitda: { label: 'Deuda Neta / EBITDA', format: 'multiple' },
};
window.VAL_CHART_METRICS = VAL_CHART_METRICS;
window.formatValChartAxis = formatValChartAxis;
window.formatValChartDate = formatValChartDate;
window.computeValuationScale = computeValuationScale;
window.setPeAdjusted = setPeAdjusted;
window.loadValuationChart = loadValuationChart;
window.updateValTimelineSliderUi = updateValTimelineSliderUi;
window.zoomValChartByStep = zoomValChartByStep;

})(window);
