/* ── Cartera: estado compartido y sección ───────────────────── */

const Portfolio = (() => {
  let userLogged = Boolean(window.AuthModule?.getUser?.() || window.currentUser);
  let data = null;
  let sectionRoot = null;
  let sectionOptions = {};
  let calendarSectionRoot = null;
  let calendarSectionOptions = {};
  let formExpanded = false;
  let formBusy = false;
  let searchDebounceTimer;
  let portfolioTab = 'cartera';
  let allocationGroup = 'company';
  let allocationBasis = 'value';
  let positionsView = 'current';
  let sortKey = null;
  let sortDir = 'desc';
  let displayMode = {};
  let groupsView = 'current';
  let groupsSortKey = 'valor';
  let groupsSortDir = 'asc';
  let groupsDisplayMode = {};
  let activeTab = { type: 'predefined', key: 'sector' };
  let activeGroup = null;
  let expandedGroups = new Set();
  let tabFormOpen = false;
  let groupFormOpen = false;
  let editingGroupId = null;
  let editingTabId = null;
  let groupPopover = null;
  let groupPopoverContext = null;
  let chartMetric = 'gainPct';
  let chartRange = '1y';
  let chartSelectedIds = [];
  let chartRequestId = 0;
  let chartOpen = true;
  let chartSliceStart = 0;
  let chartSliceEnd = null;
  let chartCachedData = null;
  let chartRedrawRaf = null;

  const COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#e11d48', '#4f46e5', '#16a34a', '#ca8a04', '#9333ea', '#0d9488', '#db2777', '#6366f1', '#64748b'];

  function emitChange() {
    window.dispatchEvent(new CustomEvent('portfolio:change'));
  }

  const {
    escapeHtml,
    formatNumber,
    maxDecimals,
    fmtMoney,
    fmtSigned,
    fmtPct,
    fmtSignedPct,
    fmtShares,
    fmtPrice,
    fmtDate,
    fmtEur,
    fmtEurInt,
    changeClass,
    cell
  } = window.PortfolioFormatting;

  async function api(path, options) {
    const response = await fetch(path, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Error del servidor.');
    return payload;
  }

  function reset() {
    data = null;
    portfolioTab = 'cartera';
    allocationGroup = 'company';
    allocationBasis = 'value';
    positionsView = 'current';
    groupsView = 'current';
    groupsSortKey = 'valor';
    groupsSortDir = 'asc';
    groupsDisplayMode = {};
    formExpanded = false;
    activeTab = { type: 'predefined', key: 'sector' };
    activeGroup = null;
    expandedGroups.clear();
    tabFormOpen = false;
    groupFormOpen = false;
    editingGroupId = null;
    editingTabId = null;
    chartSelectedIds = [];
    chartOpen = true;
    window.PortfolioChart?.reset?.();
    closeGroupPopover();
    emitChange();
    if (sectionRoot) renderSection();
    if (calendarSectionRoot) renderCalendarSection();
    renderCompanyPanels();
  }

  async function refresh() {
    if (!userLogged) {
      reset();
      return;
    }
    try {
      const response = await fetch('/api/portfolio');
      if (!response.ok) throw new Error('No se pudieron cargar los datos de la cartera.');
      const payload = await response.json().catch(() => null);
      data = payload?.portfolio ?? null;
      if (data) {
        const validChartIds = new Set(chartChoices().map((item) => item.id));
        chartSelectedIds = chartSelectedIds.filter((id) => validChartIds.has(id));
        if (window.PortfolioChart) window.PortfolioChart.selectedIds = chartSelectedIds;
      }
    } catch {
      data = null;
    }
    emitChange();
    if (sectionRoot) renderSection();
    if (calendarSectionRoot) renderCalendarSection();
    renderCompanyPanels();
  }

  function setAuthenticated(value) {
    userLogged = Boolean(value);
    if (!userLogged) reset();
    else refresh();
  }

  function getPosition(ticker) {
    return (data?.positions ?? []).find((item) => item.ticker === String(ticker ?? '').toUpperCase()) ?? null;
  }

  function hasPosition(ticker) {
    const pos = getPosition(ticker);
    return Boolean(pos && Number(pos.shares) > 0);
  }

  function openSection() {
    if (!userLogged) {
      showToast?.('Inicia sesión para gestionar tu cartera.');
      window.openModal?.('login');
      return false;
    }
    window.openHomeSection?.('cartera');
    return true;
  }

  /* ── Formulario de operación ─────────────────────────────── */

  function transactionFormHtml({ ticker = '', companyName = '' } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    return `
      <form class="pf-form" novalidate data-fixed-ticker="${escapeHtml(ticker)}">
        <div class="pf-form-row">
          <label class="pf-field pf-field-ticker">
            <span>Ticker</span>
            <div class="pf-ticker-wrap">
              <input class="pf-input pf-ticker-input" type="text" autocomplete="off" maxlength="10"
                placeholder="Busca la empresa (ej. KO)" value="${escapeHtml(ticker)}" required>
              <div class="pf-ticker-results" hidden></div>
            </div>
          </label>
          <label class="pf-field">
            <span>Tipo</span>
            <select class="pf-input pf-type-input" required>
              <option value="buy">Compra</option>
              <option value="sell">Venta</option>
            </select>
          </label>
          <label class="pf-field">
            <span>Cantidad</span>
            <input class="pf-input pf-shares-input" type="number" min="0.000001" step="any" inputmode="decimal" placeholder="Ej. 10" required>
          </label>
          <label class="pf-field">
            <span>Precio por acción ($)</span>
            <input class="pf-input pf-price-input" type="number" min="0" step="any" inputmode="decimal" placeholder="Ej. 50.00" required>
          </label>
          <label class="pf-field">
            <span>Fecha</span>
            <input class="pf-input pf-date-input" type="date" max="${today}" value="${today}" required>
          </label>
          <button class="primary-button pf-submit" type="submit">Guardar</button>
        </div>
        <p class="pf-form-note hidden"></p>
        ${companyName ? `<input type="hidden" class="pf-company-input" value="${escapeHtml(companyName)}">` : ''}
      </form>
    `;
  }

  function wireTransactionForm(form) {
    if (!form || form.dataset.wired) return;
    form.dataset.wired = 'true';

    const tickerInput = form.querySelector('.pf-ticker-input');
    const resultsBox = form.querySelector('.pf-ticker-results');
    const sharesInput = form.querySelector('.pf-shares-input');
    const priceInput = form.querySelector('.pf-price-input');
    const dateInput = form.querySelector('.pf-date-input');
    const typeInput = form.querySelector('.pf-type-input');
    const note = form.querySelector('.pf-form-note');
    const fixedTicker = form.dataset.fixedTicker ?? '';

    function clearSelectedCompany() {
      form.dataset.selectedTicker = '';
      form.querySelector('.pf-company-input')?.remove();
    }

    if (tickerInput) {
      tickerInput.addEventListener('input', () => {
        const value = tickerInput.value.trim().toUpperCase();
        const selected = form.dataset.selectedTicker ?? '';
        const preset = fixedTicker.toUpperCase();
        if ((selected && selected !== value) || (!selected && preset && value !== preset)) clearSelectedCompany();
        clearTimeout(searchDebounceTimer);
        const query = tickerInput.value.trim();
        if (!query) {
          resultsBox.hidden = true;
          resultsBox.innerHTML = '';
          return;
        }
        searchDebounceTimer = setTimeout(async () => {
          try {
            const response = await fetch(`/api/screener/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) return;
            const payload = await response.json().catch(() => null);
            const matches = payload?.companies ?? [];
            if (!matches.length) {
              resultsBox.innerHTML = '<div class="pf-ticker-empty">Sin resultados en EDGAR.</div>';
              resultsBox.hidden = false;
              return;
            }
            resultsBox.innerHTML = matches.map((company) => `
              <button class="pf-ticker-result" type="button" data-ticker="${escapeHtml(company.ticker)}" data-name="${escapeHtml(company.name)}">
                <img class="search-result-logo" src="https://companiesmarketcap.com/img/company-logos/64/${escapeHtml(company.ticker)}.webp" alt="" loading="lazy" data-letter="${escapeHtml((company.name || company.ticker || '?').slice(0, 1).toUpperCase())}">
                <span>${escapeHtml(company.name)}</span><strong>${escapeHtml(company.ticker)}</strong>
              </button>
            `).join('');
            resultsBox.hidden = false;
            resultsBox.querySelectorAll('.pf-ticker-result').forEach((result) => {
              result.addEventListener('click', () => {
                tickerInput.value = result.dataset.ticker;
                form.dataset.selectedTicker = result.dataset.ticker;
                form.querySelector('.pf-company-input')?.remove();
                const hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.className = 'pf-company-input';
                hidden.value = result.dataset.name;
                form.appendChild(hidden);
                resultsBox.hidden = true;
                resultsBox.innerHTML = '';
              });
            });
            resultsBox.querySelectorAll('.search-result-logo').forEach((logo) => {
              logo.addEventListener('error', () => {
                const letter = document.createElement('span');
                letter.className = 'search-result-logo search-result-logo-fallback';
                letter.textContent = logo.dataset.letter || '?';
                logo.replaceWith(letter);
              });
            });
          } catch {
            resultsBox.hidden = true;
          }
        }, 250);
      });
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (formBusy) return;
      const ticker = (tickerInput?.value ?? '').trim().toUpperCase();
      const type = (typeInput?.value ?? '').trim();
      const shares = Number(sharesInput?.value);
      const price = Number(priceInput?.value);
      const date = dateInput?.value ?? '';

      if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
        note.textContent = 'Introduce un ticker válido (ej. KO).';
        note.classList.remove('hidden');
        return;
      }
      if (!Number.isFinite(shares) || shares <= 0) {
        note.textContent = 'La cantidad debe ser mayor que 0.';
        note.classList.remove('hidden');
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        note.textContent = 'El precio debe ser mayor o igual que 0.';
        note.classList.remove('hidden');
        return;
      }
      if (!date) {
        note.textContent = 'Elige una fecha.';
        note.classList.remove('hidden');
        return;
      }

      let companyName = form.querySelector('.pf-company-input')?.value ?? '';
      if (!companyName) {
        try {
          const response = await fetch(`/api/screener/search?q=${encodeURIComponent(ticker)}`);
          if (response.ok) {
            const payload = await response.json().catch(() => null);
            const exact = (payload?.companies ?? []).find((company) => company.ticker === ticker);
            if (!exact) {
              note.textContent = `"${ticker}" no existe en el buscador de EDGAR. Elige una empresa de la lista de resultados.`;
              note.classList.remove('hidden');
              return;
            }
            companyName = exact.name;
          }
        } catch {
          // El servidor también valida la empresa contra EDGAR.
        }
      }

      note.classList.add('hidden');
      formBusy = true;
      const submitButton = form.querySelector('.pf-submit');
      if (submitButton) submitButton.disabled = true;
      try {
        await api('/api/portfolio/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, type, shares, price, date, companyName }),
        });
        showToast?.(`${type === 'buy' ? 'Compra' : 'Venta'} de ${shares} ${shares === 1 ? 'acción' : 'acciones'} de ${ticker} guardada.`);
        if (!fixedTicker) form.reset();
        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
        await refresh();
      } catch (error) {
        note.textContent = error.message;
        note.classList.remove('hidden');
      } finally {
        formBusy = false;
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  /* ── Gráficos circulares y visuales ──────────────────────── */

  const {
    describeAnnularSector,
    donutSvg,
    donutBlock,
    ensureChartTooltip,
    positionChartTooltip,
    hideChartTooltip,
    wireDonutTooltips,
    wireAllocationHover,
    portfolioLogoHtml,
    wirePortfolioLogos
  } = window.PortfolioDonuts;

  const ALLOCATION_GROUPS = [
    ['company', 'Valor'],
    ['sector', 'Sector'],
    ['type', 'Tipo'],
    ['country', 'País'],
    ['region', 'Región'],
  ];
  const ALLOCATION_GROUP_TITLES = {
    company: 'Asignación por empresa',
    sector: 'Asignación por sector',
    type: 'Asignación por tipo de valor',
    country: 'Asignación por país',
    region: 'Asignación por región',
  };

  function allocationGroupLabel(item, group) {
    if (group === 'sector') return { label: item.sector || 'Sin sector', labelKey: item.sector || 'Sin sector' };
    if (group === 'type') return { label: item.type || 'Sin tipo', labelKey: item.type || 'Sin tipo' };
    if (group === 'country') return { label: item.country || 'Sin país', labelKey: item.country || 'Sin país' };
    if (group === 'region') return { label: item.region || 'Sin región', labelKey: item.region || 'Sin región' };
    return { label: item.companyName || item.ticker, labelKey: item.ticker };
  }

  function allocationItems(group = allocationGroup) {
    const positions = data?.positions ?? [];
    const amountFor = (item) => allocationBasis === 'cost' ? Number(item.costBasis) : Number(item.value);
    const groups = new Map();

    for (const item of positions) {
      const amount = amountFor(item);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const { label, labelKey } = allocationGroupLabel(item, group);
      const entry = groups.get(labelKey) ?? { label, labelKey, amount: 0, tickers: [] };
      entry.amount += amount;
      entry.tickers.push(item.ticker);
      groups.set(labelKey, entry);
    }

    const total = [...groups.values()].reduce((sum, entry) => sum + entry.amount, 0);
    return [...groups.values()]
      .sort((a, b) => b.amount - a.amount)
      .map((entry) => ({
        ...entry,
        percent: total > 0 ? (entry.amount / total) * 100 : 0,
      }));
  }



  function trendPct(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const number = Number(value);
    return `${number < 0 ? '↓' : '↑'} ${formatNumber(Math.abs(number), {
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDecimals(number),
    })} %`;
  }

  function doubleValueHtml(primary, secondary, className = '') {
    return `<div class="pf-double-value ${className}"><strong>${primary}</strong><small>${secondary}</small></div>`;
  }

  function allocationPanelHtml() {
    const items = allocationItems();
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    const groupTitle = ALLOCATION_GROUP_TITLES[allocationGroup] ?? ALLOCATION_GROUP_TITLES.company;
    const basisLabel = allocationBasis === 'cost' ? 'Coste de la cartera' : 'Valor de la cartera';
    const colors = new Map(items.map((item, index) => [item.labelKey, COLORS[index % COLORS.length]]));
    const legend = items.map((item) => `
      <li class="pf-allocation-legend-item" data-label-key="${escapeHtml(item.labelKey)}">
        <span class="pf-allocation-swatch" style="background:${colors.get(item.labelKey)}"></span>
        <span class="pf-allocation-legend-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
        <strong>${fmtPct(item.percent)}</strong>
      </li>`).join('');

    return `
      <div class="pf-allocation-card">
        <div class="pf-card-head pf-allocation-head">
          <div>
            <h4>${escapeHtml(groupTitle)}</h4>
            <p>Distribución de tu cartera según el ${allocationBasis === 'cost' ? 'coste' : 'valor'} actual.</p>
          </div>
          <div class="pf-allocation-controls">
            <label class="pf-control-toggle">
              <span>Coste</span>
              <button class="pf-switch ${allocationBasis === 'cost' ? 'on' : ''}" type="button"
                data-pf-cost-toggle aria-pressed="${allocationBasis === 'cost'}" title="Calcular sobre el coste en lugar del valor">
                <span></span>
              </button>
            </label>
            <select class="pf-select" data-pf-allocation-mode aria-label="Agrupar la asignación por">
              ${ALLOCATION_GROUPS.map(([key, label]) => `
                <option value="${key}" ${allocationGroup === key ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="pf-allocation-layout">
          <div class="pf-allocation-visual">
            ${donutSvg(items.map((item) => ({ ...item, color: colors.get(item.labelKey) })), {
              className: 'pf-allocation-donut',
              ariaLabel: groupTitle,
            })}
            <div class="pf-allocation-center">
              <span>${escapeHtml(basisLabel)}</span>
              <strong>${fmtMoney(total)}</strong>
            </div>
          </div>
          <ul class="pf-allocation-legend">${legend}</ul>
        </div>
        <div class="pf-card-footer">
          <span class="pf-footer-hint">El gráfico de evolución y el detalle de cada posición están abajo.</span>
          <button class="pf-footer-link" type="button" data-pf-export>⇩ Exportar CSV</button>
        </div>
      </div>`;
  }

  /* ── Tabla de posiciones (Actual / Vendido / Todo) ────────── */

  function positionsForView(view) {
    const all = data?.positions ?? [];
    if (view === 'sold') return all.filter((item) => (item.sharesSold ?? 0) > 0);
    if (view === 'all') return all;
    return all.filter((item) => (item.shares ?? 0) > 0);
  }

  function sortPositions(positions, getters) {
    const getter = getters?.[sortKey];
    if (!getter) return positions;
    const factor = sortDir === 'desc' ? -1 : 1;
    return [...positions].sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      const aNull = va === null || va === undefined || Number.isNaN(Number(va));
      const bNull = vb === null || vb === undefined || Number.isNaN(Number(vb));
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  }

  function positionCompanyCell(item) {
    return `
      <td class="pf-broker-company">
        ${portfolioLogoHtml(item)}
        <span class="pf-broker-company-copy">
          <strong>${escapeHtml(item.companyName || item.ticker)}</strong>
          <small>${escapeHtml(item.ticker)}</small>
        </span>
        ${chartButtonHtml(`ticker:${item.ticker}`)}
      </td>`;
  }

  function positionExpandCell(item) {
    return `
      <td class="pf-expand-cell">
        <button class="pf-expand-btn" type="button" data-pf-expand aria-expanded="false"
          aria-label="Ver compras y ventas de ${escapeHtml(item.ticker)}" title="Ver compras y ventas"></button>
      </td>`;
  }

  function lotDateCell(date, badge, chartId) {
    return `<td class="pf-lot-date">${fmtDate(date)}${badge ? ` <span class="pf-lot-badge ${badge === 'sell' ? 'sell' : ''}">${escapeHtml(badge)}</span>` : ''}${chartId ? chartButtonHtml(chartId) : ''}</td>`;
  }

  function lotSoldDateCell(lotDate, saleDate, chartId) {
    return `
      <td class="pf-lot-date">
        <span class="pf-lot-date-line">${fmtDate(lotDate)} <span class="pf-lot-badge">Compra</span></span>
        <span class="pf-lot-date-line">${fmtDate(saleDate)} <span class="pf-lot-badge sell">Venta</span></span>
        ${chartId ? chartButtonHtml(chartId) : ''}
      </td>`;
  }

  function titleAmount(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
    return fmtSigned(value);
  }

  const TOGGLEABLE_SORT_KEYS = new Set(['coste', 'ingresos', 'ganancia', 'gananciadiv', 'realizada', 'realizadadiv', 'total', 'divpct', 'divyoc', 'divcobrados']);

  const TOTAL_MEDIO_DEFAULT = { coste: 'medio', ingresos: 'medio', divcobrados: 'total' };

  const TOTAL_MEDIO_TOGGLES = {
    coste: {
      total: 'Coste', medio: 'Medio',
      titleTotal: 'Mostrar el precio medio en lugar del coste total',
      titleMedio: 'Mostrar el coste total en lugar del precio medio',
    },
    ingresos: {
      total: 'Ingresos', medio: 'Medio',
      titleTotal: 'Mostrar el precio medio de venta en lugar del ingreso total',
      titleMedio: 'Mostrar el ingreso total en lugar del precio medio de venta',
    },
    divcobrados: {
      total: 'Total', medio: 'Por acc.',
      titleTotal: 'Mostrar dividendos por acción en lugar del total',
      titleMedio: 'Mostrar el total de dividendos en lugar de por acción',
    },
  };

  function modeIsPct(key) {
    return (displayMode[key] ?? 'pct') === 'pct';
  }

  function costeCellHtml(costValue, priceValue, key = 'coste') {
    const showTotal = (displayMode[key] ?? TOTAL_MEDIO_DEFAULT[key] ?? 'medio') === 'total';
    const hasCost = costValue !== null && costValue !== undefined && Number.isFinite(Number(costValue));
    const hasPrice = priceValue !== null && priceValue !== undefined && Number.isFinite(Number(priceValue));
    const visible = !hasCost && !hasPrice ? '—' : showTotal ? fmtMoney(costValue) : fmtPrice(priceValue);
    const hover = showTotal ? (hasPrice ? fmtPrice(priceValue) : '') : (hasCost ? fmtMoney(costValue) : '');
    return `<td title="${escapeHtml(hover)}">${visible}</td>`;
  }

  function modeToggleHtml(key) {
    const cfg = TOTAL_MEDIO_TOGGLES[key];
    if (cfg) {
      const showTotal = (displayMode[key] ?? TOTAL_MEDIO_DEFAULT[key] ?? 'medio') === 'total';
      const action = showTotal ? cfg.titleTotal : cfg.titleMedio;
      return `<button class="pf-mode-toggle pf-mode-toggle-text${showTotal ? ' active' : ''}" type="button" data-mode-toggle="${key}"
        title="${action}" aria-label="${action}">${showTotal ? cfg.total : cfg.medio}</button>`;
    }
    const showPct = modeIsPct(key);
    return `<button class="pf-mode-toggle${showPct ? '' : ' active'}" type="button" data-mode-toggle="${key}"
      title="${showPct ? 'Mostrar importe en lugar del %' : 'Mostrar % en lugar del importe'}"
      aria-label="${showPct ? 'Cambiar a importe' : 'Cambiar a porcentaje'}">${showPct ? '%' : '$'}</button>`;
  }

  function toggleCellHtml(key, pct, amount, formatAmount) {
    const showPct = modeIsPct(key);
    const hasValue = amount !== null && amount !== undefined;
    const visible = !hasValue ? '—' : showPct ? fmtSignedPct(pct) : formatAmount(amount);
    const hover = !hasValue ? '' : showPct ? formatAmount(amount) : fmtSignedPct(pct);
    return `<td class="${changeClass(amount)}" title="${escapeHtml(hover)}">${visible}</td>`;
  }

  function wrapPositionsTable(headers, rows, totalsRow, { toggles = true, wideOpt = false, tableClass = '', sortable = true } = {}) {
    const headerHtml = `<th scope="col" class="pf-expand-head" aria-label="Compras y ventas"></th>` + headers.map(([key, label, hint], index) => {
      const active = sortable && sortKey === key;
      const mark = sortable ? (active ? (sortDir === 'desc' ? '↓' : '↑') : '↕') : '';
      const toggle = toggles && TOGGLEABLE_SORT_KEYS.has(key) ? modeToggleHtml(key) : '';
      return `
        <th scope="col" ${sortable ? `data-sort-key="${key}"` : ''} class="${index === 0 ? 'pf-broker-first-head' : ''}${active ? ' pf-sort-active' : ''}" title="${escapeHtml(hint)}">
          ${escapeHtml(label)} ${toggle}<span class="pf-sort-mark">${mark}</span>
        </th>`;
    }).join('');
    const wideClass = wideOpt ? ' pf-table-wide' : '';
    const extraClass = tableClass ? ` ${tableClass}` : '';
    return `
      <div class="table-wrap pf-broker-table-wrap">
        <table class="pf-broker-table${wideClass}${extraClass}">
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${rows}${totalsRow}</tbody>
        </table>
      </div>`;
  }

  function currentPositionsTableHtml() {
    const sortGetters = {
      valor: (item) => String(item.companyName || item.ticker || '').toLowerCase(),
      acciones: (item) => Number(item.shares) || 0,
      coste: (item) => ((displayMode.coste ?? 'medio') === 'total' ? Number(item.costBasis) : Number(item.avgCost)),
      ganancia: (item) => {
        const amount = item.unrealizedGross === null || item.unrealizedGross === undefined ? null : Number(item.unrealizedGross);
        if (amount === null || modeIsPct('ganancia')) {
          const cost = Number(item.costBasis);
          return amount === null || cost <= 0 ? null : amount / cost;
        }
        return amount;
      },
      gananciadiv: (item) => {
        const amount = item.unrealizedWithDividends === null || item.unrealizedWithDividends === undefined ? null : Number(item.unrealizedWithDividends);
        if (amount === null || modeIsPct('gananciadiv')) {
          const cost = Number(item.costBasis);
          return amount === null || cost <= 0 ? null : amount / cost;
        }
        return amount;
      },
      peso: (item) => Number(item.value),
      divpct: (item) => {
        const annual = Number(item.projectedAnnualDividends) || 0;
        if (!modeIsPct('divpct')) return annual;
        const value = Number(item.value);
        return value > 0 ? annual / value : null;
      },
      divyoc: (item) => {
        const annual = Number(item.projectedAnnualDividends) || 0;
        if (!modeIsPct('divyoc')) return annual;
        const cost = Number(item.costBasis);
        return cost > 0 ? annual / cost : null;
      },
      divcobrados: (item) => {
        const total = Number(item.dividendsTotal) || 0;
        const shares = Number(item.shares) || 0;
        return (displayMode.divcobrados ?? 'total') === 'total' ? total : (shares > 0 ? total / shares : 0);
      },
    };
    const positions = sortPositions(positionsForView('current'), sortGetters);
    const summary = data?.summary ?? {};
    const totalValue = Number(summary.totalValue) || 0;
    const totalCost = Number(summary.totalCost) || 0;
    const annualDividends = Number(summary.projectedAnnualDividends) || 0;
    const totalShares = positions.reduce((sum, item) => sum + (Number(item.shares) || 0), 0);

    const rows = positions.map((item) => {
      const value = Number(item.value);
      const costBasis = Number(item.costBasis);
      const annual = Number(item.projectedAnnualDividends) || 0;
      const marketPercent = totalValue > 0 && Number.isFinite(value) ? (value / totalValue) * 100 : null;
      const dividendYield = value > 0 ? (annual / value) * 100 : null;
      const dividendYoc = costBasis > 0 ? (annual / costBasis) * 100 : null;
      const gainPercent = costBasis > 0 && item.unrealizedGross !== null
        ? (Number(item.unrealizedGross) / costBasis) * 100
        : null;
      const gainWithDividends = Number(item.unrealizedWithDividends);
      const gainWithDividendsPct = costBasis > 0 && item.unrealizedWithDividends !== null
        ? (Number(item.unrealizedWithDividends) / costBasis) * 100
        : null;

      const lotRows = (item.lots ?? [])
        .filter((lot) => (lot.remaining ?? 0) > 0)
        .map((lot) => {
          const lotUnrealized = lot.heldUnrealized === null || lot.heldUnrealized === undefined ? null : Number(lot.heldUnrealized);
          const lotGainWithDividends = lotUnrealized === null ? null : lotUnrealized + (Number(lot.heldDividends) || 0);
          const lotGainPct = lot.heldCost > 0 && lotUnrealized !== null ? (lotUnrealized / lot.heldCost) * 100 : null;
          const lotGainWithDividendsPct = lot.heldCost > 0 && lotGainWithDividends !== null ? (lotGainWithDividends / lot.heldCost) * 100 : null;
          const lotWeight = totalValue > 0 && lot.heldValue !== null ? (Number(lot.heldValue) / totalValue) * 100 : null;
          const lotAnnual = (item.shares > 0 ? (Number(item.projectedAnnualDividends) || 0) / Number(item.shares) : 0) * (Number(lot.remaining) || 0);
          const lotYieldOnCost = lot.heldCost > 0 ? (lotAnnual / lot.heldCost) * 100 : null;
          return `
            <tr class="pf-lot-row" hidden data-buy-id="${escapeHtml(lot.id)}">
              <td class="pf-expand-cell"></td>
              ${lotDateCell(lot.date, null, `lot:${lot.id}`)}
              <td>${fmtShares(lot.remaining)}</td>
              ${costeCellHtml(lot.heldCost, lot.price)}
              ${toggleCellHtml('ganancia', lotGainPct, lot.heldUnrealized, fmtSigned)}
              ${toggleCellHtml('gananciadiv', lotGainWithDividendsPct, lotGainWithDividends, fmtSigned)}
              <td>${fmtPct(lotWeight)}</td>
              <td></td>
              ${toggleCellHtml('divyoc', lotYieldOnCost, lotAnnual, fmtMoney)}
              ${costeCellHtml(lot.heldDividends, (Number(lot.remaining) || 0) > 0 ? Number(lot.heldDividends) / Number(lot.remaining) : null, 'divcobrados')}
              ${groupsCellHtml(lot.groups)}
            </tr>`;
        }).join('');

      return `
        <tr data-ticker="${escapeHtml(item.ticker)}" tabindex="0">
          ${positionExpandCell(item)}
          ${positionCompanyCell(item)}
          <td>${fmtShares(item.shares)}</td>
          ${costeCellHtml(item.costBasis, item.avgCost)}
          ${toggleCellHtml('ganancia', gainPercent, item.unrealizedGross, fmtSigned)}
          ${toggleCellHtml('gananciadiv', gainWithDividendsPct, item.unrealizedWithDividends, fmtSigned)}
          <td>${fmtPct(marketPercent)}</td>
          ${toggleCellHtml('divpct', dividendYield, annual, fmtMoney)}
          ${toggleCellHtml('divyoc', dividendYoc, annual, fmtMoney)}
          ${costeCellHtml(item.dividendsTotal, (Number(item.shares) || 0) > 0 ? Number(item.dividendsTotal) / Number(item.shares) : null, 'divcobrados')}
          ${groupsCellHtml(item.groups)}
        </tr>
        ${lotRows}`;
    }).join('');

    const totalGainPercent = totalCost > 0 ? (Number(summary.totalUnrealized) / totalCost) * 100 : null;
    const totalDividendYield = totalValue > 0 ? (annualDividends / totalValue) * 100 : null;
    const totalDividendYoc = totalCost > 0 ? (annualDividends / totalCost) * 100 : null;
    const totalDividendsHeld = positions.reduce((sum, item) => sum + (Number(item.dividendsHeld) || 0), 0);
    const totalGainWithDividends = Number(summary.totalUnrealized) + totalDividendsHeld;
    const totalGainWithDividendsPct = totalCost > 0 ? (totalGainWithDividends / totalCost) * 100 : null;
    const totalsRow = `
      <tr class="pf-broker-totals-row">
        <td></td>
        <td class="pf-broker-company"><strong>Total</strong></td>
        <td>${fmtShares(totalShares)}</td>
        ${costeCellHtml(summary.totalCost, totalShares > 0 ? summary.totalCost / totalShares : null)}
        ${toggleCellHtml('ganancia', totalGainPercent, summary.totalUnrealized, fmtSigned)}
        ${toggleCellHtml('gananciadiv', totalGainWithDividendsPct, totalGainWithDividends, fmtSigned)}
        <td>100 %</td>
        ${toggleCellHtml('divpct', totalDividendYield, annualDividends, fmtMoney)}
        ${toggleCellHtml('divyoc', totalDividendYoc, annualDividends, fmtMoney)}
        ${costeCellHtml(summary.totalDividends, totalShares > 0 ? Number(summary.totalDividends) / totalShares : null, 'divcobrados')}
        <td></td>
      </tr>`;

    const headers = [
      ['valor', 'Valor', 'Empresa y posición'],
      ['acciones', 'Acciones', 'Número de acciones en cartera'],
      ['coste', 'Coste', 'Coste total y precio medio por acción'],
      ['ganancia', 'Ganancia', 'Ganancia o pérdida no realizada'],
      ['gananciadiv', 'Gan. + div.', 'No realizada + dividendos cobrados hasta hoy'],
      ['peso', 'Peso cartera', 'Peso de la posición sobre el valor total de la cartera'],
      ['divpct', 'Div. %', 'Rentabilidad por dividendo sobre el valor actual'],
      ['divyoc', 'Div. YoC', 'Rentabilidad por dividendo sobre el coste'],
      ['divcobrados', 'Div. cobrados', 'Dividendos cobrados desde la fecha de compra hasta hoy (total o por acción)'],
      ['grupos', 'Grupos', 'Grupos a los que pertenece esta posición'],
    ];
    return wrapPositionsTable(headers, rows, totalsRow, { wideOpt: true });
  }

  function soldPositionsTableHtml() {
    const soldCostOf = (item) => (Number(item.soldProceeds) || 0) - (Number(item.realizedGross) || 0);
    const soldAvgCostOf = (item) => {
      const cost = soldCostOf(item);
      const sold = Number(item.sharesSold) || 0;
      return sold > 0 ? cost / sold : null;
    };
    const sortGetters = {
      valor: (item) => String(item.companyName || item.ticker || '').toLowerCase(),
      vendidas: (item) => Number(item.sharesSold) || 0,
      coste: (item) => ((displayMode.coste ?? 'medio') === 'total' ? soldCostOf(item) : soldAvgCostOf(item) ?? 0),
      ingresos: (item) => {
        const total = Number(item.soldProceeds) || 0;
        const sold = Number(item.sharesSold) || 0;
        return (displayMode.ingresos ?? 'medio') === 'total' ? total : (sold > 0 ? total / sold : 0);
      },
      ganancia: (item) => Number(item.realizedGross) || 0,
      gananciadiv: (item) => Number(item.realizedGross) + (Number(item.dividendsTotal) || 0),
      divcobrados: (item) => {
        const total = Number(item.dividendsTotal) || 0;
        const sold = Number(item.sharesSold) || 0;
        return (displayMode.divcobrados ?? 'total') === 'total' ? total : (sold > 0 ? total / sold : 0);
      },
    };
    const positions = sortPositions(positionsForView('sold'), sortGetters);
    const totals = positions.reduce((acc, item) => {
      acc.sold += Number(item.sharesSold) || 0;
      acc.proceeds += Number(item.soldProceeds) || 0;
      acc.realized += Number(item.realizedGross) || 0;
      acc.gainPlusDiv += Number(item.realizedGross) + (Number(item.dividendsTotal) || 0);
      acc.dividends += Number(item.dividendsTotal) || 0;
      acc.soldCost += soldCostOf(item);
      return acc;
    }, { sold: 0, proceeds: 0, realized: 0, gainPlusDiv: 0, dividends: 0, soldCost: 0 });

    const rows = positions.map((item) => {
      const gainPlusDiv = Number(item.realizedGross) + (Number(item.dividendsTotal) || 0);
      const soldCost = (Number(item.soldProceeds) || 0) - (Number(item.realizedGross) || 0);
      const gainPct = soldCost > 0 ? (Number(item.realizedGross) || 0) / soldCost * 100 : null;
      const gainPlusDivPct = soldCost > 0 ? gainPlusDiv / soldCost * 100 : null;
      const lotRows = (item.lots ?? []).flatMap((lot) => (lot.sales ?? []).map((sale) => {
        const cost = Number(sale.proceeds) - Number(sale.gain);
        const gainPlusDiv = Number(sale.gain) + (Number(sale.dividends) || 0);
        const gainPct = cost > 0 ? (Number(sale.gain) / cost) * 100 : null;
        const gainPlusDivPct = cost > 0 ? (gainPlusDiv / cost) * 100 : null;
        return `
          <tr class="pf-lot-row" hidden>
            <td class="pf-expand-cell"></td>
            ${lotSoldDateCell(lot.date, sale.date, `lot:${lot.id}`)}
            <td>${fmtShares(sale.shares)}</td>
            ${costeCellHtml(cost, lot.price)}
            ${costeCellHtml(sale.proceeds, sale.price, 'ingresos')}
            ${toggleCellHtml('ganancia', gainPct, sale.gain, fmtSigned)}
            ${toggleCellHtml('gananciadiv', gainPlusDivPct, gainPlusDiv, fmtSigned)}
            ${costeCellHtml(sale.dividends, (Number(sale.shares) || 0) > 0 ? Number(sale.dividends) / Number(sale.shares) : null, 'divcobrados')}
          </tr>`;
      })).join('');
      return `
        <tr data-ticker="${escapeHtml(item.ticker)}" tabindex="0">
          ${positionExpandCell(item)}
          ${positionCompanyCell(item)}
          <td>${fmtShares(item.sharesSold)}</td>
          ${costeCellHtml(soldCost, soldAvgCostOf(item))}
          ${costeCellHtml(item.soldProceeds, (Number(item.sharesSold) || 0) > 0 ? Number(item.soldProceeds) / (Number(item.sharesSold) || 0) : null, 'ingresos')}
          ${toggleCellHtml('ganancia', gainPct, item.realizedGross, fmtSigned)}
          ${toggleCellHtml('gananciadiv', gainPlusDivPct, gainPlusDiv, fmtSigned)}
          ${costeCellHtml(item.dividendsTotal, (Number(item.sharesSold) || 0) > 0 ? Number(item.dividendsTotal) / (Number(item.sharesSold) || 0) : null, 'divcobrados')}
        </tr>
        ${lotRows}`;
    }).join('');

    const totalGainPct = totals.soldCost > 0 ? totals.realized / totals.soldCost * 100 : null;
    const totalGainPlusDivPct = totals.soldCost > 0 ? totals.gainPlusDiv / totals.soldCost * 100 : null;
    const totalsRow = `
      <tr class="pf-broker-totals-row">
        <td></td>
        <td class="pf-broker-company"><strong>Total</strong></td>
        <td>${fmtShares(totals.sold)}</td>
        ${costeCellHtml(totals.soldCost, totals.sold > 0 ? totals.soldCost / totals.sold : null)}
        ${costeCellHtml(totals.proceeds, totals.sold > 0 ? totals.proceeds / totals.sold : null, 'ingresos')}
        ${toggleCellHtml('ganancia', totalGainPct, totals.realized, fmtSigned)}
        ${toggleCellHtml('gananciadiv', totalGainPlusDivPct, totals.gainPlusDiv, fmtSigned)}
        ${costeCellHtml(totals.dividends, totals.sold > 0 ? totals.dividends / totals.sold : null, 'divcobrados')}
      </tr>`;

    const headers = [
      ['valor', 'Valor', 'Empresa vendida'],
      ['vendidas', 'Vendidas', 'Acciones vendidas de esta empresa'],
      ['coste', 'Coste', 'Coste de lo vendido y precio medio por acción vendida'],
      ['ingresos', 'Ingresos', 'Ingresos totales de las ventas y precio medio por acción vendida'],
      ['ganancia', 'Ganancia', 'Ganancia realizada al vender'],
      ['gananciadiv', 'Ganancia + div.', 'Ganancia realizada + dividendos cobrados'],
      ['divcobrados', 'Div. cobrados', 'Dividendos cobrados mientras la tuviste'],
    ];
    return wrapPositionsTable(headers, rows, totalsRow);
  }

  function allPositionsTableHtml() {
    const sortGetters = {
      valor: (item) => String(item.companyName || item.ticker || '').toLowerCase(),
      acciones: (item) => (Number(item.shares) || 0) + (Number(item.sharesSold) || 0),
      coste: (item) => {
        const shares = (Number(item.shares) || 0) + (Number(item.sharesSold) || 0);
        return (displayMode.coste ?? 'medio') === 'total' ? Number(item.totalInvested) : (shares > 0 ? Number(item.totalInvested) / shares : null);
      },
      ganancia: (item) => {
        const amount = item.unrealizedGross === null || item.unrealizedGross === undefined ? null : Number(item.unrealizedGross);
        if (amount === null || modeIsPct('ganancia')) {
          const cost = Number(item.costBasis);
          return amount === null || cost <= 0 ? null : amount / cost;
        }
        return amount;
      },
      gananciadiv: (item) => {
        const amount = item.unrealizedWithDividends === null || item.unrealizedWithDividends === undefined ? null : Number(item.unrealizedWithDividends);
        if (amount === null || modeIsPct('gananciadiv')) {
          const cost = Number(item.costBasis);
          return amount === null || cost <= 0 ? null : amount / cost;
        }
        return amount;
      },
      realizada: (item) => {
        const amount = Number(item.realizedGross) || 0;
        if (modeIsPct('realizada')) {
          const cost = (Number(item.soldProceeds) || 0) - amount;
          return cost > 0 ? amount / cost : null;
        }
        return amount;
      },
      realizadadiv: (item) => {
        const amount = Number(item.realizedGross) + (Number(item.dividendsTotal) || 0);
        if (modeIsPct('realizadadiv')) {
          const cost = (Number(item.soldProceeds) || 0) - (Number(item.realizedGross) || 0);
          return cost > 0 ? amount / cost : null;
        }
        return amount;
      },
      total: (item) => {
        const amount = Number(item.totalReturn) || 0;
        if (modeIsPct('total')) {
          const invested = Number(item.totalInvested) || 0;
          return invested > 0 ? amount / invested : null;
        }
        return amount;
      },
    };
    const positions = sortPositions(positionsForView('all'), sortGetters);
    const summary = data?.summary ?? {};
    const totalCost = Number(summary.totalCost) || 0;
    const totalShares = positions.reduce((sum, item) => sum + (Number(item.shares) || 0), 0);
    const totalHeldDividends = positions.reduce((sum, item) => sum + (Number(item.dividendsHeld) || 0), 0);
    const totalSoldCost = positions.reduce((sum, item) => sum + ((Number(item.soldProceeds) || 0) - (Number(item.realizedGross) || 0)), 0);
    const totalRealized = positions.reduce((sum, item) => sum + (Number(item.realizedGross) || 0), 0);
    const totalDividends = positions.reduce((sum, item) => sum + (Number(item.dividendsTotal) || 0), 0);
    const totalUnrealized = positions.reduce((sum, item) => sum + (item.unrealizedGross === null || item.unrealizedGross === undefined ? 0 : Number(item.unrealizedGross)), 0);
    const totalInvested = positions.reduce((sum, item) => sum + (Number(item.totalInvested) || 0), 0);
    const hasHeld = totalShares > 0;
    const hasSold = totalSoldCost > 0 || totalRealized > 0;

    const rows = positions.map((item) => {
      const held = (item.shares ?? 0) > 0;
      const sold = (item.sharesSold ?? 0) > 0;
      const costBasis = Number(item.costBasis);
      const soldCost = (Number(item.soldProceeds) || 0) - (Number(item.realizedGross) || 0);
      const gainPercent = held && costBasis > 0 && item.unrealizedGross !== null ? (Number(item.unrealizedGross) / costBasis) * 100 : null;
      const gainWithDividends = held && item.unrealizedWithDividends !== null && item.unrealizedWithDividends !== undefined ? Number(item.unrealizedWithDividends) : null;
      const gainWithDividendsPct = held && costBasis > 0 && item.unrealizedWithDividends !== null ? (Number(item.unrealizedWithDividends) / costBasis) * 100 : null;
      const realized = sold ? Number(item.realizedGross) || 0 : null;
      const realizedPct = sold && soldCost > 0 ? ((Number(item.realizedGross) || 0) / soldCost) * 100 : null;
      const realizedPlusDiv = sold ? Number(item.realizedGross) + (Number(item.dividendsTotal) || 0) : null;
      const realizedPlusDivPct = sold && soldCost > 0 ? (realizedPlusDiv / soldCost) * 100 : null;
      const totalPct = Number(item.totalInvested) > 0 ? (Number(item.totalReturn) / Number(item.totalInvested)) * 100 : null;
      const sharesBought = (Number(item.shares) || 0) + (Number(item.sharesSold) || 0);
      const costeAvg = sharesBought > 0 ? Number(item.totalInvested) / sharesBought : null;

      const statusBadge = sold
        ? `<span class="pf-status-badge ${held ? 'partial' : 'sold'}">${held ? 'Vendida parcial' : 'Vendida'}</span>`
        : '';
      const companyCell = `
        <td class="pf-broker-company">
          ${portfolioLogoHtml(item)}
           <span class="pf-broker-company-copy">
             <strong>${escapeHtml(item.companyName || item.ticker)}</strong>
             <small>${escapeHtml(item.ticker)}</small>
           </span>
           ${chartButtonHtml(`ticker:${item.ticker}`)}
           ${statusBadge}
        </td>`;

      const lotRows = (item.lots ?? []).flatMap((lot) => {
        const rowsArr = [];
        for (const sale of lot.sales ?? []) {
          const cost = Number(sale.proceeds) - Number(sale.gain);
          const gainPlusDiv = Number(sale.gain) + (Number(sale.dividends) || 0);
          const gainPct = cost > 0 ? (Number(sale.gain) / cost) * 100 : null;
          const gainPlusDivPct = cost > 0 ? (gainPlusDiv / cost) * 100 : null;
          rowsArr.push(`
            <tr class="pf-lot-row" hidden>
              <td class="pf-expand-cell"></td>
              ${lotSoldDateCell(lot.date, sale.date, `lot:${lot.id}`)}
              <td>${fmtShares(sale.shares)}</td>
              ${costeCellHtml(cost, lot.price, 'coste')}
              <td>—</td><td>—</td>
              ${toggleCellHtml('realizada', gainPct, sale.gain, fmtSigned)}
              ${toggleCellHtml('realizadadiv', gainPlusDivPct, gainPlusDiv, fmtSigned)}
              <td>—</td>
            </tr>`);
        }
        if ((lot.remaining ?? 0) > 0) {
          const lotUnrealized = lot.heldUnrealized === null || lot.heldUnrealized === undefined ? null : Number(lot.heldUnrealized);
          const lotGainWithDividends = lotUnrealized === null ? null : lotUnrealized + (Number(lot.heldDividends) || 0);
          const lotGainPct = lot.heldCost > 0 && lotUnrealized !== null ? (lotUnrealized / lot.heldCost) * 100 : null;
          const lotGainWithDividendsPct = lot.heldCost > 0 && lotGainWithDividends !== null ? (lotGainWithDividends / lot.heldCost) * 100 : null;
          rowsArr.push(`
            <tr class="pf-lot-row" hidden>
              <td class="pf-expand-cell"></td>
              ${lotDateCell(lot.date, 'En cartera', `lot:${lot.id}`)}
              <td>${fmtShares(lot.remaining)}</td>
              ${costeCellHtml(lot.heldCost, lot.price, 'coste')}
              ${toggleCellHtml('ganancia', lotGainPct, lotUnrealized, fmtSigned)}
              ${toggleCellHtml('gananciadiv', lotGainWithDividendsPct, lotGainWithDividends, fmtSigned)}
              <td>—</td><td>—</td><td>—</td>
            </tr>`);
        }
        return rowsArr;
      }).join('');

      return `
        <tr data-ticker="${escapeHtml(item.ticker)}" tabindex="0">
          ${positionExpandCell(item)}
          ${companyCell}
          <td>${fmtShares(sharesBought)}</td>
          ${costeCellHtml(item.totalInvested, costeAvg, 'coste')}
          ${toggleCellHtml('ganancia', gainPercent, held ? item.unrealizedGross : null, fmtSigned)}
          ${toggleCellHtml('gananciadiv', gainWithDividendsPct, gainWithDividends, fmtSigned)}
          ${toggleCellHtml('realizada', realizedPct, realized, fmtSigned)}
          ${toggleCellHtml('realizadadiv', realizedPlusDivPct, realizedPlusDiv, fmtSigned)}
          ${toggleCellHtml('total', totalPct, item.totalReturn, fmtSigned)}
        </tr>
        ${lotRows}`;
    }).join('');

    const totalGainPct = totalCost > 0 ? (totalUnrealized / totalCost) * 100 : null;
    const totalGainWithDivPct = totalCost > 0 ? ((totalUnrealized + totalHeldDividends) / totalCost) * 100 : null;
    const totalRealizedPct = totalSoldCost > 0 ? (totalRealized / totalSoldCost) * 100 : null;
    const totalRealizedPlusDivPct = totalSoldCost > 0 ? ((totalRealized + totalDividends) / totalSoldCost) * 100 : null;
    const totalReturn = totalUnrealized + totalRealized + totalDividends;
    const totalReturnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : null;
    const totalSharesBought = totalShares + positions.reduce((sum, item) => sum + (Number(item.sharesSold) || 0), 0);

    const totalsRow = `
      <tr class="pf-broker-totals-row">
        <td></td>
        <td class="pf-broker-company"><strong>Total</strong></td>
        <td>${fmtShares(totalSharesBought)}</td>
        ${costeCellHtml(totalInvested, totalSharesBought > 0 ? totalInvested / totalSharesBought : null, 'coste')}
        ${toggleCellHtml('ganancia', totalGainPct, hasHeld ? totalUnrealized : null, fmtSigned)}
        ${toggleCellHtml('gananciadiv', totalGainWithDivPct, hasHeld ? totalUnrealized + totalHeldDividends : null, fmtSigned)}
        ${toggleCellHtml('realizada', totalRealizedPct, hasSold ? totalRealized : null, fmtSigned)}
        ${toggleCellHtml('realizadadiv', totalRealizedPlusDivPct, hasSold ? totalRealized + totalDividends : null, fmtSigned)}
        ${toggleCellHtml('total', totalReturnPct, totalReturn, fmtSigned)}
      </tr>`;

    const headers = [
      ['valor', 'Valor', 'Empresa (en cartera o vendida)'],
      ['acciones', 'Acciones', 'Acciones totales (en cartera + vendidas)'],
      ['coste', 'Coste', 'Coste total de todas las acciones (en cartera + vendidas) y precio medio (coste/medio)'],
      ['ganancia', 'No real.', 'Ganancia o pérdida no realizada de la posición actual'],
      ['gananciadiv', 'No real. + div.', 'No realizada + dividendos cobrados de la posición actual'],
      ['realizada', 'Real.', 'Ganancia realizada con las ventas'],
      ['realizadadiv', 'Real. + div.', 'Ganancia realizada + dividendos cobrados'],
      ['total', 'Total', 'Rentabilidad total sobre todo lo invertido (en cartera + vendidas) o importe en $'],
    ];
    return wrapPositionsTable(headers, rows, totalsRow, { wideOpt: true });
  }

  function positionsTableHtml(view) {
    if (view === 'sold') return soldPositionsTableHtml();
    if (view === 'all') return allPositionsTableHtml();
    return currentPositionsTableHtml();
  }

  /* ── Pestañas y grupos ───────────────────────────────────── */

  const PREDEFINED_TABS = [
    ['sector', 'Sector'],
    ['type', 'Tipo'],
    ['country', 'País'],
    ['region', 'Región'],
  ];

  function tabForPosition(item, key) {
    if (key === 'sector') return item.sector || 'Sin sector';
    if (key === 'type') return item.type || 'Sin tipo';
    if (key === 'country') return item.country || 'Sin país';
    if (key === 'region') return item.region || 'Sin región';
    return null;
  }

  function userTabs() {
    return data?.tabs ?? [];
  }

  function userGroups() {
    return data?.groups ?? [];
  }

  function groupsOfTab(tabId) {
    return userGroups().filter((group) => group.tabId === tabId);
  }

  function groupById(id) {
    return userGroups().find((group) => group.id === id) ?? null;
  }

  function tabById(id) {
    return userTabs().find((tab) => tab.id === id) ?? null;
  }

  function groupPillsHtml(groups) {
    return (groups ?? []).map((group) => `
      <span class="pf-g-pill" title="${escapeHtml(group.name)}">
        <span class="pf-g-dot" style="background:${escapeHtml(group.color)}"></span>${escapeHtml(group.name)}
      </span>`).join('');
  }

  function groupsCellHtml(groups) {
    return `
      <td class="pf-groups-cell">
        <span class="pf-g-pills">${groupPillsHtml(groups)}</span>
        <button class="pf-g-add" type="button" aria-label="Añadir o quitar grupos" title="Añadir o quitar grupos">＋</button>
      </td>`;
  }

  /* ── Popover de asignación de grupos ─────────────────────── */

  function ensureGroupPopover() {
    if (groupPopover) return groupPopover;
    groupPopover = document.createElement('div');
    groupPopover.className = 'pf-g-popover';
    groupPopover.setAttribute('role', 'dialog');
    groupPopover.setAttribute('aria-label', 'Grupos');
    groupPopover.hidden = true;
    document.body.appendChild(groupPopover);
    return groupPopover;
  }

  function positionGroupPopover() {
    const pop = ensureGroupPopover();
    const trigger = groupPopoverContext?.trigger;
    if (!trigger) return;
    const width = pop.offsetWidth || 270;
    const height = pop.offsetHeight || 320;
    const rect = trigger.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + width > document.documentElement.clientWidth - 8) left = document.documentElement.clientWidth - width - 8;
    if (top + height > document.documentElement.clientHeight - 8) top = rect.top - height - 8;
    pop.style.left = `${Math.max(8, left)}px`;
    pop.style.top = `${Math.max(8, top)}px`;
  }

  function openGroupPopover(trigger, context) {
    closeGroupPopover();
    groupPopoverContext = { ...context, trigger };
    renderGroupPopover();
    const pop = ensureGroupPopover();
    pop.hidden = false;
    positionGroupPopover();
  }

  function closeGroupPopover() {
    if (groupPopover) groupPopover.hidden = true;
    groupPopoverContext = null;
  }

  function renderGroupPopover() {
    const pop = ensureGroupPopover();
    const context = groupPopoverContext;
    if (!context) return;
    const groups = userGroups();
    const isLot = context.scope === 'lot';
    const title = isLot ? `Lote · ${fmtDate(context.date)}` : `Acción · ${context.ticker}`;
    const rows = groups.map((group) => {
      const byRule = (group.ruleTickers ?? []).includes(context.ticker);
      const member = isLot ? byRule || (group.lotTransactionIds ?? []).includes(context.buyId) : byRule;
      const disabled = isLot && byRule;
      const hint = disabled ? `Viene del grupo de la acción ${context.ticker}. Quítalo desde la fila de la acción.` : '';
      return `
        <div class="watch-popover-row pf-g-popover-row ${member ? 'checked' : ''}${disabled ? ' disabled' : ''}"
          data-group-id="${group.id}" data-member="${member}" data-disabled="${disabled}" role="checkbox"
          aria-checked="${member}" tabindex="${disabled ? -1 : 0}" title="${escapeHtml(hint)}">
          <span class="watch-popover-check" aria-hidden="true">${member ? '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>' : ''}</span>
          <span class="pf-g-dot" style="background:${escapeHtml(group.color)}"></span>
          <span class="watch-popover-name">${escapeHtml(group.name)}</span>
          <span class="watch-popover-count">${(group.ruleTickers?.length || 0) + (group.lotTransactionIds?.length || 0)}</span>
        </div>`;
    }).join('');
    pop.innerHTML = `
      <div class="watch-popover-head">
        <div><strong>Grupos</strong><span class="watch-popover-sub">${escapeHtml(title)}</span></div>
        <button class="watch-popover-close" type="button" aria-label="Cerrar">×</button>
      </div>
      <div class="watch-popover-list">
        ${groups.length ? rows : '<div class="watch-popover-empty">Aún no hay grupos. Crea una pestaña y un grupo debajo de la tabla.</div>'}
      </div>`;
    pop.querySelector('.watch-popover-close').addEventListener('click', closeGroupPopover);
    pop.querySelectorAll('.pf-g-popover-row').forEach((row) => {
      if (row.dataset.disabled === 'true') return;
      row.addEventListener('click', () => toggleGroupMember(row));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleGroupMember(row);
        }
      });
    });
  }

  async function toggleGroupMember(row) {
    const context = groupPopoverContext;
    if (!context) return;
    const groupId = Number(row.dataset.groupId);
    const wasMember = row.dataset.member === 'true';
    const method = wasMember ? 'DELETE' : 'POST';
    try {
      await api(`/api/portfolio/groups/${groupId}/members`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context.scope === 'lot' ? { transactionId: context.buyId } : { ticker: context.ticker }),
      });
      showToast?.(wasMember ? 'Quitado del grupo.' : 'Añadido al grupo.');
      closeGroupPopover();
      await refresh();
    } catch (error) {
      showToast?.(error.message);
    }
  }

  document.addEventListener('click', (event) => {
    if (groupPopover && !groupPopover.hidden && !groupPopover.contains(event.target) && !event.target.closest('.pf-g-add')) {
      closeGroupPopover();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && groupPopover && !groupPopover.hidden) closeGroupPopover();
  });

  /* ── Sección de grupos (debajo de la tabla de acciones) ─── */

  function gruposTabOptions() {
    const pre = PREDEFINED_TABS.map(([key, label]) => ({ type: 'predefined', key, label }));
    const custom = userTabs().map((tab) => ({ type: 'custom', id: tab.id, label: tab.name }));
    return [...pre, ...custom];
  }

  function tabOptionValue(opt) {
    return opt.type === 'predefined' ? `pre:${opt.key}` : `tab:${opt.id}`;
  }

  function selectedTabValue() {
    if (activeTab?.type === 'predefined') return `pre:${activeTab.key}`;
    if (activeTab?.type === 'custom') return `tab:${activeTab.id}`;
    return '';
  }

  function groupPillsForActiveTab() {
    if (activeTab?.type === 'predefined') {
      const seen = new Map();
      let index = 0;
      for (const item of data?.positions ?? []) {
        const label = tabForPosition(item, activeTab.key);
        if (!seen.has(label)) seen.set(label, { id: label, label, count: 0, color: COLORS[index++ % COLORS.length], kind: 'predefined' });
        seen.get(label).count += 1;
      }
      return [...seen.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
    }
    if (activeTab?.type === 'custom') {
      return groupsOfTab(activeTab.id).map((group) => ({
        id: group.id,
        label: group.name,
        count: (group.ruleTickers?.length || 0) + (group.lotTransactionIds?.length || 0),
        color: group.color,
        kind: 'custom',
        groupId: group.id,
      }));
    }
    return [];
  }

  function gruposSectionHtml() {
    const options = gruposTabOptions();
    const selected = selectedTabValue();
    const isCustom = activeTab?.type === 'custom';
    const tab = isCustom ? tabById(activeTab.id) : null;
    const activeTabLabel = activeTab?.type === 'predefined'
      ? (PREDEFINED_TABS.find(([key]) => key === activeTab.key)?.[1] ?? activeTab.key)
      : (tab?.name ?? '');
    const tabsHtml = options.map((opt) => {
      const value = tabOptionValue(opt);
      const active = selected === value;
      const color = opt.type === 'custom' ? (tabById(opt.id)?.color ?? '') : '';
      return `
        <button class="pf-groups-tab ${active ? 'active' : ''}" type="button" data-pf-groups-tab-select="${escapeHtml(value)}"
          role="tab" aria-selected="${active}">
          ${color ? `<span class="pf-g-dot" style="background:${escapeHtml(color)}"></span>` : ''}${escapeHtml(opt.label)}
        </button>`;
    }).join('');
    const viewsHtml = ['current', 'sold', 'all'].map((key) => {
      const label = key === 'current' ? 'Actual' : key === 'sold' ? 'Vendido' : 'Todo';
      return `
        <button class="pf-view-button ${groupsView === key ? 'active' : ''}" type="button"
          data-pf-groups-view="${key}" aria-pressed="${groupsView === key}">${label}</button>`;
    }).join('');
    return `
      <div class="pf-groups-section">
        <div class="pf-card-head">
          <div>
            <h4>Grupos</h4>
            <p>${activeTab
              ? `Pestaña «${escapeHtml(activeTabLabel)}» — pulsa un grupo para ver sus sublíneas.`
              : 'Elige una pestaña arriba para ver sus grupos.'}</p>
          </div>
          <div class="pf-groups-head-actions">
            <button class="pf-outline-button pf-show-all-btn" type="button" data-pf-chart-show-all="grupos" title="Mostrar todos los grupos principales de esta pestaña en el gráfico">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg>
              <span>Mostrar todo</span>
            </button>
            <div class="pf-positions-views" role="group" aria-label="Vista de grupos">${viewsHtml}</div>
            ${isCustom ? `
              <div class="pf-groups-controls">
                <button class="pf-outline-button" type="button" data-pf-tab-edit title="Renombrar o cambiar color">✎</button>
                <button class="pf-outline-button" type="button" data-pf-tab-delete title="Eliminar pestaña">×</button>
              </div>` : ''}
          </div>
        </div>
        <div class="pf-groups-tabs" role="tablist" aria-label="Pestañas de grupos">
          <div class="pf-groups-tab-list">${tabsHtml}</div>
          <div class="pf-groups-tab-actions">
            ${isCustom ? `<button class="pf-outline-button" type="button" data-pf-group-create>${groupFormOpen ? 'Cerrar' : '＋ Crear grupo'}</button>` : ''}
            <button class="pf-outline-button" type="button" data-pf-tab-create>${tabFormOpen ? 'Cerrar' : '＋ Nueva pestaña'}</button>
          </div>
        </div>
        ${tabFormOpen ? tabCreateFormHtml() : ''}
        ${editingTabId ? tabEditFormHtml(tabById(editingTabId)) : ''}
        ${isCustom && groupFormOpen ? groupCreateFormHtml(tab) : ''}
        ${editingGroupId ? groupEditFormHtml(groupById(editingGroupId)) : ''}
        ${gruposTableHtml()}
      </div>`;
  }

  function groupUnits(tab, group, view) {
    const units = [];
    const positions = data?.positions ?? [];
    if (!tab) return units;
    const addHeld = (item, lot) => units.push({ kind: 'held', item, lot });
    const addSold = (item, lot) => {
      for (const sale of lot.sales ?? []) units.push({ kind: 'sold', item, lot, sale });
    };
    const relevantLots = (item) => (item.lots ?? []).filter((lot) => ((lot.remaining ?? 0) > 0 || (lot.sales ?? []).length > 0));
    if (tab.type === 'predefined') {
      for (const item of positions) {
        if (tabForPosition(item, tab.key) !== group.label) continue;
        for (const lot of relevantLots(item)) {
          if (view !== 'sold' && (lot.remaining ?? 0) > 0) addHeld(item, lot);
          if (view !== 'current') addSold(item, lot);
        }
      }
      return units;
    }
    if (tab.type === 'custom') {
      const g = groupById(Number(group.groupId ?? group.id));
      if (!g) return units;
      const ruleTickers = new Set(g.ruleTickers ?? []);
      const lotIds = new Set(g.lotTransactionIds ?? []);
      for (const item of positions) {
        const isRule = ruleTickers.has(item.ticker);
        const lots = relevantLots(item);
        const selected = isRule ? lots : lots.filter((lot) => lotIds.has(lot.id));
        for (const lot of selected) {
          if (view !== 'sold' && (lot.remaining ?? 0) > 0) addHeld(item, lot);
          if (view !== 'current') addSold(item, lot);
        }
      }
      return units;
    }
    return units;
  }

  function aggregateUnits(units) {
    const totals = { shares: 0, cost: 0, value: 0, gain: 0, dividends: 0, annual: 0 };
    let hasHeld = false;
    for (const unit of units) {
      const item = unit.item;
      if (unit.kind === 'held') {
        const lot = unit.lot;
        hasHeld = true;
        totals.shares += Number(lot.remaining) || 0;
        totals.cost += Number(lot.heldCost) || 0;
        totals.value += Number(lot.heldValue) || 0;
        totals.gain += Number(lot.heldUnrealized) || 0;
        totals.dividends += Number(lot.heldDividends) || 0;
        const perShare = item.shares > 0 ? (Number(item.projectedAnnualDividends) || 0) / Number(item.shares) : 0;
        totals.annual += perShare * (Number(lot.remaining) || 0);
      } else {
        const sale = unit.sale;
        totals.shares += Number(sale.shares) || 0;
        totals.cost += (Number(sale.shares) || 0) * (Number(unit.lot.price) || 0);
        totals.gain += Number(sale.gain) || 0;
        totals.dividends += Number(sale.dividends) || 0;
      }
    }
    if (!hasHeld) totals.annual = null;
    return totals;
  }

  function computeGroupTotals(tab, group, view) {
    return aggregateUnits(groupUnits(tab, group, view));
  }

  function gruposTableHtml() {
    if (!activeTab) return '<p class="pf-groups-empty">Elige una pestaña arriba para ver sus grupos.</p>';
    const groups = groupPillsForActiveTab();
    if (!groups.length) {
      if (activeTab?.type === 'custom') return '<p class="pf-groups-empty">Esta pestaña aún no tiene grupos. Pulsa «＋ Crear grupo» para crear el primero.</p>';
      return '<p class="pf-groups-empty">No hay posiciones para agrupar por este criterio.</p>';
    }
    return groupRowsTableHtml(groups);
  }

  function groupSublineActions(tab, group, view) {
    const byTicker = new Map();
    for (const unit of groupUnits(tab, group, view)) {
      const ticker = unit.item.ticker;
      const entry = byTicker.get(ticker) ?? { item: unit.item, units: [] };
      entry.units.push(unit);
      byTicker.set(ticker, entry);
    }
    return [...byTicker.values()].map(({ item, units }) => ({ item, totals: aggregateUnits(units) }));
  }

  function groupsModeIsPct(key) {
    return (groupsDisplayMode[key] ?? 'pct') === 'pct';
  }

  function groupsModeToggleHtml(key) {
    const cfg = TOTAL_MEDIO_TOGGLES[key];
    if (cfg) {
      const showTotal = (groupsDisplayMode[key] ?? TOTAL_MEDIO_DEFAULT[key] ?? 'medio') === 'total';
      const action = showTotal ? cfg.titleTotal : cfg.titleMedio;
      return `<button class="pf-mode-toggle pf-mode-toggle-text${showTotal ? ' active' : ''}" type="button" data-groups-mode-toggle="${key}"
        title="${action}" aria-label="${action}">${showTotal ? cfg.total : cfg.medio}</button>`;
    }
    const showPct = groupsModeIsPct(key);
    return `<button class="pf-mode-toggle${showPct ? '' : ' active'}" type="button" data-groups-mode-toggle="${key}"
      title="${showPct ? 'Mostrar importe en lugar del %' : 'Mostrar % en lugar del importe'}"
      aria-label="${showPct ? 'Cambiar a importe' : 'Cambiar a porcentaje'}">${showPct ? '%' : '$'}</button>`;
  }

  function groupsCostCellHtml(cost) {
    const hasCost = cost !== null && cost !== undefined && Number.isFinite(Number(cost));
    return `<td>${hasCost ? fmtMoney(cost) : '—'}</td>`;
  }

  function groupsDividendsCellHtml(dividends, shares) {
    const hasValue = dividends !== null && dividends !== undefined && Number.isFinite(Number(dividends));
    if (!hasValue) return '<td>—</td>';
    const showTotal = (groupsDisplayMode.divcobrados ?? 'total') === 'total';
    const perShare = (Number(shares) || 0) > 0 ? dividends / Number(shares) : null;
    const visible = showTotal ? fmtMoney(dividends) : fmtMoney(perShare);
    const hover = showTotal ? (perShare != null ? fmtMoney(perShare) : '') : fmtMoney(dividends);
    return `<td title="${escapeHtml(hover)}">${visible}</td>`;
  }

  function groupsToggleCellHtml(key, pct, amount, formatAmount) {
    const showPct = groupsModeIsPct(key);
    const hasValue = amount !== null && amount !== undefined;
    const visible = !hasValue ? '—' : showPct ? fmtSignedPct(pct) : formatAmount(amount);
    const hover = !hasValue ? '' : showPct ? formatAmount(amount) : fmtSignedPct(pct);
    return `<td class="${changeClass(amount)}" title="${escapeHtml(hover)}">${visible}</td>`;
  }

  function groupSublinesHtml(group, expanded = false) {
    const key = String(group.id);
    const actions = groupSublineActions(activeTab, group, groupsView);
    const totalValue = Number(data?.summary?.totalValue) || 0;
    return actions.map(({ item, totals }) => {
      const gainPercent = totals.cost > 0 ? (totals.gain / totals.cost) * 100 : null;
      const gainWithDividends = totals.gain + totals.dividends;
      const gainWithDividendsPct = totals.cost > 0 ? (gainWithDividends / totals.cost) * 100 : null;
      const weight = totalValue > 0 ? (totals.value / totalValue) * 100 : null;
      const dividendYield = totals.value > 0 ? (totals.annual / totals.value) * 100 : null;
      const dividendYoc = totals.cost > 0 ? (totals.annual / totals.cost) * 100 : null;
      return `
        <tr class="pf-lot-row pf-group-subline" data-pf-group-subline="${escapeHtml(key)}" data-ticker="${escapeHtml(item.ticker)}" ${expanded ? '' : 'hidden'}>
          <td class="pf-expand-cell"></td>
          <td class="pf-broker-company">
            ${portfolioLogoHtml(item)}
           <span class="pf-broker-company-copy">
             <strong>${escapeHtml(item.companyName || item.ticker)}</strong>
             <small>${escapeHtml(item.ticker)}</small>
           </span>
           ${chartButtonHtml(`ticker:${item.ticker}`)}
         </td>
          <td>${fmtShares(totals.shares)}</td>
          ${groupsCostCellHtml(totals.cost)}
          ${groupsToggleCellHtml('ganancia', gainPercent, totals.gain, fmtSigned)}
          ${groupsToggleCellHtml('gananciadiv', gainWithDividendsPct, gainWithDividends, fmtSigned)}
          <td>${fmtPct(weight)}</td>
          ${groupsToggleCellHtml('divpct', dividendYield, totals.annual, fmtMoney)}
          ${groupsToggleCellHtml('divyoc', dividendYoc, totals.annual, fmtMoney)}
          ${groupsDividendsCellHtml(totals.dividends, totals.shares)}
          ${groupsCellHtml(item.groups)}
        </tr>`;
    }).join('');
  }

  function groupRowHtml(group, totals, totalValue) {
    const key = String(group.id);
    const expanded = expandedGroups.has(key);
    const actionCount = groupSublineActions(activeTab, group, groupsView).length;
    const weight = totalValue > 0 ? (totals.value / totalValue) * 100 : null;
    const dividendYield = totals.value > 0 ? (totals.annual / totals.value) * 100 : null;
    const dividendYoc = totals.cost > 0 ? (totals.annual / totals.cost) * 100 : null;
    const gainPercent = totals.cost > 0 ? (totals.gain / totals.cost) * 100 : null;
    const gainWithDividends = totals.gain + totals.dividends;
    const gainWithDividendsPct = totals.cost > 0 ? (gainWithDividends / totals.cost) * 100 : null;
    const editDelete = group.kind === 'custom' ? `
      <button class="pf-g-pill-edit" type="button" data-pf-group-edit="${escapeHtml(group.groupId)}" title="Renombrar o cambiar color" aria-label="Editar grupo ${escapeHtml(group.label)}">✎</button>
      <button class="pf-g-pill-del" type="button" data-pf-group-delete="${escapeHtml(group.groupId)}" title="Eliminar grupo" aria-label="Eliminar grupo ${escapeHtml(group.label)}">×</button>` : '';
    const sublines = groupSublinesHtml(group, expanded);
    const chartId = group.kind === 'custom'
      ? `group:${group.groupId ?? group.id}`
      : `group:pre:${activeTab?.key ?? 'sector'}:${group.label ?? group.id}`;
    return `
      <tr data-pf-group-row="${escapeHtml(key)}" tabindex="0" class="${expanded ? 'pf-row-expanded' : ''}">
        <td class="pf-expand-cell">
          <button class="pf-expand-btn ${expanded ? 'open' : ''}" type="button" data-pf-group-expand="${escapeHtml(key)}"
            aria-expanded="${expanded}" aria-label="Ver sublíneas de ${escapeHtml(group.label)}" title="Ver sublíneas"></button>
        </td>
        <td class="pf-broker-company">
          <span class="pf-g-dot" style="background:${escapeHtml(group.color)}"></span>
           <span class="pf-broker-company-copy">
             <strong>${escapeHtml(group.label)}</strong>
             <small>${actionCount} ${actionCount === 1 ? 'acción' : 'acciones'}</small>
           </span>
           ${chartButtonHtml(chartId)}
           <span class="pf-g-row-actions">${editDelete}</span>
        </td>
        <td>${fmtShares(totals.shares)}</td>
        ${groupsCostCellHtml(totals.cost)}
        ${groupsToggleCellHtml('ganancia', gainPercent, totals.gain, fmtSigned)}
        ${groupsToggleCellHtml('gananciadiv', gainWithDividendsPct, gainWithDividends, fmtSigned)}
        <td>${fmtPct(weight)}</td>
        ${groupsToggleCellHtml('divpct', dividendYield, totals.annual, fmtMoney)}
        ${groupsToggleCellHtml('divyoc', dividendYoc, totals.annual, fmtMoney)}
        ${groupsDividendsCellHtml(totals.dividends, totals.shares)}
        <td class="pf-groups-cell"></td>
      </tr>
      ${sublines}`;
  }

  const GROUPS_SORT_GETTERS = {
    valor: (item) => String(item.group.label || '').toLowerCase(),
    acciones: (item) => item.totals.shares,
    coste: (item) => item.totals.cost,
    ganancia: (item) => {
      const amount = item.totals.gain;
      if (groupsModeIsPct('ganancia')) return item.totals.cost > 0 ? amount / item.totals.cost : null;
      return amount;
    },
    gananciadiv: (item) => {
      const amount = item.totals.gain + item.totals.dividends;
      if (groupsModeIsPct('gananciadiv')) return item.totals.cost > 0 ? amount / item.totals.cost : null;
      return amount;
    },
    peso: (item) => item.totals.value,
    divpct: (item) => {
      if (!groupsModeIsPct('divpct')) return item.totals.annual;
      return item.totals.value > 0 ? item.totals.annual / item.totals.value : null;
    },
    divyoc: (item) => {
      if (!groupsModeIsPct('divyoc')) return item.totals.annual;
      return item.totals.cost > 0 ? item.totals.annual / item.totals.cost : null;
    },
    divcobrados: (item) => {
      const total = item.totals.dividends;
      return (groupsDisplayMode.divcobrados ?? 'total') === 'total' ? total : (item.totals.shares > 0 ? total / item.totals.shares : 0);
    },
  };

  function sortGroupItems(items) {
    const getter = GROUPS_SORT_GETTERS[groupsSortKey];
    if (!getter) return items;
    const factor = groupsSortDir === 'desc' ? -1 : 1;
    return [...items].sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      const aNull = va === null || va === undefined || Number.isNaN(Number(va));
      const bNull = vb === null || vb === undefined || Number.isNaN(Number(vb));
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  }

  function wrapGroupsTable(headers, rows, totalsRow, { wideOpt = false } = {}) {
    const headerHtml = `<th scope="col" class="pf-expand-head" aria-label="Sublíneas"></th>` + headers.map(([key, label, hint], index) => {
      const active = groupsSortKey === key;
      const mark = active ? (groupsSortDir === 'desc' ? '↓' : '↑') : '↕';
      const toggle = TOGGLEABLE_SORT_KEYS.has(key) && key !== 'coste' ? groupsModeToggleHtml(key) : '';
      return `
        <th scope="col" data-sort-key="${key}" class="${index === 0 ? 'pf-broker-first-head' : ''}${active ? ' pf-sort-active' : ''}" title="${escapeHtml(hint)}">
          ${escapeHtml(label)} ${toggle}<span class="pf-sort-mark">${mark}</span>
        </th>`;
    }).join('');
    const wideClass = wideOpt ? ' pf-table-wide' : '';
    return `
      <div class="table-wrap pf-broker-table-wrap">
        <table class="pf-broker-table pf-g-groups-table${wideClass}">
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${rows}${totalsRow}</tbody>
        </table>
      </div>`;
  }

  function groupRowsTableHtml(groups) {
    const summary = data?.summary ?? {};
    const totalValue = Number(summary.totalValue) || 0;
    const items = sortGroupItems(groups.map((group) => ({ group, totals: computeGroupTotals(activeTab, group, groupsView) })));
    const grand = items.reduce((acc, { totals }) => {
      acc.shares += totals.shares;
      acc.cost += totals.cost;
      acc.value += totals.value;
      acc.gain += totals.gain;
      acc.dividends += totals.dividends;
      acc.annual += totals.annual || 0;
      return acc;
    }, { shares: 0, cost: 0, value: 0, gain: 0, dividends: 0, annual: 0 });

    const body = items.map(({ group, totals }) => groupRowHtml(group, totals, totalValue)).join('');

    const grandGainPct = grand.cost > 0 ? (grand.gain / grand.cost) * 100 : null;
    const grandGainWithDiv = grand.gain + grand.dividends;
    const grandGainWithDivPct = grand.cost > 0 ? (grandGainWithDiv / grand.cost) * 100 : null;
    const grandYield = grand.value > 0 ? (grand.annual / grand.value) * 100 : null;
    const grandYoc = grand.cost > 0 ? (grand.annual / grand.cost) * 100 : null;

    const totalsRow = `
      <tr class="pf-broker-totals-row">
        <td></td>
        <td class="pf-broker-company"><strong>Total</strong></td>
        <td>${fmtShares(grand.shares)}</td>
        ${groupsCostCellHtml(grand.cost)}
        ${groupsToggleCellHtml('ganancia', grandGainPct, grand.gain, fmtSigned)}
        ${groupsToggleCellHtml('gananciadiv', grandGainWithDivPct, grandGainWithDiv, fmtSigned)}
        <td>${fmtPct(totalValue > 0 ? (grand.value / totalValue) * 100 : null)}</td>
        ${groupsToggleCellHtml('divpct', grandYield, grand.annual, fmtMoney)}
        ${groupsToggleCellHtml('divyoc', grandYoc, grand.annual, fmtMoney)}
        ${groupsDividendsCellHtml(grand.dividends, grand.shares)}
        <td></td>
      </tr>`;

    const headers = [
      ['valor', 'Grupo', 'Grupo y número de acciones'],
      ['acciones', 'Acciones', 'Número total de acciones del grupo'],
      ['coste', 'Coste', 'Coste total del grupo'],
      ['ganancia', 'Ganancia', 'Ganancia o pérdida (no realizada o realizada según la vista)'],
      ['gananciadiv', 'Gan. + div.', 'Ganancia + dividendos cobrados'],
      ['peso', 'Peso cartera', 'Peso del grupo sobre el valor total de la cartera'],
      ['divpct', 'Div. %', 'Rentabilidad por dividendo sobre el valor actual'],
      ['divyoc', 'Div. YoC', 'Rentabilidad por dividendo sobre el coste'],
      ['divcobrados', 'Div. cobrados', 'Dividendos cobrados (total o por acción)'],
      ['grupos', 'Grupos', 'Grupos a los que pertenece cada acción'],
    ];
    return wrapGroupsTable(headers, body, totalsRow, { wideOpt: true });
  }

  function toggleGroupRow(groupKey, forceExpanded) {
    const key = String(groupKey);
    const isExpanded = expandedGroups.has(key);
    const willExpand = forceExpanded !== undefined ? Boolean(forceExpanded) : !isExpanded;

    if (willExpand) {
      expandedGroups.add(key);
    } else {
      expandedGroups.delete(key);
    }

    const row = sectionRoot?.querySelector(`tr[data-pf-group-row="${CSS.escape(key)}"]`);
    if (!row) return;

    const button = row.querySelector('[data-pf-group-expand]');
    button?.classList.toggle('open', willExpand);
    button?.setAttribute('aria-expanded', String(willExpand));
    row.classList.toggle('pf-row-expanded', willExpand);

    const sublines = sectionRoot?.querySelectorAll(`tr[data-pf-group-subline="${CSS.escape(key)}"]`);
    sublines?.forEach((subline) => {
      subline.hidden = !willExpand;
    });
  }

  function toggleGroupExpanded(key) {
    toggleGroupRow(key);
  }

  function tabCreateFormHtml() {
    return `
      <form class="pf-g-form pf-g-form-inline" data-pf-tab-form novalidate>
        <input class="pf-input pf-g-name" type="text" maxlength="40" placeholder="Nombre de la pestaña" aria-label="Nombre de la pestaña" required>
        <input class="pf-input pf-g-color" type="color" value="#2563eb" title="Color de la pestaña" aria-label="Color de la pestaña">
        <button class="primary-button" type="submit">Crear</button>
        <button class="pf-outline-button" type="button" data-pf-g-cancel>Cancelar</button>
      </form>`;
  }

  function tabEditFormHtml(tab) {
    if (!tab) return '';
    return `
      <form class="pf-g-form pf-g-form-inline" data-pf-tab-edit-form novalidate>
        <input class="pf-input pf-g-name" type="text" maxlength="40" value="${escapeHtml(tab.name)}" aria-label="Nombre de la pestaña" required>
        <input class="pf-input pf-g-color" type="color" value="${escapeHtml(tab.color)}" title="Color de la pestaña" aria-label="Color de la pestaña">
        <button class="primary-button" type="submit">Guardar</button>
        <button class="pf-outline-button" type="button" data-pf-g-cancel>Cancelar</button>
      </form>`;
  }

  function groupMembersCheckboxesHtml(positions) {
    return positions.map((item) => {
      const lots = (item.lots ?? []).filter((lot) => (lot.remaining ?? 0) > 0);
      return `
        <div class="pf-g-member-item" data-member-ticker="${escapeHtml(item.ticker)}">
          <label class="pf-g-action-check">
            <input type="checkbox" data-member-kind="ticker" data-ticker="${escapeHtml(item.ticker)}">
            <span>Toda la acción <strong>${escapeHtml(item.ticker)}</strong> — <small>${escapeHtml(item.companyName || '')}</small></span>
          </label>
          <div class="pf-g-sublines">
            ${lots.map((lot) => `
              <label class="pf-g-subline-check">
                <input type="checkbox" data-member-kind="lot" data-transaction-id="${lot.id}" data-ticker="${escapeHtml(item.ticker)}">
                <span>${fmtDate(lot.date)} · ${fmtShares(lot.remaining)} acc · ${fmtPrice(lot.price)}</span>
              </label>`).join('')}
          </div>
        </div>`;
    }).join('');
  }

  function groupCreateFormHtml(tab) {
    const positions = positionsForView('current');
    return `
      <form class="pf-g-form" data-pf-group-form novalidate>
        <div class="pf-g-form-head">
          <span class="pf-g-form-title">Nuevo grupo en «${escapeHtml(tab.name)}»</span>
        </div>
        <div class="pf-g-form-fields">
          <input class="pf-input pf-g-name" type="text" maxlength="40" placeholder="Nombre del grupo" aria-label="Nombre del grupo" required>
          <input class="pf-input pf-g-color" type="color" value="#2563eb" title="Color del grupo" aria-label="Color del grupo">
        </div>
        <div class="pf-g-members">
          <p class="pf-g-members-title">Acciones y sublíneas a añadir:</p>
          <div class="pf-g-members-list">${groupMembersCheckboxesHtml(positions)}</div>
        </div>
        <div class="pf-g-form-actions">
          <button class="primary-button" type="submit">Crear grupo</button>
          <button class="pf-outline-button" type="button" data-pf-g-cancel>Cancelar</button>
        </div>
      </form>`;
  }

  function groupEditFormHtml(group) {
    return `
      <form class="pf-g-form pf-g-form-inline" data-pf-group-edit-form novalidate>
        <input class="pf-input pf-g-name" type="text" maxlength="40" value="${escapeHtml(group.name)}" aria-label="Nombre del grupo" required>
        <input class="pf-input pf-g-color" type="color" value="${escapeHtml(group.color)}" title="Color del grupo" aria-label="Color del grupo">
        <button class="primary-button" type="submit">Guardar</button>
        <button class="pf-outline-button" type="button" data-pf-g-cancel>Cancelar</button>
      </form>`;
  }

  function wireGroupFeatures(scope) {
    if (!scope) return;
    scope.querySelectorAll('[data-pf-groups-tab-select]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.pfGroupsTabSelect;
        if (value.startsWith('pre:')) activeTab = { type: 'predefined', key: value.slice(4) };
        else if (value.startsWith('tab:')) activeTab = { type: 'custom', id: Number(value.slice(4)) };
        else activeTab = null;
        groupFormOpen = false;
        editingGroupId = null;
        editingTabId = null;
        expandedGroups.clear();
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-groups-view]').forEach((button) => {
      button.addEventListener('click', () => {
        groupsView = button.dataset.pfGroupsView;
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('.pf-g-groups-table th[data-sort-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (groupsSortKey === key) {
          groupsSortDir = groupsSortDir === 'desc' ? 'asc' : 'desc';
        } else {
          groupsSortKey = key;
          groupsSortDir = key === 'valor' ? 'asc' : 'desc';
        }
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('[data-groups-mode-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const key = button.dataset.groupsModeToggle;
        if (TOTAL_MEDIO_TOGGLES[key]) {
          groupsDisplayMode[key] = (groupsDisplayMode[key] ?? TOTAL_MEDIO_DEFAULT[key] ?? 'medio') === 'medio' ? 'total' : 'medio';
        } else {
          groupsDisplayMode[key] = groupsModeIsPct(key) ? 'amt' : 'pct';
        }
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('[data-pf-group-expand]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleGroupRow(button.dataset.pfGroupExpand);
      });
    });
    scope.querySelectorAll('[data-pf-group-row]').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('a, button')) return;
        toggleGroupRow(row.dataset.pfGroupRow);
      });
      row.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('a, button')) {
          event.preventDefault();
          toggleGroupRow(row.dataset.pfGroupRow);
        }
      });
    });
    scope.querySelectorAll('[data-pf-tab-create]').forEach((button) => {
      button.addEventListener('click', () => {
        tabFormOpen = !tabFormOpen;
        editingTabId = null;
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-tab-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        editingTabId = activeTab?.type === 'custom' ? activeTab.id : null;
        tabFormOpen = false;
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-tab-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (activeTab?.type !== 'custom') return;
        const tab = tabById(activeTab.id);
        if (!tab) return;
        if (!window.confirm(`¿Eliminar la pestaña «${tab.name}» y sus grupos?`)) return;
        try {
          await api(`/api/portfolio/tabs/${tab.id}`, { method: 'DELETE' });
          showToast?.('Pestaña eliminada.');
          activeTab = null;
          activeGroup = null;
          expandedGroups.clear();
          editingTabId = null;
          await refresh();
        } catch (error) {
          showToast?.(error.message);
        }
      });
    });
    scope.querySelectorAll('[data-pf-group-create]').forEach((button) => {
      button.addEventListener('click', () => {
        groupFormOpen = !groupFormOpen;
        editingGroupId = null;
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-group-edit]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        editingGroupId = editingGroupId === Number(button.dataset.pfGroupEdit) ? null : Number(button.dataset.pfGroupEdit);
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-group-delete]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const id = Number(button.dataset.pfGroupDelete);
        const group = groupById(id);
        if (!group) return;
        if (!window.confirm(`¿Eliminar el grupo «${group.name}»?`)) return;
        try {
          await api(`/api/portfolio/groups/${id}`, { method: 'DELETE' });
          showToast?.('Grupo eliminado.');
          expandedGroups.delete(String(id));
          editingGroupId = null;
          await refresh();
        } catch (error) {
          showToast?.(error.message);
        }
      });
    });
    scope.querySelectorAll('[data-pf-g-cancel]').forEach((button) => {
      button.addEventListener('click', () => {
        tabFormOpen = false;
        groupFormOpen = false;
        editingGroupId = null;
        editingTabId = null;
        renderSection();
      });
    });
    const tabForm = scope.querySelector('[data-pf-tab-form]');
    tabForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = (tabForm.querySelector('.pf-g-name')?.value ?? '').trim();
      const color = tabForm.querySelector('.pf-g-color')?.value ?? '#2563eb';
      if (!name) return;
      try {
        const payload = await api('/api/portfolio/tabs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color }),
        });
        tabFormOpen = false;
        activeTab = { type: 'custom', id: payload.tab.id };
        activeGroup = null;
        expandedGroups.clear();
        showToast?.('Pestaña creada.');
        await refresh();
      } catch (error) {
        showToast?.(error.message);
      }
    });
    const tabEditForm = scope.querySelector('[data-pf-tab-edit-form]');
    tabEditForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!editingTabId) return;
      const name = (tabEditForm.querySelector('.pf-g-name')?.value ?? '').trim();
      const color = tabEditForm.querySelector('.pf-g-color')?.value ?? '#2563eb';
      if (!name) return;
      try {
        await api(`/api/portfolio/tabs/${editingTabId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color }),
        });
        editingTabId = null;
        showToast?.('Pestaña actualizada.');
        await refresh();
      } catch (error) {
        showToast?.(error.message);
      }
    });
    const groupForm = scope.querySelector('[data-pf-group-form]');
    groupForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const tab = activeTab?.type === 'custom' ? tabById(activeTab.id) : null;
      if (!tab) return;
      const name = (groupForm.querySelector('.pf-g-name')?.value ?? '').trim();
      const color = groupForm.querySelector('.pf-g-color')?.value ?? '#2563eb';
      if (!name) return;
      const tickers = [];
      const lotIds = [];
      groupForm.querySelectorAll('input[data-member-kind="ticker"]:checked').forEach((input) => {
        tickers.push(input.dataset.ticker);
      });
      groupForm.querySelectorAll('input[data-member-kind="lot"]:checked').forEach((input) => {
        if (tickers.includes(input.dataset.ticker)) return;
        lotIds.push(Number(input.dataset.transactionId));
      });
      try {
        await api('/api/portfolio/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tabId: tab.id, name, color, tickers, lotTransactionIds: lotIds }),
        });
        groupFormOpen = false;
        showToast?.('Grupo creado.');
        await refresh();
      } catch (error) {
        showToast?.(error.message);
      }
    });
    const editForm = scope.querySelector('[data-pf-group-edit-form]');
    editForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!editingGroupId) return;
      const name = (editForm.querySelector('.pf-g-name')?.value ?? '').trim();
      const color = editForm.querySelector('.pf-g-color')?.value ?? '#2563eb';
      if (!name) return;
      try {
        await api(`/api/portfolio/groups/${editingGroupId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color }),
        });
        editingGroupId = null;
        showToast?.('Grupo actualizado.');
        await refresh();
      } catch (error) {
        showToast?.(error.message);
      }
    });
    scope.querySelectorAll('.pf-g-action-check input').forEach((input) => {
      input.addEventListener('change', () => {
        const item = input.closest('[data-member-ticker]');
        item?.querySelectorAll('input[data-member-kind="lot"]').forEach((sub) => { sub.checked = input.checked; });
      });
    });
    scope.querySelectorAll('.pf-g-add').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const row = button.closest('tr');
        const ticker = row?.dataset.ticker;
        const buyId = row?.dataset.buyId;
        if (!ticker) return;
        const position = (data?.positions ?? []).find((p) => p.ticker === ticker);
        const lot = buyId ? (position?.lots ?? []).find((l) => String(l.id) === String(buyId)) : null;
        openGroupPopover(button, {
          scope: buyId ? 'lot' : 'ticker',
          ticker,
          buyId: buyId ? Number(buyId) : null,
          date: lot?.date ?? null,
        });
      });
    });
    wirePortfolioLogos(scope);
  }

  /* ── Historial de operaciones ────────────────────────────── */

  function historyWidgetHtml() {
    return window.PortfolioHistory.historyWidgetHtml(data?.transactions ?? []);
  }

  function wireHistoryWidget(scope) {
    window.PortfolioHistory.wireHistoryWidget(scope, {
      getTransactions: () => data?.transactions ?? [],
      refresh,
      showToast: (msg) => (typeof showToast === 'function' ? showToast(msg) : window.showToast?.(msg))
    });
  }

  /* ── Resumen ─────────────────────────────────────────────── */

  function renderSummaryCards() {
    const s = data?.summary ?? {};
    const returnClass = Number(s.totalReturnPct) < 0 ? 'negative' : 'positive';
    return `
      <div class="pf-metric-strip">
        <article class="pf-metric-card">
          <div class="pf-metric-label">
            <span>Valor de la cartera <i title="Valor actual de todas tus posiciones">i</i></span>
            <select class="pf-period-select" aria-label="Periodo de la cartera">
              <option>MAX</option><option>1A</option><option>YTD</option>
            </select>
          </div>
          <div class="pf-metric-value-row">
            <strong>${fmtMoney(s.totalValue)}</strong>
            <span class="pf-metric-trend ${returnClass}">${trendPct(s.totalReturnPct)}</span>
          </div>
          <span class="pf-metric-action" aria-hidden="true">⇄</span>
        </article>
        <article class="pf-metric-card">
          <div class="pf-metric-label"><span>Rentabilidad por dividendo de la cartera <i title="Dividendos anuales previstos divididos por el valor actual">i</i></span></div>
          <div class="pf-metric-value-row"><strong>${fmtPct(s.dividendYield)}</strong></div>
          <span class="pf-metric-action" aria-hidden="true">⇄</span>
        </article>
        <article class="pf-metric-card">
          <div class="pf-metric-label"><span>Dividendos anuales brutos previstos</span><label class="pf-net-toggle"><span>Neto</span><button class="pf-switch" type="button" disabled title="El cálculo neto estará disponible próximamente"><span></span></button></label></div>
          <div class="pf-metric-value-row"><strong>${fmtMoney(s.projectedAnnualDividends)}</strong></div>
        </article>
      </div>`;
  }

  function portfolioTabsHtml() {
    const tabs = [
      ['cartera', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>', 'Cartera'],
      ['dividendos', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>', 'Dividendos'],
      ['operaciones', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10M6 14h6"/></svg>', 'Operaciones'],
    ];
    return `
      <nav class="pf-dashboard-tabs" role="tablist" aria-label="Secciones de la cartera">
        <div class="pf-tab-list">
          ${tabs.map(([key, icon, label]) => `
            <button class="pf-dashboard-tab ${portfolioTab === key ? 'active' : ''}" type="button"
              role="tab" aria-selected="${portfolioTab === key}" data-pf-tab="${key}">
              <span class="pf-tab-icon" aria-hidden="true">${icon}</span>${label}
            </button>`).join('')}
        </div>
        <button class="pf-dashboard-add" type="button" data-pf-add>+ Añadir operación</button>
      </nav>`;
  }

  function positionsPanelHtml() {
    const views = [
      ['current', 'Actual'],
      ['sold', 'Vendido'],
      ['all', 'Todo'],
    ];
    return `
      <div class="pf-broker-panel">
        <div class="pf-card-head">
          <div><h4>Valores</h4><p>Detalle de tus posiciones y de los dividendos previstos.</p></div>
          <div class="pf-positions-head-actions">
            <button class="pf-outline-button pf-show-all-btn" type="button" data-pf-chart-show-all="valores" title="Mostrar todas las acciones principales en el gráfico">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg>
              <span>Mostrar todo</span>
            </button>
            <button class="pf-outline-button pf-toggle-chart-btn" type="button" data-pf-chart-toggle title="${chartOpen ? 'Ocultar gráfico comparativo' : 'Mostrar gráfico comparativo'}">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg>
              <span>${chartOpen ? 'Ocultar gráfico' : 'Mostrar gráfico'}</span>
            </button>
            <div class="pf-positions-views" role="group" aria-label="Vista de posiciones">
              ${views.map(([key, label]) => `
                <button class="pf-positions-view-btn ${positionsView === key ? 'active' : ''}" type="button"
                  data-pf-view="${key}" aria-pressed="${positionsView === key}">
                  ${label}
                </button>`).join('')}
            </div>
          </div>
        </div>
        ${positionsTableHtml(positionsView)}
        ${gruposSectionHtml()}
        <div class="pf-card-footer">
          <button class="pf-footer-link" type="button" data-pf-export>⇩ Exportar CSV</button>
        </div>
      </div>`;
  }



  /* ── Panel de dividendos ─────────────────────────────────── */

  function getDividendData() {
    return window.PortfolioDividendsData.getDividendData(data);
  }

  function dividendPanelHtml() {
    return window.PortfolioDividends.dividendPanelHtml(data);
  }

  function wireDividendDashboard(scope) {
    window.PortfolioDividends.wireDividendDashboard(scope, {
      renderSection,
      onNavigate: (ticker) => sectionOptions.onNavigate?.(ticker),
      getData: () => data
    });
  }

  /* ── Panel de calendario ─────────────────────────────────── */

  function calendarPanelHtml() {
    return window.PortfolioCalendar.calendarPanelHtml(data);
  }

  function wireCalendarDashboard(scope) {
    window.PortfolioCalendar.wireCalendarDashboard(scope, {
      renderCalendarView: () => {
        if (calendarSectionRoot) renderCalendarSection();
        else if (sectionRoot) renderSection();
      },
      onNavigate: (ticker) => (calendarSectionOptions.onNavigate || sectionOptions.onNavigate || window.goToCompany)?.(ticker),
      getData: () => data,
      hasPosition,
      refresh
    });
  }

  function createTooltip() {
    let tooltip = document.querySelector('#pf-chart-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'pf-chart-tooltip';
      tooltip.className = 'pf-chart-tooltip';
      tooltip.hidden = true;
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }

  function operationsPanelHtml() {
    return `
      <div class="pf-panel pf-operations-form-panel">
        <div class="pf-card-head"><div><h4>Nueva operación</h4><p>Registra compras y ventas para recalcular tu cartera con FIFO.</p></div></div>
        <div class="pf-form-block">${transactionFormHtml()}</div>
      </div>
      ${(data?.transactions ?? []).length ? historyWidgetHtml() : ''}`;
  }

  /* ── Gráfico de evolución interactivo ─────────────────────── */

  const chartMod = () => window.PortfolioChart || {};

  function chartChoices() {
    return chartMod().chartChoices ? chartMod().chartChoices(data) : [];
  }

  function chartButtonHtml(id) {
    return chartMod().chartButtonHtml ? chartMod().chartButtonHtml(id, data) : '';
  }

  function chartPanelHtml() {
    return chartMod().chartPanelHtml ? chartMod().chartPanelHtml(data) : '';
  }

  function wirePortfolioChart(scope) {
    if (window.PortfolioChart) {
      window.PortfolioChart.selectedIds = chartSelectedIds;
      window.PortfolioChart.open = chartOpen;
      window.PortfolioChart.metric = chartMetric;
      window.PortfolioChart.range = chartRange;
    }
    return chartMod().wirePortfolioChart?.(scope, {
      getData: () => data,
      api,
      renderSection,
      onClose: () => {
        chartOpen = false;
        if (window.PortfolioChart) window.PortfolioChart.open = false;
        renderSection();
      },
      onSelectedIdsChange: (ids) => {
        chartSelectedIds = ids;
      },
      onRangeChange: (r) => {
        chartRange = r;
      },
      onMetricChange: (m) => {
        chartMetric = m;
      }
    });
  }


  function exportPortfolioCsv() {
    const view = positionsView;
    const positions = positionsForView(view);
    const base = (item) => [item.companyName, item.ticker, item.sector, item.type, item.country, item.region];
    let headers;
    let rows;
    if (view === 'sold') {
      headers = ['Empresa', 'Ticker', 'Sector', 'Tipo', 'País', 'Región', 'Vendidas', 'Coste', 'Ingresos venta', 'Ganancia realizada', 'Ganancia + div.', 'Div. cobrados'];
      rows = positions.map((item) => [
        ...base(item),
        item.sharesSold,
        (Number(item.soldProceeds) || 0) - (Number(item.realizedGross) || 0),
        item.soldProceeds,
        item.realizedGross,
        (Number(item.realizedGross) || 0) + (Number(item.dividendsTotal) || 0),
        item.dividendsTotal,
      ]);
    } else if (view === 'all') {
      headers = ['Empresa', 'Ticker', 'Sector', 'Tipo', 'País', 'Región', 'Estado', 'Acciones', 'Coste', 'No real.', 'No real. + div.', 'Real.', 'Real. + div.', 'Total'];
      rows = positions.map((item) => {
        const held = (item.shares ?? 0) > 0;
        const sold = (item.sharesSold ?? 0) > 0;
        return [
          ...base(item),
          !held && sold ? 'Vendida' : held && sold ? 'Vendida parcial' : 'En cartera',
          (Number(item.shares) || 0) + (Number(item.sharesSold) || 0),
          item.totalInvested,
          held ? item.unrealizedGross : null,
          held ? item.unrealizedWithDividends : null,
          sold ? item.realizedGross : null,
          sold ? (Number(item.realizedGross) || 0) + (Number(item.dividendsTotal) || 0) : null,
          item.totalReturn,
        ];
      });
    } else {
      headers = ['Empresa', 'Ticker', 'Sector', 'Tipo', 'País', 'Región', 'Acciones', 'Coste', 'Mercado', 'Ganancia', 'Mercado %', 'Dividendo %', 'Dividendo YoC', 'Dividendos anuales'];
      rows = positions.map((item) => {
        const value = Number(item.value);
        const cost = Number(item.costBasis);
        const annual = Number(item.projectedAnnualDividends) || 0;
        return [
          ...base(item),
          item.shares,
          item.costBasis,
          item.value,
          item.unrealizedGross,
          data.summary.totalValue > 0 ? (value / data.summary.totalValue) * 100 : null,
          value > 0 ? (annual / value) * 100 : null,
          cost > 0 ? (annual / cost) * 100 : null,
          annual,
        ];
      });
    }
    const csvValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(csvValue).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cartera-cifra.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleLotsRow(row, forceShow) {
    const lotRows = [];
    let lotRow = row?.nextElementSibling;
    while (lotRow && lotRow.classList.contains('pf-lot-row')) {
      lotRows.push(lotRow);
      lotRow = lotRow.nextElementSibling;
    }
    if (!lotRows.length) return;
    const willShow = forceShow !== undefined ? forceShow : lotRows[0].hidden;
    lotRows.forEach((item) => { item.hidden = !willShow; });
    const button = row.querySelector('[data-pf-expand]');
    button?.classList.toggle('open', willShow);
    button?.setAttribute('aria-expanded', String(willShow));
    row.classList.toggle('pf-row-expanded', willShow);
  }

  function getExpandedTickers(scope) {
    const set = new Set();
    scope?.querySelectorAll('.pf-broker-table tbody tr[data-ticker].pf-row-expanded').forEach((row) => {
      set.add(row.dataset.ticker);
    });
    return set;
  }

  function restoreExpandedTickers(scope, tickers) {
    if (!scope || !tickers?.size) return;
    scope.querySelectorAll('.pf-broker-table tbody tr[data-ticker]').forEach((row) => {
      if (tickers.has(row.dataset.ticker)) toggleLotsRow(row, true);
    });
  }

  function rerenderKeepingScroll() {
    const wraps = Array.from(sectionRoot?.querySelectorAll('.pf-broker-table-wrap') ?? []);
    const scrolls = wraps.map((wrap) => wrap.scrollLeft);
    const scrollTop = window.scrollY;
    const expanded = getExpandedTickers(sectionRoot);
    renderSection();
    restoreExpandedTickers(sectionRoot, expanded);
    requestAnimationFrame(() => {
      const wraps2 = Array.from(sectionRoot?.querySelectorAll('.pf-broker-table-wrap') ?? []);
      wraps2.forEach((wrap, index) => {
        if (scrolls[index] > 0) wrap.scrollLeft = scrolls[index];
      });
      if (scrollTop > 0) window.scrollTo(0, scrollTop);
    });
  }

  function portfolioContentHtml() {
    if (portfolioTab === 'cartera') return `${allocationPanelHtml()}${chartOpen ? chartPanelHtml() : ''}${positionsPanelHtml()}`;
    if (portfolioTab === 'dividendos') return dividendPanelHtml();
    if (portfolioTab === 'operaciones') return operationsPanelHtml();
    return `${allocationPanelHtml()}${chartOpen ? chartPanelHtml() : ''}${positionsPanelHtml()}`;
  }

  function wirePortfolioDashboard(scope) {
    scope.querySelectorAll('[data-pf-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        portfolioTab = button.dataset.pfTab;
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-add]').forEach((button) => {
      button.addEventListener('click', () => {
        portfolioTab = 'operaciones';
        formExpanded = true;
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-export]').forEach((button) => {
      button.addEventListener('click', exportPortfolioCsv);
    });
    scope.querySelectorAll('[data-pf-cost-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        allocationBasis = allocationBasis === 'cost' ? 'value' : 'cost';
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-allocation-mode]').forEach((select) => {
      select.addEventListener('change', () => {
        allocationGroup = select.value;
        renderSection();
      });
    });
    scope.querySelectorAll('[data-pf-view]').forEach((button) => {
      button.addEventListener('click', () => {
        positionsView = button.dataset.pfView;
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('.pf-broker-table:not(.pf-g-members-table):not(.pf-g-groups-table) th[data-sort-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (sortKey === key) {
          sortDir = sortDir === 'desc' ? 'asc' : 'desc';
        } else {
          sortKey = key;
          sortDir = key === 'valor' ? 'asc' : 'desc';
        }
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('[data-mode-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const key = button.dataset.modeToggle;
        if (TOTAL_MEDIO_TOGGLES[key]) {
          displayMode[key] = (displayMode[key] ?? TOTAL_MEDIO_DEFAULT[key] ?? 'medio') === 'medio' ? 'total' : 'medio';
        } else {
          displayMode[key] = modeIsPct(key) ? 'amt' : 'pct';
        }
        rerenderKeepingScroll();
      });
    });
    scope.querySelectorAll('[data-pf-expand]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleLotsRow(button.closest('tr'));
      });
    });
    scope.querySelectorAll('.pf-broker-table:not(.pf-g-members-table):not(.pf-g-groups-table) tbody tr[data-ticker]').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('a, button')) return;
        toggleLotsRow(row);
      });
      row.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('a, button')) {
          event.preventDefault();
          toggleLotsRow(row);
        }
      });
    });
    function updateChartLive(targetId) {
      if (targetId) {
        chartSelectedIds = chartSelectedIds.includes(targetId)
          ? chartSelectedIds.filter((id) => id !== targetId)
          : [...chartSelectedIds, targetId].slice(-20);
      }
      if (window.PortfolioChart) {
        window.PortfolioChart.selectedIds = chartSelectedIds;
        window.PortfolioChart.syncChartTriggerButtons?.(scope);
      }
      const chartPanel = sectionRoot?.querySelector('.pf-chart-panel');
      if (chartOpen && chartPanel && portfolioTab === 'cartera') {
        if (window.PortfolioChart) {
          window.PortfolioChart.syncPickerChecked?.(chartPanel);
          window.PortfolioChart.loadPortfolioChart?.(chartPanel);
        }
        return true;
      }
      return false;
    }

    scope.querySelectorAll('[data-pf-chart-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        chartOpen = !chartOpen;
        if (window.PortfolioChart) window.PortfolioChart.open = chartOpen;
        rerenderKeepingScroll();
        if (chartOpen) {
          requestAnimationFrame(() => sectionRoot?.querySelector('.pf-chart-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }
      });
    });
    scope.querySelectorAll('[data-pf-chart-show-all]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const mode = button.dataset.pfChartShowAll;
        const allChoices = chartChoices();
        if (mode === 'valores') {
          chartSelectedIds = allChoices.filter((c) => c.kind === 'ticker').slice(0, 20).map((c) => c.id);
        } else if (mode === 'grupos') {
          const isCustom = activeTab?.type === 'custom';
          const isPredefined = activeTab?.type === 'predefined';
          let tabChoices = null;
          if (isPredefined) {
            tabChoices = allChoices.filter((c) => c.kind === 'group' && c.tabKey === activeTab.key);
          } else if (isCustom) {
            const currentTabObj = tabById(activeTab.id);
            const groupIds = new Set((currentTabObj?.groups ?? []).map((g) => g.id));
            tabChoices = allChoices.filter((c) => c.kind === 'group' && groupIds.has(c.groupId));
          }
          if (!tabChoices || !tabChoices.length) {
            tabChoices = allChoices.filter((c) => c.kind === 'group');
          }
          chartSelectedIds = tabChoices.slice(0, 20).map((c) => c.id);
        }
        if (!updateChartLive()) {
          chartOpen = true;
          portfolioTab = 'cartera';
          rerenderKeepingScroll();
        }
      });
    });
    scope.querySelectorAll('[data-pf-chart-trigger]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = button.dataset.pfChartTrigger;
        if (!id) return;
        updateChartLive(id);
      });
    });
    wirePortfolioLogos(scope);
    wireTransactionForm(scope.querySelector('.pf-form'));
    wireHistoryWidget(scope);
    wireDonutTooltips(scope);
    wireAllocationHover(scope);
    wireGroupFeatures(scope);
    wirePortfolioChart(scope);
    wireDividendDashboard(scope);
    wireCalendarDashboard(scope);
  }

  /* ── Sección principal ───────────────────────────────────── */

  function isAuthPending() {
    return Boolean(window.AuthModule && !window.AuthModule.isReady());
  }

  async function renderSection() {
    if (!sectionRoot) return;
    hideChartTooltip();

    if (!userLogged) {
      if (isAuthPending()) {
        sectionRoot.innerHTML = '<div class="watch-section-empty">Cargando tu cartera…</div>';
        sectionOptions.onEmptyChange?.(false);
        return;
      }
      sectionRoot.innerHTML = '<div class="watch-section-empty">Inicia sesión para gestionar tu cartera.</div>';
      sectionOptions.onEmptyChange?.(false);
      return;
    }

    if (!data) {
      sectionRoot.innerHTML = '<div class="watch-section-empty">Cargando tu cartera…</div>';
      sectionOptions.onEmptyChange?.(false);
      return;
    }

    const hasTransactions = Array.isArray(data.transactions) && data.transactions.length > 0;
    sectionOptions.onEmptyChange?.(hasTransactions);

    if (!hasTransactions && portfolioTab === 'operaciones' && formExpanded) {
      sectionRoot.innerHTML = `
        <div class="pf-dashboard">
          ${operationsPanelHtml()}
        </div>`;
      wirePortfolioDashboard(sectionRoot);
      return;
    }

    if (!hasTransactions) {
      sectionRoot.innerHTML = `
        <div class="pf-dashboard">
          <div class="pf-empty-state">
            <p>Tu cartera está vacía. Añade tus primeras compras para ver el precio medio, los dividendos acumulados y la rentabilidad real.</p>
            <button class="primary-button pf-dashboard-empty-add" type="button" data-pf-add>Añadir operación</button>
          </div>
        </div>`;
      wirePortfolioDashboard(sectionRoot);
      return;
    }

    sectionRoot.innerHTML = `
      <div class="pf-dashboard">
        ${renderSummaryCards()}
        ${portfolioTabsHtml()}
        ${portfolioContentHtml()}
      </div>
    `;

    wirePortfolioDashboard(sectionRoot);
  }

  function mountSection(root, options = {}) {
    sectionRoot = root;
    sectionOptions = options;
    if (!userLogged) {
      const user = window.AuthModule?.getUser?.() || window.currentUser;
      if (user) userLogged = true;
    }
    if (!data && userLogged) {
      refresh();
    } else {
      renderSection();
    }
  }

  function renderCalendarSection() {
    if (!calendarSectionRoot) return;

    if (!userLogged) {
      if (isAuthPending()) {
        calendarSectionRoot.innerHTML = '<div class="watch-section-empty">Cargando tu calendario…</div>';
        return;
      }
      calendarSectionRoot.innerHTML = `
        <div class="pf-dashboard pf-calendar-page">
          <div class="pf-empty-state">
            <div style="font-size:32px;margin-bottom:12px;">📅</div>
            <h3>Calendario de Resultados y Dividendos</h3>
            <p>Inicia sesión para consultar las fechas oficiales de resultados (10-Q / 10-K) y dividendos de tus empresas.</p>
            <button class="primary-button" type="button" data-cal-login-btn>Iniciar sesión</button>
          </div>
        </div>`;
      calendarSectionRoot.querySelector('[data-cal-login-btn]')?.addEventListener('click', () => {
        window.openModal?.('login');
      });
      return;
    }

    if (!data) {
      calendarSectionRoot.innerHTML = '<div class="watch-section-empty">Cargando tu calendario…</div>';
      return;
    }

    calendarSectionRoot.innerHTML = `
      <div class="pf-dashboard pf-calendar-page">
        ${calendarPanelHtml()}
      </div>
    `;

    wireCalendarDashboard(calendarSectionRoot);
  }

  function mountCalendarSection(root, options = {}) {
    calendarSectionRoot = root;
    calendarSectionOptions = options;
    if (!userLogged) {
      const user = window.AuthModule?.getUser?.() || window.currentUser;
      if (user) userLogged = true;
    }
    if (!data && userLogged) {
      refresh();
    } else {
      renderCalendarSection();
    }
  }

  /* ── Panel de empresa ────────────────────────────────────── */

  const companyPanels = new Set();

  function registerCompanyPanel(root) {
    if (!root) return;
    companyPanels.add(root);
    renderCompanyPanel(root);
  }

  async function renderCompanyPanel(root) {
    const ticker = root?.dataset?.ticker;
    if (!ticker) return;

    if (!userLogged) {
      root.innerHTML = '<div class="watch-section-empty">Inicia sesión para gestionar tu cartera.</div>';
      return;
    }

    if (!data) {
      root.innerHTML = '<div class="watch-section-empty">Cargando tu cartera…</div>';
      return;
    }

    const companyName = root.dataset.name ?? ticker;
    const position = getPosition(ticker);
    const hasPositions = (data.positions ?? []).length > 0;

    const byCompany = (data.allocations?.byCompany ?? []).map((item) => ({ label: item.companyName || item.ticker, labelKey: item.ticker, value: item.value, percent: item.percent }));
    const companyColors = new Map(byCompany.map((item, index) => [item.labelKey, COLORS[index % COLORS.length]]));
    const bySector = (data.allocations?.bySector ?? []).map((item) => ({ label: item.sector, labelKey: item.sector, value: item.value, percent: item.percent }));
    const sectorColors = new Map(bySector.map((item, index) => [item.labelKey, COLORS[(index * 3 + 1) % COLORS.length]]));

    const positionHtml = position
      ? `<div class="pf-summary-grid pf-company-grid">
          <div class="pf-summary-card"><span>Acciones</span><strong>${fmtShares(position.shares)}</strong></div>
          <div class="pf-summary-card"><span>Coste medio</span><strong>${fmtPrice(position.avgCost)}</strong></div>
          <div class="pf-summary-card"><span>Precio actual</span><strong>${fmtPrice(position.price)}</strong></div>
          <div class="pf-summary-card"><span>Valor</span><strong>${fmtMoney(position.value)}</strong></div>
          <div class="pf-summary-card"><span>No realizada</span><strong class="${changeClass(position.unrealizedGross)}">${fmtSigned(position.unrealizedGross)}</strong></div>
          <div class="pf-summary-card"><span>Dividendos acumulados (est.)</span><strong>${fmtSigned(position.dividendsTotal)}</strong></div>
          <div class="pf-summary-card"><span>Dividendos anuales previstos</span><strong>${fmtMoney(position.projectedAnnualDividends)}</strong></div>
          <div class="pf-summary-card"><span>Rentabilidad total</span><strong class="${changeClass(position.totalReturn)}">${fmtSigned(position.totalReturn)}</strong></div>
        </div>`
      : '<div class="watch-section-empty">Aún no tienes acciones de esta empresa en tu cartera.</div>';

    root.innerHTML = `
      <div class="pf-panel">
        <div class="pf-panel-head">
          <h4>Tu posición en ${escapeHtml(ticker)}</h4>
          <a class="text-button" href="/cartera">Ver cartera completa <span>↗</span></a>
        </div>
        ${positionHtml}
        <div class="pf-panel-head pf-sub-head"><h5>Nueva operación</h5></div>
        ${transactionFormHtml({ ticker, companyName })}
      </div>
      ${hasPositions ? `
        <div class="pf-panel">
          <div class="pf-panel-head"><h4>Distribución de la cartera</h4></div>
          <div class="pf-donuts">
            ${donutBlock('Por empresa', byCompany, companyColors)}
            ${donutBlock('Por sector', bySector, sectorColors)}
          </div>
        </div>` : ''}
      ${(data.transactions ?? []).length ? historyWidgetHtml() : ''}
    `;
    wireTransactionForm(root.querySelector('.pf-form'));
    wireHistoryWidget(root);
    wireDonutTooltips(root);
  }

  function renderCompanyPanels() {
    companyPanels.forEach((root) => renderCompanyPanel(root));
  }

  window.addEventListener('portfolio:change', () => {
    if (sectionRoot) renderSection();
    if (calendarSectionRoot) renderCalendarSection();
    renderCompanyPanels();
  });

  window.addEventListener('watchlists:change', () => {
    if (calendarSectionRoot) renderCalendarSection();
  });

  window.addEventListener('settings:change', (event) => {
    if (data && event.detail?.preferences) {
      data.userPreferences = event.detail.preferences;
    }
    if (calendarSectionRoot) renderCalendarSection();
  });

  window.addEventListener('auth:change', (event) => {
    setAuthenticated(Boolean(event.detail?.user));
  });

  if (window.AuthModule?.isReady()) {
    setAuthenticated(Boolean(window.AuthModule.getUser()));
  } else if (window.AuthModule?.whenReady) {
    window.AuthModule.whenReady().then((user) => {
      setAuthenticated(Boolean(user));
    });
  } else if (window.currentUser) {
    setAuthenticated(true);
  }

  return {
    refresh,
    reset,
    setAuthenticated,
    getPosition,
    hasPosition,
    openSection,
    mountSection,
    mountCalendarSection,
    registerCompanyPanel,
  };
})();
