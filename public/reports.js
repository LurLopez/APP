/**
 * @fileoverview Controlador principal del Centro de Control de Reportes e Incidencias.
 * Gestiona el envío de reportes con capturas por parte de usuarios y la consola administrativa enterprise.
 * @module ReportsModule
 */

const ReportsModule = window.ReportsModule || (() => {
  const getActions = () => window.ReportsActions || window;
  return {
    init: (...args) => window.ReportsModule?.init?.(...args) || window.reportsModuleInit?.(...args) || window.init?.(...args),
    open: (...args) => (getActions().openGeneralModal || window.openGeneralModal)?.(...args),
    close: (...args) => (getActions().closeGeneralModal || window.closeGeneralModal)?.(...args),
    createImageAttachmentManager: (...args) => window.ImageAttachmentManager?.createImageAttachmentManager?.(...args),
    render: (...args) => window.ReportsModule?.render?.(...args) || window.reportsModuleRender?.(...args) || window.render?.(...args),
    fetchStats: (...args) => (getActions().fetchStats || window.fetchStats)?.(...args),
    fetchAiReports: (...args) => (getActions().fetchAiReports || window.fetchAiReports)?.(...args),
    fetchGeneralReports: (...args) => (getActions().fetchGeneralReports || window.fetchGeneralReports)?.(...args),
    syncAll: (...args) => (getActions().syncAll || window.syncAll)?.(...args),
    exportToCsv: (...args) => (getActions().exportToCsv || window.exportToCsv)?.(...args),
    openDrawer: (...args) => (getActions().openDrawer || window.openDrawer)?.(...args),
    closeDrawer: (...args) => (getActions().closeDrawer || window.closeDrawer)?.(...args),
  };
})();

window.ReportsModule = window.ReportsModule || ReportsModule;
window.AdminReportsModule = window.ReportsModule;

window.addEventListener('auth:change', () => {
  const section = document.querySelector('#section-reportes');
  const activeNav = document.querySelector('.nav-link[data-section="reportes"]');
  if (section && (!section.hidden || activeNav?.classList.contains('active'))) {
    if (section.hidden) section.hidden = false;
    window.ReportsModule?.render?.();
  }
});

function bootReportsModule() {
  if (window.ReportsModule?.init) {
    window.ReportsModule.init();
  } else if (window.reportsModuleInit) {
    window.reportsModuleInit();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootReportsModule);
} else {
  bootReportsModule();
}
