/**
 * @fileoverview Interacción de hover del gráfico de cotización (extraído de empresaPriceChart.js).
 */

(function (window) {

function wirePriceChartHover(canvasInner, chartBlock) {
  // Hover crosshair & tooltip
  canvasInner.addEventListener('mousemove', (event) => {
    if (isMeasuring || isComparing) return;
    if (isPanning && panMoved) return;
    if (!chartPoints.length) return;

    const points = chartPoints.slice(chartSliceStart, chartSliceEnd + 1);
    if (!points.length) return;

    const svgEl = document.querySelector('#price-chart');
    const hoverLayer = svgEl?.querySelector('.pf-chart-hover-layer');
    const crosshairV = svgEl?.querySelector('.pf-chart-crosshair-v');
    const crosshairH = svgEl?.querySelector('.pf-chart-crosshair-h');
    const hoverDot = svgEl?.querySelector('.pf-chart-hover-dot');
    const hoverXBadge = svgEl?.querySelector('.pf-chart-x-badge');
    const hoverXBadgeText = svgEl?.querySelector('.pf-chart-x-badge-text');
    const hoverYBadge = svgEl?.querySelector('.pf-chart-y-badge');
    const hoverYBadgeBg = svgEl?.querySelector('.pf-chart-y-badge-bg');
    const hoverYBadgeText = svgEl?.querySelector('.pf-chart-y-badge-text');
    if (!svgEl || !hoverLayer || !crosshairV || !crosshairH || !hoverDot) return;

    const rect = svgEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const geom = priceChartRenderState || getCompanyChartGeometry(chartBlock);
    const { width, height, pad, innerWidth, innerHeight } = geom;

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

    const px = x(index);
    const pyPrice = y(point.v);

    // Build candidate curves (Price, and each active MA)
    const candidates = [
      {
        id: 'price',
        label: companyTicker || 'Precio',
        value: point.v,
        py: pyPrice,
        color: '#4f46e5',
      }
    ];

    const matchedMAs = [];
    if (activeMAs.length) {
      activeMAs.forEach((ma) => {
        const maPts = chartMovingAveragesData[ma.period] || [];
        let matchedMa = null;
        if (chartPoints.length === maPts.length && chartPoints[0]?.t === maPts[0]?.t) {
          matchedMa = maPts[chartSliceStart + index];
        } else {
          const candleWindow = points.length > 1
            ? Math.max(86400, Math.abs(points[1].t - points[0].t) * 0.9)
            : 86400;
          let bestDiff = Infinity;
          for (let i = 0; i < maPts.length; i++) {
            const diff = Math.abs(maPts[i].t - point.t);
            if (diff < bestDiff && diff <= candleWindow) {
              bestDiff = diff;
              matchedMa = maPts[i];
            }
          }
        }
        if (matchedMa && Number.isFinite(matchedMa.v)) {
          const item = {
            id: `ma-${ma.period}`,
            label: `MA ${ma.period}`,
            period: ma.period,
            value: matchedMa.v,
            py: y(matchedMa.v),
            color: ma.color,
          };
          candidates.push(item);
          matchedMAs.push(item);
        }
      });
    }

    // Pick the curve closest to the cursor's Y
    let closest = candidates[0];
    if (candidates.length > 1) {
      let minDist = Math.abs(cursorSvgY - closest.py);
      for (let i = 1; i < candidates.length; i++) {
        const d = Math.abs(cursorSvgY - candidates[i].py);
        if (d < minDist) {
          minDist = d;
          closest = candidates[i];
        }
      }
    }

    const selectedPy = closest.py;
    const selectedValue = closest.value;
    const selectedColor = closest.color;

    hoverLayer.removeAttribute('hidden');
    hoverLayer.style.display = 'inline';
    crosshairV.setAttribute('x1', px.toFixed(1));
    crosshairV.setAttribute('x2', px.toFixed(1));
    crosshairH.setAttribute('y1', selectedPy.toFixed(1));
    crosshairH.setAttribute('y2', selectedPy.toFixed(1));

    // 1. Puntito en la cotización: SIEMPRE en (px, pyPrice) sobre la línea de cotización (estilo Google Finance)
    const dotWrap = svgEl.querySelector('.pf-chart-hover-dot-wrap');
    if (dotWrap) {
      dotWrap.setAttribute('transform', `translate(${px.toFixed(1)}, ${pyPrice.toFixed(1)})`);
      dotWrap.style.display = 'inline';
      if (hoverDot) {
        hoverDot.setAttribute('stroke', '#ffffff');
        hoverDot.setAttribute('fill', '#4f46e5');
      }
    }

    // 2. Puntitos en las medias móviles activas en esa sesión: cada una en su curva (px, pyMA)
    const maDotsContainer = svgEl.querySelector('.pf-chart-hover-ma-dots');
    if (maDotsContainer) {
      if (matchedMAs.length) {
        maDotsContainer.innerHTML = matchedMAs.map((ma) => {
          const isClosest = closest.id === ma.id;
          return `
            ${isClosest ? `<circle cx="${px.toFixed(1)}" cy="${ma.py.toFixed(1)}" r="7.5" fill="${ma.color}" fill-opacity="0.3"/>` : ''}
            <circle cx="${px.toFixed(1)}" cy="${ma.py.toFixed(1)}" r="${isClosest ? '4.5' : '3.6'}" fill="${ma.color}" stroke="#ffffff" stroke-width="1.6" class="pf-chart-hover-ma-dot"/>
          `;
        }).join('');
      } else {
        maDotsContainer.innerHTML = '';
      }
    }

    if (hoverXBadge && hoverXBadgeText) {
      hoverXBadge.setAttribute('transform', `translate(${px.toFixed(1)}, ${height - pad.bottom})`);
      hoverXBadgeText.textContent = formatTradingViewHoverDate(point.date);
    }

    if (hoverYBadge && hoverYBadgeText) {
      const formatted = formatPriceValue(selectedValue);
      const badgeW = Math.max(pad.right - 8, formatted.length * 7 + 14);
      const clampedY = Math.max(pad.top + 10, Math.min(height - pad.bottom - 10, selectedPy));
      const bx = width - pad.right + 6;
      hoverYBadge.setAttribute('transform', `translate(${bx.toFixed(1)}, ${clampedY.toFixed(1)})`);
      if (hoverYBadgeBg) {
        hoverYBadgeBg.setAttribute('width', badgeW.toFixed(1));
        hoverYBadgeBg.setAttribute('fill', selectedColor);
      }
      const arrowEl = hoverYBadge.querySelector('.pf-chart-y-badge-arrow');
      if (arrowEl) arrowEl.setAttribute('fill', selectedColor);
      hoverYBadgeText.setAttribute('x', (badgeW / 2).toFixed(1));
      hoverYBadgeText.textContent = formatted;
      hoverYBadge.hidden = false;
      hoverYBadge.style.display = 'inline';
    }

    // Matching MA points if enabled
    let maHtml = '';
    if (matchedMAs.length) {
      maHtml = matchedMAs.map((item) => {
        const isMaActive = closest.id === item.id;
        return `
          <div class="pf-chart-tooltip-row" style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 6px; ${isMaActive && candidates.length > 1 ? `background: ${item.color}25; border-radius: 4px; padding: 2px 6px;` : ''}">
            <span class="pf-chart-tooltip-dot" style="width: 7px; height: 7px; border-radius: 50%; background:${item.color}; display: inline-block; flex-shrink: 0;"></span>
            <span class="pf-chart-tooltip-label" style="color:${item.color}; ${isMaActive && candidates.length > 1 ? 'font-weight:700;' : ''}">${escapeHtml(item.label)}:</span>
            <strong class="pf-chart-tooltip-val" style="margin-left:auto; color:#ffffff;">${escapeHtml(formatPriceValue(item.value))}</strong>
          </div>`;
      }).join('');
    }

    const prevPoint = index > 0 ? points[index - 1] : null;
    let diff = 0;
    let diffPct = 0;
    if (prevPoint && Number.isFinite(prevPoint.v) && prevPoint.v > 0) {
      diff = point.v - prevPoint.v;
      diffPct = (diff / prevPoint.v) * 100;
    }
    const chgClass = diff > 0 ? 'positive' : (diff < 0 ? 'negative' : '');
    const changeHtml = prevPoint ? `<span style="font-size:11px; margin-left:6px;" class="${chgClass}">(${formatSignedPct(diffPct)})</span>` : '';
    const liveDateStr = formatTradingViewHoverDate(point.date);

    // Actualizar dinámicamente la cotización en tiempo real
    const closestMa = closest.id.startsWith('ma-') ? closest : (matchedMAs[0] || null);
    setQuoteDisplay({
      price: point.v,
      change: diff,
      changePercent: diffPct,
      dateText: liveDateStr,
      isHover: true,
      maValue: closestMa ? closestMa.value : null,
      maLabel: closestMa ? closestMa.label : null,
      maColor: closestMa ? closestMa.color : null,
    });

    const isPriceActive = closest.id === 'price';
    const tip = ensureChartTooltip();
    tip.innerHTML = `
      <div class="pf-chart-tooltip-head" style="margin-bottom: 4px;">
        <span class="pf-chart-tooltip-title">${escapeHtml(companyTicker)} · Cotización</span>
        <span class="pf-chart-tooltip-date" style="display:block; color:#94a3b8; font-size:10px;">${escapeHtml(formatTradingViewHoverDate(point.date))}</span>
      </div>
      <div style="font-size: 14px; font-weight: 700; color: #ffffff; display: flex; align-items: baseline; ${isPriceActive && candidates.length > 1 ? 'background: rgba(79, 70, 229,0.15); border-radius: 4px; padding: 2px 4px;' : ''}">
        ${escapeHtml(formatPriceValue(point.v))}
        ${changeHtml}
      </div>
      ${maHtml}
    `;
    tip.hidden = false;
    positionChartTooltip(tip, event.clientX, event.clientY);
  });

  canvasInner.addEventListener('mouseleave', () => {
    if (isMeasuring || isComparing) return;
    const hoverLayer = document.querySelector('#price-chart .pf-chart-hover-layer');
    if (hoverLayer) {
      hoverLayer.style.display = 'none';
    }
    const maDotsContainer = document.querySelector('#price-chart .pf-chart-hover-ma-dots');
    if (maDotsContainer) maDotsContainer.innerHTML = '';
    restoreQuoteDisplay();
    hideChartTooltip();
  });

  // Restaurar cotización al salir del gráfico
  canvasInner.addEventListener('mouseleave', () => {
    if (isMeasuring || isComparing) return;
    const hoverLayer = document.querySelector('#price-chart .pf-chart-hover-layer');
    if (hoverLayer) hoverLayer.style.display = 'none';
    const maDots = document.querySelector('#price-chart .pf-chart-hover-ma-dots');
    if (maDots) maDots.innerHTML = '';
    restoreQuoteDisplay();
    hideChartTooltip();
  });
}
window.wirePriceChartHover = wirePriceChartHover;

})(window);
