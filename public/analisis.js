/* ── Módulo de Análisis Fundamental (Cifra) ──────────────────────────────── */

(function () {
  'use strict';

  let selectedFile = null;
  let selectedPresentation = null;
  let analysisTimer = null;
  let processingHintTimer = null;
  let lastAnalysisFailed = true;
  let currentPdfUrl = null;
  let currentDownloadBase = null;
  let currentDownloadName = 'analisis-cifra';
  let pendingFiling = null;
  let currentUser = false;
  let historyDebounceTimer = null;
  let historyAnalyses = [];
  let historySort = { key: 'created_at', dir: 'desc' };
  let historyPage = 1;
  const HISTORY_PAGE_SIZE = 10;
  let initialized = false;
  let historyCompanies = [];
  let historySuggest = null;
  let historySuggestIndex = -1;
  let currentAnalysisId = null;
  let currentAnalysisTicker = null;
  let currentAnalysisAccession = null;
  let currentAnalysisSlug = null;
  let currentAnalysisVersion = null;
  let currentAnalysisSubsector = null;
  let currentAnalysisCurrentVersion = null;
  let currentAnalysisVersionOutdated = false;
  let currentAnalysisIsReviewed = false;
  let currentAnalysisVersions = [];
  let pendingVersionsMenuOpen = false;
  const analysisVersionsCache = new Map();
  let currentUserRating = 0;
  let pendingAuthRetry = null;

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
    const ticker = (item.ticker || item.report?.ticker || currentAnalysisTicker || '').toUpperCase();
    const slug = getAnalysisSlug(item);
    if (ticker && slug) {
      return `/informe/${encodeURIComponent(ticker)}/${slug}`;
    }
    if (item.id || currentAnalysisId) {
      return `/informe/${item.id || currentAnalysisId}`;
    }
    return '/analisis';
  }

  function isAuthenticated() {
    return Boolean(window.AuthModule?.getUser?.() || currentUser);
  }

  function requireAuthForAnalysis(retry) {
    pendingAuthRetry = typeof retry === 'function' ? retry : null;
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
    clearTimeout(processingHintTimer);
    clearInterval(analysisTimer);
    const processingPanel = document.querySelector('#processing-panel');
    if (processingPanel) processingPanel.hidden = true;
    const uploadForm = document.querySelector('#upload-form');
    if (uploadForm) uploadForm.hidden = false;
    const secAnalysisEntry = document.querySelector('#sec-analysis-entry');
    if (secAnalysisEntry) secAnalysisEntry.hidden = false;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
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

    selectedFile = file;
    if (fileName) fileName.textContent = file.name;
    if (fileSize) fileSize.textContent = formatFileSize(file.size);
    if (dropzone) dropzone.hidden = true;
    if (filePreview) filePreview.hidden = false;
    if (analyzeButton) analyzeButton.disabled = false;
  }

  function clearFile() {
    selectedFile = null;
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

    selectedPresentation = file;
    if (presentationName) presentationName.textContent = file.name;
    if (presentationSize) presentationSize.textContent = formatFileSize(file.size);
    if (presentationPreview) presentationPreview.hidden = false;
    if (selectPresentation) selectPresentation.hidden = true;
    if (presentationInput) presentationInput.value = '';
  }

  function clearPresentationFile() {
    selectedPresentation = null;
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
    clearTimeout(processingHintTimer);
    const hints = [
      [45000, 'El análisis sigue en curso. Suele tardar entre 1 y 4 minutos.'],
      [240000, 'Esto está tardando más de lo habitual. Si no responde pronto, verás un mensaje de error claro para reintentar.'],
    ];
    hints.forEach(([delay, message]) => {
      processingHintTimer = setTimeout(() => {
        const processingPanel = document.querySelector('#processing-panel');
        const analysisError = document.querySelector('#analysis-error');
        const processingNote = document.querySelector('#processing-note');
        if (processingPanel?.hidden) return;
        if (analysisError && !analysisError.hidden) return;
        if (processingNote) processingNote.textContent = message;
      }, delay);
    });
  }

  function showAnalysisError(message, failedAgent = 'origin') {
    lastAnalysisFailed = true;
    clearTimeout(processingHintTimer);
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
    clearInterval(analysisTimer);
  }

  function startAnalysisUi(title) {
    clearInterval(analysisTimer);
    clearTimeout(processingHintTimer);
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
    currentAnalysisId = null;
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

    analysisTimer = setInterval(() => {
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
    clearTimeout(processingHintTimer);
    setAgentState('origin', 'done');
    setAgentState('sector', 'done');
    setAgentState('analyst', 'done');
    lastAnalysisFailed = false;

    const progressBar = document.querySelector('#progress-bar');
    if (progressBar) progressBar.style.width = '100%';
    const processingTitle = document.querySelector('#processing-title');
    if (processingTitle) processingTitle.textContent = 'Análisis completado: informe generado';
    clearInterval(analysisTimer);

    const retryButton = document.querySelector('#retry-analysis');
    if (retryButton) {
      retryButton.textContent = 'Analizar otro informe';
      retryButton.hidden = false;
    }

    currentPdfUrl = data.pdfUrl ?? null;
    currentDownloadBase = currentPdfUrl ? currentPdfUrl.replace(/\.pdf$/, '') : null;
    // Nombre del servidor: TIKR-AÑO-QX (10-Q) o TIKR-AÑO-K (10-K)
    currentDownloadName = data.downloadBase ?? 'analisis-cifra';
    renderReport(data.report ?? {});

    const resultPreview = document.querySelector('#result-preview');
    if (resultPreview) resultPreview.hidden = false;

    currentAnalysisId = data.analysisId ?? null;
    currentAnalysisTicker = data.report?.ticker || pendingFiling?.ticker || null;
    currentAnalysisAccession = pendingFiling?.accession || null;
    currentAnalysisSlug = data.slug || getAnalysisSlug(data);

    setAnalysisVersionState({
      version: data.version ?? null,
      subsector: data.subsector ?? null,
      currentVersion: data.currentVersion ?? data.version ?? null,
      versionOutdated: data.versionOutdated === true,
    });

    if (currentAnalysisTicker && currentAnalysisAccession) {
      window.dispatchEvent(new CustomEvent('analysis:finished', {
        detail: {
          ticker: currentAnalysisTicker,
          accession: currentAnalysisAccession,
          version: data.version ?? null,
        },
      }));
    }

    loadAnalysisFeedback(currentAnalysisId);
    if (currentAnalysisId) {
      try { history.replaceState(null, '', getAnalysisPath({ ...data, id: currentAnalysisId, ticker: currentAnalysisTicker, slug: currentAnalysisSlug })); } catch {}
    }

    const adminRegenBtn = document.querySelector('#admin-regenerate-report');
    if (adminRegenBtn) {
      const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || currentUser?.isAdmin);
      adminRegenBtn.hidden = !isAdmin;
    }

    const saved = data.saved && currentUser;
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

  /* ── Valoración de análisis y reporte de incidencias ────────── */
  function renderRatingState(userRating, ratingSummary) {
    currentUserRating = Number(userRating) || 0;
    const starBtns = document.querySelectorAll('#rating-stars .star-btn');
    starBtns.forEach((btn) => {
      const val = Number(btn.dataset.value);
      btn.classList.toggle('active', val <= currentUserRating);
      btn.classList.remove('hovered');
    });

    const summaryEl = document.querySelector('#rating-summary-text');
    if (!summaryEl) return;

    const count = Number(ratingSummary?.count) || 0;
    const avg = Number(ratingSummary?.average) || 0;

    if (count > 0) {
      const avgStr = avg.toFixed(1);
      const countStr = `${count} ${count === 1 ? 'valoración' : 'valoraciones'}`;
      if (currentUserRating > 0) {
        summaryEl.textContent = `${avgStr} ★ (${countStr}) · Tu nota: ${currentUserRating} ★`;
      } else {
        summaryEl.textContent = `${avgStr} ★ (${countStr})`;
      }
    } else if (currentUserRating > 0) {
      summaryEl.textContent = `Tu nota: ${currentUserRating} ★`;
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

  async function submitRating(rating) {
    if (!currentAnalysisId) return;
    try {
      const response = await fetch(`/api/analyses/${currentAnalysisId}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        renderRatingState(data.userRating ?? rating, data.ratingSummary);
        showToast(`¡Gracias! Has valorado este análisis con ${rating} ${rating === 1 ? 'estrella' : 'estrellas'}.`);
      } else {
        showToast(data.error || 'No se pudo registrar la valoración.');
      }
    } catch {
      showToast('Error al registrar la valoración.');
    }
  }

  let analysisAttachmentMgr = null;

  function openErrorReportModal() {
    const modal = document.querySelector('#error-report-modal-backdrop');
    if (!modal) return;
    modal.hidden = false;
    const desc = document.querySelector('#error-report-desc');
    if (desc) {
      desc.value = '';
      setTimeout(() => desc.focus(), 60);
    }
    analysisAttachmentMgr?.clear();
  }

  function closeErrorReportModal() {
    const modal = document.querySelector('#error-report-modal-backdrop');
    if (modal) modal.hidden = true;
  }

  async function submitErrorReport(event) {
    event.preventDefault();
    if (!currentAnalysisId) {
      showToast('No hay ningún análisis seleccionado para reportar.');
      return;
    }
    const category = document.querySelector('#error-report-category')?.value || 'other';
    const descInput = document.querySelector('#error-report-desc');
    const description = descInput?.value?.trim() || '';
    const images = analysisAttachmentMgr?.getImages() || [];

    if (!description) {
      showToast('Por favor, describe detalladamente la incidencia detectada.');
      descInput?.focus();
      return;
    }
    const submitBtn = document.querySelector('#error-report-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
    }
    try {
      const response = await fetch(`/api/analyses/${currentAnalysisId}/report-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, description, images }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        closeErrorReportModal();
        showToast('Incidencia reportada con éxito. ¡Gracias por tu colaboración!');
      } else {
        showToast(data.error || 'No se pudo enviar el reporte.');
      }
    } catch {
      showToast('Error de red al enviar el reporte.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar reporte';
      }
    }
  }

  async function runRealAnalysis() {
    const fileInput = document.querySelector('#file-input');
    if (!selectedFile) {
      if (fileInput?.files && fileInput.files[0]) {
        setFile(fileInput.files[0]);
      } else {
        showToast('Selecciona un archivo PDF antes de iniciar el análisis.');
        return;
      }
    }

    if (!isAuthenticated()) {
      requireAuthForAnalysis(() => runRealAnalysis());
      return;
    }

    pendingFiling = null;
    startAnalysisUi('Verificando el documento...');
    startProcessingHints();

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (selectedPresentation) formData.append('presentation', selectedPresentation);

    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleAnalysisAccessError(data, () => runRealAnalysis())) return;
        failAnalysis(data);
        return;
      }

      finishAnalysis(data);
    } catch {
      showAnalysisError('No se pudo conectar con el servidor. Comprueba que esté en marcha.');
    }
  }

  async function runFilingAnalysis(ticker, accession, options = {}) {
    const isForce = Boolean(options.force);
    const isUpgrade = Boolean(options.upgrade);
    const openVersions = Boolean(options.openVersions);
    if (!isForce && !isAuthenticated()) {
      requireAuthForAnalysis(() => runFilingAnalysis(ticker, accession, options));
      return;
    }
    pendingFiling = { ticker, accession };
    currentAnalysisTicker = ticker;
    currentAnalysisAccession = accession;
    startAnalysisUi(isForce
      ? `Regenerando informe de ${ticker} con IA…`
      : isUpgrade
        ? `Actualizando el informe de ${ticker} a la nueva versión…`
        : `Analizando el informe de ${ticker}…`);
    const processingNote = document.querySelector('#processing-note');
    if (processingNote) {
      processingNote.textContent = isForce
        ? 'Volviendo a analizar desde SEC EDGAR con IA. Las versiones anteriores se conservan.'
        : isUpgrade
          ? 'Regenerando el informe con la versión más reciente del análisis. Las versiones anteriores se conservan.'
          : 'Informe de SEC EDGAR. Verificación y extracción de señales financieras con IA.';
    }
    startProcessingHints();

    try {
      const endpoint = isForce
        ? `/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(accession)}/regenerate`
        : `/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(accession)}/analyze`;

      const requestOptions = isUpgrade
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upgrade: true }) }
        : { method: 'POST' };
      const response = await fetch(endpoint, requestOptions);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleAnalysisAccessError(data, () => runFilingAnalysis(ticker, accession, options))) return;
        failAnalysis(data);
        return;
      }

      finishAnalysis(data);
      if (openVersions) openAnalysisVersionsMenu();
      if (isForce) {
        showToast('Informe regenerado con éxito. Las versiones anteriores se conservan.');
      } else if (isUpgrade) {
        showToast(`Análisis actualizado${data.version ? ` a la versión ${data.version}` : ''}. Las versiones anteriores siguen disponibles.`);
      }
    } catch {
      showAnalysisError('No se pudo conectar con el servidor. Comprueba que esté en marcha.');
    }
  }

  function downloadReport(format, baseUrl = currentDownloadBase, name = currentDownloadName) {
    if (!baseUrl || !['pdf', 'docx', 'odt', 'html'].includes(format)) return;
    const link = document.createElement('a');
    const safeName = encodeURIComponent(name || 'analisis-cifra');
    link.href = `${baseUrl}.${format}?download=1&name=${safeName}`;
    link.download = `${name}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /* ── Versiones del análisis (histórico por filing) ────────────── */

  function renderAnalysisVersionsMenu() {
    const menu = document.querySelector('#analysis-versions-menu');
    if (!menu) return;
    if (!currentAnalysisVersions.length) {
      menu.innerHTML = '<div class="analysis-versions-empty">Todavía no hay versiones guardadas.</div>';
      return;
    }
    menu.innerHTML = currentAnalysisVersions.map((entry) => {
      const isActive = String(entry.id) === String(currentAnalysisId);
      const isReviewed = Boolean(entry.isReviewed ?? entry.is_reviewed);
      const reviewedBadge = isReviewed
        ? `<span class="analysis-reviewed-mini-badge" title="Este análisis ha sido revisado por un humano" aria-label="Este análisis ha sido revisado por un humano"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> Revisado</span>`
        : '';
      const versionLabel = entry.version ? `v${escapeHtml(entry.version)}` : 'Sin versión';
      const dateLabel = entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('es-ES') : '';
      const base = entry.downloadBase ? String(entry.downloadBase) : '';
      return `<div class="analysis-version-item${isActive ? ' active' : ''}" data-version-id="${escapeHtml(entry.id)}">
        <div class="analysis-version-item-data">
          <strong>${versionLabel}${isActive ? ' · actual' : ''} ${reviewedBadge}</strong>
          <span>${escapeHtml(dateLabel)}${entry.modelUsed ? ` · ${escapeHtml(entry.modelUsed)}` : ''}</span>
        </div>
        <div class="analysis-version-item-actions">
          <button type="button" class="row-action" data-version-action="view" title="Ver esta versión"${isActive ? ' disabled' : ''}>Ver</button>
          ${base ? `<button type="button" class="row-action" data-version-action="pdf" title="Descargar PDF">PDF</button><button type="button" class="row-action" data-version-action="docx" title="Descargar Word">DOCX</button><button type="button" class="row-action" data-version-action="odt" title="Descargar ODT">ODT</button>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function renderAnalysisVersionControl() {
    const box = document.querySelector('#analysis-version-box');
    if (!box) return;
    const hasAnyVersion = Boolean(currentAnalysisVersion || currentAnalysisVersions.length);
    box.hidden = !hasAnyVersion;
    if (!hasAnyVersion) return;

    const badge = document.querySelector('#analysis-version-badge');
    if (badge) {
      badge.textContent = currentAnalysisVersion ? `v${currentAnalysisVersion}` : 'Sin versión';
      badge.title = currentAnalysisVersion
        ? `Versión del análisis guardado: ${currentAnalysisVersion}`
        : 'Análisis generado antes del versionado';
    }

    const reviewedBadge = document.querySelector('#analysis-reviewed-badge');
    if (reviewedBadge) {
      reviewedBadge.hidden = !currentAnalysisIsReviewed;
    }

    const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || currentUser?.isAdmin);
    const reviewedToggle = document.querySelector('#analysis-reviewed-toggle');
    const reviewedCheckbox = document.querySelector('#analysis-reviewed-checkbox');
    if (reviewedToggle && reviewedCheckbox) {
      reviewedToggle.hidden = !isAdmin || !currentAnalysisId;
      reviewedCheckbox.checked = Boolean(currentAnalysisIsReviewed);
    }

    const toggle = document.querySelector('#analysis-versions-toggle');
    if (toggle) {
      const canList = Boolean(currentAnalysisAccession && currentAnalysisVersions.length);
      toggle.hidden = !canList;
      const countEl = document.querySelector('#analysis-versions-count');
      if (countEl) countEl.textContent = canList ? `(${currentAnalysisVersions.length})` : '';
      if (!toggle.hidden && pendingVersionsMenuOpen) openAnalysisVersionsMenu();
    }

    const upgrade = document.querySelector('#analysis-version-upgrade');
    if (upgrade) {
      const canUpgrade = currentAnalysisVersionOutdated && currentAnalysisTicker && currentAnalysisAccession && (!currentAnalysisIsReviewed || isAdmin);
      upgrade.hidden = !canUpgrade;
      if (canUpgrade) {
        const targetDiffers = currentAnalysisCurrentVersion
          && String(currentAnalysisCurrentVersion) !== String(currentAnalysisVersion);
        upgrade.textContent = targetDiffers
          ? `Actualizar a v${currentAnalysisCurrentVersion} ✨`
          : 'Actualizar con la nueva versión ✨';
        upgrade.title = 'Regenerar el análisis con las reglas vigentes (consume cupo diario). Se conservan las versiones anteriores.';
      }
    }

    renderAnalysisVersionsMenu();
  }

  function applyAnalysisVersionsCache() {
    const ticker = String(currentAnalysisTicker ?? '').toUpperCase();
    const accession = currentAnalysisAccession ? String(currentAnalysisAccession) : '';
    const key = ticker && accession ? `${ticker}|${accession}` : null;
    const cached = key ? analysisVersionsCache.get(key) : null;
    currentAnalysisVersions = cached?.versions ?? [];
    if (cached?.currentVersion) currentAnalysisCurrentVersion = cached.currentVersion;
    if (cached && typeof cached.versionOutdated === 'boolean') {
      currentAnalysisVersionOutdated = cached.versionOutdated;
    }
    if (!currentAnalysisVersion && currentAnalysisVersions.length) {
      const latest = currentAnalysisVersions[0];
      const viewingLatest = !currentAnalysisId || String(latest.id) === String(currentAnalysisId);
      if (viewingLatest && latest.version) currentAnalysisVersion = latest.version;
    }
    if (currentAnalysisId && currentAnalysisVersions.length) {
      const matching = currentAnalysisVersions.find((v) => String(v.id) === String(currentAnalysisId));
      if (matching) {
        currentAnalysisIsReviewed = Boolean(matching.isReviewed ?? matching.is_reviewed);
      }
    }
    renderAnalysisVersionControl();
  }

  async function refreshAnalysisVersions() {
    const ticker = String(currentAnalysisTicker ?? '').toUpperCase();
    const accession = currentAnalysisAccession ? String(currentAnalysisAccession) : '';
    const key = ticker && accession ? `${ticker}|${accession}` : null;
    if (!key) {
      currentAnalysisVersions = [];
      renderAnalysisVersionControl();
      return;
    }
    if (analysisVersionsCache.has(key)) {
      applyAnalysisVersionsCache();
      return;
    }
    try {
      const response = await fetch(`/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(accession)}/versions`);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        analysisVersionsCache.set(key, {
          versions: Array.isArray(data.versions) ? data.versions : [],
          currentVersion: data.currentVersion ?? null,
          versionOutdated: Boolean(data.versionOutdated),
          isReviewed: Boolean(data.isReviewed),
        });
      } else {
        analysisVersionsCache.set(key, { versions: [], currentVersion: null, versionOutdated: false });
      }
    } catch {
      analysisVersionsCache.set(key, { versions: [], currentVersion: null, versionOutdated: false });
    }
    applyAnalysisVersionsCache();
  }

  function setAnalysisVersionState(source = {}) {
    currentAnalysisVersion = source.version ?? null;
    currentAnalysisSubsector = source.subsector ?? null;
    if (typeof source.isReviewed === 'boolean') currentAnalysisIsReviewed = source.isReviewed;
    else if (typeof source.is_reviewed === 'boolean') currentAnalysisIsReviewed = source.is_reviewed;
    if (source.currentVersion) currentAnalysisCurrentVersion = source.currentVersion;
    currentAnalysisVersionOutdated = source.versionOutdated === true;
    renderAnalysisVersionControl();
    refreshAnalysisVersions();
  }

  function resetAnalysisVersionState() {
    currentAnalysisVersion = null;
    currentAnalysisSubsector = null;
    currentAnalysisCurrentVersion = null;
    currentAnalysisVersionOutdated = false;
    currentAnalysisIsReviewed = false;
    currentAnalysisVersions = [];
    pendingVersionsMenuOpen = false;
    const box = document.querySelector('#analysis-version-box');
    if (box) box.hidden = true;
    const menu = document.querySelector('#analysis-versions-menu');
    if (menu) menu.hidden = true;
    const reviewedBadge = document.querySelector('#analysis-reviewed-badge');
    if (reviewedBadge) reviewedBadge.hidden = true;
    const reviewedToggle = document.querySelector('#analysis-reviewed-toggle');
    if (reviewedToggle) reviewedToggle.hidden = true;
  }

  function openAnalysisVersionsMenu() {
    const toggle = document.querySelector('#analysis-versions-toggle');
    const menu = document.querySelector('#analysis-versions-menu');
    if (!toggle || !menu) return;
    if (toggle.hidden) {
      pendingVersionsMenuOpen = true;
      return;
    }
    pendingVersionsMenuOpen = false;
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    renderAnalysisVersionsMenu();
  }

  function closeAnalysisVersionsMenu() {
    pendingVersionsMenuOpen = false;
    const menu = document.querySelector('#analysis-versions-menu');
    if (menu && !menu.hidden) menu.hidden = true;
    document.querySelector('#analysis-versions-toggle')?.setAttribute('aria-expanded', 'false');
  }

  function loadReportData(analysis, { updateHistory = false } = {}) {
    if (!analysis || !analysis.report) return;
    currentPdfUrl = analysis.pdf_url ?? null;
    currentDownloadBase = currentPdfUrl ? currentPdfUrl.replace(/\.pdf$/, '') : (analysis.downloadBase ?? null);
    currentDownloadName = analysis.downloadBase ?? (analysis.ticker ? `${analysis.ticker}-${(analysis.periodTitle || 'informe').replace(/\s+/g, '-')}` : 'analisis-cifra');

    const titleParts = [analysis.company_name || analysis.company || analysis.ticker, analysis.periodTitle || analysis.report?.periodTitle].filter(Boolean);
    const resultTitle = document.querySelector('#result-title');
    if (resultTitle) resultTitle.textContent = titleParts.length ? titleParts.join(' — ') : 'Informe guardado';

    renderReport(analysis.report ?? {});

    currentAnalysisId = analysis.id ? Number(analysis.id) : null;
    currentAnalysisTicker = analysis.ticker || analysis.report?.ticker || null;
    currentAnalysisAccession = analysis.accession || null;
    currentAnalysisSlug = analysis.slug || getAnalysisSlug(analysis);

    setAnalysisVersionState({
      version: analysis.version ?? null,
      subsector: analysis.subsector ?? null,
      isReviewed: Boolean(analysis.isReviewed ?? analysis.is_reviewed),
      currentVersion: analysis.currentVersion ?? null,
      versionOutdated: analysis.versionOutdated === true,
    });

    loadAnalysisFeedback(currentAnalysisId);

    if (currentAnalysisId && updateHistory) {
      try { history.replaceState(null, '', getAnalysisPath({ ...analysis, id: currentAnalysisId, ticker: currentAnalysisTicker, slug: currentAnalysisSlug })); } catch {}
    }

    const adminRegenBtn = document.querySelector('#admin-regenerate-report');
    if (adminRegenBtn) {
      const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || currentUser?.isAdmin);
      adminRegenBtn.hidden = !isAdmin;
    }

    const processingPanel = document.querySelector('#processing-panel');
    if (processingPanel) processingPanel.hidden = true;
    const retryButton = document.querySelector('#retry-analysis');
    if (retryButton) retryButton.hidden = true;
    const uploadForm = document.querySelector('#upload-form');
    if (uploadForm) uploadForm.hidden = true;
    const secAnalysisEntry = document.querySelector('#sec-analysis-entry');
    if (secAnalysisEntry) secAnalysisEntry.hidden = true;
    const resultPreview = document.querySelector('#result-preview');
    if (resultPreview) resultPreview.hidden = false;
  }

  async function viewHistoryAnalysis(row) {
    const id = row?.dataset?.id;
    const url = row?.dataset?.pdfUrl;
    if (!id || !url) return;
    try {
      const response = await fetch(`/api/analyses/${id}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.analysis?.report) {
        showToast('No se pudo cargar el análisis guardado.');
        return;
      }
      loadReportData(data.analysis, { updateHistory: true });
      const resultPreview = document.querySelector('#result-preview');
      resultPreview?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      showToast('No se pudo conectar con el servidor.');
    }
  }

  function isAnalysisAnnual(analysis) {
    if (typeof analysis?.isAnnual === 'boolean') return analysis.isAnnual;
    const formType = String(analysis?.formType || '').toUpperCase();
    if (formType === '10-K') return true;
    if (formType === '10-Q') return false;
    const title = String(analysis?.periodTitle || '').toLowerCase();
    const filename = String(analysis?.filename || '').toLowerCase();
    return /annual|full year|10-?k/i.test(title) || /10-?k/i.test(filename);
  }

  function historyQuery() {
    const historyCompanyInput = document.querySelector('#history-company');
    const historyFromInput = document.querySelector('#history-from');
    const historyToInput = document.querySelector('#history-to');
    const dateType = document.querySelector('input[name="history-date-type"]:checked')?.value ?? 'period';
    const reportType = document.querySelector('input[name="history-report-type"]:checked')?.value ?? 'all';
    const params = new URLSearchParams();
    const ticker = historyCompanyInput?.value?.trim();
    if (ticker) params.set('ticker', ticker);
    if (historyFromInput?.value) params.set(dateType === 'period' ? 'periodFrom' : 'createdFrom', historyFromInput.value);
    if (historyToInput?.value) params.set(dateType === 'period' ? 'periodTo' : 'createdTo', historyToInput.value);
    if (reportType && reportType !== 'all') params.set('reportType', reportType);
    return params;
  }

  function renderHistory(analyses, options = {}) {
    window.AnalisisHistory.renderHistory(analyses, {
      currentUser,
      onViewAnalysis: viewHistoryAnalysis,
      resetPage: options.resetPage,
    });
  }

  async function fetchHistoryCompanies() {
    if (!currentUser) {
      historyCompanies = [];
      closeHistorySuggestions();
      return;
    }
    try {
      const response = await fetch('/api/analyses/companies');
      const data = await response.json().catch(() => ({}));
      if (response.ok) historyCompanies = Array.isArray(data.companies) ? data.companies : [];
    } catch (error) {
      console.error('[history-suggest]', error?.message ?? error);
    }
  }

  function closeHistorySuggestions() {
    if (historySuggest) {
      historySuggest.hidden = true;
      historySuggest.innerHTML = '';
    }
    historySuggestIndex = -1;
  }

  function selectHistorySuggestion(ticker) {
    const historyCompanyInput = document.querySelector('#history-company');
    if (historyCompanyInput) historyCompanyInput.value = ticker;
    closeHistorySuggestions();
    historyCompanyInput?.focus();
    clearTimeout(historyDebounceTimer);
    fetchAnalyses();
  }

  function moveHistorySuggestion(delta) {
    if (!historySuggest || historySuggest.hidden) return;
    const options = historySuggest.querySelectorAll('.history-suggest-option');
    if (!options.length) return;
    historySuggestIndex = (historySuggestIndex + delta + options.length) % options.length;
    options.forEach((option, index) => option.classList.toggle('active', index === historySuggestIndex));
    options[historySuggestIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function renderHistorySuggestions() {
    const historyCompanyInput = document.querySelector('#history-company');
    if (!historySuggest || !historyCompanyInput) return;

    const query = historyCompanyInput.value.trim().toLowerCase();
    if (!historyCompanies.length) {
      closeHistorySuggestions();
      return;
    }

    const matches = (query
      ? historyCompanies.filter((company) =>
        (company.ticker ?? '').toLowerCase().includes(query)
        || (company.companyName ?? '').toLowerCase().includes(query))
      : historyCompanies)
      .slice(0, 12);

    if (!matches.length) {
      historySuggest.innerHTML = '<div class="history-suggest-empty">Sin coincidencias en tus análisis</div>';
      historySuggest.hidden = false;
      historySuggestIndex = -1;
      return;
    }

    historySuggest.innerHTML = matches.map((company) => {
      const ticker = String(company.ticker ?? '').toUpperCase();
      const name = company.companyName || ticker;
      const letter = (ticker || name || '?').slice(0, 1).toUpperCase();
      return `
        <button class="history-suggest-option" type="button" data-ticker="${escapeHtml(ticker)}">
          <span class="table-file" data-letter="${escapeHtml(letter)}">${ticker ? `<img class="table-file-logo" src="https://companiesmarketcap.com/img/company-logos/64/${escapeHtml(ticker)}.webp" alt="" loading="lazy">` : ''}</span>
          <span class="history-suggest-name">${escapeHtml(name)}</span>
          ${ticker ? `<strong class="history-suggest-ticker">${escapeHtml(ticker)}</strong>` : ''}
          <span class="history-suggest-count" title="Análisis guardados de esta empresa">${company.total ?? 1}</span>
        </button>
      `;
    }).join('');

    historySuggest.querySelectorAll('.table-file-logo').forEach((img) => {
      img.addEventListener('error', () => {
        const span = img.closest('.table-file');
        if (span) span.textContent = span.dataset.letter || '?';
      });
    });

    historySuggest.querySelectorAll('.history-suggest-option').forEach((option) => {
      option.addEventListener('click', () => selectHistorySuggestion(option.dataset.ticker));
      option.addEventListener('mousemove', () => {
        historySuggest.querySelectorAll('.history-suggest-option').forEach((item) => item.classList.remove('active'));
        option.classList.add('active');
        historySuggestIndex = Array.from(historySuggest.querySelectorAll('.history-suggest-option')).indexOf(option);
      });
    });

    historySuggest.hidden = false;
    historySuggestIndex = -1;
  }

  async function fetchAnalyses() {
    if (!currentUser) {
      renderHistory([]);
      return;
    }
    try {
      const response = await fetch(`/api/analyses?${historyQuery().toString()}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) renderHistory(data.analyses ?? [], { resetPage: true });
    } catch {
      renderHistory([]);
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;

    const historyCompanyLabel = document.querySelector('.history-company');
    if (historyCompanyLabel && !document.querySelector('#history-suggest')) {
      historySuggest = document.createElement('div');
      historySuggest.className = 'history-suggest';
      historySuggest.id = 'history-suggest';
      historySuggest.hidden = true;
      historyCompanyLabel.appendChild(historySuggest);
    }

    const fileInput = document.querySelector('#file-input');
    const dropzone = document.querySelector('#dropzone');
    const selectFileButton = document.querySelector('#select-file');
    const removeFileButton = document.querySelector('#remove-file');
    const uploadForm = document.querySelector('#upload-form');
    const secAnalysisEntry = document.querySelector('#sec-analysis-entry');
    const retryAnalysis = document.querySelector('#retry-analysis');
    const reportDownload = document.querySelector('#report-download');
    const newAnalysis = document.querySelector('#new-analysis');
    const historyRefresh = document.querySelector('#history-refresh');
    const historyCompanyInput = document.querySelector('#history-company');
    const historyFromInput = document.querySelector('#history-from');
    const historyToInput = document.querySelector('#history-to');
    const historyClear = document.querySelector('#history-clear');
    const historyLoginButton = document.querySelector('#history-login');

    selectFileButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      fileInput?.click();
    });

    dropzone?.addEventListener('click', () => fileInput?.click());
    dropzone?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput?.click();
      }
    });

    fileInput?.addEventListener('change', (event) => {
      if (event.target.files && event.target.files[0]) {
        setFile(event.target.files[0]);
      }
    });

    document.querySelector('#select-presentation')?.addEventListener('click', (event) => {
      event.stopPropagation();
      document.querySelector('#presentation-input')?.click();
    });

    document.querySelector('#presentation-input')?.addEventListener('change', (event) => {
      if (event.target.files && event.target.files[0]) {
        setPresentationFile(event.target.files[0]);
      }
    });

    document.querySelector('#remove-presentation')?.addEventListener('click', (event) => {
      event.stopPropagation();
      clearPresentationFile();
    });

    removeFileButton?.addEventListener('click', clearFile);

    if (dropzone) {
      ['dragenter', 'dragover'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
          event.preventDefault();
          dropzone.classList.add('dragging');
        });
      });

      ['dragleave', 'drop'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
          event.preventDefault();
          dropzone.classList.remove('dragging');
        });
      });

      dropzone.addEventListener('drop', (event) => {
        if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
          setFile(event.dataTransfer.files[0]);
        }
      });
    }

    uploadForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      runRealAnalysis();
    });

    retryAnalysis?.addEventListener('click', () => {
      const processingPanel = document.querySelector('#processing-panel');
      if (processingPanel) processingPanel.hidden = true;
      if (uploadForm) uploadForm.hidden = true;
      if (secAnalysisEntry) secAnalysisEntry.hidden = !pendingFiling;
      if (pendingFiling) {
        runFilingAnalysis(pendingFiling.ticker, pendingFiling.accession);
        return;
      }
      if (!lastAnalysisFailed) clearFile();
    });

    document.querySelectorAll('.result-actions [data-format]').forEach((button) => {
      button.addEventListener('click', () => downloadReport(button.dataset.format));
    });

    const copyReportUrlBtn = document.querySelector('#copy-report-url');
    copyReportUrlBtn?.addEventListener('click', async () => {
      if (!currentAnalysisId && !currentAnalysisTicker) {
        showToast('El informe aún no tiene una URL asignada.');
        return;
      }
      const path = getAnalysisPath({ id: currentAnalysisId, ticker: currentAnalysisTicker, slug: currentAnalysisSlug });
      const canonicalUrl = `${window.location.origin}${path}`;
      try {
        await navigator.clipboard.writeText(canonicalUrl);
        showToast('Enlace copiado al portapapeles 📋');
      } catch {
        prompt('Enlace permanente de este informe:', canonicalUrl);
      }
    });

    const versionsToggle = document.querySelector('#analysis-versions-toggle');
    versionsToggle?.addEventListener('click', (event) => {
      event.stopPropagation();
      const menu = document.querySelector('#analysis-versions-menu');
      if (!menu) return;
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      versionsToggle.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) renderAnalysisVersionsMenu();
    });

    document.addEventListener('click', async (event) => {
      const versionAction = event.target.closest('#analysis-versions-menu [data-version-action]');
      if (versionAction) {
        const item = versionAction.closest('.analysis-version-item');
        const entry = currentAnalysisVersions.find((version) => String(version.id) === String(item?.dataset.versionId));
        if (!entry) return;
        const action = versionAction.dataset.versionAction;
        if (action === 'view') {
          try {
            const response = await fetch(`/api/analyses/${entry.id}`);
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.analysis?.report) {
              showToast('No se pudo cargar esa versión del análisis.');
              return;
            }
            loadReportData(data.analysis, { updateHistory: false });
            document.querySelector('#result-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch {
            showToast('No se pudo conectar con el servidor.');
          }
        } else {
          downloadReport(action, entry.downloadBase, entry.downloadBase || 'analisis-cifra');
        }
        return;
      }
      if (!event.target.closest('#analysis-version-box')) closeAnalysisVersionsMenu();
    });

    const versionUpgradeBtn = document.querySelector('#analysis-version-upgrade');
    versionUpgradeBtn?.addEventListener('click', () => {
      const ticker = currentAnalysisTicker;
      const accession = currentAnalysisAccession;
      if (!ticker || !accession) {
        showToast('Este análisis no se puede regenerar automáticamente.');
        return;
      }
      const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || currentUser?.isAdmin);
      if (currentAnalysisIsReviewed && !isAdmin) {
        showToast('Este análisis ha sido revisado por un humano. Solo un administrador puede regenerarlo.');
        return;
      }
      const target = currentAnalysisCurrentVersion ? `la versión ${currentAnalysisCurrentVersion}` : 'la versión más reciente';
      if (!confirm(`¿Regenerar el análisis de ${ticker} con ${target}?\n\nSe genera un análisis nuevo (consume cupo diario) y la versión actual se conserva en el historial de versiones.`)) {
        return;
      }
      runFilingAnalysis(ticker, accession, { upgrade: true });
    });

    newAnalysis?.addEventListener('click', () => {
      const resultPreview = document.querySelector('#result-preview');
      if (resultPreview) resultPreview.hidden = true;
      if (uploadForm) uploadForm.hidden = true;
      if (secAnalysisEntry) secAnalysisEntry.hidden = false;
      pendingFiling = null;
      currentAnalysisId = null;
      resetAnalysisVersionState();
      loadAnalysisFeedback(null);
      clearFile();
      try { history.replaceState(null, '', '/analisis'); } catch {}
      document.querySelector('#nuevo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    historyRefresh?.addEventListener('click', fetchAnalyses);

    document.querySelectorAll('#history-table th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        historySort = key === historySort.key
          ? { key, dir: historySort.dir === 'asc' ? 'desc' : 'asc' }
          : { key, dir: key === 'created_at' || key === 'period_end' ? 'desc' : 'asc' };
        updateHistorySortHeaders();
        renderHistory(historyAnalyses, { resetPage: true });
      });
    });

    document.querySelector('#history-pagination')?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-page]');
      if (!button || button.disabled) return;
      historyPage = Number(button.dataset.page) || 1;
      renderHistory(historyAnalyses);
      document.querySelector('#history-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    historyCompanyInput?.addEventListener('input', () => {
      renderHistorySuggestions();
      clearTimeout(historyDebounceTimer);
      historyDebounceTimer = setTimeout(fetchAnalyses, 300);
    });

    historyCompanyInput?.addEventListener('focus', renderHistorySuggestions);

    historyCompanyInput?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveHistorySuggestion(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveHistorySuggestion(-1);
      } else if (event.key === 'Enter') {
        const options = historySuggest && !historySuggest.hidden
          ? historySuggest.querySelectorAll('.history-suggest-option')
          : [];
        if (options.length) {
          event.preventDefault();
          const selected = options[Math.max(historySuggestIndex, 0)];
          selectHistorySuggestion(selected.dataset.ticker);
        }
      } else if (event.key === 'Escape') {
        closeHistorySuggestions();
      }
    });

    document.addEventListener('click', (event) => {
      if (historySuggest && !historySuggest.contains(event.target) && event.target !== historyCompanyInput) {
        closeHistorySuggestions();
      }
    });

    [historyFromInput, historyToInput].forEach((input) => {
      input?.addEventListener('change', fetchAnalyses);
    });

    document.querySelectorAll('input[name="history-date-type"]').forEach((radio) => {
      radio.addEventListener('change', fetchAnalyses);
    });

    document.querySelectorAll('input[name="history-report-type"]').forEach((radio) => {
      radio.addEventListener('change', fetchAnalyses);
    });

    historyClear?.addEventListener('click', () => {
      if (historyCompanyInput) historyCompanyInput.value = '';
      if (historyFromInput) historyFromInput.value = '';
      if (historyToInput) historyToInput.value = '';
      const radio = document.querySelector('input[name="history-date-type"][value="period"]');
      if (radio) radio.checked = true;
      const reportTypeRadio = document.querySelector('input[name="history-report-type"][value="all"]');
      if (reportTypeRadio) reportTypeRadio.checked = true;
      closeHistorySuggestions();
      fetchAnalyses();
    });

    historyLoginButton?.addEventListener('click', () => {
      document.querySelector('#auth-login')?.click();
    });

    document.addEventListener('click', (event) => {
      const actionButton = event.target.closest('#history-body tr[data-pdf-url] [data-action]');
      if (actionButton) {
        event.preventDefault();
        event.stopPropagation();
        const row = actionButton.closest('tr');
        const action = actionButton.dataset.action;
        if (action === 'view') {
          viewHistoryAnalysis(row);
        } else {
          downloadReport(action, row.dataset.downloadBase, row.dataset.downloadName);
        }
        return;
      }
      const row = event.target.closest('#history-body tr[data-pdf-url]');
      if (row && !event.target.closest('button') && !event.target.closest('a')) {
        viewHistoryAnalysis(row);
      }
    });

    // Configuración de estrellas de valoración
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
      const ticker = currentAnalysisTicker || pendingFiling?.ticker;
      const accession = currentAnalysisAccession || pendingFiling?.accession;
      if (!ticker || !accession) {
        if (currentAnalysisId) {
          if (!confirm('¿Deseas volver a generar este informe con IA?\n\nSe creará una versión nueva y se conservarán las anteriores.')) {
            return;
          }
          startAnalysisUi('Regenerando informe con IA…');
          try {
            const res = await fetch(`/api/admin/reports/ai-analysis/${currentAnalysisId}/regenerate`, { method: 'POST' });
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
      if (!currentAnalysisId) return;
      const willBeReviewed = reviewedCheckbox.checked;
      try {
        const response = await fetch(`/api/analyses/${currentAnalysisId}/review`, {
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
        currentAnalysisIsReviewed = Boolean(data.isReviewed);
        analysisVersionsCache.clear();
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
      if (!currentAnalysisId) {
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
      analysisAttachmentMgr = window.ReportsModule.createImageAttachmentManager({
        dropzoneEl: document.querySelector('#analysis-report-dropzone'),
        inputEl: document.querySelector('#analysis-report-file-input'),
        previewEl: document.querySelector('#analysis-report-previews'),
        maxImages: 5,
      });
    }

    window.addEventListener('paste', (event) => {
      const modal = document.querySelector('#error-report-modal-backdrop');
      if (modal && !modal.hidden && analysisAttachmentMgr) {
        const handled = analysisAttachmentMgr.handlePasteEvent(event);
        if (handled) showToast('Captura de pantalla pegada.');
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const modal = document.querySelector('#error-report-modal-backdrop');
        if (modal && !modal.hidden) closeErrorReportModal();
      }
    });

    // Hidratación si se cargó directamente un /informe/:ticker/:slug o /informe/:id
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
    currentUser = Boolean(isLogged);
    fetchHistoryCompanies();
    fetchAnalyses();
  }

  window.addEventListener('auth:change', (event) => {
    const logged = Boolean(event.detail?.user);
    setAuthenticated(logged);
    if (logged && pendingAuthRetry) {
      const retry = pendingAuthRetry;
      pendingAuthRetry = null;
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
