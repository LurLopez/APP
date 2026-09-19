/**
 * @fileoverview Medias móviles del gráfico de evolución de múltiplos (pestaña Valoración).
 * Replica el comportamiento del gráfico de cotización: chips activables, ventanas
 * configurables (100/500/1000 sesiones por defecto) y cálculo sobre el histórico
 * completo descargado (con buffer previo al rango visible).
 */

(function (window) {

const VAL_MA_STORAGE_KEY = 'cifra_val_chart_ma_config_v1';
const VAL_MA_MAX_WINDOW = 5000;

function getValMaPalette() {
  return window.MA_PALETTE || ['#3b82f6', '#8b5cf6', '#10b981', '#ec4899', '#06b6d4', '#eab308', '#4f46e5'];
}

function loadValChartMaConfig() {
  const palette = getValMaPalette();
  try {
    const raw = localStorage.getItem(VAL_MA_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((item, idx) => ({
          id: item.id || `val-ma-${Date.now()}-${idx}`,
          period: Math.max(2, Math.min(VAL_MA_MAX_WINDOW, parseInt(item.period, 10) || 100)),
          active: Boolean(item.active),
          color: item.color || palette[idx % palette.length],
        }));
      }
    }
  } catch {}
  return [
    { id: 'val-ma-100', period: 100, active: true, color: palette[0] },
    { id: 'val-ma-500', period: 500, active: true, color: palette[1] },
    { id: 'val-ma-1000', period: 1000, active: true, color: palette[2] },
  ];
}

function saveValChartMaConfig(config) {
  try {
    localStorage.setItem(VAL_MA_STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

function getValActiveMaConfigs() {
  return (valMaConfig || []).filter((ma) => ma.active);
}

/**
 * Días de histórico previos al rango que hay que descargar para que las medias
 * móviles activas tengan lookback completo (mismo criterio que el gráfico de cotización).
 */
function getValMaRequiredBufferDays() {
  const windows = getValActiveMaConfigs().map((ma) => ma.period);
  const maxWindow = windows.length ? Math.max(...windows) : 0;
  return maxWindow > 1 ? Math.ceil(maxWindow * 1.6) + 60 : 0;
}

/**
 * Calcula la media móvil de `windowSize` sesiones sobre la clave `key` de la serie.
 * Solo devuelve valor cuando la ventana completa tiene datos finitos.
 * @returns {Map<number, number>} t (epoch segundos) → media.
 */
function computeValMovingAverageLookup(points, key, windowSize) {
  const lookup = new Map();
  if (!Array.isArray(points) || points.length < windowSize || windowSize < 2) return lookup;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < points.length; i += 1) {
    const value = Number(points[i]?.[key]);
    if (Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
    if (i >= windowSize) {
      const old = Number(points[i - windowSize]?.[key]);
      if (Number.isFinite(old)) {
        sum -= old;
        count -= 1;
      }
    }
    if (i >= windowSize - 1 && count === windowSize) {
      lookup.set(points[i].t, sum / windowSize);
    }
  }
  return lookup;
}

let valMaCacheKey = '';

/**
 * Devuelve el mapa { periodo: Map(t → valor) } de las medias activas para la
 * métrica efectiva actual, recalculándolo solo si cambian datos o configuración.
 */
function ensureValMaLookup(effectiveKey) {
  const allPoints = valChartAllPoints || [];
  const actives = getValActiveMaConfigs();
  const cacheKey = `${effectiveKey}|${allPoints.length}|${allPoints[0]?.t ?? 0}|${actives.map((m) => m.period).join(',')}`;
  if (cacheKey === valMaCacheKey) return valMaLookup;
  const next = {};
  if (allPoints.length) {
    actives.forEach((ma) => {
      next[ma.period] = computeValMovingAverageLookup(allPoints, effectiveKey, ma.period);
    });
  }
  valMaLookup = next;
  valMaCacheKey = cacheKey;
  return valMaLookup;
}

function applyValMaConfigChange() {
  renderValMaControlsUi();
  const requiredBuffer = getValMaRequiredBufferDays();
  if (valChartPoints.length && requiredBuffer > (valChartLoadedBuffer || 0)) {
    loadValuationChart(valChartRange);
  } else {
    renderValuationChart();
  }
}

function renderValMaControlsUi() {
  const chipsContainer = document.querySelector('#val-ma-chips');
  const listContainer = document.querySelector('#val-ma-list');

  // 1. Chips
  if (chipsContainer) {
    chipsContainer.innerHTML = (valMaConfig || []).map((ma) => {
      const activeClass = ma.active ? 'active' : '';
      return `
        <button type="button" class="chart-ma-chip ${activeClass}" data-val-ma-id="${escapeHtml(ma.id)}" title="${escapeHtml(window.I18n?.t ? window.I18n.t('Alternar MA {0} sesiones', { '0': ma.period }) : `Alternar MA ${ma.period} sesiones`)}" aria-pressed="${ma.active ? 'true' : 'false'}">
          <span class="ma-chip-dot" style="background:${ma.color};"></span>
          <span>MA ${ma.period}</span>
        </button>
      `;
    }).join('');

    chipsContainer.querySelectorAll('.chart-ma-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const maId = chip.getAttribute('data-val-ma-id');
        const target = (valMaConfig || []).find((m) => m.id === maId);
        if (!target) return;
        target.active = !target.active;
        saveValChartMaConfig(valMaConfig);
        applyValMaConfigChange();
      });
    });
  }

  // 2. Lista del popover
  if (listContainer) {
    listContainer.innerHTML = (valMaConfig || []).map((ma) => `
      <div class="chart-ma-item" data-val-ma-id="${escapeHtml(ma.id)}">
        <input type="checkbox" class="chart-ma-item-check" ${ma.active ? 'checked' : ''} title="Mostrar/ocultar en el gráfico" />
        <span class="chart-ma-item-dot" style="background:${ma.color};"></span>
        <span class="chart-ma-item-label">MA</span>
        <input type="number" min="2" max="5000" step="1" class="chart-ma-item-input" value="${ma.period}" title="Editar número de sesiones" />
        <button type="button" class="chart-ma-item-del" title="${escapeHtml(window.I18n?.t ? window.I18n.t('Eliminar media móvil') : 'Eliminar media móvil')}">&times;</button>
      </div>
    `).join('');

    listContainer.querySelectorAll('.chart-ma-item').forEach((itemEl) => {
      const maId = itemEl.getAttribute('data-val-ma-id');
      const target = (valMaConfig || []).find((m) => m.id === maId);
      if (!target) return;

      const chk = itemEl.querySelector('.chart-ma-item-check');
      if (chk) {
        chk.addEventListener('change', () => {
          target.active = chk.checked;
          saveValChartMaConfig(valMaConfig);
          applyValMaConfigChange();
        });
      }

      const input = itemEl.querySelector('.chart-ma-item-input');
      if (input) {
        const handlePeriodChange = () => {
          const rawVal = parseInt(input.value, 10);
          if (isNaN(rawVal) || rawVal < 2 || rawVal > VAL_MA_MAX_WINDOW) {
            input.value = target.period;
            return;
          }
          if (rawVal === target.period) return;
          const isDuplicate = (valMaConfig || []).some((m) => m.id !== target.id && m.period === rawVal);
          if (isDuplicate) {
            input.value = target.period;
            return;
          }
          target.period = rawVal;
          saveValChartMaConfig(valMaConfig);
          applyValMaConfigChange();
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
          valMaConfig = (valMaConfig || []).filter((m) => m.id !== maId);
          saveValChartMaConfig(valMaConfig);
          applyValMaConfigChange();
        });
      }
    });
  }
}

let valMaControlsWired = false;

function wireValMaControls() {
  renderValMaControlsUi();
  if (valMaControlsWired) return;
  valMaControlsWired = true;

  const configBtn = document.querySelector('#val-ma-config-btn');
  const popover = document.querySelector('#val-ma-popover');
  const closeBtn = document.querySelector('#val-ma-popover-close');
  const addForm = document.querySelector('#val-ma-add-form');
  const addInput = document.querySelector('#val-ma-add-input');
  const controlWrap = document.querySelector('#val-ma-control');

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

  document.addEventListener('click', (e) => {
    if (!popover.hidden && controlWrap && !controlWrap.contains(e.target)) {
      togglePopover(false);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popover.hidden) {
      togglePopover(false);
    }
  });

  const addWindow = (val) => {
    if (isNaN(val) || val < 2 || val > VAL_MA_MAX_WINDOW) return;
    const existing = (valMaConfig || []).find((m) => m.period === val);
    if (existing) {
      existing.active = true;
    } else {
      const palette = getValMaPalette();
      const usedColors = new Set((valMaConfig || []).map((m) => m.color));
      const nextColor = palette.find((c) => !usedColors.has(c)) || palette[(valMaConfig || []).length % palette.length];
      valMaConfig.push({
        id: `val-ma-${val}-${Date.now()}`,
        period: val,
        active: true,
        color: nextColor,
      });
    }
    saveValChartMaConfig(valMaConfig);
    applyValMaConfigChange();
  };

  if (addForm) {
    addForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!addInput) return;
      const val = parseInt(addInput.value, 10);
      addWindow(val);
      if (!isNaN(val) && val >= 2 && val <= VAL_MA_MAX_WINDOW) addInput.value = '';
    });
  }

  popover.querySelectorAll('[data-val-preset]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addWindow(parseInt(btn.getAttribute('data-val-preset'), 10));
    });
  });
}

window.loadValChartMaConfig = loadValChartMaConfig;
window.saveValChartMaConfig = saveValChartMaConfig;
window.getValActiveMaConfigs = getValActiveMaConfigs;
window.getValMaRequiredBufferDays = getValMaRequiredBufferDays;
window.ensureValMaLookup = ensureValMaLookup;
window.renderValMaControlsUi = renderValMaControlsUi;
window.wireValMaControls = wireValMaControls;

})(window);
