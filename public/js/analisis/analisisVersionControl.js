/**
 * @fileoverview Control de versiones del informe de análisis (extraído de analisis.js).
 */

(function (window) {
  const AS = window.AnalisisState;
    const analysisVersionsCache = new Map();

  function renderAnalysisVersionControl() {
    const box = document.querySelector('#analysis-version-box');
    if (!box) return;
    const hasAnyVersion = Boolean(AS.currentAnalysisVersion || AS.currentAnalysisVersions.length);
    box.hidden = !hasAnyVersion;
    if (!hasAnyVersion) return;

    const badge = document.querySelector('#analysis-version-badge');
    if (badge) {
      badge.textContent = AS.currentAnalysisVersion ? `v${AS.currentAnalysisVersion}` : 'Sin versión';
      badge.title = AS.currentAnalysisVersion
        ? `Versión del análisis guardado: ${AS.currentAnalysisVersion}`
        : 'Análisis generado antes del versionado';
    }

    const reviewedBadge = document.querySelector('#analysis-reviewed-badge');
    if (reviewedBadge) {
      reviewedBadge.hidden = !AS.currentAnalysisIsReviewed;
    }

    const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || AS.currentUser?.isAdmin);
    const reviewedToggle = document.querySelector('#analysis-reviewed-toggle');
    const reviewedCheckbox = document.querySelector('#analysis-reviewed-checkbox');
    if (reviewedToggle && reviewedCheckbox) {
      reviewedToggle.hidden = !isAdmin || !AS.currentAnalysisId;
      reviewedCheckbox.checked = Boolean(AS.currentAnalysisIsReviewed);
    }

    const adminChatBtn = document.querySelector('#admin-ai-chat-btn');
    if (adminChatBtn) {
      adminChatBtn.hidden = !isAdmin || !AS.currentAnalysisId;
    }

    const toggle = document.querySelector('#analysis-versions-toggle');
    if (toggle) {
      const canList = Boolean(AS.currentAnalysisAccession && AS.currentAnalysisVersions.length);
      toggle.hidden = !canList;
      const countEl = document.querySelector('#analysis-versions-count');
      if (countEl) countEl.textContent = canList ? `(${AS.currentAnalysisVersions.length})` : '';
      if (!toggle.hidden && AS.pendingVersionsMenuOpen) openAnalysisVersionsMenu();
    }

    const upgrade = document.querySelector('#analysis-version-upgrade');
    if (upgrade) {
      const canUpgrade = AS.currentAnalysisVersionOutdated && AS.currentAnalysisTicker && AS.currentAnalysisAccession && (!AS.currentAnalysisIsReviewed || isAdmin);
      upgrade.hidden = !canUpgrade;
      if (canUpgrade) {
        const targetDiffers = AS.currentAnalysisCurrentVersion
          && String(AS.currentAnalysisCurrentVersion) !== String(AS.currentAnalysisVersion);
        upgrade.textContent = targetDiffers
          ? `Actualizar a v${AS.currentAnalysisCurrentVersion} ✨`
          : 'Actualizar con la nueva versión ✨';
        upgrade.title = 'Regenerar el análisis con las reglas vigentes (consume cupo diario). Se conservan las versiones anteriores.';
      }
    }

    renderAnalysisVersionsMenu();
  }

  function applyAnalysisVersionsCache() {
    const ticker = String(AS.currentAnalysisTicker ?? '').toUpperCase();
    const accession = AS.currentAnalysisAccession ? String(AS.currentAnalysisAccession) : '';
    const key = ticker && accession ? `${ticker}|${accession}` : null;
    const cached = key ? analysisVersionsCache.get(key) : null;
    AS.currentAnalysisVersions = cached?.versions ?? [];
    if (cached?.currentVersion) AS.currentAnalysisCurrentVersion = cached.currentVersion;
    if (cached && typeof cached.versionOutdated === 'boolean') {
      AS.currentAnalysisVersionOutdated = cached.versionOutdated;
    }
    if (!AS.currentAnalysisVersion && AS.currentAnalysisVersions.length) {
      const latest = AS.currentAnalysisVersions[0];
      const viewingLatest = !AS.currentAnalysisId || String(latest.id) === String(AS.currentAnalysisId);
      if (viewingLatest && latest.version) AS.currentAnalysisVersion = latest.version;
    }
    if (AS.currentAnalysisId && AS.currentAnalysisVersions.length) {
      const matching = AS.currentAnalysisVersions.find((v) => String(v.id) === String(AS.currentAnalysisId));
      if (matching) {
        AS.currentAnalysisIsReviewed = Boolean(matching.isReviewed ?? matching.is_reviewed);
      }
    }
    renderAnalysisVersionControl();
  }

  async function refreshAnalysisVersions() {
    const ticker = String(AS.currentAnalysisTicker ?? '').toUpperCase();
    const accession = AS.currentAnalysisAccession ? String(AS.currentAnalysisAccession) : '';
    const key = ticker && accession ? `${ticker}|${accession}` : null;
    if (!key) {
      AS.currentAnalysisVersions = [];
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
    AS.currentAnalysisVersion = source.version ?? null;
    AS.currentAnalysisSubsector = source.subsector ?? null;
    if (typeof source.isReviewed === 'boolean') AS.currentAnalysisIsReviewed = source.isReviewed;
    else if (typeof source.is_reviewed === 'boolean') AS.currentAnalysisIsReviewed = source.is_reviewed;
    if (source.currentVersion) AS.currentAnalysisCurrentVersion = source.currentVersion;
    AS.currentAnalysisVersionOutdated = source.versionOutdated === true;
    renderAnalysisVersionControl();
    refreshAnalysisVersions();
  }

  function resetAnalysisVersionState() {
    AS.currentAnalysisVersion = null;
    AS.currentAnalysisSubsector = null;
    AS.currentAnalysisCurrentVersion = null;
    AS.currentAnalysisVersionOutdated = false;
    AS.currentAnalysisIsReviewed = false;
    AS.currentAnalysisVersions = [];
    AS.pendingVersionsMenuOpen = false;
    AS.currentAnalysisFormType = null;
    const sourceLink = document.querySelector('#analysis-source-link');
    if (sourceLink) {
      sourceLink.hidden = true;
      sourceLink.removeAttribute('href');
    }
    const box = document.querySelector('#analysis-version-box');
    if (box) box.hidden = true;
    const menu = document.querySelector('#analysis-versions-menu');
    if (menu) menu.hidden = true;
    const reviewedBadge = document.querySelector('#analysis-reviewed-badge');
    if (reviewedBadge) reviewedBadge.hidden = true;
    const reviewedToggle = document.querySelector('#analysis-reviewed-toggle');
    if (reviewedToggle) reviewedToggle.hidden = true;
  }

  function renderAnalysisSourceLink(formType = null) {
    const link = document.querySelector('#analysis-source-link');
    if (!link) return;
    const ticker = String(AS.currentAnalysisTicker ?? '').trim().toUpperCase();
    const rawAccession = AS.currentAnalysisAccession ? String(AS.currentAnalysisAccession).trim() : '';
    const accession = /^\d{18}$/.test(rawAccession)
      ? `${rawAccession.slice(0, 10)}-${rawAccession.slice(10, 12)}-${rawAccession.slice(12)}`
      : rawAccession;
    if (!ticker || !accession) {
      link.hidden = true;
      link.removeAttribute('href');
      return;
    }
    const type = String(formType || AS.currentAnalysisFormType || '').trim().toUpperCase();
    const translate = window.I18n?.t || ((text, params) => (
      params ? String(text).replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match)) : text
    ));
    const label = type === '10-Q' || type === '10-K'
      ? translate('Ver {0} original', { 0: type })
      : translate('Ver original');
    link.href = `/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(accession)}/document`;
    link.textContent = `${label} ↗`;
    link.hidden = false;
  }

  function openAnalysisVersionsMenu() {
    const toggle = document.querySelector('#analysis-versions-toggle');
    const menu = document.querySelector('#analysis-versions-menu');
    if (!toggle || !menu) return;
    if (toggle.hidden) {
      AS.pendingVersionsMenuOpen = true;
      return;
    }
    AS.pendingVersionsMenuOpen = false;
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    renderAnalysisVersionsMenu();
  }

  function closeAnalysisVersionsMenu() {
    AS.pendingVersionsMenuOpen = false;
    const menu = document.querySelector('#analysis-versions-menu');
    if (menu && !menu.hidden) menu.hidden = true;
    document.querySelector('#analysis-versions-toggle')?.setAttribute('aria-expanded', 'false');
  }

  function loadReportData(analysis, { updateHistory = false } = {}) {
    if (!analysis || !analysis.report) return;
    AS.currentPdfUrl = analysis.pdf_url ?? null;
    const baseCandidate = AS.currentPdfUrl
      ? AS.currentPdfUrl.replace(/\.pdf$/, '')
      : (analysis.downloadBase && String(analysis.downloadBase).startsWith('/') ? String(analysis.downloadBase).replace(/\.pdf$/, '') : null);
    AS.currentDownloadBase = baseCandidate;
    const cleanDownloadName = (analysis.ticker ? `${analysis.ticker}-${(analysis.periodTitle || analysis.report?.periodTitle || 'informe').replace(/\s+/g, '-')}` : null)
      || (analysis.downloadBase && !analysis.downloadBase.startsWith('/') ? analysis.downloadBase : null)
      || 'analisis-cifra';
    AS.currentDownloadName = cleanDownloadName;

    const periodTitle = analysis.periodTitle || analysis.report?.periodTitle;
    const tickerForTitle = analysis.ticker || analysis.report?.ticker;
    const tickerPattern = String(tickerForTitle || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cleanPeriodTitle = tickerPattern
      ? String(periodTitle || '').replace(new RegExp(`\\s*[—–-]\\s*${tickerPattern}\\s*$`, 'i'), '').trim() || periodTitle
      : periodTitle;
    const titleParts = [analysis.company_name || analysis.company || analysis.ticker, cleanPeriodTitle].filter(Boolean);
    const resultTitle = document.querySelector('#result-title');
    if (resultTitle) resultTitle.textContent = titleParts.length ? titleParts.join(' — ') : 'Informe guardado';

    renderReport(analysis.report ?? {});

    AS.currentAnalysisId = analysis.id ? Number(analysis.id) : null;
    AS.currentAnalysisTicker = analysis.ticker || analysis.report?.ticker || null;
    AS.currentAnalysisAccession = analysis.accession || null;
    AS.currentAnalysisFormType = analysis.formType || analysis.report?.formType || null;
    AS.currentAnalysisSlug = analysis.slug || getAnalysisSlug(analysis);
    renderAnalysisSourceLink();

    setAnalysisVersionState({
      version: analysis.version ?? null,
      subsector: analysis.subsector ?? null,
      isReviewed: Boolean(analysis.isReviewed ?? analysis.is_reviewed),
      currentVersion: analysis.currentVersion ?? null,
      versionOutdated: analysis.versionOutdated === true,
    });

    loadAnalysisFeedback(AS.currentAnalysisId);

    if (AS.currentAnalysisId && updateHistory) {
      try { history.replaceState(null, '', getAnalysisPath({ ...analysis, id: AS.currentAnalysisId, ticker: AS.currentAnalysisTicker, slug: AS.currentAnalysisSlug })); } catch {}
    }

    const adminRegenBtn = document.querySelector('#admin-regenerate-report');
    const adminChatBtn = document.querySelector('#admin-ai-chat-btn');
    const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || AS.currentUser?.isAdmin);
    if (adminRegenBtn) {
      adminRegenBtn.hidden = !isAdmin;
    }
    if (adminChatBtn) {
      adminChatBtn.hidden = !isAdmin || !AS.currentAnalysisId;
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

window.renderAnalysisVersionControl = renderAnalysisVersionControl;
window.applyAnalysisVersionsCache = applyAnalysisVersionsCache;
window.refreshAnalysisVersions = refreshAnalysisVersions;
window.setAnalysisVersionState = setAnalysisVersionState;
window.resetAnalysisVersionState = resetAnalysisVersionState;
window.openAnalysisVersionsMenu = openAnalysisVersionsMenu;
window.closeAnalysisVersionsMenu = closeAnalysisVersionsMenu;
window.loadReportData = loadReportData;
window.viewHistoryAnalysis = viewHistoryAnalysis;
window.renderAnalysisSourceLink = renderAnalysisSourceLink;
window.analysisVersionsCache = analysisVersionsCache;

})(window);
