/**
 * @fileoverview Módulo extraído de empresaPriceChart.js.
 */

(function (window) {

function renderMaControlsUi() {
  const chipsContainer = document.querySelector('#chart-ma-chips');
  const listContainer = document.querySelector('#chart-ma-list');

  // 1. Render Chips
  if (chipsContainer) {
    chipsContainer.innerHTML = chartMaConfig.map((ma) => {
      const activeClass = ma.active ? 'active' : '';
      return `
        <button type="button" class="chart-ma-chip ${activeClass}" data-ma-id="${escapeHtml(ma.id)}" title="Alternar MA ${ma.period} sesiones" aria-pressed="${ma.active ? 'true' : 'false'}">
          <span class="ma-chip-dot" style="background:${ma.color};"></span>
          <span>MA ${ma.period}</span>
        </button>
      `;
    }).join('');

    // Wire chip click handlers
    chipsContainer.querySelectorAll('.chart-ma-chip').forEach((chip) => {
      chip.addEventListener('click', async (e) => {
        e.stopPropagation();
        const maId = chip.getAttribute('data-ma-id');
        const target = chartMaConfig.find((m) => m.id === maId);
        if (!target) return;
        target.active = !target.active;
        saveChartMaConfig(chartMaConfig);
        renderMaControlsUi();
        if (target.active && (!chartMovingAveragesData[target.period] || !chartMovingAveragesData[target.period].length)) {
          await loadChart(chartRange);
        } else {
          renderPriceChart();
        }
      });
    });
  }

  // 2. Render List in Popover
  if (listContainer) {
    listContainer.innerHTML = chartMaConfig.map((ma) => `
      <div class="chart-ma-item" data-ma-id="${escapeHtml(ma.id)}">
        <input type="checkbox" class="chart-ma-item-check" ${ma.active ? 'checked' : ''} title="Mostrar/ocultar en el gráfico" />
        <span class="chart-ma-item-dot" style="background:${ma.color};"></span>
        <span class="chart-ma-item-label">MA</span>
        <input type="number" min="2" max="5000" step="1" class="chart-ma-item-input" value="${ma.period}" title="Editar número de sesiones" />
        <button type="button" class="chart-ma-item-del" title="Eliminar media móvil">&times;</button>
      </div>
    `).join('');

    // Wire list item interactions
    listContainer.querySelectorAll('.chart-ma-item').forEach((itemEl) => {
      const maId = itemEl.getAttribute('data-ma-id');
      const target = chartMaConfig.find((m) => m.id === maId);
      if (!target) return;

      const chk = itemEl.querySelector('.chart-ma-item-check');
      if (chk) {
        chk.addEventListener('change', async () => {
          target.active = chk.checked;
          saveChartMaConfig(chartMaConfig);
          renderMaControlsUi();
          if (target.active && (!chartMovingAveragesData[target.period] || !chartMovingAveragesData[target.period].length)) {
            await loadChart(chartRange);
          } else {
            renderPriceChart();
          }
        });
      }

      const input = itemEl.querySelector('.chart-ma-item-input');
      if (input) {
        const handlePeriodChange = async () => {
          const rawVal = parseInt(input.value, 10);
          if (isNaN(rawVal) || rawVal < 2 || rawVal > 5000) {
            input.value = target.period;
            return;
          }
          if (rawVal === target.period) return;
          const isDuplicate = chartMaConfig.some((m) => m.id !== target.id && m.period === rawVal);
          if (isDuplicate) {
            input.value = target.period;
            return;
          }
          target.period = rawVal;
          saveChartMaConfig(chartMaConfig);
          renderMaControlsUi();
          await loadChart(chartRange);
        };
        input.addEventListener('change', handlePeriodChange);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
          }
        });
      }

      const delBtn = itemEl.querySelector('.chart-ma-item-del');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          chartMaConfig = chartMaConfig.filter((m) => m.id !== maId);
          saveChartMaConfig(chartMaConfig);
          renderMaControlsUi();
          renderPriceChart();
        });
      }
    });
  }
}

function wireMaControls() {
  renderMaControlsUi();
  if (maControlsWired) return;
  maControlsWired = true;

  const configBtn = document.querySelector('#chart-ma-config-btn');
  const popover = document.querySelector('#chart-ma-popover');
  const closeBtn = document.querySelector('#chart-ma-popover-close');
  const addForm = document.querySelector('#chart-ma-add-form');
  const addInput = document.querySelector('#chart-ma-add-input');
  const controlWrap = document.querySelector('#chart-ma-control');

  if (!configBtn || !popover) return;

  const togglePopover = (show) => {
    const isHidden = popover.hidden;
    const nextShow = typeof show === 'boolean' ? show : isHidden;
    popover.hidden = !nextShow;
    configBtn.classList.toggle('is-open', nextShow);
    configBtn.setAttribute('aria-expanded', String(nextShow));
    if (nextShow && addInput) {
      setTimeout(() => addInput.focus(), 50);
    }
  };

  configBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePopover(false);
    });
  }

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!popover.hidden && controlWrap && !controlWrap.contains(e.target)) {
      togglePopover(false);
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popover.hidden) {
      togglePopover(false);
    }
  });

  // Form submission: Add new MA
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!addInput) return;
      const val = parseInt(addInput.value, 10);
      if (isNaN(val) || val < 2 || val > 5000) return;

      const existing = chartMaConfig.find((m) => m.period === val);
      if (existing) {
        existing.active = true;
      } else {
        const usedColors = new Set(chartMaConfig.map((m) => m.color));
        const nextColor = MA_PALETTE.find((c) => !usedColors.has(c)) || MA_PALETTE[chartMaConfig.length % MA_PALETTE.length];
        chartMaConfig.push({
          id: `ma-${val}-${Date.now()}`,
          period: val,
          active: true,
          color: nextColor,
        });
      }
      saveChartMaConfig(chartMaConfig);
      addInput.value = '';
      renderMaControlsUi();
      await loadChart(chartRange);
    });
  }

  // Quick preset buttons
  const presetBtns = popover.querySelectorAll('[data-preset]');
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const val = parseInt(btn.getAttribute('data-preset'), 10);
      if (!val || val < 2) return;

      const existing = chartMaConfig.find((m) => m.period === val);
      if (existing) {
        existing.active = true;
      } else {
        const usedColors = new Set(chartMaConfig.map((m) => m.color));
        const nextColor = MA_PALETTE.find((c) => !usedColors.has(c)) || MA_PALETTE[chartMaConfig.length % MA_PALETTE.length];
        chartMaConfig.push({
          id: `ma-${val}-${Date.now()}`,
          period: val,
          active: true,
          color: nextColor,
        });
      }
      saveChartMaConfig(chartMaConfig);
      renderMaControlsUi();
      await loadChart(chartRange);
    });
  });
}

let maControlsWired = false;
window.renderMaControlsUi = renderMaControlsUi;
window.wireMaControls = wireMaControls;

})(window);
