/**
 * @fileoverview Interacciones de gráfico de cartera: Measure.
 */

(function (window) {
  const PCS = window.PortfolioChartState;
  const PCIS = window.PortfolioChartInteractionState;

function wirePortfolioChartMeasure(panel, canvasInner) {
    const measureBtn = panel.querySelector('[data-pf-chart-measure]');
    if (measureBtn) {
      measureBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        PCIS.isMeasureToolActive = !PCIS.isMeasureToolActive;
        measureBtn.classList.toggle('active', PCIS.isMeasureToolActive);
        measureBtn.setAttribute('aria-pressed', PCIS.isMeasureToolActive ? 'true' : 'false');
        canvasInner.classList.toggle('measuring-active', PCIS.isMeasureToolActive);
      });
    }


    function updateMeasurementView(clientX, clientY) {
      if (!PCIS.isMeasuring || !PCS.cachedData?.points?.length) return;

      const allPoints = PCS.cachedData.points;
      const points = allPoints.slice(PCS.sliceStart, PCS.sliceEnd + 1);
      if (!points.length) return;

      const svgEl = canvasInner.querySelector('.pf-chart-svg');
      const measureLayer = canvasInner.querySelector('.pf-chart-measure-layer');
      if (!svgEl || !measureLayer) return;

      const rect = svgEl.getBoundingClientRect();
      const { width, height, pad, innerWidth, innerHeight } = getActiveChartGeometry(panel);

      if (clientX !== undefined && clientY !== undefined && rect.width > 0 && rect.height > 0) {
        const curX = ((clientX - rect.left) / rect.width) * width;
        const curY = ((clientY - rect.top) / rect.height) * height;
        PCIS.measureCurrentSvgX = Math.max(pad.left, Math.min(width - pad.right, curX));
        PCIS.measureCurrentSvgY = Math.max(pad.top, Math.min(height - pad.bottom, curY));
      }

      const values = points.flatMap((p) => p.series).filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
      const isCenteredMetric = PCS.metric === 'gainPct' || PCS.metric === 'gainAmount' || PCS.metric === 'gainWithDividendsPct' || PCS.metric === 'gainWithDividendsAmount';
      const { min, max } = computeChartScale(values, isCenteredMetric, PCS.metric);

      const x1 = PCIS.measureStartSvgX;
      const y1 = PCIS.measureStartSvgY;
      const x2 = PCIS.measureCurrentSvgX;
      const y2 = PCIS.measureCurrentSvgY;

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

      // Update measure box & diagonal line (single clean rectangle, discreet styling)
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
        let badgeStr = '';
        if (PCS.metric === 'gainPct' || PCS.metric === 'gainWithDividendsPct') {
          badgeStr = `${fmtSignedPct(deltaVal)} · ${diffDays}d`;
        } else if (PCS.metric === 'gainAmount' || PCS.metric === 'gainWithDividendsAmount' || PCS.metric === 'portfolioValue') {
          badgeStr = `${fmtSigned(deltaVal)} · ${diffDays}d`;
        } else {
          badgeStr = `${fmtSignedPct(deltaVal)} · ${diffDays}d`;
        }

        const badgeW = Math.max(86, badgeStr.length * 7 + 18);
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
      let deltaFormatted = '';
      if (PCS.metric === 'gainPct' || PCS.metric === 'gainWithDividendsPct') deltaFormatted = fmtSignedPct(deltaVal);
      else if (PCS.metric === 'gainAmount' || PCS.metric === 'gainWithDividendsAmount' || PCS.metric === 'portfolioValue') deltaFormatted = fmtSigned(deltaVal);
      else deltaFormatted = fmtSignedPct(deltaVal);

      tip.innerHTML = `
        <div class="pf-measure-tooltip-head">
          <div class="pf-measure-badge-tag negative">📏 Medición de rango</div>
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
              <strong class="pf-measure-diff">${escapeHtml(chartAxisFormat(val1))}</strong>
            </div>
          </div>
          <div class="pf-measure-row">
            <div class="pf-measure-row-left">
              <span class="pf-chart-tooltip-dot" style="background:#ef4444"></span>
              <span class="pf-measure-name">Nivel actual</span>
            </div>
            <div class="pf-measure-row-right">
              <strong class="pf-measure-diff">${escapeHtml(chartAxisFormat(val2))}</strong>
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

    function onMeasurePointerMove(event) {
      if (!PCIS.isMeasuring) return;
      if (event.buttons === 0) {
        onMeasurePointerUp(event);
        return;
      }
      updateMeasurementView(event.clientX, event.clientY);
    }

    function onMeasurePointerUp(event) {
      if (!PCIS.isMeasuring) return;
      if (event && event.button !== undefined && event.button !== PCIS.measureStartButton && event.button !== 0 && event.button !== 2 && event.buttons !== 0) return;
      PCIS.isMeasuring = false;
      canvasInner.classList.remove('measuring');
      window.removeEventListener('pointermove', onMeasurePointerMove);
      window.removeEventListener('mousemove', onMeasurePointerMove);
      window.removeEventListener('pointerup', onMeasurePointerUp);
      window.removeEventListener('mouseup', onMeasurePointerUp);

      const measureLayer = canvasInner.querySelector('.pf-chart-measure-layer');
      if (measureLayer) {
        measureLayer.style.display = 'none';
        measureLayer.setAttribute('hidden', '');
      }
      const hoverLayerAfterMeasure = canvasInner.querySelector('.pf-chart-hover-layer');
      if (hoverLayerAfterMeasure) {
        hoverLayerAfterMeasure.style.display = 'none';
      }
      hideChartTooltip();
    }

  // Pulsación para iniciar la medición (shift + clic o herramienta activa)
  canvasInner.addEventListener('pointerdown', (event) => {
    if (!PCS.cachedData?.points?.length) return;
    const total = PCS.cachedData.points.length;
    if (total <= 1) return;
    const isShiftLeftClick = event.button === 0 && event.shiftKey;
    const isToolActiveClick = event.button === 0 && PCIS.isMeasureToolActive;
    if (!(isShiftLeftClick || isToolActiveClick)) return;
event.preventDefault();
        event.stopPropagation();
        if (event.button === 0) {
          try { event.target.setPointerCapture(event.pointerId); } catch {}
        }

        const allPoints = PCS.cachedData.points;
        const points = allPoints.slice(PCS.sliceStart, PCS.sliceEnd + 1);
        if (!points.length) return;

        const svgEl = canvasInner.querySelector('.pf-chart-svg');
        if (!svgEl) return;
        const rect = svgEl.getBoundingClientRect();
        const { width, height, pad } = getActiveChartGeometry(panel);

        const curX = ((event.clientX - rect.left) / rect.width) * width;
        const curY = ((event.clientY - rect.top) / rect.height) * height;
        const startX = Math.max(pad.left, Math.min(width - pad.right, curX));
        const startY = Math.max(pad.top, Math.min(height - pad.bottom, curY));

        PCIS.isMeasuring = true;
        PCIS.measureStartButton = event.button;
        PCIS.measureStartSvgX = startX;
        PCIS.measureStartSvgY = startY;
        PCIS.measureCurrentSvgX = startX;
        PCIS.measureCurrentSvgY = startY;
        canvasInner.classList.add('measuring');

        const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
        if (hoverLayer) {
          hoverLayer.style.display = 'none';
        }

        updateMeasurementView(event.clientX, event.clientY);

        window.addEventListener('pointermove', onMeasurePointerMove);
        window.addEventListener('mousemove', onMeasurePointerMove);
        window.addEventListener('pointerup', onMeasurePointerUp);
        window.addEventListener('mouseup', onMeasurePointerUp);
        return;
  });
}
window.wirePortfolioChartMeasure = wirePortfolioChartMeasure;

})(window);
