/**
 * @fileoverview Módulo extraído de empresaPriceChart.js.
 */

(function (window) {

function wirePriceTimelineBrush() {
  // Timeline brush interaction
  const track = document.querySelector('#chart-timeline-track');
  const win = document.querySelector('#chart-timeline-window');
  const handleL = document.querySelector('#chart-handle-l');
  const handleR = document.querySelector('#chart-handle-r');

  function wireTimelineHandle(handleEl, isLeft) {
    if (!handleEl) return;
    handleEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { e.target.setPointerCapture(e.pointerId); } catch {}
      handleEl.classList.add('active');

      const total = chartPoints.length;
      const trackRect = track.getBoundingClientRect();

      function onHandleMove(mv) {
        if (!trackRect.width) return;
        const ratio = Math.max(0, Math.min(1, (mv.clientX - trackRect.left) / trackRect.width));
        const idx = Math.round(ratio * (total - 1));
        if (isLeft) {
          chartSliceStart = Math.min(idx, chartSliceEnd - 4);
        } else {
          chartSliceEnd = Math.max(idx, chartSliceStart + 4);
        }
        renderPriceChart();
      }

      function onHandleUp() {
        handleEl.classList.remove('active');
        window.removeEventListener('pointermove', onHandleMove);
        window.removeEventListener('pointerup', onHandleUp);
        window.removeEventListener('pointercancel', onHandleUp);
      }

      window.addEventListener('pointermove', onHandleMove);
      window.addEventListener('pointerup', onHandleUp);
      window.addEventListener('pointercancel', onHandleUp);
    });
  }

  wireTimelineHandle(handleL, true);
  wireTimelineHandle(handleR, false);

  if (win) {
    win.addEventListener('pointerdown', (e) => {
      if (e.target === handleL || e.target === handleR || handleL?.contains(e.target) || handleR?.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      try { e.target.setPointerCapture(e.pointerId); } catch {}
      win.classList.add('dragging');

      const total = chartPoints.length;
      const trackRect = track.getBoundingClientRect();
      const startClientX = e.clientX;
      const initStart = chartSliceStart;
      const initEnd = chartSliceEnd;
      const span = initEnd - initStart;

      function onWinMove(mv) {
        if (!trackRect.width) return;
        const deltaX = mv.clientX - startClientX;
        const deltaRatio = deltaX / trackRect.width;
        const deltaIdx = Math.round(deltaRatio * (total - 1));

        let newStart = initStart + deltaIdx;
        let newEnd = initEnd + deltaIdx;

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

      function onWinUp() {
        win.classList.remove('dragging');
        window.removeEventListener('pointermove', onWinMove);
        window.removeEventListener('pointerup', onWinUp);
        window.removeEventListener('pointercancel', onWinUp);
      }

      window.addEventListener('pointermove', onWinMove);
      window.addEventListener('pointerup', onWinUp);
      window.addEventListener('pointercancel', onWinUp);
    });
  }
}

function wirePriceZoomButtons() {
  // Zoom buttons
  const zoomInBtn = document.querySelector('#chart-zoom-in');
  const zoomOutBtn = document.querySelector('#chart-zoom-out');
  const zoomResetBtn = document.querySelector('#chart-zoom-reset');
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoomChartByStep('in'));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoomChartByStep('out'));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => zoomChartByStep('reset'));
}
window.wirePriceTimelineBrush = wirePriceTimelineBrush;
window.wirePriceZoomButtons = wirePriceZoomButtons;

})(window);
