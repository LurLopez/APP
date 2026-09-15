/**
 * @fileoverview Módulo extraído de portfolioChart.js.
 */

(function (window) {
  const PCS = window.PortfolioChartState;

  function computeNiceStep(val) {
    if (!Number.isFinite(val) || val <= 0) return 1;
    const exponent = Math.floor(Math.log10(val));
    const fraction = val / Math.pow(10, exponent);
    let niceFraction;
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 2.5) niceFraction = 2.5;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
    return niceFraction * Math.pow(10, exponent);
  }

  function computeChartScale(values, isCenteredMetric, metric) {
    if (!values || !values.length) {
      return { min: -10, max: 10, ticks: [-10, -5, 0, 5, 10], step: 5 };
    }
    if (isCenteredMetric) {
      const minVal = Math.min(...values, 0);
      const maxVal = Math.max(...values, 0);
      const span = Math.max(maxVal - minVal, 0.001);
      if (span <= 0.001) {
        const bound = metric === 'gainAmount' ? 50 : 5;
        return { min: -bound, max: bound, ticks: [-bound, -bound / 2, 0, bound / 2, bound], step: bound / 2 };
      }
      const targetStep = (span * 1.08) / 5;
      const step = computeNiceStep(targetStep);
      const negSteps = minVal < 0 ? Math.max(1, Math.ceil((Math.abs(minVal) * 1.04) / step)) : 0;
      const posSteps = maxVal > 0 ? Math.max(1, Math.ceil((maxVal * 1.04) / step)) : 0;

      const finalNegSteps = Math.max(negSteps, 0);
      const finalPosSteps = Math.max(posSteps, 0);
      const min = -finalNegSteps * step;
      const max = finalPosSteps * step;

      if (min === max) {
        return { min: -step, max: step, ticks: [-step, 0, step], step };
      }

      const ticks = [];
      for (let i = -finalNegSteps; i <= finalPosSteps; i++) {
        ticks.push(i * step);
      }
      return { min, max, ticks, step };
    } else {
      const maxVal = Math.max(...values, 0);
      if (maxVal <= 0.001) {
        const bound = metric === 'weight' ? 10 : 5;
        return { min: 0, max: bound, ticks: [0, bound / 4, bound / 2, bound * 0.75, bound], step: bound / 4 };
      }
      const targetStep = (maxVal * 1.08) / 4;
      const step = computeNiceStep(targetStep);
      const numSteps = Math.max(1, Math.ceil((maxVal * 1.04) / step));
      const bound = step * numSteps;
      const ticks = [];
      for (let i = 0; i <= numSteps; i++) {
        ticks.push(i * step);
      }
      return { min: 0, max: bound, ticks, step };
    }
  }

  function getActiveChartGeometry(panel) {
    const isFs = panel?.classList.contains('is-fullscreen') || document.fullscreenElement === panel;
    const width = isFs ? 1120 : 860;
    const height = isFs ? 560 : 430;
    const pad = isFs ? { left: 70, right: 20, top: 24, bottom: 34 } : { left: 62, right: 18, top: 20, bottom: 30 };
    const innerWidth = width - pad.left - pad.right;
    const innerHeight = height - pad.top - pad.bottom;
    return { isFs, width, height, pad, innerWidth, innerHeight };
  }

  function chartFormat(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    if (PCS.metric === 'gainPct') return fmtSignedPct(value);
    if (PCS.metric === 'gainAmount') return fmtSigned(value);
    return fmtPct(value);
  }

  function chartAxisFormat(value) {
    if (!Number.isFinite(Number(value))) return '—';
    const num = Math.abs(value) < 1e-9 ? 0 : Number(value);
    const formatted = formatNumber(Math.abs(num), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (PCS.metric === 'gainAmount') {
      if (num > 0) return `+$${formatted}`;
      if (num < 0) return `-$${formatted}`;
      return `$${formatted}`;
    }
    if (PCS.metric === 'gainPct') {
      if (num > 0) return `+${formatted} %`;
      if (num < 0) return `-${formatted} %`;
      return `${formatted} %`;
    }
    return `${formatted} %`;
  }
window.computeNiceStep = computeNiceStep;
window.computeChartScale = computeChartScale;
window.getActiveChartGeometry = getActiveChartGeometry;
window.chartFormat = chartFormat;
window.chartAxisFormat = chartAxisFormat;

})(window);
