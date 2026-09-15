/**
 * @fileoverview Controlador principal del Centro de Reportes e Incidencias.
 * Gestiona el envío de reportes con capturas por parte de usuarios y el panel administrativo.
 * @module ReportsModule
 */

const ReportsModule = (() => {
  const RS = window.ReportsState;

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
