/**
 * @fileoverview Render principal del gráfico de métricas (extraído de empresaMetricsChart.js).
 */

(function (window) {
  const EMS = window.EmpresaMetricsState;

  const EYE_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function renderMetricsChart() {
    const setup = setupMetricsChartBlock();
    if (!setup) return;
    const { block, svg, wrap, legend, allCompanies } = setup;

    const companyRowsMap = new Map();
    const periodOrderMap = new Map();
    const periodMetaMap = new Map();
    const screenerSeries = window.screenerSeries || 'annual';
    const currentTicker = getActiveCompanyTicker();

    allCompanies.forEach((comp) => {
      const rawRows = [...(comp.data?.[screenerSeries] ?? [])].reverse();
      companyRowsMap.set(comp.ticker, rawRows);
      rawRows.forEach((r, idx) => {
        if (!r?.period) return;
        if (!periodOrderMap.has(r.period)) {
          let rank = 0;
          if (/^\d{4}$/.test(r.period)) {
            rank = Number(r.period) * 10;
          } else if (r.period.includes('-Q')) {
            const [y, q] = r.period.split('-Q');
            rank = Number(y) * 10 + Number(q);
          } else {
            rank = idx;
          }
          periodOrderMap.set(r.period, rank);
          periodMetaMap.set(r.period, r);
        } else if (r.periodEnd && !periodMetaMap.get(r.period)?.periodEnd) {
          periodMetaMap.set(r.period, r);
        }
      });
    });

    const baseRows = companyRowsMap.get(currentTicker) || [];
    const baseYears = baseRows.map((r) => window.rowYear ? window.rowYear(r) : null).filter((y) => y !== null);
    const low = baseYears.length ? Math.min(...baseYears) : 2016;
    const high = baseYears.length ? Math.max(...baseYears) : 2026;
    const minYear = window.screenerYearMin ?? Math.max(low, high - 9);
    const maxYear = window.screenerYearMax ?? high;

    const sortedPeriods = [...periodOrderMap.keys()]
      .filter((p) => {
        const match = String(p).match(/^(\d{4})/);
        if (!match) return true;
        const y = Number(match[1]);
        return y >= minYear && y <= maxYear;
      })
      .sort((a, b) => (periodOrderMap.get(a) ?? 0) - (periodOrderMap.get(b) ?? 0));

    const timeline = sortedPeriods.map((p) => {
      const meta = periodMetaMap.get(p) || { period: p };
      return {
        period: p,
        meta,
        label: window.periodDateLabel ? window.periodDateLabel(meta) : p,
        short: chartPeriodShort(meta),
        year: window.rowYear ? window.rowYear(meta) : null,
      };
    });

    const isFullscreen = block.classList.contains('is-fullscreen') || document.fullscreenElement === block;
    const width = Math.max(320, wrap.clientWidth || 720);
    const height = isFullscreen
      ? Math.max(320, Math.round(wrap.clientHeight || window.innerHeight - 160))
      : 300;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const metrics = [...chartMetrics.values()];
    const allSeries = [];
    let colorIndexHint = 0;

    metrics.forEach((metric) => {
      allCompanies.forEach((comp) => {
        const seriesId = `${metric.key}__${comp.ticker}`;
        const color = getSeriesColor(seriesId, colorIndexHint++);
        const isMulti = allCompanies.length > 1;
        const label = isMulti ? `${comp.ticker} · ${metric.label}` : metric.label;
        const compRows = companyRowsMap.get(comp.ticker) || [];

        const points = timeline.map((t) => {
          const rowIndex = compRows.findIndex((r) => r.period === t.period);
          if (rowIndex === -1) {
            return { label: t.label, short: t.short, year: t.year, value: null };
          }
          const row = compRows[rowIndex];
          const locked = window.isLockedPeriod ? window.isLockedPeriod(rowIndex, compRows) : false;
          const value = locked ? null : (window.derivedScreenerValue ? window.derivedScreenerValue(metric, row, rowIndex, compRows, comp.data) : row.values?.[metric.key]);
          return {
            label: t.label,
            short: t.short,
            year: t.year,
            value,
          };
        });

        allSeries.push({
          id: seriesId,
          metric,
          company: comp,
          label,
          color,
          points,
          hidden: isSeriesHidden(seriesId),
        });
      });
    });

    legend.innerHTML = allSeries.map((entry) => `
      <span class="metrics-legend-item${entry.hidden ? ' is-hidden-series' : ''}">
        <button type="button" class="metrics-swatch" data-series-id="${escapeHtml(entry.id)}" aria-label="Cambiar el color de ${escapeHtml(entry.label)}" style="background:${entry.color}"></button>
        <span class="metrics-legend-label" title="${escapeHtml(entry.label)}">${escapeHtml(entry.label)}</span>
        <span class="metrics-legend-type">${metricChartType(entry.metric) === 'bar' ? 'barras' : 'línea'}</span>
        <button type="button" class="metrics-legend-visibility${entry.hidden ? ' is-hidden' : ''}" data-series-id="${escapeHtml(entry.id)}" aria-pressed="${!entry.hidden}" aria-label="${entry.hidden ? 'Mostrar' : 'Ocultar'} ${escapeHtml(entry.label)} en el gráfico" title="${entry.hidden ? 'Mostrar en el gráfico' : 'Ocultar en el gráfico'}">${entry.hidden ? EYE_OFF_SVG : EYE_SVG}</button>
        <button type="button" class="metrics-legend-remove" data-remove-key="${escapeHtml(entry.metric.key)}" aria-label="Quitar ${escapeHtml(entry.metric.label)} del gráfico">×</button>
      </span>`).join('');

    const body = document.querySelector('#metrics-chart-body');
    body.querySelectorAll('.metric-cagr-label').forEach((el) => el.remove());
    body.querySelectorAll('.metrics-chart-hidden-placeholder').forEach((el) => el.remove());

    const series = allSeries.filter((entry) => !entry.hidden);

    if (!series.length) {
      svg.innerHTML = '';
      const placeholder = document.createElement('div');
      placeholder.className = 'metrics-chart-placeholder metrics-chart-hidden-placeholder';
      placeholder.innerHTML = `
        <div class="metrics-chart-placeholder-card">
          <span class="placeholder-icon">👁</span>
          <strong>Todas las series están ocultas</strong>
          <p>Usa el icono del ojo de la leyenda para volver a mostrar las métricas en el gráfico.</p>
        </div>
      `;
      body.appendChild(placeholder);
      EMS.metricsChartState = {
        rows: timeline,
        series: [],
        centers: [],
        margin: { top: 14, right: 12, bottom: 26, left: 58 },
        height,
        width,
        rightScale: null,
        yLeft: () => 0,
        yRight: () => 0,
      };
      return;
    }

    const barSeries = series.filter((entry) => metricChartType(entry.metric) === 'bar');
    const lineSeries = series.filter((entry) => metricChartType(entry.metric) === 'line');

    const allLinesAreMargins = lineSeries.length > 0 && lineSeries.every((entry) => isMarginMetric(entry.metric));
    const barScale = barSeries.length ? metricScale(barSeries.map((entry) => entry.points), true) : null;
    const lineScale = lineSeries.length
      ? (allLinesAreMargins
          ? marginScale(lineSeries.map((entry) => entry.points))
          : metricScale(lineSeries.map((entry) => entry.points), false))
      : null;
    const leftScale = barScale ?? lineScale;
    const rightScale = lineScale;

    const margin = { top: 14, right: rightScale ? 64 : 12, bottom: 26, left: 58 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const slotWidth = timeline.length ? innerWidth / timeline.length : innerWidth;
    const centers = timeline.map((_, index) => margin.left + slotWidth * (index + 0.5));
    const yLeft = leftScale ? metricY(leftScale, margin, innerHeight) : () => 0;
    const yRight = rightScale ? metricY(rightScale, margin, innerHeight) : () => 0;

    const xLabelStep = Math.max(1, Math.ceil(timeline.length / 8));
    const xLabels = timeline.map((t, index) => (index % xLabelStep === 0
      ? `<text x="${centers[index].toFixed(1)}" y="${height - 8}" class="chart-label chart-label-x">${escapeHtml(t.short)}</text>`
      : '')).join('');

    const leftTicks = leftScale
      ? (leftScale.isMargin
          ? generateMarginTicks(leftScale)
          : [0, 1, 2, 3].map((step) => leftScale.min + ((leftScale.max - leftScale.min) * step) / 3))
      : [];
    const rightTicks = rightScale
      ? (rightScale.isMargin
          ? generateMarginTicks(rightScale)
          : [0, 1, 2, 3].map((step) => rightScale.min + ((rightScale.max - rightScale.min) * step) / 3))
      : [];

    const leftAxis = leftTicks.map((value) => `
      <text x="${margin.left - 8}" y="${yLeft(value) + 3}" class="chart-label" text-anchor="end">${formatChartAxis(value, barSeries[0]?.metric ?? lineSeries[0]?.metric)}</text>
      <line x1="${margin.left}" y1="${yLeft(value)}" x2="${width - margin.right}" y2="${yLeft(value)}" class="chart-grid"/>
    `).join('');
    const rightAxis = rightTicks.map((value) => `
      <text x="${width - margin.right + 8}" y="${yRight(value) + 3}" class="chart-label" text-anchor="start">${formatChartAxis(value, lineSeries[0]?.metric)}</text>
      <line x1="${width - margin.right}" y1="${yRight(value)}" x2="${width - margin.right + 4}" y2="${yRight(value)}" class="chart-grid" style="stroke-opacity:0.4;"/>
    `).join('');

    let zeroLineSvg = '';
    const zeroYScale = rightScale?.isMargin ? rightScale : (leftScale?.min < 0 && leftScale?.max > 0 ? leftScale : null);
    if (zeroYScale) {
      const yFn = zeroYScale === rightScale ? yRight : yLeft;
      const y0 = yFn(0);
      zeroLineSvg = `<line x1="${margin.left}" y1="${y0.toFixed(1)}" x2="${width - margin.right}" y2="${y0.toFixed(1)}" class="chart-zero-line" style="stroke:rgba(0,0,0,0.35);stroke-dasharray:4 3;stroke-width:1.2;"/>`;
    }

    let barsSvg = '';
    if (barScale && timeline.length) {
      const groupWidth = slotWidth * 0.75;
      const barWidth = Math.max(2, groupWidth / barSeries.length);
      const baseY = yLeft(Math.max(0, barScale.min));
      barSeries.forEach((entry, j) => {
        entry.points.forEach((point, index) => {
          const value = Number(point.value);
          if (!Number.isFinite(value)) return;
          const x0 = centers[index] - groupWidth / 2 + j * barWidth;
          const yTop = yLeft(value);
          barsSvg += `<rect x="${x0.toFixed(1)}" y="${Math.min(yTop, baseY).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, Math.abs(yTop - baseY)).toFixed(1)}" rx="1.5" class="metric-bar" style="fill:${entry.color}"/>`;
        });
      });
    }

    let linesSvg = '';
    if (lineScale) {
      const lineY = rightScale ? yRight : yLeft;
      lineSeries.forEach((entry) => {
        let d = '';
        let segmentStarted = false;
        entry.points.forEach((point, index) => {
          const value = Number(point.value);
          if (!Number.isFinite(value)) {
            segmentStarted = false;
            return;
          }
          const x = centers[index];
          const y = lineY(value);
          d += `${segmentStarted ? ' L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
          segmentStarted = true;
        });
        if (d) linesSvg += `<path d="${d}" class="metric-line" style="stroke:${entry.color}"/>`;
        entry.points.forEach((point, index) => {
          const value = Number(point.value);
          if (!Number.isFinite(value)) return;
          linesSvg += `<circle cx="${centers[index].toFixed(1)}" cy="${lineY(value).toFixed(1)}" r="3.5" class="metric-dot" style="stroke:${entry.color}"/>`;
        });
      });
    }

    let cagrLinesSvg = '';
    const cagrLabels = [];
    if (allCompanies.length === 1 && series.length === 1) {
      const entry = series[0];
      if (!entry.metric.kind || (entry.metric.kind !== 'margin' && entry.metric.kind !== 'ratio' && entry.metric.kind !== 'change' && entry.metric.format !== 'percent')) {
        const y = metricChartType(entry.metric) === 'bar' || !rightScale ? yLeft : yRight;
        let first = null;
        let last = null;
        entry.points.forEach((point, index) => {
          const value = Number(point.value);
          if (!Number.isFinite(value)) return;
          if (first === null) first = { index, value, year: point.year };
          last = { index, value, year: point.year };
        });
        if (first && last && first.index !== last.index) {
          const geometry = {
            x1: centers[first.index],
            y1: y(first.value),
            x2: centers[last.index],
            y2: y(last.value),
            t: 0.5,
          };
          cagrLinesSvg += `<line x1="${geometry.x1.toFixed(1)}" y1="${geometry.y1.toFixed(1)}" x2="${geometry.x2.toFixed(1)}" y2="${geometry.y2.toFixed(1)}" class="metric-cagr-line"/>`;
          let cagrText = 'CAGR: —';
          if (first.year !== null && last.year !== null && last.year > first.year) {
            const years = last.year - first.year;
            const ratio = last.value / first.value;
            if (Number.isFinite(ratio) && ratio > 0) {
              const cagr = (ratio ** (1 / years)) - 1;
              cagrText = `CAGR: ${cagr >= 0 ? '+' : '−'}${metricsChartNumFormat.format(Math.abs(cagr * 100))} %`;
            } else if (first.value !== 0) {
              const average = (((last.value - first.value) / Math.abs(first.value)) / years) * 100;
              cagrText = `CAGR: ${average >= 0 ? '+' : '−'}${metricsChartNumFormat.format(Math.abs(average))} %`;
            }
          }
          geometry.text = cagrText;
          cagrLabels.push(geometry);
        }
      }
    }

    svg.innerHTML = `${leftAxis}${rightAxis}${zeroLineSvg}${barsSvg}${linesSvg}${cagrLinesSvg}${xLabels}
      <g id="metrics-hover" hidden>
        <line id="metrics-hover-line" x1="0" y1="0" x2="0" y2="0" class="chart-crosshair"/>
        <g id="metrics-hover-dots"></g>
      </g>`;

    cagrLabels.forEach((geometry) => {
      const el = document.createElement('div');
      el.className = 'metric-cagr-label';
      el.textContent = geometry.text;
      body.appendChild(el);
      geometry.el = el;
      positionCagrLabel(geometry);
      attachCagrDrag(geometry);
    });

    EMS.metricsChartState = { rows: timeline, series, centers, margin, height, width, rightScale, yLeft, yRight };
  }

window.renderMetricsChart = renderMetricsChart;

})(window);
