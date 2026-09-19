/**
 * @fileoverview Módulo extraído de empresaValuationChart.js.
 */

(function (window) {

function renderValuationChart() {
  const peAdjustToggleEl = document.querySelector('#val-chart-pe-adjust-toggle');
  if (peAdjustToggleEl) {
    peAdjustToggleEl.style.display = (valChartMetric === 'peRatio' || valChartMetric === 'payoutRatio') ? 'inline-flex' : 'none';
  }

  const timelineWrap = document.querySelector('#val-timeline-wrap');
  const zoomGroup = document.querySelector('#val-zoom-group');
  const measureBtn = document.querySelector('#val-measure-btn');
  const maControl = document.querySelector('#val-ma-control');

  if (valChartMetric === 'netDebtToEbitda') {
    if (timelineWrap) timelineWrap.hidden = true;
    if (zoomGroup) zoomGroup.style.display = 'none';
    if (measureBtn) measureBtn.style.display = 'none';
    if (maControl) maControl.style.display = 'none';
    renderAnnualNetDebtEbitdaChart();
    return;
  }
  if (timelineWrap) timelineWrap.hidden = false;
  if (zoomGroup) zoomGroup.style.display = '';
  if (measureBtn) measureBtn.style.display = '';
  if (maControl) maControl.style.display = '';

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

  const statValues = values.length ? values : [0];
  const currentVal = statValues[statValues.length - 1];
  const minVal = Math.min(...statValues);
  const maxVal = Math.max(...statValues);
  const avgVal = statValues.reduce((sum, v) => sum + v, 0) / statValues.length;

  // Medias móviles activas, calculadas sobre el histórico completo (incluye el buffer
  // previo al rango para que la línea tenga lookback completo desde el borde izquierdo).
  const maSeries = typeof window.ensureValMaLookup === 'function' ? window.ensureValMaLookup(effectiveKey) : {};
  const activeMAs = typeof window.getValActiveMaConfigs === 'function'
    ? window.getValActiveMaConfigs().filter((ma) => maSeries[ma.period]?.size)
    : [];
  const scaleValues = statValues.slice();
  activeMAs.forEach((ma) => {
    const series = maSeries[ma.period];
    points.forEach((point) => {
      const value = series.get(point.t);
      if (Number.isFinite(value) && (allowZero ? (allowNegative ? true : value >= 0) : value > 0)) scaleValues.push(value);
    });
  });

  const currentEl = document.querySelector('#val-stat-current');
  const avgEl = document.querySelector('#val-stat-avg');
  const minEl = document.querySelector('#val-stat-min');
  const maxEl = document.querySelector('#val-stat-max');
  if (currentEl) currentEl.textContent = formatValChartAxis(currentVal, metricKey);
  if (avgEl) avgEl.textContent = formatValChartAxis(avgVal, metricKey);
  if (minEl) minEl.textContent = formatValChartAxis(minVal, metricKey);
  if (maxEl) maxEl.textContent = formatValChartAxis(maxVal, metricKey);

  const { min, max, ticks } = computeValuationScale(scaleValues, allowNegative);

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
    <text x="${(width - pad.right - 8).toFixed(1)}" y="${(avgY - 5).toFixed(1)}" text-anchor="end" fill="#64748b" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10.5" font-weight="600">${(window.I18n && window.I18n.t && window.I18n.t('Media')) || 'Media'}: ${formatValChartAxis(avgVal, metricKey)}</text>
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

  // Líneas de medias móviles (mismo estilo discontinuo que el gráfico de cotización)
  let maPathsHtml = '';
  activeMAs.forEach((ma) => {
    const series = maSeries[ma.period];
    let maPath = '';
    let inSegment = false;
    points.forEach((point, index) => {
      const value = series.get(point.t);
      if (Number.isFinite(value)) {
        const px = x(index).toFixed(1);
        const py = y(value).toFixed(1);
        maPath += inSegment ? ` L${px},${py}` : `M${px},${py}`;
        inSegment = true;
      } else {
        inSegment = false;
      }
    });
    if (maPath) {
      maPathsHtml += `<path d="${maPath}" class="chart-ma" style="--ma-stroke: ${ma.color}; stroke: ${ma.color};"/>`;
    }
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
    ${maPathsHtml}
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
      <g class="pf-chart-hover-ma-dots"></g>
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

  valChartState = { isBarChart: false, points, metricKey, effectiveKey, allowNegative, allowZero, x, y, pad, height, width, scale: { min, max }, maSeries, activeMAs };
  updateValTimelineSliderUi();
}
window.renderValuationChart = renderValuationChart;

})(window);
