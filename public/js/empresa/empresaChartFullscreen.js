/**
 * @fileoverview Módulo extraído de empresaPriceChart.js.
 */

(function (window) {

function toggleFullscreen(element) {
  if (!element) return;
  const isVal = element.id === 'val-chart-block' || element.classList.contains('val-chart-block');
  const isMetrics = element.id === 'metrics-chart-block' || element.classList.contains('metrics-chart-block');
  const rerenderTarget = () => {
    if (isMetrics) {
      if (typeof renderMetricsChart === 'function') renderMetricsChart();
    } else if (isVal) {
      renderValuationChart();
    } else {
      renderPriceChart();
    }
  };
  const rerender = () => {
    requestAnimationFrame(rerenderTarget);
    setTimeout(rerenderTarget, 60);
    setTimeout(rerenderTarget, 180);
  };
  if (document.fullscreenElement === element || element.classList.contains('is-fullscreen')) {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(rerender).catch(() => {
          rerender();
        });
      }
    } else {
      element.classList.remove('is-fullscreen');
      rerender();
    }
    return;
  }
  if (element.requestFullscreen) {
    element.requestFullscreen().then(() => {
      rerender();
    }).catch(() => {
      element.classList.toggle('is-fullscreen');
      rerender();
    });
  } else {
    element.classList.toggle('is-fullscreen');
    rerender();
  }
}

function openChartFullscreen() {
  document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === 'perfil'));
  showSection('perfil');
  const chartBlock = document.querySelector('#company-chart-block') || document.querySelector('.chart-block');
  toggleFullscreen(chartBlock);
}
window.toggleFullscreen = toggleFullscreen;
window.openChartFullscreen = openChartFullscreen;

})(window);
