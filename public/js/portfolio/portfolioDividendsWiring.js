/**
 * @fileoverview Cableado del panel de dividendos.
 */

(function (window) {
  const DS = window.PortfolioDividendsState;


  function wireDividendDashboard(scope, { renderSection, onNavigate, getData } = {}) {
    if (!scope) return;

    const rerender = () => {
      if (typeof renderSection === 'function') renderSection();
    };

    // 1. Modos
    scope.querySelectorAll('[data-dist-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.distMode;
        if (mode === DS.dividendDistMode) return;
        DS.dividendDistMode = mode;
        if (DS.dividendDistPlaying) {
          clearInterval(DS.dividendDistPlayTimer);
          DS.dividendDistPlayTimer = null;
          DS.dividendDistPlaying = false;
        }
        if (DS.dividendDistMode === 'month') {
          const d = getDividendData(getData ? getData() : null);
          const months = d.ttmStackedMonths || [];
          DS.dividendDistPeriod = months.length > 0 ? months[months.length - 1].key : 'jul-26';
        } else {
          DS.dividendDistPeriod = 'TTM';
          DS.dividendDistTimelineYear = 2026;
        }
        rerender();
      });
    });

    scope.querySelectorAll('[data-dist-period]').forEach((sel) => {
      sel.addEventListener('change', () => {
        DS.dividendDistPeriod = sel.value;
        if (DS.dividendDistMode === 'year' && !['TTM', 'all'].includes(sel.value)) {
          DS.dividendDistTimelineYear = Number(sel.value) || 2026;
        }
        rerender();
      });
    });

    scope.querySelectorAll('[data-dist-metric]').forEach((sel) => {
      sel.addEventListener('change', () => {
        DS.dividendDistMetric = sel.value;
        rerender();
      });
    });

    scope.querySelectorAll('[data-dist-play]').forEach((btn) => {
      btn.addEventListener('click', () => {
        DS.dividendDistPlaying = !DS.dividendDistPlaying;
        if (DS.dividendDistPlaying) {
          const d = getDividendData(getData ? getData() : null);
          if (DS.dividendDistMode === 'month') {
            const months = d.ttmStackedMonths || [];
            let pIdx = months.findIndex((m) => m.key === DS.dividendDistPeriod);
            if (pIdx < 0) pIdx = 0;
            DS.dividendDistPlayTimer = setInterval(() => {
              pIdx = (pIdx + 1) % months.length;
              DS.dividendDistPeriod = months[pIdx].key;
              rerender();
            }, 1100);
          } else {
            const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027];
            let currentYear = Number(DS.dividendDistPeriod) || DS.dividendDistTimelineYear || 2026;
            let pIdx = years.indexOf(currentYear);
            if (pIdx < 0) pIdx = 0;
            DS.dividendDistPlayTimer = setInterval(() => {
              pIdx = (pIdx + 1) % years.length;
              DS.dividendDistTimelineYear = years[pIdx];
              DS.dividendDistPeriod = String(years[pIdx]);
              rerender();
            }, 1100);
          }
        } else {
          clearInterval(DS.dividendDistPlayTimer);
          DS.dividendDistPlayTimer = null;
          rerender();
        }
      });
    });

    scope.querySelectorAll('[data-dist-year]').forEach((tick) => {
      tick.addEventListener('click', () => {
        const yr = Number(tick.dataset.distYear);
        DS.dividendDistTimelineYear = yr;
        DS.dividendDistPeriod = String(yr);
        rerender();
      });
    });

    scope.querySelectorAll('[data-dist-month-key]').forEach((tick) => {
      tick.addEventListener('click', () => {
        DS.dividendDistPeriod = tick.dataset.distMonthKey;
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
        link.download = `distribucion-dividendos-${DS.dividendDistMode}-${DS.dividendDistPeriod}.svg`;
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
          const lineText = DS.dividendDistMetric === 'pct' ? `${pctFormatted} (${valFormatted})` : `${valFormatted} (${pctFormatted})`;
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
        DS.dividendShowMonthlyAverage = avgCheck.checked;
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
        DS.dividendSummaryCollapsed = !DS.dividendSummaryCollapsed;
        rerender();
      });
    });

    scope.querySelectorAll('[data-div-summary-period]').forEach((sel) => {
      sel.addEventListener('change', () => {
        DS.dividendSummaryPeriod = sel.value;
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

window.wireDividendDashboard = wireDividendDashboard;

})(window);
