/**
 * @fileoverview Módulo extraído de portfolioChart.js.
 */

(function (window) {
  const PCS = window.PortfolioChartState;

  function renderChartMainSvg(panel) {
    if (!PCS.cachedData) return;
    const canvasInner = panel.querySelector('[data-pf-chart-canvas-inner]');
    const legend = panel.querySelector('[data-pf-chart-legend]');
    if (!canvasInner) return;

    const allPoints = PCS.cachedData.points ?? [];
    if (!allPoints.length) return;

    const points = allPoints.slice(PCS.sliceStart, PCS.sliceEnd + 1);
    if (!points.length) return;

    const values = points.flatMap((point) => point.series).filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number);
    if (!values.length) {
      canvasInner.innerHTML = '<div class="pf-chart-empty"><p>No hay cotizaciones para el rango seleccionado.</p></div>';
      return;
    }

    const isCenteredMetric = PCS.metric === 'gainPct' || PCS.metric === 'gainAmount';
    const { isFs, width, height, pad, innerWidth, innerHeight } = getActiveChartGeometry(panel);
    const { min, max, ticks } = computeChartScale(values, isCenteredMetric, PCS.metric);

    const x = (index) => pad.left + (index / Math.max(1, points.length - 1)) * innerWidth;
    const y = (value) => pad.top + (1 - (value - min) / (max - min)) * innerHeight;

    const seriesColors = PCS.cachedData.labels.map((label, idx) => label.color || CHART_PALETTE[idx % CHART_PALETTE.length]);

    const svgGradients = PCS.cachedData.labels.map((_, i) => `
      <linearGradient id="pf-chart-grad-${i}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${seriesColors[i]}" stop-opacity="0.20"/>
        <stop offset="100%" stop-color="${seriesColors[i]}" stop-opacity="0.00"/>
      </linearGradient>
    `).join('');

    const pathsSvg = PCS.cachedData.labels.map((label, seriesIdx) => {
      let d = '';
      let areaD = '';
      let inSeg = false;
      let lastValidIdx = 0;

      points.forEach((point, index) => {
        const val = point.series?.[seriesIdx];
        if (val !== null && val !== undefined && Number.isFinite(Number(val))) {
          const px = x(index).toFixed(1);
          const py = y(Number(val)).toFixed(1);
          if (!inSeg) {
            d += `${d ? ' ' : ''}M${px},${py}`;
            const baseY = y(Math.max(0, min)).toFixed(1);
            areaD += `${areaD ? ' ' : ''}M${px},${baseY} L${px},${py}`;
            inSeg = true;
          } else {
            d += ` L${px},${py}`;
            areaD += ` L${px},${py}`;
          }
          lastValidIdx = index;
        } else {
          if (inSeg) {
            const lastPx = x(lastValidIdx).toFixed(1);
            const baseY = y(Math.max(0, min)).toFixed(1);
            areaD += ` L${lastPx},${baseY} Z`;
            inSeg = false;
          }
        }
      });

      if (inSeg) {
        const lastPx = x(lastValidIdx).toFixed(1);
        const baseY = y(Math.max(0, min)).toFixed(1);
        areaD += ` L${lastPx},${baseY} Z`;
      }

      const color = seriesColors[seriesIdx];
      const isSingle = PCS.cachedData.labels.length === 1;
      const strokeW = isFs ? '2.8' : '2.2';
      const areaEl = isSingle && areaD ? `<path d="${areaD}" fill="url(#pf-chart-grad-${seriesIdx})" class="pf-chart-area" data-series-index="${seriesIdx}"/>` : '';
      const lineEl = d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round" class="pf-chart-line" data-series-index="${seriesIdx}"/>` : '';

      return `${areaEl}${lineEl}`;
    }).join('');

    const yLabelFontSize = isFs ? '11px' : '9.5px';
    const xLabelFontSize = isFs ? '11px' : '10px';

    const gridLines = ticks.map((value) => {
      const tickY = y(value);
      return `
        <line x1="${pad.left}" y1="${tickY.toFixed(1)}" x2="${width - pad.right}" y2="${tickY.toFixed(1)}" class="pf-chart-grid-line"/>
        <text x="${pad.left - 8}" y="${(tickY + 3.5).toFixed(1)}" class="pf-chart-y-label" font-size="${yLabelFontSize}" text-anchor="end">${escapeHtml(chartAxisFormat(value))}</text>`;
    }).join('');

    const zeroLine = (min <= 0 && max >= 0 && isCenteredMetric)
      ? `<line x1="${pad.left}" y1="${y(0).toFixed(1)}" x2="${width - pad.right}" y2="${y(0).toFixed(1)}" class="pf-chart-zero"/>`
      : '';

    const dateTicks = getTradingViewDateTicks(points, x, pad, width);

    const vGridLines = dateTicks.map((tick) => `
      <line x1="${tick.x.toFixed(1)}" y1="${pad.top}" x2="${tick.x.toFixed(1)}" y2="${height - pad.bottom}" class="pf-chart-vgrid-line"/>
      <line x1="${tick.x.toFixed(1)}" y1="${height - pad.bottom}" x2="${tick.x.toFixed(1)}" y2="${(height - pad.bottom + 4).toFixed(1)}" class="pf-chart-tick-mark"/>
      <text x="${tick.x.toFixed(1)}" y="${height - 8}" class="pf-chart-x-label ${tick.isMajor ? 'major' : ''}" font-size="${xLabelFontSize}" text-anchor="middle">${escapeHtml(tick.label)}</text>
    `).join('');

    const axisBaselines = `
      <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="pf-chart-axis-baseline"/>
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="pf-chart-axis-baseline"/>
    `;

    canvasInner.innerHTML = `
      <svg class="pf-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Evolución histórica">
        <defs>
          ${svgGradients}
        </defs>
        ${gridLines}
        ${vGridLines}
        ${axisBaselines}
        ${zeroLine}
        ${pathsSvg}
        <g class="pf-chart-compare-layer" style="display:none;">
          <rect class="pf-chart-compare-band" x="0" y="${pad.top}" width="0" height="${innerHeight}" fill="rgba(34, 197, 94, 0.13)"/>
          <line class="pf-chart-compare-v1" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}" stroke="rgba(255, 255, 255, 0.45)" stroke-width="1.2" stroke-dasharray="3 3"/>
          <line class="pf-chart-compare-v2" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}" stroke="rgba(255, 255, 255, 0.45)" stroke-width="1.2" stroke-dasharray="3 3"/>
          <line class="pf-chart-compare-baseline" x1="0" y1="0" x2="0" y2="0" stroke="rgba(255, 255, 255, 0.3)" stroke-width="1" stroke-dasharray="2 2"/>
          <g class="pf-chart-compare-conns"></g>
          <g class="pf-chart-compare-pts1"></g>
          <g class="pf-chart-compare-pts2"></g>
          <g class="pf-chart-compare-badge" transform="translate(0, 0)">
            <rect class="pf-chart-compare-badge-bg" x="-60" y="-13" width="120" height="26" rx="6" ry="6" fill="#18181b" fill-opacity="0.95" stroke="#16a34a" stroke-width="1.2"/>
            <text class="pf-chart-compare-badge-text" x="0" y="4" text-anchor="middle" fill="#16a34a" font-size="12" font-weight="700">--</text>
          </g>
        </g>
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
        <g class="pf-chart-hover-layer" style="display:none;">
          <line class="pf-chart-crosshair pf-chart-crosshair-v" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}"/>
          <line class="pf-chart-crosshair pf-chart-crosshair-h" x1="${pad.left}" y1="0" x2="${width - pad.right}" y2="0"/>
          <g class="pf-chart-hover-dots"></g>
          <g class="pf-chart-x-badge" transform="translate(0, ${height - pad.bottom})">
            <rect class="pf-chart-x-badge-bg" x="-42" y="2" width="84" height="20" rx="4" ry="4"/>
            <text class="pf-chart-x-badge-text" x="0" y="16" text-anchor="middle">--</text>
          </g>
          <g class="pf-chart-y-badge" transform="translate(4, 0)">
            <rect class="pf-chart-y-badge-bg" x="0" y="-10" width="${pad.left - 8}" height="20" rx="3"/>
            <path class="pf-chart-y-badge-arrow" d="M ${pad.left - 8},0 L ${pad.left - 3},-6 L ${pad.left - 3},6 Z" fill="#0f172a"/>
            <text class="pf-chart-y-badge-text" x="${(pad.left - 8) / 2}" y="0" text-anchor="middle">--</text>
          </g>
        </g>
        <rect class="pf-chart-overlay" x="${pad.left}" y="${pad.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent" cursor="crosshair"/>
      </svg>`;

    // Update legend chips
    if (legend) {
      legend.innerHTML = PCS.cachedData.labels.map((label, index) => {
        const color = seriesColors[index];
        let latestVal = null;
        for (let i = points.length - 1; i >= 0; i--) {
          const v = points[i]?.series?.[index];
          if (v !== null && v !== undefined && Number.isFinite(Number(v))) {
            latestVal = Number(v);
            break;
          }
        }
        const valClass = latestVal !== null ? (latestVal > 0 ? 'positive' : latestVal < 0 ? 'negative' : '') : '';
        return `
          <li class="pf-legend-chip" data-legend-series="${index}">
            <span class="pf-legend-dot" style="background:${color}"></span>
            <span class="pf-legend-name" title="${escapeHtml(label.label)}">${escapeHtml(label.label)}</span>
            ${latestVal !== null ? `<span class="pf-legend-val ${valClass}">${escapeHtml(chartFormat(latestVal))}</span>` : ''}
            <button type="button" class="pf-legend-remove" data-remove-id="${escapeHtml(label.id)}" title="Quitar ${escapeHtml(label.label)}" aria-label="Quitar">×</button>
          </li>`;
      }).join('');

      // Wire legend hover
      legend.querySelectorAll('.pf-legend-chip').forEach((chip) => {
        const sIdx = chip.dataset.legendSeries;
        chip.addEventListener('mouseenter', () => {
          canvasInner.querySelectorAll('.pf-chart-line, .pf-chart-area').forEach((line) => {
            if (line.dataset.seriesIndex === sIdx) {
              line.style.opacity = '1';
              line.style.strokeWidth = '3.2';
            } else {
              line.style.opacity = '0.18';
            }
          });
        });
        chip.addEventListener('mouseleave', () => {
          canvasInner.querySelectorAll('.pf-chart-line, .pf-chart-area').forEach((line) => {
            line.style.opacity = '1';
            line.style.strokeWidth = '2.2';
          });
        });
      });

      // Wire legend remove
      legend.querySelectorAll('.pf-legend-remove').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const removeId = btn.dataset.removeId;
          PCS.selectedIds = PCS.selectedIds.filter((id) => id !== removeId);
          if (PCS.selectedIdsCallback) PCS.selectedIdsCallback(PCS.selectedIds);
          syncPickerChecked(panel);
          loadPortfolioChart(panel);
        });
      });
    }
  }
window.renderChartMainSvg = renderChartMainSvg;

})(window);
