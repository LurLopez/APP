/**
 * @file empresaFilings.js
 * @description Gestión, renderizado y previsualización de informes trimestrales y anuales (10-Q/10-K) de la SEC.
 */

(function (window) {
  const FS = window.EmpresaFilingsState;
  'use strict';

  /* ── Menú de versiones por informe (popover hamburguesa) ─────── */

  /* ── Renderizado de tabla de informes ───────────────────────── */

  /* ── Previsualización modal de páginas ──────────────────────── */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFilingsModalListeners);
  } else {
    initFilingsModalListeners();
  }

  const EmpresaFilings = {
    loadFilings,
    renderFilingsTable,
    openFilingsPreview,
    closeFilingsPreview,
    openFilingsVersionMenu,
    closeFilingsVersionMenu,
    abortPresentations,
    getFilings: () => FS.screenerFilings,
    setFilings: (data) => { FS.screenerFilings = data; window.screenerFilings = data; }
  };

  window.EmpresaFilings = EmpresaFilings;
  window.loadFilings = loadFilings;
  window.renderFilingsTable = renderFilingsTable;
  window.openFilingsPreview = openFilingsPreview;
  window.closeFilingsPreview = closeFilingsPreview;
  window.abortFilingsPresentations = abortPresentations;
})(window);
