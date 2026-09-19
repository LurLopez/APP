/**
 * @fileoverview Módulo extraído de empresaValuationChart.js.
 */

(function (window) {

function updateValuationChartHover(event) {
  if (isValMeasuring || isValComparing) return;
  if (isValPanning && valPanMoved) return;
  if (!valChartState || valChartState.isBarChart) return;
  const svg = document.querySelector('#val-chart');
  const valBlock = document.querySelector('#val-chart-block');
  const hoverLayer = svg?.querySelector('.pf-chart-hover-layer');
  const crosshairV = svg?.querySelector('.pf-chart-crosshair-v');
  const crosshairH = svg?.querySelector('.pf-chart-crosshair-h');
  const hoverDot = svg?.querySelector('.pf-chart-hover-dot');
  const hoverXBadge = svg?.querySelector('.pf-chart-x-badge');
  const hoverXBadgeText = svg?.querySelector('.pf-chart-x-badge-text');
  const hoverYBadge = svg?.querySelector('.pf-chart-y-badge');
  const hoverYBadgeBg = svg?.querySelector('.pf-chart-y-badge-bg');
  const hoverYBadgeText = svg?.querySelector('.pf-chart-y-badge-text');
  if (!svg || !hoverLayer || !crosshairV || !crosshairH || !hoverDot) return;

  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const { points, metricKey, effectiveKey, allowNegative, allowZero, x, y, pad, height, width } = valChartState;
  const keyToUse = effectiveKey || metricKey;

  const rawSvgX = ((event.clientX - rect.left) / rect.width) * width;
  const rawSvgY = ((event.clientY - rect.top) / rect.height) * height;

  if (rawSvgX < pad.left - 20 || rawSvgX > width - pad.right + 20 || rawSvgY < pad.top - 30 || rawSvgY > height - pad.bottom + 30) {
    hoverLayer.style.display = 'none';
    hideValuationChartTooltip();
    return;
  }

  const cursorSvgX = Math.max(pad.left, Math.min(width - pad.right, rawSvgX));
  const innerWidth = width - pad.left - pad.right;
  const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));
  const best = Math.round(ratio * (points.length - 1));
  const point = points[best];
  const value = Number(point?.[keyToUse]);
  if (!Number.isFinite(value) || (!allowZero && value <= 0)) {
    hoverLayer.style.display = 'none';
    hideValuationChartTooltip();
    return;
  }

  const cx = x(best);
  const cy = y(value);

  // Medias móviles activas en la sesión apuntada
  const maSeries = valChartState.maSeries || {};
  const activeMAs = valChartState.activeMAs || [];
  const matchedMAs = [];
  activeMAs.forEach((ma) => {
    const maValue = maSeries[ma.period]?.get(point.t);
    if (Number.isFinite(maValue)) {
      matchedMAs.push({
        id: `val-ma-${ma.period}`,
        label: `MA ${ma.period}`,
        period: ma.period,
        value: maValue,
        py: y(maValue),
        color: ma.color,
      });
    }
  });

  // Curva más cercana al cursor (métrica principal o una media móvil)
  const candidates = [{ id: 'metric', value, py: cy, color: 'var(--accent)' }, ...matchedMAs];
  let closest = candidates[0];
  if (candidates.length > 1) {
    let minDist = Math.abs(rawSvgY - closest.py);
    for (let i = 1; i < candidates.length; i += 1) {
      const dist = Math.abs(rawSvgY - candidates[i].py);
      if (dist < minDist) {
        minDist = dist;
        closest = candidates[i];
      }
    }
  }
  const selectedPy = closest.py;
  const selectedValue = closest.value;
  const selectedColor = closest.color;

  hoverLayer.removeAttribute('hidden');
  hoverLayer.style.display = 'inline';
  crosshairV.setAttribute('x1', cx.toFixed(1));
  crosshairV.setAttribute('x2', cx.toFixed(1));
  crosshairH.setAttribute('y1', selectedPy.toFixed(1));
  crosshairH.setAttribute('y2', selectedPy.toFixed(1));

  const dotWrap = svg.querySelector('.pf-chart-hover-dot-wrap');
  if (dotWrap) {
    dotWrap.setAttribute('transform', `translate(${cx.toFixed(1)}, ${cy.toFixed(1)})`);
  } else {
    hoverDot.setAttribute('cx', cx.toFixed(1));
    hoverDot.setAttribute('cy', cy.toFixed(1));
  }

  // Punto de cada media móvil sobre su propia curva
  const maDotsContainer = svg.querySelector('.pf-chart-hover-ma-dots');
  if (maDotsContainer) {
    maDotsContainer.innerHTML = matchedMAs.length
      ? matchedMAs.map((ma) => {
        const isClosest = closest.id === ma.id;
        return `
          ${isClosest ? `<circle cx="${cx.toFixed(1)}" cy="${ma.py.toFixed(1)}" r="7.5" fill="${ma.color}" fill-opacity="0.3"/>` : ''}
          <circle cx="${cx.toFixed(1)}" cy="${ma.py.toFixed(1)}" r="${isClosest ? '4.5' : '3.6'}" fill="${ma.color}" stroke="#ffffff" stroke-width="1.6" class="pf-chart-hover-ma-dot"/>
        `;
      }).join('')
      : '';
  }

  if (hoverXBadge && hoverXBadgeText) {
    hoverXBadge.setAttribute('transform', `translate(${cx.toFixed(1)}, ${height - pad.bottom})`);
    hoverXBadgeText.textContent = formatTradingViewHoverDate(point.date);
  }

  if (hoverYBadge && hoverYBadgeText) {
    const formatted = formatValChartAxis(selectedValue, metricKey);
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

  const tooltip = ensureChartTooltip();
  const metric = VAL_CHART_METRICS[metricKey] ?? VAL_CHART_METRICS.evEbitda;
  const label = (metricKey === 'peRatio')
    ? (valPeAdjusted ? 'PER (Ajustado)' : 'PER (Normal)')
    : (metricKey === 'payoutRatio'
      ? (valPeAdjusted ? 'Payout (Ajustado)' : 'Payout (Normal)')
      : metric.label);
  const isNetCash = metricKey === 'netDebtToEbitda' && value < 0;
  let extraInfo = '';
  if (metricKey === 'netDebtToEbitda') {
    if (Number.isFinite(Number(point?.netDebt))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">Deuda Neta: ${formatProfileCompactUsd(point.netDebt)}</span>`;
    if (Number.isFinite(Number(point?.ebitdaTtm))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">EBITDA (TTM): ${formatProfileCompactUsd(point.ebitdaTtm)}</span>`;
  } else if (metricKey === 'evEbitda') {
    if (Number.isFinite(Number(point?.enterpriseValue))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">EV: ${formatProfileCompactUsd(point.enterpriseValue)}</span>`;
    if (Number.isFinite(Number(point?.ebitdaTtm))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">EBITDA (TTM): ${formatProfileCompactUsd(point.ebitdaTtm)}</span>`;
  } else if (metricKey === 'peRatio') {
    const epsVal = valPeAdjusted ? point?.epsNormalizedTtm : point?.epsTtm;
    if (Number.isFinite(Number(epsVal))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">${window.I18n?.t?.(valPeAdjusted ? 'BPA ajustado' : 'BPA normal') ?? (valPeAdjusted ? 'BPA ajustado' : 'BPA normal')}: ${formatProfilePrice(epsVal)}</span>`;
  } else if (metricKey === 'priceToFcf') {
    if (Number.isFinite(Number(point?.fcfPerShareTtm))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">FCF / acción (TTM): ${formatProfilePrice(point.fcfPerShareTtm)}</span>`;
    else if (Number.isFinite(Number(point?.fcfTtm))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">FCF (TTM): ${formatProfileCompactUsd(point.fcfTtm)}</span>`;
  } else if (metricKey === 'payoutRatio') {
    if (Number.isFinite(Number(point?.dpsTtm))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">Dividendo / acción (TTM): ${formatProfilePrice(point.dpsTtm)}</span>`;
    const epsVal = valPeAdjusted ? point?.epsNormalizedTtm : point?.epsTtm;
    if (Number.isFinite(Number(epsVal))) extraInfo += `<span style="color:#cbd5e1;font-size:11px;">${window.I18n?.t?.(valPeAdjusted ? 'BPA ajustado' : 'BPA normal') ?? (valPeAdjusted ? 'BPA ajustado' : 'BPA normal')}: ${formatProfilePrice(epsVal)}</span>`;
  }
  const maHtml = matchedMAs.map((item) => {
    const isMaActive = closest.id === item.id;
    return `
      <div class="pf-chart-tooltip-row" style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 6px; ${isMaActive && candidates.length > 1 ? `background: ${item.color}25; border-radius: 4px; padding: 2px 6px;` : ''}">
        <span class="pf-chart-tooltip-dot" style="width: 7px; height: 7px; border-radius: 50%; background:${item.color}; display: inline-block; flex-shrink: 0;"></span>
        <span class="pf-chart-tooltip-label" style="color:${item.color}; ${isMaActive && candidates.length > 1 ? 'font-weight:700;' : ''}">${escapeHtml(item.label)}:</span>
        <strong class="pf-chart-tooltip-val" style="margin-left:auto; color:#ffffff;">${escapeHtml(formatValChartAxis(item.value, metricKey))}</strong>
      </div>`;
  }).join('');
  const isMetricActive = closest.id === 'metric';
  tooltip.innerHTML = `<strong>${escapeHtml(formatValChartDate(point?.date))}</strong>
    <span style="color:#94a3b8;font-size:11px;">${escapeHtml(label)}</span>
    <b style="font-size:15px;color:#fff;margin:2px 0;${isMetricActive && candidates.length > 1 ? 'background: rgba(79, 70, 229,0.15); border-radius: 4px; padding: 2px 4px;' : ''}">${escapeHtml(formatValChartAxis(value, metricKey))} ${isNetCash ? '<small style="color:#4ade80;font-size:11px;">(Caja Neta)</small>' : ''}</b>
    ${extraInfo}
    ${maHtml}
    <span style="color:#cbd5e1;font-size:11px;">Cotización: ${formatProfilePrice(point?.price)}</span>`;
  tooltip.hidden = false;
  positionChartTooltip(tooltip, event.clientX, event.clientY);

  if (Number.isFinite(Number(point?.price))) {
    setQuoteDisplay({
      price: Number(point.price),
      change: null,
      changePercent: null,
      dateText: `Sesión ${formatTradingViewHoverDate(point?.date)}`,
      isHover: true,
      maValue: null,
    });
  }

  const valQuoteBadge = document.querySelector('#val-chart-quote-badge');
  const valQuotePrice = document.querySelector('#val-chart-quote-price');
  const valQuoteMetric = document.querySelector('#val-chart-quote-metric');
  const valQuoteDate = document.querySelector('#val-chart-quote-date');
  if (valQuoteBadge) {
    valQuoteBadge.style.display = 'inline-flex';
    if (valQuotePrice) valQuotePrice.textContent = Number.isFinite(Number(point?.price)) ? `${formatProfileNumber(point.price)} $` : '—';
    if (valQuoteMetric) {
      const badgeLabel = closest.id === 'metric' ? label : closest.label;
      valQuoteMetric.textContent = `${badgeLabel}: ${formatValChartAxis(selectedValue, metricKey)}`;
    }
    if (valQuoteDate) valQuoteDate.textContent = `· ${formatTradingViewHoverDate(point?.date)}`;
  }
}

function hideValuationChartTooltip() {
  if (isValMeasuring || isValComparing) return;
  hideChartTooltip();
  const hover = document.querySelector('#val-chart .pf-chart-hover-layer');
  if (hover) hover.style.display = 'none';
  const maDots = document.querySelector('#val-chart .pf-chart-hover-ma-dots');
  if (maDots) maDots.innerHTML = '';
  const valQuoteBadge = document.querySelector('#val-chart-quote-badge');
  if (valQuoteBadge) valQuoteBadge.style.display = 'none';
  restoreQuoteDisplay();
}

function wireValChartHover(canvasInner) {
  // Mousemove for hover
  canvasInner.addEventListener('mousemove', updateValuationChartHover);
  canvasInner.addEventListener('mouseleave', hideValuationChartTooltip);
}
window.updateValuationChartHover = updateValuationChartHover;
window.hideValuationChartTooltip = hideValuationChartTooltip;
window.wireValChartHover = wireValChartHover;

})(window);
