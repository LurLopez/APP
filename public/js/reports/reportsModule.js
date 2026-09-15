/**
 * @fileoverview Cableado, render e inicialización del centro de reportes.
 */

(function (window) {
  const RS = window.ReportsState;
    const MAX_IMAGES = 3;
    const R = () => window.ReportsRender;

  function wireEvents(container) {
    container.querySelectorAll('.reports-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        RS.activeTab = btn.dataset.tab;
        render();
      });
    });

    const aiSearchInput = container.querySelector('#reports-ai-search');
    if (aiSearchInput) {
      let debounce = null;
      aiSearchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          RS.aiSearchQuery = aiSearchInput.value;
          fetchAiReports().then(() => render());
        }, 300);
      });
    }

    container.querySelectorAll('[data-filter-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        RS.aiFilterMode = btn.dataset.filterMode;
        render();
      });
    });

    container.querySelector('#btn-refresh-ai-reports')?.addEventListener('click', async () => {
      await fetchAiReports();
      await fetchStats();
      render();
      window.showToast?.('Lista de análisis de IA actualizada.');
    });

    container.querySelectorAll('.btn-view-analysis').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === 'analisis'));
        window.showSection?.('analisis');
        history.pushState(null, '', '/analisis');
        window.AnalysisModule?.runFilingAnalysis(btn.dataset.ticker, btn.dataset.accession);
      });
    });

    container.querySelectorAll('.btn-regenerate-analysis').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (RS.isGenerating) return;
        const msg = `Estás a punto de volver a generar el informe de ${btn.dataset.ticker} (${btn.dataset.accession}).\n\n¿Deseas continuar?`;
        if (!confirm(msg)) return;
        document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === 'analisis'));
        window.showSection?.('analisis');
        history.pushState(null, '', '/analisis');
        window.AnalysisModule?.runFilingAnalysis(btn.dataset.ticker, btn.dataset.accession, { force: true });
      });
    });

    container.querySelectorAll('.btn-delete-analysis').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(`¿Eliminar definitivamente el análisis de ${btn.dataset.ticker} (${btn.dataset.period})?`)) return;
        const res = await fetch('/api/admin/reports/ai-analysis/' + btn.dataset.analysisId, { method: 'DELETE' });
        if (res.ok) {
          window.showToast?.('Informe eliminado.');
          await fetchAiReports();
          await fetchStats();
          render();
        }
      });
    });

    container.querySelectorAll('.res-error-status-select').forEach((sel) => {
      sel.addEventListener('change', () => updateAiError(sel.dataset.errorId, { status: sel.value }));
    });

    container.querySelectorAll('.btn-save-error-notes').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = container.querySelector(`.res-error-notes-input[data-error-id="${btn.dataset.errorId}"]`);
        updateAiError(btn.dataset.errorId, { adminNotes: input?.value || '' });
      });
    });

    container.querySelectorAll('.btn-del-error').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este reporte de incidencia?')) return;
        const res = await fetch('/api/admin/reports/ai/' + btn.dataset.errorId, { method: 'DELETE' });
        if (res.ok) {
          window.showToast?.('Incidencia eliminada.');
          await fetchAiReports();
          await fetchStats();
          render();
        }
      });
    });

    // Eventos Generales
    const genSearchInput = container.querySelector('#reports-general-search');
    if (genSearchInput) {
      let debounce = null;
      genSearchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          RS.generalSearchQuery = genSearchInput.value;
          fetchGeneralReports().then(() => render());
        }, 300);
      });
    }

    container.querySelector('#general-filter-status')?.addEventListener('change', (e) => {
      RS.generalStatusFilter = e.target.value;
      fetchGeneralReports().then(() => render());
    });

    container.querySelector('#general-filter-category')?.addEventListener('change', (e) => {
      RS.generalCategoryFilter = e.target.value;
      fetchGeneralReports().then(() => render());
    });

    container.querySelector('#btn-create-general-report')?.addEventListener('click', openGeneralModal);
    container.querySelector('#btn-refresh-general-reports')?.addEventListener('click', async () => {
      await fetchGeneralReports();
      await fetchStats();
      render();
      window.showToast?.('Reportes generales actualizados.');
    });

    container.querySelectorAll('.general-status-select').forEach((sel) => {
      sel.addEventListener('change', () => updateGeneralReport(sel.dataset.reportId, { status: sel.value }));
    });

    container.querySelectorAll('.btn-save-general-notes').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = container.querySelector(`.general-notes-input[data-report-id="${btn.dataset.reportId}"]`);
        updateGeneralReport(btn.dataset.reportId, { adminNotes: input?.value || '' });
      });
    });

    container.querySelectorAll('.btn-delete-general').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este reporte general?')) return;
        const res = await fetch('/api/admin/reports/general/' + btn.dataset.reportId, { method: 'DELETE' });
        if (res.ok) {
          window.showToast?.('Reporte eliminado.');
          await fetchGeneralReports();
          await fetchStats();
          render();
        }
      });
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
          <h2>Acceso restringido a administradores</h2>
          <p>Esta pantalla es exclusiva para el equipo de administración de Cifra.</p>
          <button type="button" class="primary-button" onclick="window.AuthModule?.openModal?.('login')">Iniciar sesión</button>
        </div>
      `;
      return;
    }

    try {
      if (!RS.statsData) await fetchStats();
      if (RS.activeTab === 'ai' && !RS.aiData) await fetchAiReports();
      if (RS.activeTab === 'general' && !RS.generalData) await fetchGeneralReports();

      container.innerHTML = `
        <div class="reports-page-wrapper">
          ${R().renderHeader({ statsData: RS.statsData, activeTab: RS.activeTab })}
          ${R().renderStatsCards(RS.statsData)}
          ${RS.activeTab === 'ai' ? R().renderAiTab({ aiData: RS.aiData, aiFilterMode: RS.aiFilterMode, aiSearchQuery: RS.aiSearchQuery }) : R().renderGeneralTab({ generalData: RS.generalData, generalStatusFilter: RS.generalStatusFilter, generalCategoryFilter: RS.generalCategoryFilter, generalSearchQuery: RS.generalSearchQuery })}
        </div>
      `;
      wireEvents(container);
    } catch (err) {
      console.error('[reports] Error al renderizar:', err);
    }
  }

  function init() {
    RS.generalModal = document.querySelector('#app-report-modal-backdrop');
    document.querySelector('#app-report-btn')?.addEventListener('click', (e) => { e.preventDefault(); openGeneralModal(); });
    document.querySelector('#app-report-modal-close')?.addEventListener('click', closeGeneralModal);
    document.querySelector('#app-report-cancel-btn')?.addEventListener('click', closeGeneralModal);
    RS.generalModal?.addEventListener('click', (e) => e.target === RS.generalModal && closeGeneralModal());
    document.addEventListener('keydown', (e) => e.key === 'Escape' && !RS.generalModal?.hidden && closeGeneralModal());

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

window.wireEvents = wireEvents;
window.render = render;
window.init = init;
window.MAX_IMAGES = MAX_IMAGES;
window.R = R;

})(window);
