/* ── Módulo de Análisis Fundamental (Cifra) ──────────────────────────────── */

(function () {
  const AS = window.AnalisisState;
  'use strict';

  const HISTORY_PAGE_SIZE = 10;

  /* ── Valoración de análisis y reporte de incidencias ────────── */

  /* ── Versiones del análisis (histórico por filing) ────────────── */

  window.addEventListener('auth:change', (event) => {
    const logged = Boolean(event.detail?.user);
    if (typeof window.setAuthenticated === 'function') {
      window.setAuthenticated(logged);
    }
    if (logged && AS?.pendingAuthRetry) {
      const retry = AS.pendingAuthRetry;
      AS.pendingAuthRetry = null;
      retry();
    }
  });

  window.AnalysisModule = {
    init: (...args) => (typeof window.analisisInit === 'function' ? window.analisisInit(...args) : (typeof window.init === 'function' ? window.init(...args) : null)),
    runFilingAnalysis: (...args) => (typeof window.runFilingAnalysis === 'function' ? window.runFilingAnalysis(...args) : null),
    fetchAnalyses: (...args) => (typeof window.fetchAnalyses === 'function' ? window.fetchAnalyses(...args) : null),
    setAuthenticated: (...args) => (typeof window.setAuthenticated === 'function' ? window.setAuthenticated(...args) : null),
    loadReportData: (...args) => (typeof window.loadReportData === 'function' ? window.loadReportData(...args) : null),
  };
})();
