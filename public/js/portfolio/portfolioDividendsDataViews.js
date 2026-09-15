/**
 * @fileoverview Datos y distribución de dividendos de la cartera.
 */

(function (window) {
  const DS = window.PortfolioDividendsState;
    const fmt = () => window.PortfolioFormatting || {};
    const dataMod = () => window.PortfolioDividendsData || {};
    const donutsMod = () => window.PortfolioDonuts || {};

  function escapeHtml(value) {
    return fmt().escapeHtml ? fmt().escapeHtml(value) : String(value ?? '');
  }

  function fmtEur(value) {
    return fmt().fmtEur ? fmt().fmtEur(value) : `${value} €`;
  }

  function fmtPct(value) {
    return fmt().fmtPct ? fmt().fmtPct(value) : `${value} %`;
  }

  function portfolioLogoHtml(item) {
    return donutsMod().portfolioLogoHtml ? donutsMod().portfolioLogoHtml(item) : '';
  }

  function getDividendData(pfData) {
    return dataMod().getDividendData ? dataMod().getDividendData(pfData) : {};
  }

  function dividendDistributionHtml(d) {
    const dist = dataMod().calcDistributionData(d, DS.dividendDistMode, DS.dividendDistPeriod, DS.dividendDistMetric, DS.dividendDistTimelineYear);
    const size = 320;
    const center = size / 2;
    const radius = 110;
    const strokeWidth = 38;
    const circumference = 2 * Math.PI * radius;

    let accumulatedPct = 0;
    let slicesSvg = '';

    if (dist.items.length === 0 || dist.total <= 0) {
      slicesSvg = `
        <circle cx="${center}" cy="${center}" r="${radius}"
          fill="none" stroke="#e2e8f0" stroke-width="${strokeWidth}">
        </circle>`;
    } else {
      slicesSvg = dist.items.map((it, index) => {
        const slicePct = it.pct;
        const strokeDash = (slicePct / 100) * circumference;
        const strokeOffset = -(accumulatedPct / 100) * circumference;
        accumulatedPct += slicePct;

        return `
          <circle class="pf-dist-slice"
            cx="${center}" cy="${center}" r="${radius}"
            fill="none"
            stroke="${it.color}"
            stroke-width="${strokeWidth}"
            stroke-dasharray="${strokeDash} ${circumference - strokeDash}"
            stroke-dashoffset="${strokeOffset}"
            data-dist-index="${index}"
            data-dist-ticker="${escapeHtml(it.ticker)}"
            data-dist-name="${escapeHtml(it.name)}"
            data-dist-color="${it.color}"
            data-dist-pct="${it.pct.toFixed(2)}"
            data-dist-val="${it.value.toFixed(2)}">
          </circle>`;
      }).join('');
    }

    const legendItemsHtml = dist.items.length > 0
      ? dist.items.map((it, index) => {
        const displayValue = dist.isPct ? `${fmtPct(it.pct)}` : `${fmtEur(it.value)}`;
        return `
          <div class="pf-dist-legend-row"
            data-dist-index="${index}"
            data-dist-ticker="${escapeHtml(it.ticker)}"
            data-dist-name="${escapeHtml(it.name)}"
            data-dist-color="${it.color}"
            data-dist-pct="${it.pct.toFixed(2)}"
            data-dist-val="${it.value.toFixed(2)}">
            <span class="pf-dist-legend-swatch" style="background-color:${it.color};"></span>
            ${portfolioLogoHtml({ ticker: it.ticker, companyName: it.name })}
            <span class="pf-dist-legend-name" title="${escapeHtml(it.name)}">${escapeHtml(it.name)}</span>
            <strong class="pf-dist-legend-val">${displayValue}</strong>
          </div>`;
      }).join('')
      : `<div style="padding: 24px; text-align: center; color: #94a3b8; font-size: 11.5px;">No hay datos de dividendos en este periodo.</div>`;

    const centerSubtitle = dist.periodTitle === 'TTM'
      ? 'Dividendos brutos TTM'
      : (dist.periodTitle === 'Histórico' ? 'Dividendos históricos' : `Dividendos ${dist.periodTitle}`);
    const centerMainText = dist.total > 0 ? fmtEur(dist.total) : '0,00 €';

    const cardSubtitle = DS.dividendDistMode === 'month'
      ? `Distribución de tus dividendos del mes de ${dist.periodTitle}.`
      : `Distribución de tus dividendos ${dist.periodTitle === 'TTM' ? 'de los últimos 12 meses (TTM)' : (dist.periodTitle === 'Histórico' ? 'de todo el histórico' : 'del año ' + dist.periodTitle)}.`;

    let periodSelectOptionsHtml = '';
    if (DS.dividendDistMode === 'month') {
      const months = d.ttmStackedMonths || [];
      periodSelectOptionsHtml = months.map((m) => `
        <option value="${m.key}" ${m.key === dist.periodKey ? 'selected' : ''}>${escapeHtml(m.label)}</option>
      `).join('');
    } else {
      const yearOptions = [
        { val: 'TTM', label: 'TTM' },
        { val: '2027', label: '2027 (Previsto)' },
        { val: '2026', label: '2026' },
        { val: '2025', label: '2025' },
        { val: '2024', label: '2024' },
        { val: '2023', label: '2023' },
        { val: '2022', label: '2022' },
        { val: '2021', label: '2021' },
        { val: '2020', label: '2020' },
        { val: '2019', label: '2019' },
        { val: '2018', label: '2018' },
        { val: '2017', label: '2017' },
        { val: 'all', label: 'Histórico' },
      ];
      periodSelectOptionsHtml = yearOptions.map((opt) => `
        <option value="${opt.val}" ${opt.val === dist.periodKey ? 'selected' : ''}>${opt.label}</option>
      `).join('');
    }

    let timelineTicksHtml = '';
    let progressPct = 100;
    if (DS.dividendDistMode === 'month') {
      const months = d.ttmStackedMonths || [];
      const activeIdx = months.findIndex((m) => m.key === dist.periodKey);
      const safeIdx = activeIdx >= 0 ? activeIdx : months.length - 1;
      progressPct = months.length > 1 ? (safeIdx / (months.length - 1)) * 100 : 100;

      timelineTicksHtml = months.map((m) => `
        <span class="pf-dist-timeline-tick ${m.key === dist.periodKey ? 'active' : ''}"
          data-dist-month-key="${m.key}"
          title="${escapeHtml(m.label)}">
          ${escapeHtml(m.label.split(' ')[0])}
        </span>
      `).join('');
    } else {
      const allYearTicks = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027];
      const displayTicks = [2017, 2019, 2021, 2023, 2025, 2026, 2027];
      const activeYear = Number(dist.periodKey) || DS.dividendDistTimelineYear || 2026;
      const activeIdx = allYearTicks.indexOf(activeYear);
      const safeIdx = activeIdx >= 0 ? activeIdx : allYearTicks.length - 2;
      progressPct = allYearTicks.length > 1 ? (safeIdx / (allYearTicks.length - 1)) * 100 : 100;

      timelineTicksHtml = displayTicks.map((yr) => `
        <span class="pf-dist-timeline-tick ${yr === activeYear ? 'active' : ''}"
          data-dist-year="${yr}">
          ${yr}
        </span>
      `).join('');
    }

    return `
      <div class="pf-dividend-card pf-dist-card">
        <div class="pf-card-head">
          <div>
            <h4>Distribución de tus dividendos</h4>
            <p>${escapeHtml(cardSubtitle)}</p>
          </div>
          <div class="pf-dist-head-controls">
            <div class="pf-segmented-toggle" role="group" aria-label="Modo de distribución">
              <button class="pf-seg-btn ${DS.dividendDistMode === 'year' ? 'active' : ''}" type="button" data-dist-mode="year">Año</button>
              <button class="pf-seg-btn ${DS.dividendDistMode === 'month' ? 'active' : ''}" type="button" data-dist-mode="month">Mes</button>
            </div>
            <select class="pf-select pf-dist-select" data-dist-period>
              ${periodSelectOptionsHtml}
            </select>
            <select class="pf-select pf-dist-select" data-dist-metric>
              <option value="pct" ${dist.isPct ? 'selected' : ''}>Porcentaje</option>
              <option value="val" ${!dist.isPct ? 'selected' : ''}>Valor</option>
            </select>
          </div>
        </div>

        <div class="pf-dist-layout">
          <div class="pf-dist-visual-col">
            <div class="pf-dist-donut-wrap">
              <svg class="pf-dist-donut-svg" viewBox="0 0 ${size} ${size}">
                <g transform="rotate(-90 ${center} ${center})">
                  ${slicesSvg}
                </g>
              </svg>
              <div class="pf-dist-donut-center" id="pf-dist-donut-center"
                data-default-subtitle="${escapeHtml(centerSubtitle)}"
                data-default-main="${escapeHtml(centerMainText)}">
                <span>${escapeHtml(centerSubtitle)}</span>
                <strong>${escapeHtml(centerMainText)}</strong>
              </div>
            </div>

            <div class="pf-dist-timeline-bar">
              <button class="pf-dist-play-btn ${DS.dividendDistPlaying ? 'playing' : ''}" type="button" data-dist-play title="${DS.dividendDistPlaying ? 'Pausar' : 'Reproducir evolución'}">
                ${DS.dividendDistPlaying ? '❚❚' : '▷'}
              </button>
              <div class="pf-dist-timeline-track">
                <div class="pf-dist-timeline-ticks">
                  ${timelineTicksHtml}
                </div>
                <div class="pf-dist-timeline-line">
                  <div class="pf-dist-timeline-progress" style="width: ${progressPct}%;"></div>
                </div>
              </div>
              <button class="pf-dist-download-btn" type="button" data-dist-download title="Descargar imagen del gráfico">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
            </div>
          </div>

          <div class="pf-dist-legend-col">
            <div class="pf-dist-legend-list">${legendItemsHtml}</div>
          </div>
        </div>
      </div>`;
  }

window.escapeHtml = escapeHtml;
window.fmtEur = fmtEur;
window.fmtPct = fmtPct;
window.portfolioLogoHtml = portfolioLogoHtml;
window.getDividendData = getDividendData;
window.dividendDistributionHtml = dividendDistributionHtml;
window.fmt = fmt;
window.dataMod = dataMod;
window.donutsMod = donutsMod;

})(window);
