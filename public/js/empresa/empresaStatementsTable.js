/**
 * @fileoverview Render de tablas de estados financieros.
 */

(function (window) {
  const ES = window.EmpresaStatementsState;


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
      if (item.kind === 'note') {
        result.push(item);
        continue;
      }
      if (item.kind === 'section') {
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

  function resolveItemKey(item, index) {
    if (item.key) return item.key;
    if (item.kind === 'margin') return `${item.baseKey}Margin`;
    if (item.kind === 'change') return `${item.baseKey}Growth`;
    if (item.kind === 'ratio') return `${item.numeratorKey}Ratio`;
    return `statement_row_${index}`;
  }

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

  function getStatementRowClasses(item, isSelected) {
    return [
      item.emphasis ? 'emphasis-row' : '',
      item.kind === 'change' || item.kind === 'margin' || item.kind === 'ratio' || item.italic ? 'derived-row' : '',
      isSelected ? 'chart-selected' : '',
    ].filter(Boolean).join(' ');
  }

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
    const hint = item.hint ? `<span class="profile-info-dot metric-hint-dot" title="${escapeHtml(item.hint)}">i</span>` : '';

    const favoriteStatement = item.favoriteStatement || window.screenerStatement || '';
    const favoriteButton = favoriteStatement
      ? (window.EmpresaFavoriteMetrics?.favoriteButtonHtml?.(item, favoriteStatement) || '')
      : '';

    const classAttr = rowClass ? ` class="${rowClass}"` : '';
    return `<tr${classAttr} data-metric="${escapeHtml(item.label)}" data-chart-key="${escapeHtml(itemKey)}"><td class="sticky-col">${favoriteButton}${dot}${escapeHtml(item.label)}${hint}</td>${cellsHtml}</tr>`;
  }

  function setupTableColumns(table, visibleIndexes) {
    table.querySelector('colgroup')?.remove();
    table.insertAdjacentHTML(
      'afterbegin',
      `<colgroup><col style="width:330px">${visibleIndexes.map(() => '<col>').join('')}</colgroup>`
    );
    table.style.minWidth = `${330 + visibleIndexes.length * 96}px`;
    table.style.maxWidth = `${330 + visibleIndexes.length * 320}px`;
  }

  function getPeriodHeaderLabel(row) {
    if (typeof window.periodDateLabel === 'function') {
      return window.periodDateLabel(row);
    }
    if (typeof window.EmpresaFormatting?.periodDateLabel === 'function') {
      return window.EmpresaFormatting.periodDateLabel(row);
    }
    return row?.periodEnd || row?.period || '';
  }

  function renderTableHead(thead, title, rows, visibleIndexes) {
    const thCells = visibleIndexes
      .map((rowIndex) => `<th>${getPeriodHeaderLabel(rows[rowIndex])}</th>`)
      .join('');
    thead.innerHTML = `<tr><th class="sticky-col">${escapeHtml(title)}</th>${thCells}</tr>`;
  }

  function attachTableMetricListeners(table, items) {
    table.querySelectorAll('tbody tr[data-chart-key]').forEach((row) => {
      const item = items.find((candidate) => candidate.key === row.dataset.chartKey);
      row.addEventListener('click', (event) => {
        if (event.target.closest('.metric-hint-dot')) return;
        if (typeof window.EmpresaMetricsChart?.toggleChartMetric === 'function') {
          window.EmpresaMetricsChart.toggleChartMetric(item);
        } else if (typeof window.toggleChartMetric === 'function') {
          window.toggleChartMetric(item);
        }
      });
    });

    table.querySelectorAll('tbody .metric-favorite-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const statement = button.dataset.favoriteStatement || '';
        const item = items.find((candidate) => candidate.key === button.dataset.favoriteKey);
        if (item) window.EmpresaFavoriteMetrics?.toggleFavorite?.(item, statement);
      });
    });
  }

  function syncChartIndicators() {
    if (typeof window.EmpresaMetricsChart?.syncMarginSelector === 'function') {
      window.EmpresaMetricsChart.syncMarginSelector();
    } else if (typeof window.syncMarginSelector === 'function') {
      window.syncMarginSelector();
    }
  }

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

window.filterEmptyStatementItems = filterEmptyStatementItems;
window.resolveItemKey = resolveItemKey;
window.renderStatementCells = renderStatementCells;
window.getStatementRowClasses = getStatementRowClasses;
window.buildStatementRowHtml = buildStatementRowHtml;
window.setupTableColumns = setupTableColumns;
window.getPeriodHeaderLabel = getPeriodHeaderLabel;
window.renderTableHead = renderTableHead;
window.attachTableMetricListeners = attachTableMetricListeners;
window.syncChartIndicators = syncChartIndicators;
window.renderStatementTable = renderStatementTable;

})(window);
