/**
 * @fileoverview Módulo extraído de empresaPriceChart.js.
 */

(function (window) {

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
window.updateCompanyComparisonView = updateCompanyComparisonView;
window.startCompanyComparison = startCompanyComparison;
window.onCompanyComparePointerMove = onCompanyComparePointerMove;
window.onCompanyComparePointerUp = onCompanyComparePointerUp;
window.clearCompanyComparison = clearCompanyComparison;

})(window);
