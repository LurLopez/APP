/**
 * @fileoverview Módulo extraído de empresaValuationChart.js.
 */

(function (window) {

function wireValChartTimelineBrush() {
  // Timeline handles & window
  const track = document.querySelector('#val-timeline-track');
  const win = document.querySelector('#val-timeline-window');
  const handleL = document.querySelector('#val-handle-l');
  const handleR = document.querySelector('#val-handle-r');

  function wireValTimelineHandle(handleEl, isLeft) {
    if (!handleEl) return;
    handleEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { e.target.setPointerCapture(e.pointerId); } catch {}
      handleEl.classList.add('active');

      const total = valChartPoints.length;
      const trackRect = track.getBoundingClientRect();

      function onHandleMove(mv) {
        if (!trackRect.width) return;
        const ratio = Math.max(0, Math.min(1, (mv.clientX - trackRect.left) / trackRect.width));
        const idx = Math.round(ratio * (total - 1));
        if (isLeft) {
          valSliceStart = Math.min(idx, valSliceEnd - 4);
        } else {
          valSliceEnd = Math.max(idx, valSliceStart + 4);
        }
        renderValuationChart();
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

  wireValTimelineHandle(handleL, true);
  wireValTimelineHandle(handleR, false);

  if (win) {
    win.addEventListener('pointerdown', (e) => {
      if (e.target === handleL || e.target === handleR || handleL?.contains(e.target) || handleR?.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      try { e.target.setPointerCapture(e.pointerId); } catch {}
      win.classList.add('dragging');

      const total = valChartPoints.length;
      const trackRect = track.getBoundingClientRect();
      const startClientX = e.clientX;
      const initStart = valSliceStart;
      const initEnd = valSliceEnd;
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

        if (newStart !== valSliceStart || newEnd !== valSliceEnd) {
          valSliceStart = newStart;
          valSliceEnd = newEnd;
          renderValuationChart();
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

function wireValChartZoomButtons() {
  const zoomInBtn = document.querySelector('#val-zoom-in');
  const zoomOutBtn = document.querySelector('#val-zoom-out');
  const zoomResetBtn = document.querySelector('#val-zoom-reset');
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoomValChartByStep('in'));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoomValChartByStep('out'));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => zoomValChartByStep('reset'));
}
window.wireValChartTimelineBrush = wireValChartTimelineBrush;
window.wireValChartZoomButtons = wireValChartZoomButtons;

})(window);
