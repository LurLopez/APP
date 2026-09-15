/**
 * @fileoverview Cableado de los filtros del histórico (extraído de analisis.js).
 */

(function (window) {
  const AS = window.AnalisisState;


  function wireAnalisisHistory() {
    const historyCompanyLabel = document.querySelector('.history-company');
    if (historyCompanyLabel && !document.querySelector('#history-suggest')) {
      AS.historySuggest = document.createElement('div');
      AS.historySuggest.className = 'history-suggest';
      AS.historySuggest.id = 'history-suggest';
      AS.historySuggest.hidden = true;
      historyCompanyLabel.appendChild(AS.historySuggest);
    }
    const historyRefresh = document.querySelector('#history-refresh');
    const historyCompanyInput = document.querySelector('#history-company');
    const historyFromInput = document.querySelector('#history-from');
    const historyToInput = document.querySelector('#history-to');
    const historyClear = document.querySelector('#history-clear');
    const historyLoginButton = document.querySelector('#history-login');
    historyRefresh?.addEventListener('click', fetchAnalyses);

    document.querySelectorAll('#history-table th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        AS.historySort = key === AS.historySort.key
          ? { key, dir: AS.historySort.dir === 'asc' ? 'desc' : 'asc' }
          : { key, dir: key === 'created_at' || key === 'period_end' ? 'desc' : 'asc' };
        updateHistorySortHeaders();
        renderHistory(AS.historyAnalyses, { resetPage: true });
      });
    });

    document.querySelector('#history-pagination')?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-page]');
      if (!button || button.disabled) return;
      AS.historyPage = Number(button.dataset.page) || 1;
      renderHistory(AS.historyAnalyses);
      document.querySelector('#history-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    historyCompanyInput?.addEventListener('input', () => {
      renderHistorySuggestions();
      clearTimeout(AS.historyDebounceTimer);
      AS.historyDebounceTimer = setTimeout(fetchAnalyses, 300);
    });

    historyCompanyInput?.addEventListener('focus', renderHistorySuggestions);

    historyCompanyInput?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveHistorySuggestion(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveHistorySuggestion(-1);
      } else if (event.key === 'Enter') {
        const options = AS.historySuggest && !AS.historySuggest.hidden
          ? AS.historySuggest.querySelectorAll('.history-suggest-option')
          : [];
        if (options.length) {
          event.preventDefault();
          const selected = options[Math.max(AS.historySuggestIndex, 0)];
          selectHistorySuggestion(selected.dataset.ticker);
        }
      } else if (event.key === 'Escape') {
        closeHistorySuggestions();
      }
    });

    document.addEventListener('click', (event) => {
      if (AS.historySuggest && !AS.historySuggest.contains(event.target) && event.target !== historyCompanyInput) {
        closeHistorySuggestions();
      }
    });

    [historyFromInput, historyToInput].forEach((input) => {
      input?.addEventListener('change', fetchAnalyses);
    });

    document.querySelectorAll('input[name="history-date-type"]').forEach((radio) => {
      radio.addEventListener('change', fetchAnalyses);
    });

    document.querySelectorAll('input[name="history-report-type"]').forEach((radio) => {
      radio.addEventListener('change', fetchAnalyses);
    });

    historyClear?.addEventListener('click', () => {
      if (historyCompanyInput) historyCompanyInput.value = '';
      if (historyFromInput) historyFromInput.value = '';
      if (historyToInput) historyToInput.value = '';
      const radio = document.querySelector('input[name="history-date-type"][value="period"]');
      if (radio) radio.checked = true;
      const reportTypeRadio = document.querySelector('input[name="history-report-type"][value="all"]');
      if (reportTypeRadio) reportTypeRadio.checked = true;
      closeHistorySuggestions();
      fetchAnalyses();
    });

    historyLoginButton?.addEventListener('click', () => {
      document.querySelector('#auth-login')?.click();
    });

    document.addEventListener('click', (event) => {
      const actionButton = event.target.closest('#history-body tr[data-pdf-url] [data-action]');
      if (actionButton) {
        event.preventDefault();
        event.stopPropagation();
        const row = actionButton.closest('tr');
        const action = actionButton.dataset.action;
        if (action === 'view') {
          viewHistoryAnalysis(row);
        } else {
          downloadReport(action, row.dataset.downloadBase, row.dataset.downloadName);
        }
        return;
      }
      const row = event.target.closest('#history-body tr[data-pdf-url]');
      if (row && !event.target.closest('button') && !event.target.closest('a')) {
        viewHistoryAnalysis(row);
      }
    });
  }

window.wireAnalisisHistory = wireAnalisisHistory;

})(window);
