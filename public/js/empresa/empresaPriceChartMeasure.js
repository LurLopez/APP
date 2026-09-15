/**
 * @fileoverview Módulo extraído de empresaPriceChart.js.
 */

(function (window) {

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
window.updateCompanyMeasurementView = updateCompanyMeasurementView;
window.onCompanyMeasurePointerMove = onCompanyMeasurePointerMove;
window.onCompanyMeasurePointerUp = onCompanyMeasurePointerUp;
window.getCompanyChartPointIndex = getCompanyChartPointIndex;

})(window);
