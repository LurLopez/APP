/**
 * @fileoverview Progreso, errores y valoración del análisis (extraído de analisis.js).
 */

(function (window) {
  const AS = window.AnalisisState;


  function showAnalysisError(message, failedAgent = 'origin') {
    AS.lastAnalysisFailed = true;
    clearTimeout(AS.processingHintTimer);
    if (failedAgent === 'sector') setAgentState('origin', 'done');
    if (failedAgent === 'analyst') {
      setAgentState('origin', 'done');
      setAgentState('sector', 'done');
    }
    setAgentState(failedAgent, 'error');

    const errorBox = document.querySelector('#analysis-error');
    if (errorBox) {
      errorBox.textContent = message;
      errorBox.hidden = false;
    }
    const retryButton = document.querySelector('#retry-analysis');
    if (retryButton) {
      retryButton.textContent = 'Reintentar';
      retryButton.hidden = false;
    }
    const processingNote = document.querySelector('#processing-note');
    if (processingNote) processingNote.hidden = true;

    const processingTitle = document.querySelector('#processing-title');
    if (processingTitle) {
      processingTitle.textContent = failedAgent === 'sector'
        ? 'La empresa no es de consumo defensivo'
        : failedAgent === 'analyst'
          ? 'No se pudo generar el análisis'
          : 'No se pudo verificar el documento';
    }
    const progressBar = document.querySelector('#progress-bar');
    if (progressBar) progressBar.style.width = '100%';
    clearInterval(AS.analysisTimer);
  }

  function startAnalysisUi(title) {
    clearInterval(AS.analysisTimer);
    clearTimeout(AS.processingHintTimer);
    let seconds = 1;

    const processingPanel = document.querySelector('#processing-panel');
    const resultPreview = document.querySelector('#result-preview');
    const uploadForm = document.querySelector('#upload-form');
    const secAnalysisEntry = document.querySelector('#sec-analysis-entry');
    const analysisError = document.querySelector('#analysis-error');
    const retryButton = document.querySelector('#retry-analysis');
    const processingNote = document.querySelector('#processing-note');
    const progressBar = document.querySelector('#progress-bar');
    const processingTitle = document.querySelector('#processing-title');
    const processingTime = document.querySelector('#processing-time');

    if (processingPanel) processingPanel.hidden = false;
    if (resultPreview) resultPreview.hidden = true;
    if (uploadForm) uploadForm.hidden = true;
    if (secAnalysisEntry) secAnalysisEntry.hidden = true;
    AS.currentAnalysisId = null;
    resetAnalysisVersionState();
    loadAnalysisFeedback(null);
    resetAgentStates();
    if (analysisError) analysisError.hidden = true;
    if (retryButton) retryButton.hidden = true;
    if (processingNote) {
      processingNote.hidden = false;
      processingNote.textContent = 'El documento se verifica automáticamente antes de continuar.';
    }
    if (progressBar) progressBar.style.width = '20%';
    if (processingTitle) processingTitle.textContent = title;
    if (processingTime) processingTime.textContent = '00:01';
    setAgentState('origin', 'active');

    AS.analysisTimer = setInterval(() => {
      seconds += 1;
      if (processingTime) processingTime.textContent = formatElapsed(seconds);
    }, 1000);
  }

  function failAnalysis(data) {
    const failedAgent = data.code === 'NOT_DEFENSIVE_CONSUMER' ? 'sector'
      : data.code === 'INVALID_MODEL_RESPONSE' || data.code === 'INVALID_REPORT_STRUCTURE' ? 'analyst'
        : 'origin';
    const message = data.error || 'No se pudo analizar el documento. Inténtalo de nuevo.';
    showAnalysisError(message, failedAgent);
    showToast(message);
  }

  function finishAnalysis(data) {
    clearTimeout(AS.processingHintTimer);
    setAgentState('origin', 'done');
    setAgentState('sector', 'done');
    setAgentState('analyst', 'done');
    AS.lastAnalysisFailed = false;

    const progressBar = document.querySelector('#progress-bar');
    if (progressBar) progressBar.style.width = '100%';
    const processingTitle = document.querySelector('#processing-title');
    if (processingTitle) processingTitle.textContent = 'Análisis completado: informe generado';
    clearInterval(AS.analysisTimer);

    const retryButton = document.querySelector('#retry-analysis');
    if (retryButton) {
      retryButton.textContent = 'Analizar otro informe';
      retryButton.hidden = false;
    }

    AS.currentPdfUrl = data.pdfUrl ?? null;
    AS.currentDownloadBase = AS.currentPdfUrl ? AS.currentPdfUrl.replace(/\.pdf$/, '') : null;
    // Nombre del servidor: TIKR-AÑO-QX (10-Q) o TIKR-AÑO-K (10-K)
    AS.currentDownloadName = data.downloadBase ?? 'analisis-cifra';
    renderReport(data.report ?? {});

    const resultPreview = document.querySelector('#result-preview');
    if (resultPreview) resultPreview.hidden = false;

    AS.currentAnalysisId = data.analysisId ?? null;
    AS.currentAnalysisTicker = data.report?.ticker || AS.pendingFiling?.ticker || null;
    AS.currentAnalysisAccession = AS.pendingFiling?.accession || null;
    AS.currentAnalysisSlug = data.slug || getAnalysisSlug(data);

    setAnalysisVersionState({
      version: data.version ?? null,
      subsector: data.subsector ?? null,
      currentVersion: data.currentVersion ?? data.version ?? null,
      versionOutdated: data.versionOutdated === true,
    });

    if (AS.currentAnalysisTicker && AS.currentAnalysisAccession) {
      window.dispatchEvent(new CustomEvent('analysis:finished', {
        detail: {
          ticker: AS.currentAnalysisTicker,
          accession: AS.currentAnalysisAccession,
          version: data.version ?? null,
        },
      }));
    }

    loadAnalysisFeedback(AS.currentAnalysisId);
    if (AS.currentAnalysisId) {
      try { history.replaceState(null, '', getAnalysisPath({ ...data, id: AS.currentAnalysisId, ticker: AS.currentAnalysisTicker, slug: AS.currentAnalysisSlug })); } catch {}
    }

    const adminRegenBtn = document.querySelector('#admin-regenerate-report');
    if (adminRegenBtn) {
      const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || AS.currentUser?.isAdmin);
      adminRegenBtn.hidden = !isAdmin;
    }

    const saved = data.saved && AS.currentUser;
    const quota = data.quota;
    const quotaNote = quota && !quota.unlimited && Number.isFinite(Number(quota.remaining)) && !data.cached
      ? ` Te quedan ${quota.remaining} análisis con IA hoy.`
      : '';
    showToast(`${saved ? 'Análisis guardado en tu histórico. ' : ''}${data.formType || 'Informe'} analizado con éxito.${quotaNote}`);
    if (saved) {
      fetchAnalyses();
      fetchHistoryCompanies();
    }
  }

  function renderRatingState(userRating, ratingSummary) {
    AS.currentUserRating = Number(userRating) || 0;
    const starBtns = document.querySelectorAll('#rating-stars .star-btn');
    starBtns.forEach((btn) => {
      const val = Number(btn.dataset.value);
      btn.classList.toggle('active', val <= AS.currentUserRating);
      btn.classList.remove('hovered');
    });

    const summaryEl = document.querySelector('#rating-summary-text');
    if (!summaryEl) return;

    const count = Number(ratingSummary?.count) || 0;
    const avg = Number(ratingSummary?.average) || 0;

    if (count > 0) {
      const avgStr = avg.toFixed(1);
      const countStr = `${count} ${count === 1 ? 'valoración' : 'valoraciones'}`;
      if (AS.currentUserRating > 0) {
        summaryEl.textContent = `${avgStr} ★ (${countStr}) · Tu nota: ${AS.currentUserRating} ★`;
      } else {
        summaryEl.textContent = `${avgStr} ★ (${countStr})`;
      }
    } else if (AS.currentUserRating > 0) {
      summaryEl.textContent = `Tu nota: ${AS.currentUserRating} ★`;
    } else {
      summaryEl.textContent = 'Sé el primero en valorar este análisis';
    }
  }

  function highlightStars(val) {
    const starBtns = document.querySelectorAll('#rating-stars .star-btn');
    starBtns.forEach((btn) => {
      const v = Number(btn.dataset.value);
      btn.classList.toggle('hovered', v <= val);
    });
  }

  function clearStarHighlights() {
    const starBtns = document.querySelectorAll('#rating-stars .star-btn');
    starBtns.forEach((btn) => btn.classList.remove('hovered'));
  }

  async function loadAnalysisFeedback(analysisId) {
    const feedbackBar = document.querySelector('#analysis-feedback-bar');
    if (!feedbackBar) return;
    if (!analysisId) {
      feedbackBar.hidden = true;
      return;
    }
    feedbackBar.hidden = false;
    renderRatingState(0, null);
    const summaryEl = document.querySelector('#rating-summary-text');
    if (summaryEl) summaryEl.textContent = 'Cargando valoraciones...';

    try {
      const response = await fetch(`/api/analyses/${analysisId}/rating`);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        renderRatingState(data.userRating, data.ratingSummary);
      } else {
        if (summaryEl) summaryEl.textContent = '';
      }
    } catch {
      if (summaryEl) summaryEl.textContent = '';
    }
  }

window.showAnalysisError = showAnalysisError;
window.startAnalysisUi = startAnalysisUi;
window.failAnalysis = failAnalysis;
window.finishAnalysis = finishAnalysis;
window.renderRatingState = renderRatingState;
window.highlightStars = highlightStars;
window.clearStarHighlights = clearStarHighlights;
window.loadAnalysisFeedback = loadAnalysisFeedback;

})(window);
