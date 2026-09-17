/**
 * @fileoverview Gráfico independiente de evolución del valor de la cartera y de las aportaciones
 * netas de bolsillo, con su propio botón de pantalla completa (mismo patrón que la cotización).
 */

(function (window) {
  const PS = window.PortfolioState;

  const SERIES = [
    { id: 'portfolio:value', label: 'Valor de la cartera', sub: 'Valor de mercado de las posiciones', color: '#2563eb', area: true },
    { id: 'portfolio:contributions', label: 'Aportaciones', sub: 'Capital neto aportado de bolsillo', color: '#10b981', area: false },
  ];
  const RANGE_PILLS = [['1y', '1A'], ['2y', '2A'], ['3y', '3A'], ['5y', '5A'], ['all', 'Todo']];
  const RANGE_DAYS = { '1y': 365, '2y': 730, '3y': 1095, '5y': 1825 };
  const PAD = { left: 64, right: 20, top: 22, bottom: 32 };
  const PAD_FS = { left: 76, right: 26, top: 26, bottom: 36 };

  let loadPromise = null;
  let resizeTimer = null;

  const fmtMod = () => window.PortfolioFormatting || {};

  function escapeHtml(value) {
    return fmtMod().escapeHtml ? fmtMod().escapeHtml(value) : String(value ?? '');
  }

  function money(value) {
    return fmtMod().fmtMoney ? fmtMod().fmtMoney(value) : `$${Number(value).toFixed(2)}`;
  }

  function signedMoney(value) {
    return fmtMod().fmtSigned ? fmtMod().fmtSigned(value) : `$${Number(value).toFixed(2)}`;
  }

  function signedPct(value) {
    return fmtMod().fmtSignedPct ? fmtMod().fmtSignedPct(value) : `${Number(value).toFixed(2)} %`;
  }

  function fullDate(value) {
    return fmtMod().fmtDate ? fmtMod().fmtDate(value) : String(value ?? '');
  }

  function validNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function valueNumber(value, fallback = 0) {
    const num = validNumber(value);
    return num === null ? fallback : num;
  }

  function seriesNumbers(points) {
    const values = [];
    for (const point of points ?? []) {
      for (const value of point.series ?? []) {
        const num = validNumber(value);
        if (num !== null) values.push(num);
      }
    }
    return values;
  }

  /* ── Utilidades puras (testables) ─────────────────────────────── */

  function pointsForRange(allPoints, range, now = new Date()) {
    const points = Array.isArray(allPoints) ? allPoints : [];
    const days = RANGE_DAYS[range];
    if (!days || points.length < 2) return points;
    const start = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
    const filtered = points.filter((point) => point.date >= start);
    return filtered.length >= 2 ? filtered : points;
  }

  function computeValueScale(values) {
    const finite = (values || []).map(Number).filter((value) => Number.isFinite(value));
    const maxVal = Math.max(...finite, 0);
    if (maxVal <= 0.001) {
      return { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], step: 25 };
    }
    const step = window.computeNiceStep ? window.computeNiceStep((maxVal * 1.08) / 4) : maxVal / 4;
    const numSteps = Math.max(1, Math.ceil((maxVal * 1.04) / step));
    const bound = step * numSteps;
    const ticks = [];
    for (let i = 0; i <= numSteps; i++) ticks.push(step * i);
    return { min: 0, max: bound, ticks, step };
  }

  function formatCompactMoney(value) {
    const num = valueNumber(value, 0);
    const abs = Math.abs(num);
    const sign = num < 0 ? '−' : '';
    if (abs >= 1e6) {
      const millions = (abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace(/\.0$/, '');
      return `${sign}$${millions}M`;
    }
    if (abs >= 1e5) return `${sign}$${Math.round(abs / 1e3)}k`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
    return `${sign}$${Math.round(abs)}`;
  }

  function plusvaliaForPoint(point) {
    const value = valueNumber(point?.series?.[0], NaN);
    const contributions = valueNumber(point?.series?.[1], NaN);
    if (!Number.isFinite(value) || !Number.isFinite(contributions)) return null;
    const diff = value - contributions;
    const pct = contributions > 0 ? (diff / contributions) * 100 : 0;
    return { diff, pct };
  }

  /* ── Marcado y utilidades de panel ────────────────────────────── */

  function valueChartPanelHtml() {
    const range = PS.valueChartRange || '1y';
    const rangeHtml = RANGE_PILLS.map(([key, label]) => `
      <button class="pf-range-pill ${range === key ? 'active' : ''}" type="button" data-pf-value-range="${key}" aria-pressed="${range === key}">${label}</button>
    `).join('');

    return `
      <section class="pf-value-chart-panel" data-pf-value-chart aria-label="Evolución del valor de la cartera y aportaciones">
        <div class="pf-card-head pf-value-chart-head">
          <div class="pf-chart-title-wrap">
            <h4>Evolución del valor de la cartera</h4>
            <p>Valor de mercado de tus posiciones frente al capital neto que has aportado de tu bolsillo.</p>
          </div>
          <div class="pf-chart-controls">
            <div class="pf-range-pills" role="group" aria-label="Rango temporal">${rangeHtml}</div>
            <button class="pf-outline-button pf-chart-fullscreen-btn" type="button" data-pf-value-fullscreen title="Pantalla completa (F o clic)" aria-label="Pantalla completa">
              <svg class="pf-icon-maximize" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4"/></svg>
              <svg class="pf-icon-minimize" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none"><path d="M7 3v4H3M13 3v4h4M7 17v-4H3M13 17v-4h4"/></svg>
            </button>
            <button class="pf-outline-button pf-chart-close-btn" type="button" data-pf-value-close title="Ocultar gráfico" aria-label="Cerrar gráfico">×</button>
          </div>
        </div>
        <div class="pf-chart-status-bar">
          <span class="pf-chart-status-info" data-pf-value-status>Cargando datos…</span>
          <span class="pf-chart-source-tag">Yahoo Finance · Cotizaciones ajustadas</span>
        </div>
        <div class="pf-value-chart-body">
          <div class="pf-value-chart-canvas" data-pf-value-canvas></div>
          <aside class="pf-value-chart-side">
            <div class="pf-chart-legend-title">Series</div>
            <ul class="pf-value-legend" data-pf-value-legend></ul>
            <div class="pf-value-summary" data-pf-value-summary hidden></div>
          </aside>
        </div>
      </section>`;
  }

  function currentPanel() {
    return PS.sectionRoot?.querySelector?.('[data-pf-value-chart]') ?? null;
  }

  function isValueFullscreen(panel) {
    return Boolean(panel) && (document.fullscreenElement === panel || panel.classList.contains('is-fullscreen'));
  }

  function computeGeometry(panel) {
    const canvas = panel?.querySelector?.('[data-pf-value-canvas]');
    const rect = canvas?.getBoundingClientRect?.() ?? { width: 0, height: 0 };
    const isFs = isValueFullscreen(panel);
    const pad = isFs ? PAD_FS : PAD;
    const width = Math.max(320, Math.round(rect.width || 860));
    const height = Math.max(240, Math.round(isFs ? (rect.height || 520) : 340));
    return {
      isFs,
      width,
      height,
      pad,
      innerWidth: width - pad.left - pad.right,
      innerHeight: height - pad.top - pad.bottom,
    };
  }

  function renderLegend(panel, labels, latestPoint) {
    const legend = panel.querySelector('[data-pf-value-legend]');
    if (!legend) return;
    if (!labels.length) {
      legend.innerHTML = '<li class="pf-legend-empty-hint">Sin series</li>';
      return;
    }
    legend.innerHTML = labels.map((label, index) => {
      const value = latestPoint?.series?.[index];
      return `
        <li class="pf-value-legend-item">
          <span class="pf-value-legend-dot" style="background:${label.color || SERIES[index]?.color || '#2563eb'}"></span>
          <span class="pf-value-legend-name">${escapeHtml(label.label || SERIES[index]?.label || '')}</span>
          <strong class="pf-value-legend-value">${value === undefined || value === null ? '—' : escapeHtml(money(value))}</strong>
        </li>`;
    }).join('');

    const summary = panel.querySelector('[data-pf-value-summary]');
    if (summary) {
      const data = plusvaliaForPoint(latestPoint);
      if (!data) {
        summary.hidden = true;
      } else {
        summary.hidden = false;
        summary.innerHTML = `
          <span class="pf-value-summary-label">Plusvalía acumulada</span>
          <strong class="${data.diff >= 0 ? 'positive' : 'negative'}">${escapeHtml(signedMoney(data.diff))}</strong>
          <span class="${data.diff >= 0 ? 'positive' : 'negative'}">${escapeHtml(signedPct(data.pct))}</span>`;
      }
    }
  }

  function renderValueChart(panel) {
    const canvas = panel?.querySelector?.('[data-pf-value-canvas]');
    if (!canvas) return;
    const allPoints = PS.valueChartData?.points ?? [];
    const labels = PS.valueChartData?.labels ?? [];
    if (!PS.valueChartData) {
      canvas.innerHTML = '<div class="pf-chart-empty"><p>Cargando histórico…</p></div>';
      renderLegend(panel, [], null);
      return;
    }
    const points = pointsForRange(allPoints, PS.valueChartRange || '1y');
    if (!points.length) {
      canvas.innerHTML = '<div class="pf-chart-empty"><p>No hay datos históricos disponibles para este rango.</p></div>';
      renderLegend(panel, [], null);
      return;
    }

    const { isFs, width, height, pad, innerWidth, innerHeight } = computeGeometry(panel);
    const { min, max, ticks } = computeValueScale(seriesNumbers(points));
    const x = (index) => pad.left + (index / Math.max(1, points.length - 1)) * innerWidth;
    const y = (value) => pad.top + (1 - (valueNumber(value, 0) - min) / (max - min)) * innerHeight;

    const colors = labels.map((label, index) => label.color || SERIES[index]?.color || '#2563eb');
    const gradients = labels.map((label, index) => `
      <linearGradient id="pf-value-grad-${index}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${colors[index]}" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="${colors[index]}" stop-opacity="0.00"/>
      </linearGradient>`).join('');

    const paths = labels.map((label, seriesIndex) => {
      let line = '';
      let firstIndex = -1;
      let lastIndex = -1;
      points.forEach((point, index) => {
        const num = validNumber(point.series?.[seriesIndex]);
        if (num === null) return;
        if (firstIndex === -1) firstIndex = index;
        const px = x(index).toFixed(1);
        const py = y(num).toFixed(1);
        line += `${line ? ' L' : 'M'}${px},${py}`;
        lastIndex = index;
      });
      if (!line) return '';
      const baseY = y(min).toFixed(1);
      const firstX = x(firstIndex).toFixed(1);
      const area = SERIES[seriesIndex]?.area
        ? `<path d="M${firstX},${baseY} ${line.slice(1).replace(/^/, 'L')} L${x(lastIndex).toFixed(1)},${baseY} Z" fill="url(#pf-value-grad-${seriesIndex})" class="pf-chart-area"/>`
        : '';
      return `${area}<path d="${line}" fill="none" stroke="${colors[seriesIndex]}" stroke-width="${isFs ? 2.8 : 2.2}" stroke-linejoin="round" stroke-linecap="round" class="pf-chart-line" data-value-series="${seriesIndex}"/>`;
    }).join('');

    const gridLines = ticks.map((value) => {
      const tickY = y(value).toFixed(1);
      return `
        <line x1="${pad.left}" y1="${tickY}" x2="${width - pad.right}" y2="${tickY}" class="pf-chart-grid-line"/>
        <text x="${pad.left - 8}" y="${(Number(tickY) + 3.5).toFixed(1)}" class="pf-chart-y-label" text-anchor="end">${escapeHtml(formatCompactMoney(value))}</text>`;
    }).join('');

    const dateTicks = window.getTradingViewDateTicks
      ? window.getTradingViewDateTicks(points, x, pad, width)
      : [];
    const xGrid = dateTicks.map((tick) => `
      <line x1="${tick.x.toFixed(1)}" y1="${pad.top}" x2="${tick.x.toFixed(1)}" y2="${height - pad.bottom}" class="pf-chart-vgrid-line"/>
      <text x="${tick.x.toFixed(1)}" y="${height - 8}" class="pf-chart-x-label ${tick.isMajor ? 'major' : ''}" text-anchor="middle">${escapeHtml(tick.label)}</text>`).join('');

    const baseline = `
      <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="pf-chart-axis-baseline"/>
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="pf-chart-axis-baseline"/>`;

    canvas.innerHTML = `
      <svg class="pf-value-chart-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Evolución del valor de la cartera y aportaciones">
        <defs>${gradients}</defs>
        ${gridLines}
        ${xGrid}
        ${baseline}
        ${paths}
        <g class="pf-value-hover" style="display:none">
          <line class="pf-chart-crosshair" y1="${pad.top}" y2="${height - pad.bottom}"/>
          <g class="pf-value-hover-dots"></g>
        </g>
      </svg>`;

    renderLegend(panel, labels, points[points.length - 1]);
  }

  /* ── Hover ────────────────────────────────────────────────────── */

  function wireValueChartHover(panel, canvas) {
    if (!canvas) return;
    canvas.addEventListener('mousemove', (event) => {
      const data = PS.valueChartData?.points ?? [];
      const points = pointsForRange(data, PS.valueChartRange || '1y');
      const svg = canvas.querySelector('.pf-value-chart-svg');
      const hover = canvas.querySelector('.pf-value-hover');
      if (!svg || !hover || !points.length) return;

      const { width, height, pad, innerWidth, innerHeight } = computeGeometry(panel);
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const svgX = ((event.clientX - rect.left) / rect.width) * width;
      const svgY = ((event.clientY - rect.top) / rect.height) * height;
      if (svgX < pad.left - 24 || svgX > width - pad.right + 24 || svgY < pad.top - 30 || svgY > height - pad.bottom + 30) {
        hover.style.display = 'none';
        window.hideChartTooltip?.();
        return;
      }

      const ratio = Math.max(0, Math.min(1, (svgX - pad.left) / innerWidth));
      const index = Math.round(ratio * (points.length - 1));
      const point = points[index];
      if (!point) return;

      const { min, max } = computeValueScale(seriesNumbers(points));
      const x = (idx) => pad.left + (idx / Math.max(1, points.length - 1)) * innerWidth;
      const y = (value) => pad.top + (1 - (valueNumber(value, 0) - min) / (max - min)) * innerHeight;
      const colors = (PS.valueChartData?.labels ?? []).map((label, idx) => label.color || SERIES[idx]?.color || '#2563eb');
      const cx = x(index);

      const rows = (PS.valueChartData?.labels ?? [])
        .map((label, seriesIndex) => ({ label, seriesIndex }))
        .filter(({ seriesIndex }) => validNumber(point.series?.[seriesIndex]) !== null)
        .map(({ label, seriesIndex }) => ({
          label: label.label || SERIES[seriesIndex]?.label || '',
          value: Number(point.series[seriesIndex]),
          color: colors[seriesIndex],
          y: y(point.series[seriesIndex]),
        }));
      if (!rows.length) {
        hover.style.display = 'none';
        window.hideChartTooltip?.();
        return;
      }

      hover.style.display = '';
      const crosshair = hover.querySelector('.pf-chart-crosshair');
      if (crosshair) {
        crosshair.setAttribute('x1', cx.toFixed(1));
        crosshair.setAttribute('x2', cx.toFixed(1));
      }
      const dots = hover.querySelector('.pf-value-hover-dots');
      if (dots) {
        dots.innerHTML = rows.map((row) => `
          <circle cx="${cx.toFixed(1)}" cy="${row.y.toFixed(1)}" r="4.5" fill="#ffffff" stroke="${row.color}" stroke-width="2.4" class="pf-chart-dot"/>`).join('');
      }

      const tip = window.ensureChartTooltip?.();
      if (tip) {
        const plusvalia = plusvaliaForPoint(point);
        tip.innerHTML = `
          <div class="pf-chart-tooltip-header">${escapeHtml(window.formatTradingViewHoverDate ? window.formatTradingViewHoverDate(point.date) : fullDate(point.date))}</div>
          <div class="pf-chart-tooltip-rows">
            ${rows.map((row) => `
              <div class="pf-chart-tooltip-row">
                <span class="pf-chart-tooltip-dot" style="background:${row.color}"></span>
                <span class="pf-chart-tooltip-name">${escapeHtml(row.label)}</span>
                <span class="pf-chart-tooltip-val">${escapeHtml(money(row.value))}</span>
              </div>`).join('')}
            ${plusvalia ? `
              <div class="pf-chart-tooltip-row pf-chart-tooltip-diff" style="margin-top:5px;padding-top:4px;border-top:1px dashed rgba(255,255,255,0.18);">
                <span class="pf-chart-tooltip-name" style="font-weight:600;color:#cbd5e1;">Plusvalía acumulada</span>
                <span class="pf-chart-tooltip-val ${plusvalia.diff >= 0 ? 'positive' : 'negative'}">${escapeHtml(signedMoney(plusvalia.diff))} (${escapeHtml(signedPct(plusvalia.pct))})</span>
              </div>` : ''}
          </div>`;
        tip.hidden = false;
        window.positionChartTooltip?.(tip, event.clientX, event.clientY);
      }
    });

    canvas.addEventListener('mouseleave', () => {
      const hover = canvas.querySelector('.pf-value-hover');
      if (hover) hover.style.display = 'none';
      window.hideChartTooltip?.();
    });
  }

  /* ── Carga de datos ───────────────────────────────────────────── */

  function setStatus(panel, text) {
    const status = panel?.querySelector?.('[data-pf-value-status]');
    if (status) status.textContent = text;
  }

  function loadValueChartData(panel) {
    if (!panel) return;
    if (PS.valueChartData?.points?.length) {
      setStatus(panel, `Yahoo Finance · ${PS.valueChartData.points.length} sesiones`);
      renderValueChart(panel);
      return;
    }
    if (loadPromise) {
      loadPromise.finally(() => renderValueChart(currentPanel()));
      return;
    }

    setStatus(panel, 'Cargando histórico…');
    renderValueChart(panel);
    const query = new URLSearchParams({
      ids: SERIES.map((serie) => serie.id).join(','),
      metric: 'portfolioValue',
      range: 'all',
    });
    const fetcher = window.PortfolioChartState?.apiFetcher;
    const request = fetcher
      ? fetcher(`/api/portfolio/chart?${query}`)
      : fetch(`/api/portfolio/chart?${query}`).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Error del servidor.');
        return payload;
      });

    loadPromise = request
      .then((payload) => {
        PS.valueChartData = payload?.chart ?? null;
      })
      .catch((error) => {
        setStatus(currentPanel(), error?.message || 'No se pudo cargar el histórico.');
      })
      .finally(() => {
        loadPromise = null;
        const panelNow = currentPanel();
        if (PS.valueChartData?.points?.length) {
          setStatus(panelNow, `Yahoo Finance · ${PS.valueChartData.points.length} sesiones`);
        }
        renderValueChart(panelNow);
      });
  }

  /* ── Pantalla completa ────────────────────────────────────────── */

  function syncValueFullscreenUi(panel) {
    if (!panel) return;
    const isFs = isValueFullscreen(panel);
    const button = panel.querySelector('[data-pf-value-fullscreen]');
    if (button) {
      button.classList.toggle('active', isFs);
      button.title = isFs ? 'Salir de pantalla completa (Esc o F)' : 'Pantalla completa (F o clic)';
      const maximize = button.querySelector('.pf-icon-maximize');
      const minimize = button.querySelector('.pf-icon-minimize');
      if (maximize) maximize.style.display = isFs ? 'none' : 'inline-block';
      if (minimize) minimize.style.display = isFs ? 'inline-block' : 'none';
    }
  }

  async function toggleValueChartFullscreen(panel) {
    if (!panel) return;
    if (!isValueFullscreen(panel)) {
      try {
        if (panel.requestFullscreen) await panel.requestFullscreen();
        else panel.classList.add('is-fullscreen');
      } catch {
        panel.classList.add('is-fullscreen');
      }
    } else {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else panel.classList.remove('is-fullscreen');
      } catch {
        panel.classList.remove('is-fullscreen');
      }
    }
    syncValueFullscreenUi(panel);
    requestAnimationFrame(() => renderValueChart(panel));
    setTimeout(() => renderValueChart(panel), 120);
  }

  function rerenderValueCharts() {
    document.querySelectorAll('[data-pf-value-chart]').forEach((panel) => {
      syncValueFullscreenUi(panel);
      renderValueChart(panel);
    });
  }

  function ensureValueChartListeners() {
    if (ensureValueChartListeners.ready) return;
    ensureValueChartListeners.ready = true;

    document.addEventListener('fullscreenchange', () => requestAnimationFrame(rerenderValueCharts));
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rerenderValueCharts, 120);
    });
    document.addEventListener('keydown', (event) => {
      if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      const panel = document.querySelector('[data-pf-value-chart]');
      if (!panel) return;
      const isFs = isValueFullscreen(panel);
      if ((event.key === 'f' || event.key === 'F') && (panel.matches(':hover') || isFs)) {
        event.preventDefault();
        toggleValueChartFullscreen(panel);
      } else if (event.key === 'Escape' && panel.classList.contains('is-fullscreen') && !document.fullscreenElement) {
        panel.classList.remove('is-fullscreen');
        syncValueFullscreenUi(panel);
        requestAnimationFrame(() => renderValueChart(panel));
      }
    });
  }

  /* ── Cableado ─────────────────────────────────────────────────── */

  function wireValueChart(scope) {
    const panel = scope?.querySelector?.('[data-pf-value-chart]');
    if (!panel) return;

    panel.querySelectorAll('[data-pf-value-range]').forEach((button) => {
      button.addEventListener('click', () => {
        PS.valueChartRange = button.dataset.pfValueRange;
        panel.querySelectorAll('[data-pf-value-range]').forEach((item) => {
          const active = item === button;
          item.classList.toggle('active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        renderValueChart(panel);
      });
    });

    panel.querySelector('[data-pf-value-close]')?.addEventListener('click', () => {
      if (isValueFullscreen(panel) && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      PS.valueChartOpen = false;
      if (typeof window.renderSection === 'function') window.renderSection();
    });

    panel.querySelector('[data-pf-value-fullscreen]')?.addEventListener('click', () => toggleValueChartFullscreen(panel));

    wireValueChartHover(panel, panel.querySelector('[data-pf-value-canvas]'));
    ensureValueChartListeners();
    syncValueFullscreenUi(panel);
    loadValueChartData(panel);
  }

  window.PortfolioValueChart = {
    valueChartPanelHtml,
    wireValueChart,
    loadValueChartData,
    renderValueChart,
    toggleValueChartFullscreen,
    pointsForRange,
    computeValueScale,
    formatCompactMoney,
    plusvaliaForPoint,
    isValueFullscreen,
  };

})(window);
