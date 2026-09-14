/**
 * @fileoverview Control de versiones de análisis de filings SEC, dropdown y caché de versiones.
 * @module AnalisisVersions
 */

(function () {
  'use strict';

  let currentAnalysisVersions = [];
  const analysisVersionsCache = new Map();
  let pendingVersionsMenuOpen = false;

  function escapeHtml(val) {
    return window.AnalisisTables ? window.AnalisisTables.escapeHtml(val) : String(val ?? '');
  }

  function downloadReport(format, baseUrl, name = 'analisis-cifra') {
    if (!baseUrl || !['pdf', 'docx', 'odt', 'html'].includes(format)) return;
    const link = document.createElement('a');
    const safeName = encodeURIComponent(name);
    link.href = `${baseUrl}.${format}?download=1&name=${safeName}`;
    link.download = `${name}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function renderAnalysisVersionsMenu(currentAnalysisId) {
    const menu = document.querySelector('#analysis-versions-menu');
    if (!menu) return;
    if (!currentAnalysisVersions.length) {
      menu.innerHTML = '<div class="analysis-versions-empty">Todavía no hay versiones guardadas.</div>';
      return;
    }
    menu.innerHTML = currentAnalysisVersions.map((entry) => {
      const isActive = String(entry.id) === String(currentAnalysisId);
      const isReviewed = Boolean(entry.isReviewed ?? entry.is_reviewed);
      const reviewedBadge = isReviewed
        ? '<span class="analysis-reviewed-mini-badge" title="Revisado por un humano">✓ Revisado</span>'
        : '';
      const versionLabel = entry.version ? `v${escapeHtml(entry.version)}` : 'Sin versión';
      const dateLabel = entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('es-ES') : '';
      const base = entry.downloadBase ? String(entry.downloadBase) : '';
      return `
        <div class="analysis-version-item${isActive ? ' active' : ''}" data-version-id="${escapeHtml(entry.id)}">
          <div class="analysis-version-item-data">
            <strong>${versionLabel}${isActive ? ' · actual' : ''} ${reviewedBadge}</strong>
            <span>${escapeHtml(dateLabel)}${entry.modelUsed ? ` · ${escapeHtml(entry.modelUsed)}` : ''}</span>
          </div>
          <div class="analysis-version-item-actions">
            <button type="button" class="row-action" data-version-action="view" title="Ver esta versión"${isActive ? ' disabled' : ''}>Ver</button>
            ${base ? '<button type="button" class="row-action" data-version-action="pdf" title="Descargar PDF">PDF</button><button type="button" class="row-action" data-version-action="docx" title="Descargar Word">DOCX</button>' : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function openAnalysisVersionsMenu(currentAnalysisId) {
    const toggle = document.querySelector('#analysis-versions-toggle');
    const menu = document.querySelector('#analysis-versions-menu');
    if (!toggle || !menu) return;
    if (toggle.hidden) {
      pendingVersionsMenuOpen = true;
      return;
    }
    pendingVersionsMenuOpen = false;
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    renderAnalysisVersionsMenu(currentAnalysisId);
  }

  function closeAnalysisVersionsMenu() {
    pendingVersionsMenuOpen = false;
    const menu = document.querySelector('#analysis-versions-menu');
    if (menu && !menu.hidden) menu.hidden = true;
    document.querySelector('#analysis-versions-toggle')?.setAttribute('aria-expanded', 'false');
  }

  window.AnalisisVersions = {
    downloadReport,
    renderAnalysisVersionsMenu,
    openAnalysisVersionsMenu,
    closeAnalysisVersionsMenu,
    getVersions: () => currentAnalysisVersions,
    setVersions: (v) => { currentAnalysisVersions = v; },
    getCache: () => analysisVersionsCache,
  };
})();
