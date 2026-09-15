/**
 * @fileoverview Interacciones de gráfico de cartera: Viewport.
 */

(function (window) {
  const PCS = window.PortfolioChartState;
  const PCIS = window.PortfolioChartInteractionState;

function wirePortfolioChartViewport(panel, canvasInner) {
    // Accumulator-based progressive Wheel Zoom (in / out) centered around cursor

    canvasInner.addEventListener('wheel', (event) => {
      if (!PCS.cachedData?.points?.length) return;
      const total = PCS.cachedData.points.length;
      if (total <= 3) return;

      event.preventDefault();
      event.stopPropagation();

      const rect = canvasInner.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const width = 760;
      const pad = { left: 58, right: 16 };
      const innerWidth = width - pad.left - pad.right;

      const cursorSvgX = ((event.clientX - rect.left) / rect.width) * width;
      const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));

      // Normalize delta across input devices (mouse wheel vs trackpad)
      let rawDelta = event.deltaY;
      if (event.deltaMode === 1) rawDelta *= 16;
      else if (event.deltaMode === 2) rawDelta *= 100;

      PCIS.zoomAccumulator += rawDelta;
      if (PCIS.zoomResetTimer) clearTimeout(PCIS.zoomResetTimer);
      PCIS.zoomResetTimer = setTimeout(() => { PCIS.zoomAccumulator = 0; }, 140);

      // Only step once accumulated delta reaches threshold
      const threshold = 35;
      if (Math.abs(PCIS.zoomAccumulator) < threshold) return;

      const steps = Math.trunc(PCIS.zoomAccumulator / threshold);
      PCIS.zoomAccumulator -= steps * threshold;

      const currentSpan = PCS.sliceEnd - PCS.sliceStart;
      // 4% zoom change per step
      const factor = Math.pow(1.04, steps);
      let newSpan = Math.round(currentSpan * factor);

      if (steps < 0 && newSpan >= currentSpan) newSpan = currentSpan - 1;
      if (steps > 0 && newSpan <= currentSpan) newSpan = currentSpan + 1;

      const minSpan = Math.min(3, total - 1);
      const maxSpan = total - 1;
      newSpan = Math.max(minSpan, Math.min(maxSpan, newSpan));

      if (newSpan === currentSpan) return;

      const pivotIdx = PCS.sliceStart + ratio * currentSpan;
      let newStart = Math.round(pivotIdx - ratio * newSpan);
      let newEnd = newStart + newSpan;

      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, newSpan);
      } else if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, total - 1 - newSpan);
      }

      if (newStart !== PCS.sliceStart || newEnd !== PCS.sliceEnd) {
        PCS.sliceStart = newStart;
        PCS.sliceEnd = newEnd;
        scheduleChartRedraw(panel);
        updateTimelineSliderUi(panel);
        updateQuickRangeButtonsUi(panel);
      }
    }, { passive: false });

    // Double-click on chart to zoom in or reset
    canvasInner.addEventListener('dblclick', (event) => {
      event.preventDefault();
      if (!PCS.cachedData?.points?.length) return;
      const total = PCS.cachedData.points.length;
      if (PCS.sliceStart === 0 && PCS.sliceEnd === total - 1) {
        const rect = canvasInner.getBoundingClientRect();
        const width = 760;
        const pad = { left: 58, right: 16 };
        const innerWidth = width - pad.left - pad.right;
        const cursorSvgX = ((event.clientX - rect.left) / rect.width) * width;
        const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));
        const newSpan = Math.max(10, Math.round(total * 0.4));
        const pivotIdx = Math.round(ratio * (total - 1));
        let newStart = Math.round(pivotIdx - newSpan / 2);
        let newEnd = newStart + newSpan;
        if (newStart < 0) { newStart = 0; newEnd = Math.min(total - 1, newSpan); }
        else if (newEnd > total - 1) { newEnd = total - 1; newStart = Math.max(0, total - 1 - newSpan); }
        PCS.sliceStart = newStart;
        PCS.sliceEnd = newEnd;
      } else {
        PCS.sliceStart = 0;
        PCS.sliceEnd = total - 1;
        PCS.range = 'all';
      }
      scheduleChartRedraw(panel);
      updateTimelineSliderUi(panel);
      updateQuickRangeButtonsUi(panel);
    });

    // Prevent context menu on chart canvas
    canvasInner.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    panel.addEventListener('contextmenu', (event) => {
      if (PCIS.isMeasuring || PCIS.isMeasureToolActive || event.target.closest('.pf-chart-svg, .pf-chart-canvas-wrap, [data-pf-chart-canvas-inner]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    canvasInner.addEventListener('mousedown', (event) => {
      if (event.button === 2) {
        event.preventDefault();
      }
    });
}
window.wirePortfolioChartViewport = wirePortfolioChartViewport;

})(window);
