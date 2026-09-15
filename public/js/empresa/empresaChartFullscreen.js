/**
 * @fileoverview Módulo extraído de empresaPriceChart.js.
 */

(function (window) {

function toggleFullscreen(element) {
  if (!element) return;
  const isVal = element.id === 'val-chart-block' || element.classList.contains('val-chart-block');
  const rerender = () => {
    requestAnimationFrame(() => {
      if (isVal) renderValuationChart();
      else renderPriceChart();
    });
    setTimeout(() => {
      if (isVal) renderValuationChart();
      else renderPriceChart();
    }, 60);
    setTimeout(() => {
      if (isVal) renderValuationChart();
      else renderPriceChart();
    }, 180);
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
