/**
 * @fileoverview Gráfico interactivo de cotización: rango, medias móviles, comparación, medición, zoom y pantalla completa (extraído de empresa.js).
 */

(function (window) {













function wirePriceChartContextMenu(canvasInner, chartBlock) {
  // Prevent context menu on chart canvas and block
  canvasInner.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  if (chartBlock) {
    chartBlock.addEventListener('contextmenu', (event) => {
      if (isMeasuring || isMeasureToolActive || event.target.closest('#price-chart, .company-chart-canvas-inner, [data-chart-canvas-inner]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  canvasInner.addEventListener('mousedown', (event) => {
    if (event.button === 2) {
      event.preventDefault();
    }
  });
}

function wirePriceChartMeasureButton(canvasInner, measureBtn) {
  // Measure button toggle
  if (measureBtn) {
    measureBtn.addEventListener('click', () => {
      isMeasureToolActive = !isMeasureToolActive;
      measureBtn.classList.toggle('active', isMeasureToolActive);
      canvasInner.classList.toggle('measuring-active', isMeasureToolActive);
    });
  }
}

function wirePriceChartWheelZoom(canvasInner, chartBlock) {
  // Mouse wheel zoom
  let zoomAccumulator = 0;
  let zoomResetTimer = null;
  canvasInner.addEventListener('wheel', (event) => {
    if (!chartPoints.length) return;
    event.preventDefault();
    const rawDelta = event.deltaY || 0;
    const threshold = event.deltaMode === 1 ? 2 : 45;
    zoomAccumulator += rawDelta;
    if (zoomResetTimer) clearTimeout(zoomResetTimer);
    zoomResetTimer = setTimeout(() => { zoomAccumulator = 0; }, 140);
    if (Math.abs(zoomAccumulator) < threshold) return;
    const steps = Math.trunc(zoomAccumulator / threshold);
    zoomAccumulator -= steps * threshold;

    const svgEl = document.querySelector('#price-chart');
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const { width, pad, innerWidth } = getCompanyChartGeometry(chartBlock);
    const cursorSvgX = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));

    const total = chartPoints.length;
    const curSpan = chartSliceEnd - chartSliceStart;
    const zoomPct = 0.04 * steps;
    const spanDelta = Math.round(curSpan * zoomPct);
    let newSpan = curSpan + spanDelta;
    newSpan = Math.max(6, Math.min(total, newSpan));
    const spanChange = newSpan - curSpan;

    let newStart = Math.round(chartSliceStart - spanChange * ratio);
    let newEnd = newStart + newSpan - 1;
    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(total - 1, newSpan - 1);
    }
    if (newEnd >= total) {
      newEnd = total - 1;
      newStart = Math.max(0, total - newSpan);
    }
    if (newStart !== chartSliceStart || newEnd !== chartSliceEnd) {
      chartSliceStart = newStart;
      chartSliceEnd = newEnd;
      renderPriceChart();
    }
  }, { passive: false });
}

function wirePriceChartPointerDown(canvasInner, chartBlock) {
  // Pointer Down (Pan or Measure)
  canvasInner.addEventListener('pointerdown', (event) => {
    if (!chartPoints.length) return;
    const total = chartPoints.length;
    if (total <= 1) return;

    // 1. Clic derecho mantenido -> Comparación Google Finance (punto inicial vs punto final)
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      startCompanyComparison(event);
      return;
    }

    // 2. Herramienta Medir activa (solo al presionar el botón de Medir con clic izquierdo)
    const isToolActiveClick = event.button === 0 && isMeasureToolActive;

    if (isToolActiveClick) {
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 0) {
        try { event.target.setPointerCapture(event.pointerId); } catch {}
      }

      const svgEl = document.querySelector('#price-chart');
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const { width, height, pad } = getCompanyChartGeometry(chartBlock);

      const curX = ((event.clientX - rect.left) / rect.width) * width;
      const curY = ((event.clientY - rect.top) / rect.height) * height;
      const startX = Math.max(pad.left, Math.min(width - pad.right, curX));
      const startY = Math.max(pad.top, Math.min(height - pad.bottom, curY));

      isMeasuring = true;
      measureStartButton = event.button;
      measureStartSvgX = startX;
      measureStartSvgY = startY;
      measureCurrentSvgX = startX;
      measureCurrentSvgY = startY;
      canvasInner.classList.add('measuring');

      const hoverLayer = document.querySelector('#price-chart .pf-chart-hover-layer');
      if (hoverLayer) {
        hoverLayer.style.display = 'none';
      }

      updateCompanyMeasurementView(event.clientX, event.clientY);

      window.addEventListener('pointermove', onCompanyMeasurePointerMove);
      window.addEventListener('mousemove', onCompanyMeasurePointerMove);
      window.addEventListener('pointerup', onCompanyMeasurePointerUp);
      window.addEventListener('mouseup', onCompanyMeasurePointerUp);
      return;
    }

    if (event.button !== 0) return;

    isPanning = true;
    panMoved = false;
    panStartX = event.clientX;
    panInitStart = chartSliceStart;
    panInitEnd = chartSliceEnd;
    canvasInner.classList.add('panning');

    function onPanMove(e) {
      if (!isPanning || !chartPoints.length) return;
      const deltaX = e.clientX - panStartX;
      if (Math.abs(deltaX) > 4) {
        panMoved = true;
        const hoverLayer = document.querySelector('#price-chart .pf-chart-hover-layer');
        if (hoverLayer) hoverLayer.style.display = 'none';
        hideChartTooltip();
      }
      if (!panMoved) return;

      const rect = canvasInner.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const { width, pad, innerWidth } = getCompanyChartGeometry(chartBlock);
      const innerWidthPx = rect.width * (innerWidth / width);
      const span = panInitEnd - panInitStart;
      const deltaRatio = deltaX / Math.max(1, innerWidthPx);
      const deltaIdx = Math.round(deltaRatio * span);

      let newStart = panInitStart - deltaIdx;
      let newEnd = panInitEnd - deltaIdx;

      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, span);
      } else if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, total - 1 - span);
      }

      if (newStart !== chartSliceStart || newEnd !== chartSliceEnd) {
        chartSliceStart = newStart;
        chartSliceEnd = newEnd;
        renderPriceChart();
      }
    }

    function onPanUp() {
      if (!isPanning) return;
      isPanning = false;
      canvasInner.classList.remove('panning');
      window.removeEventListener('pointermove', onPanMove);
      window.removeEventListener('pointerup', onPanUp);
      window.removeEventListener('pointercancel', onPanUp);
    }

    window.addEventListener('pointermove', onPanMove);
    window.addEventListener('pointerup', onPanUp);
    window.addEventListener('pointercancel', onPanUp);
  });
}



function wireCompanyChartInteractions() {
  const canvasInner = document.querySelector('[data-chart-canvas-inner]');
  const chartBlock = document.querySelector('#company-chart-block') || document.querySelector('.chart-block');
  const measureBtn = document.querySelector('#chart-measure-btn');
  if (!canvasInner) return;

  wirePriceChartContextMenu(canvasInner, chartBlock);
  wirePriceChartMeasureButton(canvasInner, measureBtn);
  wirePriceChartWheelZoom(canvasInner, chartBlock);
  wirePriceChartPointerDown(canvasInner, chartBlock);
  wirePriceChartHover(canvasInner, chartBlock);
  wirePriceTimelineBrush();
  wirePriceZoomButtons();

  // MA Controls wiring
  wireMaControls();

  // Fullscreen button
  const fsBtn = document.querySelector('#chart-fullscreen');
  if (fsBtn) {
    fsBtn.addEventListener('click', () => toggleFullscreen(chartBlock));
  }
}

window.wireCompanyChartInteractions = wireCompanyChartInteractions;

})(window);
