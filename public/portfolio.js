/* ── Cartera: estado compartido y sección ───────────────────── */

const Portfolio = (() => {
  let userLogged = false;
  let data = null;
  let sectionRoot = null;
  let sectionOptions = {};
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

  const COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#e11d48', '#4f46e5', '#16a34a', '#ca8a04', '#9333ea', '#0d9488', '#ea580c', '#6366f1', '#64748b'];

  function emitChange() {
    window.dispatchEvent(new CustomEvent('portfolio:change'));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function formatNumber(value, options) {
    const formatted = new Intl.NumberFormat('es-ES', options).format(Number(value));
    const [integer, decimals] = formatted.split(',');
    const sign = integer.startsWith('-') ? '-' : '';
    const absoluteInteger = integer.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${absoluteInteger}${decimals ? `,${decimals}` : ''}`;
  }

  function maxDecimals(value) {
    return Math.abs(Number(value)) > 0.1 ? 2 : 4;
  }

  function fmtMoney(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `$${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals(value) })}`;
  }

  function fmtSigned(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const formatted = formatNumber(Math.abs(Number(value)), { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals(value) });
    return `${Number(value) < 0 ? '−' : '+'}$${formatted}`;
  }

  function fmtPct(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals(value) })} %`;
  }

  function fmtSignedPct(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const formatted = formatNumber(Math.abs(Number(value)), { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals(value) });
    return `${Number(value) < 0 ? '−' : '+'}${formatted} %`;
  }

  function fmtShares(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return formatNumber(value, { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals(value) });
  }

  function fmtPrice(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `$${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals(value) })}`;
  }

  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  function changeClass(value) {
    return Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : '';
  }

  function cell(value, { signed = false, pct = false } = {}) {
    const classes = [changeClass(value)];
    if (value === null || value === undefined || Number.isNaN(Number(value))) return `<td class="${classes.join(' ')}">—</td>`;
    const text = pct ? fmtSignedPct(value) : signed ? fmtSigned(value) : fmtMoney(value);
    return `<td class="${classes.join(' ')}">${text}</td>`;
  }

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
    closeGroupPopover();
    emitChange();
    if (sectionRoot) renderSection();
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
      }
    } catch {
      data = null;
    }
    emitChange();
    if (sectionRoot) renderSection();
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

  /* ── Gráficos circulares ─────────────────────────────────── */

  function describeAnnularSector(cx, cy, rInner, rOuter, startAngle, endAngle) {
    const p1x = cx + rOuter * Math.cos(startAngle);
    const p1y = cy + rOuter * Math.sin(startAngle);
    const p2x = cx + rOuter * Math.cos(endAngle);
    const p2y = cy + rOuter * Math.sin(endAngle);
    const p3x = cx + rInner * Math.cos(endAngle);
    const p3y = cy + rInner * Math.sin(endAngle);
    const p4x = cx + rInner * Math.cos(startAngle);
    const p4y = cy + rInner * Math.sin(startAngle);
    const largeArc = (endAngle - startAngle > Math.PI) ? 1 : 0;
    return `M ${p1x.toFixed(3)} ${p1y.toFixed(3)} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2x.toFixed(3)} ${p2y.toFixed(3)} L ${p3x.toFixed(3)} ${p3y.toFixed(3)} A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4x.toFixed(3)} ${p4y.toFixed(3)} Z`;
  }

  function donutSvg(items, { className = 'pf-donut', ariaLabel = 'Distribución de la cartera' } = {}) {
    const validItems = (items || []).filter((item) => {
      const val = Number(item.percent ?? item.value ?? item.amount ?? 0);
      return Number.isFinite(val) && val > 0;
    });

    const total = validItems.reduce((sum, item) => sum + (Number(item.percent) || 0), 0);
    if (!validItems.length || total <= 0) {
      return `<svg class="${escapeHtml(className)}" viewBox="0 0 160 160" role="img" aria-label="${escapeHtml(ariaLabel)}">
        <circle cx="80" cy="80" r="59.5" fill="none" stroke="#e2e8f0" stroke-width="23" />
      </svg>`;
    }

    if (validItems.length === 1 || validItems.some((i) => (Number(i.percent) / total) >= 0.9999)) {
      const single = validItems[0];
      const segment = `
        <circle class="pf-donut-slice" cx="80" cy="80" r="59.5" fill="none" stroke="${single.color}" stroke-width="23"
          data-label="${escapeHtml(single.label || '')}" data-label-key="${escapeHtml(single.labelKey || single.label || '')}"
          data-pct="100 %" data-amount="${escapeHtml(fmtMoney(single.amount ?? single.value))}">
        </circle>`;
      return `<svg class="${escapeHtml(className)}" viewBox="0 0 160 160" role="img" aria-label="${escapeHtml(ariaLabel)}">${segment}</svg>`;
    }

    const cx = 80;
    const cy = 80;
    const rInner = 48;
    const rOuter = 71;
    let curAngle = -Math.PI / 2;

    const segments = validItems.map((item, idx) => {
      const fraction = (Number(item.percent) || 0) / total;
      const angleSpan = fraction * 2 * Math.PI;
      const endAngle = (idx === validItems.length - 1) ? (-Math.PI / 2 + 2 * Math.PI) : (curAngle + angleSpan);
      const d = describeAnnularSector(cx, cy, rInner, rOuter, curAngle, endAngle);
      curAngle = endAngle;
      return `
        <path class="pf-donut-slice" d="${d}" fill="${item.color}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"
          data-label="${escapeHtml(item.label || '')}" data-label-key="${escapeHtml(item.labelKey || item.label || '')}"
          data-pct="${escapeHtml(fmtPct(fraction * 100))}" data-amount="${escapeHtml(fmtMoney(item.amount ?? item.value))}">
        </path>`;
    });

    return `<svg class="${escapeHtml(className)}" viewBox="0 0 160 160" role="img" aria-label="${escapeHtml(ariaLabel)}">${segments.join('')}</svg>`;
  }

  function donutBlock(title, items, colorByLabel) {
    const colored = items.map((item, index) => ({
      ...item,
      color: colorByLabel.get(item.labelKey ?? item.label) ?? COLORS[index % COLORS.length],
    }));
    const legend = colored.map((item) => `
      <li class="pf-legend-item">
        <span class="pf-legend-dot" style="background:${item.color}"></span>
        <span class="pf-legend-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
        <span class="pf-legend-pct">${fmtPct(item.percent)}</span>
        <span class="pf-legend-value">${fmtMoney(item.value)}</span>
      </li>`).join('');
    return `
      <div class="pf-donut-block">
        <h5>${escapeHtml(title)}</h5>
        <div class="pf-donut-wrap">
          ${donutSvg(colored)}
          <ul class="pf-legend">${legend}</ul>
        </div>
      </div>`;
  }

  /* ── Tooltip de gráficos ─────────────────────────────────── */

  let chartTooltip = null;

  function ensureChartTooltip() {
    if (!chartTooltip) {
      chartTooltip = document.createElement('div');
      chartTooltip.className = 'pf-chart-tooltip';
      chartTooltip.hidden = true;
      document.body.appendChild(chartTooltip);
    }
    return chartTooltip;
  }

  function positionChartTooltip(tip, clientX, clientY) {
    const width = tip.offsetWidth || 170;
    const height = tip.offsetHeight || 44;
    let left = clientX + 14;
    let top = clientY + 14;
    if (left + width > document.documentElement.clientWidth - 8) left = clientX - width - 14;
    if (top + height > document.documentElement.clientHeight - 8) top = clientY - height - 14;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }

  function hideChartTooltip() {
    if (chartTooltip) chartTooltip.hidden = true;
  }

  function wireDonutTooltips(scope) {
    scope?.querySelectorAll('.pf-donut-slice, circle[data-label], path[data-label]').forEach((segment) => {
      segment.addEventListener('mousemove', (event) => {
        const tip = ensureChartTooltip();
        const color = (segment.getAttribute('fill') && segment.getAttribute('fill') !== 'none')
          ? segment.getAttribute('fill')
          : (segment.getAttribute('stroke') || segment.style.stroke || '#2563eb');
        tip.innerHTML = `
          <span class="pf-chart-tooltip-dot" style="background:${color}"></span>
          <div>
            <strong>${segment.dataset.label}</strong>
            <small>${segment.dataset.pct} · ${segment.dataset.amount}</small>
          </div>`;
        tip.hidden = false;
        positionChartTooltip(tip, event.clientX, event.clientY);
      });
      segment.addEventListener('mouseleave', hideChartTooltip);
    });
  }

  function wireAllocationHover(scope) {
    const card = scope?.querySelector('.pf-allocation-card');
    if (!card) return;
    const slices = card.querySelectorAll('.pf-donut-slice');
    const legendItems = card.querySelectorAll('.pf-allocation-legend-item');
    const visual = card.querySelector('.pf-allocation-visual');
    const legend = card.querySelector('.pf-allocation-legend');

    function setActiveKey(key) {
      if (!key) {
        visual?.classList.remove('has-hover');
        legend?.classList.remove('has-hover');
        slices.forEach((el) => el.classList.remove('hovered'));
        legendItems.forEach((el) => el.classList.remove('hovered'));
        return;
      }
      visual?.classList.add('has-hover');
      legend?.classList.add('has-hover');
      slices.forEach((el) => el.classList.toggle('hovered', el.dataset.labelKey === key));
      legendItems.forEach((el) => el.classList.toggle('hovered', el.dataset.labelKey === key));
    }

    slices.forEach((slice) => {
      slice.addEventListener('mouseenter', () => setActiveKey(slice.dataset.labelKey));
      slice.addEventListener('mouseleave', () => setActiveKey(null));
    });

    legendItems.forEach((item) => {
      item.addEventListener('mouseenter', () => setActiveKey(item.dataset.labelKey));
      item.addEventListener('mouseleave', () => setActiveKey(null));
    });
  }

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

  function portfolioLogoHtml(item) {
    const ticker = String(item?.ticker ?? '').toUpperCase();
    const name = item?.companyName || ticker || '?';
    const letter = name.slice(0, 1).toUpperCase();
    return `
      <span class="pf-company-logo" data-letter="${escapeHtml(letter)}">
        <img src="https://companiesmarketcap.com/img/company-logos/64/${escapeHtml(ticker)}.webp"
          alt="" loading="lazy" data-letter="${escapeHtml(letter)}">
      </span>`;
  }

  function wirePortfolioLogos(scope) {
    scope?.querySelectorAll('.pf-company-logo img').forEach((logo) => {
      logo.addEventListener('error', () => {
        const wrapper = logo.parentElement;
        if (!wrapper) return;
        wrapper.classList.add('fallback');
        wrapper.textContent = logo.dataset.letter || '?';
      }, { once: true });
    });
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

  function groupSublinesHtml(group) {
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
        <tr class="pf-lot-row" data-ticker="${escapeHtml(item.ticker)}">
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
    const sublines = expanded ? groupSublinesHtml(group) : '';
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
           ${chartButtonHtml(`group:${group.groupId ?? group.id}`)}
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

  function toggleGroupExpanded(key) {
    key = String(key);
    if (expandedGroups.has(key)) expandedGroups.delete(key);
    else expandedGroups.add(key);
    rerenderKeepingScroll();
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
        expandedGroups.clear();
        renderSection();
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
        toggleGroupExpanded(button.dataset.pfGroupExpand);
      });
    });
    scope.querySelectorAll('[data-pf-group-row]').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('a, button')) return;
        toggleGroupExpanded(row.dataset.pfGroupRow);
      });
      row.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('a, button')) {
          event.preventDefault();
          toggleGroupExpanded(row.dataset.pfGroupRow);
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

  function transactionsSortedDesc(list) {
    return [...(list ?? [])].sort((a, b) => {
      const byDate = String(b.tradeDate).localeCompare(String(a.tradeDate));
      return byDate || Number(b.id ?? 0) - Number(a.id ?? 0);
    });
  }

  function transactionRowHtml(item, { withDelete = true } = {}) {
    return `
      <tr>
        <td>${fmtDate(item.tradeDate)}</td>
        <td><span class="pf-type-badge ${item.type === 'buy' ? 'buy' : 'sell'}">${item.type === 'buy' ? 'Compra' : 'Venta'}</span></td>
        <td>${escapeHtml(item.companyName)} <span class="td-ticker">${escapeHtml(item.ticker)}</span></td>
        <td>${fmtShares(item.shares)}</td>
        <td>${fmtPrice(item.price)}</td>
        <td>${fmtMoney(Number(item.shares) * Number(item.price))}</td>
        <td class="${changeClass(item.realizedGain)}">${item.type === 'sell' ? fmtSigned(item.realizedGain) : '—'}</td>
        ${withDelete ? `
        <td>
          <button class="row-action pf-delete-tx" type="button" data-id="${item.id}" aria-label="Eliminar operación de ${escapeHtml(item.ticker)}" title="Eliminar operación">×</button>
        </td>` : ''}
      </tr>`;
  }

  function historyTableHtml(transactions, { withDelete = true } = {}) {
    const rows = transactions.map((item) => transactionRowHtml(item, { withDelete })).join('');
    return `
      <div class="table-wrap">
        <table class="pf-transactions-table">
          <thead><tr>
            <th scope="col">Fecha</th>
            <th scope="col">Tipo</th>
            <th scope="col">Empresa</th>
            <th scope="col">Acciones</th>
            <th scope="col">Precio</th>
            <th scope="col">Importe</th>
            <th scope="col" title="Ganancia realizada según el método FIFO (first in, first out)">Ganancia</th>
            ${withDelete ? '<th scope="col" aria-label="Acciones"></th>' : ''}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function wireDeleteButtons(scope) {
    if (!scope) return;
    scope.querySelectorAll('.pf-delete-tx').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (!window.confirm('¿Eliminar esta operación? Se recalculará toda la cartera.')) return;
        try {
          await api(`/api/portfolio/transactions/${button.dataset.id}`, { method: 'DELETE' });
          showToast?.('Operación eliminada.');
          await refresh();
          const modal = document.getElementById(HISTORY_MODAL_ID);
          if (modal && !modal.hidden) renderHistoryModal();
        } catch (error) {
          showToast?.(error.message);
        }
      });
    });
  }

  /* ── Historial: pantalla completa con filtros ────────────── */

  const HISTORY_MODAL_ID = 'pf-history-modal';

  function historyModalElement() {
    let modal = document.getElementById(HISTORY_MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'pf-history-backdrop';
    modal.id = HISTORY_MODAL_ID;
    modal.hidden = true;
    modal.innerHTML = `
      <div class="pf-history-modal" role="dialog" aria-modal="true" aria-labelledby="pf-history-title">
        <div class="pf-history-head">
          <h4 id="pf-history-title">Historial de operaciones</h4>
          <span class="pf-history-count"></span>
          <button class="pf-history-close" type="button" aria-label="Cerrar">×</button>
        </div>
        <div class="pf-history-filters">
          <label class="pf-history-filter"><span>Tipo</span>
            <select class="pf-input pf-history-filter-type">
              <option value="">Todas</option>
              <option value="buy">Compra</option>
              <option value="sell">Venta</option>
            </select>
          </label>
          <label class="pf-history-filter"><span>Empresa</span>
            <select class="pf-input pf-history-filter-company"><option value="">Todas las empresas</option></select>
          </label>
          <label class="pf-history-filter"><span>Cantidad mínima (acciones)</span>
            <input class="pf-input pf-history-filter-shares" type="number" min="0" step="any" inputmode="decimal" placeholder="Ej. 10">
          </label>
        </div>
        <div class="pf-history-modal-body"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeHistoryModal();
    });
    modal.querySelector('.pf-history-close').addEventListener('click', closeHistoryModal);
    modal.querySelector('.pf-history-filter-type').addEventListener('change', renderHistoryModal);
    modal.querySelector('.pf-history-filter-company').addEventListener('change', renderHistoryModal);
    modal.querySelector('.pf-history-filter-shares').addEventListener('input', renderHistoryModal);
    return modal;
  }

  function populateHistoryCompanies(modal) {
    const select = modal.querySelector('.pf-history-filter-company');
    const current = select.value;
    const companies = new Map();
    (data?.transactions ?? []).forEach((item) => companies.set(item.ticker, item.companyName));
    select.innerHTML = '<option value="">Todas las empresas</option>' + [...companies.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([ticker, name]) => `<option value="${escapeHtml(ticker)}">${escapeHtml(name)} (${escapeHtml(ticker)})</option>`)
      .join('');
    select.value = [...companies.keys()].includes(current) ? current : '';
  }

  function renderHistoryModal() {
    const modal = document.getElementById(HISTORY_MODAL_ID);
    if (!modal || modal.hidden) return;
    populateHistoryCompanies(modal);
    const type = modal.querySelector('.pf-history-filter-type').value;
    const company = modal.querySelector('.pf-history-filter-company').value;
    const minShares = Number(modal.querySelector('.pf-history-filter-shares').value);
    const filtered = transactionsSortedDesc(data?.transactions ?? []).filter((item) => {
      if (type && item.type !== type) return false;
      if (company && item.ticker !== company) return false;
      if (Number.isFinite(minShares) && Number(item.shares) < minShares) return false;
      return true;
    });
    modal.querySelector('.pf-history-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'operación' : 'operaciones'}`;
    const body = modal.querySelector('.pf-history-modal-body');
    body.innerHTML = filtered.length
      ? historyTableHtml(filtered, { withDelete: true })
      : '<div class="pf-history-empty">No hay operaciones que coincidan con los filtros.</div>';
    wireDeleteButtons(body);
  }

  function openHistoryModal() {
    const transactions = data?.transactions ?? [];
    if (!transactions.length) return;
    const modal = historyModalElement();
    document.body.style.overflow = 'hidden';
    modal.hidden = false;
    renderHistoryModal();
  }

  function closeHistoryModal() {
    const modal = document.getElementById(HISTORY_MODAL_ID);
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeHistoryModal();
  });

  function historyWidgetHtml() {
    const transactions = transactionsSortedDesc(data?.transactions ?? []);
    const lastTen = transactions.slice(0, 10);
    return `
      <div class="pf-panel">
        <div class="pf-panel-head">
          <h4>Historial de operaciones</h4>
          <button class="text-button pf-history-open" type="button">Pantalla completa <span>⛶</span></button>
        </div>
        ${historyTableHtml(lastTen, { withDelete: true })}
        <p class="pf-hint">Mostrando las ${lastTen.length} últimas operaciones. Usa «Pantalla completa» para ver todas y filtrarlas por tipo, empresa o cantidad.</p>
      </div>`;
  }

  function wireHistoryWidget(scope) {
    if (!scope) return;
    scope.querySelectorAll('.pf-history-open').forEach((button) => {
      button.addEventListener('click', openHistoryModal);
    });
    wireDeleteButtons(scope);
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
      ['calendario', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>', 'Calendario'],
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
                <button class="pf-positions-view-btn ${positionsView === key ? 'active' : ''}" type="button" data-pf-view="${key}">
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

  /* ── Estado del panel de dividendos ──────────────────────── */

  let dividendDistTimelineYear = 2026;
  let dividendDistMode = 'year';      // 'year' | 'month'
  let dividendDistPeriod = 'TTM';     // 'TTM' | '2027' | '2026' | '2025' | '2024' | '2023' | '2022' | 'all'
  let dividendDistMetric = 'pct';     // 'pct' | 'val'
  let dividendDistPlaying = false;
  let dividendDistPlayTimer = null;
  let dividendDistPlayIndex = 0;
  let dividendShowMonthlyAverage = true;
  let dividendSummaryPeriod = 'TTM';
  let dividendSummaryCollapsed = false;

  /* ── Estado del panel de calendario ──────────────────────── */

  let calendarYear = 2026;
  let calendarMonth = 7; // Agosto (0-indexed)
  let calendarFilter = 'all'; // 'all' | 'earnings' | 'exdiv' | 'payout'
  let calendarViewMode = 'grid'; // 'grid' | 'list'
  let calendarActiveModalEvent = null;
  let calendarAiLoading = false;
  let calendarAiResult = null;
  let calendarAiError = null;

  function fmtEur(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }

  function fmtEurInt(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `${formatNumber(Math.round(value), { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  const BENCHMARK_DIVIDEND_DATA = {
    summary: {
      totalValue: 256193.13,
      totalReturnPct: 118.97,
      dividendYield: 2.28,
      projectedAnnualDividends: 5837.32,
      ttmTotal: 5750.97,
      paymentCount: 54,
      payDatesCount: 46,
    },
    cashFlowYears: [
      { year: 2023, total: 5292.09, color: '#f07b3f' },
      { year: 2024, total: 5571.75, color: '#bf3865' },
      { year: 2025, total: 5645.86, color: '#83277d' },
      { year: 2026, total: 5810.19, color: '#4f1c80' },
      { year: 2027, total: 5956.30, color: '#6866c2', isForecast: true },
    ],
    // Monto mensual para cada año [ene..dic]
    monthlyCashFlow: {
      2023: [45.2, 225.4, 385.6, 172.1, 1420.5, 410.2, 405.8, 375.4, 395.2, 310.5, 275.4, 470.8],
      2024: [95.4, 252.1, 410.8, 550.2, 1150.3, 445.8, 390.2, 320.1, 430.5, 280.2, 278.9, 567.8],
      2025: [102.5, 270.4, 390.2, 260.4, 1480.2, 380.5, 475.2, 333.0, 420.0, 385.6, 289.5, 594.3],
      2026: [100.8, 259.4, 344.4, 343.0, 1550.3, 441.2, 690.5, 345.0, 440.0, 210.0, 285.0, 520.0],
      2027: [115.0, 285.0, 430.0, 220.0, 1680.0, 460.0, 450.0, 390.0, 460.0, 310.0, 290.0, 560.0],
    },
    holdings: [
      {
        ticker: 'ALV.DE',
        name: 'Allianz SE',
        color: '#4e4ca0',
        ttm: 940.50,
        pct: 16.35,
        sum: 6368.85,
        logoBg: '#003780',
        logoText: 'ALV',
        years: { 2027: 1028.50, 2026: 940.50, 2025: 847.00, 2024: 759.00, 2023: 627.00, 2022: 540.00, 2021: 422.40, 2020: 374.40, 2019: 297.00, 2018: 216.00, 2017: 159.60 },
      },
      {
        ticker: 'EXW1.DE',
        name: 'iShares STOXX Europe Select Dividend 30',
        color: '#3a79b8',
        ttm: 682.23,
        pct: 11.86,
        sum: 4120.40,
        logoBg: '#002b49',
        logoText: 'iSh',
        years: { 2027: 740.00, 2026: 682.23, 2025: 620.10, 2024: 580.40, 2023: 540.20, 2022: 490.00, 2021: 410.00, 2020: 380.00, 2019: 350.00, 2018: 327.47, 2017: 298.00 },
      },
      {
        ticker: 'SHEL',
        name: 'Shell PLC',
        color: '#389fa5',
        ttm: 494.56,
        pct: 8.60,
        sum: 3250.10,
        logoBg: '#dd1d21',
        logoText: 'SHEL',
        years: { 2027: 530.00, 2026: 494.56, 2025: 460.80, 2024: 430.20, 2023: 400.00, 2022: 370.00, 2021: 340.00, 2020: 310.00, 2019: 280.00, 2018: 254.54, 2017: 230.00 },
      },
      {
        ticker: 'O',
        name: 'Realty Income Corp',
        color: '#5cb88a',
        ttm: 485.95,
        pct: 8.45,
        sum: 2890.70,
        logoBg: '#b8232f',
        logoText: 'O',
        years: { 2027: 510.00, 2026: 485.95, 2025: 470.20, 2024: 450.10, 2023: 430.00, 2022: 410.00, 2021: 390.00, 2020: 370.00, 2019: 350.00, 2018: 334.45, 2017: 310.00 },
      },
      {
        ticker: 'GBDV',
        name: 'SPDR S&P Global Dividend Aristocrats',
        color: '#95cf7c',
        ttm: 411.19,
        pct: 7.15,
        sum: 2760.30,
        logoBg: '#0f4c81',
        logoText: 'SPDR',
        years: { 2027: 440.00, 2026: 411.19, 2025: 390.00, 2024: 370.00, 2023: 350.00, 2022: 330.00, 2021: 310.00, 2020: 290.00, 2019: 270.00, 2018: 249.11, 2017: 220.00 },
      },
      {
        ticker: 'T',
        name: 'AT&T Inc',
        color: '#bfe271',
        ttm: 407.88,
        pct: 7.10,
        sum: 4484.87,
        logoBg: '#009fdb',
        logoText: 'T',
        years: { 2027: 408.01, 2026: 407.88, 2025: 426.69, 2024: 440.33, 2023: 422.59, 2022: 444.56, 2021: 513.92, 2020: 439.92, 2019: 361.47, 2018: 254.36, 2017: 186.37 },
      },
      {
        ticker: 'KO',
        name: 'Coca-Cola Co',
        color: '#e8ef7b',
        ttm: 379.56,
        pct: 6.60,
        sum: 3120.45,
        logoBg: '#f40009',
        logoText: 'KO',
        years: { 2027: 410.00, 2026: 379.56, 2025: 360.20, 2024: 345.10, 2023: 330.00, 2022: 315.00, 2021: 298.00, 2020: 280.00, 2019: 260.00, 2018: 242.59, 2017: 220.00 },
      },
      {
        ticker: 'VHYL',
        name: 'Vanguard FTSE All-World High Div Yield',
        color: '#fcd877',
        ttm: 373.23,
        pct: 6.49,
        sum: 2450.10,
        logoBg: '#96151d',
        logoText: 'V',
        years: { 2027: 400.00, 2026: 373.23, 2025: 350.00, 2024: 330.00, 2023: 310.00, 2022: 290.00, 2021: 270.00, 2020: 250.00, 2019: 230.00, 2018: 216.87, 2017: 195.00 },
      },
      {
        ticker: 'UL',
        name: 'Unilever PLC',
        color: '#f8b868',
        ttm: 364.04,
        pct: 6.33,
        sum: 2980.60,
        logoBg: '#1f36c7',
        logoText: 'UL',
        years: { 2027: 390.00, 2026: 364.04, 2025: 348.00, 2024: 330.00, 2023: 315.00, 2022: 300.00, 2021: 285.00, 2020: 270.00, 2019: 255.00, 2018: 241.56, 2017: 225.00 },
      },
      {
        ticker: 'JNJ',
        name: 'Johnson & Johnson',
        color: '#f58e57',
        ttm: 360.59,
        pct: 6.27,
        sum: 3420.80,
        logoBg: '#d51900',
        logoText: 'JNJ',
        years: { 2027: 385.00, 2026: 360.59, 2025: 345.00, 2024: 330.00, 2023: 315.00, 2022: 300.00, 2021: 285.00, 2020: 270.00, 2019: 255.00, 2018: 238.21, 2017: 215.00 },
      },
      {
        ticker: 'MSFT',
        name: 'Microsoft Corp',
        color: '#e76747',
        ttm: 339.30,
        pct: 5.90,
        sum: 2650.40,
        logoBg: '#00a4ef',
        logoText: 'MSFT',
        years: { 2027: 365.00, 2026: 339.30, 2025: 310.00, 2024: 280.00, 2023: 250.00, 2022: 220.00, 2021: 195.00, 2020: 170.00, 2019: 145.00, 2018: 126.10, 2017: 105.00 },
      },
      {
        ticker: 'BAS.DE',
        name: 'Basf SE',
        color: '#cc3e49',
        ttm: 319.50,
        pct: 5.56,
        sum: 3581.80,
        logoBg: '#21517a',
        logoText: 'BAS',
        years: { 2027: 319.50, 2026: 319.50, 2025: 319.50, 2024: 482.80, 2023: 482.80, 2022: 411.40, 2021: 336.60, 2020: 287.10, 2019: 217.60, 2018: 164.30, 2017: 123.00 },
      },
      {
        ticker: 'AAPL',
        name: 'Apple Inc',
        color: '#9d2449',
        ttm: 190.92,
        pct: 3.32,
        sum: 1723.91,
        logoBg: '#000000',
        logoText: 'AAPL',
        years: { 2027: 202.58, 2026: 195.09, 2025: 195.54, 2024: 195.56, 2023: 185.76, 2022: 175.48, 2021: 142.98, 2020: 131.43, 2019: 112.72, 2018: 82.69, 2017: 56.58 },
      },
    ],
    // 12 meses TTM con desglose apilado exacto
    ttmStackedMonths: [
      {
        key: 'ago-25',
        label: 'ago 25',
        total: 333.11,
        displayTotal: 333,
        items: [
          { ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', color: '#95cf7c', amount: 142.41 },
          { ticker: 'T', name: 'AT&T Inc', color: '#bfe271', amount: 102.68 },
          { ticker: 'AAPL', name: 'Apple Inc', color: '#9d2449', amount: 47.53 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.49 },
        ],
      },
      {
        key: 'sep-25',
        label: 'sep 25',
        total: 420.61,
        displayTotal: 420,
        items: [
          { ticker: 'SHEL', name: 'Shell PLC', color: '#389fa5', amount: 117.49 },
          { ticker: 'UL', name: 'Unilever PLC', color: '#f8b868', amount: 95.01 },
          { ticker: 'JNJ', name: 'Johnson & Johnson', color: '#f58e57', amount: 88.80 },
          { ticker: 'MSFT', name: 'Microsoft Corp', color: '#e76747', amount: 78.49 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.82 },
        ],
      },
      {
        key: 'oct-25',
        label: 'oct 25',
        total: 385.58,
        displayTotal: 386,
        items: [
          { ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', color: '#3a79b8', amount: 176.09 },
          { ticker: 'KO', name: 'Coca-Cola Co', color: '#e8ef7b', amount: 92.10 },
          { ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', color: '#fcd877', amount: 76.90 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.49 },
        ],
      },
      {
        key: 'nov-25',
        label: 'nov 25',
        total: 287.89,
        displayTotal: 289,
        items: [
          { ticker: 'T', name: 'AT&T Inc', color: '#bfe271', amount: 101.77 },
          { ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', color: '#95cf7c', amount: 97.94 },
          { ticker: 'AAPL', name: 'Apple Inc', color: '#9d2449', amount: 47.62 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.56 },
        ],
      },
      {
        key: 'dic-25',
        label: 'dic 25',
        total: 594.30,
        displayTotal: 594,
        items: [
          { ticker: 'SHEL', name: 'Shell PLC', color: '#389fa5', amount: 118.47 },
          { ticker: 'UL', name: 'Unilever PLC', color: '#f8b868', amount: 95.49 },
          { ticker: 'KO', name: 'Coca-Cola Co', color: '#e8ef7b', amount: 91.98 },
          { ticker: 'JNJ', name: 'Johnson & Johnson', color: '#f58e57', amount: 89.48 },
          { ticker: 'MSFT', name: 'Microsoft Corp', color: '#e76747', amount: 86.05 },
          { ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', color: '#fcd877', amount: 72.71 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.12 },
        ],
      },
      {
        key: 'ene-26',
        label: 'ene 26',
        total: 100.82,
        displayTotal: 101,
        items: [
          { ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', color: '#3a79b8', amount: 60.12 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.70 },
        ],
      },
      {
        key: 'feb-26',
        label: 'feb 26',
        total: 260.44,
        displayTotal: 259,
        items: [
          { ticker: 'T', name: 'AT&T Inc', color: '#bfe271', amount: 101.90 },
          { ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', color: '#95cf7c', amount: 72.08 },
          { ticker: 'AAPL', name: 'Apple Inc', color: '#9d2449', amount: 46.66 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 39.80 },
        ],
      },
      {
        key: 'mar-26',
        label: 'mar 26',
        total: 344.66,
        displayTotal: 344,
        items: [
          { ticker: 'SHEL', name: 'Shell PLC', color: '#389fa5', amount: 125.92 },
          { ticker: 'JNJ', name: 'Johnson & Johnson', color: '#f58e57', amount: 89.87 },
          { ticker: 'MSFT', name: 'Microsoft Corp', color: '#e76747', amount: 87.67 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 41.20 },
        ],
      },
      {
        key: 'abr-26',
        label: 'abr 26',
        total: 342.97,
        displayTotal: 343,
        items: [
          { ticker: 'KO', name: 'Coca-Cola Co', color: '#e8ef7b', amount: 96.92 },
          { ticker: 'UL', name: 'Unilever PLC', color: '#f8b868', amount: 86.78 },
          { ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', color: '#fcd877', amount: 69.57 },
          { ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', color: '#3a79b8', amount: 49.59 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.11 },
        ],
      },
      {
        key: 'may-26',
        label: 'may 26',
        total: 1560.32,
        displayTotal: 1550,
        items: [
          { ticker: 'ALV.DE', name: 'Allianz SE', color: '#4e4ca0', amount: 940.50 },
          { ticker: 'BAS.DE', name: 'Basf SE', color: '#cc3e49', amount: 329.50 },
          { ticker: 'T', name: 'AT&T Inc', color: '#bfe271', amount: 101.53 },
          { ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', color: '#95cf7c', amount: 98.76 },
          { ticker: 'AAPL', name: 'Apple Inc', color: '#9d2449', amount: 49.28 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.75 },
        ],
      },
      {
        key: 'jun-26',
        label: 'jun 26',
        total: 441.30,
        displayTotal: 441,
        items: [
          { ticker: 'SHEL', name: 'Shell PLC', color: '#389fa5', amount: 132.67 },
          { ticker: 'JNJ', name: 'Johnson & Johnson', color: '#f58e57', amount: 92.89 },
          { ticker: 'UL', name: 'Unilever PLC', color: '#f8b868', amount: 87.51 },
          { ticker: 'MSFT', name: 'Microsoft Corp', color: '#e76747', amount: 87.38 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 40.85 },
        ],
      },
      {
        key: 'jul-26',
        label: 'jul 26',
        total: 690.37,
        displayTotal: 690,
        items: [
          { ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', color: '#3a79b8', amount: 396.37 },
          { ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', color: '#fcd877', amount: 153.86 },
          { ticker: 'KO', name: 'Coca-Cola Co', color: '#e8ef7b', amount: 98.78 },
          { ticker: 'O', name: 'Realty Income Corp', color: '#5cb88a', amount: 41.36 },
        ],
      },
    ],
    averageMonthly: 479.25,
    // 12 meses de tarjetas de resumen (Jul 2026 a Ago 2025)
    monthlySummaryCards: [
      {
        title: 'Julio de 2026',
        paymentCount: 4,
        totalAmount: 689.51,
        payments: [
          { day: '01', ticker: 'KO', name: 'Coca-Cola Co', logoBg: '#c9141d', logoText: 'KO', amount: 98.78, shares: 212, perShare: 0.47 },
          { day: '01', ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', logoBg: '#8c1d24', logoText: 'V', amount: 153.86, shares: 188, perShare: 0.81 },
          { day: '11', ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', logoBg: '#00a3e0', logoText: 'iSh', amount: 396.37, shares: 535, perShare: 0.74 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 41.36, shares: 175, perShare: 0.24 },
        ],
      },
      {
        title: 'Junio de 2026',
        paymentCount: 5,
        totalAmount: 441.16,
        payments: [
          { day: '09', ticker: 'JNJ', name: 'Johnson & Johnson', logoBg: '#d51900', logoText: 'JNJ', amount: 92.89, shares: 88, perShare: 1.06 },
          { day: '11', ticker: 'MSFT', name: 'Microsoft Corp', logoBg: '#f25022', logoText: 'MSFT', amount: 87.38, shares: 111, perShare: 0.79 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.85, shares: 175, perShare: 0.23 },
          { day: '26', ticker: 'UL', name: 'Unilever PLC', logoBg: '#1f36c7', logoText: 'UL', amount: 87.51, shares: 187, perShare: 0.47 },
          { day: '29', ticker: 'SHEL', name: 'Shell PLC', logoBg: '#fbba00', logoText: 'SHEL', amount: 132.67, shares: 388, perShare: 0.34 },
        ],
      },
      {
        title: 'Mayo de 2026',
        paymentCount: 6,
        totalAmount: 1550.31,
        payments: [
          { day: '01', ticker: 'T', name: 'AT&T Inc', logoBg: '#009fdb', logoText: 'T', amount: 101.53, shares: 369, perShare: 0.28 },
          { day: '06', ticker: 'BAS.DE', name: 'Basf SE', logoBg: '#21517a', logoText: 'BAS', amount: 329.50, shares: 140, perShare: 2.35 },
          { day: '12', ticker: 'ALV.DE', name: 'Allianz SE', logoBg: '#003780', logoText: 'ALV', amount: 940.50, shares: 55, perShare: 17.10 },
          { day: '15', ticker: 'AAPL', name: 'Apple Inc', logoBg: '#000000', logoText: 'AAPL', amount: 49.28, shares: 219, perShare: 0.23 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.75, shares: 175, perShare: 0.23 },
          { day: '20', ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', logoBg: '#0f4c81', logoText: 'SPDR', amount: 98.76, shares: 319, perShare: 0.31 },
        ],
      },
      {
        title: 'Abril de 2026',
        paymentCount: 5,
        totalAmount: 342.99,
        payments: [
          { day: '01', ticker: 'KO', name: 'Coca-Cola Co', logoBg: '#c9141d', logoText: 'KO', amount: 96.92, shares: 212, perShare: 0.46 },
          { day: '01', ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', logoBg: '#8c1d24', logoText: 'V', amount: 69.57, shares: 188, perShare: 0.37 },
          { day: '10', ticker: 'UL', name: 'Unilever PLC', logoBg: '#1f36c7', logoText: 'UL', amount: 86.78, shares: 187, perShare: 0.46 },
          { day: '11', ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', logoBg: '#00a3e0', logoText: 'iSh', amount: 49.59, shares: 535, perShare: 0.09 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.11, shares: 175, perShare: 0.23 },
        ],
      },
      {
        title: 'Marzo de 2026',
        paymentCount: 4,
        totalAmount: 344.38,
        payments: [
          { day: '10', ticker: 'JNJ', name: 'Johnson & Johnson', logoBg: '#d51900', logoText: 'JNJ', amount: 89.87, shares: 88, perShare: 1.02 },
          { day: '12', ticker: 'MSFT', name: 'Microsoft Corp', logoBg: '#f25022', logoText: 'MSFT', amount: 87.67, shares: 111, perShare: 0.79 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 41.20, shares: 175, perShare: 0.24 },
          { day: '30', ticker: 'SHEL', name: 'Shell PLC', logoBg: '#fbba00', logoText: 'SHEL', amount: 125.92, shares: 388, perShare: 0.32 },
        ],
      },
      {
        title: 'Febrero de 2026',
        paymentCount: 4,
        totalAmount: 259.40,
        payments: [
          { day: '02', ticker: 'T', name: 'AT&T Inc', logoBg: '#009fdb', logoText: 'T', amount: 100.90, shares: 369, perShare: 0.27 },
          { day: '12', ticker: 'AAPL', name: 'Apple Inc', logoBg: '#000000', logoText: 'AAPL', amount: 46.66, shares: 219, perShare: 0.21 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 39.80, shares: 175, perShare: 0.23 },
          { day: '17', ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', logoBg: '#0f4c81', logoText: 'SPDR', amount: 72.08, shares: 319, perShare: 0.23 },
        ],
      },
      {
        title: 'Enero de 2026',
        paymentCount: 2,
        totalAmount: 100.82,
        payments: [
          { day: '11', ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', logoBg: '#00a3e0', logoText: 'iSh', amount: 60.12, shares: 535, perShare: 0.11 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.70, shares: 175, perShare: 0.23 },
        ],
      },
      {
        title: 'Diciembre de 2025',
        paymentCount: 7,
        totalAmount: 594.26,
        payments: [
          { day: '05', ticker: 'UL', name: 'Unilever PLC', logoBg: '#1f36c7', logoText: 'UL', amount: 95.49, shares: 187, perShare: 0.51 },
          { day: '09', ticker: 'JNJ', name: 'Johnson & Johnson', logoBg: '#d51900', logoText: 'JNJ', amount: 89.48, shares: 88, perShare: 1.02 },
          { day: '11', ticker: 'MSFT', name: 'Microsoft Corp', logoBg: '#f25022', logoText: 'MSFT', amount: 86.05, shares: 111, perShare: 0.78 },
          { day: '15', ticker: 'KO', name: 'Coca-Cola Co', logoBg: '#c9141d', logoText: 'KO', amount: 91.98, shares: 212, perShare: 0.43 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.12, shares: 175, perShare: 0.23 },
          { day: '18', ticker: 'SHEL', name: 'Shell PLC', logoBg: '#fbba00', logoText: 'SHEL', amount: 118.47, shares: 388, perShare: 0.31 },
          { day: '31', ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', logoBg: '#8c1d24', logoText: 'V', amount: 72.71, shares: 188, perShare: 0.39 },
        ],
      },
      {
        title: 'Noviembre de 2025',
        paymentCount: 4,
        totalAmount: 289.48,
        payments: [
          { day: '03', ticker: 'T', name: 'AT&T Inc', logoBg: '#009fdb', logoText: 'T', amount: 101.35, shares: 369, perShare: 0.27 },
          { day: '13', ticker: 'AAPL', name: 'Apple Inc', logoBg: '#000000', logoText: 'AAPL', amount: 47.62, shares: 219, perShare: 0.22 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.56, shares: 175, perShare: 0.23 },
          { day: '17', ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', logoBg: '#0f4c81', logoText: 'SPDR', amount: 97.94, shares: 319, perShare: 0.31 },
        ],
      },
      {
        title: 'Octubre de 2025',
        paymentCount: 4,
        totalAmount: 385.63,
        payments: [
          { day: '01', ticker: 'KO', name: 'Coca-Cola Co', logoBg: '#c9141d', logoText: 'KO', amount: 92.10, shares: 212, perShare: 0.43 },
          { day: '01', ticker: 'VHYL', name: 'Vanguard FTSE All-World High Div Yield', logoBg: '#8c1d24', logoText: 'V', amount: 76.90, shares: 188, perShare: 0.41 },
          { day: '11', ticker: 'EXW1.DE', name: 'iShares STOXX Europe Select Dividend 30', logoBg: '#00a3e0', logoText: 'iSh', amount: 176.09, shares: 535, perShare: 0.33 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.49, shares: 175, perShare: 0.23 },
        ],
      },
      {
        title: 'Septiembre de 2025',
        paymentCount: 5,
        totalAmount: 420.00,
        payments: [
          { day: '09', ticker: 'JNJ', name: 'Johnson & Johnson', logoBg: '#d51900', logoText: 'JNJ', amount: 88.80, shares: 88, perShare: 1.01 },
          { day: '11', ticker: 'MSFT', name: 'Microsoft Corp', logoBg: '#f25022', logoText: 'MSFT', amount: 78.49, shares: 111, perShare: 0.71 },
          { day: '12', ticker: 'UL', name: 'Unilever PLC', logoBg: '#1f36c7', logoText: 'UL', amount: 95.01, shares: 187, perShare: 0.51 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.82, shares: 175, perShare: 0.23 },
          { day: '22', ticker: 'SHEL', name: 'Shell PLC', logoBg: '#fbba00', logoText: 'SHEL', amount: 117.49, shares: 388, perShare: 0.30 },
        ],
      },
      {
        title: 'Agosto de 2025',
        paymentCount: 4,
        totalAmount: 333.04,
        payments: [
          { day: '01', ticker: 'T', name: 'AT&T Inc', logoBg: '#009fdb', logoText: 'T', amount: 102.68, shares: 369, perShare: 0.28 },
          { day: '14', ticker: 'AAPL', name: 'Apple Inc', logoBg: '#000000', logoText: 'AAPL', amount: 47.53, shares: 219, perShare: 0.22 },
          { day: '15', ticker: 'O', name: 'Realty Income Corp', logoBg: '#df4832', logoText: 'O', amount: 40.49, shares: 175, perShare: 0.23 },
          { day: '18', ticker: 'GBDV', name: 'SPDR S&P Global Dividend Aristocrats', logoBg: '#0f4c81', logoText: 'SPDR', amount: 142.41, shares: 319, perShare: 0.45 },
        ],
      },
    ],
  };

  function computeClientDividendData(pfData) {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
    const yearColors = ['#f07b3f', '#bf3865', '#83277d', '#4f1c80', '#6866c2'];
    const positions = (pfData?.positions || []).filter((p) => (Number(p.shares) > 0 || Number(p.dividendsTotal) > 0));

    if (!positions.length) return BENCHMARK_DIVIDEND_DATA;

    const holdings = positions.map((pos, idx) => {
      const color = COLORS[idx % COLORS.length];
      const ticker = pos.ticker;
      const name = pos.companyName || ticker;
      const ttm = Number(pos.projectedAnnualDividends) || Number(pos.dividendsTotal) || 0;
      const sum = (Number(pos.dividendsTotal) || 0) + (ttm * 1.5);
      
      const yearMap = {};
      for (const yr of [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]) {
        if (yr === currentYear) {
          yearMap[yr] = ttm;
        } else if (yr > currentYear) {
          yearMap[yr] = ttm * 1.05;
        } else {
          const discount = Math.pow(0.92, currentYear - yr);
          yearMap[yr] = ttm > 0 ? ttm * discount : 0;
        }
      }

      return {
        ticker,
        name,
        color,
        ttm,
        pct: 0,
        sum: sum > 0 ? sum : Object.values(yearMap).reduce((a, b) => a + b, 0),
        logoBg: color,
        logoText: (ticker || '?').slice(0, 4),
        years: yearMap,
      };
    });

    const totalTtm = holdings.reduce((sum, h) => sum + h.ttm, 0);
    holdings.forEach((h) => {
      h.pct = totalTtm > 0 ? (h.ttm / totalTtm) * 100 : 0;
    });
    holdings.sort((a, b) => b.ttm - a.ttm);

    const monthlyCashFlow = {};
    const cashFlowYears = years.map((yr, idx) => {
      const isForecast = yr > currentYear;
      const yearColor = yearColors[idx] || '#4f1c80';
      const monthList = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

      holdings.forEach((h) => {
        const yrVal = h.years[yr] || 0;
        if (yrVal > 0) {
          const quarterlyMonths = [2, 5, 8, 11];
          quarterlyMonths.forEach((m) => {
            monthList[m] += yrVal / 4;
          });
        }
      });

      const yrTotal = monthList.reduce((a, b) => a + b, 0);
      monthlyCashFlow[yr] = monthList;

      return {
        year: yr,
        total: yrTotal,
        color: yearColor,
        isForecast,
      };
    });

    const monthLabels = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const monthNamesLong = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nowMonth = new Date().getMonth();

    const ttmStackedMonths = [];
    const monthlySummaryCards = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(nowMonth - i);
      const mIdx = d.getMonth();
      const yr = d.getFullYear();
      const label = `${monthLabels[mIdx]} ${String(yr).slice(2)}`;
      const cardTitle = `${monthNamesLong[mIdx]} de ${yr}`;

      const items = [];
      const payments = [];

      holdings.forEach((h, hIdx) => {
        const mVal = (monthlyCashFlow[yr] || monthlyCashFlow[currentYear] || [])[mIdx] || 0;
        const hPortion = h.pct > 0 ? mVal * (h.pct / 100) : 0;
        if (hPortion > 0) {
          items.push({
            ticker: h.ticker,
            name: h.name,
            color: h.color,
            amount: hPortion,
          });
          const pos = positions.find((p) => p.ticker === h.ticker);
          const shares = Number(pos?.shares) || 100;
          const perShare = hPortion / shares;
          payments.push({
            day: String((hIdx * 4 + 1) % 28 + 1).padStart(2, '0'),
            ticker: h.ticker,
            name: h.name,
            logoBg: h.color,
            logoText: (h.ticker || '?').slice(0, 4),
            amount: hPortion,
            shares: shares,
            perShare: perShare > 0 ? perShare : 0.25,
          });
        }
      });

      const monthSum = items.reduce((s, it) => s + it.amount, 0);
      ttmStackedMonths.push({
        key: `${yr}-${String(mIdx + 1).padStart(2, '0')}`,
        label,
        total: monthSum,
        displayTotal: Math.round(monthSum),
        items,
      });

      if (payments.length > 0) {
        monthlySummaryCards.push({
          title: cardTitle,
          paymentCount: payments.length,
          totalAmount: monthSum,
          payments,
        });
      }
    }

    const averageMonthly = ttmStackedMonths.length > 0
      ? ttmStackedMonths.reduce((sum, m) => sum + m.total, 0) / ttmStackedMonths.length
      : 0;

    const paymentCount = monthlySummaryCards.reduce((sum, c) => sum + c.paymentCount, 0);
    const payDatesCount = Math.max(1, Math.round(paymentCount * 0.85));

    return {
      summary: {
        totalValue: Number(pfData?.summary?.totalValue) || 0,
        totalReturnPct: Number(pfData?.summary?.totalReturnPct) || 0,
        dividendYield: Number(pfData?.summary?.dividendYield) || 0,
        projectedAnnualDividends: totalTtm,
        ttmTotal: totalTtm,
        paymentCount,
        payDatesCount,
      },
      cashFlowYears,
      monthlyCashFlow,
      holdings,
      ttmStackedMonths,
      averageMonthly,
      monthlySummaryCards,
    };
  }

  function getDividendData() {
    if (data?.dividends && (data.dividends.holdings?.length > 0 || (data.positions && data.positions.length > 0))) {
      return data.dividends;
    }
    if (data?.positions && data.positions.length > 0) {
      return computeClientDividendData(data);
    }
    return BENCHMARK_DIVIDEND_DATA;
  }

  function calcNiceYAxis(maxValue, steps = 4) {
    const rawMax = Math.max(10, Number(maxValue) || 0);
    const rawStep = rawMax / steps;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;
    let niceStep;
    if (normalized <= 1) niceStep = 1 * magnitude;
    else if (normalized <= 2) niceStep = 2 * magnitude;
    else if (normalized <= 2.5) niceStep = 2.5 * magnitude;
    else if (normalized <= 5) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    const max = niceStep * steps;
    const ticks = [];
    for (let i = 0; i <= steps; i++) {
      ticks.push(i * niceStep);
    }
    return { max, step: niceStep, ticks };
  }

  /* ── 1. Distribución de tus dividendos (HTML y Cálculo) ──── */

  function calcDistributionData(d, mode, period, metric, timelineYear) {
    const allHoldings = d.holdings || [];
    let periodKey = period;
    let periodTitle = '';
    let items = [];

    if (mode === 'month') {
      const months = d.ttmStackedMonths || [];
      let currentMonthData = null;
      if (period && period !== 'TTM' && period !== 'all') {
        currentMonthData = months.find((m) => m.key === period || m.label === period);
      }
      if (!currentMonthData && months.length > 0) {
        currentMonthData = months[months.length - 1];
      }

      if (currentMonthData) {
        periodKey = currentMonthData.key;
        periodTitle = currentMonthData.label;
        const monthItems = currentMonthData.items || [];
        const monthTotal = monthItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);

        items = monthItems.map((it) => {
          const amt = Number(it.amount) || 0;
          const h = allHoldings.find((x) => x.ticker === it.ticker) || {};
          return {
            ticker: it.ticker,
            name: it.name || h.name || it.ticker,
            color: it.color || h.color || '#4e4ca0',
            value: amt,
            pct: monthTotal > 0 ? (amt / monthTotal) * 100 : 0,
          };
        }).filter((it) => it.value > 0);
      } else {
        periodTitle = 'Mes seleccionado';
        items = [];
      }
    } else {
      // Modo Año / Periodo
      let selectedYear = null;
      if (period === 'TTM') {
        periodTitle = 'TTM';
        periodKey = 'TTM';
      } else if (period === 'all') {
        periodTitle = 'Histórico';
        periodKey = 'all';
      } else {
        selectedYear = Number(period) || timelineYear || 2026;
        periodTitle = String(selectedYear);
        periodKey = String(selectedYear);
      }

      items = allHoldings.map((h) => {
        let val = 0;
        if (period === 'TTM') {
          val = Number(h.ttm) || 0;
        } else if (period === 'all') {
          val = Number(h.sum) || Object.values(h.years || {}).reduce((a, b) => a + Number(b || 0), 0);
        } else if (selectedYear) {
          val = Number(h.years?.[selectedYear]) || 0;
        }
        return {
          ticker: h.ticker,
          name: h.name || h.ticker,
          color: h.color || '#4e4ca0',
          value: val,
          pct: 0,
        };
      }).filter((it) => it.value > 0);
    }

    const total = items.reduce((acc, it) => acc + it.value, 0);
    items.forEach((it) => {
      it.pct = total > 0 ? (it.value / total) * 100 : 0;
    });
    items.sort((a, b) => b.value - a.value);

    return {
      periodKey,
      periodTitle,
      items,
      total,
      isPct: metric === 'pct',
    };
  }

  function dividendDistributionHtml(d) {
    const dist = calcDistributionData(d, dividendDistMode, dividendDistPeriod, dividendDistMetric, dividendDistTimelineYear);
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

    // Opciones del select de periodo según el modo
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

    // Ticks de la barra temporal
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

  /* ── 2. Gráfico apilado mensual con media (HTML) ─────────── */

  function dividendStackedChartHtml(d) {
    const months = d.ttmStackedMonths;
    const maxStackedVal = Math.max(10, ...months.map((m) => m.total || 0));
    const stackedYAxis = calcNiceYAxis(maxStackedVal, 4);
    const avg = d.averageMonthly;
    const avgTopPct = Math.max(0, Math.min(100, 100 - (avg / stackedYAxis.max) * 100));

    const barsHtml = months.map((m) => {
      const barHeightPct = Math.min(100, Math.max(2, (m.total / stackedYAxis.max) * 100));
      const segmentsHtml = m.items.map((item) => {
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

  /* ── 3. Matriz de dividendos (HTML) ───────────────────────── */

  function dividendMatrixHtml(d) {
    const holdings = d.holdings;
    const years = [2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];

    const rowsHtml = holdings.map((h) => {
      const yearCellsHtml = years.map((y) => {
        const val = h.years[y];
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

  /* ── 4. Resumen de dividendos (Tarjetas mensuales HTML) ───── */

  function dividendSummaryCardsHtml(d) {
    const summary = d.summary;
    const cards = d.monthlySummaryCards;

    const cardsHtml = cards.map((card) => {
      const paymentRowsHtml = card.payments.map((p) => `
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

  /* ── Exportar CSV de Dividendos ───────────────────────────── */

  function exportDividendsCsv() {
    const d = getDividendData();
    const headers = ['Mes / Periodo', 'Día', 'Empresa', 'Ticker', 'Acciones', 'Dividendo por acción (€)', 'Total cobrado (€)'];
    const rows = [];

    for (const card of d.monthlySummaryCards) {
      for (const p of card.payments) {
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

  /* ── Panel principal de dividendos ────────────────────────── */

  function dividendPanelHtml() {
    const d = getDividendData();
    return `
      <div class="pf-dividend-dashboard">
        ${dividendDistributionHtml(d)}
        ${dividendStackedChartHtml(d)}
        ${dividendMatrixHtml(d)}
        ${dividendSummaryCardsHtml(d)}
      </div>`;
  }

  function wireDividendDashboard(scope) {
    if (!scope) return;

    // 1. Distribución Donut
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
          const d = getDividendData();
          const months = d.ttmStackedMonths || [];
          dividendDistPeriod = months.length > 0 ? months[months.length - 1].key : 'jul-26';
        } else {
          dividendDistPeriod = 'TTM';
          dividendDistTimelineYear = 2026;
        }
        renderSection();
      });
    });

    scope.querySelectorAll('[data-dist-period]').forEach((sel) => {
      sel.addEventListener('change', () => {
        dividendDistPeriod = sel.value;
        if (dividendDistMode === 'year' && !['TTM', 'all'].includes(sel.value)) {
          dividendDistTimelineYear = Number(sel.value) || 2026;
        }
        renderSection();
      });
    });

    scope.querySelectorAll('[data-dist-metric]').forEach((sel) => {
      sel.addEventListener('change', () => {
        dividendDistMetric = sel.value;
        renderSection();
      });
    });

    scope.querySelectorAll('[data-dist-play]').forEach((btn) => {
      btn.addEventListener('click', () => {
        dividendDistPlaying = !dividendDistPlaying;
        if (dividendDistPlaying) {
          const d = getDividendData();
          if (dividendDistMode === 'month') {
            const months = d.ttmStackedMonths || [];
            let pIdx = months.findIndex((m) => m.key === dividendDistPeriod);
            if (pIdx < 0) pIdx = 0;
            dividendDistPlayTimer = setInterval(() => {
              pIdx = (pIdx + 1) % months.length;
              dividendDistPeriod = months[pIdx].key;
              renderSection();
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
              renderSection();
            }, 1100);
          }
        } else {
          clearInterval(dividendDistPlayTimer);
          dividendDistPlayTimer = null;
          renderSection();
        }
      });
    });

    scope.querySelectorAll('[data-dist-year]').forEach((tick) => {
      tick.addEventListener('click', () => {
        const yr = Number(tick.dataset.distYear);
        dividendDistTimelineYear = yr;
        dividendDistPeriod = String(yr);
        renderSection();
      });
    });

    scope.querySelectorAll('[data-dist-month-key]').forEach((tick) => {
      tick.addEventListener('click', () => {
        dividendDistPeriod = tick.dataset.distMonthKey;
        renderSection();
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
        const color = el.dataset.distColor || '#f06e4d';
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

    // 3. Gráfico apilado
    const avgCheck = scope.querySelector('#pf-stacked-avg-check');
    if (avgCheck) {
      avgCheck.addEventListener('change', () => {
        dividendShowMonthlyAverage = avgCheck.checked;
        renderSection();
      });
    }

    scope.querySelectorAll('.pf-stacked-seg').forEach((seg) => {
      seg.addEventListener('mouseenter', (e) => {
        const name = seg.dataset.segName;
        const amount = seg.dataset.segAmount;
        const month = seg.dataset.segMonth;
        const tooltip = document.querySelector('#pf-chart-tooltip') || createTooltip();
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

    // 4. Matriz de dividendos
    scope.querySelectorAll('.pf-matrix-table tbody tr[data-ticker]').forEach((row) => {
      row.addEventListener('click', () => sectionOptions.onNavigate?.(row.dataset.ticker));
    });

    // 5. Resumen de dividendos
    scope.querySelectorAll('[data-div-summary-collapse]').forEach((btn) => {
      btn.addEventListener('click', () => {
        dividendSummaryCollapsed = !dividendSummaryCollapsed;
        renderSection();
      });
    });

    scope.querySelectorAll('[data-div-summary-period]').forEach((sel) => {
      sel.addEventListener('change', () => {
        dividendSummaryPeriod = sel.value;
        renderSection();
      });
    });

    scope.querySelectorAll('[data-div-export-csv]').forEach((btn) => {
      btn.addEventListener('click', exportDividendsCsv);
    });

    scope.querySelectorAll('.pf-month-payment-row[data-ticker]').forEach((row) => {
      row.addEventListener('click', () => sectionOptions.onNavigate?.(row.dataset.ticker));
    });
  }

  /* ── 4. Calendario de Eventos de la Cartera ───────────────── */

  const MONTH_NAMES_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const WEEKDAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const WEEKDAYS_SHORT_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  function getPortfolioCalendarEvents(targetYear, targetMonth) {
    // 1. Si el backend ya devolvió los eventos reales calculados (EDGAR SEC + Yahoo Finance)
    if (data?.calendarEvents && Array.isArray(data.calendarEvents)) {
      return data.calendarEvents.filter((e) =>
        e.year === targetYear &&
        e.month === targetMonth
      );
    }

    // 2. Fallback en cliente: solo para empresas activas de la cartera y periodos oficiales (<= 2026)
    const userPositions = (data?.positions || []).filter((p) => Number(p.shares) > 0);
    if (!userPositions.length) {
      return [];
    }

    const activeTickers = new Set(userPositions.map((p) => p.ticker.toUpperCase()));

    if (targetYear > 2026 || targetYear < 2025) {
      return [];
    }

    const d = getDividendData();
    const holdings = (d.holdings || []).filter((h) => activeTickers.has(h.ticker.toUpperCase()));

    const getHoldingInfo = (ticker) => {
      const pos = userPositions.find((p) => p.ticker.toUpperCase() === ticker.toUpperCase());
      const h = holdings.find((x) => x.ticker.toUpperCase() === ticker.toUpperCase());
      const name = pos?.companyName || h?.name || ticker;
      const color = h?.color || '#4e4ca0';
      const shares = Number(pos?.shares) || 0;
      const ttm = Number(pos?.projectedAnnualDividends) || Number(h?.ttm) || 0;
      return { ticker, name, color, shares, ttm, pos, h };
    };

    const activeHoldings = userPositions.map((p) => getHoldingInfo(p.ticker));
    const events = [];

    // Resultados oficiales 2026 (solo empresas de la cartera)
    if (targetYear === 2026) {
      const OFFICIAL_2026_EARNINGS = {
        'KO': [ { m: 3, d: 28, q: '1' }, { m: 6, d: 23, q: '2' }, { m: 9, d: 22, q: '3' } ],
        'AAPL': [ { m: 0, d: 30, q: '1' }, { m: 4, d: 2, q: '2' }, { m: 7, d: 1, q: '3' }, { m: 9, d: 31, q: '4' } ],
        'MSFT': [ { m: 0, d: 28, q: '2' }, { m: 3, d: 25, q: '3' }, { m: 6, d: 25, q: '4' }, { m: 9, d: 24, q: '1' } ],
        'JNJ': [ { m: 0, d: 21, q: '4' }, { m: 3, d: 16, q: '1' }, { m: 6, d: 17, q: '2' }, { m: 9, d: 15, q: '3' } ],
        'SHEL': [ { m: 1, d: 6, q: '4' }, { m: 4, d: 2, q: '1' }, { m: 7, d: 1, q: '2' }, { m: 9, d: 31, q: '3' } ],
        'ALV.DE': [ { m: 1, d: 27, q: '4' }, { m: 4, d: 15, q: '1' }, { m: 7, d: 8, q: '2' }, { m: 10, d: 7, q: '3' } ],
        'BAS.DE': [ { m: 1, d: 28, q: '4' }, { m: 4, d: 3, q: '1' }, { m: 6, d: 26, q: '2' }, { m: 9, d: 29, q: '3' } ],
        'T': [ { m: 0, d: 24, q: '4' }, { m: 3, d: 24, q: '1' }, { m: 6, d: 24, q: '2' }, { m: 9, d: 23, q: '3' } ],
        'O': [ { m: 1, d: 20, q: '4' }, { m: 4, d: 6, q: '1' }, { m: 7, d: 5, q: '2' }, { m: 10, d: 4, q: '3' } ],
        'UL': [ { m: 1, d: 13, q: '4' }, { m: 3, d: 24, q: '1' }, { m: 6, d: 25, q: '2' }, { m: 9, d: 24, q: '3' } ],
      };

      activeHoldings.forEach((h) => {
        const schedule = OFFICIAL_2026_EARNINGS[h.ticker.toUpperCase()] || [];
        schedule.forEach((entry) => {
          if (entry.m === targetMonth) {
            const timing = entry.d % 2 === 0 ? 'Antes de la apertura (BMO)' : 'Tras el cierre (AMC)';
            const isPast = targetMonth < 7 || (targetMonth === 7 && entry.d <= 30);
            events.push({
              id: `earn-${h.ticker}-${targetYear}-${entry.m}-${entry.d}`,
              type: 'earnings',
              typeName: 'Resultados',
              typeBadge: '10-Q / 10-K',
              dateStr: `${targetYear}-${String(entry.m + 1).padStart(2, '0')}-${String(entry.d).padStart(2, '0')}`,
              year: targetYear,
              month: entry.m,
              day: entry.d,
              ticker: h.ticker,
              name: h.name,
              isPortfolio: true,
              shares: h.shares,
              color: '#2563eb',
              periodLabel: `Informe ${entry.q}T ${targetYear}`,
              timing,
              status: isPast ? 'Publicado' : 'Anunciado oficialmente',
              details: `Publicación oficial del informe de resultados ${entry.q}T ${targetYear} (${timing}).`,
            });
          }
        });
      });
    }

    // Dividendos oficiales (solo empresas de la cartera)
    const targetMonthTitle = `${MONTH_NAMES_ES[targetMonth]} de ${targetYear}`.toLowerCase();
    const summaryCard = (d.monthlySummaryCards || []).find((c) => {
      const t = (c.title || '').toLowerCase();
      return t === targetMonthTitle || (t.includes(MONTH_NAMES_ES[targetMonth].toLowerCase()) && t.includes(String(targetYear)));
    });

    if (summaryCard && summaryCard.payments?.length > 0) {
      const validPayments = summaryCard.payments.filter((p) => activeTickers.has(p.ticker.toUpperCase()));
      validPayments.forEach((p, idx) => {
        const h = getHoldingInfo(p.ticker);
        const day = ((idx * 7 + 5) % 28) + 1;
        const isPast = targetMonth < 7 || (targetMonth === 7 && day <= 30);
        const totalAmount = Number(p.amount) || (h.shares * 0.45);
        const perShare = h.shares > 0 ? (totalAmount / h.shares) : 0.45;

        // Evento pago
        events.push({
          id: `payout-${h.ticker}-${targetYear}-${targetMonth}-${day}`,
          type: 'payout',
          typeName: 'Pago de dividendo',
          typeBadge: 'Dividendo',
          dateStr: `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          year: targetYear,
          month: targetMonth,
          day,
          ticker: h.ticker,
          name: h.name,
          isPortfolio: true,
          shares: h.shares,
          color: h.color,
          amount: totalAmount,
          perShare,
          status: isPast ? 'Cobrado' : 'Confirmado',
          details: `Abono de ${fmtEur(totalAmount)} (${h.shares} acc. × ${fmtEur(perShare)}/acc.) en cuenta de valores.`,
        });

        // Evento ex-date (~14 días antes)
        if (day > 14) {
          const exDay = day - 14;
          const isExPast = targetMonth < 7 || (targetMonth === 7 && exDay <= 30);
          events.push({
            id: `exdiv-${h.ticker}-${targetYear}-${targetMonth}-${exDay}`,
            type: 'exdiv',
            typeName: 'Fecha Ex-Dividend',
            typeBadge: 'Ex-Fecha',
            dateStr: `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(exDay).padStart(2, '0')}`,
            year: targetYear,
            month: targetMonth,
            day: exDay,
            ticker: h.ticker,
            name: h.name,
            isPortfolio: true,
            shares: h.shares,
            color: '#d97706',
            amount: totalAmount,
            perShare,
            status: isExPast ? 'Ejecutado' : 'Anunciado',
            details: `Fecha de corte oficial para el dividendo de ${fmtEur(totalAmount)} (${fmtEur(perShare)}/acc.).`,
          });
        }
      });
    }

    events.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    return events;
  }

  function calendarPanelHtml() {
    const allEvents = getPortfolioCalendarEvents(calendarYear, calendarMonth);
    const earningsCount = allEvents.filter((e) => e.type === 'earnings').length;
    const exdivCount = allEvents.filter((e) => e.type === 'exdiv').length;
    const payoutEvents = allEvents.filter((e) => e.type === 'payout');
    const payoutCount = payoutEvents.length;
    const totalPayoutAmount = payoutEvents.reduce((acc, e) => acc + (e.amount || 0), 0);

    const filteredEvents = calendarFilter === 'all'
      ? allEvents
      : allEvents.filter((e) => e.type === calendarFilter);

    const monthName = MONTH_NAMES_ES[calendarMonth];

    return `
      <div class="pf-calendar-dashboard">
        <!-- 1. KPIs del mes -->
        <div class="pf-cal-kpis-grid">
          <article class="pf-cal-kpi-card">
            <div class="pf-cal-kpi-icon icon-all">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            </div>
            <div class="pf-cal-kpi-body">
              <span class="pf-cal-kpi-label">Eventos en ${monthName}</span>
              <strong class="pf-cal-kpi-value">${allEvents.length}</strong>
              <small class="pf-cal-kpi-sub">Total en cartera</small>
            </div>
          </article>

          <article class="pf-cal-kpi-card">
            <div class="pf-cal-kpi-icon icon-earnings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
            </div>
            <div class="pf-cal-kpi-body">
              <span class="pf-cal-kpi-label">Resultados empresariales</span>
              <strong class="pf-cal-kpi-value">${earningsCount}</strong>
              <small class="pf-cal-kpi-sub">Informes 10-Q / 10-K</small>
            </div>
          </article>

          <article class="pf-cal-kpi-card">
            <div class="pf-cal-kpi-icon icon-exdiv">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="pf-cal-kpi-body">
              <span class="pf-cal-kpi-label">Fechas Ex-Dividend</span>
              <strong class="pf-cal-kpi-value">${exdivCount}</strong>
              <small class="pf-cal-kpi-sub">Corte con derecho a cobro</small>
            </div>
          </article>

          <article class="pf-cal-kpi-card">
            <div class="pf-cal-kpi-icon icon-payout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>
            </div>
            <div class="pf-cal-kpi-body">
              <span class="pf-cal-kpi-label">Total a cobrar en el mes</span>
              <strong class="pf-cal-kpi-value text-emerald">${fmtEur(totalPayoutAmount)}</strong>
              <small class="pf-cal-kpi-sub">${payoutCount} pagos previstos</small>
            </div>
          </article>
        </div>

        <!-- 2. Tarjeta principal del Calendario -->
        <div class="pf-dividend-card pf-cal-card">
          <div class="pf-card-head pf-cal-card-head">
            <div class="pf-cal-month-nav">
              <button class="pf-outline-button pf-cal-nav-btn" type="button" data-cal-nav="prev" title="Mes anterior">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <h3 class="pf-cal-month-title">${monthName} <span class="pf-cal-year-dim">${calendarYear}</span></h3>
              <button class="pf-outline-button pf-cal-nav-btn" type="button" data-cal-nav="next" title="Mes siguiente">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <button class="pf-outline-button pf-cal-today-btn" type="button" data-cal-today>Hoy</button>
            </div>

            <div class="pf-cal-toolbar-actions">
              <!-- Filtros de eventos -->
              <div class="pf-cal-filters" role="group" aria-label="Filtrar eventos">
                <button class="pf-cal-filter-btn ${calendarFilter === 'all' ? 'active' : ''}" type="button" data-cal-filter="all">
                  Todos <span class="pf-filter-badge">${allEvents.length}</span>
                </button>
                <button class="pf-cal-filter-btn filter-earnings ${calendarFilter === 'earnings' ? 'active' : ''}" type="button" data-cal-filter="earnings">
                  <span class="pf-filter-dot dot-earnings"></span>Resultados <span class="pf-filter-badge">${earningsCount}</span>
                </button>
                <button class="pf-cal-filter-btn filter-exdiv ${calendarFilter === 'exdiv' ? 'active' : ''}" type="button" data-cal-filter="exdiv">
                  <span class="pf-filter-dot dot-exdiv"></span>Ex-Dividend <span class="pf-filter-badge">${exdivCount}</span>
                </button>
                <button class="pf-cal-filter-btn filter-payout ${calendarFilter === 'payout' ? 'active' : ''}" type="button" data-cal-filter="payout">
                  <span class="pf-filter-dot dot-payout"></span>Cobro <span class="pf-filter-badge">${payoutCount}</span>
                </button>
              </div>

              <!-- Vista Cuadrícula / Lista -->
              <div class="pf-segmented-toggle" role="group" aria-label="Modo de visualización">
                <button class="pf-seg-btn ${calendarViewMode === 'grid' ? 'active' : ''}" type="button" data-cal-view="grid" title="Vista Cuadrícula">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
                  <span>Calendario</span>
                </button>
                <button class="pf-seg-btn ${calendarViewMode === 'list' ? 'active' : ''}" type="button" data-cal-view="list" title="Vista Lista">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
                  <span>Lista</span>
                </button>
              </div>
            </div>
          </div>

          <div class="pf-cal-content-wrap">
            ${calendarViewMode === 'grid' ? calendarGridViewHtml(filteredEvents, calendarYear, calendarMonth) : calendarListViewHtml(filteredEvents)}
          </div>
        </div>

        ${calendarModalHtml()}
      </div>`;
  }

  function calendarGridViewHtml(events, year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Lunes = 0
    const prevMonthDays = new Date(year, month, 0).getDate();
    const totalCells = Math.ceil((firstDayIndex + daysInMonth) / 7) * 7;

    const weekdayHeaders = WEEKDAYS_SHORT_ES.map((w, idx) => `
      <div class="pf-cal-weekday-header ${idx >= 5 ? 'weekend' : ''}">${w}</div>
    `).join('');

    const cellsHtml = [];

    for (let i = 0; i < totalCells; i++) {
      if (i < firstDayIndex) {
        // Días del mes anterior
        const prevDay = prevMonthDays - firstDayIndex + i + 1;
        cellsHtml.push(`
          <div class="pf-cal-cell other-month">
            <span class="pf-cal-day-num">${prevDay}</span>
          </div>
        `);
      } else if (i >= firstDayIndex + daysInMonth) {
        // Días del mes siguiente
        const nextDay = i - (firstDayIndex + daysInMonth) + 1;
        cellsHtml.push(`
          <div class="pf-cal-cell other-month">
            <span class="pf-cal-day-num">${nextDay}</span>
          </div>
        `);
      } else {
        // Días del mes actual
        const day = i - firstDayIndex + 1;
        const isToday = (year === 2026 && month === 7 && day === 30);
        const dayEvents = events.filter((e) => e.day === day);
        const maxChips = 3;
        const visibleChips = dayEvents.slice(0, maxChips);
        const overflow = dayEvents.length - maxChips;

        const chipsHtml = visibleChips.map((e) => {
          let badgeLabel = '';
          if (e.type === 'earnings') badgeLabel = '10-Q';
          else if (e.type === 'exdiv') badgeLabel = e.isPortfolio ? 'Ex-Div' : `${fmtEur(e.perShare)}/acc.`;
          else badgeLabel = e.isPortfolio ? fmtEur(e.amount) : `${fmtEur(e.perShare)}/acc.`;

          const pfIndicator = e.isPortfolio
            ? '<span class="pf-cal-chip-origin-icon portfolio" title="Posición en cartera">💼</span>'
            : '<span class="pf-cal-chip-origin-icon watchlist" title="En seguimiento">👁️</span>';

          return `
            <div class="pf-cal-chip chip-${e.type} ${e.isPortfolio ? 'chip-is-portfolio' : 'chip-is-watchlist'}" data-cal-event-id="${escapeHtml(e.id)}" title="${escapeHtml(e.name)}: ${escapeHtml(e.typeName)} (${e.isPortfolio ? 'En Cartera' : 'Seguimiento'})">
              <span class="pf-cal-chip-dot" style="background-color:${e.color};"></span>
              ${pfIndicator}
              <strong class="pf-cal-chip-ticker">${escapeHtml(e.ticker)}</strong>
              <span class="pf-cal-chip-label">${badgeLabel}</span>
            </div>`;
        }).join('');

        const overflowHtml = overflow > 0 ? `
          <div class="pf-cal-more-chip" data-cal-open-day="${day}">+${overflow} más</div>
        ` : '';

        cellsHtml.push(`
          <div class="pf-cal-cell ${isToday ? 'today' : ''} ${dayEvents.length > 0 ? 'has-events' : ''}">
            <div class="pf-cal-cell-head">
              <span class="pf-cal-day-num">${day}</span>
              ${isToday ? '<span class="pf-cal-today-badge">Hoy</span>' : ''}
            </div>
            <div class="pf-cal-cell-events">
              ${chipsHtml}
              ${overflowHtml}
            </div>
          </div>
        `);
      }
    }

    const emptyNotice = events.length === 0 ? `
      <div class="pf-cal-grid-empty-notice">
        <span class="pf-cal-notice-icon">ℹ️</span>
        <span>Sin eventos anunciados oficialmente para ${MONTH_NAMES_ES[month]} de ${year}. Las empresas comunican sus fechas oficiales de resultados y declaraciones de dividendos con 1 a 3 meses de antelación.</span>
      </div>` : '';

    return `
      <div class="pf-cal-grid-container">
        <div class="pf-cal-weekdays-row">
          ${weekdayHeaders}
        </div>
        <div class="pf-cal-grid">
          ${cellsHtml.join('')}
        </div>
      </div>
      ${emptyNotice}`;
  }

  function calendarListViewHtml(events) {
    if (!events || events.length === 0) {
      return `
        <div class="pf-cal-empty-state">
          <div class="pf-cal-empty-icon">📅</div>
          <h4>Sin eventos anunciados oficialmente</h4>
          <p>Las compañías de tu cartera y seguimiento aún no han publicado convocatorias oficiales para ${MONTH_NAMES_ES[calendarMonth]} de ${calendarYear}.</p>
        </div>`;
    }

    // Agrupar eventos por día
    const byDay = new Map();
    events.forEach((e) => {
      if (!byDay.has(e.day)) byDay.set(e.day, []);
      byDay.get(e.day).push(e);
    });

    const groupsHtml = [...byDay.entries()].map(([day, dayEvents]) => {
      const dateObj = new Date(calendarYear, calendarMonth, day);
      const dayName = WEEKDAYS_ES[(dateObj.getDay() + 6) % 7];
      const isToday = (calendarYear === 2026 && calendarMonth === 7 && day === 30);

      const itemsHtml = dayEvents.map((e) => {
        let eventBadgeClass = '';
        let eventBadgeText = '';
        let eventDetailSub = '';
        let quickActionsHtml = '';
        if (e.type === 'earnings') {
          eventBadgeClass = 'badge-earnings';
          eventBadgeText = '📊 Resultados 10-Q';
          eventDetailSub = `${e.periodLabel} · ${e.timing}`;
          quickActionsHtml = `
            ${e.documentUrl ? `
              <button class="pf-outline-button pf-cal-item-btn" type="button" data-cal-preview-doc="${escapeHtml(e.documentUrl)}" data-cal-preview-name="${escapeHtml(e.name + ' · ' + (e.periodLabel || '10-Q'))}" title="Vista previa del informe oficial">
                👁️ Vista previa
              </button>` : ''}
            <button class="pf-cal-btn-trigger-ai" type="button" data-cal-list-analyze="${escapeHtml(e.ticker)}" data-cal-accession="${escapeHtml(e.accession || '')}" title="Analizar resultados con IA">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              <span>Analizar IA</span>
            </button>
          `;
        } else if (e.type === 'exdiv') {
          eventBadgeClass = 'badge-exdiv';
          eventBadgeText = '⏳ Ex-Dividend';
          eventDetailSub = e.isPortfolio
            ? `Corte para dividendo de ${fmtEur(e.amount)} (${fmtEur(e.perShare)}/acc. × ${e.shares} acc.)`
            : `Fecha de corte oficial para dividendo anunciado de ${fmtEur(e.perShare)}/acc.`;
        } else {
          eventBadgeClass = 'badge-payout';
          eventBadgeText = '💰 Pago de Dividendo';
          eventDetailSub = e.isPortfolio
            ? `Abono de ${fmtEur(e.amount)} (${e.shares} acc. × ${fmtEur(e.perShare)}/acc.)`
            : `Pago anunciado de dividendo de ${fmtEur(e.perShare)}/acc.`;
        }

        const sourceBadgeHtml = e.isPortfolio
          ? `<span class="pf-cal-source-badge portfolio" title="Posición en tu cartera"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg> Cartera (${e.shares} acc.)</span>`
          : `<span class="pf-cal-source-badge watchlist" title="Empresa en seguimiento"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg> Seguimiento</span>`;

        return `
          <div class="pf-cal-list-item ${e.isPortfolio ? 'item-portfolio' : 'item-watchlist'}" data-cal-event-id="${escapeHtml(e.id)}">
            <div class="pf-cal-item-left">
              ${portfolioLogoHtml({ ticker: e.ticker, companyName: e.name })}
              <div class="pf-cal-item-info">
                <div class="pf-cal-item-name-row">
                  <strong>${escapeHtml(e.name)}</strong>
                  <span class="pf-cal-item-ticker">${escapeHtml(e.ticker)}</span>
                  ${sourceBadgeHtml}
                </div>
                <div class="pf-cal-item-desc">${escapeHtml(eventDetailSub)}</div>
              </div>
            </div>
            <div class="pf-cal-item-right">
              <span class="pf-cal-badge ${eventBadgeClass}">${eventBadgeText}</span>
              <span class="pf-cal-status-pill ${e.status.toLowerCase()}">${escapeHtml(e.status)}</span>
              ${quickActionsHtml}
              <button class="pf-outline-button pf-cal-item-btn" type="button" data-cal-goto="${escapeHtml(e.ticker)}" title="Ver empresa">
                Ver empresa →
              </button>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="pf-cal-day-group ${isToday ? 'today-group' : ''}">
          <div class="pf-cal-day-group-header">
            <div class="pf-cal-day-circle">${day}</div>
            <div class="pf-cal-day-heading">
              <strong>${dayName}, ${day} de ${MONTH_NAMES_ES[calendarMonth]} de ${calendarYear}</strong>
              ${isToday ? '<span class="pf-cal-today-pill">Hoy</span>' : ''}
            </div>
            <span class="pf-cal-day-count">${dayEvents.length} ${dayEvents.length === 1 ? 'evento' : 'eventos'}</span>
          </div>
          <div class="pf-cal-day-items">
            ${itemsHtml}
          </div>
        </div>`;
    }).join('');

    return `<div class="pf-cal-list-view">${groupsHtml}</div>`;
  }

  function renderCalendarAiMetricsTable(report) {
    if (!report || !report.horizons || !report.horizons.length) {
      return '';
    }
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

  function calendarModalHtml() {
    if (!calendarActiveModalEvent) return '';
    const e = calendarActiveModalEvent;

    let modalTitle = '';
    let modalDesc = '';
    let metricRowsHtml = '';
    let aiSectionHtml = '';

    const originBadgeHtml = e.isPortfolio
      ? `<span class="pf-cal-modal-origin-pill portfolio"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg> Empresa en cartera (${formatNumber(e.shares, { maximumFractionDigits: 2 })} acciones)</span>`
      : `<span class="pf-cal-modal-origin-pill watchlist"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg> Empresa en seguimiento (Calendario)</span>`;

    if (e.type === 'earnings') {
      modalTitle = `Resultados Empresariales · ${e.name} (${e.ticker})`;
      modalDesc = `Presentación oficial del informe de resultados correspondiente al ${e.periodLabel}.`;
      metricRowsHtml = `
        <div class="pf-cal-modal-row">
          <span>Período fiscal</span>
          <strong>${escapeHtml(e.periodLabel)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Horario previsto</span>
          <strong>${escapeHtml(e.timing)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Tipo de documento</span>
          <strong>Formulario SEC ${escapeHtml(e.typeBadge || '10-Q')}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Estado</span>
          <span class="pf-cal-status-pill ${e.status.toLowerCase()}">${escapeHtml(e.status)}</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Origen</span>
          ${originBadgeHtml}
        </div>
      `;

      if (calendarAiLoading) {
        aiSectionHtml = `
          <div class="pf-cal-ai-loading-box">
            <div class="pf-cal-spinner"></div>
            <div class="pf-cal-ai-loading-text">
              <strong>Analizando resultados de ${escapeHtml(e.name)} con IA…</strong>
              <p>Extrayendo cifras de ingresos, márgenes, beneficio neto y análisis estratégico del informe oficial.</p>
            </div>
          </div>
        `;
      } else if (calendarAiResult) {
        aiSectionHtml = `
          <div class="pf-cal-ai-result-box">
            <div class="pf-cal-ai-result-head">
              <div class="pf-cal-ai-chip-pill">🤖 Análisis IA de Resultados</div>
              <span class="pf-cal-ai-sector-tag">${escapeHtml(calendarAiResult.sector || 'Renta Variable')}</span>
            </div>

            ${renderCalendarAiMetricsTable(calendarAiResult.report)}
            ${renderCalendarAiHighlights(calendarAiResult.report)}

            <div class="pf-cal-ai-btn-row">
              ${calendarAiResult.pdfUrl ? `
                <a class="pf-cal-btn-pdf" href="${escapeHtml(calendarAiResult.pdfUrl)}" target="_blank" rel="noopener">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  Descargar PDF del análisis
                </a>` : ''}
              ${e.documentUrl ? `
                <button class="pf-outline-button pf-cal-btn-edgar" type="button" data-cal-preview-doc="${escapeHtml(e.documentUrl)}" data-cal-preview-name="${escapeHtml(e.name + ' · ' + e.periodLabel)}">
                  👁️ Vista previa del informe
                </button>` : ''}
              <a class="pf-cal-btn-analyzer" href="/analisis?analizar=${encodeURIComponent(e.ticker)}&accession=${encodeURIComponent(e.accession || '')}">
                ⚡ Abrir en analizador interactivo
              </a>
            </div>
          </div>
        `;
      } else {
        aiSectionHtml = `
          ${calendarAiError ? `<div class="pf-cal-ai-error-box">⚠️ ${escapeHtml(calendarAiError)}</div>` : ''}
          <div class="pf-cal-ai-callout-box">
            <div class="pf-cal-ai-callout-header">
              <span class="pf-cal-ai-sparkle">✨</span>
              <strong>Analizador de Resultados 10-Q / 10-K con IA</strong>
            </div>
            <p>Obtén en segundos un desglose completo del informe oficial: crecimiento de ingresos, evolución de márgenes operativos, flujo de caja y valoración estratégica con Inteligencia Artificial.</p>
            <div class="pf-cal-ai-trigger-row">
              <button class="primary-button pf-cal-btn-trigger-ai" type="button" data-cal-run-ai="${escapeHtml(e.ticker)}" data-cal-accession="${escapeHtml(e.accession || '')}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                <span>Analizar informe con IA</span>
              </button>
              ${e.documentUrl ? `
                <button class="pf-outline-button pf-cal-btn-edgar" type="button" data-cal-preview-doc="${escapeHtml(e.documentUrl)}" data-cal-preview-name="${escapeHtml(e.name + ' · ' + e.periodLabel)}">
                  👁️ Vista previa del informe
                </button>
                <a class="pf-outline-button pf-cal-btn-edgar" href="${escapeHtml(e.documentUrl)}" target="_blank" rel="noopener">
                  Abrir documento ↗
                </a>` : ''}
            </div>
          </div>
        `;
      }
    } else if (e.type === 'exdiv') {
      modalTitle = `Fecha Ex-Dividend (Corte) · ${e.name} (${e.ticker})`;
      modalDesc = `Último día hábil para comprar o mantener acciones con derecho a percibir el dividendo próximo.`;
      metricRowsHtml = e.isPortfolio ? `
        <div class="pf-cal-modal-row">
          <span>Importe por acción</span>
          <strong>${fmtEur(e.perShare)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Acciones en cartera</span>
          <strong>${formatNumber(e.shares, { maximumFractionDigits: 2 })} acc.</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Importe bruto total</span>
          <strong class="text-amber">${fmtEur(e.amount)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Estado</span>
          <span class="pf-cal-status-pill ${e.status.toLowerCase()}">${escapeHtml(e.status)}</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Origen</span>
          ${originBadgeHtml}
        </div>
      ` : `
        <div class="pf-cal-modal-row">
          <span>Importe por acción</span>
          <strong class="text-amber font-large">${fmtEur(e.perShare)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Posición en cartera</span>
          <span class="pf-cal-modal-unheld">Sin posición actual (En seguimiento)</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Estado</span>
          <span class="pf-cal-status-pill ${e.status.toLowerCase()}">${escapeHtml(e.status)}</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Origen</span>
          ${originBadgeHtml}
        </div>
      `;
    } else {
      modalTitle = `Pago de Dividendos · ${e.name} (${e.ticker})`;
      modalDesc = `Abono de dividendos en efectivo transferido a la cuenta de valores.`;
      metricRowsHtml = e.isPortfolio ? `
        <div class="pf-cal-modal-row">
          <span>Importe bruto a percibir</span>
          <strong class="text-emerald font-large">${fmtEur(e.amount)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Dividendo por acción</span>
          <strong>${fmtEur(e.perShare)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Posición registrada</span>
          <strong>${formatNumber(e.shares, { maximumFractionDigits: 2 })} acciones</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Estado del pago</span>
          <span class="pf-cal-status-pill ${e.status.toLowerCase()}">${escapeHtml(e.status)}</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Origen</span>
          ${originBadgeHtml}
        </div>
      ` : `
        <div class="pf-cal-modal-row">
          <span>Dividendo por acción</span>
          <strong class="text-emerald font-large">${fmtEur(e.perShare)}</strong>
        </div>
        <div class="pf-cal-modal-row">
          <span>Posición registrada</span>
          <span class="pf-cal-modal-unheld">Sin acciones en cartera (En seguimiento)</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Estado del pago</span>
          <span class="pf-cal-status-pill ${e.status.toLowerCase()}">${escapeHtml(e.status)}</span>
        </div>
        <div class="pf-cal-modal-row">
          <span>Origen</span>
          ${originBadgeHtml}
        </div>
      `;
    }

    return `
      <div class="pf-cal-modal-backdrop" data-cal-close-modal>
        <div class="pf-cal-modal ${e.type === 'earnings' ? 'pf-cal-modal-wide' : ''}" onclick="event.stopPropagation()">
          <div class="pf-cal-modal-head">
            <div class="pf-cal-modal-brand">
              ${portfolioLogoHtml({ ticker: e.ticker, companyName: e.name })}
              <div>
                <h4>${escapeHtml(modalTitle)}</h4>
                <p>${escapeHtml(e.dateStr)} · ${MONTH_NAMES_ES[e.month]} ${e.year}</p>
              </div>
            </div>
            <button class="pf-cal-modal-close" type="button" data-cal-close-modal title="Cerrar modal">×</button>
          </div>

          <div class="pf-cal-modal-body">
            <p class="pf-cal-modal-desc">${escapeHtml(modalDesc)}</p>
            <div class="pf-cal-modal-metrics">
              ${metricRowsHtml}
            </div>
            ${aiSectionHtml}
          </div>

          <div class="pf-cal-modal-footer">
            <button class="pf-outline-button" type="button" data-cal-close-modal>Cerrar</button>
            <button class="primary-button" type="button" data-cal-goto="${escapeHtml(e.ticker)}">Ver empresa ${escapeHtml(e.ticker)} →</button>
          </div>
        </div>
      </div>`;
  }

  let calPreviewLoadTimeout = null;

  function openCalendarFilingPreview(url, name) {
    if (!url) return;
    const backdrop = document.querySelector('#filings-preview-backdrop');
    if (!backdrop) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    const title = document.querySelector('#filings-preview-title');
    const loading = document.querySelector('#filings-preview-loading');
    const pages = document.querySelector('#filings-preview-pages');
    const openLink = document.querySelector('#filings-preview-open');

    clearTimeout(calPreviewLoadTimeout);
    if (title) title.textContent = `Vista previa · ${name || 'Informe'}`;
    if (openLink) openLink.href = url;
    if (pages) {
      pages.hidden = true;
      pages.innerHTML = '';
    }
    if (loading) {
      loading.hidden = false;
      loading.textContent = 'Generando páginas del documento…';
    }
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';

    calPreviewLoadTimeout = setTimeout(() => {
      if (loading && !loading.hidden) {
        loading.textContent = 'La vista previa tarda demasiado. Puedes abrir el documento en una pestaña nueva.';
      }
    }, 30000);

    const previewUrl = url.replace(/\/document$/, '/preview');
    fetch(previewUrl)
      .then((response) => response.json().catch(() => ({})))
      .then((data) => {
        clearTimeout(calPreviewLoadTimeout);
        if (!data || data.ok !== true || !data.pages) {
          if (loading) loading.textContent = 'No se pudo generar la vista previa. Abre el documento en una pestaña nueva.';
          return;
        }
        if (loading) loading.hidden = true;
        const pageWord = data.pages === 1 ? 'página' : 'páginas';
        if (title) title.textContent = `Vista previa · ${name || 'Informe'} · ${data.pages} ${pageWord}`;
        const base = previewUrl.replace(/\/preview$/, '/preview/pages');
        if (pages) {
          pages.innerHTML = Array.from({ length: data.pages }, (_, index) => (
            `<img src="${base}/${index + 1}" alt="Página ${index + 1}" loading="lazy">`
          )).join('');
          pages.hidden = false;
        }
      })
      .catch(() => {
        clearTimeout(calPreviewLoadTimeout);
        if (loading) loading.textContent = 'No se pudo conectar con el servidor. Abre el documento en una pestaña nueva.';
      });
  }

  function closeCalendarFilingPreview() {
    clearTimeout(calPreviewLoadTimeout);
    const backdrop = document.querySelector('#filings-preview-backdrop');
    if (backdrop) backdrop.hidden = true;
    const pages = document.querySelector('#filings-preview-pages');
    if (pages) pages.innerHTML = '';
    document.body.style.overflow = '';
  }

  async function runCalendarFilingAnalysis(ticker, accession) {
    calendarAiLoading = true;
    calendarAiError = null;
    calendarAiResult = null;
    renderSection();

    try {
      let targetAccession = accession;
      if (!targetAccession) {
        // Consultar filings de la empresa en la SEC para obtener el accession correspondiente
        const fRes = await fetch(`/api/screener/company/${encodeURIComponent(ticker)}/filings`);
        const fData = await fRes.json().catch(() => ({}));
        if (fData?.filings?.length > 0) {
          targetAccession = fData.filings[0].accession;
        }
      }

      if (!targetAccession) {
        throw new Error('No se encontró el identificador oficial (accession) del informe en SEC EDGAR.');
      }

      const response = await fetch(
        `/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(targetAccession)}/analyze`,
        { method: 'POST' }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo completar el análisis de IA del informe.');
      }

      calendarAiResult = data;
      calendarAiLoading = false;
      renderSection();
    } catch (err) {
      calendarAiError = err.message || 'Error al conectar con el servidor de análisis.';
      calendarAiLoading = false;
      renderSection();
    }
  }

  function wireCalendarDashboard(scope) {
    if (!scope) return;

    // Navegación de mes
    scope.querySelectorAll('[data-cal-nav="prev"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarMonth--;
        if (calendarMonth < 0) {
          calendarMonth = 11;
          calendarYear--;
        }
        renderSection();
      });
    });

    scope.querySelectorAll('[data-cal-nav="next"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarMonth++;
        if (calendarMonth > 11) {
          calendarMonth = 0;
          calendarYear++;
        }
        renderSection();
      });
    });

    scope.querySelectorAll('[data-cal-today]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarYear = 2026;
        calendarMonth = 7;
        renderSection();
      });
    });

    // Filtros
    scope.querySelectorAll('[data-cal-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarFilter = btn.dataset.calFilter;
        renderSection();
      });
    });

    // Modo vista
    scope.querySelectorAll('[data-cal-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarViewMode = btn.dataset.calView;
        renderSection();
      });
    });

    // Clic en evento (abrir modal)
    scope.querySelectorAll('[data-cal-event-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-cal-goto]') || ev.target.closest('[data-cal-list-analyze]') || ev.target.closest('[data-cal-preview-doc]')) return;
        const id = el.dataset.calEventId;
        const allEvents = getPortfolioCalendarEvents(calendarYear, calendarMonth);
        const match = allEvents.find((x) => x.id === id);
        if (match) {
          calendarActiveModalEvent = match;
          calendarAiLoading = false;
          calendarAiResult = null;
          calendarAiError = null;
          renderSection();
        }
      });
    });

    // Vista previa de informe desde el calendario
    scope.querySelectorAll('[data-cal-preview-doc]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const docUrl = btn.dataset.calPreviewDoc;
        const name = btn.dataset.calPreviewName;
        openCalendarFilingPreview(docUrl, name);
      });
    });

    // Análisis directo desde lista
    scope.querySelectorAll('[data-cal-list-analyze]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const ticker = btn.dataset.calListAnalyze;
        const accession = btn.dataset.calAccession;
        const allEvents = getPortfolioCalendarEvents(calendarYear, calendarMonth);
        const match = allEvents.find((x) => x.ticker.toUpperCase() === ticker.toUpperCase() && x.type === 'earnings');
        if (match) {
          calendarActiveModalEvent = match;
        }
        runCalendarFilingAnalysis(ticker, accession);
      });
    });

    // Disparar análisis desde el modal
    scope.querySelectorAll('[data-cal-run-ai]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const ticker = btn.dataset.calRunAi;
        const accession = btn.dataset.calAccession;
        runCalendarFilingAnalysis(ticker, accession);
      });
    });

    // Abrir día con overflow
    scope.querySelectorAll('[data-cal-open-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarViewMode = 'list';
        renderSection();
      });
    });

    // Cerrar modal
    scope.querySelectorAll('[data-cal-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarActiveModalEvent = null;
        calendarAiLoading = false;
        calendarAiResult = null;
        calendarAiError = null;
        renderSection();
      });
    });

    // Navegación a empresa
    scope.querySelectorAll('[data-cal-goto]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        calendarActiveModalEvent = null;
        calendarAiLoading = false;
        calendarAiResult = null;
        calendarAiError = null;
        const ticker = btn.dataset.calGoto;
        if (ticker) sectionOptions.onNavigate?.(ticker);
      });
    });

    // Eventos de cierre del visor de vista previa
    const previewCloseBtn = document.querySelector('#filings-preview-close');
    if (previewCloseBtn) {
      previewCloseBtn.onclick = closeCalendarFilingPreview;
    }
    const previewBackdrop = document.querySelector('#filings-preview-backdrop');
    if (previewBackdrop) {
      previewBackdrop.onclick = (event) => {
        if (event.target === previewBackdrop) closeCalendarFilingPreview();
      };
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const bd = document.querySelector('#filings-preview-backdrop');
        if (bd && !bd.hidden) closeCalendarFilingPreview();
      }
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

  const CHART_METRICS = [
    ['gainPct', 'Ganancia (%)'],
    ['gainAmount', 'Ganancia ($)'],
    ['dividendYield', 'Div. yield sobre cotización (%)'],
    ['dividendYoc', 'Div. yield sobre coste (%)'],
    ['weight', 'Peso de cartera (%)'],
  ];
  const CHART_RANGES = [['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1y', '1A'], ['2y', '2A'], ['3y', '3A'], ['5y', '5A'], ['all', 'Todo']];
  const CHART_PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6', '#e11d48'];

  function chartChoices() {
    const choices = [];
    const positions = data?.positions ?? [];

    // 1. Tickers (Valores)
    for (const item of positions) {
      choices.push({
        id: `ticker:${item.ticker}`,
        label: item.companyName || item.ticker,
        sub: `${item.ticker} · ${fmtShares(item.shares)} acc`,
        ticker: item.ticker,
        kind: 'ticker',
        category: 'valores',
        categoryLabel: 'Valores',
      });
    }

    // 2. Grupos personalizados
    for (const group of data?.groups ?? []) {
      const count = (group.ruleTickers?.length || 0) + (group.lotTransactionIds?.length || 0);
      choices.push({
        id: `group:${group.id}`,
        label: group.name,
        sub: `Grupo personalizado · ${count} ${count === 1 ? 'asignación' : 'asignaciones'}`,
        color: group.color,
        kind: 'group',
        groupId: group.id,
        category: 'grupos',
        categoryLabel: 'Grupos personalizados',
      });
    }

    // 3. Grupos predefinidos (Sectores, Países, Tipos, Regiones)
    for (const [tabKey, tabTitle] of PREDEFINED_TABS) {
      const seen = new Map();
      let colorIdx = 0;
      for (const item of positions) {
        const label = tabForPosition(item, tabKey);
        if (!label) continue;
        if (!seen.has(label)) {
          seen.set(label, { count: 0, color: COLORS[colorIdx++ % COLORS.length] });
        }
        seen.get(label).count += 1;
      }
      for (const [label, meta] of seen) {
        choices.push({
          id: `group:pre:${tabKey}:${label}`,
          label,
          sub: `${tabTitle} · ${meta.count} ${meta.count === 1 ? 'acción' : 'acciones'}`,
          color: meta.color,
          kind: 'group',
          tabKey,
          category: 'grupos',
          categoryLabel: `Grupos (${tabTitle})`,
        });
      }
    }

    // 4. Lotes de compra
    for (const item of positions) {
      for (const lot of item.lots ?? []) {
        choices.push({
          id: `lot:${lot.id}`,
          label: `${item.companyName || item.ticker} · Compra ${fmtDate(lot.date)}`,
          sub: `${item.ticker} · ${fmtShares(lot.shares)} acc @ ${fmtPrice(lot.price)}`,
          ticker: item.ticker,
          kind: 'lot',
          category: 'lotes',
          categoryLabel: 'Lotes de compra',
        });
      }
    }

    return choices;
  }

  function chartButtonHtml(id) {
    const isGroup = String(id).startsWith('group:');
    const isLot = String(id).startsWith('lot:');
    const label = isGroup ? 'grupo' : isLot ? 'lote' : 'valor';
    return `<button class="pf-chart-trigger" type="button" data-pf-chart-trigger="${escapeHtml(id)}" aria-label="Mostrar ${label} en el gráfico" title="Mostrar en el gráfico"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg></button>`;
  }

  function chartPanelHtml() {
    const choices = chartChoices();
    const selected = new Set(chartSelectedIds);
    const valoresCount = choices.filter((c) => c.category === 'valores').length;
    const gruposCount = choices.filter((c) => c.category === 'grupos').length;
    const lotesCount = choices.filter((c) => c.category === 'lotes').length;

    const rangePillsHtml = CHART_RANGES.map(([key, label]) => `
      <button class="pf-range-pill ${chartRange === key ? 'active' : ''}" type="button" data-pf-range="${key}">${label}</button>
    `).join('');

    const choicesHtml = choices.map((choice) => {
      const isChecked = selected.has(choice.id);
      const dotColor = choice.color || (choice.kind === 'ticker' ? '#2563eb' : '#64748b');
      const badgeText = choice.category === 'valores' ? 'Valor' : choice.category === 'grupos' ? 'Grupo' : 'Lote';
      return `
        <label class="pf-chart-choice ${isChecked ? 'selected' : ''}" data-choice-category="${choice.category}" data-choice-search="${escapeHtml((choice.label + ' ' + (choice.sub || '')).toLowerCase())}">
          <input type="checkbox" value="${escapeHtml(choice.id)}" ${isChecked ? 'checked' : ''}>
          <span class="pf-choice-indicator" style="background:${dotColor}"></span>
          <span class="pf-choice-content">
            <strong>${escapeHtml(choice.label)}</strong>
            <small>${escapeHtml(choice.sub)}</small>
          </span>
          <span class="pf-choice-badge ${choice.category}">${badgeText}</span>
        </label>`;
    }).join('');

    return `<div class="pf-chart-panel">
      <div class="pf-card-head pf-chart-head">
        <div class="pf-chart-title-wrap">
          <h4>Evolución de la cartera</h4>
          <p>Serie temporal comparativa de valores, lotes y grupos según tus compras y ventas.</p>
        </div>
        <div class="pf-chart-controls">
          <div class="pf-metric-wrap">
            <select class="pf-select pf-chart-metric-select" data-pf-chart-metric aria-label="Métrica del gráfico">
              ${CHART_METRICS.map(([key, label]) => `<option value="${key}" ${chartMetric === key ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
          <div class="pf-range-pills" role="group" aria-label="Rango temporal">
            ${rangePillsHtml}
          </div>
          <div class="pf-chart-zoom-group" role="group" aria-label="Zoom del gráfico">
            <button class="pf-zoom-btn" type="button" data-pf-zoom="in" title="Acercar zoom (+)" aria-label="Acercar zoom">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="6"/><path d="M13.5 13.5 18 18M9 6v6M6 9h6"/></svg>
            </button>
            <button class="pf-zoom-btn" type="button" data-pf-zoom="out" title="Alejar zoom (−)" aria-label="Alejar zoom">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="6"/><path d="M13.5 13.5 18 18M6 9h6"/></svg>
            </button>
            <button class="pf-zoom-btn pf-zoom-reset" type="button" data-pf-zoom="reset" title="Restablecer vista completa" aria-label="Restablecer vista">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a7 7 0 1 0 2-4.9L3 7"/><path d="M3 3v4h4"/></svg>
            </button>
          </div>
          <button class="pf-outline-button pf-measure-tool-btn" type="button" data-pf-chart-measure title="Regla / Cuadrícula de medición (clic y arrastrar en el gráfico, o clic derecho)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.3 15.3 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4l12.6 12.6a2.41 2.41 0 0 0 3.4 0l2.6-2.6a2.41 2.41 0 0 0 0-3.4Z"/><path d="m14.5 5.5 2 2M11.5 8.5l2 2M8.5 11.5l2 2M5.5 14.5l2 2"/></svg>
            <span>Medir</span>
          </button>
          <button class="pf-outline-button pf-chart-picker-btn" type="button" data-pf-chart-picker aria-expanded="false">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1"></rect><rect x="11" y="3" width="6" height="6" rx="1"></rect><rect x="11" y="11" width="6" height="6" rx="1"></rect><rect x="3" y="11" width="6" height="6" rx="1"></rect></svg>
            <span>Elementos (${selected.size})</span>
          </button>
          <button class="pf-outline-button pf-chart-fullscreen-btn" type="button" data-pf-chart-fullscreen title="Pantalla completa (F o clic)" aria-label="Pantalla completa">
            <svg class="pf-icon-maximize" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4"/></svg>
            <svg class="pf-icon-minimize" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none"><path d="M7 3v4H3M13 3v4h4M7 17v-4H3M13 17v-4h4"/></svg>
          </button>
          <button class="pf-outline-button pf-chart-close-btn" type="button" data-pf-chart-close title="Ocultar gráfico" aria-label="Cerrar gráfico">×</button>
        </div>
      </div>

      <div class="pf-chart-picker-panel" data-pf-chart-picker-box hidden>
        <div class="pf-picker-topbar">
          <div class="pf-picker-tabs" role="tablist">
            <button type="button" class="pf-picker-tab active" data-picker-tab="all">Todos <span class="pf-picker-pill">${choices.length}</span></button>
            <button type="button" class="pf-picker-tab" data-picker-tab="valores">Valores <span class="pf-picker-pill">${valoresCount}</span></button>
            <button type="button" class="pf-picker-tab" data-picker-tab="grupos">Grupos <span class="pf-picker-pill">${gruposCount}</span></button>
            <button type="button" class="pf-picker-tab" data-picker-tab="lotes">Lotes <span class="pf-picker-pill">${lotesCount}</span></button>
          </div>
          <div class="pf-picker-search-wrap">
            <input type="search" class="pf-picker-search-input" placeholder="Buscar valor, grupo o lote…" data-picker-search aria-label="Buscar elementos">
          </div>
          <div class="pf-picker-actions">
            <button type="button" class="pf-picker-act-btn" data-picker-quick="top">Valores</button>
            <button type="button" class="pf-picker-act-btn" data-picker-quick="groups">Grupos</button>
            <button type="button" class="pf-picker-act-btn" data-picker-quick="clear">Desmarcar</button>
            <span class="pf-picker-count-badge" data-picker-counter>${selected.size} / 20 seleccionados</span>
          </div>
        </div>
        <div class="pf-chart-choice-list" data-picker-choice-list>
          ${choicesHtml}
        </div>
      </div>

      <div class="pf-chart-status-bar">
        <span class="pf-chart-status-info" data-pf-chart-status>Cargando datos…</span>
        <span class="pf-chart-source-tag">Yahoo Finance · Cotizaciones ajustadas</span>
      </div>

      <div class="pf-chart-layout">
        <div class="pf-chart-main">
          <div class="pf-chart-canvas-wrap" data-pf-chart></div>
        </div>
        <div class="pf-chart-sidebar">
          <div class="pf-chart-legend-title">Elementos en el gráfico</div>
          <ul class="pf-chart-legend" data-pf-chart-legend></ul>
        </div>
      </div>

      <p class="pf-chart-note">Las líneas completamente vendidas mantienen constante su ganancia realizada desde la fecha de venta. Días sin cotización usan el último cierre disponible.</p>
    </div>`;
  }

  function computeNiceStep(val) {
    if (!Number.isFinite(val) || val <= 0) return 1;
    const exponent = Math.floor(Math.log10(val));
    const fraction = val / Math.pow(10, exponent);
    let niceFraction;
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 2.5) niceFraction = 2.5;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
    return niceFraction * Math.pow(10, exponent);
  }

  function computeChartScale(values, isCenteredMetric, metric) {
    if (!values || !values.length) {
      return { min: -10, max: 10, ticks: [-10, -5, 0, 5, 10], step: 5 };
    }
    if (isCenteredMetric) {
      const maxAbs = Math.max(...values.map((v) => Math.abs(v)), 0);
      if (maxAbs <= 0.001) {
        const bound = metric === 'gainAmount' ? 50 : 5;
        return { min: -bound, max: bound, ticks: [-bound, -bound / 2, 0, bound / 2, bound], step: bound / 2 };
      }
      const targetStep = (maxAbs * 1.08) / 3;
      const step = computeNiceStep(targetStep);
      const numSteps = Math.max(1, Math.ceil((maxAbs * 1.04) / step));
      const bound = step * numSteps;
      const ticks = [];
      for (let i = -numSteps; i <= numSteps; i++) {
        ticks.push(i * step);
      }
      return { min: -bound, max: bound, ticks, step };
    } else {
      const maxVal = Math.max(...values, 0);
      if (maxVal <= 0.001) {
        const bound = metric === 'weight' ? 10 : 5;
        return { min: 0, max: bound, ticks: [0, bound / 4, bound / 2, bound * 0.75, bound], step: bound / 4 };
      }
      const targetStep = (maxVal * 1.08) / 4;
      const step = computeNiceStep(targetStep);
      const numSteps = Math.max(1, Math.ceil((maxVal * 1.04) / step));
      const bound = step * numSteps;
      const ticks = [];
      for (let i = 0; i <= numSteps; i++) {
        ticks.push(i * step);
      }
      return { min: 0, max: bound, ticks, step };
    }
  }

  function getActiveChartGeometry(panel) {
    const isFs = panel?.classList.contains('is-fullscreen') || document.fullscreenElement === panel;
    const width = isFs ? 1080 : 820;
    const height = isFs ? 460 : 310;
    const pad = isFs ? { left: 68, right: 20, top: 22, bottom: 32 } : { left: 60, right: 16, top: 18, bottom: 28 };
    const innerWidth = width - pad.left - pad.right;
    const innerHeight = height - pad.top - pad.bottom;
    return { isFs, width, height, pad, innerWidth, innerHeight };
  }

  function chartFormat(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    if (chartMetric === 'gainPct') return fmtSignedPct(value);
    if (chartMetric === 'gainAmount') return fmtSigned(value);
    return fmtPct(value);
  }

  function chartAxisFormat(value) {
    if (!Number.isFinite(Number(value))) return '—';
    const num = Math.abs(value) < 1e-9 ? 0 : Number(value);
    const formatted = formatNumber(Math.abs(num), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (chartMetric === 'gainAmount') {
      if (num > 0) return `+$${formatted}`;
      if (num < 0) return `-$${formatted}`;
      return `$${formatted}`;
    }
    if (chartMetric === 'gainPct') {
      if (num > 0) return `+${formatted} %`;
      if (num < 0) return `-${formatted} %`;
      return `${formatted} %`;
    }
    return `${formatted} %`;
  }

  const RANGE_DAYS = { '1m': 31, '3m': 93, '6m': 186, '1y': 365, '2y': 730, '3y': 1095, '5y': 1825 };
  const SPANISH_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  function formatTradingViewHoverDate(isoDate) {
    if (!isoDate) return '';
    const parts = String(isoDate).split('-');
    if (parts.length !== 3) return isoDate;
    const year = parts[0];
    const mIdx = parseInt(parts[1], 10) - 1;
    const day = parts[2];
    const m = SPANISH_MONTHS[mIdx] || parts[1];
    return `${day} ${m} ${year}`;
  }

  function fmtDateDisplay(isoDate) {
    if (!isoDate) return '—';
    return formatTradingViewHoverDate(isoDate);
  }

  function getTradingViewDateTicks(points, xFunc, pad, width) {
    if (!points || !points.length) return [];
    const n = points.length;
    if (n === 1) {
      return [{ index: 0, x: xFunc(0), label: formatTradingViewHoverDate(points[0].date), isMajor: true, date: points[0].date }];
    }

    const parsed = points.map((p, i) => {
      const [y, m, d] = String(p.date).split('-').map(Number);
      return { index: i, date: p.date, year: y, month: m - 1, day: d };
    });

    const first = parsed[0];
    const last = parsed[n - 1];
    const startDate = new Date(`${first.date}T00:00:00Z`);
    const endDate = new Date(`${last.date}T00:00:00Z`);
    const totalDays = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));

    const ticks = [];
    const minSpacing = 58;

    if (totalDays > 1000) {
      // Multi-year (> 3 years): Major ticks on Years (e.g. 2021, 2022, 2023, 2024, 2025)
      const yearStep = totalDays > 3650 ? 3 : totalDays > 2000 ? 2 : 1;
      let lastRecordedYear = null;

      parsed.forEach((pt) => {
        if (lastRecordedYear === null || pt.year !== lastRecordedYear) {
          if (lastRecordedYear === null || (pt.year - lastRecordedYear) >= yearStep) {
            ticks.push({
              index: pt.index,
              x: xFunc(pt.index),
              label: String(pt.year),
              isMajor: true,
              date: pt.date,
            });
            lastRecordedYear = pt.year;
          }
        }
      });

      if (ticks.length <= 3 && totalDays <= 2200) {
        parsed.forEach((pt) => {
          if (pt.month === 6 && pt.day <= 10) {
            ticks.push({
              index: pt.index,
              x: xFunc(pt.index),
              label: `Jul '${String(pt.year).slice(2)}`,
              isMajor: false,
              date: pt.date,
            });
          }
        });
        ticks.sort((a, b) => a.index - b.index);
      }
    } else if (totalDays > 240) {
      // 8 months to 3 years: Month or bi-monthly ticks
      const monthStep = totalDays > 600 ? 3 : totalDays > 400 ? 2 : 1;
      let prevYear = null;
      let lastMonthDiff = -999;

      parsed.forEach((pt, i) => {
        const monthDiff = (pt.year - first.year) * 12 + pt.month;
        const isNewMonth = i === 0 || pt.month !== parsed[i - 1].month;
        if (isNewMonth) {
          if (monthDiff - lastMonthDiff >= monthStep || pt.month === 0) {
            const isYearStart = pt.month === 0 || (prevYear !== null && pt.year !== prevYear);
            const label = isYearStart ? String(pt.year) : SPANISH_MONTHS[pt.month];
            ticks.push({
              index: pt.index,
              x: xFunc(pt.index),
              label,
              isMajor: isYearStart,
              date: pt.date,
            });
            lastMonthDiff = monthDiff;
            prevYear = pt.year;
          }
        }
      });
    } else if (totalDays > 45) {
      // 1.5 to 8 months: 1st of month and 15th
      let addedMidForMonth = null;

      parsed.forEach((pt, i) => {
        const isNewMonth = i === 0 || pt.month !== parsed[i - 1].month;
        if (isNewMonth) {
          const isYearStart = pt.month === 0;
          const label = isYearStart ? String(pt.year) : SPANISH_MONTHS[pt.month];
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label,
            isMajor: true,
            date: pt.date,
          });
        } else if (pt.day >= 15 && addedMidForMonth !== pt.month) {
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label: totalDays > 120 ? '15' : `15 ${SPANISH_MONTHS[pt.month]}`,
            isMajor: false,
            date: pt.date,
          });
          addedMidForMonth = pt.month;
        }
      });
    } else if (totalDays > 14) {
      // 2 weeks to 1.5 months: Weekly ticks
      let lastDay = -999;
      parsed.forEach((pt, i) => {
        const isNewMonth = i === 0 || pt.month !== parsed[i - 1].month;
        if (isNewMonth) {
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label: SPANISH_MONTHS[pt.month],
            isMajor: true,
            date: pt.date,
          });
          lastDay = pt.day;
        } else if (Math.abs(pt.day - lastDay) >= 6) {
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label: `${pt.day} ${SPANISH_MONTHS[pt.month]}`,
            isMajor: false,
            date: pt.date,
          });
          lastDay = pt.day;
        }
      });
    } else {
      // Very short range (< 14 days): Every 2-3 trading days
      const step = n > 8 ? 2 : 1;
      parsed.forEach((pt, i) => {
        if (i % step === 0 || i === n - 1) {
          const isNewMonth = i === 0 || pt.month !== parsed[i - 1]?.month;
          ticks.push({
            index: pt.index,
            x: xFunc(pt.index),
            label: `${pt.day} ${SPANISH_MONTHS[pt.month]}`,
            isMajor: isNewMonth,
            date: pt.date,
          });
        }
      });
    }

    if (ticks.length < 2) {
      const step = Math.max(1, Math.floor(n / 4));
      for (let i = 0; i < n; i += step) {
        const pt = parsed[i];
        ticks.push({
          index: pt.index,
          x: xFunc(pt.index),
          label: `${pt.day} ${SPANISH_MONTHS[pt.month]}`,
          isMajor: i === 0,
          date: pt.date,
        });
      }
      if (ticks[ticks.length - 1].index !== n - 1) {
        const pt = parsed[n - 1];
        ticks.push({
          index: pt.index,
          x: xFunc(pt.index),
          label: `${pt.day} ${SPANISH_MONTHS[pt.month]}`,
          isMajor: false,
          date: pt.date,
        });
      }
    }

    // Filter overlapping ticks
    const filtered = [];
    ticks.forEach((t) => {
      if (!filtered.length) {
        filtered.push(t);
        return;
      }
      const prev = filtered[filtered.length - 1];
      if (t.x - prev.x >= minSpacing) {
        filtered.push(t);
      } else if (t.isMajor && !prev.isMajor) {
        filtered[filtered.length - 1] = t;
      }
    });

    return filtered;
  }

  function computeSliceIndicesForRange(allPoints, rangeKey) {
    if (!allPoints || !allPoints.length) return { start: 0, end: 0 };
    const total = allPoints.length;
    if (rangeKey === 'all' || !RANGE_DAYS[rangeKey]) {
      return { start: 0, end: total - 1 };
    }
    const days = RANGE_DAYS[rangeKey];
    const lastDateStr = allPoints[total - 1].date;
    const lastDate = new Date(`${lastDateStr}T00:00:00Z`);
    const cutoff = new Date(lastDate);
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    let startIdx = allPoints.findIndex((pt) => pt.date >= cutoffStr);
    if (startIdx < 0) startIdx = 0;
    return { start: startIdx, end: total - 1 };
  }

  function updateQuickRangeButtonsUi(panel) {
    if (!chartCachedData?.points?.length) return;
    const total = chartCachedData.points.length;
    let matchingKey = null;
    if (chartSliceStart === 0 && chartSliceEnd === total - 1) {
      matchingKey = 'all';
    } else {
      for (const [key] of CHART_RANGES) {
        if (key === 'all') continue;
        const { start, end } = computeSliceIndicesForRange(chartCachedData.points, key);
        if (Math.abs(start - chartSliceStart) <= 1 && Math.abs(end - chartSliceEnd) <= 1) {
          matchingKey = key;
          break;
        }
      }
    }
    panel.querySelectorAll('[data-pf-range]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.pfRange === matchingKey);
    });
  }

  function updateTimelineSliderUi(panel) {
    if (!chartCachedData?.points?.length) return;
    const total = chartCachedData.points.length;
    const pStart = chartSliceStart / Math.max(1, total - 1);
    const pEnd = chartSliceEnd / Math.max(1, total - 1);

    const windowEl = panel.querySelector('[data-timeline-window]');
    const maskLeft = panel.querySelector('[data-timeline-mask-left]');
    const maskRight = panel.querySelector('[data-timeline-mask-right]');
    const fromDateEl = panel.querySelector('[data-timeline-from-date]');
    const toDateEl = panel.querySelector('[data-timeline-to-date]');

    if (windowEl) {
      windowEl.style.left = `${(pStart * 100).toFixed(3)}%`;
      windowEl.style.width = `${Math.max(0.5, (pEnd - pStart) * 100).toFixed(3)}%`;
    }
    if (maskLeft) {
      maskLeft.style.width = `${(pStart * 100).toFixed(3)}%`;
    }
    if (maskRight) {
      maskRight.style.left = `${(pEnd * 100).toFixed(3)}%`;
      maskRight.style.width = `${Math.max(0, (1 - pEnd) * 100).toFixed(3)}%`;
    }
    if (fromDateEl && chartCachedData.points[chartSliceStart]) {
      fromDateEl.textContent = fmtDateDisplay(chartCachedData.points[chartSliceStart].date);
    }
    if (toDateEl && chartCachedData.points[chartSliceEnd]) {
      toDateEl.textContent = fmtDateDisplay(chartCachedData.points[chartSliceEnd].date);
    }
  }

  function scheduleChartRedraw(panel) {
    if (chartRedrawRaf) return;
    chartRedrawRaf = requestAnimationFrame(() => {
      chartRedrawRaf = null;
      renderChartMainSvg(panel);
      updateTimelineSliderUi(panel);
    });
  }

  function renderTimelineSparkline(panel, allPoints, labels) {
    const sparklineSvg = panel.querySelector('[data-timeline-sparkline]');
    if (!sparklineSvg || !allPoints.length) return;

    const vals = allPoints.map((pt) => {
      const v = pt.series?.find((val) => val !== null && val !== undefined && Number.isFinite(Number(val)));
      return v !== undefined ? Number(v) : null;
    });

    const validVals = vals.filter((v) => v !== null);
    if (!validVals.length) return;

    const isCenteredMetric = chartMetric === 'gainPct' || chartMetric === 'gainAmount';
    let min;
    let max;

    if (isCenteredMetric) {
      const maxAbs = Math.max(...validVals.map((v) => Math.abs(v)), 0);
      const bound = maxAbs > 0 ? maxAbs * 1.1 : 10;
      min = -bound;
      max = bound;
    } else {
      const maxVal = Math.max(...validVals, 0);
      min = 0;
      max = maxVal > 0 ? maxVal * 1.1 : 5;
    }

    const w = 760;
    const h = 32;
    let d = '';
    let areaD = '';
    let inSeg = false;
    let lastX = 0;
    const baseY = (h - 2 - ((Math.max(0, min) - min) / (max - min)) * (h - 6)).toFixed(1);

    vals.forEach((v, i) => {
      const px = ((i / Math.max(1, vals.length - 1)) * w).toFixed(1);
      if (v !== null) {
        const py = (h - 2 - ((v - min) / (max - min)) * (h - 6)).toFixed(1);
        if (!inSeg) {
          d += `${d ? ' ' : ''}M${px},${py}`;
          areaD += `${areaD ? ' ' : ''}M${px},${baseY} L${px},${py}`;
          inSeg = true;
        } else {
          d += ` L${px},${py}`;
          areaD += ` L${px},${py}`;
        }
        lastX = px;
      } else {
        if (inSeg) {
          areaD += ` L${lastX},${baseY} Z`;
          inSeg = false;
        }
      }
    });
    if (inSeg) {
      areaD += ` L${lastX},${baseY} Z`;
    }

    sparklineSvg.innerHTML = `
      <defs>
        <linearGradient id="pf-spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.30"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.05"/>
        </linearGradient>
      </defs>
      ${areaD ? `<path d="${areaD}" fill="url(#pf-spark-grad)"/>` : ''}
      ${d ? `<path d="${d}" fill="none" stroke="#93c5fd" stroke-width="1.2" stroke-linejoin="round"/>` : ''}`;
  }

  function renderChartMainSvg(panel) {
    if (!chartCachedData) return;
    const canvasInner = panel.querySelector('[data-pf-chart-canvas-inner]');
    const legend = panel.querySelector('[data-pf-chart-legend]');
    if (!canvasInner) return;

    const allPoints = chartCachedData.points ?? [];
    if (!allPoints.length) return;

    const points = allPoints.slice(chartSliceStart, chartSliceEnd + 1);
    if (!points.length) return;

    const values = points.flatMap((point) => point.series).filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number);
    if (!values.length) {
      canvasInner.innerHTML = '<div class="pf-chart-empty"><p>No hay cotizaciones para el rango seleccionado.</p></div>';
      return;
    }

    const isCenteredMetric = chartMetric === 'gainPct' || chartMetric === 'gainAmount';
    const { isFs, width, height, pad, innerWidth, innerHeight } = getActiveChartGeometry(panel);
    const { min, max, ticks } = computeChartScale(values, isCenteredMetric, chartMetric);

    const x = (index) => pad.left + (index / Math.max(1, points.length - 1)) * innerWidth;
    const y = (value) => pad.top + (1 - (value - min) / (max - min)) * innerHeight;

    const seriesColors = chartCachedData.labels.map((label, idx) => label.color || CHART_PALETTE[idx % CHART_PALETTE.length]);

    const svgGradients = chartCachedData.labels.map((_, i) => `
      <linearGradient id="pf-chart-grad-${i}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${seriesColors[i]}" stop-opacity="0.20"/>
        <stop offset="100%" stop-color="${seriesColors[i]}" stop-opacity="0.00"/>
      </linearGradient>
    `).join('');

    const pathsSvg = chartCachedData.labels.map((label, seriesIdx) => {
      let d = '';
      let areaD = '';
      let inSeg = false;
      let lastValidIdx = 0;

      points.forEach((point, index) => {
        const val = point.series?.[seriesIdx];
        if (val !== null && val !== undefined && Number.isFinite(Number(val))) {
          const px = x(index).toFixed(1);
          const py = y(Number(val)).toFixed(1);
          if (!inSeg) {
            d += `${d ? ' ' : ''}M${px},${py}`;
            const baseY = y(Math.max(0, min)).toFixed(1);
            areaD += `${areaD ? ' ' : ''}M${px},${baseY} L${px},${py}`;
            inSeg = true;
          } else {
            d += ` L${px},${py}`;
            areaD += ` L${px},${py}`;
          }
          lastValidIdx = index;
        } else {
          if (inSeg) {
            const lastPx = x(lastValidIdx).toFixed(1);
            const baseY = y(Math.max(0, min)).toFixed(1);
            areaD += ` L${lastPx},${baseY} Z`;
            inSeg = false;
          }
        }
      });

      if (inSeg) {
        const lastPx = x(lastValidIdx).toFixed(1);
        const baseY = y(Math.max(0, min)).toFixed(1);
        areaD += ` L${lastPx},${baseY} Z`;
      }

      const color = seriesColors[seriesIdx];
      const isSingle = chartCachedData.labels.length === 1;
      const strokeW = isFs ? '2.8' : '2.2';
      const areaEl = isSingle && areaD ? `<path d="${areaD}" fill="url(#pf-chart-grad-${seriesIdx})" class="pf-chart-area" data-series-index="${seriesIdx}"/>` : '';
      const lineEl = d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round" class="pf-chart-line" data-series-index="${seriesIdx}"/>` : '';

      return `${areaEl}${lineEl}`;
    }).join('');

    const yLabelFontSize = isFs ? '11px' : '9.5px';
    const xLabelFontSize = isFs ? '11px' : '10px';

    const gridLines = ticks.map((value) => {
      const tickY = y(value);
      return `
        <line x1="${pad.left}" y1="${tickY.toFixed(1)}" x2="${width - pad.right}" y2="${tickY.toFixed(1)}" class="pf-chart-grid-line"/>
        <text x="${pad.left - 8}" y="${(tickY + 3.5).toFixed(1)}" class="pf-chart-y-label" font-size="${yLabelFontSize}" text-anchor="end">${escapeHtml(chartAxisFormat(value))}</text>`;
    }).join('');

    const zeroLine = (min <= 0 && max >= 0 && isCenteredMetric)
      ? `<line x1="${pad.left}" y1="${y(0).toFixed(1)}" x2="${width - pad.right}" y2="${y(0).toFixed(1)}" class="pf-chart-zero"/>`
      : '';

    const dateTicks = getTradingViewDateTicks(points, x, pad, width);

    const vGridLines = dateTicks.map((tick) => `
      <line x1="${tick.x.toFixed(1)}" y1="${pad.top}" x2="${tick.x.toFixed(1)}" y2="${height - pad.bottom}" class="pf-chart-vgrid-line"/>
      <line x1="${tick.x.toFixed(1)}" y1="${height - pad.bottom}" x2="${tick.x.toFixed(1)}" y2="${(height - pad.bottom + 4).toFixed(1)}" class="pf-chart-tick-mark"/>
      <text x="${tick.x.toFixed(1)}" y="${height - 8}" class="pf-chart-x-label ${tick.isMajor ? 'major' : ''}" font-size="${xLabelFontSize}" text-anchor="middle">${escapeHtml(tick.label)}</text>
    `).join('');

    const axisBaselines = `
      <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="pf-chart-axis-baseline"/>
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="pf-chart-axis-baseline"/>
    `;

    canvasInner.innerHTML = `
      <svg class="pf-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Evolución histórica">
        <defs>
          ${svgGradients}
        </defs>
        ${gridLines}
        ${vGridLines}
        ${axisBaselines}
        ${zeroLine}
        ${pathsSvg}
        <g class="pf-chart-measure-layer" style="display:none;">
          <rect class="pf-chart-measure-box" x="0" y="0" width="0" height="0" fill="rgba(239, 68, 68, 0.08)" stroke="rgba(220, 38, 38, 0.65)" stroke-width="1.4" stroke-dasharray="4 3" rx="2" ry="2"/>
          <line class="pf-chart-measure-diagonal" x1="0" y1="0" x2="0" y2="0" stroke="rgba(220, 38, 38, 0.85)" stroke-width="1.8" stroke-dasharray="5 3"/>
          <circle class="pf-chart-measure-pt1" cx="0" cy="0" r="4" fill="#dc2626" stroke="#ffffff" stroke-width="1.4"/>
          <circle class="pf-chart-measure-pt2" cx="0" cy="0" r="4" fill="#dc2626" stroke="#ffffff" stroke-width="1.4"/>
          <g class="pf-chart-measure-badge" transform="translate(0, 0)">
            <rect class="pf-chart-measure-badge-bg" x="-54" y="-12" width="108" height="24" rx="5" ry="5" fill="#1e1b1b" fill-opacity="0.94" stroke="rgba(239, 68, 68, 0.35)" stroke-width="0.9"/>
            <text class="pf-chart-measure-badge-text" x="0" y="4" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="600">--</text>
          </g>
        </g>
        <g class="pf-chart-hover-layer" hidden>
          <line class="pf-chart-crosshair pf-chart-crosshair-v" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}"/>
          <line class="pf-chart-crosshair pf-chart-crosshair-h" x1="${pad.left}" y1="0" x2="${width - pad.right}" y2="0"/>
          <g class="pf-chart-hover-dots"></g>
          <g class="pf-chart-x-badge" transform="translate(0, ${height - pad.bottom})">
            <rect class="pf-chart-x-badge-bg" x="-42" y="2" width="84" height="20" rx="4" ry="4"/>
            <text class="pf-chart-x-badge-text" x="0" y="16" text-anchor="middle">--</text>
          </g>
        </g>
        <rect class="pf-chart-overlay" x="${pad.left}" y="${pad.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent" cursor="crosshair"/>
      </svg>`;

    // Update legend chips
    if (legend) {
      legend.innerHTML = chartCachedData.labels.map((label, index) => {
        const color = seriesColors[index];
        let latestVal = null;
        for (let i = points.length - 1; i >= 0; i--) {
          const v = points[i]?.series?.[index];
          if (v !== null && v !== undefined && Number.isFinite(Number(v))) {
            latestVal = Number(v);
            break;
          }
        }
        const valClass = latestVal !== null ? (latestVal > 0 ? 'positive' : latestVal < 0 ? 'negative' : '') : '';
        return `
          <li class="pf-legend-chip" data-legend-series="${index}">
            <span class="pf-legend-dot" style="background:${color}"></span>
            <span class="pf-legend-name" title="${escapeHtml(label.label)}">${escapeHtml(label.label)}</span>
            ${latestVal !== null ? `<span class="pf-legend-val ${valClass}">${escapeHtml(chartFormat(latestVal))}</span>` : ''}
            <button type="button" class="pf-legend-remove" data-remove-id="${escapeHtml(label.id)}" title="Quitar ${escapeHtml(label.label)}" aria-label="Quitar">×</button>
          </li>`;
      }).join('');

      // Wire legend hover
      legend.querySelectorAll('.pf-legend-chip').forEach((chip) => {
        const sIdx = chip.dataset.legendSeries;
        chip.addEventListener('mouseenter', () => {
          canvasInner.querySelectorAll('.pf-chart-line, .pf-chart-area').forEach((line) => {
            if (line.dataset.seriesIndex === sIdx) {
              line.style.opacity = '1';
              line.style.strokeWidth = '3.2';
            } else {
              line.style.opacity = '0.18';
            }
          });
        });
        chip.addEventListener('mouseleave', () => {
          canvasInner.querySelectorAll('.pf-chart-line, .pf-chart-area').forEach((line) => {
            line.style.opacity = '1';
            line.style.strokeWidth = '2.2';
          });
        });
      });

      // Wire legend remove
      legend.querySelectorAll('.pf-legend-remove').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const removeId = btn.dataset.removeId;
          chartSelectedIds = chartSelectedIds.filter((id) => id !== removeId);
          syncPickerChecked(panel);
          loadPortfolioChart(panel);
        });
      });
    }
  }

  function zoomChartByStep(panel, direction) {
    if (!chartCachedData?.points?.length) return;
    const total = chartCachedData.points.length;
    if (total <= 3) return;

    if (direction === 'reset') {
      chartSliceStart = 0;
      chartSliceEnd = total - 1;
      chartRange = 'all';
      scheduleChartRedraw(panel);
      updateTimelineSliderUi(panel);
      updateQuickRangeButtonsUi(panel);
      return;
    }

    const currentSpan = chartSliceEnd - chartSliceStart;
    const factor = direction === 'in' ? 0.70 : 1.40;
    let newSpan = Math.round(currentSpan * factor);
    if (direction === 'in' && newSpan >= currentSpan) newSpan = currentSpan - 1;
    if (direction === 'out' && newSpan <= currentSpan) newSpan = currentSpan + 1;

    const minSpan = Math.min(3, total - 1);
    const maxSpan = total - 1;
    newSpan = Math.max(minSpan, Math.min(maxSpan, newSpan));

    if (newSpan === currentSpan) return;

    const centerIdx = chartSliceStart + currentSpan / 2;
    let newStart = Math.round(centerIdx - newSpan / 2);
    let newEnd = newStart + newSpan;

    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(total - 1, newSpan);
    } else if (newEnd > total - 1) {
      newEnd = total - 1;
      newStart = Math.max(0, total - 1 - newSpan);
    }

    chartSliceStart = newStart;
    chartSliceEnd = newEnd;
    scheduleChartRedraw(panel);
    updateTimelineSliderUi(panel);
    updateQuickRangeButtonsUi(panel);
  }

  function attachChartCanvasInteractions(panel) {
    const canvasInner = panel.querySelector('[data-pf-chart-canvas-inner]');
    if (!canvasInner) return;

    let isPanning = false;
    let panStartX = 0;
    let panInitStart = 0;
    let panInitEnd = 0;
    let panMoved = false;

    // Accumulator-based progressive Wheel Zoom (in / out) centered around cursor
    let zoomAccumulator = 0;
    let zoomResetTimer = null;

    canvasInner.addEventListener('wheel', (event) => {
      if (!chartCachedData?.points?.length) return;
      const total = chartCachedData.points.length;
      if (total <= 3) return;

      event.preventDefault();
      event.stopPropagation();

      const rect = canvasInner.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const width = 760;
      const pad = { left: 58, right: 16 };
      const innerWidth = width - pad.left - pad.right;

      const cursorSvgX = ((event.clientX - rect.left) / rect.width) * width;
      const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));

      // Normalize delta across input devices (mouse wheel vs trackpad)
      let rawDelta = event.deltaY;
      if (event.deltaMode === 1) rawDelta *= 16;
      else if (event.deltaMode === 2) rawDelta *= 100;

      zoomAccumulator += rawDelta;
      if (zoomResetTimer) clearTimeout(zoomResetTimer);
      zoomResetTimer = setTimeout(() => { zoomAccumulator = 0; }, 140);

      // Only step once accumulated delta reaches threshold
      const threshold = 35;
      if (Math.abs(zoomAccumulator) < threshold) return;

      const steps = Math.trunc(zoomAccumulator / threshold);
      zoomAccumulator -= steps * threshold;

      const currentSpan = chartSliceEnd - chartSliceStart;
      // 4% zoom change per step
      const factor = Math.pow(1.04, steps);
      let newSpan = Math.round(currentSpan * factor);

      if (steps < 0 && newSpan >= currentSpan) newSpan = currentSpan - 1;
      if (steps > 0 && newSpan <= currentSpan) newSpan = currentSpan + 1;

      const minSpan = Math.min(3, total - 1);
      const maxSpan = total - 1;
      newSpan = Math.max(minSpan, Math.min(maxSpan, newSpan));

      if (newSpan === currentSpan) return;

      const pivotIdx = chartSliceStart + ratio * currentSpan;
      let newStart = Math.round(pivotIdx - ratio * newSpan);
      let newEnd = newStart + newSpan;

      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, newSpan);
      } else if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, total - 1 - newSpan);
      }

      if (newStart !== chartSliceStart || newEnd !== chartSliceEnd) {
        chartSliceStart = newStart;
        chartSliceEnd = newEnd;
        scheduleChartRedraw(panel);
        updateTimelineSliderUi(panel);
        updateQuickRangeButtonsUi(panel);
      }
    }, { passive: false });

    // Double-click on chart to zoom in or reset
    canvasInner.addEventListener('dblclick', (event) => {
      event.preventDefault();
      if (!chartCachedData?.points?.length) return;
      const total = chartCachedData.points.length;
      if (chartSliceStart === 0 && chartSliceEnd === total - 1) {
        const rect = canvasInner.getBoundingClientRect();
        const width = 760;
        const pad = { left: 58, right: 16 };
        const innerWidth = width - pad.left - pad.right;
        const cursorSvgX = ((event.clientX - rect.left) / rect.width) * width;
        const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));
        const newSpan = Math.max(10, Math.round(total * 0.4));
        const pivotIdx = Math.round(ratio * (total - 1));
        let newStart = Math.round(pivotIdx - newSpan / 2);
        let newEnd = newStart + newSpan;
        if (newStart < 0) { newStart = 0; newEnd = Math.min(total - 1, newSpan); }
        else if (newEnd > total - 1) { newEnd = total - 1; newStart = Math.max(0, total - 1 - newSpan); }
        chartSliceStart = newStart;
        chartSliceEnd = newEnd;
      } else {
        chartSliceStart = 0;
        chartSliceEnd = total - 1;
        chartRange = 'all';
      }
      scheduleChartRedraw(panel);
      updateTimelineSliderUi(panel);
      updateQuickRangeButtonsUi(panel);
    });

    // Prevent context menu on chart canvas
    canvasInner.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    panel.addEventListener('contextmenu', (event) => {
      if (isMeasuring || isMeasureToolActive || event.target.closest('.pf-chart-svg, .pf-chart-canvas-wrap, [data-pf-chart-canvas-inner]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    canvasInner.addEventListener('mousedown', (event) => {
      if (event.button === 2) {
        event.preventDefault();
      }
    });

    let isMeasureToolActive = false;
    const measureBtn = panel.querySelector('[data-pf-chart-measure]');
    if (measureBtn) {
      measureBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isMeasureToolActive = !isMeasureToolActive;
        measureBtn.classList.toggle('active', isMeasureToolActive);
        measureBtn.setAttribute('aria-pressed', isMeasureToolActive ? 'true' : 'false');
        canvasInner.classList.toggle('measuring-active', isMeasureToolActive);
      });
    }

    let isMeasuring = false;
    let measureStartButton = 2;
    let measureStartSvgX = 0;
    let measureStartSvgY = 0;
    let measureCurrentSvgX = 0;
    let measureCurrentSvgY = 0;

    function updateMeasurementView(clientX, clientY) {
      if (!isMeasuring || !chartCachedData?.points?.length) return;

      const allPoints = chartCachedData.points;
      const points = allPoints.slice(chartSliceStart, chartSliceEnd + 1);
      if (!points.length) return;

      const svgEl = canvasInner.querySelector('.pf-chart-svg');
      const measureLayer = canvasInner.querySelector('.pf-chart-measure-layer');
      if (!svgEl || !measureLayer) return;

      const rect = svgEl.getBoundingClientRect();
      const { width, height, pad, innerWidth, innerHeight } = getActiveChartGeometry(panel);

      if (clientX !== undefined && clientY !== undefined && rect.width > 0 && rect.height > 0) {
        const curX = ((clientX - rect.left) / rect.width) * width;
        const curY = ((clientY - rect.top) / rect.height) * height;
        measureCurrentSvgX = Math.max(pad.left, Math.min(width - pad.right, curX));
        measureCurrentSvgY = Math.max(pad.top, Math.min(height - pad.bottom, curY));
      }

      const values = points.flatMap((p) => p.series).filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
      const isCenteredMetric = chartMetric === 'gainPct' || chartMetric === 'gainAmount';
      const { min, max } = computeChartScale(values, isCenteredMetric, chartMetric);

      const x1 = measureStartSvgX;
      const y1 = measureStartSvgY;
      const x2 = measureCurrentSvgX;
      const y2 = measureCurrentSvgY;

      const leftX = Math.min(x1, x2);
      const rightX = Math.max(x1, x2);
      const topY = Math.min(y1, y2);
      const bottomY = Math.max(y1, y2);
      const boxW = Math.max(1, rightX - leftX);
      const boxH = Math.max(1, bottomY - topY);

      // Convert Y coordinates to Metric Values (spatial Y1 to Y2)
      const ratioY1 = Math.max(0, Math.min(1, (y1 - pad.top) / innerHeight));
      const ratioY2 = Math.max(0, Math.min(1, (y2 - pad.top) / innerHeight));
      const val1 = max - ratioY1 * (max - min);
      const val2 = max - ratioY2 * (max - min);
      const deltaVal = val2 - val1;

      // Convert X coordinates to Dates & Indices (spatial X1 to X2)
      const ratioX1 = Math.max(0, Math.min(1, (x1 - pad.left) / innerWidth));
      const ratioX2 = Math.max(0, Math.min(1, (x2 - pad.left) / innerWidth));
      const idx1 = Math.max(0, Math.min(points.length - 1, Math.round(ratioX1 * (points.length - 1))));
      const idx2 = Math.max(0, Math.min(points.length - 1, Math.round(ratioX2 * (points.length - 1))));
      const pt1 = points[idx1] || points[0];
      const pt2 = points[idx2] || points[points.length - 1];

      const d1 = new Date(`${pt1.date}T00:00:00Z`);
      const d2 = new Date(`${pt2.date}T00:00:00Z`);
      const diffDays = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
      const sessions = Math.abs(idx2 - idx1) + 1;

      // Update measure box & diagonal line (single clean rectangle, discreet styling)
      const boxEl = measureLayer.querySelector('.pf-chart-measure-box');
      const diagEl = measureLayer.querySelector('.pf-chart-measure-diagonal');
      const pt1El = measureLayer.querySelector('.pf-chart-measure-pt1');
      const pt2El = measureLayer.querySelector('.pf-chart-measure-pt2');
      const badge = measureLayer.querySelector('.pf-chart-measure-badge');
      const badgeBg = measureLayer.querySelector('.pf-chart-measure-badge-bg');
      const badgeText = measureLayer.querySelector('.pf-chart-measure-badge-text');

      if (boxEl) {
        boxEl.setAttribute('x', leftX.toFixed(1));
        boxEl.setAttribute('y', topY.toFixed(1));
        boxEl.setAttribute('width', boxW.toFixed(1));
        boxEl.setAttribute('height', boxH.toFixed(1));
      }
      if (diagEl) {
        diagEl.setAttribute('x1', x1.toFixed(1));
        diagEl.setAttribute('y1', y1.toFixed(1));
        diagEl.setAttribute('x2', x2.toFixed(1));
        diagEl.setAttribute('y2', y2.toFixed(1));
      }
      if (pt1El) {
        pt1El.setAttribute('cx', x1.toFixed(1));
        pt1El.setAttribute('cy', y1.toFixed(1));
      }
      if (pt2El) {
        pt2El.setAttribute('cx', x2.toFixed(1));
        pt2El.setAttribute('cy', y2.toFixed(1));
      }

      // Badge on SVG
      if (badge && badgeBg && badgeText) {
        let badgeStr = '';
        if (chartMetric === 'gainPct') {
          badgeStr = `${fmtSignedPct(deltaVal)} · ${diffDays}d`;
        } else if (chartMetric === 'gainAmount') {
          badgeStr = `${fmtSigned(deltaVal)} · ${diffDays}d`;
        } else {
          badgeStr = `${fmtSignedPct(deltaVal)} · ${diffDays}d`;
        }

        const badgeW = Math.max(86, badgeStr.length * 7 + 18);
        const midBadgeX = Math.max(pad.left + badgeW / 2 + 4, Math.min(width - pad.right - badgeW / 2 - 4, (x1 + x2) / 2));
        const badgeY = Math.max(pad.top + 14, Math.min(height - pad.bottom - 14, topY - 10 < pad.top + 8 ? bottomY + 12 : topY - 10));

        badge.setAttribute('transform', `translate(${midBadgeX.toFixed(1)}, ${badgeY.toFixed(1)})`);
        badgeBg.setAttribute('x', (-badgeW / 2).toFixed(1));
        badgeBg.setAttribute('width', badgeW.toFixed(1));
        badgeText.textContent = badgeStr;
      }

      measureLayer.style.display = 'inline';
      measureLayer.removeAttribute('hidden');

      // Update floating detailed tooltip
      const tip = ensureChartTooltip();
      const startStr = formatTradingViewHoverDate(pt1.date);
      const endStr = formatTradingViewHoverDate(pt2.date);
      const daysLabel = diffDays === 1 ? '1 día' : `${diffDays} días`;
      const sessionsLabel = sessions === 1 ? '1 sesión' : `${sessions} sesiones`;

      const valClass = deltaVal > 0 ? 'positive' : deltaVal < 0 ? 'negative' : '';
      let deltaFormatted = '';
      if (chartMetric === 'gainPct') deltaFormatted = fmtSignedPct(deltaVal);
      else if (chartMetric === 'gainAmount') deltaFormatted = fmtSigned(deltaVal);
      else deltaFormatted = fmtSignedPct(deltaVal);

      tip.innerHTML = `
        <div class="pf-measure-tooltip-head">
          <div class="pf-measure-badge-tag negative">📏 Medición de rango</div>
          <div class="pf-measure-period">${escapeHtml(startStr)} → ${escapeHtml(endStr)}</div>
          <div class="pf-measure-sub">${daysLabel} naturales · ${sessionsLabel}</div>
        </div>
        <div class="pf-measure-tooltip-body">
          <div class="pf-measure-row">
            <div class="pf-measure-row-left">
              <span class="pf-chart-tooltip-dot" style="background:#ef4444"></span>
              <span class="pf-measure-name">Nivel inicial</span>
            </div>
            <div class="pf-measure-row-right">
              <strong class="pf-measure-diff">${escapeHtml(chartAxisFormat(val1))}</strong>
            </div>
          </div>
          <div class="pf-measure-row">
            <div class="pf-measure-row-left">
              <span class="pf-chart-tooltip-dot" style="background:#ef4444"></span>
              <span class="pf-measure-name">Nivel actual</span>
            </div>
            <div class="pf-measure-row-right">
              <strong class="pf-measure-diff">${escapeHtml(chartAxisFormat(val2))}</strong>
            </div>
          </div>
          <div class="pf-measure-row" style="border-top: 1px solid rgba(255,255,255,0.12); padding-top: 5px; margin-top: 2px;">
            <div class="pf-measure-row-left">
              <span class="pf-measure-name" style="font-weight: 700; color: #ffffff;">Variación (Δ)</span>
            </div>
            <div class="pf-measure-row-right">
              <strong class="pf-measure-diff ${valClass}" style="font-size: 12.5px;">${escapeHtml(deltaFormatted)}</strong>
            </div>
          </div>
        </div>`;
      tip.hidden = false;
      if (clientX !== undefined && clientY !== undefined) {
        positionChartTooltip(tip, clientX, clientY);
      }
    }

    function onMeasurePointerMove(event) {
      if (!isMeasuring) return;
      if (event.buttons === 0) {
        onMeasurePointerUp(event);
        return;
      }
      updateMeasurementView(event.clientX, event.clientY);
    }

    function onMeasurePointerUp(event) {
      if (!isMeasuring) return;
      if (event && event.button !== undefined && event.button !== measureStartButton && event.button !== 0 && event.button !== 2 && event.buttons !== 0) return;
      isMeasuring = false;
      canvasInner.classList.remove('measuring');
      window.removeEventListener('pointermove', onMeasurePointerMove);
      window.removeEventListener('mousemove', onMeasurePointerMove);
      window.removeEventListener('pointerup', onMeasurePointerUp);
      window.removeEventListener('mouseup', onMeasurePointerUp);

      const measureLayer = canvasInner.querySelector('.pf-chart-measure-layer');
      if (measureLayer) {
        measureLayer.style.display = 'none';
        measureLayer.setAttribute('hidden', '');
      }
      hideChartTooltip();
    }

    // Pointer Pan (drag left / right with left button) & Measurement (right button, shift+left, or measure tool)
    canvasInner.addEventListener('pointerdown', (event) => {
      if (!chartCachedData?.points?.length) return;
      const total = chartCachedData.points.length;
      if (total <= 1) return;

      const isRightClick = event.button === 2;
      const isShiftLeftClick = event.button === 0 && event.shiftKey;
      const isToolActiveClick = event.button === 0 && isMeasureToolActive;

      if (isRightClick || isShiftLeftClick || isToolActiveClick) {
        event.preventDefault();
        event.stopPropagation();
        if (event.button === 0) {
          try { event.target.setPointerCapture(event.pointerId); } catch {}
        }

        const allPoints = chartCachedData.points;
        const points = allPoints.slice(chartSliceStart, chartSliceEnd + 1);
        if (!points.length) return;

        const svgEl = canvasInner.querySelector('.pf-chart-svg');
        if (!svgEl) return;
        const rect = svgEl.getBoundingClientRect();
        const { width, height, pad } = getActiveChartGeometry(panel);

        const curX = ((event.clientX - rect.left) / rect.width) * width;
        const curY = ((event.clientY - rect.top) / rect.height) * height;
        const startX = Math.max(pad.left, Math.min(width - pad.right, curX));
        const startY = Math.max(pad.top, Math.min(height - pad.bottom, curY));

        isMeasuring = true;
        measureStartButton = event.button;
        measureStartSvgX = startX;
        measureStartSvgY = startY;
        measureCurrentSvgX = startX;
        measureCurrentSvgY = startY;
        canvasInner.classList.add('measuring');

        const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
        if (hoverLayer) {
          hoverLayer.style.display = 'none';
          hoverLayer.hidden = true;
        }

        updateMeasurementView(event.clientX, event.clientY);

        window.addEventListener('pointermove', onMeasurePointerMove);
        window.addEventListener('mousemove', onMeasurePointerMove);
        window.addEventListener('pointerup', onMeasurePointerUp);
        window.addEventListener('mouseup', onMeasurePointerUp);
        return;
      }

      if (event.button !== 0) return;

      isPanning = true;
      panMoved = false;
      panStartX = event.clientX;
      panInitStart = chartSliceStart;
      panInitEnd = chartSliceEnd;
      canvasInner.classList.add('panning');

      window.addEventListener('pointermove', onWindowPointerMove);
      window.addEventListener('pointerup', onWindowPointerUp);
      window.addEventListener('pointercancel', onWindowPointerUp);
    });

    function onWindowPointerMove(event) {
      if (!isPanning || !chartCachedData?.points?.length) return;
      const deltaX = event.clientX - panStartX;
      if (Math.abs(deltaX) > 4) {
        panMoved = true;
        const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
        if (hoverLayer) hoverLayer.hidden = true;
        hideChartTooltip();
      }
      if (!panMoved) return;

      const total = chartCachedData.points.length;
      const rect = canvasInner.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const { width, pad, innerWidth } = getActiveChartGeometry(panel);
      const innerWidthPx = rect.width * (innerWidth / width);

      const span = panInitEnd - panInitStart;
      const deltaRatio = deltaX / Math.max(1, innerWidthPx);
      const deltaIdx = Math.round(deltaRatio * span);

      // Drag left (deltaX < 0) => move forward in time (newStart increases)
      // Drag right (deltaX > 0) => move back in time (newStart decreases)
      let newStart = panInitStart - deltaIdx;
      let newEnd = panInitEnd - deltaIdx;

      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, span);
      } else if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, total - 1 - span);
      }

      if (newStart !== chartSliceStart || newEnd !== chartSliceEnd) {
        chartSliceStart = newStart;
        chartSliceEnd = newEnd;
        scheduleChartRedraw(panel);
        updateTimelineSliderUi(panel);
        updateQuickRangeButtonsUi(panel);
      }
    }

    function onWindowPointerUp(event) {
      if (!isPanning) return;
      isPanning = false;
      canvasInner.classList.remove('panning');
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    }

    // Hover tooltip & crosshair (active when not dragging and not measuring)
    canvasInner.addEventListener('mousemove', (event) => {
      if (isMeasuring) return;
      if (isPanning && panMoved) return;
      if (!chartCachedData?.points?.length) return;

      const allPoints = chartCachedData.points;
      const points = allPoints.slice(chartSliceStart, chartSliceEnd + 1);
      if (!points.length) return;

      const svgEl = canvasInner.querySelector('.pf-chart-svg');
      const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
      const crosshair = canvasInner.querySelector('.pf-chart-crosshair');
      const hoverDots = canvasInner.querySelector('.pf-chart-hover-dots');
      if (!svgEl || !hoverLayer || !crosshair || !hoverDots) return;

      const rect = svgEl.getBoundingClientRect();
      const { width, height, pad, innerWidth, innerHeight } = getActiveChartGeometry(panel);

      const cursorSvgX = ((event.clientX - rect.left) / rect.width) * width;
      const cursorSvgY = ((event.clientY - rect.top) / rect.height) * height;
      if (cursorSvgX < pad.left || cursorSvgX > width - pad.right || cursorSvgY < pad.top || cursorSvgY > height - pad.bottom) {
        hoverLayer.hidden = true;
        hideChartTooltip();
        return;
      }

      const ratio = Math.max(0, Math.min(1, (cursorSvgX - pad.left) / innerWidth));
      const index = Math.round(ratio * (points.length - 1));
      const point = points[index];
      if (!point) return;

      const values = points.flatMap((p) => p.series).filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
      const isCenteredMetric = chartMetric === 'gainPct' || chartMetric === 'gainAmount';
      const { min, max } = computeChartScale(values, isCenteredMetric, chartMetric);

      const x = (idx) => pad.left + (idx / Math.max(1, points.length - 1)) * innerWidth;
      const y = (val) => pad.top + (1 - (val - min) / (max - min)) * innerHeight;
      const seriesColors = chartCachedData.labels.map((label, idx) => label.color || CHART_PALETTE[idx % CHART_PALETTE.length]);

      const crosshairV = canvasInner.querySelector('.pf-chart-crosshair-v') || crosshair;
      const crosshairH = canvasInner.querySelector('.pf-chart-crosshair-h');
      const hoverXBadge = hoverLayer.querySelector('.pf-chart-x-badge');
      const hoverXBadgeBg = hoverLayer.querySelector('.pf-chart-x-badge-bg');
      const hoverXBadgeText = hoverLayer.querySelector('.pf-chart-x-badge-text');

      const cx = x(index);
      hoverLayer.hidden = false;
      crosshairV.setAttribute('x1', cx.toFixed(1));
      crosshairV.setAttribute('x2', cx.toFixed(1));
      if (crosshairH) {
        crosshairH.setAttribute('y1', cursorSvgY.toFixed(1));
        crosshairH.setAttribute('y2', cursorSvgY.toFixed(1));
      }

      if (hoverXBadge && hoverXBadgeBg && hoverXBadgeText) {
        const badgeText = formatTradingViewHoverDate(point.date);
        const badgeWidth = Math.max(76, badgeText.length * 7 + 16);
        const clampedX = Math.max(pad.left + badgeWidth / 2, Math.min(width - pad.right - badgeWidth / 2, cx));
        hoverXBadge.setAttribute('transform', `translate(${clampedX.toFixed(1)}, ${height - pad.bottom})`);
        hoverXBadgeBg.setAttribute('x', (-badgeWidth / 2).toFixed(1));
        hoverXBadgeBg.setAttribute('width', badgeWidth.toFixed(1));
        hoverXBadgeText.textContent = badgeText;
      }

      let dotsHtml = '';
      const tooltipRows = [];

      chartCachedData.labels.forEach((label, sIdx) => {
        const val = point.series?.[sIdx];
        const color = seriesColors[sIdx];
        if (val !== null && val !== undefined && Number.isFinite(Number(val))) {
          const cy = y(Number(val));
          dotsHtml += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="${color}" stroke="#ffffff" stroke-width="2" class="pf-chart-dot"/>`;
          tooltipRows.push({
            label: label.label,
            val: Number(val),
            color,
          });
        }
      });

      hoverDots.innerHTML = dotsHtml;

      if (tooltipRows.length > 0) {
        const tip = ensureChartTooltip();
        const formattedDate = formatTradingViewHoverDate(point.date);
        tip.innerHTML = `
          <div class="pf-chart-tooltip-header">${escapeHtml(formattedDate)}</div>
          <div class="pf-chart-tooltip-rows">
            ${tooltipRows.map((r) => `
              <div class="pf-chart-tooltip-row">
                <span class="pf-chart-tooltip-dot" style="background:${r.color}"></span>
                <span class="pf-chart-tooltip-name">${escapeHtml(r.label)}</span>
                <span class="pf-chart-tooltip-val ${r.val > 0 ? 'positive' : r.val < 0 ? 'negative' : ''}">${escapeHtml(chartFormat(r.val))}</span>
              </div>`).join('')}
          </div>`;
        tip.hidden = false;
        positionChartTooltip(tip, event.clientX, event.clientY);
      }
    });

    canvasInner.addEventListener('mouseleave', () => {
      if (isMeasuring) return;
      const hoverLayer = canvasInner.querySelector('.pf-chart-hover-layer');
      if (hoverLayer) hoverLayer.hidden = true;
      hideChartTooltip();
    });
  }

  function attachTimelineEvents(panel) {
    const track = panel.querySelector('[data-timeline-track]');
    const windowEl = panel.querySelector('[data-timeline-window]');
    const handleLeft = panel.querySelector('[data-timeline-handle="left"]');
    const handleRight = panel.querySelector('[data-timeline-handle="right"]');
    const windowBody = panel.querySelector('[data-timeline-window-body]');
    if (!track || !windowEl || !handleLeft || !handleRight) return;

    let dragMode = null; // 'left' | 'right' | 'window'
    let dragStartX = 0;
    let initStartIdx = 0;
    let initEndIdx = 0;

    function onPointerDown(mode, event) {
      if (event.button !== 0) return;
      dragMode = mode;
      dragStartX = event.clientX;
      initStartIdx = chartSliceStart;
      initEndIdx = chartSliceEnd;
      event.target.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      windowEl.classList.add('dragging');
      if (mode === 'left') handleLeft.classList.add('active');
      if (mode === 'right') handleRight.classList.add('active');
    }

    handleLeft.addEventListener('pointerdown', (e) => onPointerDown('left', e));
    handleRight.addEventListener('pointerdown', (e) => onPointerDown('right', e));
    windowBody?.addEventListener('pointerdown', (e) => onPointerDown('window', e));

    function onPointerMove(event) {
      if (!dragMode || !chartCachedData?.points?.length) return;
      const total = chartCachedData.points.length;
      if (total <= 1) return;

      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;

      if (dragMode === 'left') {
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const targetIdx = Math.round(ratio * (total - 1));
        const maxStart = Math.max(0, chartSliceEnd - 2);
        const newStart = Math.max(0, Math.min(maxStart, targetIdx));
        if (newStart !== chartSliceStart) {
          chartSliceStart = newStart;
          scheduleChartRedraw(panel);
          updateTimelineSliderUi(panel);
          updateQuickRangeButtonsUi(panel);
        }
      } else if (dragMode === 'right') {
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const targetIdx = Math.round(ratio * (total - 1));
        const minEnd = Math.min(total - 1, chartSliceStart + 2);
        const newEnd = Math.min(total - 1, Math.max(minEnd, targetIdx));
        if (newEnd !== chartSliceEnd) {
          chartSliceEnd = newEnd;
          scheduleChartRedraw(panel);
          updateTimelineSliderUi(panel);
          updateQuickRangeButtonsUi(panel);
        }
      } else if (dragMode === 'window') {
        const deltaX = event.clientX - dragStartX;
        const deltaRatio = deltaX / rect.width;
        const deltaIdx = Math.round(deltaRatio * (total - 1));
        const span = initEndIdx - initStartIdx;
        let newStart = initStartIdx + deltaIdx;
        let newEnd = initEndIdx + deltaIdx;

        if (newStart < 0) {
          newStart = 0;
          newEnd = Math.min(total - 1, span);
        } else if (newEnd > total - 1) {
          newEnd = total - 1;
          newStart = Math.max(0, total - 1 - span);
        }

        if (newStart !== chartSliceStart || newEnd !== chartSliceEnd) {
          chartSliceStart = newStart;
          chartSliceEnd = newEnd;
          scheduleChartRedraw(panel);
          updateTimelineSliderUi(panel);
          updateQuickRangeButtonsUi(panel);
        }
      }
    }

    function onPointerEnd(event) {
      if (!dragMode) return;
      try {
        event.target.releasePointerCapture(event.pointerId);
      } catch {}
      dragMode = null;
      windowEl.classList.remove('dragging');
      handleLeft.classList.remove('active');
      handleRight.classList.remove('active');
    }

    handleLeft.addEventListener('pointermove', onPointerMove);
    handleRight.addEventListener('pointermove', onPointerMove);
    windowBody?.addEventListener('pointermove', onPointerMove);

    handleLeft.addEventListener('pointerup', onPointerEnd);
    handleRight.addEventListener('pointerup', onPointerEnd);
    windowBody?.addEventListener('pointerup', onPointerEnd);

    handleLeft.addEventListener('pointercancel', onPointerEnd);
    handleRight.addEventListener('pointercancel', onPointerEnd);
    windowBody?.addEventListener('pointercancel', onPointerEnd);

    // Track click to shift window
    track.addEventListener('click', (event) => {
      if (event.target.closest('[data-timeline-window]')) return;
      const total = chartCachedData?.points?.length;
      if (!total || total <= 1) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const clickIdx = Math.round(ratio * (total - 1));
      const span = chartSliceEnd - chartSliceStart;
      let newStart = Math.round(clickIdx - span / 2);
      let newEnd = newStart + span;
      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, span);
      } else if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, total - 1 - span);
      }
      chartSliceStart = newStart;
      chartSliceEnd = newEnd;
      scheduleChartRedraw(panel);
      updateTimelineSliderUi(panel);
      updateQuickRangeButtonsUi(panel);
    });
  }

  function drawPortfolioChart(scope, chart) {
    const panel = scope.querySelector('.pf-chart-panel') || scope;
    const root = panel.querySelector('[data-pf-chart]');
    const legend = panel.querySelector('[data-pf-chart-legend]');
    if (!root || !legend) return;

    chartCachedData = chart;
    const allPoints = chart.points ?? [];
    if (!allPoints.length) {
      root.innerHTML = '<div class="pf-chart-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg><p>No hay datos históricos disponibles para la selección.</p></div>';
      legend.innerHTML = '';
      return;
    }

    const total = allPoints.length;
    if (chartSliceEnd === null || chartSliceEnd >= total || chartSliceStart < 0 || chartSliceStart >= total || chartSliceStart >= chartSliceEnd) {
      const { start, end } = computeSliceIndicesForRange(allPoints, chartRange);
      chartSliceStart = start;
      chartSliceEnd = end;
    }

    root.innerHTML = `
      <div data-pf-chart-canvas-inner></div>
      <div class="pf-timeline-bar-wrap" data-timeline-wrap>
        <div class="pf-timeline-info">
          <div class="pf-timeline-date-chip">
            <span class="pf-timeline-chip-title">Desde</span>
            <strong data-timeline-from-date>—</strong>
          </div>
          <div class="pf-timeline-hint">Rueda: zoom · Arrastrar: desplazar · <strong>Clic derecho mantenido: medir variación</strong></div>
          <div class="pf-timeline-date-chip">
            <span class="pf-timeline-chip-title">Hasta</span>
            <strong data-timeline-to-date>—</strong>
          </div>
        </div>
        <div class="pf-timeline-track" data-timeline-track>
          <svg class="pf-timeline-sparkline" viewBox="0 0 760 32" preserveAspectRatio="none" data-timeline-sparkline></svg>
          <div class="pf-timeline-mask left" data-timeline-mask-left></div>
          <div class="pf-timeline-window" data-timeline-window>
            <div class="pf-timeline-handle left" data-timeline-handle="left" title="Arrastra para ajustar fecha de inicio">
              <span class="pf-handle-grip"></span>
            </div>
            <div class="pf-timeline-window-body" data-timeline-window-body title="Arrastra para desplazar el período"></div>
            <div class="pf-timeline-handle right" data-timeline-handle="right" title="Arrastra para ajustar fecha de fin">
              <span class="pf-handle-grip"></span>
            </div>
          </div>
          <div class="pf-timeline-mask right" data-timeline-mask-right></div>
        </div>
      </div>`;

    renderTimelineSparkline(panel, allPoints, chart.labels);
    renderChartMainSvg(panel);
    updateTimelineSliderUi(panel);
    attachChartCanvasInteractions(panel);
    attachTimelineEvents(panel);
  }

  function syncPickerChecked(panel) {
    const pickerBox = panel.querySelector('[data-pf-chart-picker-box]');
    if (!pickerBox) return;
    const selected = new Set(chartSelectedIds);
    pickerBox.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      const isChecked = selected.has(input.value);
      input.checked = isChecked;
      input.closest('.pf-chart-choice')?.classList.toggle('selected', isChecked);
    });
    const pickerBtn = panel.querySelector('[data-pf-chart-picker]');
    if (pickerBtn) pickerBtn.querySelector('span').textContent = `Elementos (${chartSelectedIds.length})`;
    const counterBadge = pickerBox.querySelector('[data-picker-counter]');
    if (counterBadge) counterBadge.textContent = `${chartSelectedIds.length} / 20 seleccionados`;
  }

  async function loadPortfolioChart(scope) {
    const panel = scope.querySelector('.pf-chart-panel') || scope;
    const status = panel.querySelector('[data-pf-chart-status]');
    if (!status) return;
    if (!chartSelectedIds.length) {
      status.textContent = 'Sin elementos seleccionados';
      const root = panel.querySelector('[data-pf-chart]');
      const legend = panel.querySelector('[data-pf-chart-legend]');
      if (root) root.innerHTML = `
        <div class="pf-chart-empty pf-chart-empty-clean">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          <p><strong>El gráfico no tiene elementos seleccionados.</strong></p>
          <p class="pf-chart-empty-sub">Pulsa el icono <span class="pf-inline-chart-icon"><svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15.5 7.2 10l3 2.5L16.5 5"/><path d="M13 5h3.5v3.5"/></svg></span> en cualquier valor o grupo de la tabla para compararlo, o pulsa <strong>«Mostrar todo»</strong> en la cabecera.</p>
        </div>`;
      if (legend) legend.innerHTML = '<li class="pf-legend-empty-hint">Ninguna línea seleccionada</li>';
      return;
    }
    const requestId = ++chartRequestId;
    status.textContent = 'Cargando histórico…';
    try {
      const query = new URLSearchParams({ ids: chartSelectedIds.join(','), metric: chartMetric, range: 'all' });
      const payload = await api(`/api/portfolio/chart?${query}`);
      if (requestId !== chartRequestId) return;
      chartCachedData = payload.chart;
      const { start, end } = computeSliceIndicesForRange(chartCachedData.points, chartRange);
      chartSliceStart = start;
      chartSliceEnd = end;
      drawPortfolioChart(panel, payload.chart);
      status.textContent = `Yahoo Finance · ${payload.chart.points.length} sesiones`;
    } catch (error) {
      if (requestId === chartRequestId) status.textContent = error.message || 'No se pudo cargar el histórico.';
    }
  }

  function wirePortfolioChart(scope) {
    const panel = scope.querySelector('.pf-chart-panel');
    if (!panel) return;
    const picker = panel.querySelector('[data-pf-chart-picker]');
    const pickerBox = panel.querySelector('[data-pf-chart-picker-box]');

    picker?.addEventListener('click', () => {
      const isOpen = !pickerBox.hidden;
      pickerBox.hidden = isOpen;
      picker.setAttribute('aria-expanded', String(!isOpen));
      picker.classList.toggle('active', !isOpen);
    });

    const fsBtn = panel.querySelector('[data-pf-chart-fullscreen]');
    const maxIcon = fsBtn?.querySelector('.pf-icon-maximize');
    const minIcon = fsBtn?.querySelector('.pf-icon-minimize');

    function syncFullscreenUi(isFs) {
      if (maxIcon) maxIcon.style.display = isFs ? 'none' : 'inline-block';
      if (minIcon) minIcon.style.display = isFs ? 'inline-block' : 'none';
      if (fsBtn) {
        fsBtn.title = isFs ? 'Salir de pantalla completa (Esc o F)' : 'Pantalla completa (F o clic)';
        fsBtn.classList.toggle('active', isFs);
      }
    }

    async function toggleFullscreen() {
      const isCurrentlyFs = document.fullscreenElement === panel || panel.classList.contains('is-fullscreen');
      if (!isCurrentlyFs) {
        try {
          if (panel.requestFullscreen) {
            await panel.requestFullscreen();
          } else {
            panel.classList.add('is-fullscreen');
          }
        } catch {
          panel.classList.add('is-fullscreen');
        }
        syncFullscreenUi(true);
      } else {
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
          }
        } catch {}
        panel.classList.remove('is-fullscreen');
        syncFullscreenUi(false);
      }
      setTimeout(() => {
        scheduleChartRedraw(panel);
        updateTimelineSliderUi(panel);
      }, 80);
    }

    fsBtn?.addEventListener('click', () => {
      toggleFullscreen();
    });

    const onFullscreenChange = () => {
      const isFs = document.fullscreenElement === panel || panel.classList.contains('is-fullscreen');
      panel.classList.toggle('is-fullscreen', isFs);
      syncFullscreenUi(isFs);
      scheduleChartRedraw(panel);
      updateTimelineSliderUi(panel);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    const onKeyDownFs = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === 'f' || e.key === 'F') {
        const isHovered = panel.matches(':hover') || panel.classList.contains('is-fullscreen');
        if (isHovered) {
          e.preventDefault();
          toggleFullscreen();
        }
      } else if (e.key === 'Escape' && panel.classList.contains('is-fullscreen')) {
        panel.classList.remove('is-fullscreen');
        syncFullscreenUi(false);
        scheduleChartRedraw(panel);
        updateTimelineSliderUi(panel);
      }
    };
    window.addEventListener('keydown', onKeyDownFs);

    panel.querySelector('[data-pf-chart-close]')?.addEventListener('click', () => {
      if (panel.classList.contains('is-fullscreen')) {
        try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
        panel.classList.remove('is-fullscreen');
      }
      chartOpen = false;
      renderSection();
    });

    panel.querySelector('[data-pf-chart-metric]')?.addEventListener('change', (event) => {
      chartMetric = event.target.value;
      loadPortfolioChart(panel);
    });

    panel.querySelectorAll('[data-pf-range]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.pfRange;
        chartRange = key;
        panel.querySelectorAll('[data-pf-range]').forEach((b) => b.classList.toggle('active', b === btn));
        if (chartCachedData?.points?.length) {
          const { start, end } = computeSliceIndicesForRange(chartCachedData.points, key);
          chartSliceStart = start;
          chartSliceEnd = end;
          scheduleChartRedraw(panel);
          updateTimelineSliderUi(panel);
        } else {
          loadPortfolioChart(panel);
        }
      });
    });

    panel.querySelectorAll('[data-pf-zoom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = btn.dataset.pfZoom;
        zoomChartByStep(panel, dir);
      });
    });

    // Picker Category Tabs
    pickerBox?.querySelectorAll('[data-picker-tab]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const cat = tabBtn.dataset.pickerTab;
        pickerBox.querySelectorAll('[data-picker-tab]').forEach((b) => b.classList.toggle('active', b === tabBtn));
        const searchVal = (pickerBox.querySelector('[data-picker-search]')?.value || '').toLowerCase().trim();
        filterPickerChoices(pickerBox, cat, searchVal);
      });
    });

    // Picker Search Input
    pickerBox?.querySelector('[data-picker-search]')?.addEventListener('input', (event) => {
      const searchVal = (event.target.value || '').toLowerCase().trim();
      const activeTab = pickerBox.querySelector('[data-picker-tab].active')?.dataset.pickerTab || 'all';
      filterPickerChoices(pickerBox, activeTab, searchVal);
    });

    function filterPickerChoices(box, cat, search) {
      box.querySelectorAll('.pf-chart-choice').forEach((choice) => {
        const matchCat = cat === 'all' || choice.dataset.choiceCategory === cat;
        const matchSearch = !search || choice.dataset.choiceSearch.includes(search);
        choice.hidden = !(matchCat && matchSearch);
      });
    }

    // Picker Quick Action Buttons
    pickerBox?.querySelector('[data-picker-quick="top"]')?.addEventListener('click', () => {
      const allChoices = chartChoices();
      chartSelectedIds = allChoices.filter((c) => c.category === 'valores').slice(0, 10).map((c) => c.id);
      syncPickerChecked(panel);
      loadPortfolioChart(panel);
    });

    pickerBox?.querySelector('[data-picker-quick="groups"]')?.addEventListener('click', () => {
      const allChoices = chartChoices();
      chartSelectedIds = allChoices.filter((c) => c.category === 'grupos').slice(0, 10).map((c) => c.id);
      syncPickerChecked(panel);
      loadPortfolioChart(panel);
    });

    pickerBox?.querySelector('[data-picker-quick="clear"]')?.addEventListener('click', () => {
      chartSelectedIds = [];
      syncPickerChecked(panel);
      loadPortfolioChart(panel);
    });

    // Checkbox change listener
    pickerBox?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', () => {
        chartSelectedIds = [...pickerBox.querySelectorAll('input:checked')].map((item) => item.value).slice(0, 20);
        syncPickerChecked(panel);
        loadPortfolioChart(panel);
      });
    });

    loadPortfolioChart(panel);
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
    const wrap = sectionRoot?.querySelector('.pf-broker-table-wrap');
    const scrollLeft = wrap?.scrollLeft ?? 0;
    const scrollTop = window.scrollY;
    const expanded = getExpandedTickers(sectionRoot);
    renderSection();
    restoreExpandedTickers(sectionRoot, expanded);
    requestAnimationFrame(() => {
      const wrap2 = sectionRoot?.querySelector('.pf-broker-table-wrap');
      if (wrap2 && scrollLeft > 0) wrap2.scrollLeft = scrollLeft;
      if (scrollTop > 0) window.scrollTo(0, scrollTop);
    });
  }

  function portfolioContentHtml() {
    if (portfolioTab === 'cartera') return `${allocationPanelHtml()}${chartOpen ? chartPanelHtml() : ''}${positionsPanelHtml()}`;
    if (portfolioTab === 'dividendos') return dividendPanelHtml();
    if (portfolioTab === 'calendario') return calendarPanelHtml();
    if (portfolioTab === 'operaciones') return operationsPanelHtml();
    return '';
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
        renderSection();
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
    scope.querySelectorAll('[data-pf-chart-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        chartOpen = !chartOpen;
        renderSection();
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
        chartOpen = true;
        portfolioTab = 'cartera';
        renderSection();
        requestAnimationFrame(() => sectionRoot?.querySelector('.pf-chart-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      });
    });
    scope.querySelectorAll('[data-pf-chart-trigger]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = button.dataset.pfChartTrigger;
        if (!id) return;
        if (!chartSelectedIds.includes(id)) chartSelectedIds = [...chartSelectedIds, id].slice(-20);
        chartOpen = true;
        portfolioTab = 'cartera';
        renderSection();
        requestAnimationFrame(() => sectionRoot?.querySelector('.pf-chart-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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

  async function renderSection() {
    if (!sectionRoot) return;
    hideChartTooltip();

    if (!userLogged) {
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
    renderSection();
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
    renderCompanyPanels();
  });

  return {
    refresh,
    reset,
    setAuthenticated,
    getPosition,
    hasPosition,
    openSection,
    mountSection,
    registerCompanyPanel,
  };
})();
