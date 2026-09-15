/**
 * @fileoverview Histórico de análisis: filtros, sugerencias y paginación (extraído de analisis.js).
 */

(function (window) {
  const AS = window.AnalisisState;


  function isAnalysisAnnual(analysis) {
    if (typeof analysis?.isAnnual === 'boolean') return analysis.isAnnual;
    const formType = String(analysis?.formType || '').toUpperCase();
    if (formType === '10-K') return true;
    if (formType === '10-Q') return false;
    const title = String(analysis?.periodTitle || '').toLowerCase();
    const filename = String(analysis?.filename || '').toLowerCase();
    return /annual|full year|10-?k/i.test(title) || /10-?k/i.test(filename);
  }

  function historyQuery() {
    const historyCompanyInput = document.querySelector('#history-company');
    const historyFromInput = document.querySelector('#history-from');
    const historyToInput = document.querySelector('#history-to');
    const dateType = document.querySelector('input[name="history-date-type"]:checked')?.value ?? 'period';
    const reportType = document.querySelector('input[name="history-report-type"]:checked')?.value ?? 'all';
    const params = new URLSearchParams();
    const ticker = historyCompanyInput?.value?.trim();
    if (ticker) params.set('ticker', ticker);
    if (historyFromInput?.value) params.set(dateType === 'period' ? 'periodFrom' : 'createdFrom', historyFromInput.value);
    if (historyToInput?.value) params.set(dateType === 'period' ? 'periodTo' : 'createdTo', historyToInput.value);
    if (reportType && reportType !== 'all') params.set('reportType', reportType);
    return params;
  }

  function renderHistory(analyses, options = {}) {
    window.AnalisisHistory.renderHistory(analyses, {
      currentUser: AS.currentUser,
      onViewAnalysis: viewHistoryAnalysis,
      resetPage: options.resetPage,
    });
  }

  async function fetchHistoryCompanies() {
    if (!AS.currentUser) {
      AS.historyCompanies = [];
      closeHistorySuggestions();
      return;
    }
    try {
      const response = await fetch('/api/analyses/companies');
      const data = await response.json().catch(() => ({}));
      if (response.ok) AS.historyCompanies = Array.isArray(data.companies) ? data.companies : [];
    } catch (error) {
      console.error('[history-suggest]', error?.message ?? error);
    }
  }

  function closeHistorySuggestions() {
    if (AS.historySuggest) {
      AS.historySuggest.hidden = true;
      AS.historySuggest.innerHTML = '';
    }
    AS.historySuggestIndex = -1;
  }

  function selectHistorySuggestion(ticker) {
    const historyCompanyInput = document.querySelector('#history-company');
    if (historyCompanyInput) historyCompanyInput.value = ticker;
    closeHistorySuggestions();
    historyCompanyInput?.focus();
    clearTimeout(AS.historyDebounceTimer);
    fetchAnalyses();
  }

  function moveHistorySuggestion(delta) {
    if (!AS.historySuggest || AS.historySuggest.hidden) return;
    const options = AS.historySuggest.querySelectorAll('.history-suggest-option');
    if (!options.length) return;
    AS.historySuggestIndex = (AS.historySuggestIndex + delta + options.length) % options.length;
    options.forEach((option, index) => option.classList.toggle('active', index === AS.historySuggestIndex));
    options[AS.historySuggestIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function renderHistorySuggestions() {
    const historyCompanyInput = document.querySelector('#history-company');
    if (!AS.historySuggest || !historyCompanyInput) return;

    const query = historyCompanyInput.value.trim().toLowerCase();
    if (!AS.historyCompanies.length) {
      closeHistorySuggestions();
      return;
    }

    const matches = (query
      ? AS.historyCompanies.filter((company) =>
        (company.ticker ?? '').toLowerCase().includes(query)
        || (company.companyName ?? '').toLowerCase().includes(query))
      : AS.historyCompanies)
      .slice(0, 12);

    if (!matches.length) {
      AS.historySuggest.innerHTML = '<div class="history-suggest-empty">Sin coincidencias en tus análisis</div>';
      AS.historySuggest.hidden = false;
      AS.historySuggestIndex = -1;
      return;
    }

    AS.historySuggest.innerHTML = matches.map((company) => {
      const ticker = String(company.ticker ?? '').toUpperCase();
      const name = company.companyName || ticker;
      const letter = (ticker || name || '?').slice(0, 1).toUpperCase();
      return `
        <button class="history-suggest-option" type="button" data-ticker="${escapeHtml(ticker)}">
          <span class="table-file" data-letter="${escapeHtml(letter)}">${ticker ? `<img class="table-file-logo" src="https://companiesmarketcap.com/img/company-logos/64/${escapeHtml(ticker)}.webp" alt="" loading="lazy">` : ''}</span>
          <span class="history-suggest-name">${escapeHtml(name)}</span>
          ${ticker ? `<strong class="history-suggest-ticker">${escapeHtml(ticker)}</strong>` : ''}
          <span class="history-suggest-count" title="Análisis guardados de esta empresa">${company.total ?? 1}</span>
        </button>
      `;
    }).join('');

    AS.historySuggest.querySelectorAll('.table-file-logo').forEach((img) => {
      img.addEventListener('error', () => {
        const span = img.closest('.table-file');
        if (span) span.textContent = span.dataset.letter || '?';
      });
    });

    AS.historySuggest.querySelectorAll('.history-suggest-option').forEach((option) => {
      option.addEventListener('click', () => selectHistorySuggestion(option.dataset.ticker));
      option.addEventListener('mousemove', () => {
        AS.historySuggest.querySelectorAll('.history-suggest-option').forEach((item) => item.classList.remove('active'));
        option.classList.add('active');
        AS.historySuggestIndex = Array.from(AS.historySuggest.querySelectorAll('.history-suggest-option')).indexOf(option);
      });
    });

    AS.historySuggest.hidden = false;
    AS.historySuggestIndex = -1;
  }

  async function fetchAnalyses() {
    if (!AS.currentUser) {
      renderHistory([]);
      return;
    }
    try {
      const response = await fetch(`/api/analyses?${historyQuery().toString()}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) renderHistory(data.analyses ?? [], { resetPage: true });
    } catch {
      renderHistory([]);
    }
  }

window.isAnalysisAnnual = isAnalysisAnnual;
window.historyQuery = historyQuery;
window.renderHistory = renderHistory;
window.fetchHistoryCompanies = fetchHistoryCompanies;
window.closeHistorySuggestions = closeHistorySuggestions;
window.selectHistorySuggestion = selectHistorySuggestion;
window.moveHistorySuggestion = moveHistorySuggestion;
window.renderHistorySuggestions = renderHistorySuggestions;
window.fetchAnalyses = fetchAnalyses;

})(window);
