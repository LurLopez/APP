/**
 * @fileoverview Cableado interactivo de eventos, render dinámico y ciclo de vida
 * del Centro de Control de Reportes e Incidencias.
 */

(function (window) {
  'use strict';

  const RS = window.ReportsState;
  const MAX_IMAGES = 3;
  const R = () => window.ReportsRender;
  const Actions = () => window.ReportsActions || window;

  const fetchStats = (...args) => (Actions().fetchStats || window.fetchStats)(...args);
  const fetchAiReports = (...args) => (Actions().fetchAiReports || window.fetchAiReports)(...args);
  const fetchGeneralReports = (...args) => (Actions().fetchGeneralReports || window.fetchGeneralReports)(...args);
  const openGeneralModal = (...args) => (Actions().openGeneralModal || window.openGeneralModal)(...args);
  const closeGeneralModal = (...args) => (Actions().closeGeneralModal || window.closeGeneralModal)(...args);
  const submitGeneralReport = (...args) => (Actions().submitGeneralReport || window.submitGeneralReport)(...args);

  function toggleSelection(selection, id, checked) {
    if (checked) selection.add(id);
    else selection.delete(id);
  }

  function navigateToAnalysis() {
    document.querySelectorAll('.nav-link[data-section]').forEach((item) => {
      item.classList.toggle('active', item.dataset.section === 'analisis');
    });
    window.showSection?.('analisis');
    history.pushState(null, '', '/analisis');
  }

  async function deleteReport({ url, successMessage, failureMessage, refresh }) {
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) return;
      window.showToast?.(successMessage);
      await refresh();
      await fetchStats();
      render();
    } catch {
      window.showToast?.(failureMessage);
    }
  }

  function wireDebouncedSearch(input, applyQuery) {
    if (!input) return;
    let debounceTimer = null;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        applyQuery(input.value);
        render();
      }, 200);
    });
  }

  function wireSortableHeaders(container, selector, fieldKey, orderKey) {
    container.querySelectorAll(selector).forEach((header) => {
      header.addEventListener('click', () => {
        const field = header.dataset.sort;
        if (RS[fieldKey] === field) {
          RS[orderKey] = RS[orderKey] === 'asc' ? 'desc' : 'asc';
        } else {
          RS[fieldKey] = field;
          RS[orderKey] = 'desc';
        }
        render();
      });
    });
  }

  // ── Navegación principal y KPI ────────────────────────────────────────────

  function wireMainNavigation(container) {
    container.querySelectorAll('.reports-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        RS.activeTab = btn.dataset.tab;
        render();
      });
    });

    container.querySelector('#btn-global-refresh')?.addEventListener('click', () => window.syncAll?.());
    container.querySelector('#btn-global-export-csv')?.addEventListener('click', () => window.exportToCsv?.());
    container.querySelector('#btn-global-new-report')?.addEventListener('click', () => window.openGeneralModal?.());

    const kpiActions = {
      analyses: () => {
        RS.activeTab = 'ai';
        RS.aiSubView = 'table';
        RS.aiFilterMode = 'all';
        RS.aiSearchQuery = '';
      },
      ratings: () => {
        RS.activeTab = 'ai';
        RS.aiSubView = 'table';
        RS.aiFilterMode = 'rated';
      },
      'ai-pending': () => {
        RS.activeTab = 'ai';
        RS.aiSubView = 'errors';
        RS.aiFilterMode = 'all';
      },
      'general-pending': () => {
        RS.activeTab = 'general';
        RS.generalStatusFilter = 'pending';
      },
    };

    container.querySelectorAll('.stat-card-interactive').forEach((card) => {
      card.addEventListener('click', () => {
        const action = kpiActions[card.dataset.statTarget];
        if (!action) return;
        action();
        render();
      });
    });
  }

  // ── Pestaña IA ────────────────────────────────────────────────────────────

  function wireAiSubviewControls(container) {
    container.querySelectorAll('.subview-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        RS.aiSubView = btn.dataset.subview;
        RS.aiPage = 1;
        render();
      });
    });

    wireDebouncedSearch(container.querySelector('#reports-ai-search'), (value) => {
      RS.aiSearchQuery = value;
      RS.aiPage = 1;
    });

    container.querySelector('#btn-clear-ai-search')?.addEventListener('click', () => {
      RS.aiSearchQuery = '';
      RS.aiPage = 1;
      render();
    });

    container.querySelectorAll('[data-filter-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        RS.aiFilterMode = btn.dataset.filterMode;
        RS.aiPage = 1;
        render();
      });
    });

    wireSortableHeaders(container, '.th-sortable[data-prefix="ai"]', 'aiSortField', 'aiSortOrder');
  }

  function wireAiSelection(container) {
    const selectAllAi = container.querySelector('#select-all-ai');
    if (selectAllAi) {
      selectAllAi.addEventListener('change', () => {
        container.querySelectorAll('.ai-item-checkbox').forEach((checkbox) => {
          toggleSelection(RS.selectedAiItems, Number(checkbox.dataset.analysisId), selectAllAi.checked);
        });
        render();
      });
    }

    container.querySelectorAll('.ai-item-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        toggleSelection(RS.selectedAiItems, Number(checkbox.dataset.analysisId), checkbox.checked);
        render();
      });
    });

    const selectAllErrors = container.querySelector('#select-all-ai-errors');
    if (selectAllErrors) {
      selectAllErrors.addEventListener('change', () => {
        container.querySelectorAll('.ai-error-checkbox').forEach((checkbox) => {
          toggleSelection(RS.selectedAiItems, Number(checkbox.dataset.errorId), selectAllErrors.checked);
        });
        render();
      });
    }

    container.querySelectorAll('.ai-error-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        toggleSelection(RS.selectedAiItems, Number(checkbox.dataset.errorId), checkbox.checked);
        render();
      });
    });
  }

  function wireAiAnalysisActions(container) {
    container.querySelectorAll('.btn-view-analysis').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateToAnalysis();
        window.AnalysisModule?.runFilingAnalysis(btn.dataset.ticker, btn.dataset.accession);
      });
    });

    container.querySelectorAll('.btn-regenerate-analysis').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (RS.isGenerating) return;
        const msg = `Estás a punto de volver a generar el informe de ${btn.dataset.ticker} (${btn.dataset.accession}) consultando SEC EDGAR.\n\n¿Deseas continuar?`;
        if (!confirm(msg)) return;
        navigateToAnalysis();
        window.AnalysisModule?.runFilingAnalysis(btn.dataset.ticker, btn.dataset.accession, { force: true });
      });
    });

    container.querySelectorAll('.btn-delete-analysis').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`¿Eliminar definitivamente el análisis de ${btn.dataset.ticker} (${btn.dataset.period})?`)) return;
        await deleteReport({
          url: '/api/admin/reports/ai-analysis/' + btn.dataset.analysisId,
          successMessage: 'Informe de análisis eliminado con éxito.',
          failureMessage: 'Error al eliminar informe.',
          refresh: fetchAiReports,
        });
      });
    });

    container.querySelectorAll('.btn-open-analysis-errors').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const analysisId = Number(btn.dataset.analysisId);
        const item = RS.aiData?.rawList?.find((analysis) => analysis.id === analysisId);
        if (item) {
          RS.aiSearchQuery = item.ticker;
          RS.aiSubView = 'errors';
          render();
        }
      });
    });

    container.querySelectorAll('.res-error-status-select').forEach((select) => {
      select.addEventListener('change', (e) => {
        e.stopPropagation();
        window.updateAiError(select.dataset.errorId, { status: select.value });
      });
    });

    container.querySelectorAll('.btn-open-error-drawer').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const errorId = Number(btn.dataset.errorId);
        let foundError = null;
        let foundParent = null;

        (RS.aiData?.rawList || []).forEach((analysis) => {
          (analysis.error_reports || []).forEach((error) => {
            if (error.id === errorId) {
              foundError = error;
              foundParent = analysis;
            }
          });
        });

        if (foundError) {
          window.openDrawer({ item: foundError, type: 'ai-error', parent: foundParent });
        }
      });
    });

    container.querySelectorAll('.btn-del-error').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('¿Eliminar este reporte de incidencia?')) return;
        await deleteReport({
          url: '/api/admin/reports/ai/' + btn.dataset.errorId,
          successMessage: 'Incidencia eliminada con éxito.',
          failureMessage: 'Error al eliminar incidencia.',
          refresh: fetchAiReports,
        });
      });
    });
  }

  function wireCompanyAccordion(container) {
    container.querySelectorAll('[data-toggle-company]').forEach((header) => {
      header.addEventListener('click', () => {
        const ticker = header.dataset.toggleCompany;
        if (RS.expandedCompanies.has(ticker)) {
          RS.expandedCompanies.delete(ticker);
        } else {
          RS.expandedCompanies.add(ticker);
        }
        render();
      });
    });

    container.querySelector('#btn-toggle-all-companies')?.addEventListener('click', () => {
      RS.allCompaniesExpanded = !RS.allCompaniesExpanded;
      if (!RS.allCompaniesExpanded) RS.expandedCompanies.clear();
      render();
    });
  }

  function wireAiTab(container) {
    wireAiSubviewControls(container);
    wireAiSelection(container);
    wireAiAnalysisActions(container);
    wireCompanyAccordion(container);
  }

  // ── Pestaña General ───────────────────────────────────────────────────────

  function wireGeneralFilters(container) {
    container.querySelectorAll('.status-tab-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        RS.generalStatusFilter = btn.dataset.status;
        RS.generalPage = 1;
        fetchGeneralReports().then(() => render());
      });
    });

    wireDebouncedSearch(container.querySelector('#reports-general-search'), (value) => {
      RS.generalSearchQuery = value;
      RS.generalPage = 1;
    });

    container.querySelector('#btn-clear-gen-search')?.addEventListener('click', () => {
      RS.generalSearchQuery = '';
      RS.generalPage = 1;
      render();
    });

    container.querySelector('#general-filter-category')?.addEventListener('change', (e) => {
      RS.generalCategoryFilter = e.target.value;
      RS.generalPage = 1;
      render();
    });

    wireSortableHeaders(container, '.th-sortable[data-prefix="gen"]', 'generalSortField', 'generalSortOrder');
  }

  function wireGeneralSelection(container) {
    const selectAllGeneral = container.querySelector('#select-all-general');
    if (selectAllGeneral) {
      selectAllGeneral.addEventListener('change', () => {
        container.querySelectorAll('.general-item-checkbox').forEach((checkbox) => {
          toggleSelection(RS.selectedGeneralItems, Number(checkbox.dataset.reportId), selectAllGeneral.checked);
        });
        render();
      });
    }

    container.querySelectorAll('.general-item-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        toggleSelection(RS.selectedGeneralItems, Number(checkbox.dataset.reportId), checkbox.checked);
        render();
      });
    });
  }

  function wireGeneralRowActions(container) {
    container.querySelectorAll('.general-status-select').forEach((select) => {
      select.addEventListener('change', (e) => {
        e.stopPropagation();
        window.updateGeneralReport(select.dataset.reportId, { status: select.value });
      });
    });

    container.querySelectorAll('.btn-open-general-drawer').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const report = (RS.generalData || []).find((item) => item.id === Number(btn.dataset.reportId));
        if (report) window.openDrawer({ item: report, type: 'general' });
      });
    });

    container.querySelectorAll('.enterprise-row[data-report-id]').forEach((row) => {
      row.addEventListener('click', (e) => {
        // Evitar abrir drawer si el clic fue en un checkbox, select o botón
        if (e.target.closest('input, select, button, a')) return;
        const report = (RS.generalData || []).find((item) => item.id === Number(row.dataset.reportId));
        if (report) window.openDrawer({ item: report, type: 'general' });
      });
    });

    container.querySelectorAll('.btn-delete-general').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('¿Eliminar este reporte general?')) return;
        await deleteReport({
          url: '/api/admin/reports/general/' + btn.dataset.reportId,
          successMessage: 'Reporte eliminado con éxito.',
          failureMessage: 'Error al eliminar reporte.',
          refresh: fetchGeneralReports,
        });
      });
    });
  }

  function wireGeneralTab(container) {
    wireGeneralFilters(container);
    wireGeneralSelection(container);
    wireGeneralRowActions(container);
  }

  // ── Acciones masivas (bulk actions) ───────────────────────────────────────

  function resolveBulkTargets(type) {
    if (type === 'general') {
      return {
        items: Array.from(RS.selectedGeneralItems),
        update: window.batchUpdateGeneralReports,
        remove: window.batchDeleteGeneralReports,
      };
    }
    return {
      items: Array.from(RS.selectedAiItems),
      update: window.batchUpdateAiErrors,
      remove: window.batchDeleteAiErrors,
    };
  }

  function wireBulkButtons(container, selector, onAction) {
    container.querySelectorAll(selector).forEach((btn) => {
      btn.addEventListener('click', () => onAction(btn.dataset.bulkType));
    });
  }

  function wireBulkActions(container) {
    const updateStatus = (status) => (type) => {
      const targets = resolveBulkTargets(type);
      targets.update(targets.items, { status });
    };
    const removeItems = (type) => {
      const targets = resolveBulkTargets(type);
      targets.remove(targets.items);
    };

    wireBulkButtons(container, '.btn-bulk-resolve', updateStatus('resolved'));
    wireBulkButtons(container, '.btn-bulk-review', updateStatus('reviewed'));
    wireBulkButtons(container, '.btn-bulk-dismiss', updateStatus('dismissed'));
    wireBulkButtons(container, '.btn-bulk-delete', removeItems);
    wireBulkButtons(container, '.btn-bulk-clear', () => {
      RS.selectedGeneralItems.clear();
      RS.selectedAiItems.clear();
      render();
    });
  }

  // ── Paginación ────────────────────────────────────────────────────────────

  function wirePagination(container) {
    container.querySelectorAll('.pagination-btn, .pagination-page-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetPage = Number(btn.dataset.page);
        if (!targetPage || Number.isNaN(targetPage)) return;
        if (btn.dataset.prefix === 'ai') {
          RS.aiPage = targetPage;
        } else {
          RS.generalPage = targetPage;
        }
        render();
      });
    });

    container.querySelectorAll('.pagination-size-select').forEach((select) => {
      select.addEventListener('change', () => {
        const newSize = Number(select.value) || 25;
        if (select.dataset.prefix === 'ai') {
          RS.aiPageSize = newSize;
          RS.aiPage = 1;
        } else {
          RS.generalPageSize = newSize;
          RS.generalPage = 1;
        }
        render();
      });
    });
  }

  // ── Drawer de detalle ─────────────────────────────────────────────────────

  function wireDrawerSave(container) {
    container.querySelector('#btn-save-drawer-notes')?.addEventListener('click', async () => {
      const notesEl = container.querySelector('#drawer-admin-notes');
      const selectedStatusEl = container.querySelector('input[name="drawer-status"]:checked');
      const feedbackEl = container.querySelector('#drawer-save-feedback');

      const adminNotes = notesEl?.value || '';
      const status = selectedStatusEl?.value;
      const itemId = RS.drawerItem?.id;
      const isGeneral = RS.drawerType === 'general';
      if (!itemId) return;

      if (feedbackEl) feedbackEl.textContent = 'Guardando...';

      if (isGeneral) {
        await window.updateGeneralReport(itemId, { status, adminNotes });
      } else {
        await window.updateAiError(itemId, { status, adminNotes });
      }

      if (feedbackEl) {
        feedbackEl.textContent = 'Guardado con éxito ✓';
        setTimeout(() => {
          if (feedbackEl) feedbackEl.textContent = '';
        }, 2000);
      }
    });
  }

  function wireDrawerDelete(container) {
    container.querySelector('#btn-drawer-delete')?.addEventListener('click', async () => {
      const itemId = RS.drawerItem?.id;
      const isGeneral = RS.drawerType === 'general';
      if (!itemId) return;
      if (!confirm('¿Eliminar definitivamente este reporte?')) return;

      try {
        const url = isGeneral ? `/api/admin/reports/general/${itemId}` : `/api/admin/reports/ai/${itemId}`;
        const res = await fetch(url, { method: 'DELETE' });
        if (res.ok) {
          window.showToast?.('Eliminado con éxito.');
          window.closeDrawer?.();
          if (isGeneral) await fetchGeneralReports();
          else await fetchAiReports();
          await fetchStats();
          render();
        }
      } catch {
        window.showToast?.('Error al eliminar.');
      }
    });
  }

  function wireDrawer(container) {
    container.querySelector('#btn-close-drawer')?.addEventListener('click', () => window.closeDrawer?.());
    container.querySelector('#btn-drawer-cancel')?.addEventListener('click', () => window.closeDrawer?.());
    container.querySelector('#reports-drawer-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'reports-drawer-backdrop') window.closeDrawer?.();
    });

    wireDrawerSave(container);
    wireDrawerDelete(container);

    container.querySelectorAll('.drawer-image-thumb-wrap').forEach((thumb) => {
      thumb.addEventListener('click', () => window.openLightbox?.(thumb.dataset.imgSrc));
    });

    container.querySelector('.btn-open-analysis-from-drawer')?.addEventListener('click', (e) => {
      const ticker = e.currentTarget.dataset.ticker;
      const accession = e.currentTarget.dataset.accession;
      window.closeDrawer?.();
      navigateToAnalysis();
      window.AnalysisModule?.runFilingAnalysis(ticker, accession);
    });
  }

  // ── Lightbox de imágenes ──────────────────────────────────────────────────

  function wireLightbox(container) {
    container.querySelector('#btn-close-lightbox')?.addEventListener('click', () => window.closeLightbox?.());
    container.querySelector('#reports-lightbox-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'reports-lightbox-backdrop' || e.target.classList.contains('reports-lightbox-content')) {
        window.closeLightbox?.();
      }
    });
  }

  function wireEvents(container) {
    if (!container) return;
    wireMainNavigation(container);
    wireAiTab(container);
    wireGeneralTab(container);
    wireBulkActions(container);
    wirePagination(container);
    wireDrawer(container);
    wireLightbox(container);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  async function loadReportsData() {
    if (!RS.statsData) await fetchStats();
    if (RS.activeTab === 'ai' && !RS.aiData) await fetchAiReports();
    if (RS.activeTab === 'general' && !RS.generalData) await fetchGeneralReports();
  }

  function buildActiveTabHtml() {
    if (RS.activeTab === 'ai') {
      return R().renderAiTab({
        aiData: RS.aiData,
        aiSubView: RS.aiSubView,
        aiFilterMode: RS.aiFilterMode,
        aiSearchQuery: RS.aiSearchQuery,
        aiSortField: RS.aiSortField,
        aiSortOrder: RS.aiSortOrder,
        aiPage: RS.aiPage,
        aiPageSize: RS.aiPageSize,
        selectedAiItems: RS.selectedAiItems,
        expandedCompanies: RS.expandedCompanies,
        allCompaniesExpanded: RS.allCompaniesExpanded,
      });
    }
    return R().renderGeneralTab({
      generalData: RS.generalData,
      generalTotal: RS.generalTotal,
      generalStatusFilter: RS.generalStatusFilter,
      generalCategoryFilter: RS.generalCategoryFilter,
      generalSearchQuery: RS.generalSearchQuery,
      generalSortField: RS.generalSortField,
      generalSortOrder: RS.generalSortOrder,
      generalPage: RS.generalPage,
      generalPageSize: RS.generalPageSize,
      selectedGeneralItems: RS.selectedGeneralItems,
      statsData: RS.statsData,
    });
  }

  function buildReportsHtml() {
    const drawerHtml = RS.drawerOpen
      ? R().renderDrawer({ item: RS.drawerItem, type: RS.drawerType, parent: RS.drawerItemParent })
      : '';
    const lightboxHtml = RS.lightboxOpen ? R().renderLightbox(RS.lightboxSrc) : '';

    return `
      <div class="reports-page-wrapper enterprise-dashboard">
        ${R().renderHeader({
          statsData: RS.statsData,
          activeTab: RS.activeTab,
          lastSyncTime: RS.lastSyncTime,
          isRefreshing: RS.isRefreshing,
        })}
        ${R().renderStatsCards(RS.statsData)}
        ${buildActiveTabHtml()}
        ${drawerHtml}
        ${lightboxHtml}
      </div>
    `;
  }

  function renderUnauthorized(container) {
    container.innerHTML = `
      <div class="reports-unauthorized-card">
        <div class="unauthorized-icon">🔒</div>
        <h2>Acceso exclusivo a administradores</h2>
        <p>Esta consola está reservada al equipo de administración y auditoría de Cifra.</p>
        <button type="button" class="primary-button" onclick="window.AuthModule?.openModal?.('login')">Iniciar sesión como administrador</button>
      </div>
    `;
  }

  async function render() {
    const container = document.querySelector('#section-reportes');
    if (!container) return;

    if (window.AuthModule?.whenReady) await window.AuthModule.whenReady();
    const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || window.currentUser?.isAdmin);
    if (!isAdmin) {
      renderUnauthorized(container);
      return;
    }

    try {
      await loadReportsData();
      container.innerHTML = buildReportsHtml();
      wireEvents(container);
    } catch (err) {
      console.error('[reports] Error al renderizar consola de reportes:', err);
    }
  }

  function init() {
    RS.generalModal = document.querySelector('#app-report-modal-backdrop');
    document.querySelector('#app-report-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      openGeneralModal();
    });
    document.querySelector('#app-report-modal-close')?.addEventListener('click', closeGeneralModal);
    document.querySelector('#app-report-cancel-btn')?.addEventListener('click', closeGeneralModal);
    RS.generalModal?.addEventListener('click', (e) => e.target === RS.generalModal && closeGeneralModal());

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (RS.lightboxOpen) {
        window.closeLightbox?.();
        return;
      }
      if (RS.drawerOpen) {
        window.closeDrawer?.();
        return;
      }
      if (RS.generalModal && !RS.generalModal.hidden) {
        closeGeneralModal();
      }
    });

    document.querySelector('#app-report-form')?.addEventListener('submit', submitGeneralReport);

    RS.generalAttachmentMgr = window.ImageAttachmentManager.createImageAttachmentManager({
      dropzoneEl: document.querySelector('#app-report-dropzone'),
      inputEl: document.querySelector('#app-report-file-input'),
      previewEl: document.querySelector('#app-report-previews'),
      maxImages: MAX_IMAGES,
    });

    window.addEventListener('paste', (e) => {
      if (RS.generalModal && !RS.generalModal.hidden && RS.generalAttachmentMgr?.handlePasteEvent(e)) {
        window.showToast?.('Captura de pantalla pegada.');
      }
    });

    window.addEventListener('auth:change', () => {
      const section = document.querySelector('#section-reportes');
      if (section && !section.hidden) {
        RS.aiData = null;
        RS.generalData = null;
        RS.statsData = null;
        render();
      }
    });
  }

  const ReportsModule = {
    init,
    render,
    wireEvents,
    open: openGeneralModal,
    close: closeGeneralModal,
    createImageAttachmentManager: (...args) => window.ImageAttachmentManager?.createImageAttachmentManager?.(...args),
    fetchStats,
    fetchAiReports,
    fetchGeneralReports,
    syncAll: (...args) => (Actions().syncAll || window.syncAll)(...args),
    exportToCsv: (...args) => (Actions().exportToCsv || window.exportToCsv)(...args),
    openDrawer: (...args) => (Actions().openDrawer || window.openDrawer)(...args),
    closeDrawer: (...args) => (Actions().closeDrawer || window.closeDrawer)(...args),
  };

  window.ReportsModule = ReportsModule;
  window.AdminReportsModule = ReportsModule;
  window.reportsModuleInit = init;
  window.reportsModuleRender = render;
  window.wireEvents = wireEvents;
  window.render = render;
  window.init = init;
  window.MAX_IMAGES = MAX_IMAGES;
  window.R = R;

})(window);
