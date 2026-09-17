/**
 * @fileoverview Interacciones de gráfico de cartera: Comparison.
 */

(function (window) {
  const PCS = window.PortfolioChartState;
  const PCIS = window.PortfolioChartInteractionState;

function wirePortfolioChartComparison(panel, canvasInner) {
    // ── Comparación estilo Cotización: clic derecho mantenido (inicio → fin) ──

    function getChartPointIndexFromClientX(clientX) {
      const svgEl = canvasInner.querySelector('.pf-chart-svg');
      if (!svgEl) return 0;
      const rect = svgEl.getBoundingClientRect();
      if (!rect.width) return 0;
      const points = PCS.cachedData.points.slice(PCS.sliceStart, PCS.sliceEnd + 1);
      if (!points.length) return 0;
      const { width, pad, innerWidth } = getActiveChartGeometry(panel);
      const curSvgX = ((clientX - rect.left) / rect.width) * width;
      const clampedX = Math.max(pad.left, Math.min(width - pad.right, curSvgX));
      const ratio = Math.max(0, Math.min(1, (clampedX - pad.left) / innerWidth));
      return Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
    }

    function updatePortfolioComparisonView(clientX, clientY) {
      if (!PCIS.isComparing || !PCS.cachedData?.points?.length) return;
      const points = PCS.cachedData.points.slice(PCS.sliceStart, PCS.sliceEnd + 1);
      if (!points.length) return;

      const svgEl = canvasInner.querySelector('.pf-chart-svg');
      const compareLayer = canvasInner.querySelector('.pf-chart-compare-layer');
      if (!svgEl || !compareLayer) return;

      const { width, height, pad, innerWidth, innerHeight } = getActiveChartGeometry(panel);
      const values = points.flatMap((p) => p.series).filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
      const isCenteredMetric = PCS.metric === 'gainPct' || PCS.metric === 'gainAmount' || PCS.metric === 'gainWithDividendsPct' || PCS.metric === 'gainWithDividendsAmount';
      const { min, max } = computeChartScale(values, isCenteredMetric, PCS.metric);

      const x = (idx) => pad.left + (idx / Math.max(1, points.length - 1)) * innerWidth;
      const y = (val) => pad.top + (1 - (val - min) / (max - min)) * innerHeight;
      const seriesColors = PCS.cachedData.labels.map((label, i) => label.color || CHART_PALETTE[i % CHART_PALETTE.length]);

      const idx1 = Math.max(0, Math.min(points.length - 1, PCIS.compareStartIdx ?? 0));
      const idx2 = Math.max(0, Math.min(points.length - 1, PCIS.compareCurrentIdx ?? idx1));
      const pt1 = points[idx1] || points[0];
      const pt2 = points[idx2] || points[points.length - 1];
      const x1 = x(idx1);
      const x2 = x(idx2);

      const rows = [];
      PCS.cachedData.labels.forEach((label, sIdx) => {
        const v1 = pt1.series?.[sIdx];
        const v2 = pt2.series?.[sIdx];
        if (v1 === null || v1 === undefined || v2 === null || v2 === undefined) return;
        if (!Number.isFinite(Number(v1)) || !Number.isFinite(Number(v2))) return;
        rows.push({
          sIdx,
          label: label.label,
          color: seriesColors[sIdx],
          val1: Number(v1),
          val2: Number(v2),
          y1: y(Number(v1)),
          y2: y(Number(v2)),
          delta: Number(v2) - Number(v1),
        });
      });

      if (!rows.length) {
        compareLayer.style.display = 'none';
        compareLayer.setAttribute('hidden', '');
        hideChartTooltip();
        return;
      }

      const globalDelta = rows.reduce((acc, r) => acc + r.delta, 0);
      const isPositive = globalDelta >= 0;
      const themeColor = isPositive ? '#16a34a' : '#dc2626';
      const bandFill = isPositive ? 'rgba(34, 197, 94, 0.13)' : 'rgba(239, 68, 68, 0.13)';

      const leftX = Math.min(x1, x2);
      const rightX = Math.max(x1, x2);
      const bandW = Math.max(1, rightX - leftX);

      const bandEl = compareLayer.querySelector('.pf-chart-compare-band');
      const v1El = compareLayer.querySelector('.pf-chart-compare-v1');
      const v2El = compareLayer.querySelector('.pf-chart-compare-v2');
      const baseEl = compareLayer.querySelector('.pf-chart-compare-baseline');
      const connsEl = compareLayer.querySelector('.pf-chart-compare-conns');
      const pts1El = compareLayer.querySelector('.pf-chart-compare-pts1');
      const pts2El = compareLayer.querySelector('.pf-chart-compare-pts2');
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
        v1El.setAttribute('x2', x1.toFixed(1));
      }
      if (v2El) {
        v2El.setAttribute('x1', x2.toFixed(1));
        v2El.setAttribute('x2', x2.toFixed(1));
      }
      if (baseEl) {
        if (rows.length === 1) {
          baseEl.style.display = 'inline';
          baseEl.setAttribute('x1', leftX.toFixed(1));
          baseEl.setAttribute('y1', rows[0].y1.toFixed(1));
          baseEl.setAttribute('x2', rightX.toFixed(1));
          baseEl.setAttribute('y2', rows[0].y1.toFixed(1));
        } else {
          baseEl.style.display = 'none';
        }
      }
      if (connsEl) {
        connsEl.innerHTML = rows.map((r) => `
          <line x1="${x1.toFixed(1)}" y1="${r.y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${r.y2.toFixed(1)}" stroke="${r.color}" stroke-width="1.8" stroke-dasharray="4 2"/>
        `).join('');
      }
      if (pts1El) {
        pts1El.innerHTML = rows.map((r) => `
          <circle cx="${x1.toFixed(1)}" cy="${r.y1.toFixed(1)}" r="8" fill="${r.color}" fill-opacity="0.22"/>
          <circle cx="${x1.toFixed(1)}" cy="${r.y1.toFixed(1)}" r="4" fill="${r.color}" stroke="#ffffff" stroke-width="1.8"/>
        `).join('');
      }
      if (pts2El) {
        pts2El.innerHTML = rows.map((r) => `
          <circle cx="${x2.toFixed(1)}" cy="${r.y2.toFixed(1)}" r="9" fill="${r.color}" fill-opacity="0.22"/>
          <circle cx="${x2.toFixed(1)}" cy="${r.y2.toFixed(1)}" r="4.5" fill="${r.color}" stroke="#ffffff" stroke-width="2"/>
        `).join('');
      }

      if (badge && badgeBg && badgeText) {
        const parts = rows.map((r) => {
          const arrow = r.delta > 0 ? '▲ ' : r.delta < 0 ? '▼ ' : '';
          return arrow + chartAxisFormat(r.delta);
        });
        const badgeW = Math.max(96, parts.join(' · ').length * 7 + 24);
        const midX = Math.max(pad.left + badgeW / 2 + 6, Math.min(width - pad.right - badgeW / 2 - 6, (x1 + x2) / 2));
        const topY = Math.min(...rows.map((r) => Math.min(r.y1, r.y2)));
        const bottomY = Math.max(...rows.map((r) => Math.max(r.y1, r.y2)));
        let badgeY = topY - 18;
        if (badgeY < pad.top + 16) {
          badgeY = bottomY + 24;
        }
        if (badgeY > height - pad.bottom - 14) {
          badgeY = pad.top + 20;
        }
        badge.setAttribute('transform', `translate(${midX.toFixed(1)}, ${badgeY.toFixed(1)})`);
        badgeBg.setAttribute('x', (-badgeW / 2).toFixed(1));
        badgeBg.setAttribute('width', badgeW.toFixed(1));
        badgeBg.setAttribute('stroke', themeColor);
        badgeText.innerHTML = rows.map((r, i) => {
          const color = r.delta > 0 ? '#22c55e' : r.delta < 0 ? '#ef4444' : '#e2e8f0';
          const arrow = r.delta > 0 ? '▲ ' : r.delta < 0 ? '▼ ' : '';
          const sep = i < rows.length - 1 ? '<tspan fill="#64748b"> · </tspan>' : '';
          return `<tspan fill="${color}">${escapeHtml(arrow + chartAxisFormat(r.delta))}</tspan>${sep}`;
        }).join('');
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
          ${rows.map((r) => {
            const deltaColor = r.delta > 0 ? '#22c55e' : r.delta < 0 ? '#ef4444' : '#e2e8f0';
            const arrow = r.delta > 0 ? '▲ ' : r.delta < 0 ? '▼ ' : '';
            return `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
              <span style="color: #94a3b8; display: flex; align-items: center; gap: 5px; min-width: 0;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${r.color}; flex-shrink: 0;"></span>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px;">${escapeHtml(r.label)}</span>
              </span>
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #cbd5e1; font-size: 11px;">${escapeHtml(chartFormat(r.val1))} → ${escapeHtml(chartFormat(r.val2))}</span>
                <strong style="color: ${deltaColor};">${escapeHtml(arrow + chartAxisFormat(r.delta))}</strong>
              </span>
            </div>`;
          }).join('')}
        </div>`;
      tip.hidden = false;
      if (clientX !== undefined && clientY !== undefined) {
        positionChartTooltip(tip, clientX, clientY);
      }
    }

    function startPortfolioComparison(event) {
      if (!PCS.cachedData?.points?.length) return;
      const points = PCS.cachedData.points.slice(PCS.sliceStart, PCS.sliceEnd + 1);
      if (!points.length) return;

      PCIS.isComparing = true;
      PCIS.compareStartIdx = getChartPointIndexFromClientX(event.clientX);
      PCIS.compareCurrentIdx = PCIS.compareStartIdx;

      canvasInner.classList.add('comparing');

      const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
      if (hoverLayer) {
        hoverLayer.style.display = 'none';
      }

      updatePortfolioComparisonView(event.clientX, event.clientY);

      window.addEventListener('pointermove', onPortfolioComparePointerMove);
      window.addEventListener('mousemove', onPortfolioComparePointerMove);
      window.addEventListener('pointerup', onPortfolioComparePointerUp);
      window.addEventListener('mouseup', onPortfolioComparePointerUp);
    }

    function onPortfolioComparePointerMove(event) {
      if (!PCIS.isComparing) return;
      if (event.buttons !== undefined && (event.buttons & 2) === 0 && event.buttons === 0) {
        onPortfolioComparePointerUp(event);
        return;
      }
      PCIS.compareCurrentIdx = getChartPointIndexFromClientX(event.clientX);
      updatePortfolioComparisonView(event.clientX, event.clientY);
    }

    function onPortfolioComparePointerUp(event) {
      if (!PCIS.isComparing) return;
      if (event && event.button !== undefined && event.button !== 2 && event.buttons !== 0 && (event.buttons & 2) !== 0) return;
      clearPortfolioComparison();
    }

    function clearPortfolioComparison() {
      PCIS.isComparing = false;
      canvasInner.classList.remove('comparing');

      window.removeEventListener('pointermove', onPortfolioComparePointerMove);
      window.removeEventListener('mousemove', onPortfolioComparePointerMove);
      window.removeEventListener('pointerup', onPortfolioComparePointerUp);
      window.removeEventListener('mouseup', onPortfolioComparePointerUp);

      const compareLayer = canvasInner.querySelector('.pf-chart-compare-layer');
      if (compareLayer) {
        compareLayer.style.display = 'none';
        compareLayer.setAttribute('hidden', '');
      }
      hideChartTooltip();
    }

  // Clic derecho mantenido -> comparación inicio/fin
  canvasInner.addEventListener('pointerdown', (event) => {
    if (event.button !== 2) return;
    if (!PCS.cachedData?.points?.length) return;
    const total = PCS.cachedData.points.length;
    if (total <= 1) return;
    event.preventDefault();
    event.stopPropagation();
    startPortfolioComparison(event);
  });
}
window.wirePortfolioChartComparison = wirePortfolioChartComparison;

})(window);
