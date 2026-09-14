/**
 * @file empresaStatements.js
 * @description Renderizado y cálculo de estados financieros (Income, Balance, Cashflow),
 * ratios derivados y desplazamiento suave por arrastre (drag-to-scroll).
 */

(function (window) {
  'use strict';

  let screenerTableDragController = null;

  function escapeHtml(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getRowPrice(row, rowIndex, rows, compData) {
    if (!row) return null;
    const baseData = compData || window.companyData;
    const isBase = !baseData || baseData.company?.ticker === window.companyTicker;
    const chartPoints = window.chartPoints;

    if (isBase && chartPoints && chartPoints.length && row.periodEnd) {
      const targetMs = Date.parse(`${row.periodEnd}T23:59:59Z`);
      if (Number.isFinite(targetMs)) {
        let best = null;
        let minDiff = Infinity;
        for (const pt of chartPoints) {
          const ptMs = pt.t * 1000;
          const diff = Math.abs(ptMs - targetMs);
          if (diff < minDiff && diff <= 45 * 24 * 60 * 60 * 1000) {
            minDiff = diff;
            best = pt.v;
          }
        }
        if (best !== null && best > 0) return best;
      }
    }
    const prof = baseData?.profile ?? window.companyData?.profile;
    const isLatest = rowIndex === 0 || rowIndex === (rows ? rows.length - 1 : 0);
    if (isLatest && prof?.market?.price) {
      return Number(prof.market.price);
    }
    return null;
  }

  function getRowMarketCap(row, rowIndex, rows, compData) {
    const price = getRowPrice(row, rowIndex, rows, compData);
    const prof = compData?.profile ?? window.companyData?.profile;
    const shares = row?.values?.weightedSharesDiluted || row?.values?.sharesOutstanding || prof?.metrics?.shares;
    if (price && shares && shares > 0) {
      return price * shares;
    }
    const isLatest = rowIndex === 0 || rowIndex === (rows ? rows.length - 1 : 0);
    if (isLatest && prof?.metrics?.marketCap) {
      return Number(prof.metrics.marketCap);
    }
    return null;
  }

  function derivedScreenerValue(item, row, rowIndex, rows, compData) {
    if (!item || !row) return null;

    if (item.key === 'evToEbitda') {
      const ebitda = row.values?.ebitdaNormalized ?? row.values?.ebitda ?? (Number.isFinite(Number(row.values?.operatingIncome)) ? Number(row.values.operatingIncome) + (Number(row.values?.depreciationAmortizationTotal) || Number(row.values?.depreciation) || 0) : null);
      const ev = derivedScreenerValue({ key: 'enterpriseValue' }, row, rowIndex, rows, compData);
      return ev !== null && ev > 0 && ebitda !== null && ebitda > 0 ? ev / ebitda : null;
    }
    if (item.key === 'peRatio') {
      const price = getRowPrice(row, rowIndex, rows, compData);
      const eps = Number(row.values?.epsDilutedNormalized ?? row.values?.epsDiluted);
      return price !== null && price > 0 && Number.isFinite(eps) && eps > 0 ? price / eps : null;
    }
    if (item.key === 'netDebtToEbitda') {
      const ebitda = row.values?.ebitdaNormalized ?? row.values?.ebitda ?? (Number.isFinite(Number(row.values?.operatingIncome)) ? Number(row.values.operatingIncome) + (Number(row.values?.depreciationAmortizationTotal) || Number(row.values?.depreciation) || 0) : null);
      const netDebt = row.values?.netDebt !== undefined ? row.values.netDebt : (Number.isFinite(Number(row.values?.totalDebt)) ? Number(row.values.totalDebt) - (Number(row.values?.cashAndShortTermInvestments ?? row.values?.cash) || 0) : null);
      return netDebt !== null && ebitda !== null && ebitda > 0 ? netDebt / ebitda : null;
    }
    if (item.key === 'dividendYield') {
      const price = getRowPrice(row, rowIndex, rows, compData);
      const dps = Number(row.values?.dividendPerShare);
      return price !== null && price > 0 && Number.isFinite(dps) && dps > 0 ? (dps / price) * 100 : null;
    }
    if (item.key === 'marketCap') {
      return getRowMarketCap(row, rowIndex, rows, compData);
    }
    if (item.key === 'enterpriseValue') {
      const mcap = getRowMarketCap(row, rowIndex, rows, compData);
      const netDebt = row.values?.netDebt !== undefined ? row.values.netDebt : (Number.isFinite(Number(row.values?.totalDebt)) ? Number(row.values.totalDebt) - (Number(row.values?.cashAndShortTermInvestments ?? row.values?.cash) || 0) : 0);
      return mcap !== null ? mcap + (netDebt || 0) : null;
    }
    if (item.key === 'priceToFcf' || item.key === 'pToFcf') {
      const price = getRowPrice(row, rowIndex, rows, compData);
      const fcfps = Number(row.values?.cashFlowPerShare);
      if (price !== null && price > 0 && Number.isFinite(fcfps) && fcfps > 0) {
        return price / fcfps;
      }
      const mcap = getRowMarketCap(row, rowIndex, rows, compData);
      const fcf = Number(row.values?.freeCashFlow);
      return mcap !== null && mcap > 0 && Number.isFinite(fcf) && fcf > 0 ? mcap / fcf : null;
    }
    if (item.key === 'customValuation1' || item.key === 'customValuation2') {
      return null;
    }

    if (item.key === 'grossProfitMargin') {
      const rev = Number(row.values?.revenue);
      const gp = Number(row.values?.grossProfit);
      return rev && Number.isFinite(gp) ? (gp / rev) * 100 : null;
    }
    if (item.key === 'operatingIncomeMargin') {
      const rev = Number(row.values?.revenue);
      const op = Number(row.values?.operatingIncome);
      return rev && Number.isFinite(op) ? (op / rev) * 100 : null;
    }
    if (item.key === 'operatingIncomeAdjusted') {
      if (row.values?.operatingIncomeAdjusted !== undefined) return row.values.operatingIncomeAdjusted;
      const pretax = Number(row.values?.pretaxIncome);
      const ie = Math.abs(Number(row.values?.interestExpense) || 0);
      const ii = Math.abs(Number(row.values?.interestIncome) || 0);
      return Number.isFinite(pretax) ? pretax + (ie - ii) : row.values?.operatingIncome;
    }
    if (item.key === 'operatingIncomeAdjustedMargin') {
      const rev = Number(row.values?.revenue);
      if (!rev) return null;
      let adj = Number(row.values?.operatingIncomeAdjusted);
      if (!Number.isFinite(adj)) {
        const pretax = Number(row.values?.pretaxIncome);
        const ie = Math.abs(Number(row.values?.interestExpense) || 0);
        const ii = Math.abs(Number(row.values?.interestIncome) || 0);
        if (Number.isFinite(pretax)) {
          adj = pretax + (ie - ii);
        } else {
          const op = Number(row.values?.operatingIncome);
          adj = Number.isFinite(op) ? op : null;
        }
      }
      return Number.isFinite(adj) ? (adj / rev) * 100 : null;
    }
    if (item.key === 'netIncomeMargin') {
      const rev = Number(row.values?.revenue);
      const net = Number(row.values?.netIncomeToCommonIncludingUnusual ?? row.values?.netIncome);
      return rev && Number.isFinite(net) ? (net / rev) * 100 : null;
    }
    if (item.key === 'netIncomeAdjustedMargin') {
      const rev = Number(row.values?.revenue);
      const net = Number(row.values?.netIncomeToCommonExcludingUnusual ?? row.values?.netIncomeNormalized ?? row.values?.netIncome);
      return rev && Number.isFinite(net) ? (net / rev) * 100 : null;
    }
    if (item.key === 'ebitdaMargin') {
      const rev = Number(row.values?.revenue);
      const ebitda = Number(row.values?.ebitdaNormalized ?? row.values?.ebitda ?? (Number.isFinite(Number(row.values?.operatingIncome)) ? Number(row.values.operatingIncome) + (Number(row.values?.depreciationAmortizationTotal) || Number(row.values?.depreciation) || 0) : null));
      return rev && Number.isFinite(ebitda) ? (ebitda / rev) * 100 : null;
    }
    if (item.key === 'fcfMargin' || item.key === 'freeCashFlowMargin') {
      const rev = Number(row.values?.revenue);
      const fcf = Number(row.values?.freeCashFlow);
      return rev && Number.isFinite(fcf) ? (fcf / rev) * 100 : null;
    }

    if (item.kind !== 'change' && item.kind !== 'margin' && item.kind !== 'ratio') return row.values?.[item.key];
    if (item.kind === 'ratio') {
      const numerator = Number(row.values?.[item.numeratorKey]);
      const denominator = Number(row.values?.[item.denominatorKey]);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
      return ((item.absoluteNumerator ? Math.abs(numerator) : numerator) / denominator) * 100;
    }
    const value = item.baseKey === 'ebitda'
      ? (row.values?.ebitdaNormalized ?? row.values?.ebitda)
      : (row.values?.[item.baseKey] ?? (item.baseKey === 'netIncomeToCommonIncludingUnusual' ? row.values?.netIncome : undefined));
    if (item.kind === 'margin') {
      const revenue = row.values?.revenue;
      return revenue && Number.isFinite(Number(value)) ? (Number(value) / Number(revenue)) * 100 : null;
    }
    const screenerSeries = window.screenerSeries || 'annual';
    const previousIndex = screenerSeries === 'quarterly' ? rowIndex - 4 : rowIndex - 1;
    const previous = rows[previousIndex]?.values?.[item.baseKey];
    return previous ? ((Number(value) / Number(previous)) - 1) * 100 : null;
  }

  function formatScreenerValue(value, format, kind) {
    const precision = window.screenerPrecision ?? 2;
    if (kind === 'change' || kind === 'margin' || kind === 'ratio' || format === 'percent') {
      return window.formatPercentage ? window.formatPercentage(value, precision) : `${value} %`;
    }
    if (format === 'multiple') {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
      return window.formatMultiple ? window.formatMultiple(value, precision) : `${value}x`;
    }
    if (format === 'perShare') return window.formatEps ? window.formatEps(value, precision) : `${value} $`;
    if (format === 'shares') return window.formatShares ? window.formatShares(value, precision) : `${value}`;
    if (format === 'count') return window.formatCount ? window.formatCount(value, precision) : `${value}`;
    return window.formatMoneyUsd ? window.formatMoneyUsd(value, precision) : `${value}`;
  }

  function isLockedPeriod(rowIndex, rows) {
    if (window.companyAuthenticated) return false;
    return rowIndex < Math.max(0, rows.length - 4);
  }

  function renderProCell() {
    return '<button type="button" class="register-pill" title="Crea una cuenta gratis para ver todo el histórico" onclick="window.AuthModule && window.AuthModule.openModal && window.AuthModule.openModal(\'register\')">Regístrate</button>';
  }

  function shouldRenderScreenerValueRed(value, item) {
    if (value === null || value === undefined || value === '') return false;
    const number = Number(value);
    if (!Number.isFinite(number)) return false;
    if (number > 0) return false;
    return item.tone === 'negative' || number < 0;
  }

  function rowYear(row) {
    const match = String(row?.period ?? '').match(/^(\d{4})/);
    return match ? Number(match[1]) : null;
  }

  function screenerVisibleIndexes(rows) {
    const years = rows.map(rowYear).filter((year) => year !== null);
    if (!years.length) return rows.map((_, index) => index);
    const low = Math.min(...years);
    const high = Math.max(...years);
    const defaultMin = Math.max(low, high - 9);
    const min = window.screenerYearMin ?? defaultMin;
    const max = window.screenerYearMax ?? high;
    return rows
      .map((row, index) => {
        const year = rowYear(row);
        return year !== null && year >= min && year <= max ? index : null;
      })
      .filter((index) => index !== null);
  }

  function itemHasVisibleValues(item, rows, visibleIndexes) {
    return visibleIndexes.some((rowIndex) => {
      const row = rows[rowIndex];
      const value = derivedScreenerValue(item, row, rowIndex, rows);
      if (value === null || value === undefined || value === '') return false;
      const num = Number(value);
      return !Number.isNaN(num) && Number.isFinite(num);
    });
  }

  function filterEmptyStatementItems(items, rows, visibleIndexes) {
    if (!visibleIndexes.length) return items;
    const keptDataItems = new Set();
    items.forEach((item) => {
      if (item.kind !== 'section' && item.kind !== 'note') {
        if (itemHasVisibleValues(item, rows, visibleIndexes)) {
          keptDataItems.add(item);
        }
      }
    });

    const result = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'section' || item.kind === 'note') {
        let hasDataUnderneath = false;
        for (let j = i + 1; j < items.length; j++) {
          if (items[j].kind === 'section') break;
          if (keptDataItems.has(items[j])) {
            hasDataUnderneath = true;
            break;
          }
        }
        if (hasDataUnderneath) {
          result.push(item);
        }
      } else if (keptDataItems.has(item)) {
        result.push(item);
      }
    }
    return result;
  }

  /* ── Renderizado de la tabla de estados financieros ────────── */

  /**
   * Resuelve o genera la clave única para una métrica del estado financiero.
   * @param {Object} item
   * @param {number} index
   * @returns {string}
   */
  function resolveItemKey(item, index) {
    if (item.key) return item.key;
    if (item.kind === 'margin') return `${item.baseKey}Margin`;
    if (item.kind === 'change') return `${item.baseKey}Growth`;
    if (item.kind === 'ratio') return `${item.numeratorKey}Ratio`;
    return `statement_row_${index}`;
  }

  /**
   * Genera el HTML de las celdas de datos para un ítem a través de los periodos visibles.
   * @param {Object} item
   * @param {Array<Object>} rows
   * @param {Array<number>} visibleIndexes
   * @returns {string}
   */
  function renderStatementCells(item, rows, visibleIndexes) {
    return visibleIndexes
      .map((rowIndex) => {
        const row = rows[rowIndex];
        if (isLockedPeriod(rowIndex, rows)) {
          return `<td>${renderProCell()}</td>`;
        }
        const value = derivedScreenerValue(item, row, rowIndex, rows);
        const className = shouldRenderScreenerValueRed(value, item) ? ' class="negative"' : '';
        return `<td${className}>${formatScreenerValue(value, item.format, item.kind)}</td>`;
      })
      .join('');
  }

  /**
   * Determina las clases CSS para una fila del estado financiero.
   * @param {Object} item
   * @param {boolean} isSelected
   * @returns {string}
   */
  function getStatementRowClasses(item, isSelected) {
    return [
      item.emphasis ? 'emphasis-row' : '',
      item.kind === 'change' || item.kind === 'margin' || item.kind === 'ratio' || item.italic ? 'derived-row' : '',
      isSelected ? 'chart-selected' : '',
    ].filter(Boolean).join(' ');
  }

  /**
   * Construye el HTML de una fila de la tabla de estados financieros.
   * @param {Object} item
   * @param {number} index
   * @param {Array<Object>} rows
   * @param {Array<number>} visibleIndexes
   * @param {number} colspan
   * @param {Map} chartMetrics
   * @returns {string}
   */
  function buildStatementRowHtml(item, index, rows, visibleIndexes, colspan, chartMetrics) {
    if (item.kind === 'section') {
      return `<tr class="section-row"><td class="sticky-col" colspan="${colspan}">${escapeHtml(item.label)}</td></tr>`;
    }
    if (item.kind === 'note') {
      return `<tr class="note-row"><td class="sticky-col" colspan="${colspan}">${escapeHtml(item.label)}</td></tr>`;
    }

    const itemKey = resolveItemKey(item, index);
    item.key = itemKey;

    const cellsHtml = renderStatementCells(item, rows, visibleIndexes);
    const isSelected = Boolean(chartMetrics?.has(itemKey));
    const rowClass = getStatementRowClasses(item, isSelected);

    const dotColor = isSelected ? (chartMetrics.get(itemKey)?.color || '#4f46e5') : '';
    const dot = isSelected ? `<span class="metric-chart-dot" style="background:${dotColor}"></span>` : '';

    const classAttr = rowClass ? ` class="${rowClass}"` : '';
    return `<tr${classAttr} data-metric="${escapeHtml(item.label)}" data-chart-key="${escapeHtml(itemKey)}"><td class="sticky-col">${dot}${escapeHtml(item.label)}</td>${cellsHtml}</tr>`;
  }

  /**
   * Configura las columnas y los anchos dinámicos de la tabla de estados financieros.
   * @param {HTMLTableElement} table
   * @param {Array<number>} visibleIndexes
   */
  function setupTableColumns(table, visibleIndexes) {
    table.querySelector('colgroup')?.remove();
    table.insertAdjacentHTML(
      'afterbegin',
      `<colgroup><col style="width:330px">${visibleIndexes.map(() => '<col>').join('')}</colgroup>`
    );
    table.style.minWidth = `${330 + visibleIndexes.length * 96}px`;
    table.style.maxWidth = `${330 + visibleIndexes.length * 320}px`;
  }

  /**
   * Obtiene la etiqueta de cabecera formateada para un periodo.
   * @param {Object} row
   * @returns {string}
   */
  function getPeriodHeaderLabel(row) {
    if (typeof window.periodDateLabel === 'function') {
      return window.periodDateLabel(row);
    }
    if (typeof window.EmpresaFormatting?.periodDateLabel === 'function') {
      return window.EmpresaFormatting.periodDateLabel(row);
    }
    return row?.periodEnd || row?.period || '';
  }

  /**
   * Renderiza la cabecera (thead) de la tabla de estados.
   * @param {HTMLTableSectionElement} thead
   * @param {string} title
   * @param {Array<Object>} rows
   * @param {Array<number>} visibleIndexes
   */
  function renderTableHead(thead, title, rows, visibleIndexes) {
    const thCells = visibleIndexes
      .map((rowIndex) => `<th>${getPeriodHeaderLabel(rows[rowIndex])}</th>`)
      .join('');
    thead.innerHTML = `<tr><th class="sticky-col">${escapeHtml(title)}</th>${thCells}</tr>`;
  }

  /**
   * Registra los manejadores de clic en cada fila para activar/desactivar la métrica en el gráfico.
   * @param {HTMLTableElement} table
   * @param {Array<Object>} items
   */
  function attachTableMetricListeners(table, items) {
    table.querySelectorAll('tbody tr[data-chart-key]').forEach((row) => {
      const item = items.find((candidate) => candidate.key === row.dataset.chartKey);
      row.addEventListener('click', () => {
        if (typeof window.EmpresaMetricsChart?.toggleChartMetric === 'function') {
          window.EmpresaMetricsChart.toggleChartMetric(item);
        } else if (typeof window.toggleChartMetric === 'function') {
          window.toggleChartMetric(item);
        }
      });
    });
  }

  /**
   * Sincroniza selectores e indicadores del gráfico de métricas.
   */
  function syncChartIndicators() {
    if (typeof window.EmpresaMetricsChart?.syncMarginSelector === 'function') {
      window.EmpresaMetricsChart.syncMarginSelector();
    } else if (typeof window.syncMarginSelector === 'function') {
      window.syncMarginSelector();
    }
  }

  /**
   * Renderiza la tabla completa de estados financieros (Income, Balance, Cashflow).
   * @param {Array<Object>} rows
   * @param {Array<number>} visibleIndexes
   * @param {Array<Object>} items
   */
  function renderStatementTable(rows, visibleIndexes, items) {
    const table = document.querySelector('#screener-statement-table');
    if (!table) return;

    const title = document.querySelector('#screener-table-title')?.textContent || '';
    const colspan = visibleIndexes.length + 1;

    setupTableColumns(table, visibleIndexes);

    const thead = table.querySelector('thead');
    if (thead) {
      renderTableHead(thead, title, rows, visibleIndexes);
    }

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const chartMetrics = window.EmpresaMetricsChart?.chartMetrics || window.chartMetrics;
    tbody.innerHTML = items
      .map((item, index) => buildStatementRowHtml(item, index, rows, visibleIndexes, colspan, chartMetrics))
      .join('');

    attachTableMetricListeners(table, items);
    syncChartIndicators();
    updateScreenerTableScroll();
  }

  /* ── Drag to scroll en la tabla de estados ─────────────────── */

  function initScreenerTableDrag() {
    const wrap = document.querySelector('#screener-table-wrap') || document.querySelector('.screener-block .table-wrap');
    if (!wrap) return null;

    let isDown = false;
    let startX = 0;
    let scrollLeftStart = 0;
    let hasDragged = false;
    let velocityX = 0;
    let lastX = 0;
    let lastTime = 0;
    let animId = null;

    function stopMomentum() {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    }

    function startMomentum() {
      stopMomentum();
      let v = velocityX;
      const friction = 0.94;
      const minV = 0.15;

      function step() {
        if (Math.abs(v) < minV || isDown) {
          stopMomentum();
          return;
        }
        wrap.scrollLeft -= v * 16;
        v *= friction;
        animId = requestAnimationFrame(step);
      }
      animId = requestAnimationFrame(step);
    }

    function update() {
      const canScroll = wrap.scrollWidth > wrap.clientWidth + 2;
      wrap.classList.toggle('can-scroll', canScroll);
      wrap.classList.toggle('is-scrolled', wrap.scrollLeft > 2);
    }

    wrap.addEventListener('scroll', () => {
      wrap.classList.toggle('is-scrolled', wrap.scrollLeft > 2);
    }, { passive: true });

    window.addEventListener('resize', update);

    wrap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button, input, select, textarea, a')) return;

      stopMomentum();
      isDown = true;
      hasDragged = false;
      startX = e.clientX;
      scrollLeftStart = wrap.scrollLeft;
      lastX = e.clientX;
      lastTime = performance.now();
      velocityX = 0;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDown) return;

      const currentX = e.clientX;
      const diffX = currentX - startX;

      if (!hasDragged && Math.abs(diffX) > 4) {
        hasDragged = true;
        wrap.classList.add('is-dragging');
        document.body.classList.add('screener-table-dragging');
        window.getSelection()?.removeAllRanges();
      }

      if (hasDragged) {
        e.preventDefault();
        wrap.scrollLeft = scrollLeftStart - diffX;

        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 8) {
          velocityX = (currentX - lastX) / dt;
          lastX = currentX;
          lastTime = now;
        }
      }
    });

    const onMouseUp = () => {
      if (!isDown) return;
      isDown = false;
      wrap.classList.remove('is-dragging');
      document.body.classList.remove('screener-table-dragging');

      if (hasDragged) {
        const now = performance.now();
        if (now - lastTime > 60) {
          velocityX = 0;
        } else if (Math.abs(velocityX) > 0.15) {
          startMomentum();
        }

        const swallowClick = (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          evt.stopImmediatePropagation();
        };
        window.addEventListener('click', swallowClick, { capture: true, once: true });
        setTimeout(() => {
          window.removeEventListener('click', swallowClick, { capture: true });
        }, 100);
      }
    };

    window.addEventListener('mouseup', onMouseUp);
    update();

    return {
      update,
      resetScroll: () => {
        stopMomentum();
        wrap.scrollLeft = 0;
        update();
      },
    };
  }

  function updateScreenerTableScroll() {
    if (!screenerTableDragController) {
      screenerTableDragController = initScreenerTableDrag();
    } else {
      screenerTableDragController.update();
    }
  }

  const EmpresaStatements = {
    getRowPrice,
    getRowMarketCap,
    derivedScreenerValue,
    formatScreenerValue,
    isLockedPeriod,
    renderProCell,
    shouldRenderScreenerValueRed,
    rowYear,
    screenerVisibleIndexes,
    itemHasVisibleValues,
    filterEmptyStatementItems,
    renderStatementTable,
    initScreenerTableDrag,
    updateScreenerTableScroll,
    getDragController: () => screenerTableDragController
  };

  window.EmpresaStatements = EmpresaStatements;
  window.getRowPrice = getRowPrice;
  window.getRowMarketCap = getRowMarketCap;
  window.derivedScreenerValue = derivedScreenerValue;
  window.formatScreenerValue = formatScreenerValue;
  window.isLockedPeriod = isLockedPeriod;
  window.renderProCell = renderProCell;
  window.shouldRenderScreenerValueRed = shouldRenderScreenerValueRed;
  window.rowYear = rowYear;
  window.screenerVisibleIndexes = screenerVisibleIndexes;
  window.itemHasVisibleValues = itemHasVisibleValues;
  window.filterEmptyStatementItems = filterEmptyStatementItems;
  window.renderStatementTable = renderStatementTable;
  window.updateScreenerTableScroll = updateScreenerTableScroll;
})(window);
