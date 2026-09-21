/**
 * @fileoverview Listeners del gráfico de métricas (extraído de empresaMetricsChart.js).
 */

(function (window) {
  const EMS = window.EmpresaMetricsState;


  function initMetricsChartListeners() {
    const chart = document.querySelector('#metrics-chart');
    const body = document.querySelector('#metrics-chart-body');
    if (chart) {
      chart.addEventListener('mousemove', updateMetricsChartHover);
      chart.addEventListener('mouseleave', hideMetricsChartTooltip);
    }
    if (body) {
      body.addEventListener('mouseleave', hideMetricsChartTooltip);
    }

    document.querySelector('#metrics-palette')?.addEventListener('click', (event) => {
      const colorButton = event.target.closest('.metrics-palette-color');
      if (!colorButton) return;
      const seriesId = EMS.chartPendingSeriesId;
      EMS.chartPendingSeriesId = null;
      document.querySelector('#metrics-palette').hidden = true;
      if (!seriesId) return;
      seriesColorMap.set(seriesId, colorButton.dataset.color);
      syncChartRowSelection();
      renderMetricsChart();
    });

    document.querySelector('#metrics-chart-legend')?.addEventListener('click', (event) => {
      if (event.target.closest('.metrics-legend-toggle-all')) {
        toggleAllSeriesVisibility();
        return;
      }
      const swatch = event.target.closest('.metrics-swatch');
      if (swatch) {
        const seriesId = swatch.dataset.seriesId;
        if (!seriesId) return;
        const palette = document.querySelector('#metrics-palette');
        if (palette && !palette.hidden && EMS.chartPendingSeriesId === seriesId) {
          palette.hidden = true;
          EMS.chartPendingSeriesId = null;
          return;
        }
        openMetricsPalette(swatch, seriesId);
        return;
      }
      const visibility = event.target.closest('.metrics-legend-visibility');
      if (visibility) {
        toggleSeriesVisibility(visibility.dataset.seriesId);
        return;
      }
      const remove = event.target.closest('.metrics-legend-remove');
      if (remove) removeChartMetric(remove.dataset.removeKey);
    });

    document.addEventListener('click', (event) => {
      const palette = document.querySelector('#metrics-palette');
      if (palette && !palette.hidden) {
        if (!event.target.closest('#metrics-palette') && !event.target.closest('.metrics-swatch')) {
          palette.hidden = true;
          EMS.chartPendingSeriesId = null;
        }
      }

      const popover = document.querySelector('#metrics-compare-popover');
      if (popover && !popover.hidden) {
        if (!event.target.closest('#metrics-compare-popover') && !event.target.closest('#metrics-compare-add-btn') && !event.target.closest('#screener-compare-shortcut-btn')) {
          closeComparePopover();
        }
      }
    });

    document.querySelector('#metrics-chart-clear')?.addEventListener('click', () => {
      chartMetrics.clear();
      seriesColorMap.clear();
      clearHiddenSeries();
      syncChartRowSelection();
      renderMetricsChart();
    });

    document.querySelector('#metrics-chart-fullscreen')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFullscreen(document.querySelector('#metrics-chart-block'));
    });

    let metricsFullscreenActive = false;
    document.addEventListener('fullscreenchange', () => {
      const block = document.querySelector('#metrics-chart-block');
      if (!block) return;
      const isFs = document.fullscreenElement === block || block.classList.contains('is-fullscreen');
      if (!isFs && !metricsFullscreenActive) return;
      metricsFullscreenActive = isFs;
      requestAnimationFrame(renderMetricsChart);
      setTimeout(renderMetricsChart, 60);
      setTimeout(renderMetricsChart, 180);
    });

    document.querySelector('#metrics-compare-add-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const popover = document.querySelector('#metrics-compare-popover');
      if (popover && !popover.hidden) {
        closeComparePopover();
      } else {
        openComparePopover();
      }
    });

    document.querySelector('#screener-compare-shortcut-btn')?.addEventListener('click', () => {
      if (window.screenerStatement === 'valuation') {
        document.querySelectorAll('.screener-tab').forEach((item) => {
          item.classList.toggle('active', item.dataset.statement === 'income');
        });
        window.screenerStatement = 'income';
        if (typeof window.renderScreenerTables === 'function') {
          window.renderScreenerTables();
        }
      }
      const block = document.querySelector('#metrics-chart-block');
      if (block) block.hidden = false;
      renderComparisonChips();
      openComparePopover();
      block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    document.querySelector('#metrics-compare-input')?.addEventListener('input', (e) => {
      const query = e.currentTarget.value.trim();
      const results = document.querySelector('#metrics-compare-results');
      clearTimeout(EMS.compareSearchDebounceTimer);

      if (!query) {
        if (results) {
          results.innerHTML = '<div class="metrics-compare-hint">Escribe un ticker (ej: KHC, KO, PEP) o nombre...</div>';
          results.hidden = false;
        }
        return;
      }

      EMS.compareSearchDebounceTimer = setTimeout(async () => {
        if (results) {
          results.innerHTML = '<div class="metrics-compare-loading">Buscando empresas en SEC…</div>';
          results.hidden = false;
        }
        const searchFn = window.searchCompanies || (async (q) => {
          const res = await fetch(`/api/screener/search?q=${encodeURIComponent(q)}`);
          return res.ok ? (await res.json()).results : [];
        });
        const matches = await searchFn(query);
        if (!matches || !matches.length) {
          const cleanTicker = query.toUpperCase();
          if (/^[A-Z0-9.-]{1,10}$/.test(cleanTicker)) {
            results.innerHTML = `
              <button type="button" class="metrics-compare-result-item" data-ticker="${escapeHtml(cleanTicker)}">
                <span class="metrics-compare-res-name">Añadir ticker directo</span>
                <strong>${escapeHtml(cleanTicker)}</strong>
              </button>
            `;
          } else {
            results.innerHTML = '<div class="metrics-compare-empty">Sin resultados en la SEC para esta búsqueda.</div>';
          }
          results.hidden = false;
          return;
        }

        results.innerHTML = matches.map((item) => `
          <button type="button" class="metrics-compare-result-item" data-ticker="${escapeHtml(item.ticker)}">
            <span class="metrics-compare-res-name">${escapeHtml(item.name || item.ticker)}</span>
            <strong>${escapeHtml(item.ticker)}</strong>
          </button>
        `).join('');
        results.hidden = false;
      }, 220);
    });

    document.querySelector('#metrics-compare-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const firstBtn = document.querySelector('#metrics-compare-results .metrics-compare-result-item');
        if (firstBtn?.dataset.ticker) {
          addComparisonCompany(firstBtn.dataset.ticker);
          return;
        }
        const val = e.currentTarget.value.trim().toUpperCase();
        if (/^[A-Z0-9.-]{1,10}$/.test(val)) {
          addComparisonCompany(val);
        }
      } else if (e.key === 'Escape') {
        closeComparePopover();
      }
    });

    document.querySelector('#metrics-compare-results')?.addEventListener('click', (e) => {
      const item = e.target.closest('.metrics-compare-result-item');
      if (item?.dataset.ticker) {
        addComparisonCompany(item.dataset.ticker);
      }
    });

    document.querySelectorAll('#screener-margins-bar [data-margin-key]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.marginKey;
        const item = getMarginItemByKey(key);
        if (item) {
          toggleChartMetric(item);
        }
      });
    });
  }

window.initMetricsChartListeners = initMetricsChartListeners;

})(window);
