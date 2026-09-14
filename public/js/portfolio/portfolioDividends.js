/**
 * @file portfolioDividends.js
 * @description Renderizado del panel de dividendos, distribución en anillo, gráfico mensual apilado y matriz.
 */

(function (window) {
  'use strict';

  let dividendDistTimelineYear = 2026;
  let dividendDistMode = 'year';      // 'year' | 'month'
  let dividendDistPeriod = 'TTM';     // 'TTM' | '2027' | ... | 'all'
  let dividendDistMetric = 'pct';     // 'pct' | 'val'
  let dividendDistPlaying = false;
  let dividendDistPlayTimer = null;
  let dividendShowMonthlyAverage = true;
  let dividendSummaryPeriod = 'TTM';
  let dividendSummaryCollapsed = false;

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
    const dist = dataMod().calcDistributionData(d, dividendDistMode, dividendDistPeriod, dividendDistMetric, dividendDistTimelineYear);
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

    const cardSubtitle = dividendDistMode === 'month'
      ? `Distribución de tus dividendos del mes de ${dist.periodTitle}.`
      : `Distribución de tus dividendos ${dist.periodTitle === 'TTM' ? 'de los últimos 12 meses (TTM)' : (dist.periodTitle === 'Histórico' ? 'de todo el histórico' : 'del año ' + dist.periodTitle)}.`;

    let periodSelectOptionsHtml = '';
    if (dividendDistMode === 'month') {
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
    if (dividendDistMode === 'month') {
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
      const activeYear = Number(dist.periodKey) || dividendDistTimelineYear || 2026;
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
              <button class="pf-seg-btn ${dividendDistMode === 'year' ? 'active' : ''}" type="button" data-dist-mode="year">Año</button>
              <button class="pf-seg-btn ${dividendDistMode === 'month' ? 'active' : ''}" type="button" data-dist-mode="month">Mes</button>
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
              <button class="pf-dist-play-btn ${dividendDistPlaying ? 'playing' : ''}" type="button" data-dist-play title="${dividendDistPlaying ? 'Pausar' : 'Reproducir evolución'}">
                ${dividendDistPlaying ? '❚❚' : '▷'}
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

  function dividendStackedChartHtml(d) {
    const months = d.ttmStackedMonths || [];
    const maxStackedVal = Math.max(10, ...months.map((m) => m.total || 0));
    const stackedYAxis = dataMod().calcNiceYAxis ? dataMod().calcNiceYAxis(maxStackedVal, 4) : { max: 100 };
    const avg = d.averageMonthly || 0;
    const avgTopPct = Math.max(0, Math.min(100, 100 - (avg / stackedYAxis.max) * 100));

    const barsHtml = months.map((m) => {
      const barHeightPct = Math.min(100, Math.max(2, (m.total / stackedYAxis.max) * 100));
      const segmentsHtml = (m.items || []).map((item) => {
        const segHeightPct = m.total > 0 ? (item.amount / m.total) * 100 : 0;
        return `
          <div class="pf-stacked-seg"
            style="height:${segHeightPct}%; background-color:${item.color};"
            data-seg-name="${escapeHtml(item.name)}"
            data-seg-amount="${fmtEur(item.amount)}"
            data-seg-month="${m.label}">
          </div>`;
      }).reverse().join('');

      return `
        <div class="pf-stacked-col">
          <span class="pf-stacked-top-val">${m.displayTotal}</span>
          <div class="pf-stacked-bar-wrap">
            <div class="pf-stacked-bar" style="height: ${barHeightPct}%;">${segmentsHtml}</div>
          </div>
          <span class="pf-stacked-month-label">${m.label}</span>
        </div>`;
    }).join('');

    return `
      <div class="pf-dividend-card pf-stacked-card">
        <div class="pf-stacked-chart-area">
          ${dividendShowMonthlyAverage ? `
            <div class="pf-stacked-avg-line-wrap" style="top:${avgTopPct}%;">
              <span class="pf-stacked-avg-pill">${fmtEur(avg)}</span>
              <div class="pf-stacked-avg-dashed"></div>
            </div>` : ''}

          <div class="pf-stacked-columns">${barsHtml}</div>
        </div>

        <div class="pf-stacked-footer">
          <label class="pf-stacked-avg-toggle">
            <input type="checkbox" id="pf-stacked-avg-check" ${dividendShowMonthlyAverage ? 'checked' : ''}>
            <span>mostrar promedio mensual de dividendos.</span>
          </label>
        </div>
      </div>`;
  }

  function dividendMatrixHtml(d) {
    const holdings = d.holdings || [];
    const years = [2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];

    const rowsHtml = holdings.map((h) => {
      const yearCellsHtml = years.map((y) => {
        const val = h.years ? h.years[y] : undefined;
        return `<td>${val !== undefined ? fmtEur(val) : '—'}</td>`;
      }).join('');

      return `
        <tr data-ticker="${escapeHtml(h.ticker)}">
          <td class="pf-matrix-sticky-company">
            <div class="pf-broker-company">
              ${portfolioLogoHtml({ ticker: h.ticker, companyName: h.name })}
              <span class="pf-broker-company-copy">
                <strong>${escapeHtml(h.name)}</strong>
                <small>${escapeHtml(h.ticker)}</small>
              </span>
            </div>
          </td>
          <td class="pf-matrix-sticky-sum">
            <span class="pf-matrix-sum-row">
              <span class="pf-matrix-growth-icon" aria-hidden="true">↗</span>
              <strong>${fmtEur(h.sum)}</strong>
            </span>
          </td>
          ${yearCellsHtml}
        </tr>`;
    }).join('');

    return `
      <div class="pf-dividend-card pf-matrix-card">
        <div class="pf-card-head">
          <div>
            <h4>Matriz de dividendos</h4>
          </div>
        </div>
        <div class="pf-matrix-table-wrap">
          <table class="pf-matrix-table">
            <thead>
              <tr>
                <th class="pf-matrix-sticky-company">Valor</th>
                <th class="pf-matrix-sticky-sum">Suma</th>
                ${years.map((y) => `<th>${y}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function dividendSummaryCardsHtml(d) {
    const summary = d.summary || {};
    const cards = d.monthlySummaryCards || [];

    const cardsHtml = cards.map((card) => {
      const paymentRowsHtml = (card.payments || []).map((p) => `
        <div class="pf-month-payment-row" data-ticker="${escapeHtml(p.ticker)}">
          <div class="pf-month-payment-left">
            ${portfolioLogoHtml({ ticker: p.ticker, companyName: p.name })}
            <div class="pf-month-payment-desc">
              <strong>${p.day}. ${escapeHtml(p.name)}</strong>
              <small>${p.shares} x ${fmtEur(p.perShare)}</small>
            </div>
          </div>
          <strong class="pf-month-payment-amount">${fmtEur(p.amount)}</strong>
        </div>
      `).join('');

      return `
        <div class="pf-month-card">
          <div class="pf-month-card-head">
            <div class="pf-month-card-title">
              <strong>${escapeHtml(card.title)}</strong>
              <span class="pf-month-card-count">${card.paymentCount} pagos</span>
            </div>
            <strong class="pf-month-card-total">${fmtEur(card.totalAmount)}</strong>
          </div>
          <div class="pf-month-card-body">
            ${paymentRowsHtml}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="pf-dividend-card pf-summary-grid-card">
        <div class="pf-card-head">
          <div>
            <h4>Resumen de dividendos</h4>
            <p>Has recibido dividendos brutos de ${fmtEur(summary.ttmTotal)} en los últimos 12 meses, distribuidos en ${summary.paymentCount} pagos y ${summary.payDatesCount} fechas de pago.</p>
          </div>
          <div class="pf-summary-head-controls">
            <button class="pf-summary-toggle-btn" type="button" data-div-summary-collapse title="${dividendSummaryCollapsed ? 'Expandir' : 'Plegar'}">
              ${dividendSummaryCollapsed ? '⌄' : '⌃'}
            </button>
            <select class="pf-select pf-summary-period-select" data-div-summary-period>
              <option value="TTM" ${dividendSummaryPeriod === 'TTM' ? 'selected' : ''}>TTM</option>
              <option value="2026" ${dividendSummaryPeriod === '2026' ? 'selected' : ''}>2026</option>
              <option value="2025" ${dividendSummaryPeriod === '2025' ? 'selected' : ''}>2025</option>
              <option value="2024" ${dividendSummaryPeriod === '2024' ? 'selected' : ''}>2024</option>
            </select>
          </div>
        </div>

        ${!dividendSummaryCollapsed ? `
          <div class="pf-month-cards-grid">
            ${cardsHtml}
          </div>` : ''}

        <div class="pf-card-footer pf-summary-footer">
          <button class="pf-footer-link pf-export-csv-btn" type="button" data-div-export-csv>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar CSV
          </button>
        </div>
      </div>`;
  }

  function exportDividendsCsv(pfData) {
    const d = getDividendData(pfData);
    const headers = ['Mes / Periodo', 'Día', 'Empresa', 'Ticker', 'Acciones', 'Dividendo por acción (€)', 'Total cobrado (€)'];
    const rows = [];

    for (const card of d.monthlySummaryCards || []) {
      for (const p of card.payments || []) {
        rows.push([
          card.title,
          p.day,
          p.name,
          p.ticker,
          p.shares,
          p.perShare.toFixed(2).replace('.', ','),
          p.amount.toFixed(2).replace('.', ','),
        ]);
      }
    }

    const csvValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(csvValue).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dividendos-cifra.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function dividendPanelHtml(pfData) {
    const d = getDividendData(pfData);
    return `
      <div class="pf-dividend-dashboard">
        ${dividendDistributionHtml(d)}
        ${dividendStackedChartHtml(d)}
        ${dividendMatrixHtml(d)}
        ${dividendSummaryCardsHtml(d)}
      </div>`;
  }

  function wireDividendDashboard(scope, { renderSection, onNavigate, getData } = {}) {
    if (!scope) return;

    const rerender = () => {
      if (typeof renderSection === 'function') renderSection();
    };

    // 1. Modos
    scope.querySelectorAll('[data-dist-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.distMode;
        if (mode === dividendDistMode) return;
        dividendDistMode = mode;
        if (dividendDistPlaying) {
          clearInterval(dividendDistPlayTimer);
          dividendDistPlayTimer = null;
          dividendDistPlaying = false;
        }
        if (dividendDistMode === 'month') {
          const d = getDividendData(getData ? getData() : null);
          const months = d.ttmStackedMonths || [];
          dividendDistPeriod = months.length > 0 ? months[months.length - 1].key : 'jul-26';
        } else {
          dividendDistPeriod = 'TTM';
          dividendDistTimelineYear = 2026;
        }
        rerender();
      });
    });

    scope.querySelectorAll('[data-dist-period]').forEach((sel) => {
      sel.addEventListener('change', () => {
        dividendDistPeriod = sel.value;
        if (dividendDistMode === 'year' && !['TTM', 'all'].includes(sel.value)) {
          dividendDistTimelineYear = Number(sel.value) || 2026;
        }
        rerender();
      });
    });

    scope.querySelectorAll('[data-dist-metric]').forEach((sel) => {
      sel.addEventListener('change', () => {
        dividendDistMetric = sel.value;
        rerender();
      });
    });

    scope.querySelectorAll('[data-dist-play]').forEach((btn) => {
      btn.addEventListener('click', () => {
        dividendDistPlaying = !dividendDistPlaying;
        if (dividendDistPlaying) {
          const d = getDividendData(getData ? getData() : null);
          if (dividendDistMode === 'month') {
            const months = d.ttmStackedMonths || [];
            let pIdx = months.findIndex((m) => m.key === dividendDistPeriod);
            if (pIdx < 0) pIdx = 0;
            dividendDistPlayTimer = setInterval(() => {
              pIdx = (pIdx + 1) % months.length;
              dividendDistPeriod = months[pIdx].key;
              rerender();
            }, 1100);
          } else {
            const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027];
            let currentYear = Number(dividendDistPeriod) || dividendDistTimelineYear || 2026;
            let pIdx = years.indexOf(currentYear);
            if (pIdx < 0) pIdx = 0;
            dividendDistPlayTimer = setInterval(() => {
              pIdx = (pIdx + 1) % years.length;
              dividendDistTimelineYear = years[pIdx];
              dividendDistPeriod = String(years[pIdx]);
              rerender();
            }, 1100);
          }
        } else {
          clearInterval(dividendDistPlayTimer);
          dividendDistPlayTimer = null;
          rerender();
        }
      });
    });

    scope.querySelectorAll('[data-dist-year]').forEach((tick) => {
      tick.addEventListener('click', () => {
        const yr = Number(tick.dataset.distYear);
        dividendDistTimelineYear = yr;
        dividendDistPeriod = String(yr);
        rerender();
      });
    });

    scope.querySelectorAll('[data-dist-month-key]').forEach((tick) => {
      tick.addEventListener('click', () => {
        dividendDistPeriod = tick.dataset.distMonthKey;
        rerender();
      });
    });

    scope.querySelectorAll('[data-dist-download]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const svg = scope.querySelector('.pf-dist-donut-svg');
        if (!svg) return;
        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(svg);
        if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
          source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
        const link = document.createElement('a');
        link.href = url;
        link.download = `distribucion-dividendos-${dividendDistMode}-${dividendDistPeriod}.svg`;
        link.click();
      });
    });

    scope.querySelectorAll('.pf-dist-slice, .pf-dist-legend-row').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        const idx = el.dataset.distIndex;
        const name = el.dataset.distName;
        const color = el.dataset.distColor || '#4f46e5';
        const pct = el.dataset.distPct;
        const val = Number(el.dataset.distVal) || 0;

        scope.querySelectorAll('.pf-dist-slice').forEach((s) => s.classList.toggle('highlighted', s.dataset.distIndex === idx));
        scope.querySelectorAll('.pf-dist-legend-row').forEach((r) => r.classList.toggle('highlighted', r.dataset.distIndex === idx));

        const centerEl = scope.querySelector('#pf-dist-donut-center');
        if (centerEl && name) {
          const valFormatted = fmtEur(val);
          const pctFormatted = fmtPct(Number(pct));
          const lineText = dividendDistMetric === 'pct' ? `${pctFormatted} (${valFormatted})` : `${valFormatted} (${pctFormatted})`;
          centerEl.innerHTML = `
            <span style="color:${color}; font-weight:600;">${escapeHtml(name)}</span>
            <strong>${lineText}</strong>
          `;
        }
      });

      el.addEventListener('mouseleave', () => {
        scope.querySelectorAll('.pf-dist-slice, .pf-dist-legend-row').forEach((item) => item.classList.remove('highlighted'));
        const centerEl = scope.querySelector('#pf-dist-donut-center');
        if (centerEl) {
          const sub = centerEl.dataset.defaultSubtitle || 'Dividendos';
          const main = centerEl.dataset.defaultMain || '0,00 €';
          centerEl.innerHTML = `
            <span>${escapeHtml(sub)}</span>
            <strong>${escapeHtml(main)}</strong>
          `;
        }
      });
    });

    const avgCheck = scope.querySelector('#pf-stacked-avg-check');
    if (avgCheck) {
      avgCheck.addEventListener('change', () => {
        dividendShowMonthlyAverage = avgCheck.checked;
        rerender();
      });
    }

    scope.querySelectorAll('.pf-stacked-seg').forEach((seg) => {
      seg.addEventListener('mouseenter', () => {
        const name = seg.dataset.segName;
        const amount = seg.dataset.segAmount;
        const month = seg.dataset.segMonth;
        let tooltip = document.querySelector('#pf-chart-tooltip');
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.id = 'pf-chart-tooltip';
          tooltip.className = 'pf-chart-tooltip';
          document.body.appendChild(tooltip);
        }
        tooltip.innerHTML = `<div><strong>${escapeHtml(name)}</strong><small>${month}: ${amount}</small></div>`;
        tooltip.hidden = false;
        const rect = seg.getBoundingClientRect();
        tooltip.style.top = `${rect.top - 40}px`;
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
      });
      seg.addEventListener('mouseleave', () => {
        const tooltip = document.querySelector('#pf-chart-tooltip');
        if (tooltip) tooltip.hidden = true;
      });
    });

    scope.querySelectorAll('.pf-matrix-table tbody tr[data-ticker]').forEach((row) => {
      row.addEventListener('click', () => onNavigate?.(row.dataset.ticker));
    });

    scope.querySelectorAll('[data-div-summary-collapse]').forEach((btn) => {
      btn.addEventListener('click', () => {
        dividendSummaryCollapsed = !dividendSummaryCollapsed;
        rerender();
      });
    });

    scope.querySelectorAll('[data-div-summary-period]').forEach((sel) => {
      sel.addEventListener('change', () => {
        dividendSummaryPeriod = sel.value;
        rerender();
      });
    });

    scope.querySelectorAll('[data-div-export-csv]').forEach((btn) => {
      btn.addEventListener('click', () => exportDividendsCsv(getData ? getData() : null));
    });

    scope.querySelectorAll('.pf-month-payment-row[data-ticker]').forEach((row) => {
      row.addEventListener('click', () => onNavigate?.(row.dataset.ticker));
    });
  }

  const PortfolioDividends = {
    dividendDistributionHtml,
    dividendStackedChartHtml,
    dividendMatrixHtml,
    dividendSummaryCardsHtml,
    exportDividendsCsv,
    dividendPanelHtml,
    wireDividendDashboard,
    get timelineYear() { return dividendDistTimelineYear; },
    set timelineYear(v) { dividendDistTimelineYear = v; },
    get mode() { return dividendDistMode; },
    set mode(v) { dividendDistMode = v; },
    get period() { return dividendDistPeriod; },
    set period(v) { dividendDistPeriod = v; },
    get metric() { return dividendDistMetric; },
    set metric(v) { dividendDistMetric = v; }
  };

  window.PortfolioDividends = PortfolioDividends;
})(window);
