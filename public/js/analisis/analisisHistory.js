/**
 * @fileoverview Gestión del historial de análisis, filtros, ordenación y autocompletado.
 * @module AnalisisHistory
 */

(function () {
  'use strict';

  const PAGE_SIZE = 10;
  let historyAnalyses = [];
  let historySort = { key: 'created_at', dir: 'desc' };
  let historyPage = 1;
  let historyCompanies = [];
  let historySuggest = null;
  let historySuggestIndex = -1;

  function escapeHtml(val) {
    return window.AnalisisTables ? window.AnalisisTables.escapeHtml(val) : String(val ?? '');
  }

  function formatHistoryDate(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat((window.I18n && window.I18n.localeFor && window.I18n.localeFor()) || 'es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  function isAnalysisAnnual(analysis) {
    if (typeof analysis?.isAnnual === 'boolean') return analysis.isAnnual;
    const formType = String(analysis?.formType || '').toUpperCase();
    if (formType === '10-K') return true;
    if (formType === '10-Q') return false;
    const title = String(analysis?.periodTitle || '').toLowerCase();
    const filename = String(analysis?.filename || '').toLowerCase();
    return /annual|full year|10-?k/i.test(title) || /10-?k/i.test(filename);
  }

  function historySortValue(analysis, key) {
    switch (key) {
      case 'document': return String(analysis.downloadBase || analysis.pdf_url || '').toLowerCase();
      case 'company': return String(analysis.companyName || analysis.ticker || '').toLowerCase();
      case 'period': return String(analysis.periodTitle || '').toLowerCase();
      case 'period_end': return analysis.period_end ?? '';
      case 'created_at': return analysis.created_at ?? '';
      default: return '';
    }
  }

  function sortHistoryList(list) {
    const { key, dir } = historySort;
    const factor = dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = historySortValue(a, key);
      const vb = historySortValue(b, key);
      if (va === '' && vb !== '') return 1;
      if (vb === '' && va !== '') return -1;
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  }

  function renderHistoryPagination(totalItems, totalPages) {
    const pagination = document.querySelector('#history-pagination');
    if (!pagination) return;
    if (totalPages <= 1) {
      pagination.hidden = true;
      pagination.innerHTML = '';
      return;
    }

    const pages = [];
    for (let page = 1; page <= totalPages; page += 1) {
      if (page === 1 || page === totalPages || Math.abs(page - historyPage) <= 1) {
        pages.push(page);
      } else if (pages[pages.length - 1] !== 'ellipsis') {
        pages.push('ellipsis');
      }
    }

    const first = (historyPage - 1) * PAGE_SIZE + 1;
    const last = Math.min(historyPage * PAGE_SIZE, totalItems);
    pagination.hidden = false;
    pagination.innerHTML = `
      <span class="pagination-summary">Mostrando ${first}–${last} de ${totalItems}</span>
      <div class="pagination-controls">
        <button class="pagination-button" type="button" data-page="${historyPage - 1}" ${historyPage === 1 ? 'disabled' : ''}>← Anterior</button>
        ${pages.map((p) => (p === 'ellipsis' ? '<span class="pagination-ellipsis">…</span>' : `<button class="pagination-page${p === historyPage ? ' active' : ''}" type="button" data-page="${p}">${p}</button>`)).join('')}
        <button class="pagination-button" type="button" data-page="${historyPage + 1}" ${historyPage === totalPages ? 'disabled' : ''}>Siguiente →</button>
      </div>
    `;
  }

  function renderHistory(analyses, { currentUser, onViewAnalysis, resetPage = false } = {}) {
    historyAnalyses = Array.isArray(analyses) ? analyses : [];
    if (resetPage) historyPage = 1;
    const historyBody = document.querySelector('#history-body');
    const historyFilters = document.querySelector('#history-filters');
    const historyEmpty = document.querySelector('#history-empty');
    const historyEmptyText = document.querySelector('#history-empty-text');
    const historyLoginButton = document.querySelector('#history-login');
    const historyPagination = document.querySelector('#history-pagination');
    const reportType = document.querySelector('input[name="history-report-type"]:checked')?.value ?? 'all';

    if (!historyBody) return;

    if (!currentUser) {
      if (historyFilters) historyFilters.hidden = true;
      historyBody.innerHTML = '';
      if (historyPagination) historyPagination.hidden = true;
      if (historyEmpty) historyEmpty.hidden = false;
      if (historyEmptyText) historyEmptyText.textContent = 'Inicia sesión para guardar tus análisis y consultarlos aquí.';
      if (historyLoginButton) historyLoginButton.hidden = false;
      return;
    }

    if (historyLoginButton) historyLoginButton.hidden = true;
    if (historyFilters) historyFilters.hidden = false;

    let filtered = historyAnalyses;
    if (reportType === 'annual') filtered = historyAnalyses.filter(isAnalysisAnnual);
    else if (reportType === 'quarterly') filtered = historyAnalyses.filter((item) => !isAnalysisAnnual(item));

    if (!filtered.length) {
      historyBody.innerHTML = '';
      if (historyPagination) historyPagination.hidden = true;
      if (historyEmpty) historyEmpty.hidden = false;
      if (historyEmptyText) historyEmptyText.textContent = 'Aún no tienes análisis guardados. Sube un 10-Q o 10-K y aparecerá aquí.';
      return;
    }

    if (historyEmpty) historyEmpty.hidden = true;
    const sorted = sortHistoryList(filtered);
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    historyPage = Math.min(Math.max(historyPage, 1), totalPages);
    const pageItems = sorted.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE);

    historyBody.innerHTML = pageItems.map((analysis) => {
      const ticker = String(analysis.ticker ?? '').toUpperCase();
      const company = analysis.companyName || ticker || '—';
      const isAnnual = isAnalysisAnnual(analysis);
      const typeBadge = `<span class="analysis-type-pill ${isAnnual ? 'annual' : 'quarterly'}">${isAnnual ? '10-K' : '10-Q'}</span>`;
      const analysisLanguage = window.I18n?.normalizeLanguage?.(analysis.language) || analysis.language || 'es';
      const languageBadge = `<span class="analysis-type-pill language">${analysisLanguage.toUpperCase()}</span>`;
      const docName = analysis.downloadBase ? `${analysis.downloadBase}.pdf` : (analysis.filename ?? 'informe.pdf');
      const fileBaseUrl = analysis.pdf_url ? String(analysis.pdf_url).replace(/\.pdf$/, '') : '';
      const downloadName = analysis.downloadBase || 'analisis-cifra';

      return `
        <tr data-id="${escapeHtml(analysis.id)}" data-pdf-url="${escapeHtml(analysis.pdf_url ?? '')}" data-download-base="${escapeHtml(fileBaseUrl)}" data-download-name="${escapeHtml(downloadName)}" tabindex="0">
          <td><strong>${escapeHtml(docName)}</strong></td>
          <td><strong>${escapeHtml(company)}</strong> <span class="td-ticker">${escapeHtml(ticker)}</span></td>
          <td>${escapeHtml(analysis.periodTitle || '—')} ${typeBadge} ${languageBadge}</td>
          <td>${formatHistoryDate(analysis.period_end)}</td>
          <td>${formatHistoryDate(analysis.created_at)}</td>
          <td><span class="table-status done"><i></i> Completado</span></td>
          <td>
            <div class="history-actions">
              ${analysis.pdf_url ? '<button class="row-action" type="button" data-action="view">Ver</button>' : ''}
              ${analysis.pdf_url ? '<button class="row-action" type="button" data-action="pdf">PDF</button>' : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    renderHistoryPagination(sorted.length, totalPages);
  }

  function setSort(key) {
    if (historySort.key === key) {
      historySort.dir = historySort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      historySort.key = key;
      historySort.dir = 'asc';
    }
  }

  function setPage(page) {
    historyPage = page;
  }

  window.AnalisisHistory = {
    renderHistory,
    setSort,
    setPage,
    isAnalysisAnnual,
  };
})();
