/**
 * @fileoverview Acciones, llamadas a API, exportación a CSV, drawer y gestión de datos.
 */

(function (window) {
  'use strict';

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
      const response = await fetch('/api/reports/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, description, images }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        closeGeneralModal();
        window.showToast?.('Reporte enviado con éxito. El equipo de administración lo revisará pronto.');
        const section = document.querySelector('#section-reportes');
        if (section && !section.hidden) {
          await fetchGeneralReports();
          await fetchStats();
          window.render?.();
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
      if (res.ok && data.ok) {
        RS.statsData = data.stats;
        RS.lastSyncTime = new Date();
      }
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
      if (res.ok && data.ok) {
        RS.aiData = data;
        RS.lastSyncTime = new Date();
      }
    } catch {
      window.showToast?.('Error de conexión al cargar reportes de IA.');
    }
  }

  async function fetchGeneralReports() {
    const params = new URLSearchParams();
    if (RS.generalStatusFilter !== 'all') params.set('status', RS.generalStatusFilter);
    if (RS.generalCategoryFilter !== 'all') params.set('category', RS.generalCategoryFilter);
    if (RS.generalSearchQuery.trim()) params.set('search', RS.generalSearchQuery.trim());
    params.set('limit', '500');

    try {
      const res = await fetch('/api/admin/reports/general?' + params.toString());
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        RS.generalData = data.reports || [];
        RS.generalTotal = data.total ?? (data.reports ? data.reports.length : 0);
        RS.lastSyncTime = new Date();
      }
    } catch {
      window.showToast?.('Error de conexión al cargar reportes generales.');
    }
  }

  async function syncAll() {
    RS.isRefreshing = true;
    window.render?.();
    try {
      await Promise.all([
        fetchStats(),
        RS.activeTab === 'ai' ? fetchAiReports() : fetchGeneralReports(),
      ]);
      window.showToast?.('Datos sincronizados correctamente.');
    } finally {
      RS.isRefreshing = false;
      window.render?.();
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
        // Si el drawer está abierto para este item, actualizarlo
        if (RS.drawerOpen && RS.drawerItem?.id === Number(errorId)) {
          RS.drawerItem = { ...RS.drawerItem, ...payload };
        }
        window.render?.();
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
        // Si el drawer está abierto para este item, actualizarlo
        if (RS.drawerOpen && RS.drawerItem?.id === Number(reportId)) {
          RS.drawerItem = { ...RS.drawerItem, ...payload };
        }
        window.render?.();
      } else {
        window.showToast?.(data.error || 'No se pudo actualizar.');
      }
    } catch {
      window.showToast?.('Error de conexión al actualizar.');
    }
  }

  async function batchUpdateAiErrors(ids, payload) {
    if (!ids || !ids.length) return;
    try {
      const res = await fetch('/api/admin/reports/ai/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.showToast?.(`${data.count || ids.length} incidencias actualizadas.`);
        RS.selectedAiItems.clear();
        await fetchAiReports();
        await fetchStats();
        window.render?.();
      } else {
        window.showToast?.(data.error || 'Error en la actualización masiva.');
      }
    } catch {
      window.showToast?.('Error de conexión.');
    }
  }

  async function batchDeleteAiErrors(ids) {
    if (!ids || !ids.length) return;
    if (!confirm(`¿Eliminar definitivamente ${ids.length} ${ids.length === 1 ? 'incidencia seleccionada' : 'incidencias seleccionadas'}?`)) return;
    try {
      const res = await fetch('/api/admin/reports/ai/batch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.showToast?.(`${data.count || ids.length} incidencias eliminadas.`);
        RS.selectedAiItems.clear();
        await fetchAiReports();
        await fetchStats();
        window.render?.();
      } else {
        window.showToast?.(data.error || 'Error en la eliminación masiva.');
      }
    } catch {
      window.showToast?.('Error de conexión.');
    }
  }

  async function batchUpdateGeneralReports(ids, payload) {
    if (!ids || !ids.length) return;
    try {
      const res = await fetch('/api/admin/reports/general/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.showToast?.(`${data.count || ids.length} reportes actualizados.`);
        RS.selectedGeneralItems.clear();
        await fetchGeneralReports();
        await fetchStats();
        window.render?.();
      } else {
        window.showToast?.(data.error || 'Error en la actualización masiva.');
      }
    } catch {
      window.showToast?.('Error de conexión.');
    }
  }

  async function batchDeleteGeneralReports(ids) {
    if (!ids || !ids.length) return;
    if (!confirm(`¿Eliminar definitivamente ${ids.length} ${ids.length === 1 ? 'reporte seleccionado' : 'reportes seleccionados'}?`)) return;
    try {
      const res = await fetch('/api/admin/reports/general/batch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.showToast?.(`${data.count || ids.length} reportes eliminados.`);
        RS.selectedGeneralItems.clear();
        await fetchGeneralReports();
        await fetchStats();
        window.render?.();
      } else {
        window.showToast?.(data.error || 'Error en la eliminación masiva.');
      }
    } catch {
      window.showToast?.('Error de conexión.');
    }
  }

  function openDrawer({ item, type, parent }) {
    RS.drawerItem = item;
    RS.drawerType = type;
    RS.drawerItemParent = parent || null;
    RS.drawerOpen = true;
    window.render?.();
  }

  function closeDrawer() {
    RS.drawerOpen = false;
    RS.drawerItem = null;
    RS.drawerItemParent = null;
    window.render?.();
  }

  function openLightbox(src) {
    RS.lightboxSrc = src;
    RS.lightboxOpen = true;
    window.render?.();
  }

  function closeLightbox() {
    RS.lightboxOpen = false;
    RS.lightboxSrc = null;
    window.render?.();
  }

  function exportToCsv() {
    const isAi = RS.activeTab === 'ai';
    let rows = [];
    let filename = '';

    const sanitizeCsvField = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    if (isAi) {
      if (RS.aiSubView === 'errors') {
        filename = `incidencias-ia-${new Date().toISOString().slice(0, 10)}.csv`;
        const headers = ['ID', 'Ticker', 'Empresa', 'Periodo', 'Categoría', 'Estado', 'Descripción', 'Usuario', 'Notas Admin', 'Fecha'];
        rows.push(headers.map(sanitizeCsvField).join(','));

        const rawList = RS.aiData?.rawList || [];
        rawList.forEach((parent) => {
          (parent.error_reports || []).forEach((e) => {
            rows.push([
              e.id,
              parent.ticker,
              parent.company_name,
              parent.period_title || parent.period_label || '',
              e.category,
              e.status,
              e.description,
              e.user_email || 'Anónimo',
              e.admin_notes || '',
              e.created_at,
            ].map(sanitizeCsvField).join(','));
          });
        });
      } else {
        filename = `analisis-ia-${new Date().toISOString().slice(0, 10)}.csv`;
        const headers = ['ID', 'Ticker', 'Empresa', 'Formato', 'Periodo', 'Accession', 'Modelo', 'Versión', 'Valoración Media', 'Votos', 'Incidencias', 'Fecha Creación'];
        rows.push(headers.map(sanitizeCsvField).join(','));

        const rawList = RS.aiData?.rawList || [];
        rawList.forEach((a) => {
          rows.push([
            a.id,
            a.ticker,
            a.company_name,
            a.form_type || '10-Q',
            a.period_title || a.period_label || '',
            a.accession,
            a.model_used,
            a.version,
            a.rating_average || '',
            a.rating_count || 0,
            a.error_reports_count || 0,
            a.created_at,
          ].map(sanitizeCsvField).join(','));
        });
      }
    } else {
      filename = `reportes-generales-${new Date().toISOString().slice(0, 10)}.csv`;
      const headers = ['ID', 'Fecha', 'Categoría', 'Estado', 'Título', 'Descripción', 'Usuario', 'Notas Admin', 'Num Capturas'];
      rows.push(headers.map(sanitizeCsvField).join(','));

      const reports = RS.generalData || [];
      reports.forEach((r) => {
        rows.push([
          r.id,
          r.created_at,
          r.category,
          r.status,
          r.title,
          r.description,
          r.user_email || 'Anónimo',
          r.admin_notes || '',
          Array.isArray(r.images) ? r.images.length : 0,
        ].map(sanitizeCsvField).join(','));
      });
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.showToast?.(`Archivo CSV descargado: ${filename}`);
  }

  window.openGeneralModal = openGeneralModal;
  window.closeGeneralModal = closeGeneralModal;
  window.submitGeneralReport = submitGeneralReport;
  window.fetchStats = fetchStats;
  window.fetchAiReports = fetchAiReports;
  window.fetchGeneralReports = fetchGeneralReports;
  window.syncAll = syncAll;
  window.updateAiError = updateAiError;
  window.updateGeneralReport = updateGeneralReport;
  window.batchUpdateAiErrors = batchUpdateAiErrors;
  window.batchDeleteAiErrors = batchDeleteAiErrors;
  window.batchUpdateGeneralReports = batchUpdateGeneralReports;
  window.batchDeleteGeneralReports = batchDeleteGeneralReports;
  window.openDrawer = openDrawer;
  window.closeDrawer = closeDrawer;
  window.openLightbox = openLightbox;
  window.closeLightbox = closeLightbox;
  window.exportToCsv = exportToCsv;

  window.ReportsActions = {
    openGeneralModal,
    closeGeneralModal,
    submitGeneralReport,
    fetchStats,
    fetchAiReports,
    fetchGeneralReports,
    syncAll,
    updateAiError,
    updateGeneralReport,
    batchUpdateAiErrors,
    batchDeleteAiErrors,
    batchUpdateGeneralReports,
    batchDeleteGeneralReports,
    openDrawer,
    closeDrawer,
    openLightbox,
    closeLightbox,
    exportToCsv,
  };

})(window);
