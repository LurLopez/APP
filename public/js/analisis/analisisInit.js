/**
 * @fileoverview Inicialización del módulo de análisis y sesión (extraído de analisis.js).
 */

(function (window) {
  const AS = window.AnalisisState;


  function wireAnalisisAdmin() {
    const ratingStarsWrap = document.querySelector('#rating-stars');
    if (ratingStarsWrap) {
      ratingStarsWrap.querySelectorAll('.star-btn').forEach((btn) => {
        btn.addEventListener('mouseenter', () => highlightStars(Number(btn.dataset.value)));
        btn.addEventListener('click', () => submitRating(Number(btn.dataset.value)));
      });
      ratingStarsWrap.addEventListener('mouseleave', clearStarHighlights);
    }

    // Botón de regeneración para administradores
    const adminRegenerateBtn = document.querySelector('#admin-regenerate-report');
    adminRegenerateBtn?.addEventListener('click', async () => {
      const ticker = AS.currentAnalysisTicker || AS.pendingFiling?.ticker;
      const accession = AS.currentAnalysisAccession || AS.pendingFiling?.accession;
      if (!ticker || !accession) {
        if (AS.currentAnalysisId) {
          if (!confirm('¿Deseas volver a generar este informe con IA?\n\nSe creará una versión nueva y se conservarán las anteriores.')) {
            return;
          }
          startAnalysisUi('Regenerando informe con IA…');
          try {
            const res = await fetch(`/api/admin/reports/ai-analysis/${AS.currentAnalysisId}/regenerate`, { method: 'POST' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              showToast(json.error || 'No se pudo regenerar el informe.');
              return;
            }
            finishAnalysis(json);
            showToast('Informe regenerado con éxito.');
          } catch {
            showToast('Error al conectar con el servidor.');
          }
          return;
        }
        showToast('No se dispone de los datos de este informe para regenerarlo.');
        return;
      }

      if (!confirm(`¿Deseas volver a generar el informe de ${ticker} (${accession}) con IA?\n\nSe creará una versión nueva desde SEC EDGAR y se conservarán las anteriores.`)) {
        return;
      }
      runFilingAnalysis(ticker, accession, { force: true });
    });

    // Checkbox de estado de análisis revisado (solo administradores)
    const reviewedCheckbox = document.querySelector('#analysis-reviewed-checkbox');
    reviewedCheckbox?.addEventListener('change', async () => {
      if (!AS.currentAnalysisId) return;
      const willBeReviewed = reviewedCheckbox.checked;
      try {
        const response = await fetch(`/api/analyses/${AS.currentAnalysisId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isReviewed: willBeReviewed }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
          reviewedCheckbox.checked = !willBeReviewed;
          showToast(data.error || 'No se pudo actualizar el estado de revisión.');
          return;
        }
        AS.currentAnalysisIsReviewed = Boolean(data.isReviewed);
        window.analysisVersionsCache?.clear?.();
        window.AnalisisVersions?.getCache?.()?.clear?.();
        renderAnalysisVersionControl();
        showToast(data.isReviewed
          ? 'Análisis marcado como revisado por humano 🛡️'
          : 'Revisión por humano desmarcada'
        );
        refreshAnalysisVersions();
      } catch {
        reviewedCheckbox.checked = !willBeReviewed;
        showToast('Error de conexión con el servidor.');
      }
    });

    // Configuración de reporte de incidencias
    const reportErrorTrigger = document.querySelector('#report-error-trigger');
    reportErrorTrigger?.addEventListener('click', () => {
      if (!AS.currentAnalysisId) {
        showToast('No hay ningún análisis seleccionado para reportar.');
        return;
      }
      openErrorReportModal();
    });

    const reportClose = document.querySelector('#error-report-modal-close');
    reportClose?.addEventListener('click', closeErrorReportModal);
    const reportCancel = document.querySelector('#error-report-cancel-btn');
    reportCancel?.addEventListener('click', closeErrorReportModal);
    const reportBackdrop = document.querySelector('#error-report-modal-backdrop');
    reportBackdrop?.addEventListener('click', (event) => {
      if (event.target === reportBackdrop) closeErrorReportModal();
    });

    const reportForm = document.querySelector('#error-report-form');
    reportForm?.addEventListener('submit', submitErrorReport);

    if (window.ReportsModule) {
      AS.analysisAttachmentMgr = window.ReportsModule.createImageAttachmentManager({
        dropzoneEl: document.querySelector('#analysis-report-dropzone'),
        inputEl: document.querySelector('#analysis-report-file-input'),
        previewEl: document.querySelector('#analysis-report-previews'),
        maxImages: 3,
      });
    }

    window.addEventListener('paste', (event) => {
      const modal = document.querySelector('#error-report-modal-backdrop');
      if (modal && !modal.hidden && AS.analysisAttachmentMgr) {
        const handled = AS.analysisAttachmentMgr.handlePasteEvent(event);
        if (handled) showToast('Captura de pantalla pegada.');
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const modal = document.querySelector('#error-report-modal-backdrop');
        if (modal && !modal.hidden) closeErrorReportModal();
      }
    });
  }

  function init() {
    if (AS.initialized) return;
    AS.initialized = true;

    wireAnalisisUpload();
    wireAnalisisResults();
    wireAnalisisHistory();
    wireAnalisisAdmin();

    const initialReportEl = document.querySelector('#cifra-initial-report');
    if (initialReportEl) {
      try {
        const initial = JSON.parse(initialReportEl.textContent);
        if (initial && initial.report) {
          loadReportData(initial, { updateHistory: false });
        }
      } catch (err) {
        console.error('Error al hidratar informe inicial:', err);
      }
    } else {
      const slugMatch = window.location.pathname.match(/^\/informe\/([A-Za-z0-9.-]{1,10})\/([A-Za-z0-9.-]{2,15})$/);
      const reportMatch = window.location.pathname.match(/^\/informe\/(\d{1,7})$/);
      if (slugMatch) {
        fetch(`/api/analyses?ticker=${encodeURIComponent(slugMatch[1])}`)
          .then((r) => r.json())
          .then((d) => {
            const list = Array.isArray(d.analyses) ? d.analyses : [];
            const target = list.find((a) => getAnalysisSlug(a).toUpperCase() === slugMatch[2].toUpperCase()) || list[0];
            if (target?.id) {
              fetch(`/api/analyses/${target.id}`)
                .then((r) => r.json())
                .then((res) => {
                  if (res.analysis?.report) loadReportData(res.analysis, { updateHistory: false });
                })
                .catch(() => {});
            }
          })
          .catch(() => {});
      } else if (reportMatch) {
        fetch(`/api/analyses/${reportMatch[1]}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.analysis?.report) loadReportData(d.analysis, { updateHistory: false });
          })
          .catch(() => {});
      }
    }
  }

  function setAuthenticated(isLogged) {
    AS.currentUser = Boolean(isLogged);
    fetchHistoryCompanies();
    fetchAnalyses();
  }

window.wireAnalisisAdmin = wireAnalisisAdmin;
window.analisisInit = init;
window.setAuthenticated = setAuthenticated;

})(window);
