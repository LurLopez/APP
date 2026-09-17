/**
 * @fileoverview Módulo extraído de portfolioChart.js.
 */

(function (window) {
  const PCS = window.PortfolioChartState;

  function updateQuickRangeButtonsUi(panel) {
    if (!PCS.cachedData?.points?.length) return;
    const total = PCS.cachedData.points.length;
    let matchingKey = null;
    if (PCS.sliceStart === 0 && PCS.sliceEnd === total - 1) {
      matchingKey = 'all';
    } else {
      for (const [key] of CHART_RANGES) {
        if (key === 'all') continue;
        const { start, end } = computeSliceIndicesForRange(PCS.cachedData.points, key);
        if (Math.abs(start - PCS.sliceStart) <= 1 && Math.abs(end - PCS.sliceEnd) <= 1) {
          matchingKey = key;
          break;
        }
      }
    }
    panel.querySelectorAll('[data-pf-range]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.pfRange === matchingKey);
    });
  }

  function updateTimelineSliderUi(panel) {
    if (!PCS.cachedData?.points?.length) return;
    const total = PCS.cachedData.points.length;
    const pStart = PCS.sliceStart / Math.max(1, total - 1);
    const pEnd = PCS.sliceEnd / Math.max(1, total - 1);

    const windowEl = panel.querySelector('[data-timeline-window]');
    const maskLeft = panel.querySelector('[data-timeline-mask-left]');
    const maskRight = panel.querySelector('[data-timeline-mask-right]');
    const fromDateEl = panel.querySelector('[data-timeline-from-date]');
    const toDateEl = panel.querySelector('[data-timeline-to-date]');

    if (windowEl) {
      windowEl.style.left = `${(pStart * 100).toFixed(3)}%`;
      windowEl.style.width = `${Math.max(0.5, (pEnd - pStart) * 100).toFixed(3)}%`;
    }
    if (maskLeft) {
      maskLeft.style.width = `${(pStart * 100).toFixed(3)}%`;
    }
    if (maskRight) {
      maskRight.style.left = `${(pEnd * 100).toFixed(3)}%`;
      maskRight.style.width = `${Math.max(0, (1 - pEnd) * 100).toFixed(3)}%`;
    }
    if (fromDateEl && PCS.cachedData.points[PCS.sliceStart]) {
      fromDateEl.textContent = fmtDateDisplay(PCS.cachedData.points[PCS.sliceStart].date);
    }
    if (toDateEl && PCS.cachedData.points[PCS.sliceEnd]) {
      toDateEl.textContent = fmtDateDisplay(PCS.cachedData.points[PCS.sliceEnd].date);
    }
  }

  function scheduleChartRedraw(panel) {
    if (PCS.redrawRaf) return;
    PCS.redrawRaf = requestAnimationFrame(() => {
      PCS.redrawRaf = null;
      renderChartMainSvg(panel);
      updateTimelineSliderUi(panel);
    });
  }

  function renderTimelineSparkline(panel, allPoints, labels) {
    const sparklineSvg = panel.querySelector('[data-timeline-sparkline]');
    if (!sparklineSvg || !allPoints.length) return;

    const vals = allPoints.map((pt) => {
      const v = pt.series?.find((val) => val !== null && val !== undefined && Number.isFinite(Number(val)));
      return v !== undefined ? Number(v) : null;
    });

    const validVals = vals.filter((v) => v !== null);
    if (!validVals.length) return;

    const isCenteredMetric = PCS.metric === 'gainPct' || PCS.metric === 'gainAmount' || PCS.metric === 'gainWithDividendsPct' || PCS.metric === 'gainWithDividendsAmount';
    let min;
    let max;

    if (isCenteredMetric) {
      const maxAbs = Math.max(...validVals.map((v) => Math.abs(v)), 0);
      const bound = maxAbs > 0 ? maxAbs * 1.1 : 10;
      min = -bound;
      max = bound;
    } else {
      const maxVal = Math.max(...validVals, 0);
      min = 0;
      max = maxVal > 0 ? maxVal * 1.1 : 5;
    }

    const w = 760;
    const h = 32;
    let d = '';
    let areaD = '';
    let inSeg = false;
    let lastX = 0;
    const baseY = (h - 2 - ((Math.max(0, min) - min) / (max - min)) * (h - 6)).toFixed(1);

    vals.forEach((v, i) => {
      const px = ((i / Math.max(1, vals.length - 1)) * w).toFixed(1);
      if (v !== null) {
        const py = (h - 2 - ((v - min) / (max - min)) * (h - 6)).toFixed(1);
        if (!inSeg) {
          d += `${d ? ' ' : ''}M${px},${py}`;
          areaD += `${areaD ? ' ' : ''}M${px},${baseY} L${px},${py}`;
          inSeg = true;
        } else {
          d += ` L${px},${py}`;
          areaD += ` L${px},${py}`;
        }
        lastX = px;
      } else {
        if (inSeg) {
          areaD += ` L${lastX},${baseY} Z`;
          inSeg = false;
        }
      }
    });
    if (inSeg) {
      areaD += ` L${lastX},${baseY} Z`;
    }

    sparklineSvg.innerHTML = `
      <defs>
        <linearGradient id="pf-spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.30"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.05"/>
        </linearGradient>
      </defs>
      ${areaD ? `<path d="${areaD}" fill="url(#pf-spark-grad)"/>` : ''}
      ${d ? `<path d="${d}" fill="none" stroke="#93c5fd" stroke-width="1.2" stroke-linejoin="round"/>` : ''}`;
  }

  function zoomChartByStep(panel, direction) {
    if (!PCS.cachedData?.points?.length) return;
    const total = PCS.cachedData.points.length;
    if (total <= 3) return;

    if (direction === 'reset') {
      PCS.sliceStart = 0;
      PCS.sliceEnd = total - 1;
      PCS.range = 'all';
      scheduleChartRedraw(panel);
      updateTimelineSliderUi(panel);
      updateQuickRangeButtonsUi(panel);
      return;
    }

    const currentSpan = PCS.sliceEnd - PCS.sliceStart;
    const factor = direction === 'in' ? 0.70 : 1.40;
    let newSpan = Math.round(currentSpan * factor);
    if (direction === 'in' && newSpan >= currentSpan) newSpan = currentSpan - 1;
    if (direction === 'out' && newSpan <= currentSpan) newSpan = currentSpan + 1;

    const minSpan = Math.min(3, total - 1);
    const maxSpan = total - 1;
    newSpan = Math.max(minSpan, Math.min(maxSpan, newSpan));

    if (newSpan === currentSpan) return;

    const centerIdx = PCS.sliceStart + currentSpan / 2;
    let newStart = Math.round(centerIdx - newSpan / 2);
    let newEnd = newStart + newSpan;

    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(total - 1, newSpan);
    } else if (newEnd > total - 1) {
      newEnd = total - 1;
      newStart = Math.max(0, total - 1 - newSpan);
    }

    PCS.sliceStart = newStart;
    PCS.sliceEnd = newEnd;
    scheduleChartRedraw(panel);
    updateTimelineSliderUi(panel);
    updateQuickRangeButtonsUi(panel);
  }
window.updateQuickRangeButtonsUi = updateQuickRangeButtonsUi;
window.updateTimelineSliderUi = updateTimelineSliderUi;
window.scheduleChartRedraw = scheduleChartRedraw;
window.renderTimelineSparkline = renderTimelineSparkline;
window.zoomChartByStep = zoomChartByStep;

})(window);
