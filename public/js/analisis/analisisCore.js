/**
 * @fileoverview Núcleo del módulo de análisis: estado de UI, archivos y avisos (extraído de analisis.js).
 */

(function (window) {
  const AS = window.AnalisisState;


  function getAnalysisSlug(item) {
    if (!item) return '';
    if (item.slug) return item.slug;
    const report = item.report || {};
    const title = String(item.periodTitle || report.periodTitle || '');
    const formType = String(item.formType || report.formType || '');
    const isAnnual = report.isAnnual === true || formType === '10-K' || /annual|full year|10-?k/i.test(title);

    let year = report.fiscalYear || item.fiscalYear;
    if (!year) {
      const ym = title.match(/\b(20\d\d)\b/);
      if (ym) year = ym[1];
    }
    if (!year && (item.period_end || item.periodEnd)) {
      year = new Date(item.period_end || item.periodEnd).getUTCFullYear();
    }
    if (!year && (item.created_at || item.createdAt)) {
      year = new Date(item.created_at || item.createdAt).getUTCFullYear();
    }
    if (!year) year = new Date().getFullYear();

    if (isAnnual) return `${year}-10K`;

    let quarter = report.fiscalQuarter || item.fiscalQuarter;
    if (!quarter) {
      const qm = title.match(/Q([1-4])/i);
      if (qm) quarter = qm[1];
    }
    if (!quarter && (item.period_end || item.periodEnd)) {
      const m = new Date(item.period_end || item.periodEnd).getUTCMonth();
      quarter = Math.floor(m / 3) + 1;
    }
    if (!quarter) quarter = '1';
    return `${year}-Q${quarter}`;
  }

  function getAnalysisPath(item) {
    if (!item) return '/analisis';
    const ticker = (item.ticker || item.report?.ticker || AS.currentAnalysisTicker || '').toUpperCase();
    const slug = getAnalysisSlug(item);
    if (ticker && slug) {
      return `/informe/${encodeURIComponent(ticker)}/${slug}`;
    }
    if (item.id || AS.currentAnalysisId) {
      return `/informe/${item.id || AS.currentAnalysisId}`;
    }
    return '/analisis';
  }

  function isAuthenticated() {
    return Boolean(window.AuthModule?.getUser?.() || AS.currentUser);
  }

  function requireAuthForAnalysis(retry) {
    AS.pendingAuthRetry = typeof retry === 'function' ? retry : null;
    showToast('Crea una cuenta gratis para analizar informes nuevos con IA.');
    window.AuthModule?.openModal?.('register');
  }

  function handleAnalysisAccessError(data, retry) {
    if (data?.code === 'AUTH_REQUIRED') {
      cancelAnalysisUi();
      requireAuthForAnalysis(retry);
      return true;
    }
    return false;
  }

  function cancelAnalysisUi() {
    clearTimeout(AS.processingHintTimer);
    clearInterval(AS.analysisTimer);
    const processingPanel = document.querySelector('#processing-panel');
    if (processingPanel) processingPanel.hidden = true;
    const uploadForm = document.querySelector('#upload-form');
    if (uploadForm) uploadForm.hidden = false;
    const secAnalysisEntry = document.querySelector('#sec-analysis-entry');
    if (secAnalysisEntry) secAnalysisEntry.hidden = false;
  }

  function escapeHtml(value) {
    return window.HtmlUtils.escapeHtml(value);
  }

  function formatElapsed(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatHistoryDate(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  function showToast(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 3200);
  }

  function renderReport(report) {
    window.AnalisisTables.renderReport(report);
  }

  function setFile(file) {
    if (!file) return;
    const dropzone = document.querySelector('#dropzone');
    const filePreview = document.querySelector('#file-preview');
    const fileName = document.querySelector('#file-name');
    const fileSize = document.querySelector('#file-size');
    const analyzeButton = document.querySelector('#analyze-button');

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      showToast('Selecciona un archivo PDF para continuar.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      showToast('El archivo supera el límite de 25 MB.');
      return;
    }

    AS.selectedFile = file;
    if (fileName) fileName.textContent = file.name;
    if (fileSize) fileSize.textContent = formatFileSize(file.size);
    if (dropzone) dropzone.hidden = true;
    if (filePreview) filePreview.hidden = false;
    if (analyzeButton) analyzeButton.disabled = false;
  }

  function clearFile() {
    AS.selectedFile = null;
    const fileInput = document.querySelector('#file-input');
    const dropzone = document.querySelector('#dropzone');
    const filePreview = document.querySelector('#file-preview');
    const analyzeButton = document.querySelector('#analyze-button');

    if (fileInput) fileInput.value = '';
    if (dropzone) dropzone.hidden = false;
    if (filePreview) filePreview.hidden = true;
    if (analyzeButton) analyzeButton.disabled = true;
    clearPresentationFile();
  }

  function setPresentationFile(file) {
    if (!file) return;
    const presentationInput = document.querySelector('#presentation-input');
    const presentationPreview = document.querySelector('#presentation-preview');
    const presentationName = document.querySelector('#presentation-name');
    const presentationSize = document.querySelector('#presentation-size');
    const selectPresentation = document.querySelector('#select-presentation');

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      showToast('La presentación debe ser un archivo PDF.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      showToast('La presentación supera el límite de 25 MB.');
      return;
    }

    AS.selectedPresentation = file;
    if (presentationName) presentationName.textContent = file.name;
    if (presentationSize) presentationSize.textContent = formatFileSize(file.size);
    if (presentationPreview) presentationPreview.hidden = false;
    if (selectPresentation) selectPresentation.hidden = true;
    if (presentationInput) presentationInput.value = '';
  }

  function clearPresentationFile() {
    AS.selectedPresentation = null;
    const presentationInput = document.querySelector('#presentation-input');
    const presentationPreview = document.querySelector('#presentation-preview');
    const selectPresentation = document.querySelector('#select-presentation');
    if (presentationInput) presentationInput.value = '';
    if (presentationPreview) presentationPreview.hidden = true;
    if (selectPresentation) selectPresentation.hidden = false;
  }

  function setAgentState(agent, state) {
    const row = document.querySelector(`[data-agent="${agent}"]`);
    if (!row) return;

    row.classList.remove('active', 'done', 'error');
    const stateLabel = row.querySelector('.agent-state');
    if (state === 'active') {
      row.classList.add('active');
      if (stateLabel) stateLabel.textContent = 'Procesando';
    }
    if (state === 'done') {
      row.classList.add('done');
      if (stateLabel) stateLabel.textContent = 'Completado';
    }
    if (state === 'error') {
      row.classList.add('error');
      if (stateLabel) stateLabel.textContent = 'Error';
    }
  }

  function resetAgentStates() {
    ['origin', 'sector', 'analyst'].forEach((agent) => {
      const row = document.querySelector(`[data-agent="${agent}"]`);
      if (!row) return;
      row.classList.remove('active', 'done', 'error');
      const stateLabel = row.querySelector('.agent-state');
      if (stateLabel) stateLabel.textContent = 'En espera';
    });
  }

  function startProcessingHints() {
    clearTimeout(AS.processingHintTimer);
    const hints = [
      [45000, 'El análisis sigue en curso. Suele tardar entre 1 y 4 minutos.'],
      [240000, 'Esto está tardando más de lo habitual. Si no responde pronto, verás un mensaje de error claro para reintentar.'],
    ];
    hints.forEach(([delay, message]) => {
      AS.processingHintTimer = setTimeout(() => {
        const processingPanel = document.querySelector('#processing-panel');
        const analysisError = document.querySelector('#analysis-error');
        const processingNote = document.querySelector('#processing-note');
        if (processingPanel?.hidden) return;
        if (analysisError && !analysisError.hidden) return;
        if (processingNote) processingNote.textContent = message;
      }, delay);
    });
  }

window.getAnalysisSlug = getAnalysisSlug;
window.getAnalysisPath = getAnalysisPath;
window.isAuthenticated = isAuthenticated;
window.requireAuthForAnalysis = requireAuthForAnalysis;
window.handleAnalysisAccessError = handleAnalysisAccessError;
window.cancelAnalysisUi = cancelAnalysisUi;
window.escapeHtml = escapeHtml;
window.formatElapsed = formatElapsed;
window.formatFileSize = formatFileSize;
window.formatHistoryDate = formatHistoryDate;
window.showToast = showToast;
window.renderReport = renderReport;
window.setFile = setFile;
window.clearFile = clearFile;
window.setPresentationFile = setPresentationFile;
window.clearPresentationFile = clearPresentationFile;
window.setAgentState = setAgentState;
window.resetAgentStates = resetAgentStates;
window.startProcessingHints = startProcessingHints;

})(window);
