/**
 * @fileoverview Interacciones de gráfico de cartera: Pan.
 */

(function (window) {
  const PCS = window.PortfolioChartState;
  const PCIS = window.PortfolioChartInteractionState;

function wirePortfolioChartPan(panel, canvasInner) {
  // Arrastre con botón izquierdo para desplazar el rango temporal
  canvasInner.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.shiftKey || PCIS.isMeasureToolActive) return;
    if (!PCS.cachedData?.points?.length) return;
    const total = PCS.cachedData.points.length;
    if (total <= 1) return;
PCIS.isPanning = true;
      PCIS.panMoved = false;
      PCIS.panStartX = event.clientX;
      PCIS.panInitStart = PCS.sliceStart;
      PCIS.panInitEnd = PCS.sliceEnd;
      canvasInner.classList.add('panning');

      window.addEventListener('pointermove', onWindowPointerMove);
      window.addEventListener('pointerup', onWindowPointerUp);
      window.addEventListener('pointercancel', onWindowPointerUp);
  });

    function onWindowPointerMove(event) {
      if (!PCIS.isPanning || !PCS.cachedData?.points?.length) return;
      const deltaX = event.clientX - PCIS.panStartX;
      if (Math.abs(deltaX) > 4) {
        PCIS.panMoved = true;
        const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
        if (hoverLayer) hoverLayer.style.display = 'none';
        hideChartTooltip();
      }
      if (!PCIS.panMoved) return;

      const total = PCS.cachedData.points.length;
      const rect = canvasInner.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const { width, pad, innerWidth } = getActiveChartGeometry(panel);
      const innerWidthPx = rect.width * (innerWidth / width);

      const span = PCIS.panInitEnd - PCIS.panInitStart;
      const deltaRatio = deltaX / Math.max(1, innerWidthPx);
      const deltaIdx = Math.round(deltaRatio * span);

      // Drag left (deltaX < 0) => move forward in time (newStart increases)
      // Drag right (deltaX > 0) => move back in time (newStart decreases)
      let newStart = PCIS.panInitStart - deltaIdx;
      let newEnd = PCIS.panInitEnd - deltaIdx;

      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, span);
      } else if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, total - 1 - span);
      }

      if (newStart !== PCS.sliceStart || newEnd !== PCS.sliceEnd) {
        PCS.sliceStart = newStart;
        PCS.sliceEnd = newEnd;
        scheduleChartRedraw(panel);
        updateTimelineSliderUi(panel);
        updateQuickRangeButtonsUi(panel);
      }
    }

    function onWindowPointerUp(event) {
      if (!PCIS.isPanning) return;
      PCIS.isPanning = false;
      canvasInner.classList.remove('panning');
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    }
}
window.wirePortfolioChartPan = wirePortfolioChartPan;

})(window);
