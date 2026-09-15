/**
 * @fileoverview Gráfico interactivo de valoración: escalas, comparación, medición, zoom y zoom de rango (extraído de empresa.js).
 */

(function (window) {





















function wireValChartContextMenu(canvasInner, valBlock) {
  // Prevent context menu
  canvasInner.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  if (valBlock) {
    valBlock.addEventListener('contextmenu', (event) => {
      if (isValMeasuring || isValMeasureToolActive || event.target.closest('#val-chart, [data-val-canvas-inner]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  canvasInner.addEventListener('mousedown', (event) => {
    if (event.button === 2) event.preventDefault();
  });
}

function wireValChartMeasureButton(canvasInner, measureBtn) {
  // Measure button toggle
  if (measureBtn) {
    measureBtn.addEventListener('click', () => {
      isValMeasureToolActive = !isValMeasureToolActive;
      measureBtn.classList.toggle('active', isValMeasureToolActive);
      canvasInner.classList.toggle('measuring-active', isValMeasureToolActive);
    });
  }
}

function wireValChartWheelZoom(canvasInner, valBlock) {
  // Mouse wheel zoom
  let valZoomAccumulator = 0;
  let valZoomResetTimer = null;
  canvasInner.addEventListener('wheel', (event) => {
    if (!valChartPoints.length || valChartMetric === 'netDebtToEbitda') return;
    event.preventDefault();
    const rawDelta = event.deltaY || 0;
    const threshold = event.deltaMode === 1 ? 2 : 45;
    valZoomAccumulator += rawDelta;
    if (valZoomResetTimer) clearTimeout(valZoomResetTimer);
    valZoomResetTimer = setTimeout(() => { valZoomAccumulator = 0; }, 140);
    if (Math.abs(valZoomAccumulator) < threshold) return;
    const steps = Math.trunc(valZoomAccumulator / threshold);
    valZoomAccumulator -= steps * threshold;

    const svgEl = document.querySelector('#val-chart');
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const { width, pad, innerWidth } = getCompanyChartGeometry(valBlock);
    const cursorSvgX = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));

    const total = valChartPoints.length;
    const curSpan = valSliceEnd - valSliceStart;
    const zoomPct = 0.04 * steps;
    const spanDelta = Math.round(curSpan * zoomPct);
    let newSpan = curSpan + spanDelta;
    newSpan = Math.max(6, Math.min(total, newSpan));
    const spanChange = newSpan - curSpan;

    let newStart = Math.round(valSliceStart - spanChange * ratio);
    let newEnd = newStart + newSpan - 1;
    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(total - 1, newSpan - 1);
    }
    if (newEnd >= total) {
      newEnd = total - 1;
      newStart = Math.max(0, total - newSpan);
    }
    if (newStart !== valSliceStart || newEnd !== valSliceEnd) {
      valSliceStart = newStart;
      valSliceEnd = newEnd;
      renderValuationChart();
    }
  }, { passive: false });
}

function wireValChartPointerDown(canvasInner, valBlock) {
  // Pointerdown (Pan or Measure)
  canvasInner.addEventListener('pointerdown', (event) => {
    if (!valChartPoints.length || valChartMetric === 'netDebtToEbitda') return;
    const total = valChartPoints.length;
    if (total <= 1) return;

    const isRightClick = event.button === 2;
    const isShiftLeftClick = event.button === 0 && event.shiftKey;
    const isToolActiveClick = event.button === 0 && isValMeasureToolActive;

    // 1. Clic derecho mantenido -> Comparación Google Finance (punto inicial vs punto final), igual que en el gráfico de cotización
    if (isRightClick) {
      event.preventDefault();
      event.stopPropagation();
      startValComparison(event);
      return;
    }

    if (isShiftLeftClick || isToolActiveClick) {
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 0) {
        try { event.target.setPointerCapture(event.pointerId); } catch {}
      }

      const svgEl = document.querySelector('#val-chart');
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const { width, height, pad } = getCompanyChartGeometry(valBlock);

      const curX = ((event.clientX - rect.left) / rect.width) * width;
      const curY = ((event.clientY - rect.top) / rect.height) * height;
      const startX = Math.max(pad.left, Math.min(width - pad.right, curX));
      const startY = Math.max(pad.top, Math.min(height - pad.bottom, curY));

      isValMeasuring = true;
      valMeasureStartButton = event.button;
      valMeasureStartSvgX = startX;
      valMeasureStartSvgY = startY;
      valMeasureCurrentSvgX = startX;
      valMeasureCurrentSvgY = startY;
      canvasInner.classList.add('measuring');

      const hoverLayer = document.querySelector('#val-chart .pf-chart-hover-layer');
      if (hoverLayer) {
        hoverLayer.style.display = 'none';
      }

      updateValuationMeasurementView(event.clientX, event.clientY);

      window.addEventListener('pointermove', onValMeasurePointerMove);
      window.addEventListener('mousemove', onValMeasurePointerMove);
      window.addEventListener('pointerup', onValMeasurePointerUp);
      window.addEventListener('mouseup', onValMeasurePointerUp);
      return;
    }

    if (event.button !== 0) return;

    isValPanning = true;
    valPanMoved = false;
    valPanStartX = event.clientX;
    valPanInitStart = valSliceStart;
    valPanInitEnd = valSliceEnd;
    canvasInner.classList.add('panning');

    function onValPanMove(e) {
      if (!isValPanning || !valChartPoints.length) return;
      const deltaX = e.clientX - valPanStartX;
      if (Math.abs(deltaX) > 4) {
        valPanMoved = true;
        const hoverLayer = document.querySelector('#val-chart .pf-chart-hover-layer');
        if (hoverLayer) hoverLayer.style.display = 'none';
        hideValuationChartTooltip();
      }
      if (!valPanMoved) return;

      const rect = canvasInner.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const { width, pad, innerWidth } = getCompanyChartGeometry(valBlock);
      const innerWidthPx = rect.width * (innerWidth / width);
      const span = valPanInitEnd - valPanInitStart;
      const deltaRatio = deltaX / Math.max(1, innerWidthPx);
      const deltaIdx = Math.round(deltaRatio * span);

      let newStart = valPanInitStart - deltaIdx;
      let newEnd = valPanInitEnd - deltaIdx;

      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, span);
      } else if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, total - 1 - span);
      }

      if (newStart !== valSliceStart || newEnd !== valSliceEnd) {
        valSliceStart = newStart;
        valSliceEnd = newEnd;
        renderValuationChart();
      }
    }

    function onValPanUp() {
      if (!isValPanning) return;
      isValPanning = false;
      canvasInner.classList.remove('panning');
      window.removeEventListener('pointermove', onValPanMove);
      window.removeEventListener('pointerup', onValPanUp);
      window.removeEventListener('pointercancel', onValPanUp);
    }

    window.addEventListener('pointermove', onValPanMove);
    window.addEventListener('pointerup', onValPanUp);
    window.addEventListener('pointercancel', onValPanUp);
  });
}




function wireValuationChartInteractions() {
  const canvasInner = document.querySelector('[data-val-canvas-inner]');
  const valBlock = document.querySelector('#val-chart-block');
  const measureBtn = document.querySelector('#val-measure-btn');
  const fsBtn = document.querySelector('#val-fullscreen');
  if (!canvasInner) return;

  wireValChartContextMenu(canvasInner, valBlock);
  wireValChartMeasureButton(canvasInner, measureBtn);
  wireValChartWheelZoom(canvasInner, valBlock);
  wireValChartPointerDown(canvasInner, valBlock);
  wireValChartHover(canvasInner);
  wireValChartTimelineBrush();
  wireValChartZoomButtons();

  // Fullscreen button
  if (fsBtn) {
    fsBtn.addEventListener('click', () => toggleFullscreen(valBlock));
  }
}

window.wireValuationChartInteractions = wireValuationChartInteractions;

})(window);
