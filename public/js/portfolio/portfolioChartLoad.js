/**
 * @fileoverview Módulo extraído de portfolioChart.js.
 */

(function (window) {
  const PCS = window.PortfolioChartState;

  async function fetchApi(path, options) {
    if (PCS.apiFetcher) return PCS.apiFetcher(path, options);
    const response = await fetch(path, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Error del servidor.');
    return payload;
  }

  function attachChartCanvasInteractions(panel) {
    const canvasInner = panel.querySelector('[data-pf-chart-canvas-inner]');
    if (!canvasInner) return;

    wirePortfolioChartViewport(panel, canvasInner);
    wirePortfolioChartMeasure(panel, canvasInner);
    wirePortfolioChartComparison(panel, canvasInner);
    wirePortfolioChartPan(panel, canvasInner);
    wirePortfolioChartHover(panel, canvasInner);
  }

  function drawPortfolioChart(scope, chart) {
    const panel = scope.querySelector('.pf-chart-panel') || scope;
    const root = panel.querySelector('[data-pf-chart]');
    const legend = panel.querySelector('[data-pf-chart-legend]');
    if (!root || !legend) return;

    PCS.cachedData = chart;
    const allPoints = chart.points ?? [];
    if (!allPoints.length) {
      root.innerHTML = '<div class="pf-chart-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg><p>No hay datos históricos disponibles para la selección.</p></div>';
      legend.innerHTML = '';
      return;
    }

    const total = allPoints.length;
    if (PCS.sliceEnd === null || PCS.sliceEnd >= total || PCS.sliceStart < 0 || PCS.sliceStart >= total || PCS.sliceStart >= PCS.sliceEnd) {
      const { start, end } = computeSliceIndicesForRange(allPoints, PCS.range);
      PCS.sliceStart = start;
      PCS.sliceEnd = end;
    }

    root.innerHTML = `
      <div data-pf-chart-canvas-inner></div>
      <div class="pf-timeline-bar-wrap" data-timeline-wrap>
        <div class="pf-timeline-info">
          <div class="pf-timeline-date-chip">
            <span class="pf-timeline-chip-title">Desde</span>
            <strong data-timeline-from-date>—</strong>
          </div>
          <div class="pf-timeline-hint">Rueda: zoom · Arrastrar: desplazar · <strong>Clic derecho: comparar ganancia/pérdida</strong></div>
          <div class="pf-timeline-date-chip">
            <span class="pf-timeline-chip-title">Hasta</span>
            <strong data-timeline-to-date>—</strong>
          </div>
        </div>
        <div class="pf-timeline-track" data-timeline-track>
          <svg class="pf-timeline-sparkline" viewBox="0 0 760 32" preserveAspectRatio="none" data-timeline-sparkline></svg>
          <div class="pf-timeline-mask left" data-timeline-mask-left></div>
          <div class="pf-timeline-window" data-timeline-window>
            <div class="pf-timeline-handle left" data-timeline-handle="left" title="Arrastra para ajustar fecha de inicio">
              <span class="pf-handle-grip"></span>
            </div>
            <div class="pf-timeline-window-body" data-timeline-window-body title="Arrastra para desplazar el período"></div>
            <div class="pf-timeline-handle right" data-timeline-handle="right" title="Arrastra para ajustar fecha de fin">
              <span class="pf-handle-grip"></span>
            </div>
          </div>
          <div class="pf-timeline-mask right" data-timeline-mask-right></div>
        </div>
      </div>`;

    renderTimelineSparkline(panel, allPoints, chart.labels);
    renderChartMainSvg(panel);
    updateTimelineSliderUi(panel);
    attachChartCanvasInteractions(panel);
    attachTimelineEvents(panel);
  }

  async function loadPortfolioChart(scope) {
    const panel = scope.querySelector('.pf-chart-panel') || scope;
    const status = panel.querySelector('[data-pf-chart-status]');
    if (!status) return;
    if (!PCS.selectedIds.length) {
      if (typeof window.syncChartTriggerButtons === 'function') {
        window.syncChartTriggerButtons(document);
      }
      panel.querySelectorAll('[data-pf-chart-clear]').forEach((btn) => {
        btn.style.display = 'none';
      });
      status.textContent = 'Sin elementos seleccionados';
      const root = panel.querySelector('[data-pf-chart]');
      const legend = panel.querySelector('[data-pf-chart-legend]');
      if (root) root.innerHTML = `
        <div class="pf-chart-empty pf-chart-empty-clean">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          <p><strong>El gráfico no tiene elementos seleccionados.</strong></p>
          <p class="pf-chart-empty-sub">Pulsa el icono <span class="pf-inline-chart-icon"><svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg></span> en cualquier valor o grupo de la tabla para compararlo, o pulsa <strong>«Mostrar todo»</strong> en la cabecera.</p>
        </div>`;
      if (legend) legend.innerHTML = '<li class="pf-legend-empty-hint">Ninguna línea seleccionada</li>';
      return;
    }
    const requestId = ++PCS.requestId;
    status.textContent = 'Cargando histórico…';
    try {
      const query = new URLSearchParams({ ids: PCS.selectedIds.join(','), metric: PCS.metric, range: 'all' });
      const payload = await fetchApi(`/api/portfolio/chart?${query}`);
      if (requestId !== PCS.requestId) return;
      PCS.cachedData = payload.chart;
      const { start, end } = computeSliceIndicesForRange(PCS.cachedData.points, PCS.range);
      PCS.sliceStart = start;
      PCS.sliceEnd = end;
      drawPortfolioChart(panel, payload.chart);
      panel.querySelectorAll('[data-pf-chart-clear]').forEach((btn) => {
        btn.style.display = '';
      });
      status.textContent = `Yahoo Finance · ${payload.chart.points.length} sesiones`;
    } catch (error) {
      if (requestId === PCS.requestId) status.textContent = error.message || 'No se pudo cargar el histórico.';
    }
  }
window.drawPortfolioChart = drawPortfolioChart;
window.loadPortfolioChart = loadPortfolioChart;

})(window);
