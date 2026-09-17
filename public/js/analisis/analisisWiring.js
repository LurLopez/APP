/**
 * @fileoverview Cableado del formulario de subida y de resultados (extraído de analisis.js).
 */

(function (window) {
  const AS = window.AnalisisState;


    function wireAnalisisUpload() {
    const fileInput = document.querySelector('#file-input');
    const dropzone = document.querySelector('#dropzone');
    const selectFileButton = document.querySelector('#select-file');
    const removeFileButton = document.querySelector('#remove-file');
    const uploadForm = document.querySelector('#upload-form');
    const secAnalysisEntry = document.querySelector('#sec-analysis-entry');
    const retryAnalysis = document.querySelector('#retry-analysis');
    const reportDownload = document.querySelector('#report-download');
    const newAnalysis = document.querySelector('#new-analysis');
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
      if (secAnalysisEntry) secAnalysisEntry.hidden = !AS.pendingFiling;
      if (AS.pendingFiling) {
        runFilingAnalysis(AS.pendingFiling.ticker, AS.pendingFiling.accession);
        return;
      }
      if (!AS.lastAnalysisFailed) clearFile();
    });

    const downloadsToggle = document.querySelector('#analysis-downloads-toggle');
    downloadsToggle?.addEventListener('click', (event) => {
      event.stopPropagation();
      const menu = document.querySelector('#analysis-downloads-menu');
      if (!menu) return;
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      downloadsToggle.setAttribute('aria-expanded', String(willOpen));
    });

    document.querySelectorAll('.result-actions [data-format]').forEach((button) => {
      button.addEventListener('click', () => {
        downloadReport(button.dataset.format);
        const menu = document.querySelector('#analysis-downloads-menu');
        if (menu && !menu.hidden) {
          menu.hidden = true;
          document.querySelector('#analysis-downloads-toggle')?.setAttribute('aria-expanded', 'false');
        }
      });
    });
  }

  function wireAnalisisResults() {
    const uploadForm = document.querySelector('#upload-form');
    const secAnalysisEntry = document.querySelector('#sec-analysis-entry');
    const newAnalysis = document.querySelector('#new-analysis');
    const copyReportUrlBtn = document.querySelector('#copy-report-url');
    copyReportUrlBtn?.addEventListener('click', async () => {
      if (!AS.currentAnalysisId && !AS.currentAnalysisTicker) {
        showToast('El informe aún no tiene una URL asignada.');
        return;
      }
      const path = getAnalysisPath({ id: AS.currentAnalysisId, ticker: AS.currentAnalysisTicker, slug: AS.currentAnalysisSlug });
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
        const entry = AS.currentAnalysisVersions.find((version) => String(version.id) === String(item?.dataset.versionId));
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
          const versionName = entry.version ? `${AS.currentAnalysisTicker || 'analisis'}-v${entry.version}` : (AS.currentDownloadName || 'analisis-cifra');
          downloadReport(action, entry.downloadBase, versionName);
        }
        return;
      }
      if (!event.target.closest('#analysis-version-box')) closeAnalysisVersionsMenu();
      if (!event.target.closest('.analysis-downloads-wrap')) {
        const menu = document.querySelector('#analysis-downloads-menu');
        if (menu && !menu.hidden) {
          menu.hidden = true;
          document.querySelector('#analysis-downloads-toggle')?.setAttribute('aria-expanded', 'false');
        }
      }
    });

    const versionUpgradeBtn = document.querySelector('#analysis-version-upgrade');
    versionUpgradeBtn?.addEventListener('click', () => {
      const ticker = AS.currentAnalysisTicker;
      const accession = AS.currentAnalysisAccession;
      if (!ticker || !accession) {
        showToast('Este análisis no se puede regenerar automáticamente.');
        return;
      }
      const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || AS.currentUser?.isAdmin);
      if (AS.currentAnalysisIsReviewed && !isAdmin) {
        showToast('Este análisis ha sido revisado por un humano. Solo un administrador puede regenerarlo.');
        return;
      }
      const target = AS.currentAnalysisCurrentVersion ? `la versión ${AS.currentAnalysisCurrentVersion}` : 'la versión más reciente';
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
      AS.pendingFiling = null;
      AS.currentAnalysisId = null;
      resetAnalysisVersionState();
      loadAnalysisFeedback(null);
      clearFile();
      try { history.replaceState(null, '', '/analisis'); } catch {}
      document.querySelector('#nuevo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

window.wireAnalisisUpload = wireAnalisisUpload;
window.wireAnalisisResults = wireAnalisisResults;

})(window);
