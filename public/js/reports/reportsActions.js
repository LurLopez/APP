/**
 * @fileoverview Acciones y carga de datos del centro de reportes.
 */

(function (window) {
  const RS = window.ReportsState;


  function openGeneralModal() {
    if (!RS.generalModal) RS.generalModal = document.querySelector('#app-report-modal-backdrop');
    if (!RS.generalModal) return;
    document.querySelector('#app-report-form')?.reset();
    RS.generalAttachmentMgr?.clear();
    RS.generalModal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.querySelector('#app-report-title')?.focus(), 60);
  }

  function closeGeneralModal() {
    if (!RS.generalModal) RS.generalModal = document.querySelector('#app-report-modal-backdrop');
    if (!RS.generalModal) return;
    RS.generalModal.hidden = true;
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
    const images = RS.generalAttachmentMgr?.getImages() || [];

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
      if (res.ok && data.ok) RS.statsData = data.stats;
    } catch (e) {
      console.warn('[reports:stats]', e);
    }
  }

  async function fetchAiReports() {
    const params = new URLSearchParams();
    if (RS.aiSearchQuery.trim()) params.set('ticker', RS.aiSearchQuery.trim());
    try {
      const res = await fetch('/api/admin/reports/ai?' + params.toString());
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) RS.aiData = data;
    } catch {
      window.showToast?.('Error de conexión al cargar reportes de IA.');
    }
  }

  async function fetchGeneralReports() {
    const params = new URLSearchParams();
    if (RS.generalStatusFilter !== 'all') params.set('status', RS.generalStatusFilter);
    if (RS.generalCategoryFilter !== 'all') params.set('category', RS.generalCategoryFilter);
    if (RS.generalSearchQuery.trim()) params.set('search', RS.generalSearchQuery.trim());
    try {
      const res = await fetch('/api/admin/reports/general?' + params.toString());
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) RS.generalData = data.reports || [];
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

window.openGeneralModal = openGeneralModal;
window.closeGeneralModal = closeGeneralModal;
window.submitGeneralReport = submitGeneralReport;
window.fetchStats = fetchStats;
window.fetchAiReports = fetchAiReports;
window.fetchGeneralReports = fetchGeneralReports;
window.updateAiError = updateAiError;
window.updateGeneralReport = updateGeneralReport;

})(window);
