/**
 * @fileoverview Interacciones de gráfico de cartera: Hover.
 */

(function (window) {
  const PCS = window.PortfolioChartState;
  const PCIS = window.PortfolioChartInteractionState;

function wirePortfolioChartHover(panel, canvasInner) {
    // Hover tooltip & crosshair (active when not dragging and not measuring)
    canvasInner.addEventListener('mousemove', (event) => {
      if (PCIS.isMeasuring || PCIS.isComparing) return;
      if (PCIS.isPanning && PCIS.panMoved) return;
      if (!PCS.cachedData?.points?.length) return;

      const allPoints = PCS.cachedData.points;
      const points = allPoints.slice(PCS.sliceStart, PCS.sliceEnd + 1);
      if (!points.length) return;

      const svgEl = canvasInner.querySelector('.pf-chart-svg');
      const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
      const crosshair = canvasInner.querySelector('.pf-chart-crosshair');
      const hoverDots = canvasInner.querySelector('.pf-chart-hover-dots');
      if (!svgEl || !hoverLayer || !crosshair || !hoverDots) return;

      const rect = svgEl.getBoundingClientRect();
      const { width, height, pad, innerWidth, innerHeight } = getActiveChartGeometry(panel);

      const rawSvgX = ((event.clientX - rect.left) / rect.width) * width;
      const rawSvgY = ((event.clientY - rect.top) / rect.height) * height;
      if (rawSvgX < pad.left - 20 || rawSvgX > width - pad.right + 20 || rawSvgY < pad.top - 30 || rawSvgY > height - pad.bottom + 30) {
        hoverLayer.style.display = 'none';
        hideChartTooltip();
        return;
      }

      const cursorSvgX = Math.max(pad.left, Math.min(width - pad.right, rawSvgX));
      const cursorSvgY = Math.max(pad.top, Math.min(height - pad.bottom, rawSvgY));

      const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));
      const index = Math.round(ratio * (points.length - 1));
      const point = points[index];
      if (!point) return;

      const values = points.flatMap((p) => p.series).filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
      const isCenteredMetric = PCS.metric === 'gainPct' || PCS.metric === 'gainAmount' || PCS.metric === 'gainWithDividendsPct' || PCS.metric === 'gainWithDividendsAmount';
      const { min, max } = computeChartScale(values, isCenteredMetric, PCS.metric);

      const x = (idx) => pad.left + (idx / Math.max(1, points.length - 1)) * innerWidth;
      const y = (val) => pad.top + (1 - (val - min) / (max - min)) * innerHeight;
      const seriesColors = PCS.cachedData.labels.map((label, idx) => label.color || CHART_PALETTE[idx % CHART_PALETTE.length]);

      const crosshairV = canvasInner.querySelector('.pf-chart-crosshair-v') || crosshair;
      const crosshairH = canvasInner.querySelector('.pf-chart-crosshair-h');
      const hoverXBadge = hoverLayer.querySelector('.pf-chart-x-badge');
      const hoverXBadgeBg = hoverLayer.querySelector('.pf-chart-x-badge-bg');
      const hoverXBadgeText = hoverLayer.querySelector('.pf-chart-x-badge-text');
      const hoverYBadge = hoverLayer.querySelector('.pf-chart-y-badge');
      const hoverYBadgeBg = hoverLayer.querySelector('.pf-chart-y-badge-bg');
      const hoverYBadgeText = hoverLayer.querySelector('.pf-chart-y-badge-text');

      const cx = x(index);
      const candidates = [];
      const tooltipRows = [];

      PCS.cachedData.labels.forEach((label, sIdx) => {
        const val = point.series?.[sIdx];
        const color = seriesColors[sIdx];
        if (val !== null && val !== undefined && Number.isFinite(Number(val))) {
          const sy = y(Number(val));
          candidates.push({
            sIdx,
            label: label.label,
            val: Number(val),
            color,
            y: sy,
          });
          tooltipRows.push({
            sIdx,
            label: label.label,
            val: Number(val),
            color,
          });
        }
      });

      if (!candidates.length) {
        hoverLayer.style.display = 'none';
        hideChartTooltip();
        return;
      }

      // Pick the series closest to the cursor Y
      let closest = candidates[0];
      if (candidates.length > 1) {
        let minDist = Math.abs(cursorSvgY - closest.y);
        for (let i = 1; i < candidates.length; i++) {
          const d = Math.abs(cursorSvgY - candidates[i].y);
          if (d < minDist) {
            minDist = d;
            closest = candidates[i];
          }
        }
      }

      const selectedPy = closest.y;
      const selectedVal = closest.val;
      const selectedColor = closest.color;

      hoverLayer.style.display = 'inline';
      crosshairV.setAttribute('x1', cx.toFixed(1));
      crosshairV.setAttribute('x2', cx.toFixed(1));
      if (crosshairH) {
        crosshairH.setAttribute('y1', selectedPy.toFixed(1));
        crosshairH.setAttribute('y2', selectedPy.toFixed(1));
      }

      if (hoverXBadge && hoverXBadgeBg && hoverXBadgeText) {
        const badgeText = formatTradingViewHoverDate(point.date);
        const badgeWidth = Math.max(76, badgeText.length * 7 + 16);
        const clampedX = Math.max(pad.left + badgeWidth / 2, Math.min(width - pad.right - badgeWidth / 2, cx));
        hoverXBadge.setAttribute('transform', `translate(${clampedX.toFixed(1)}, ${height - pad.bottom})`);
        hoverXBadgeBg.setAttribute('x', (-badgeWidth / 2).toFixed(1));
        hoverXBadgeBg.setAttribute('width', badgeWidth.toFixed(1));
        hoverXBadgeText.textContent = badgeText;
      }

      if (hoverYBadge && hoverYBadgeText) {
        const badgeText = chartAxisFormat(selectedVal);
        const badgeWidth = Math.max(pad.left - 8, badgeText.length * 7 + 14);
        const clampedY = Math.max(pad.top + 10, Math.min(height - pad.bottom - 10, selectedPy));
        const bx = Math.max(2, pad.left - badgeWidth - 6);
        hoverYBadge.setAttribute('transform', `translate(${bx.toFixed(1)}, ${clampedY.toFixed(1)})`);
        if (hoverYBadgeBg) {
          hoverYBadgeBg.setAttribute('width', badgeWidth.toFixed(1));
          hoverYBadgeBg.setAttribute('fill', selectedColor);
        }
        const arrowEl = hoverYBadge.querySelector('.pf-chart-y-badge-arrow');
        if (arrowEl) {
          arrowEl.setAttribute('d', `M ${badgeWidth.toFixed(1)},0 L ${(badgeWidth + 5).toFixed(1)},-6 L ${(badgeWidth + 5).toFixed(1)},6 Z`);
          arrowEl.setAttribute('fill', selectedColor);
        }
        hoverYBadgeText.setAttribute('x', (badgeWidth / 2).toFixed(1));
        hoverYBadgeText.textContent = badgeText;
      }

      // Render dots for every series at this date (closest to cursor highlighted)
      const dotsHtml = candidates.map((c) => {
        const isClosest = c === closest;
        const rHalo = isClosest ? 10 : 7;
        const rDot = isClosest ? 5 : 4;
        const dotStroke = isClosest ? '2.6' : '2';
        const haloOpacity = isClosest ? '0.25' : '0.14';
        return `
          <circle cx="${cx.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${rHalo}" fill="${c.color}" fill-opacity="${haloOpacity}" class="pf-chart-hover-dot-halo"/>
          <circle cx="${cx.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${rDot}" fill="#ffffff" stroke="${c.color}" stroke-width="${dotStroke}" class="pf-chart-dot"/>`;
      }).join('');
      hoverDots.innerHTML = dotsHtml;

      if (tooltipRows.length > 0) {
        const tip = ensureChartTooltip();
        const formattedDate = formatTradingViewHoverDate(point.date);
        tip.innerHTML = `
          <div class="pf-chart-tooltip-header">${escapeHtml(formattedDate)}</div>
          <div class="pf-chart-tooltip-rows">
            ${tooltipRows.map((r) => {
              const isClosest = r.sIdx === closest.sIdx && candidates.length > 1;
              return `
              <div class="pf-chart-tooltip-row" style="${isClosest ? 'background: rgba(255,255,255,0.12); border-radius: 4px; padding: 2px 4px; font-weight: 700;' : ''}">
                <span class="pf-chart-tooltip-dot" style="background:${r.color}; ${isClosest ? 'transform: scale(1.3);' : ''}"></span>
                <span class="pf-chart-tooltip-name">${escapeHtml(r.label)}</span>
                <span class="pf-chart-tooltip-val ${r.val > 0 ? 'positive' : r.val < 0 ? 'negative' : ''}">${escapeHtml(chartFormat(r.val))}</span>
              </div>`;
            }).join('')}
          </div>`;
        tip.hidden = false;
        positionChartTooltip(tip, event.clientX, event.clientY);
      }
    });

    canvasInner.addEventListener('mouseleave', () => {
      if (PCIS.isMeasuring || PCIS.isComparing) return;
      const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
      if (hoverLayer) hoverLayer.style.display = 'none';
      hideChartTooltip();
    });
}
window.wirePortfolioChartHover = wirePortfolioChartHover;

})(window);
