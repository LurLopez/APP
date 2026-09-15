/**
 * @fileoverview Valoración, reporte de errores, ejecución y descargas (extraído de analisis.js).
 */

(function (window) {
  const AS = window.AnalisisState;


  async function submitRating(rating) {
    if (!AS.currentAnalysisId) return;
    try {
      const response = await fetch(`/api/analyses/${AS.currentAnalysisId}/rating`, {
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

  function openErrorReportModal() {
    const modal = document.querySelector('#error-report-modal-backdrop');
    if (!modal) return;
    modal.hidden = false;
    const desc = document.querySelector('#error-report-desc');
    if (desc) {
      desc.value = '';
      setTimeout(() => desc.focus(), 60);
    }
    AS.analysisAttachmentMgr?.clear();
  }

  function closeErrorReportModal() {
    const modal = document.querySelector('#error-report-modal-backdrop');
    if (modal) modal.hidden = true;
  }

  async function submitErrorReport(event) {
    event.preventDefault();
    if (!AS.currentAnalysisId) {
      showToast('No hay ningún análisis seleccionado para reportar.');
      return;
    }
    const category = document.querySelector('#error-report-category')?.value || 'other';
    const descInput = document.querySelector('#error-report-desc');
    const description = descInput?.value?.trim() || '';
    const images = AS.analysisAttachmentMgr?.getImages() || [];

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
      const response = await fetch(`/api/analyses/${AS.currentAnalysisId}/report-error`, {
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
    if (!AS.selectedFile) {
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

    AS.pendingFiling = null;
    startAnalysisUi('Verificando el documento...');
    startProcessingHints();

    const formData = new FormData();
    formData.append('file', AS.selectedFile);
    if (AS.selectedPresentation) formData.append('presentation', AS.selectedPresentation);

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
    AS.pendingFiling = { ticker, accession };
    AS.currentAnalysisTicker = ticker;
    AS.currentAnalysisAccession = accession;
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

  function downloadReport(format, baseUrl = AS.currentDownloadBase, name = AS.currentDownloadName) {
    if (!baseUrl || !['pdf', 'docx', 'odt', 'html'].includes(format)) return;
    const link = document.createElement('a');
    const safeName = encodeURIComponent(name || 'analisis-cifra');
    link.href = `${baseUrl}.${format}?download=1&name=${safeName}`;
    link.download = `${name}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function renderAnalysisVersionsMenu() {
    const menu = document.querySelector('#analysis-versions-menu');
    if (!menu) return;
    if (!AS.currentAnalysisVersions.length) {
      menu.innerHTML = '<div class="analysis-versions-empty">Todavía no hay versiones guardadas.</div>';
      return;
    }
    menu.innerHTML = AS.currentAnalysisVersions.map((entry) => {
      const isActive = String(entry.id) === String(AS.currentAnalysisId);
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

window.submitRating = submitRating;
window.openErrorReportModal = openErrorReportModal;
window.closeErrorReportModal = closeErrorReportModal;
window.submitErrorReport = submitErrorReport;
window.runRealAnalysis = runRealAnalysis;
window.runFilingAnalysis = runFilingAnalysis;
window.downloadReport = downloadReport;
window.renderAnalysisVersionsMenu = renderAnalysisVersionsMenu;

})(window);
