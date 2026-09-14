/**
 * @fileoverview Controlador principal del Centro de Reportes e Incidencias.
 * Gestiona el envío de reportes con capturas por parte de usuarios y el panel administrativo.
 * @module ReportsModule
 */

const ReportsModule = (() => {
  let generalModal = null;
  const MAX_IMAGES = 5;

  let activeTab = 'ai';
  let aiData = null;
  let generalData = null;
  let statsData = null;
  let aiSearchQuery = '';
  let aiFilterMode = 'all';
  let generalStatusFilter = 'all';
  let generalCategoryFilter = 'all';
  let generalSearchQuery = '';
  let isGenerating = false;
  let generalAttachmentMgr = null;

  const R = () => window.ReportsRender;

  function openGeneralModal() {
    if (!generalModal) generalModal = document.querySelector('#app-report-modal-backdrop');
    if (!generalModal) return;
    document.querySelector('#app-report-form')?.reset();
    generalAttachmentMgr?.clear();
    generalModal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.querySelector('#app-report-title')?.focus(), 60);
  }

  function closeGeneralModal() {
    if (!generalModal) generalModal = document.querySelector('#app-report-modal-backdrop');
    if (!generalModal) return;
    generalModal.hidden = true;
    document.body.style.overflow = '';
  }

  async function submitGeneralReport(event) {
    event.preventDefault();
    const titleInput = document.querySelector('#app-report-title');
    const categorySelect = document.querySelector('#app-report-category');
    const descInput = document.querySelector('#app-report-desc');
    const submitBtn = document.querySelector('#app-report-submit-btn');

    const title = titleInput?.value?.trim() || '';
    const category = categorySelect?.value || 'bug';
    const description = descInput?.value?.trim() || '';
    const images = generalAttachmentMgr?.getImages() || [];

    if (!title) {
      window.showToast?.('Por favor, introduce un título para el reporte.');
      return titleInput?.focus();
    }
    if (!description) {
      window.showToast?.('Por favor, detalla la descripción de la incidencia o sugerencia.');
      return descInput?.focus();
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
    }

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, description, images }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        closeGeneralModal();
        window.showToast?.('Reporte enviado con éxito. ¡Muchas gracias por tu colaboración!');
        const section = document.querySelector('#section-reportes');
        if (section && !section.hidden) {
          await fetchGeneralReports();
          await fetchStats();
          render();
        }
      } else {
        window.showToast?.(data.error || 'No se pudo enviar el reporte.');
      }
    } catch {
      window.showToast?.('Error de conexión al enviar el reporte.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar reporte';
      }
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch('/api/admin/reports/stats');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) statsData = data.stats;
    } catch (e) {
      console.warn('[reports:stats]', e);
    }
  }

  async function fetchAiReports() {
    const params = new URLSearchParams();
    if (aiSearchQuery.trim()) params.set('ticker', aiSearchQuery.trim());
    try {
      const res = await fetch('/api/admin/reports/ai?' + params.toString());
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) aiData = data;
    } catch {
      window.showToast?.('Error de conexión al cargar reportes de IA.');
    }
  }

  async function fetchGeneralReports() {
    const params = new URLSearchParams();
    if (generalStatusFilter !== 'all') params.set('status', generalStatusFilter);
    if (generalCategoryFilter !== 'all') params.set('category', generalCategoryFilter);
    if (generalSearchQuery.trim()) params.set('search', generalSearchQuery.trim());
    try {
      const res = await fetch('/api/admin/reports/general?' + params.toString());
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) generalData = data.reports || [];
    } catch {
      window.showToast?.('Error de conexión al cargar reportes generales.');
    }
  }

  async function updateAiError(errorId, payload) {
    try {
      const res = await fetch('/api/admin/reports/ai/' + errorId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.showToast?.('Incidencia actualizada.');
        await fetchAiReports();
        await fetchStats();
        render();
      } else {
        window.showToast?.(data.error || 'No se pudo actualizar.');
      }
    } catch {
      window.showToast?.('Error de conexión al actualizar.');
    }
  }

  async function updateGeneralReport(reportId, payload) {
    try {
      const res = await fetch('/api/admin/reports/general/' + reportId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.showToast?.('Reporte general actualizado.');
        await fetchGeneralReports();
        await fetchStats();
        render();
      } else {
        window.showToast?.(data.error || 'No se pudo actualizar.');
      }
    } catch {
      window.showToast?.('Error de conexión al actualizar.');
    }
  }

  function wireEvents(container) {
    container.querySelectorAll('.reports-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });

    const aiSearchInput = container.querySelector('#reports-ai-search');
    if (aiSearchInput) {
      let debounce = null;
      aiSearchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          aiSearchQuery = aiSearchInput.value;
          fetchAiReports().then(() => render());
        }, 300);
      });
    }

    container.querySelectorAll('[data-filter-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        aiFilterMode = btn.dataset.filterMode;
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
        if (isGenerating) return;
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
          generalSearchQuery = genSearchInput.value;
          fetchGeneralReports().then(() => render());
        }, 300);
      });
    }

    container.querySelector('#general-filter-status')?.addEventListener('change', (e) => {
      generalStatusFilter = e.target.value;
      fetchGeneralReports().then(() => render());
    });

    container.querySelector('#general-filter-category')?.addEventListener('change', (e) => {
      generalCategoryFilter = e.target.value;
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
      if (!statsData) await fetchStats();
      if (activeTab === 'ai' && !aiData) await fetchAiReports();
      if (activeTab === 'general' && !generalData) await fetchGeneralReports();

      container.innerHTML = `
        <div class="reports-page-wrapper">
          ${R().renderHeader({ statsData, activeTab })}
          ${R().renderStatsCards(statsData)}
          ${activeTab === 'ai' ? R().renderAiTab({ aiData, aiFilterMode, aiSearchQuery }) : R().renderGeneralTab({ generalData, generalStatusFilter, generalCategoryFilter, generalSearchQuery })}
        </div>
      `;
      wireEvents(container);
    } catch (err) {
      console.error('[reports] Error al renderizar:', err);
    }
  }

  function init() {
    generalModal = document.querySelector('#app-report-modal-backdrop');
    document.querySelector('#app-report-btn')?.addEventListener('click', (e) => { e.preventDefault(); openGeneralModal(); });
    document.querySelector('#app-report-modal-close')?.addEventListener('click', closeGeneralModal);
    document.querySelector('#app-report-cancel-btn')?.addEventListener('click', closeGeneralModal);
    generalModal?.addEventListener('click', (e) => e.target === generalModal && closeGeneralModal());
    document.addEventListener('keydown', (e) => e.key === 'Escape' && !generalModal?.hidden && closeGeneralModal());

    document.querySelector('#app-report-form')?.addEventListener('submit', submitGeneralReport);

    generalAttachmentMgr = window.ImageAttachmentManager.createImageAttachmentManager({
      dropzoneEl: document.querySelector('#app-report-dropzone'),
      inputEl: document.querySelector('#app-report-file-input'),
      previewEl: document.querySelector('#app-report-previews'),
      maxImages: MAX_IMAGES,
    });

    window.addEventListener('paste', (e) => {
      if (generalModal && !generalModal.hidden && generalAttachmentMgr?.handlePasteEvent(e)) {
        window.showToast?.('Captura de pantalla pegada.');
      }
    });

    window.addEventListener('auth:change', () => {
      const section = document.querySelector('#section-reportes');
      if (section && !section.hidden) {
        aiData = null;
        generalData = null;
        statsData = null;
        render();
      }
    });
  }

  return {
    init,
    open: openGeneralModal,
    close: closeGeneralModal,
    createImageAttachmentManager: (...args) => window.ImageAttachmentManager.createImageAttachmentManager(...args),
    render,
    fetchStats,
    fetchAiReports,
    fetchGeneralReports,
  };
})();

window.ReportsModule = ReportsModule;
window.AdminReportsModule = ReportsModule;

window.addEventListener('auth:change', () => {
  const section = document.querySelector('#section-reportes');
  const activeNav = document.querySelector('.nav-link[data-section="reportes"]');
  if (section && (!section.hidden || activeNav?.classList.contains('active'))) {
    if (section.hidden) section.hidden = false;
    ReportsModule.render();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ReportsModule.init());
} else {
  ReportsModule.init();
}
