/**
 * @fileoverview Módulo extraído de portfolioChart.js.
 */

(function (window) {
  const PCS = window.PortfolioChartState;

  function attachTimelineEvents(panel) {
    const track = panel.querySelector('[data-timeline-track]');
    const windowEl = panel.querySelector('[data-timeline-window]');
    const handleLeft = panel.querySelector('[data-timeline-handle="left"]');
    const handleRight = panel.querySelector('[data-timeline-handle="right"]');
    const windowBody = panel.querySelector('[data-timeline-window-body]');
    if (!track || !windowEl || !handleLeft || !handleRight) return;

    let dragMode = null; // 'left' | 'right' | 'window'
    let dragStartX = 0;
    let initStartIdx = 0;
    let initEndIdx = 0;

    function onPointerDown(mode, event) {
      if (event.button !== 0) return;
      dragMode = mode;
      dragStartX = event.clientX;
      initStartIdx = PCS.sliceStart;
      initEndIdx = PCS.sliceEnd;
      event.target.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      windowEl.classList.add('dragging');
      if (mode === 'left') handleLeft.classList.add('active');
      if (mode === 'right') handleRight.classList.add('active');
    }

    handleLeft.addEventListener('pointerdown', (e) => onPointerDown('left', e));
    handleRight.addEventListener('pointerdown', (e) => onPointerDown('right', e));
    windowBody?.addEventListener('pointerdown', (e) => onPointerDown('window', e));

    function onPointerMove(event) {
      if (!dragMode || !PCS.cachedData?.points?.length) return;
      const total = PCS.cachedData.points.length;
      if (total <= 1) return;

      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;

      if (dragMode === 'left') {
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const targetIdx = Math.round(ratio * (total - 1));
        const maxStart = Math.max(0, PCS.sliceEnd - 2);
        const newStart = Math.max(0, Math.min(maxStart, targetIdx));
        if (newStart !== PCS.sliceStart) {
          PCS.sliceStart = newStart;
          scheduleChartRedraw(panel);
          updateTimelineSliderUi(panel);
          updateQuickRangeButtonsUi(panel);
        }
      } else if (dragMode === 'right') {
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const targetIdx = Math.round(ratio * (total - 1));
        const minEnd = Math.min(total - 1, PCS.sliceStart + 2);
        const newEnd = Math.min(total - 1, Math.max(minEnd, targetIdx));
        if (newEnd !== PCS.sliceEnd) {
          PCS.sliceEnd = newEnd;
          scheduleChartRedraw(panel);
          updateTimelineSliderUi(panel);
          updateQuickRangeButtonsUi(panel);
        }
      } else if (dragMode === 'window') {
        const deltaX = event.clientX - dragStartX;
        const deltaRatio = deltaX / rect.width;
        const deltaIdx = Math.round(deltaRatio * (total - 1));
        const span = initEndIdx - initStartIdx;
        let newStart = initStartIdx + deltaIdx;
        let newEnd = initEndIdx + deltaIdx;

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
    }

    function onPointerEnd(event) {
      if (!dragMode) return;
      try {
        event.target.releasePointerCapture(event.pointerId);
      } catch {}
      dragMode = null;
      windowEl.classList.remove('dragging');
      handleLeft.classList.remove('active');
      handleRight.classList.remove('active');
    }

    handleLeft.addEventListener('pointermove', onPointerMove);
    handleRight.addEventListener('pointermove', onPointerMove);
    windowBody?.addEventListener('pointermove', onPointerMove);

    handleLeft.addEventListener('pointerup', onPointerEnd);
    handleRight.addEventListener('pointerup', onPointerEnd);
    windowBody?.addEventListener('pointerup', onPointerEnd);

    handleLeft.addEventListener('pointercancel', onPointerEnd);
    handleRight.addEventListener('pointercancel', onPointerEnd);
    windowBody?.addEventListener('pointercancel', onPointerEnd);

    // Track click to shift window
    track.addEventListener('click', (event) => {
      if (event.target.closest('[data-timeline-window]')) return;
      const total = PCS.cachedData?.points?.length;
      if (!total || total <= 1) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const clickIdx = Math.round(ratio * (total - 1));
      const span = PCS.sliceEnd - PCS.sliceStart;
      let newStart = Math.round(clickIdx - span / 2);
      let newEnd = newStart + span;
      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, span);
      } else if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, total - 1 - span);
      }
      PCS.sliceStart = newStart;
      PCS.sliceEnd = newEnd;
      scheduleChartRedraw(panel);
      updateTimelineSliderUi(panel);
      updateQuickRangeButtonsUi(panel);
    });
  }

  function syncPickerChecked(panel) {
    const pickerBox = panel.querySelector('[data-pf-chart-picker-box]');
    if (!pickerBox) return;
    const selected = new Set(PCS.selectedIds);
    pickerBox.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      const isChecked = selected.has(input.value);
      input.checked = isChecked;
      input.closest('.pf-chart-choice')?.classList.toggle('selected', isChecked);
    });
    const pickerBtn = panel.querySelector('[data-pf-chart-picker]');
    if (pickerBtn) pickerBtn.querySelector('span').textContent = `Elementos (${PCS.selectedIds.length})`;
    const counterBadge = pickerBox.querySelector('[data-picker-counter]');
    if (counterBadge) counterBadge.textContent = `${PCS.selectedIds.length} / 20 seleccionados`;
  }
window.attachTimelineEvents = attachTimelineEvents;
window.syncPickerChecked = syncPickerChecked;

})(window);
