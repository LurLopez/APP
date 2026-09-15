/**
 * @fileoverview Tooltip y hover del gráfico de métricas (extraído de empresaMetricsChart.js).
 */

(function (window) {
  const EMS = window.EmpresaMetricsState;


  function positionCagrLabel(geometry) {
    if (!geometry.el) return;
    geometry.el.style.left = `${geometry.x1 + geometry.t * (geometry.x2 - geometry.x1)}px`;
    geometry.el.style.top = `${geometry.y1 + geometry.t * (geometry.y2 - geometry.y1)}px`;
  }

  function attachCagrDrag(geometry) {
    const el = geometry.el;
    let dragging = false;
    el.addEventListener('pointerdown', (event) => {
      dragging = true;
      el.setPointerCapture(event.pointerId);
      el.classList.add('dragging');
      event.preventDefault();
    });
    el.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const bodyRect = document.querySelector('#metrics-chart-body').getBoundingClientRect();
      const x = event.clientX - bodyRect.left;
      geometry.t = Math.max(0, Math.min(1, (x - geometry.x1) / (geometry.x2 - geometry.x1)));
      positionCagrLabel(geometry);
    });
    const endDrag = () => {
      dragging = false;
      el.classList.remove('dragging');
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  }

  function hideMetricsChartTooltip() {
    const tooltip = document.querySelector('#metrics-chart-tooltip');
    if (tooltip) tooltip.hidden = true;
    const hover = document.querySelector('#metrics-hover');
    if (hover) hover.hidden = true;
  }

  function updateMetricsChartHover(event) {
    if (!EMS.metricsChartState || !EMS.metricsChartState.rows?.length) return;
    const svg = document.querySelector('#metrics-chart');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cursorX = ((event.clientX - rect.left) / rect.width) * EMS.metricsChartState.width;
    const cursorY = ((event.clientY - rect.top) / rect.height) * EMS.metricsChartState.height;
    const centers = EMS.metricsChartState.centers;
    let best = 0;
    let bestDistance = Infinity;
    centers.forEach((center, index) => {
      const distance = Math.abs(cursorX - center);
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    });

    const { rows, series, margin, height, width, rightScale, yLeft, yRight } = EMS.metricsChartState;
    const hover = svg.querySelector('#metrics-hover');
    const line = svg.querySelector('#metrics-hover-line');
    const dots = svg.querySelector('#metrics-hover-dots');
    if (hover) hover.hidden = false;
    const cx = centers[best];
    if (line) {
      line.setAttribute('x1', cx.toFixed(1));
      line.setAttribute('y1', margin.top.toFixed(1));
      line.setAttribute('x2', cx.toFixed(1));
      line.setAttribute('y2', (height - margin.bottom).toFixed(1));
    }

    let closestEntry = null;
    let closestDist = Infinity;
    const validPoints = [];

    series.forEach((entry) => {
      const value = Number(entry.points[best]?.value);
      if (!Number.isFinite(value)) return;
      const y = metricChartType(entry.metric) === 'bar' || !rightScale ? yLeft(value) : yRight(value);
      const item = { entry, value, y };
      validPoints.push(item);
      const d = Math.abs(cursorY - y);
      if (d < closestDist) {
        closestDist = d;
        closestEntry = item;
      }
    });

    if (dots) {
      dots.innerHTML = validPoints.map((item) => {
        const isClosest = closestEntry && item.entry === closestEntry.entry && validPoints.length > 1;
        const r = isClosest ? '5.5' : '4';
        const sw = isClosest ? '2.8' : '2';
        return `<circle cx="${cx.toFixed(1)}" cy="${item.y.toFixed(1)}" r="${r}" fill="#ffffff" class="metric-dot" style="stroke:${item.entry.color}; stroke-width:${sw};"/>`;
      }).join('');
    }

    const tooltip = document.querySelector('#metrics-chart-tooltip');
    if (tooltip) {
      const periodTitle = rows[best]?.label || rows[best]?.period || '';
      tooltip.innerHTML = `<strong>${escapeHtml(periodTitle)}</strong>${series.map((entry) => {
        const val = entry.points[best]?.value;
        const formatted = val !== null && Number.isFinite(Number(val)) ? formatChartAxis(val, entry.metric) : '—';
        const isClosest = closestEntry && entry === closestEntry.entry && validPoints.length > 1;
        return `
          <div class="metrics-chart-tooltip-row" style="${isClosest ? 'background: rgba(255,255,255,0.12); border-radius: 4px; padding: 2px 4px; font-weight: 700;' : ''}">
            <span class="metric-legend-dot" style="background:${entry.color}; ${isClosest ? 'transform: scale(1.3);' : ''}"></span>
            <span>${escapeHtml(entry.label)}</span>
            <b>${formatted}</b>
          </div>
        `;
      }).join('')}`;
      tooltip.hidden = false;
      const tipW = tooltip.offsetWidth || 180;
      const tipH = tooltip.offsetHeight || 120;
      let left = event.clientX + 16;
      let top = event.clientY - tipH / 2;
      if (left + tipW > window.innerWidth - 10) left = event.clientX - tipW - 16;
      if (top < 10) top = 10;
      if (top + tipH > window.innerHeight - 10) top = window.innerHeight - tipH - 10;
      tooltip.style.left = `${Math.max(10, left)}px`;
      tooltip.style.top = `${Math.max(10, top)}px`;
    }
  }

  function openMetricsPalette(swatch, seriesId) {
    EMS.chartPendingSeriesId = seriesId;
    const currentColor = seriesColorMap.get(seriesId) || swatch.style.background;
    const palette = document.querySelector('#metrics-palette');
    if (!palette) return;
    palette.innerHTML = METRICS_CHART_COLORS.map((color) => `
      <button type="button" class="metrics-palette-color${color === currentColor ? ' active' : ''}" style="background:${color}" data-color="${color}" aria-label="Usar el color ${color}"></button>`).join('');
    const blockRect = document.querySelector('#metrics-chart-block').getBoundingClientRect();
    const swatchRect = swatch.getBoundingClientRect();
    palette.style.left = `${swatchRect.left - blockRect.left}px`;
    palette.style.top = `${swatchRect.bottom - blockRect.top + 6}px`;
    palette.hidden = false;
  }

window.positionCagrLabel = positionCagrLabel;
window.attachCagrDrag = attachCagrDrag;
window.hideMetricsChartTooltip = hideMetricsChartTooltip;
window.updateMetricsChartHover = updateMetricsChartHover;
window.openMetricsPalette = openMetricsPalette;

})(window);
