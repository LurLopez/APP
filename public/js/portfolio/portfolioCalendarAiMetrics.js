/**
 * @fileoverview Métricas de IA y resaltados del calendario (extraído de portfolioCalendar.js).
 */

(function (window) {
  const CS = window.PortfolioCalendarState;


  function renderCalendarAiMetricsTable(report) {
    if (!report || !report.horizons || !report.horizons.length) return '';
    const h = report.horizons[0];
    const metrics = h.metrics || {};
    const sales = metrics.sales?.current ? `${formatNumber(metrics.sales.current)} M$` : '—';
    const salesGrowth = metrics.sales?.growthPct !== undefined && metrics.sales?.growthPct !== null ? `${metrics.sales.growthPct > 0 ? '+' : ''}${metrics.sales.growthPct}%` : '';
    const grossMargin = metrics.grossMargin?.current !== undefined ? `${metrics.grossMargin.current}%` : '—';
    const netIncome = metrics.netIncome?.current ? `${formatNumber(metrics.netIncome.current)} M$` : '—';
    const fcf = metrics.fcf?.current ? `${formatNumber(metrics.fcf.current)} M$` : '—';

    return `
      <div class="pf-cal-ai-metrics-grid">
        <div class="pf-cal-ai-metric-cell">
          <span class="pf-cal-ai-metric-label">Ingresos</span>
          <span class="pf-cal-ai-metric-val">${sales}</span>
          ${salesGrowth ? `<span class="pf-cal-ai-metric-growth ${metrics.sales?.growthPct >= 0 ? 'growth-pos' : 'growth-neg'}">${salesGrowth}</span>` : ''}
        </div>
        <div class="pf-cal-ai-metric-cell">
          <span class="pf-cal-ai-metric-label">Margen Bruto</span>
          <span class="pf-cal-ai-metric-val">${grossMargin}</span>
        </div>
        <div class="pf-cal-ai-metric-cell">
          <span class="pf-cal-ai-metric-label">Beneficio Neto</span>
          <span class="pf-cal-ai-metric-val">${netIncome}</span>
        </div>
        <div class="pf-cal-ai-metric-cell">
          <span class="pf-cal-ai-metric-label">Flujo de Caja Libre</span>
          <span class="pf-cal-ai-metric-val">${fcf}</span>
        </div>
      </div>
    `;
  }

  function renderCalendarAiHighlights(report) {
    if (!report) return '';
    const notes = report.extraNotes || [];
    if (!notes.length) return '';
    const itemsHtml = notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
    return `
      <div class="pf-cal-ai-highlights">
        <h6>Aspectos clave destacados por la IA:</h6>
        <ul>${itemsHtml}</ul>
      </div>
    `;
  }

window.renderCalendarAiMetricsTable = renderCalendarAiMetricsTable;
window.renderCalendarAiHighlights = renderCalendarAiHighlights;

})(window);
