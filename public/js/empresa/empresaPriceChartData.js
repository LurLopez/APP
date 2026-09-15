/**
 * @fileoverview Módulo extraído de empresaPriceChart.js.
 */

(function (window) {

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
window.loadChart = loadChart;
window.updateTimelineSliderUi = updateTimelineSliderUi;
window.zoomChartByStep = zoomChartByStep;

})(window);
