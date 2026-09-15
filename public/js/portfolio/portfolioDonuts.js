/**
 * @file portfolioDonuts.js
 * @description Renderizado de gráficos de anillo (donuts) SVG, asignación de cartera y tooltips interactivos.
 */

(function (window) {
  'use strict';

  const COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#e11d48', '#4f46e5', '#16a34a', '#ca8a04', '#9333ea', '#0d9488', '#db2777', '#6366f1', '#64748b'];

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

  let chartTooltip = null;

  function escapeHtml(value) {
    return window.HtmlUtils.escapeHtml(value);
  }

  function fmtMoney(val) {
    return window.PortfolioFormatting?.fmtMoney ? window.PortfolioFormatting.fmtMoney(val) : `$${val}`;
  }

  function fmtPct(val) {
    return window.PortfolioFormatting?.fmtPct ? window.PortfolioFormatting.fmtPct(val) : `${val} %`;
  }

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
      color: colorByLabel?.get?.(item.labelKey ?? item.label) ?? COLORS[index % COLORS.length],
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

  function ensureChartTooltip() {
    const targetParent = document.fullscreenElement || document.body;
    if (!chartTooltip) {
      chartTooltip = document.createElement('div');
      chartTooltip.className = 'pf-chart-tooltip';
      chartTooltip.hidden = true;
      targetParent.appendChild(chartTooltip);
    } else if (chartTooltip.parentNode !== targetParent) {
      targetParent.appendChild(chartTooltip);
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

  function allocationGroupLabel(item, group) {
    if (group === 'sector') return { label: item.sector || 'Sin sector', labelKey: item.sector || 'Sin sector' };
    if (group === 'type') return { label: item.type || 'Sin tipo', labelKey: item.type || 'Sin tipo' };
    if (group === 'country') return { label: item.country || 'Sin país', labelKey: item.country || 'Sin país' };
    if (group === 'region') return { label: item.region || 'Sin región', labelKey: item.region || 'Sin región' };
    return { label: item.companyName || item.ticker, labelKey: item.ticker };
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

  const PortfolioDonuts = {
    COLORS,
    ALLOCATION_GROUPS,
    ALLOCATION_GROUP_TITLES,
    describeAnnularSector,
    donutSvg,
    donutBlock,
    ensureChartTooltip,
    positionChartTooltip,
    hideChartTooltip,
    wireDonutTooltips,
    wireAllocationHover,
    allocationGroupLabel,
    portfolioLogoHtml,
    wirePortfolioLogos
  };

  window.PortfolioDonuts = PortfolioDonuts;
})(window);
