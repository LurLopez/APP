/**
 * @fileoverview Cableado del panel del gráfico de cartera: selector de elementos, métricas,
 * rangos, zoom, pantalla completa y carga inicial. Reconstruido tras la partición de portfolioChart.js.
 */

(function (window) {
  const PCS = window.PortfolioChartState;

  function wirePortfolioChart(scope, options = {}) {
    if (options.getData) PCS.dataGetter = options.getData;
    if (options.api) PCS.apiFetcher = options.api;
    if (options.renderSection) PCS.sectionRenderer = options.renderSection;
    if (options.onClose) PCS.closeCallback = options.onClose;
    if (options.onSelectedIdsChange) PCS.selectedIdsCallback = options.onSelectedIdsChange;
    if (options.onRangeChange) PCS.rangeCallback = options.onRangeChange;
    if (options.onMetricChange) PCS.metricCallback = options.onMetricChange;
    if (Array.isArray(options.selectedIds)) PCS.selectedIds = options.selectedIds;
    if (options.open !== undefined) PCS.open = Boolean(options.open);
    if (options.metric) PCS.metric = options.metric;
    if (options.range) PCS.range = options.range;

    const panel = scope.querySelector('.pf-chart-panel');
    if (!panel) return;

    const picker = panel.querySelector('[data-pf-chart-picker]');
    const pickerBox = panel.querySelector('[data-pf-chart-picker-box]');
    const choiceList = panel.querySelector('[data-picker-choice-list]');

    const applyChoiceFilters = () => {
      if (!choiceList) return;
      const activeTab = pickerBox?.querySelector('.pf-picker-tab.active')?.dataset.pickerTab ?? 'all';
      const term = (panel.querySelector('[data-picker-search]')?.value ?? '').trim().toLowerCase();
      choiceList.querySelectorAll('.pf-chart-choice').forEach((choice) => {
        const category = choice.dataset.choiceCategory;
        const search = choice.dataset.choiceSearch ?? '';
        const matchesTab = activeTab === 'all' || category === activeTab || (activeTab === 'valores' && category === 'valores');
        const matchesTerm = !term || search.includes(term);
        choice.style.display = matchesTab && matchesTerm ? '' : 'none';
      });
    };

    picker?.addEventListener('click', () => {
      const isOpen = !pickerBox.hidden;
      pickerBox.hidden = isOpen;
      picker.setAttribute('aria-expanded', String(!isOpen));
      picker.classList.toggle('active', !isOpen);
    });

    pickerBox?.querySelectorAll('[data-picker-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        pickerBox.querySelectorAll('[data-picker-tab]').forEach((item) => item.classList.toggle('active', item === tab));
        applyChoiceFilters();
      });
    });

    panel.querySelector('[data-picker-search]')?.addEventListener('input', applyChoiceFilters);

    pickerBox?.querySelectorAll('[data-picker-quick]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.pickerQuick;
        if (mode === 'clear') {
          PCS.selectedIds = [];
        } else {
          const wanted = mode === 'groups' ? 'grupos' : 'valores';
          const ids = [...(choiceList?.querySelectorAll('.pf-chart-choice') ?? [])]
            .filter((choice) => choice.dataset.choiceCategory === wanted)
            .map((choice) => choice.querySelector('input')?.value)
            .filter(Boolean);
          PCS.selectedIds = ids.slice(0, 20);
        }
        syncPickerChecked(panel);
        if (PCS.selectedIdsCallback) PCS.selectedIdsCallback(PCS.selectedIds);
        loadPortfolioChart(panel);
      });
    });

    choiceList?.addEventListener('change', (event) => {
      const input = event.target.closest('input[type="checkbox"]');
      if (!input) return;
      const checked = [...choiceList.querySelectorAll('input[type="checkbox"]:checked')];
      if (checked.length > 20) {
        input.checked = false;
        return;
      }
      PCS.selectedIds = checked.map((item) => item.value);
      input.closest('.pf-chart-choice')?.classList.toggle('selected', input.checked);
      syncPickerChecked(panel);
      if (PCS.selectedIdsCallback) PCS.selectedIdsCallback(PCS.selectedIds);
      loadPortfolioChart(panel);
    });

    panel.querySelector('[data-pf-chart-close]')?.addEventListener('click', () => {
      if (PCS.closeCallback) {
        PCS.closeCallback();
      } else if (PCS.sectionRenderer) {
        PCS.sectionRenderer();
      }
    });

    panel.querySelector('[data-pf-chart-metric]')?.addEventListener('change', (event) => {
      PCS.metric = event.target.value;
      if (PCS.metricCallback) PCS.metricCallback(PCS.metric);
      loadPortfolioChart(panel);
    });

    panel.querySelectorAll('[data-pf-range]').forEach((button) => {
      button.addEventListener('click', () => {
        PCS.range = button.dataset.pfRange;
        updateQuickRangeButtonsUi(panel);
        loadPortfolioChart(panel);
        if (PCS.rangeCallback) PCS.rangeCallback(PCS.range);
      });
    });

    panel.querySelectorAll('[data-pf-zoom]').forEach((button) => {
      button.addEventListener('click', () => zoomChartByStep(panel, button.dataset.pfZoom));
    });

    const fsBtn = panel.querySelector('[data-pf-chart-fullscreen]');
    const maxIcon = fsBtn?.querySelector('.pf-icon-maximize');
    const minIcon = fsBtn?.querySelector('.pf-icon-minimize');

    const syncFullscreenUi = (isFs) => {
      if (maxIcon) maxIcon.style.display = isFs ? 'none' : 'inline-block';
      if (minIcon) minIcon.style.display = isFs ? 'inline-block' : 'none';
      if (fsBtn) {
        fsBtn.title = isFs ? 'Salir de pantalla completa (Esc o F)' : 'Pantalla completa (F o clic)';
        fsBtn.classList.toggle('active', isFs);
      }
    };

    const isFullscreen = () => document.fullscreenElement === panel || panel.classList.contains('is-fullscreen');

    const toggleFullscreen = async () => {
      if (!isFullscreen()) {
        try {
          if (panel.requestFullscreen) await panel.requestFullscreen();
          else panel.classList.add('is-fullscreen');
        } catch {
          panel.classList.add('is-fullscreen');
        }
        syncFullscreenUi(true);
      } else {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else panel.classList.remove('is-fullscreen');
        } catch {
          panel.classList.remove('is-fullscreen');
        }
        syncFullscreenUi(false);
      }
      requestAnimationFrame(() => {
        renderChartMainSvg(panel);
        updateTimelineSliderUi(panel);
      });
    };

    fsBtn?.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', () => {
      const isFs = isFullscreen();
      syncFullscreenUi(isFs);
      requestAnimationFrame(() => {
        renderChartMainSvg(panel);
        updateTimelineSliderUi(panel);
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (event.key === 'f' || event.key === 'F') {
        if (panel.matches(':hover') || isFullscreen()) {
          event.preventDefault();
          toggleFullscreen();
        }
      } else if (event.key === 'Escape' && panel.classList.contains('is-fullscreen')) {
        panel.classList.remove('is-fullscreen');
        syncFullscreenUi(false);
      }
    });

    syncPickerChecked(panel);
    attachTimelineEvents(panel);
    loadPortfolioChart(panel);
  }

  window.wirePortfolioChart = wirePortfolioChart;
})(window);
