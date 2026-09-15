/**
 * @fileoverview Utilidades compartidas del tooltip de los gráficos de empresa (extraído de empresa.js).
 */

(function (window) {

function ensureChartTooltip() {
  let tip = document.querySelector('#chart-tooltip');
  const targetParent = document.fullscreenElement || document.body;
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'chart-tooltip';
    tip.className = 'chart-tooltip';
    targetParent.appendChild(tip);
  } else if (tip.parentNode !== targetParent) {
    targetParent.appendChild(tip);
  }
  return tip;
}

function hideChartTooltip() {
  const tooltip = document.querySelector('#chart-tooltip');
  if (tooltip) tooltip.hidden = true;
}

function positionChartTooltip(tip, clientX, clientY) {
  const pad = 14;
  const tipW = tip.offsetWidth || 230;
  const tipH = tip.offsetHeight || 130;
  let left = clientX + pad;
  let top = clientY - tipH / 2;

  if (left + tipW > window.innerWidth - 10) {
    left = clientX - tipW - pad;
  }
  if (top < 10) top = 10;
  if (top + tipH > window.innerHeight - 10) {
    top = window.innerHeight - tipH - 10;
  }
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
window.ensureChartTooltip = ensureChartTooltip;
window.hideChartTooltip = hideChartTooltip;
window.positionChartTooltip = positionChartTooltip;

})(window);
