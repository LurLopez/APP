/* ── Módulo de Análisis Fundamental (Cifra) ──────────────────────────────── */

(function () {
  const AS = window.AnalisisState;
  'use strict';

  const HISTORY_PAGE_SIZE = 10;

  /* ── Valoración de análisis y reporte de incidencias ────────── */

  /* ── Versiones del análisis (histórico por filing) ────────────── */

  window.addEventListener('auth:change', (event) => {
    const logged = Boolean(event.detail?.user);
    setAuthenticated(logged);
    if (logged && AS.pendingAuthRetry) {
      const retry = AS.pendingAuthRetry;
      AS.pendingAuthRetry = null;
      retry();
    }
  });

  window.AnalysisModule = {
    init,
    runFilingAnalysis,
    fetchAnalyses,
    setAuthenticated,
    loadReportData,
  };
})();
