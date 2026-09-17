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

  function wireEvents(container) {
    if (!container) return;

    // ── Navegación de Pestañas Principales ──────────────────────────────────
    container.querySelectorAll('.reports-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        RS.activeTab = btn.dataset.tab;
        render();
      });
    });

    // ── Botones de Encabezado Global ──────────────────────────────────────
    container.querySelector('#btn-global-refresh')?.addEventListener('click', () => {
      window.syncAll?.();
    });

    container.querySelector('#btn-global-export-csv')?.addEventListener('click', () => {
      window.exportToCsv?.();
    });

    container.querySelector('#btn-global-new-report')?.addEventListener('click', () => {
      window.openGeneralModal?.();
    });

    // ── Clic en Tarjetas KPI para Filtrado Rápido ─────────────────────────
    container.querySelectorAll('.stat-card-interactive').forEach((card) => {
      card.addEventListener('click', () => {
        const target = card.dataset.statTarget;
        if (target === 'analyses') {
          RS.activeTab = 'ai';
          RS.aiSubView = 'table';
          RS.aiFilterMode = 'all';
          RS.aiSearchQuery = '';
          render();
        } else if (target === 'ratings') {
          RS.activeTab = 'ai';
          RS.aiSubView = 'table';
          RS.aiFilterMode = 'rated';
          render();
        } else if (target === 'ai-pending') {
          RS.activeTab = 'ai';
          RS.aiSubView = 'errors';
          RS.aiFilterMode = 'all';
          render();
        } else if (target === 'general-pending') {
          RS.activeTab = 'general';
          RS.generalStatusFilter = 'pending';
          render();
        }
      });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // EVENTOS PESTAÑA IA
    // ═════════════════════════════════════════════════════════════════════════

    // Sub-view Switcher (Tabla, Incidencias, Empresas)
    container.querySelectorAll('.subview-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        RS.aiSubView = btn.dataset.subview;
        RS.aiPage = 1;
        render();
      });
    });

    // Buscador con debounce en IA
    const aiSearchInput = container.querySelector('#reports-ai-search');
    if (aiSearchInput) {
      let debounceTimer = null;
      aiSearchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          RS.aiSearchQuery = aiSearchInput.value;
          RS.aiPage = 1;
          render();
        }, 200);
      });
    }

    container.querySelector('#btn-clear-ai-search')?.addEventListener('click', () => {
      RS.aiSearchQuery = '';
      RS.aiPage = 1;
      render();
    });

    // Chips de filtrado rápido
    container.querySelectorAll('[data-filter-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        RS.aiFilterMode = btn.dataset.filterMode;
        RS.aiPage = 1;
        render();
      });
    });

    // Ordenación por columnas en IA
    container.querySelectorAll('.th-sortable[data-prefix="ai"]').forEach((th) => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (RS.aiSortField === field) {
          RS.aiSortOrder = RS.aiSortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          RS.aiSortField = field;
          RS.aiSortOrder = 'desc';
        }
        render();
      });
    });

    // Selección masiva en Tabla IA
    const selectAllAi = container.querySelector('#select-all-ai');
    if (selectAllAi) {
      selectAllAi.addEventListener('change', () => {
        const checkboxes = container.querySelectorAll('.ai-item-checkbox');
        checkboxes.forEach((cb) => {
          const id = Number(cb.dataset.analysisId);
          if (selectAllAi.checked) {
            RS.selectedAiItems.add(id);
          } else {
            RS.selectedAiItems.delete(id);
          }
        });
        render();
      });
    }

    container.querySelectorAll('.ai-item-checkbox').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const id = Number(cb.dataset.analysisId);
        if (cb.checked) RS.selectedAiItems.add(id);
        else RS.selectedAiItems.delete(id);
        render();
      });
    });

    // Selección masiva en Incidencias IA
    const selectAllAiErrors = container.querySelector('#select-all-ai-errors');
    if (selectAllAiErrors) {
      selectAllAiErrors.addEventListener('change', () => {
        const checkboxes = container.querySelectorAll('.ai-error-checkbox');
        checkboxes.forEach((cb) => {
          const id = Number(cb.dataset.errorId);
          if (selectAllAiErrors.checked) {
            RS.selectedAiItems.add(id);
          } else {
            RS.selectedAiItems.delete(id);
          }
        });
        render();
      });
    }

    container.querySelectorAll('.ai-error-checkbox').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const id = Number(cb.dataset.errorId);
        if (cb.checked) RS.selectedAiItems.add(id);
        else RS.selectedAiItems.delete(id);
        render();
      });
    });

    // Acciones de fila en Análisis IA
    container.querySelectorAll('.btn-view-analysis').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.nav-link[data-section]').forEach((item) => {
          item.classList.toggle('active', item.dataset.section === 'analisis');
        });
        window.showSection?.('analisis');
        history.pushState(null, '', '/analisis');
        window.AnalysisModule?.runFilingAnalysis(btn.dataset.ticker, btn.dataset.accession);
      });
    });

    container.querySelectorAll('.btn-regenerate-analysis').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (RS.isGenerating) return;
        const msg = `Estás a punto de volver a generar el informe de ${btn.dataset.ticker} (${btn.dataset.accession}) consultando SEC EDGAR.\n\n¿Deseas continuar?`;
        if (!confirm(msg)) return;
        document.querySelectorAll('.nav-link[data-section]').forEach((item) => {
          item.classList.toggle('active', item.dataset.section === 'analisis');
        });
        window.showSection?.('analisis');
        history.pushState(null, '', '/analisis');
        window.AnalysisModule?.runFilingAnalysis(btn.dataset.ticker, btn.dataset.accession, { force: true });
      });
    });

    container.querySelectorAll('.btn-delete-analysis').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`¿Eliminar definitivamente el análisis de ${btn.dataset.ticker} (${btn.dataset.period})?`)) return;
        try {
          const res = await fetch('/api/admin/reports/ai-analysis/' + btn.dataset.analysisId, { method: 'DELETE' });
          if (res.ok) {
            window.showToast?.('Informe de análisis eliminado con éxito.');
            await fetchAiReports();
            await fetchStats();
            render();
          }
        } catch {
          window.showToast?.('Error al eliminar informe.');
        }
      });
    });

    // Abrir incidencias de un análisis en subview de incidencias
    container.querySelectorAll('.btn-open-analysis-errors').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const analysisId = Number(btn.dataset.analysisId);
        const item = RS.aiData?.rawList?.find((a) => a.id === analysisId);
        if (item) {
          RS.aiSearchQuery = item.ticker;
          RS.aiSubView = 'errors';
          render();
        }
      });
    });

    // Selector rápido de estado en incidencias de IA
    container.querySelectorAll('.res-error-status-select').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        e.stopPropagation();
        window.updateAiError(sel.dataset.errorId, { status: sel.value });
      });
    });

    // Abrir Drawer de Incidencia IA
    container.querySelectorAll('.btn-open-error-drawer').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const errorId = Number(btn.dataset.errorId);
        let foundError = null;
        let foundParent = null;

        (RS.aiData?.rawList || []).forEach((analysis) => {
          (analysis.error_reports || []).forEach((err) => {
            if (err.id === errorId) {
              foundError = err;
              foundParent = analysis;
            }
          });
        });

        if (foundError) {
          window.openDrawer({
            item: foundError,
            type: 'ai-error',
            parent: foundParent,
          });
        }
      });
    });

    container.querySelectorAll('.btn-del-error').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('¿Eliminar este reporte de incidencia?')) return;
        try {
          const res = await fetch('/api/admin/reports/ai/' + btn.dataset.errorId, { method: 'DELETE' });
          if (res.ok) {
            window.showToast?.('Incidencia eliminada con éxito.');
            await fetchAiReports();
            await fetchStats();
            render();
          }
        } catch {
          window.showToast?.('Error al eliminar incidencia.');
        }
      });
    });

    // Acordeón de empresas
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

    // ═════════════════════════════════════════════════════════════════════════
    // EVENTOS PESTAÑA GENERAL
    // ═════════════════════════════════════════════════════════════════════════

    // Botones segmentados de estado
    container.querySelectorAll('.status-tab-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        RS.generalStatusFilter = btn.dataset.status;
        RS.generalPage = 1;
        fetchGeneralReports().then(() => render());
      });
    });

    // Buscador en reportes generales
    const genSearchInput = container.querySelector('#reports-general-search');
    if (genSearchInput) {
      let debounceTimer = null;
      genSearchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          RS.generalSearchQuery = genSearchInput.value;
          RS.generalPage = 1;
          render();
        }, 200);
      });
    }

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

    // Ordenación por columnas en reportes generales
    container.querySelectorAll('.th-sortable[data-prefix="gen"]').forEach((th) => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (RS.generalSortField === field) {
          RS.generalSortOrder = RS.generalSortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          RS.generalSortField = field;
          RS.generalSortOrder = 'desc';
        }
        render();
      });
    });

    // Selección masiva en Reportes Generales
    const selectAllGen = container.querySelector('#select-all-general');
    if (selectAllGen) {
      selectAllGen.addEventListener('change', () => {
        const checkboxes = container.querySelectorAll('.general-item-checkbox');
        checkboxes.forEach((cb) => {
          const id = Number(cb.dataset.reportId);
          if (selectAllGen.checked) {
            RS.selectedGeneralItems.add(id);
          } else {
            RS.selectedGeneralItems.delete(id);
          }
        });
        render();
      });
    }

    container.querySelectorAll('.general-item-checkbox').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const id = Number(cb.dataset.reportId);
        if (cb.checked) RS.selectedGeneralItems.add(id);
        else RS.selectedGeneralItems.delete(id);
        render();
      });
    });

    // Selector rápido de estado en tabla general
    container.querySelectorAll('.general-status-select').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        e.stopPropagation();
        window.updateGeneralReport(sel.dataset.reportId, { status: sel.value });
      });
    });

    // Abrir Drawer desde botón o clic en fila general
    container.querySelectorAll('.btn-open-general-drawer').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const reportId = Number(btn.dataset.reportId);
        const report = (RS.generalData || []).find((r) => r.id === reportId);
        if (report) {
          window.openDrawer({ item: report, type: 'general' });
        }
      });
    });

    container.querySelectorAll('.enterprise-row[data-report-id]').forEach((row) => {
      row.addEventListener('click', (e) => {
        // Evitar abrir drawer si el clic fue en un checkbox, select o botón
        if (e.target.closest('input, select, button, a')) return;
        const reportId = Number(row.dataset.reportId);
        const report = (RS.generalData || []).find((r) => r.id === reportId);
        if (report) {
          window.openDrawer({ item: report, type: 'general' });
        }
      });
    });

    container.querySelectorAll('.btn-delete-general').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('¿Eliminar este reporte general?')) return;
        try {
          const res = await fetch('/api/admin/reports/general/' + btn.dataset.reportId, { method: 'DELETE' });
          if (res.ok) {
            window.showToast?.('Reporte eliminado con éxito.');
            await fetchGeneralReports();
            await fetchStats();
            render();
          }
        } catch {
          window.showToast?.('Error al eliminar reporte.');
        }
      });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // ACCIONES MASIVAS (BULK ACTIONS)
    // ═════════════════════════════════════════════════════════════════════════

    container.querySelectorAll('.btn-bulk-resolve').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.bulkType;
        if (type === 'general') {
          window.batchUpdateGeneralReports(Array.from(RS.selectedGeneralItems), { status: 'resolved' });
        } else if (type === 'ai-errors') {
          window.batchUpdateAiErrors(Array.from(RS.selectedAiItems), { status: 'resolved' });
        }
      });
    });

    container.querySelectorAll('.btn-bulk-review').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.bulkType;
        if (type === 'general') {
          window.batchUpdateGeneralReports(Array.from(RS.selectedGeneralItems), { status: 'reviewed' });
        } else if (type === 'ai-errors') {
          window.batchUpdateAiErrors(Array.from(RS.selectedAiItems), { status: 'reviewed' });
        }
      });
    });

    container.querySelectorAll('.btn-bulk-dismiss').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.bulkType;
        if (type === 'general') {
          window.batchUpdateGeneralReports(Array.from(RS.selectedGeneralItems), { status: 'dismissed' });
        } else if (type === 'ai-errors') {
          window.batchUpdateAiErrors(Array.from(RS.selectedAiItems), { status: 'dismissed' });
        }
      });
    });

    container.querySelectorAll('.btn-bulk-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.bulkType;
        if (type === 'general') {
          window.batchDeleteGeneralReports(Array.from(RS.selectedGeneralItems));
        } else if (type === 'ai-errors') {
          window.batchDeleteAiErrors(Array.from(RS.selectedAiItems));
        }
      });
    });

    container.querySelectorAll('.btn-bulk-clear').forEach((btn) => {
      btn.addEventListener('click', () => {
        RS.selectedGeneralItems.clear();
        RS.selectedAiItems.clear();
        render();
      });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PAGINACIÓN
    // ═════════════════════════════════════════════════════════════════════════

    container.querySelectorAll('.pagination-btn, .pagination-page-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const prefix = btn.dataset.prefix;
        const targetPage = Number(btn.dataset.page);
        if (!targetPage || Number.isNaN(targetPage)) return;

        if (prefix === 'ai') {
          RS.aiPage = targetPage;
          render();
        } else {
          RS.generalPage = targetPage;
          render();
        }
      });
    });

    container.querySelectorAll('.pagination-size-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const prefix = sel.dataset.prefix;
        const newSize = Number(sel.value) || 25;
        if (prefix === 'ai') {
          RS.aiPageSize = newSize;
          RS.aiPage = 1;
          render();
        } else {
          RS.generalPageSize = newSize;
          RS.generalPage = 1;
          render();
        }
      });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // SLIDE-OVER DRAWER DE DETALLE
    // ═════════════════════════════════════════════════════════════════════════

    container.querySelector('#btn-close-drawer')?.addEventListener('click', () => {
      window.closeDrawer?.();
    });

    container.querySelector('#btn-drawer-cancel')?.addEventListener('click', () => {
      window.closeDrawer?.();
    });

    container.querySelector('#reports-drawer-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'reports-drawer-backdrop') {
        window.closeDrawer?.();
      }
    });

    // Guardar notas y estado desde el Drawer
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

    // Eliminar desde el Drawer
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

    // Clic en miniaturas del Drawer -> abrir Lightbox
    container.querySelectorAll('.drawer-image-thumb-wrap').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        window.openLightbox?.(thumb.dataset.imgSrc);
      });
    });

    // Abrir análisis desde el Drawer
    container.querySelector('.btn-open-analysis-from-drawer')?.addEventListener('click', (e) => {
      const ticker = e.currentTarget.dataset.ticker;
      const accession = e.currentTarget.dataset.accession;
      window.closeDrawer?.();
      document.querySelectorAll('.nav-link[data-section]').forEach((item) => {
        item.classList.toggle('active', item.dataset.section === 'analisis');
      });
      window.showSection?.('analisis');
      history.pushState(null, '', '/analisis');
      window.AnalysisModule?.runFilingAnalysis(ticker, accession);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // LIGHTBOX DE IMÁGENES
    // ═════════════════════════════════════════════════════════════════════════

    container.querySelector('#btn-close-lightbox')?.addEventListener('click', () => {
      window.closeLightbox?.();
    });

    container.querySelector('#reports-lightbox-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'reports-lightbox-backdrop' || e.target.classList.contains('reports-lightbox-content')) {
        window.closeLightbox?.();
      }
    });
  }

  async function render() {
    const container = document.querySelector('#section-reportes');
    if (!container) return;

    if (window.AuthModule?.whenReady) await window.AuthModule.whenReady();
    const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || window.currentUser?.isAdmin);

    if (!isAdmin) {
      container.innerHTML = `
        <div class="reports-unauthorized-card">
          <div class="unauthorized-icon">🔒</div>
          <h2>Acceso exclusivo a administradores</h2>
          <p>Esta consola está reservada al equipo de administración y auditoría de Cifra.</p>
          <button type="button" class="primary-button" onclick="window.AuthModule?.openModal?.('login')">Iniciar sesión como administrador</button>
        </div>
      `;
      return;
    }

    try {
      if (!RS.statsData) await fetchStats();
      if (RS.activeTab === 'ai' && !RS.aiData) await fetchAiReports();
      if (RS.activeTab === 'general' && !RS.generalData) await fetchGeneralReports();

      const drawerHtml = RS.drawerOpen
        ? R().renderDrawer({ item: RS.drawerItem, type: RS.drawerType, parent: RS.drawerItemParent })
        : '';

      const lightboxHtml = RS.lightboxOpen
        ? R().renderLightbox(RS.lightboxSrc)
        : '';

      container.innerHTML = `
        <div class="reports-page-wrapper enterprise-dashboard">
          ${R().renderHeader({
            statsData: RS.statsData,
            activeTab: RS.activeTab,
            lastSyncTime: RS.lastSyncTime,
            isRefreshing: RS.isRefreshing,
          })}
          ${R().renderStatsCards(RS.statsData)}
          ${RS.activeTab === 'ai'
            ? R().renderAiTab({
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
              })
            : R().renderGeneralTab({
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
              })
          }
          ${drawerHtml}
          ${lightboxHtml}
        </div>
      `;

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
      if (e.key === 'Escape') {
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
