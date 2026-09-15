/**
 * @fileoverview Módulo extraído de empresaPriceChart.js.
 */

(function (window) {

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
window.renderPriceChart = renderPriceChart;

})(window);
